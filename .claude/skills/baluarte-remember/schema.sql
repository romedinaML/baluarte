-- baluarte-remember: canonical schema for .data/baluarte.db
-- Source of truth. Rebuild the DB at any time with:
--   rm -f .data/baluarte.db .data/baluarte.db-wal .data/baluarte.db-shm
--   mkdir -p .data
--   sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- =============================================================
-- Core registry: every Figma node we care about.
-- node_type drives doc-skill dispatch (layout vs component vs …).
-- =============================================================
CREATE TABLE IF NOT EXISTS registry (
  uuid        TEXT PRIMARY KEY,
  node_id     TEXT NOT NULL UNIQUE,
  node_type   TEXT NOT NULL DEFAULT 'other'
              CHECK (node_type IN ('layout','component','property','page','other')),
  description TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registry_node_id   ON registry(node_id);
CREATE INDEX IF NOT EXISTS idx_registry_node_type ON registry(node_type);

CREATE TRIGGER IF NOT EXISTS trg_registry_updated_at
AFTER UPDATE ON registry FOR EACH ROW
BEGIN
  UPDATE registry SET updated_at = datetime('now') WHERE uuid = OLD.uuid;
END;

-- =============================================================
-- Raw token catalog (everything we discovered while parsing).
-- visual_properties (below) is the curated, code-gen-shaped surface.
-- =============================================================
CREATE TABLE IF NOT EXISTS tokens (
  uuid  TEXT PRIMARY KEY,
  name  TEXT NOT NULL,
  type  TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(name, type)
);

CREATE INDEX IF NOT EXISTS idx_tokens_type ON tokens(type);

-- =============================================================
-- Generic structural relationships from registry → registry.
-- baluarte-understand-product populates these. Doc skills also
-- maintain a more specific layout_components join (below).
-- =============================================================
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

-- =============================================================
-- "Baluarte for Devs" page cache, keyed by Figma file_key.
-- Three section ids cache the three top-level frames inside the
-- page (Properties / Components / Layouts).
-- =============================================================
CREATE TABLE IF NOT EXISTS dev_docs_pages (
  uuid                  TEXT PRIMARY KEY,
  file_key              TEXT NOT NULL UNIQUE,
  page_node_id          TEXT NOT NULL,
  properties_section_id TEXT,
  components_section_id TEXT,
  layouts_section_id    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================
-- Documented layouts. 1:1 with their registry row.
-- properties_json is the code-gen-shaped blob.
-- =============================================================
CREATE TABLE IF NOT EXISTS layouts (
  uuid            TEXT PRIMARY KEY,
  registry_uuid   TEXT NOT NULL UNIQUE REFERENCES registry(uuid) ON DELETE CASCADE,
  doc_artboard_id TEXT NOT NULL,
  description     TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  source_hash     TEXT,                              -- SHA-256 of the source data used at last build
  artifact_path   TEXT,                              -- relative to baluarte-app/, e.g. src/layouts/Dashboard/Dashboard.stories.tsx
  generated_at    TEXT,                              -- NULL until baluarte-build-layout has run
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_layouts_updated_at
AFTER UPDATE ON layouts FOR EACH ROW
BEGIN
  UPDATE layouts SET updated_at = datetime('now') WHERE uuid = OLD.uuid;
END;

-- =============================================================
-- Documented components. 1:1 with their registry row.
-- =============================================================
CREATE TABLE IF NOT EXISTS components (
  uuid            TEXT PRIMARY KEY,
  registry_uuid   TEXT NOT NULL UNIQUE REFERENCES registry(uuid) ON DELETE CASCADE,
  doc_artboard_id TEXT NOT NULL,
  description     TEXT NOT NULL,
  properties_json TEXT NOT NULL,
  granularity     TEXT CHECK (granularity IN ('atomic','molecular','unknown') OR granularity IS NULL),
  source_hash     TEXT,
  artifact_path   TEXT,                              -- e.g. src/components/Button/Button.stories.tsx
  generated_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_components_updated_at
AFTER UPDATE ON components FOR EACH ROW
BEGIN
  UPDATE components SET updated_at = datetime('now') WHERE uuid = OLD.uuid;
END;

-- Many-to-many: which layouts use which components.
CREATE TABLE IF NOT EXISTS layout_components (
  layout_uuid    TEXT NOT NULL REFERENCES layouts(uuid)    ON DELETE CASCADE,
  component_uuid TEXT NOT NULL REFERENCES components(uuid) ON DELETE CASCADE,
  PRIMARY KEY (layout_uuid, component_uuid)
);

-- =============================================================
-- Visual properties = the Tailwind-theme surface for code-gen.
-- Distinct from `tokens` because it carries tailwind_name and
-- css_property. token_uuid links back when derived from a token.
-- =============================================================
CREATE TABLE IF NOT EXISTS visual_properties (
  uuid                   TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  type                   TEXT NOT NULL,
  tailwind_name          TEXT NOT NULL,
  css_property           TEXT NOT NULL,
  value                  TEXT NOT NULL,
  doc_artboard_id        TEXT NOT NULL,
  token_uuid             TEXT REFERENCES tokens(uuid) ON DELETE SET NULL,
  source_hash            TEXT,                       -- SHA-256 of `value` at last apply
  applied_to_tailwind_at TEXT,                       -- NULL until baluarte-build-properties has applied
  created_at             TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(name, type)
);

CREATE INDEX IF NOT EXISTS idx_visual_properties_type ON visual_properties(type);
CREATE INDEX IF NOT EXISTS idx_visual_properties_tw   ON visual_properties(tailwind_name);
