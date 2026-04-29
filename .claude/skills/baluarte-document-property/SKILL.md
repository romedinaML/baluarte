---
name: baluarte-document-property
description: Document one Tailwind-theme-shaped visual property (color, typography, spacing, sizing, radius, shadow, other). Dedups against visual_properties on (name,type) — already-documented properties are a no-op. Otherwise creates one artboard inside the Properties section of "Baluarte for Devs" with a real visual specimen following design-system documentation conventions plus a uniform metadata block, then persists a `visual_properties` row. Auto-links to the source `tokens` row when one exists.
---

# baluarte-document-property

Documents one visual property, the way a design-system doc site would: visual specimen + metadata block.

## Required arguments

- `name` — canonical name (e.g. `brand/primary`, `heading/lg`, `space/md`).
- `type` — one of `color | typography | spacing | sizing | radius | shadow | other`.
- `tailwind_name` — the Tailwind class fragment (e.g. `brand-primary`, `heading-lg`, `space-md`).
- `css_property` — the CSS property name (e.g. `background-color`, `font-family`, `padding`).
- `value` — canonical string. Typography accepts a JSON blob `{family, weight, size, lineHeight}`.

## Optional

- `token_uuid` — link to the source `tokens` row. If omitted, the skill looks it up automatically by `(name, type)`.
- `--prompt "<free-form context>"` — user-supplied guidance. Use it to:
  - Override the metadata caption (e.g. `--prompt "this is the only color used for destructive actions"`).
  - Specify a non-default specimen size (e.g. `--prompt "render the swatch at 480×240, not 240×120"`).
  - Add notes that get appended to the metadata block as a "Notes" line.

If any required argument is missing, fail fast naming the missing field.

## Pre-checks

1. **Dedup — single most important step.**
   ```bash
   sqlite3 -header -box .data/baluarte.db \
     "SELECT uuid, doc_artboard_id FROM visual_properties WHERE name='<NAME>' AND type='<TYPE>';"
   ```
   If a row exists → no-op (return existing `uuid` / `doc_artboard_id`). Do not create another artboard. The user can force a refresh by deleting the row first.
2. **Resolve `token_uuid`** if not passed:
   ```bash
   sqlite3 .data/baluarte.db \
     "SELECT uuid FROM tokens WHERE name='<NAME>' AND type='<TYPE>';"
   ```
3. **Resolve `properties_section_id` from cache.** This skill never auto-calls `baluarte-create-developers-docs`. Read the cache via `baluarte-remember`:
   ```bash
   sqlite3 .data/baluarte.db \
     "SELECT properties_section_id FROM dev_docs_pages WHERE properties_section_id IS NOT NULL;"
   ```
   If empty → fail with: `"No dev-docs page cached. Run baluarte-create-developers-docs <figma URL> first, then retry."`

## Build the artboard

Every property artboard has the same outer shape. Only the **specimen** differs by type.

### Outer skeleton

```
Artboard frame  (auto-layout, vertical, gap 16, padding 24, fixed width 320)
   ← parented to properties_section_id
├── Specimen frame  (auto-layout, hug)
│   └── <type-specific visual — see below>
└── Metadata frame  (auto-layout, vertical, gap 4, fill width)
    ├── name           — e.g. "brand/primary"
    ├── type           — e.g. "color"
    ├── tailwind_name  — e.g. "brand-primary"
    ├── css_property   — e.g. "background-color"
    ├── value          — e.g. "#0F62FE"
    └── source token   — only shown if token_uuid is non-null
```

Artboard name: `Property — <type> — <name>` (e.g. `Property — color — brand/primary`).

### Specimen rules per type

Each follows common design-system documentation conventions. All visual nodes go inside the Specimen frame and use auto-layout where applicable.

- **color**
  - `mcp__metalab__figma_write_create_rectangle` (240 × 120).
  - `mcp__metalab__figma_write_set_fill_color` to the hex from `value`.
  - Optional: a thin border via `figma_write_set_stroke` to make near-white swatches visible on white.
