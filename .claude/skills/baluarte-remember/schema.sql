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

-- content_diff_hash = SHA-256 of the deep document tree returned by the Figma MCP
-- (figma_live_get_node / figma__get_figma_node). The Figma API does NOT expose
-- per-node lastModified, so we hash the fetched document JSON instead. Any
-- structural or styling change to the artboard (or its descendants) flips this
-- hash and triggers a re-sync.
CREATE TABLE IF NOT EXISTS layouts (
    uuid              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name              TEXT NOT NULL,
    storybook_id      TEXT REFERENCES storybook(uuid) ON DELETE SET NULL,
    description       TEXT,
    intent_json       TEXT,
    edited_at         TEXT,
    content_diff_hash TEXT,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Single component tier — replaces the previous atoms + molecules split.
-- A component may compose other components (see components_registry).
-- intent_json is a nullable JSON blob carrying structured design intent
-- (scrollable, min_width, max_width, interactivity[], prompt). Written by
-- baluarte-analyze after merging Figma's setSharedPluginData('baluarte',
-- 'intent_v1') with description tags and structural globalVars hints.
CREATE TABLE IF NOT EXISTS components (
    uuid              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name              TEXT NOT NULL,
    storybook_id      TEXT REFERENCES storybook(uuid) ON DELETE SET NULL,
    description       TEXT,
    intent_json       TEXT,
    edited_at         TEXT,
    content_diff_hash TEXT,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
    reference_type TEXT NOT NULL CHECK (reference_type IN ('layout','component')),
    type           TEXT CHECK (type IN (
        'DOCUMENT','CANVAS','FRAME','SECTION','GROUP','SLICE','STICKY',
        'COMPONENT','COMPONENT_SET','INSTANCE',
        'RECTANGLE','ELLIPSE','LINE','VECTOR','STAR','POLYGON',
        'BOOLEAN_OPERATION','TEXT'
    )),
    UNIQUE (reference_type, reference_id)
);

-- figma_variable_id is set when origin='Figma Variable' and seeded from the
-- file's local variables. NULL for origin='Custom'. Unique when set so an
-- extractor can resolve `boundVariables.<field>.id` back to one row.
CREATE TABLE IF NOT EXISTS properties (
    uuid              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name              TEXT NOT NULL,
    tailwind_class    TEXT,
    css_style         TEXT NOT NULL,
    type              TEXT NOT NULL CHECK (type IN (
        'Color','Spacing','Font','Typography','Positioning','Grid','Flex',
        'Border','Shadow','Opacity'
    )),
    origin            TEXT NOT NULL CHECK (origin IN ('Custom','Figma Variable')),
    figma_variable_id TEXT,
    UNIQUE (name, type)
);

-- ────────────────────────── Relationship tables ──────────────────────────

CREATE TABLE IF NOT EXISTS pages_registry (
    uuid       TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    page_id    TEXT NOT NULL REFERENCES pages(uuid) ON DELETE CASCADE,
    child_id   TEXT NOT NULL,
    child_type TEXT NOT NULL CHECK (child_type IN ('layout','component')),
    UNIQUE (page_id, child_type, child_id)
);

-- layout_registry.child_property must point to a Positioning or Spacing property
-- (enforced by trg_layout_registry_property_type_* triggers below).
-- A layout always contains components, so child_type is dropped — every row is
-- a layout→component edge.
CREATE TABLE IF NOT EXISTS layout_registry (
    uuid           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    layout_id      TEXT NOT NULL REFERENCES layouts(uuid) ON DELETE CASCADE,
    child_id       TEXT NOT NULL REFERENCES components(uuid) ON DELETE CASCADE,
    child_property TEXT REFERENCES properties(uuid) ON DELETE SET NULL,
    UNIQUE (layout_id, child_id)
);

CREATE TABLE IF NOT EXISTS layout_properties (
    uuid        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    layout_id   TEXT NOT NULL REFERENCES layouts(uuid)    ON DELETE CASCADE,
    property_id TEXT NOT NULL REFERENCES properties(uuid) ON DELETE CASCADE,
    UNIQUE (layout_id, property_id)
);

-- components_registry — self-referential component composition.
-- parent_id composes child_id; matches React composition (e.g. <Card> renders <Pill />).
-- property_id is optional and records the spacing/positioning property applied
-- to the child as rendered inside the parent.
CREATE TABLE IF NOT EXISTS components_registry (
    uuid        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    parent_id   TEXT NOT NULL REFERENCES components(uuid) ON DELETE CASCADE,
    child_id    TEXT NOT NULL REFERENCES components(uuid) ON DELETE CASCADE,
    property_id TEXT REFERENCES properties(uuid) ON DELETE SET NULL,
    UNIQUE (parent_id, child_id),
    CHECK (parent_id <> child_id)
);

CREATE TABLE IF NOT EXISTS components_properties (
    uuid         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    component_id TEXT NOT NULL REFERENCES components(uuid) ON DELETE CASCADE,
    property_id  TEXT NOT NULL REFERENCES properties(uuid) ON DELETE CASCADE,
    state_id     TEXT NOT NULL REFERENCES states(uuid)     ON DELETE CASCADE,
    UNIQUE (component_id, property_id, state_id)
);

-- ──────────────────────────── Variants ────────────────────────────
-- One row per non-default variant of a component. The "default" variant is the
-- parent row in `components`; these rows remember the side variants
-- (figma_node + label + optional state) so the variant tree can be rebuilt.

CREATE TABLE IF NOT EXISTS component_variants (
    uuid         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    component_id TEXT NOT NULL REFERENCES components(uuid) ON DELETE CASCADE,
    figma_node   TEXT NOT NULL,
    figma_url    TEXT,
    name         TEXT,
    variant      TEXT,
    state_id     TEXT REFERENCES states(uuid) ON DELETE SET NULL,
    UNIQUE (component_id, figma_node)
);

-- ──────────────────────────── Indexes ────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pages_file_key                  ON pages(file_key);
CREATE INDEX IF NOT EXISTS idx_layouts_name                    ON layouts(name);
CREATE INDEX IF NOT EXISTS idx_components_name                 ON components(name);
CREATE INDEX IF NOT EXISTS idx_figma_nodes_reference           ON figma_nodes(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_properties_type                 ON properties(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_figma_variable_id
    ON properties(figma_variable_id) WHERE figma_variable_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pages_registry_page             ON pages_registry(page_id);
CREATE INDEX IF NOT EXISTS idx_layout_registry_layout          ON layout_registry(layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_properties_layout        ON layout_properties(layout_id);
CREATE INDEX IF NOT EXISTS idx_components_registry_parent      ON components_registry(parent_id);
CREATE INDEX IF NOT EXISTS idx_components_registry_child       ON components_registry(child_id);
CREATE INDEX IF NOT EXISTS idx_components_properties_component ON components_properties(component_id);
CREATE INDEX IF NOT EXISTS idx_component_variants_component    ON component_variants(component_id);

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
