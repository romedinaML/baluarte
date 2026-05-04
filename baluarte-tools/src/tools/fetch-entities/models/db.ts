import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let cachedRoot: string | null = null;

function findRepoRoot(): string {
  if (cachedRoot) return cachedRoot;
  if (process.env.BALUARTE_REPO_ROOT) {
    cachedRoot = process.env.BALUARTE_REPO_ROOT;
    return cachedRoot;
  }
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, "queries/INDEX.md"))) {
      cachedRoot = dir;
      return cachedRoot;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "[baluarte] could not locate repo root (no queries/INDEX.md found upward). Set BALUARTE_REPO_ROOT.",
  );
}

export function dbPath(): string {
  const path = resolve(findRepoRoot(), ".data/baluarte.db");
  if (!existsSync(path)) {
    throw new Error(
      `[baluarte] sqlite db not found at ${path}. Run: mkdir -p .data && sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql`,
    );
  }
  return path;
}

export function queryPath(filename: string): string {
  return resolve(findRepoRoot(), "queries", filename);
}

const SENTINEL = "__BALUARTE_END__";
const SENTINEL_LINE = `[{"sentinel":"${SENTINEL}"}]`;

let proc: ChildProcessWithoutNullStreams | null = null;
let stdoutBuffer = "";
let chain: Promise<unknown> = Promise.resolve();

let procClosed = false;
let cachedDbInode: number | null = null;

function currentDbInode(path: string): number | null {
  try {
    return statSync(path).ino;
  } catch {
    return null;
  }
}

// `proc` is reused across calls for throughput, but the cached child holds an
// open FD on the DB inode it was spawned against. If the on-disk file is
// hard-reset (`rm .data/baluarte.db*` + reinit), the FD points at a deleted
// inode and silently swallows reads/writes. Compare inodes per call so the
// MCP self-heals on external resets.
function ensureProc(): ChildProcessWithoutNullStreams {
  const path = dbPath();
  const inode = currentDbInode(path);
  if (
    proc &&
    !proc.killed &&
    !procClosed &&
    cachedDbInode !== null &&
    cachedDbInode === inode
  ) {
    return proc;
  }
  if (proc && !procClosed) {
    try {
      proc.stdin.end();
    } catch {
      // process may have died already; ignore
    }
    proc = null;
    procClosed = true;
    stdoutBuffer = "";
  }
  const p = spawn("sqlite3", ["-batch", path]);
  procClosed = false;
  p.stderr.on("data", (d) => process.stderr.write(`[sqlite3] ${d}`));
  p.on("close", () => {
    procClosed = true;
    proc = null;
    stdoutBuffer = "";
    cachedDbInode = null;
  });
  p.stdin.write(".mode json\n");
  p.stdin.write("PRAGMA foreign_keys=ON;\n");
  proc = p;
  cachedDbInode = inode;
  return p;
}

function escapeSqlite(value: string): string {
  return value.replace(/'/g, "''");
}

function renderParam(name: string, value: string | number | null): string {
  if (value === null) return `.parameter set :${name} NULL`;
  if (typeof value === "number") return `.parameter set :${name} ${value}`;
  return `.parameter set :${name} '${escapeSqlite(value)}'`;
}

async function runRaw(script: string): Promise<string> {
  const p = ensureProc();
  return new Promise((res, rej) => {
    const onData = (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();
      const idx = stdoutBuffer.indexOf(SENTINEL_LINE);
      if (idx === -1) return;
      const before = stdoutBuffer.slice(0, idx);
      stdoutBuffer = stdoutBuffer
        .slice(idx + SENTINEL_LINE.length)
        .replace(/^\s*/, "");
      p.stdout.off("data", onData);
      res(before.trim());
    };
    if (procClosed) {
      rej(new Error("sqlite3 process already closed"));
      return;
    }
    p.stdout.on("data", onData);
    p.stdin.write(`${script}\nSELECT '${SENTINEL}' AS sentinel;\n`);
  });
}

export async function runQuery<T = Record<string, unknown>>(
  filename: string,
  params: Record<string, string | number | null> = {},
): Promise<T[]> {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(params)) lines.push(renderParam(k, v));
  lines.push(`.read ${queryPath(filename)}`);
  const script = lines.join("\n");
  const next = chain.then(() => runRaw(script));
  chain = next.catch(() => undefined);
  const out = await next;
  if (!out) return [];
  try {
    return JSON.parse(out) as T[];
  } catch {
    const parts = out.split(/\n(?=\[)/).filter(Boolean);
    const last = parts[parts.length - 1];
    return JSON.parse(last) as T[];
  }
}

export function shutdownDb(): void {
  if (proc) {
    proc.stdin.end();
    proc = null;
  }
}