- **typography**
  - `mcp__metalab__figma_write_create_text` rendering the standard sample line "The quick brown fox jumps over the lazy dog".
  - Apply font family / weight / size / line-height from the `value` JSON via `figma_write_modify_node`.
  - Add a small caption text below specimen: `"<size> / <lineHeight>"`.
- **spacing**
  - Two filled rectangles (e.g. 24×24 each) inside an auto-layout frame with `itemSpacing` set to the spacing value in px. Visualises the gap directly.
  - Caption: `"<value> · <tailwind_name>"`.
- **sizing**
  - One filled rectangle of the actual size (parsed from `value`). Cap at 320×320 visually; if the real size is larger, render the cap and label `"actual: <value>"`.
- **radius**
  - One 160×100 rectangle with `cornerRadius` set to the radius value (`figma_write_modify_node` with `cornerRadius`).
  - Caption: `"<value> · <tailwind_name>"`.
- **shadow**
  - One 200×120 light-grey rectangle with the shadow effect applied. Use `figma_write_modify_node` to set the `effects` array equivalent to the `value`.
  - Caption: `"<value>"`.
- **other**
  - Fallback: a labelled rectangle (200×80) with the raw `value` rendered as a text node next to it.

### MCP calls (high-level)

1. `figma_write_create_frame` → parent: `properties_section_id`, name: `Property — <type> — <name>`, fixed width 320.
2. `figma_write_set_auto_layout` on the artboard (vertical, gap 16, padding 24).
3. Create Specimen sub-frame; render the type-specific specimen (see above).
4. Create Metadata sub-frame with auto-layout (vertical, gap 4, fill width); add one text node per metadata field.
5. Capture the artboard id as `<doc_artboard_id>`.

## Persist

Use the upsert documented in `baluarte-remember`:

```bash
UUID=$(uuidgen | tr 'A-Z' 'a-z')
sqlite3 .data/baluarte.db <<SQL
INSERT INTO visual_properties(uuid, name, type, tailwind_name, css_property, value, doc_artboard_id, token_uuid)
VALUES(
  '$UUID', '<NAME>', '<TYPE>', '<TAILWIND>', '<CSS>', '<VALUE>', '<ARTBOARD_ID>',
  COALESCE('<TOKEN_UUID_OR_NULL>', (SELECT uuid FROM tokens WHERE name='<NAME>' AND type='<TYPE>'))
)
ON CONFLICT(name, type) DO UPDATE SET
  tailwind_name   = excluded.tailwind_name,
  css_property    = excluded.css_property,
  value           = excluded.value,
  doc_artboard_id = excluded.doc_artboard_id,
  token_uuid      = excluded.token_uuid;
SQL
```

## Bulk path

When invoked many times in a row (e.g. promoting a whole token catalog into `visual_properties`), wrap the inserts in a single transaction per `baluarte-remember`'s bulk pattern. Each property still gets its own artboard — the transaction is just for the SQLite writes.

Useful complex-query gap analysis (run before bulk runs to know what's missing):

```bash
sqlite3 -header -box .data/baluarte.db \
  "SELECT t.name, t.type, t.value
   FROM tokens t
   LEFT JOIN visual_properties vp ON vp.name = t.name AND vp.type = t.type
   WHERE vp.uuid IS NULL
   ORDER BY t.type, t.name;"
```

## Hard rules

- **Dedup before drawing.** A duplicate artboard for the same `(name, type)` is a bug.
- Never modify any node outside this artboard. The skill only creates new nodes inside `properties_section_id`.
- Every text-bearing or grouped-visual frame uses auto-layout.
- All persistence goes through `baluarte-remember`.
- All Figma writes are `mcp__metalab__figma_write_*`; reads are `mcp__metalab__figma_live_*` / `mcp__metalab__figma__get_figma_node`.
- **Auto-call whitelist is two skills only.** This skill may invoke `baluarte-remember` and `baluarte-understand-product` (the latter rarely applies here, since properties don't usually correspond to Figma nodes — but the whitelist is consistent across the family). If the dev-docs page isn't cached, fail with a clear suggestion for the user to run `baluarte-create-developers-docs` manually.
