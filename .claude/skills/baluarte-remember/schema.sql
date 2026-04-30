-- baluarte-remember schema
-- Source of truth for .data/baluarte.db.
-- Idempotent: safe to run repeatedly. Rebuild via:
--   rm -f .data/baluarte.db* && mkdir -p .data && sqlite3 .data/baluarte.db < .claude/skills/baluarte-remember/schema.sql

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ──────────────────────────── Single tables ────────────────────────────

CREATE TABLE IF NOT EXISTS pages (
    uuid       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    file_key   TEXT NOT NULL UNIQUE,
    edited_at  TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS storybook (
    uuid      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name      TEXT NOT NULL,
    url_local TEXT NOT NULL,
    url_prod  TEXT,
    src_ref   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS layouts (
    uuid         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name         TEXT NOT NULL,
    storybook_id TEXT REFERENCES storybook(uuid) ON DELETE SET NULL,
    description  TEXT,
    edited_at    TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type         TEXT NOT NULL CHECK (type IN ('Mobile','Desktop','All'))
);

CREATE TABLE IF NOT EXISTS molecules (
    uuid         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name         TEXT NOT NULL,
    storybook_id TEXT REFERENCES storybook(uuid) ON DELETE SET NULL,
    description  TEXT,
    edited_at    TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type         TEXT NOT NULL CHECK (type IN ('static','interactive','form'))
);

CREATE TABLE IF NOT EXISTS atoms (
    uuid         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name         TEXT NOT NULL,
    storybook_id TEXT REFERENCES storybook(uuid) ON DELETE SET NULL,
    description  TEXT,
    edited_at    TEXT,
    created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    type         TEXT NOT NULL CHECK (type IN ('static','interactive','form'))
);

CREATE TABLE IF NOT EXISTS states (
    uuid TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    type TEXT NOT NULL UNIQUE CHECK (type IN ('hover','active','stale','disabled','focus','clicked'))
);

CREATE TABLE IF NOT EXISTS figma_nodes (
    uuid           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    figma_node     TEXT NOT NULL,
    figma_url      TEXT NOT NULL,
    reference_id   TEXT NOT NULL,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('layout','molecule','atom')),
    type           TEXT CHECK (type IN (
        'DOCUMENT','CANVAS','FRAME','SECTION','GROUP','SLICE','STICKY',
        'COMPONENT','COMPONENT_SET','INSTANCE',
        'RECTANGLE','ELLIPSE','LINE','VECTOR','STAR','POLYGON',
        'BOOLEAN_OPERATION','TEXT'
    )),
    UNIQUE (reference_type, reference_id)
);

CREATE TABLE IF NOT EXISTS properties (
    uuid           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name           TEXT NOT NULL,
    tailwind_class TEXT,
    css_style      TEXT NOT NULL,
    type           TEXT NOT NULL CHECK (type IN (
        'Color','Spacing','Font','Typography','Positioning','Grid','Flex',
        'Border','Shadow','Opacity'
    )),
    origin         TEXT NOT NULL CHECK (origin IN ('Custom','Figma Variable')),
    UNIQUE (name, type)
);

-- ────────────────────────── Relationship tables ──────────────────────────

CREATE TABLE IF NOT EXISTS pages_registry (
    uuid       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    page_id    TEXT NOT NULL REFERENCES pages(uuid) ON DELETE CASCADE,
    child_id   TEXT NOT NULL,
    child_type TEXT NOT NULL CHECK (child_type IN ('layout','molecule','atom')),
    UNIQUE (page_id, child_type, child_id)
);

-- layout_registry.child_property must point to a Positioning or Spacing property
-- (enforced by trg_layout_registry_property_type_* triggers below).
CREATE TABLE IF NOT EXISTS layout_registry (
    uuid           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    layout_id      TEXT NOT NULL REFERENCES layouts(uuid) ON DELETE CASCADE,
    child_id       TEXT NOT NULL,
    child_type     TEXT NOT NULL CHECK (child_type IN ('molecule','atom')),
    child_property TEXT REFERENCES properties(uuid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS layout_properties (
    uuid        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    layout_id   TEXT NOT NULL REFERENCES layouts(uuid)    ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES properties(uuid) ON DELETE CASCADE,
    UNIQUE (layout_id, property_id)
);

CREATE TABLE IF NOT EXISTS molecules_registry (
    uuid        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    molecule_id TEXT NOT NULL REFERENCES molecules(uuid) ON DELETE CASCADE,
    child_id    TEXT NOT NULL,
    property_id TEXT REFERENCES properties(uuid) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS molecules_properties (
    uuid        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    molecule_id TEXT NOT NULL REFERENCES molecules(uuid)  ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES properties(uuid) ON DELETE CASCADE,
    state_id    TEXT NOT NULL REFERENCES states(uuid)     ON DELETE CASCADE,
    UNIQUE (molecule_id, property_id, state_id)
);

CREATE TABLE IF NOT EXISTS atoms_properties (
    uuid        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    atom_id     TEXT NOT NULL REFERENCES atoms(uuid)      ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES properties(uuid) ON DELETE CASCADE,
    state_id    TEXT NOT NULL REFERENCES states(uuid)     ON DELETE CASCADE,
    UNIQUE (atom_id, property_id, state_id)
);

-- ──────────────────────────── Indexes ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pages_file_key            ON pages(file_key);
CREATE INDEX IF NOT EXISTS idx_layouts_name              ON layouts(name);
CREATE INDEX IF NOT EXISTS idx_molecules_name            ON molecules(name);
CREATE INDEX IF NOT EXISTS idx_atoms_name                ON atoms(name);
CREATE INDEX IF NOT EXISTS idx_figma_nodes_reference     ON figma_nodes(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_properties_type           ON properties(type);
CREATE INDEX IF NOT EXISTS idx_pages_registry_page       ON pages_registry(page_id);
CREATE INDEX IF NOT EXISTS idx_layout_registry_layout    ON layout_registry(layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_properties_layout  ON layout_properties(layout_id);
CREATE INDEX IF NOT EXISTS idx_molecules_registry_mol    ON molecules_registry(molecule_id);
CREATE INDEX IF NOT EXISTS idx_molecules_properties_mol  ON molecules_properties(molecule_id);
CREATE INDEX IF NOT EXISTS idx_atoms_properties_atom     ON atoms_properties(atom_id);

-- ──────────────────────────── Triggers ────────────────────────────

DROP TRIGGER IF EXISTS trg_layout_registry_property_type_insert;
CREATE TRIGGER trg_layout_registry_property_type_insert
BEFORE INSERT ON layout_registry
FOR EACH ROW
WHEN NEW.child_property IS NOT NULL
 AND (SELECT type FROM properties WHERE uuid = NEW.child_property)
     NOT IN ('Positioning','Spacing')
BEGIN
    SELECT RAISE(ABORT, 'layout_registry.child_property must reference a Positioning or Spacing property');
END;

DROP TRIGGER IF EXISTS trg_layout_registry_property_type_update;
CREATE TRIGGER trg_layout_registry_property_type_update
BEFORE UPDATE OF child_property ON layout_registry
FOR EACH ROW
WHEN NEW.child_property IS NOT NULL
 AND (SELECT type FROM properties WHERE uuid = NEW.child_property)
     NOT IN ('Positioning','Spacing')
BEGIN
    SELECT RAISE(ABORT, 'layout_registry.child_property must reference a Positioning or Spacing property');
END;

-- ──────────────────────────── Seed data ────────────────────────────

INSERT OR IGNORE INTO states (type) VALUES
    ('hover'), ('active'), ('stale'), ('disabled'), ('focus'), ('clicked');
