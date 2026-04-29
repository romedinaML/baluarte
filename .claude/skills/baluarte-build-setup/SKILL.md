---
name: baluarte-build-setup
description: Bootstrap the local Storybook playground at `baluarte-app/`. Always isolated — `baluarte-app/` gets its own package.json with Storybook 10, React latest, Vite, TypeScript, Tailwind, and shadcn. The repo root only gets a thin `npm run baluarte` wrapper. Idempotent — re-running on an existing baluarte-app is a no-op except for any missing pieces. Asks the user before starting the dev server at the end.
---

# baluarte-build-setup

Bootstrap step for the build skills. After this runs, the other `baluarte-build-*` skills can generate code into `baluarte-app/src/...`.

## Tool access for this skill

This skill does **not** call Figma MCP tools. It only uses:

- Filesystem tools (`Read`, `Write`, `Edit`, `Glob`, `Grep`).
- `Bash` for `node`, `npm`, `npx` commands.
- Optionally `baluarte-remember` (read-only — confirm at least the `visual_properties` table exists so the user knows downstream skills will have something to consume).

## Required arguments

None.

## Optional arguments

- `--prompt "<free-form context>"` — user-supplied guidance. Use it to:
  - Pin specific package versions (e.g. `--prompt "use react@19, not latest"`).
  - Skip the shadcn init (e.g. `--prompt "skip shadcn — I'll wire it up later"`).
  - Override the Storybook port (e.g. `--prompt "use port 7007 instead of 6006"`).
  - Add an extra dev dependency (e.g. `--prompt "also install vitest for unit tests"`).

## Steps

### 1. Detect parent state

Working directory is the repo root.

- Does `package.json` exist at the root? → "parent is npm" (only matters for the wrapper script — see step 5).
- Does `baluarte-app/` exist?
- Does `baluarte-app/package.json` exist?

### 2. Create `baluarte-app/` if missing

```bash
mkdir -p baluarte-app
```

### 3. Initialize the inner npm project (only if `baluarte-app/package.json` does not exist)

`baluarte-app/` is **always** its own self-contained npm project, regardless of whether the parent is one. This keeps Storybook deps off the user's existing setup.

```bash
cd baluarte-app
npm init -y
node -e "const fs=require('fs');const p=require('./package.json');p.type='module';p.private=true;p.scripts={...(p.scripts||{}),'storybook':'storybook dev -p 6006','build-storybook':'storybook build'};fs.writeFileSync('./package.json', JSON.stringify(p, null, 2));"
```

### 4. Install the stack (skip any that resolve as already installed)

Run from inside `baluarte-app/`. Each line is one command; they install latest semver of each package. Storybook 10 init handles its own setup (config files, deps, addons).

```bash
# Core toolchain
npm install --save-dev typescript@latest vite@latest @vitejs/plugin-react@latest @types/node@latest

# React
npm install react@latest react-dom@latest
npm install --save-dev @types/react@latest @types/react-dom@latest

# Tailwind v4 + PostCSS
npm install --save-dev tailwindcss@latest @tailwindcss/postcss@latest postcss@latest autoprefixer@latest

# Storybook 10 (auto-detects Vite + React) — accept defaults non-interactively
npx --yes storybook@10 init --type react --builder vite --yes --no-dev

# shadcn — initialised with defaults; user can customise later
npx --yes shadcn@latest init --yes --defaults
```

Notes:
- `storybook@10 init` writes `.storybook/main.ts`, `.storybook/preview.ts`, adds story examples, and adds `storybook` + `build-storybook` scripts. The `--no-dev` flag prevents it from launching the server during init.
- `shadcn init --defaults` writes `components.json`, sets up `lib/utils.ts`, and prepares `src/components/ui/`.
- If a step fails because something already exists, that's expected — log and continue.

### 4a. Widen Storybook's story globs (required)

Storybook 10's init only configures globs under `../stories/`. The build skills emit stories under `src/components/<Name>/` and `src/layouts/<Name>/`, which Storybook would otherwise never scan. Patch `.storybook/main.ts` so the `stories` array also includes `../src/**`:

```ts
// .storybook/main.ts
const config: StorybookConfig = {
  stories: [
    "../stories/**/*.mdx",
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  // ...rest unchanged
};
```

Idempotency: read the file first; only append the `../src/**` entries if they're not already present. This is the most common source of "I built the stories but Storybook doesn't show them" — make sure this step always runs, even on re-setup.

### 5. Wire up the parent's `npm run baluarte`

The parent gets a thin wrapper that delegates to `baluarte-app/`. Behaviour depends on whether the parent is already an npm project:

**Parent has `package.json`:**
```bash
node -e "const fs=require('fs');const p=require('./package.json');p.scripts={...(p.scripts||{}),baluarte:'npm --prefix baluarte-app run storybook','baluarte:build':'npm --prefix baluarte-app run build-storybook'};fs.writeFileSync('./package.json', JSON.stringify(p, null, 2));"
```

**Parent has no `package.json`:** create a minimal one whose only purpose is the wrapper script.
```bash
node -e "const fs=require('fs');const p={name:'baluarte-root',private:true,scripts:{baluarte:'npm --prefix baluarte-app run storybook','baluarte:build':'npm --prefix baluarte-app run build-storybook'}};fs.writeFileSync('./package.json', JSON.stringify(p, null, 2));"
```

### 6. Tailwind sidecar + globals

Create `baluarte-app/baluarte.tailwind.ts` if missing — it's the file `baluarte-build-properties` will fully overwrite. Initially empty:

```ts
// baluarte.tailwind.ts (generated by baluarte-build-properties — do not hand-edit)
export const baluarteTheme = {
  colors: {},
  spacing: {},
  borderRadius: {},
  fontFamily: {},
  fontSize: {},
  boxShadow: {},
} as const;
```

Wire it into `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
import { baluarteTheme } from './baluarte.tailwind';

export default {
  content: ['./src/**/*.{ts,tsx,mdx}', './.storybook/**/*.{ts,tsx,mdx}'],
  theme: { extend: baluarteTheme },
  plugins: [],
} satisfies Config;
```

Add `src/styles/globals.css` (Tailwind v4 entry):

```css
@import "tailwindcss";
```

Import it from `.storybook/preview.ts` so all stories see the theme:

```ts
import '../src/styles/globals.css';
```

### 7. .gitignore for baluarte-app

Create `baluarte-app/.gitignore` if missing:

```
node_modules
storybook-static
dist
.vite
```

### 8. Smoke check

```bash
cd baluarte-app && npx tsc --noEmit
```

If this fails for benign reasons (e.g. a Storybook example story has type drift), report it and continue.

### 9. Ask before launching

Do not auto-start the server. Ask the user:

> Setup is complete. Start Storybook now (`npm run baluarte`)? [y/N]

Only run `npm run baluarte` (which is `storybook dev -p 6006`) on explicit `y`. Otherwise tell the user the command is ready when they want it.

## Idempotence

Every step above checks for the artifact it produces. Running the skill twice should produce no diff. The user can safely re-run after a failed install.

## Hard rules

- **Never** install Storybook / React / Tailwind into the parent `package.json`. Even when the parent is an npm project, the parent only ever gets the `baluarte` and `baluarte:build` scripts.
- **Never** start the dev server without explicit user confirmation in step 9.
- **Never** modify files outside `baluarte-app/` other than the parent `package.json` (and only its `scripts` field).
- This skill is in the `baluarte-build-*` family: it has **no Figma MCP access**. Do not attempt Figma calls.
- **Never call another baluarte-* skill** other than `baluarte-remember` (read-only). The user runs every other skill manually.
