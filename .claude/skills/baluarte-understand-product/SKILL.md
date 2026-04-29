---
name: baluarte-understand-product
description: Register ONE Figma node (layout, component, or other) into the SQLite registry. Drills only that node at default depth, classifies it per the tier heuristics, persists the row, and surfaces direct children as suggested follow-up commands the user can run manually. NEVER auto-recurses, NEVER calls another baluarte-* skill. REQUIRES a specific Figma node URL (selection link), not a file root.
---

# baluarte-understand-product

Use this skill when the user asks to "understand", "ingest", "audit", "scan", or "register" a Figma file in this project. It is the entry point that builds the canonical registry that downstream skills (Storybook generation, audit, handoff) will read from.

## Hard rules

- **Single node only.** Drill exactly the one node the user pointed at, at default depth. Do **not** drill its descendants. Do **not** walk siblings. List children in the report and suggest follow-up commands; the user runs them manually.
- **Do not call another baluarte-* skill.** Only `baluarte-remember` (for SQLite persistence). Anything else missing is reported with a suggested command for the user to run.
- **This skill is itself auto-callable** by other baluarte-* skills (it's on the whitelist alongside `baluarte-remember`). When invoked from another skill rather than directly by the user, the same dedup-feedback semantics apply.
- **Use Metalab MCP Figma tools exclusively.** Do not curl the Figma REST API, do not paste screenshots, do not infer from filenames. Every fact about the file must come from `mcp__metalab__figma__*` or `mcp__metalab__figma_live_*` tool calls.
- **Persist via `baluarte-remember`.** Do not run SQL in this skill. Hand off every write to the `baluarte-remember` skill (or its documented `sqlite3` invocations).
- **Idempotent.** Running this skill twice on the same node must not duplicate rows — use the `ON CONFLICT` upserts documented in `baluarte-remember`.

## Dedup feedback (mandatory when an existing row is found)

Before classifying or persisting, look up the resolved `node_id`:

```bash
sqlite3 -header -box .data/baluarte.db \
  "SELECT uuid, node_type, description, updated_at FROM registry WHERE node_id='<NODE_ID>';"
```

If a row exists, **do not silently overwrite it**. Surface a dedup-feedback block to the caller (user or invoking skill):

```
node_id <X> is already registered:
  uuid:        <existing uuid>
  node_type:   <layout|component|property|page|other>
  description: <existing description>
  updated_at:  <timestamp>

Action taken this run:
  - Without --prompt: returning the existing row unchanged. No re-classification.
  - With --prompt "<text>": refreshing description and (if the prompt suggests it) node_type. Old values preserved above for comparison.
```

The caller decides what to do with the feedback. When invoked from `baluarte-document-component` (or another doc skill) via the whitelist, the doc skill consumes the returned `uuid` and proceeds. When invoked directly by the user, the feedback is the answer — they re-run with `--prompt` if they want a refresh.

This guarantees the skill is safe to call automatically without hidden destructive overwrites.

## Optional argument: `--prompt "<context>"`

If the user passes `--prompt "<text>"`, treat it as classification/naming guidance for THIS node only:
- "this is an atomic input" → set `granularity='atomic'` even if the heuristic is uncertain
- "name it FilterChip" → use that name verbatim instead of inferring
- "treat as ignored" → register as `node_type='other'` with a note
- Free-form descriptive text → fold into the row's `description`

The prompt influences the *one* row this run touches; it does not change global behavior.

## Required argument

This skill takes **exactly one mandatory argument**: the Figma project URL.

Accepted shapes:
- `https://www.figma.com/file/<fileKey>/<slug>` (legacy)
- `https://www.figma.com/design/<fileKey>/<slug>` (current)
- Either of the above with a `?node-id=…` suffix — that node id scopes the walk; without it, scope to the whole file.

### Validation (do this before any tool call)

1. If no argument was provided → **stop immediately** and reply with:
   > `baluarte-understand-product` requires a Figma project URL as its only argument. Re-invoke with the URL, e.g. `https://www.figma.com/design/<fileKey>/<slug>`.
   Do not prompt the user for it interactively, do not guess from context, do not fall back to the "currently open file". Hard fail.
2. If the argument is present but does not match the URL shapes above (missing `figma.com`, missing `/file/` or `/design/`, missing fileKey segment) → **stop immediately** with:
   > Argument is not a valid Figma project URL: `<value>`. Expected `https://www.figma.com/{file|design}/<fileKey>/<slug>`.
3. Extract `fileKey` (the path segment after `/file/` or `/design/`) and the optional `node-id` query param. Use `fileKey` with `mcp__metalab__figma_write_set_file_key` in step 1 below. If `node-id` was present, scope step 3's walk to that node.

## Steps

### 1. Verify connectivity and target the file

The argument has already been validated above; `fileKey` is extracted.

Two connections must be green before any read: the **Figma API** (OAuth) and the **Figma plugin bridge** (live socket). When this skill is invoked from `baluarte-orchestrate`, the gate has already run; when invoked stand-alone, run it here.

**1a. Check + recover API auth:**

```
mcp__metalab__figma__connect_account  →  action: "status"
```

If not connected, call `action: "connect"`, surface the returned OAuth URL to the user verbatim, and wait for them to confirm before re-checking `status`. If still failing, abort with the API's error.

**1b. Check the plugin bridge:**

```
mcp__metalab__figma_write_check_connection
```

If not connected, instruct the user to open the file in the Figma desktop app and launch the Metalab plugin, then wait for confirmation before re-checking. Always surface the broker port so the user can confirm the plugin is talking to the right instance.

**1c. Pin the file key:**

```
mcp__metalab__figma_write_set_file_key  →  { fileKey }
```

If the plugin's reported `fileKey` differs from the URL's, abort and ask the user to switch tabs — proceeding would read the wrong file.

### 2. Get the lay of the land

Call these to understand what's in the file before drilling in:

- `mcp__metalab__figma_live_get_current_file` — file name, top-level pages.
- `mcp__metalab__figma_live_get_page_structure` — page → frame hierarchy.
- `mcp__metalab__figma_live_get_local_components` — published / local component set.
- `mcp__metalab__figma_live_get_styles` — color, text, effect, grid styles (token candidates).

### 3. Walk components and instances

For each component (and notable frame) of interest:

- `mcp__metalab__figma__get_figma_node` — read the full node (children, auto-layout, sizing, fills, strokes, effects, text style refs).
- `mcp__metalab__figma__search_nodes` — find variants, instances, or nodes by name pattern when the structure is large.
- `mcp__metalab__figma__download_node_images` — only when an image is needed for context (don't bulk-download).

### 4. Build the mental model (checklist to fill out before persisting)

Work through this list and write the answers down in the conversation before any DB writes:

- **Concept / product summary** — one paragraph: what is this product, who is it for, what are the dominant flows shown in the file.
- **Token inventory** — for each style discovered:
  - `type` ∈ `color | spacing | typography | radius | shadow | grid | other`
  - `name` — Figma style name (kept verbatim where possible, e.g. `color/brand/primary`)
  - `value` — canonical string. For typography, a stable JSON blob with family/weight/size/lineHeight is fine.
- **Component inventory** — for each candidate node, classify per the **Classification heuristics** below before persisting.
- **Layout / sizing notes** — auto-layout patterns, breakpoints, grid usage, instance overrides worth noting. These go into the component `description`, not as separate columns.

If the file is large, scope to one page or one component set per run and state that scope back to the user.

## Classification heuristics (mandatory before persisting any registry row)

Many Figma files are **handoff/presentation decks**, not pure design-system files. A naive "every top-level frame is a layout" rule produces garbage — slides full of decorative content get treated as layouts, and the real layouts (the inner screen mockups) are missed. Before persisting, classify every candidate node through five tiers, in order. Stop at the first tier that matches.

The five `node_type` values are: `layout | component | property | page | other`. Components additionally get a `granularity` of `atomic | molecular | unknown` (recorded on the `components` row by `baluarte-document-component`).

### Tier 1 — Wrappers / presentation slides → drill in, do NOT register as layout

A frame is a **wrapper** (presentation slide, not a layout) when **any** hold:

- Its name matches `^Slide$` exactly, or its name is purely descriptive (e.g. "Cover", "Title slide", "Thumbnail").
- It lives at the root of a Figma page named in a presentation pattern (e.g. `Sprint *`, `Deck *`, `Handoff *`, `Intro`).
- Its dimensions match a presentation aspect ratio: `1920×1080`, `2408×1080`, `5952×4090`, `5952×3298`, `5952×1432`, `6484×1432`. Anything wider than 1920 with 16:9-ish ratio is suspicious.
- Its direct children are: a single dominant inner FRAME with screen dimensions (mobile/tablet/desktop) **plus** auxiliary decorative INSTANCEs (Eyebrow, background ellipses, blur layers, title text).

**Action**: register the wrapper as `node_type='page'` (or `'other'` if you want to ignore it entirely later), and **drill into its direct children** to find:
- The inner screen frame(s) → those become `node_type='layout'` *candidates* (re-evaluate in Tier 2).
- Decorative siblings (Eyebrow instances, background ellipses, blur effects, page-title text) → `node_type='other'`.

Do **not** call `baluarte-document-layout` on a wrapper. The doc-layout skill will refuse it.

### Tier 2 — Layout detection (the inner screen frames)

A frame is a **layout** when **all** hold:

- Dimensions match a known device class:
  - **Mobile**: width 320–430, height 568–932 (iPhone, Android phones)
  - **Tablet**: width 600–834, height 768–1366
  - **Desktop**: width 1024–1920, height 600–1200
  - **Large desktop**: up to 2560 wide
- It has a structured composition: ≥3 distinct INSTANCE children, OR a frame containing both a status/nav element + a content body.
- It is NOT itself an INSTANCE of a published component (those are components, not layouts).

If a candidate matches the dimensions but has only 1–2 children that are all TEXT → demote to **Tier 3 ignore**.

### Tier 3 — Ignore criteria (`node_type='other'`)

Mark `other` (and skip documentation) for:

- **Typography-only frames**: 1–2 TEXT children, no INSTANCE/FRAME composition. *Example given by the user: a slide whose only content is a "Heart Health" title.*
- **Pure decorative**: only RECTANGLE/ELLIPSE/IMAGE-SVG with effects (blur, gradient), no children intended for reuse.
- **Wrapper containers**: a FRAME whose sole purpose is to group other registry-worthy nodes. The wrapper gets `other`; its child becomes the layout/component.

### Tier 4 — Component detection + granularity

A node is a `component` when it's:

- An INSTANCE of a publishable component-set (has a `componentId`), OR
- A FRAME that's clearly reused across multiple layouts as a self-contained unit (e.g. card, input, tab bar), OR
- **A hand-built reusable FRAME** with no `componentId` but a recognisable component shape (very common in handoff files — designers often build buttons/cards as plain FRAMEs without promoting them to components). Detection by structural shape:

  | Shape signal | Probable role | Granularity |
  |---|---|---|
  | Rounded FRAME (`borderRadius` ≥ 8) with a single TEXT child, height 28–56, padding 6–14 px | button | atomic |
  | FRAME with an image-fill RECTANGLE on top + a sibling FRAME of TEXT children below, vertical auto-layout | card | atomic |
  | FRAME with an icon SVG/IMAGE-SVG + TEXT child, horizontal auto-layout, height 24–48 | label / chip / row item | atomic |
  | FRAME with a track + circle/handle pattern (rectangles arranged for a track + a thumb) | slider control | atomic |
  | FRAME containing 2+ instances of an *atomic* shape detected above | molecule (e.g. card slider, button group) | molecular |

  Hand-built FRAMEs almost always have **Figma-generated names** (`Frame 2147222619`, `Frame 1533207866`). Don't reject a candidate just because its name is generic — judge by structure. Propose a meaningful name yourself when registering: `<Role><Modifier>` style (`LearnMoreButton`, `ArticleCard`, `RangeSlider`, `BiomarkerChip`).

  Repetition is a strong signal: if the same hand-built FRAME shape appears in ≥ 2 layouts (or ≥ 2 times within one layout), it's almost certainly a component. When in doubt, register it and let the orchestrator's classification-review checkpoint catch false positives.

Classify each component as **atomic** or **molecular** (recorded on the `components` row's `granularity` column):

- **`atomic`** — a leaf-level UI primitive (input, button, checkbox, icon, label, badge). Detection signals:
  - Name suggests a primitive (`Input`, `Button`, `Icon`, `Checkbox`, `Switch`, `Avatar`, `Tag`, `Badge`).
  - Internal structure is primarily TEXT/RECTANGLE/ELLIPSE/IMAGE-SVG with **zero or one** nested INSTANCE child.
  - Width is small (typically ≤ 400) and height is small (typically ≤ 80) for inline primitives.
- **`molecular`** — a composite of 2+ atomic components arranged in an auto-layout container (cards, tab groups, list rows, headers). Detection signals:
  - Direct children include 2+ INSTANCEs whose `componentId` resolves to a registered atomic component.
  - Has its own auto-layout container shape (frame with `mode: row|column`).
- **`unknown`** — confidence below threshold. Persist with `granularity='unknown'`; the orchestrator's classification-review checkpoint will surface it.

When a layout drill discovers a molecular component, **register the molecular row first**, then recurse into its INSTANCE children to register them as atomic siblings (each gets its own registry + components row + `registry_children` edge from the molecular).

### Tier 5 — Confidence scoring (informal)

These are guidance signals, not a numeric algorithm. Use them when explaining *why* a node was classified the way it was, and to decide when to flag for user review.

| Signal | Effect on confidence |
|---|---|
| Exact name match (e.g. frame named `Slide`, `Input`, `Card`) | strong + |
| Dimensions match the proposed class | + |
| Children-shape matches (layout has multiple instances; atomic has primitives only) | + |
| Two plausible classifications (could be molecular component or small layout) | − |
| Frame has an unfamiliar name and ambiguous shape | strong − |

When confidence is **medium**, persist with the inferred type but write `"low-confidence: <one-line reason>"` into the row's `properties_json.notes`. When confidence is **low**, persist as `node_type='other'` with `notes='unclassified — needs user input'`. The orchestrator surfaces both for user review at its A→B checkpoint.

### Worked examples

| Source | Tier hit | Final classification |
|---|---|---|
| `3:2325` (1920×1080 frame named "Slide" with Eyebrow + iPhone mockup) | Tier 1 | `page` (wrapper); drill in. |
| The iPhone mockup *inside* `3:2325` (393×852 frame with Status Bar + Nav + content) | Tier 2 | `layout` |
| `3:8100` (1920×1080 named "Slide" whose only meaningful content is a 128px "My Health" title) | Tier 1 → Tier 3 | `other` (typography-only after wrapper drill) |
| `3:1605` ("Eyebrow" — 30 INSTANCE of small text strip) | Tier 4 | `component`, `granularity='atomic'` |
| `13:9785` ("Nav" — 393w INSTANCE containing hamburger + actions + LogoWordmark) | Tier 4 | `component`, `granularity='molecular'` |

### 4a. Fill the relationship tables (mandatory)

This step is what keeps `tokens`, `registry_tokens`, and `registry_children` from being silently empty. It runs *before* persistence so step 5 has all the data it needs.

#### 4a-i. Token enumeration with fallback

Try the live styles tool first:

```
mcp__metalab__figma_live_get_styles
```

If it returns the published-style list, parse each style into a token row.

If it errors (the Metalab plugin's `loadAllPagesAsync` / `dynamic-page` family of errors is common — e.g. `"Cannot call findAll with documentAccess: dynamic-page without calling figma.loadAllPagesAsync() first"`), **do not silently move on**. Fall back to per-node extraction:

- For every `mcp__metalab__figma__get_figma_node` response collected during the walk, parse the `globalVars.styles` block.
- Each entry becomes a candidate token, keyed by its auto-generated id when a Figma published-style name isn't recoverable:
  - `style_*` → `type='typography'`, `value` = JSON `{family, weight, size, lineHeight, letterSpacing}`
  - `fill_*` → `type='color'`, `value` = first array entry (hex / `rgba(...)` / `linear-gradient(...)`)
  - `stroke_*` → `type='color'`, `value` = first color from `stroke.colors`
  - `effect_*` → `type='shadow'`, `value` = the `boxShadow` / `backdropFilter` string
  - `layout_*` → **skip** (these are sizing/auto-layout metadata, not theme tokens)
- `name` = the gateway id verbatim (e.g. `style_0GLRTY`). When the same value appears under different gateway ids across nodes, dedup by value before insert.
- Upsert via `baluarte-remember` with `ON CONFLICT(name, type) DO UPDATE SET value=excluded.value`.

In the step-end report, surface: how many tokens came from `figma_live_get_styles` vs the fallback drill, and call out the fallback explicitly so the user knows the source.

#### 4a-ii. Per-layout child-instance drill

`figma_live_get_page_structure` is depth-capped (default 3). To populate `registry_children` for layouts whose first-level children are nested deeper, drill in:

For every `node_type='layout'` registry row written so far, call `mcp__metalab__figma__get_figma_node` (default depth) on its `node_id`. From the response, iterate direct-child INSTANCEs (and direct-child FRAMEs that wrap a single instance):

1. If the child has a `componentId` and that componentId already exists as a `registry.node_id`, use that row's uuid.
2. Else, use the existing `external-component:<sanitised-name>` synthesis pattern to find or insert a `node_type='component'` registry row.
3. `INSERT OR IGNORE INTO registry_children(parent_uuid, child_uuid)` with the layout's uuid and the resolved child uuid.
4. From the child's `globalVars.styles` references, also `INSERT OR IGNORE INTO registry_tokens(registry_uuid, token_uuid)` for each token discovered in 4a-i.

#### 4a-iii. Self-check (runs before step 6)

Before reporting back, assert:

- `SELECT COUNT(*) FROM tokens` ≥ 1, **or** the file genuinely has no styles. The "no styles" conclusion must be backed by an empty `globalVars.styles` across every walked node — log this conclusion explicitly. Do not pass the assertion silently.
- For every `node_type='layout'` row whose `get_figma_node` payload showed direct INSTANCE children: `SELECT COUNT(*) FROM registry_children WHERE parent_uuid=?` ≥ 1.

If either check fails, **do not silently finish**. Surface the offending uuids and the reason (e.g. "layout 3:2325 has 4 INSTANCE children in Figma but registry_children has 0 edges — link write failed or registry rows missing").

### 5. Persist via `baluarte-remember`

Initialise the DB if needed (the `baluarte-remember` SKILL has the exact commands), then for each item:

1. **Upsert every token first** (children before parents — tokens are referenced by registry rows).
2. **Upsert every component** into `registry` with the correct `node_type`. Use the upsert form documented in `baluarte-remember` (`ON CONFLICT(node_id) DO UPDATE` overwrites `node_type` and `description`).
3. **Link parents → children** in `registry_children` (only after both rows exist).
4. **Link components → tokens** in `registry_tokens`.

All write commands and their conflict-handling are documented in `.claude/skills/baluarte-remember/SKILL.md`. Do not invent new SQL here.

### 6. Report back

End with a concise summary:

- File name and (if scoped) the page/component-set you covered.
- Counts: components registered, tokens registered, parent/child links, component/token links.
- Any nodes you skipped and why (detached instances, deprecated frames, scope cap).
- Open questions for the user (ambiguous component purpose, missing token names, etc.).

## What this skill does NOT do

- It does not generate Storybook code.
- It does not modify the Figma file (no `figma_write_*` calls).
- It does not delete existing registry rows. Removal is a separate, explicit action.
- It does not store prose context — that belongs in `MEMORY.md`, not the registry.
