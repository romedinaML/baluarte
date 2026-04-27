-- baluarte-remember: canonical schema for .data/baluarte.db
-- Source of truth. Rebuild the DB at any time with:
--   sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS registry (
  uuid        TEXT PRIMARY KEY,
  node_id     TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tokens (
  uuid  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  type  TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(name, type)
);

CREATE TABLE IF NOT EXISTS registry_children (
  parent_uuid TEXT NOT NULL REFERENCES registry(uuid) ON DELETE CASCADE,
  child_uuid  TEXT NOT NULL REFERENCES registry(uuid) ON DELETE CASCADE,
  PRIMARY KEY (parent_uuid, child_uuid)
);

CREATE TABLE IF NOT EXISTS registry_tokens (
  registry_uuid TEXT NOT NULL REFERENCES registry(uuid) ON DELETE CASCADE,
  token_uuid    TEXT NOT NULL REFERENCES tokens(uuid)   ON DELETE CASCADE,
  PRIMARY KEY (registry_uuid, token_uuid)
);

CREATE INDEX IF NOT EXISTS idx_registry_node_id ON registry(node_id);
CREATE INDEX IF NOT EXISTS idx_tokens_type      ON tokens(type);

CREATE TRIGGER IF NOT EXISTS trg_registry_updated_at
AFTER UPDATE ON registry
FOR EACH ROW
BEGIN
  UPDATE registry SET updated_at = datetime('now') WHERE uuid = OLD.uuid;
END;
