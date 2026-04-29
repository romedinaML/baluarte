---
name: baluarte-create-developers-docs
description: Ensure the "Baluarte for Devs" page exists in the active Figma file (creating it via figma_write_evaluate_script if missing) and that its three section frames (Properties, Components, Layouts) exist. Caches everything in dev_docs_pages so repeat calls are cheap. Idempotent. The user runs this manually exactly once per Figma file before invoking any baluarte-document-* skill — those skills no longer auto-call this one; they fail fast if the cache is empty.
---

# baluarte-create-developers-docs

Sets up the documentation surface every doc skill writes into:

- A real top-level Figma **page** named `Baluarte for Devs`.
- Three section frames inside it, in fixed order: **Properties**, **Components**, **Layouts**.

The page id and three section ids are cached in `dev_docs_pages` (keyed by Figma `file_key`) so subsequent calls are a single SQLite read.

## When this is called

- **Manually by the user**, exactly once per Figma file, before invoking any `baluarte-document-*` skill. The doc skills no longer auto-call this one — they read the cache and fail fast if it's empty.
- Re-runnable any time without side-effects (the operation is fully idempotent — existing page + section frames are reused).

## Required inputs

- A Figma URL (same shape and validation as `baluarte-understand-product`) so the file key can be extracted. Fail fast if missing.

## Optional arguments

- `--prompt "<free-form context>"` — user-supplied guidance. Use it to:
  - Force a different page name (e.g. `--prompt "name the page 'Devs Handoff' instead of 'Baluarte for Devs'"`).
  - Skip creating one of the three section frames (e.g. `--prompt "skip the Properties section — we won't be using design tokens"`).
  - Override section ordering (e.g. `--prompt "put Layouts above Components"`).

## Steps

### 1. Verify the connection and target the file

```
mcp__metalab__figma__test_figma_connection
mcp__metalab__figma_write_set_file_key  →  { fileKey }
```

### 2. Read the cache

Use `baluarte-remember`:

```bash
sqlite3 -header -box .data/baluarte.db \
  "SELECT page_node_id, properties_section_id, components_section_id, layouts_section_id
   FROM dev_docs_pages WHERE file_key='<KEY>';"
```

If a row exists and all four ids are non-null, **verify they still resolve** with `mcp__metalab__figma__get_figma_node` for each id. If all four resolve → return them, done.

If any id fails to resolve, fall through to (re)create the missing pieces and update the cache.

### 3. Find or create the page

If the cache missed the page id, list pages first:

```
mcp__metalab__figma_live_get_page_structure
```

If a page named exactly `Baluarte for Devs` exists, take its `node_id`. Otherwise, create it via the evaluate-script escape hatch (the only write tool that can produce a page):

```
mcp__metalab__figma_write_evaluate_script  →  script:
  const p = figma.createPage();
  p.name = "Baluarte for Devs";
  return p.id;
```

Capture the returned id as `page_node_id`.

### 4. Ensure the three section frames

For each missing section, in this fixed order — **Properties**, **Components**, **Layouts** — call:

```
mcp__metalab__figma_write_create_frame  →  parentId: <page_node_id>, name: "<Section>"
mcp__metalab__figma_write_set_auto_layout  →  nodeId: <new frame id>,
    direction: vertical (Layouts) | wrap (Properties, Components),
    itemSpacing: 32, paddingTop/Right/Bottom/Left: 32
```

Recommended geometry (consistent visual rhythm across files):
- Page-level layout: vertical auto-layout, `itemSpacing: 64`, padding `64`.
- Properties section: wrapping auto-layout, `itemSpacing: 24`.
- Components section: wrapping auto-layout, `itemSpacing: 32`.
- Layouts section: vertical auto-layout, `itemSpacing: 48`.

Add a section title text node at the top of each section (`figma_write_create_text` with the section name in a heading style). The section frame itself is what doc skills parent their artboards to — the title text is a sibling, not a wrapper.

### 5. Persist the cache

Use `baluarte-remember`:

```bash
# First time
UUID=$(uuidgen | tr 'A-Z' 'a-z')
sqlite3 .data/baluarte.db \
  "INSERT INTO dev_docs_pages(uuid, file_key, page_node_id,
                              properties_section_id, components_section_id, layouts_section_id)
   VALUES('$UUID','<KEY>','<PAGE>','<PROPS>','<COMPS>','<LAYOUTS>')
   ON CONFLICT(file_key) DO UPDATE SET
     page_node_id          = excluded.page_node_id,
     properties_section_id = excluded.properties_section_id,
     components_section_id = excluded.components_section_id,
     layouts_section_id    = excluded.layouts_section_id;"
```

### 6. Return

Return the four ids as a structured object so the calling doc skill can parent its artboards:

```
{
  "page_node_id": "...",
  "properties_section_id": "...",
  "components_section_id": "...",
  "layouts_section_id": "..."
}
```

## Hard rules

- **Never** create the page or any section twice. Always check the cache and verify in Figma first.
- **Never** modify or delete user-created pages or frames. The skill only adds the `Baluarte for Devs` page (if missing) and its three sections (if missing).
- All writes go through `mcp__metalab__figma_write_*`. All reads go through `mcp__metalab__figma_live_*` / `mcp__metalab__figma__get_figma_node`.
- All persistence goes through `baluarte-remember`. No inline SQL elsewhere.
- **Do not call another baluarte-* skill** other than `baluarte-remember`. This skill is invoked manually by the user; doc skills only read its cached output.
