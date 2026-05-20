---
name: baluarte-build
description: Generate and incrementally patch Storybook artifacts (component + layout files + stories) and the Tailwind theme inside `baluarte-app/` from the registry. Reads the registry exclusively via `baluarte-remember`, never the DB directly. Computes a property/parent dependency graph, writes the minimum delta per entity, and records each `storybook` row + entity `storybook_id` linkage back through `baluarte-remember`.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Skill
---

# baluarte-build

Generates the React + Storybook artifacts inside `baluarte-app/` from rows `/baluarte-analyze` wrote into `.data/baluarte.db`. **Never touches the DB directly** — every read and every write goes through the `baluarte-remember` skill.

The skill is **incremental by design.** Re-running it after a Figma change applies the *minimum delta* between the registry and the on-disk artifact. A property value/name change is propagated to every entity that references it (via `components_properties`, `layout_properties`, and the `*_registry` parent/child fan-out) without churning unrelated parts of the file. Whole-file rewrites are not acceptable. The single exception is `baluarte-app/baluarte.tailwind.ts`, which is a pure projection of `properties` and is regenerated whole.

After every per-entity write, the skill calls `baluarte-remember` to upsert a `storybook` row (`name`, `url_local`, `src_ref`) and to set `storybook_id` on the originating layout/component. That closes the loop so future runs are idempotent.

## When to use

- After `/baluarte-analyze` has populated layouts/components/properties.
- After re-syncing a Figma file: re-running `/baluarte-build` rewrites only the affected artifacts.

## When NOT to use

- Reading/writing `.data/baluarte.db` directly → `baluarte-remember`.
- Pulling new entities out of Figma → `/baluarte-analyze`.
- Hand-crafted artifacts that should not be overwritten → keep them outside `src/layouts/` and `src/components/`, or strip the `// AUTO-GENERATED` header.

## Inputs

| Argument | Required | Type | Description |
|---|---|---|---|
| `--scope` | no | `all\|layouts\|components\|properties` | Tier(s) to build. Default `all`. Non-`all` scopes still pull `properties` if the dirty set needs className substitutions. |
| `--name <name>` | no | string | Limit to entities whose `name` matches exactly. |
| `--uuid <uuid>` | no | string | Limit to a single registry row. Mutually exclusive with `--name`. |
| `--prompt "<text>"` | no | string | Free-form guidance — naming overrides, render hints, etc. Surfaced verbatim when ambiguous. |

If neither `--name` nor `--uuid` is given, build everything in scope.

## Procedure

### 1. Verify the playground

The following must exist:
- `baluarte-app/package.json`
- `baluarte-app/.storybook/main.ts`
- `baluarte-app/baluarte.tailwind.ts`
- `baluarte-app/tailwind.config.ts`

If any is missing, fail fast with a copy-pasteable bootstrap suggestion (`cd baluarte-app && npm install`) and stop.

### 2. Fetch the registry through `baluarte-remember`

**This step is a `Skill` tool call with `skill=baluarte-remember`. Never run `sqlite3` from bash, never `.read queries/*.sql` from this skill, never use `node:sqlite`.**

Per scope tier:

- **layouts** → `select_layouts_all`, then for each row: `list_layout_registry_by_layout`, `list_layout_properties_by_layout`, `select_figma_node_for_reference` (`:reference_type='layout'`).
- **components** → `select_components_all`, then per row: `list_component_variants_by_component`, `list_components_properties_by_component`, `list_components_registry_by_parent`, `select_figma_node_for_reference` (`:reference_type='component'`).
- **properties** → `select_properties_all`.

For every layout/component, also pull the row's current `storybook_id` via `select_<layout|component>_by_uuid` so the skill can decide insert-vs-update on the storybook side.

### 3. Build the dependency graph & dirty set (REQUIRED before any write)

- **Property → entity index** from the union of `components_properties` and `layout_properties`. Each row maps a `property_id` to an entity uuid (with optional `state_id`).
- **Parent → child index** from `layout_registry` (layout→component) and `components_registry` (component→component). A dirty child transitively marks its parent dirty.

**Dirty rules:**

- A registry row is dirty when its on-disk artifact's header `content_diff_hash` does not match the row's current `content_diff_hash`. A registry row with no on-disk artifact is also dirty (will be `created`).
- A property is dirty when its registry row no longer matches the entry currently emitted in `baluarte.tailwind.ts` (compared by the `// @baluarte uuid=…` annotation + the value). A property registered with no annotation in the file is also dirty.
- If a property is dirty, every entity that references it (via `*_properties`) is dirty even when the entity's own hash is unchanged.
- Dirty propagates **upward**: a dirty child component marks its parent component(s) dirty (via `components_registry`); a dirty component marks its parent layout(s) dirty (via `layout_registry`). It does NOT propagate downward.

Emit the dirty set as a **Plan** block to the user before any write:

```
Plan
────
Properties: 5 dirty (1 renamed, 4 value-only)
Components: 2 dirty (NavButton → property navbar-button-active changed; AgePill → hash_changed)
Layouts:    1 dirty (HomeScreen → child NavBar dirty)
```

### 4. Compute and apply the minimum delta per dirty entity

Decide the artifact path by tier:
- layout → `baluarte-app/src/layouts/<PascalName>/<PascalName>.tsx` (+ `.stories.tsx`)
- component → `baluarte-app/src/components/<PascalName>/<PascalName>.tsx` (+ `.stories.tsx`)

For each dirty entity:

1. **Parse the existing artifact (if any)** into a structured representation: header fields (`source`, `uuid`, `content_diff_hash`), prop signature, root `className` token list, story exports, `meta.title`, `src_ref`.
2. **Compute the desired representation** from the registry rows. Compose Tailwind class strings from the joined `properties.tailwind_class` values keyed by `state_id`; nested components render as JSX children via the entity's `*_registry` rows (React composition — see §5).
3. **Diff at the field level** — never at the whole-file level. The diff buckets are:
   - `header.content_diff_hash` updated.
   - `className` tokens whose underlying property uuid was renamed → substitute the new token only on the affected lines.
   - Property uuids removed from the entity's `*_properties` link table → remove the corresponding tokens.
   - Property uuids added to the entity's `*_properties` link table → splice the new tokens into the className string in canonical (alphabetical) order.
   - Story exports added/removed in the registry → patch in place.
   - Prop-signature changes (a new `state` enum value, etc.) → patch the `interface` + `args` defaults in place.
4. **Apply substitutions surgically with `Edit`**, one targeted replacement per diff bucket. Use `Write` only when the file does not yet exist (initial scaffold). Untouched lines must remain byte-identical.

**Header (mandatory, always at top of every generated file):**

```ts
// AUTO-GENERATED by baluarte-build
// source: <layouts|components>
// uuid: <row uuid>
// content_diff_hash: <row.content_diff_hash>
// Edits will be overwritten on the next build. Edit the SQLite row instead.
```

**Marker recognized for ownership:** the prefix `// AUTO-GENERATED by baluarte-build`.

**Files without the marker:** DO NOT WRITE. Compute the same structured diff in memory and print it under a `Diffs (manual merge required):` block. Surface this in the final summary as `manual-merge` and continue.

### 5. React composition for nested components

When a layout's `layout_registry` references a component, or a parent component's `components_registry` references a child component, the artifact MUST render the child as a JSX element by import, not inline the child's markup:

```tsx
import { Card } from "@/components/Card/Card";
// …
<Card />
```

This keeps each component file self-contained and matches React composition best practices. The import path is always `@/components/<PascalChildName>/<PascalChildName>` (or `@/layouts/…` if ever needed — layouts don't compose into other layouts in practice). The registry's `child_property` (when set, must be Positioning/Spacing) becomes the className applied to the wrapping `<div>` around the child render, or pulled into the parent's `gap-…` / `space-…` className when the parent is a flex/grid container.

If a child component is dirty in the same run, build the child first so its file exists before the parent's import is written.

### 6. States in code vs. stories

A component renders ALL its states (`hover`, `active`, `stale`, `disabled`, `focus`, `clicked`) from one `.tsx` file driven by a `state` prop. The `components_properties` rows give per-state Tailwind tokens; the build composes a state-keyed className record:

```tsx
const STATE_CLASSES: Record<State, string> = {
  stale:    "bg-blte-foundation-obsidian text-blte-text-primary",
  hover:    "bg-blte-foundation-obsidian-80 text-blte-text-primary",
  active:   "bg-blte-accent-primary text-blte-text-inverse",
  disabled: "opacity-blte-50 cursor-not-allowed",
  focus:    "ring-2 ring-blte-accent-primary",
  clicked:  "bg-blte-accent-primary-90 text-blte-text-inverse",
};
```

`STATE_CLASSES[state]` joins with the base className. The default `state` value is `stale` unless the registry explicitly seeds another.

In Storybook, every state with at least one row in `components_properties` for this component becomes its own named export — one story per state, all rendered from the same component:

```tsx
export const Stale: Story    = { args: { state: "stale" } };
export const Hover: Story    = { args: { state: "hover" } };
export const Active: Story   = { args: { state: "active" } };
export const Disabled: Story = { args: { state: "disabled" } };
// …
```

Plus a `Default` export (an alias of the row's "primary" state — `stale` unless overridden by `--prompt`). `component_variants` rows that are NOT state-axes (e.g. size or kind variants) become additional named exports passing those variant args. State and non-state variants compose orthogonally (`HoverLarge`, etc.) only when both axes have multiple registry values; otherwise emit one axis at a time.

### 7. `meta.title` & slugs

- layout → `meta.title = "Layouts/<Name>"`
- component → `meta.title = "Components/<Name>"`

The kebab-case version of `meta.title` is the slug for `url_local` (`http://localhost:6006/?path=/story/<slug>--default`).

### 8. Entity intent handling (`intent_json` + `description`)

Every layout/component row carries two channels of design intent: the **structured `intent_json`** column (a JSON blob with parseable fields) and the **prose `description`** column (the original `/baluarte-design` prompt, verbatim). Precedence: **`intent_json` wins** when a field is present; otherwise fall back to scanning `description` per the vocabulary table.

#### 8.invariant. Two-class taxonomy (NEVER violate)

Every Tailwind class the build emits falls into exactly **one** of two buckets, decided mechanically (no judgment):

| Bucket | Source | Storage | Destination |
|---|---|---|---|
| **Custom design token** | row in `properties` table (Figma Variable or Custom) | `baluarte.tailwind.ts` under the `blte-` namespace + `// @baluarte uuid=…` annotation | className uses `bg-blte-<slug>`, `pt-blte-<n>`, etc. |
| **Ambient utility** | built-in Tailwind class for a stable, browser-level CSS concept (overflow, display, position, sizing, whitespace, truncation, snap, cursor, ring, transition) | **Never** enters `properties` or `baluarte.tailwind.ts` | Goes directly on the component's className string |

**Decision rule, per class:** does the value vary by design system (color shade, spacing scale, brand radius)? If yes → custom token. If no — the class encodes a CSS *behavior* that's the same across every design system (`overflow-x-hidden`, `truncate`, `snap-x`) — ambient utility.

The build NEVER promotes an ambient utility into `properties`, and NEVER asks the user about this — it's hard-coded. See "What NOT to do" at the bottom of this skill for the explicit forbidden action.

#### 8.0. Structured intent (`intent_json`) → concrete output

When `intent_json` is non-NULL, parse it and apply each field:

| `intent_json` field | Build output |
|---|---|
| `scrollable: 'x'` | Add `overflow-x-auto` to the relevant inner-scroll container className (the parent's flex-row child that holds the scrollable list). Layouts with one auto-layout row are the default target. |
| `scrollable: 'y'` | Add `overflow-y-auto` to the relevant inner-scroll container className. |
| `min_width: <N>` | Add `min-w-[Npx]` to the component's root container className. |
| `max_width: <N>` | Add `max-w-[Npx]` to the component's root container className. |
| `interactivity: [...]` (non-empty) | **Auto-emit an `Interactive` Storybook export** — see §6.5. |
| `css_utilities: [...]` (non-empty) | Append each utility verbatim to the className of the scope inferred per §8.5. NEVER register these as `properties` rows — they are ambient (see §8.invariant). |
| `prompt: "..."` | Surface in the JSDoc `@description` line (replaces the description-column path when both exist; otherwise the description prose is used directly). |

When `intent_json` is NULL, the prose-description path (§8.b–d) is the only signal.

#### 8.5. Auto-emit `Interactive` story when `intent_json.interactivity` is non-empty

In `<Name>.stories.tsx`, append one named export `Interactive` that wires real state transitions:

```tsx
import { useState } from 'react';

export const Interactive: Story = {
  render: () => {
    const [state, setState] = useState<<StateType>>('stale');
    return (
      <<Component>
        state={state}
        {/* one handler per intent_json.interactivity entry */}
        onMouseEnter={() => setState('hover')}
        onMouseLeave={() => setState('stale')}
        onClick={() => setState('active')}
        // ...etc, derived from each {event, target_state} pair
      />
    );
  },
};
```

Mapping rules:
- `event: 'click'` → `onClick`
- `event: 'hover'` → `onMouseEnter` (to target_state) + `onMouseLeave` (back to `stale`)
- `event: 'focus'` → `onFocus` + `onBlur`
- Multi-entry intent merges handlers on the same render function.

When the component doesn't already accept event-handler props in its `.tsx`, also patch the prop interface and forward the handlers to the rendered root element. This is one of the few cases where the `.tsx` file is mutated alongside the story — the diff is recorded in the per-tier digest as `interactive: +<events>`.

Static per-state stories (`Stale`, `Hover`, `Active`, etc.) stay alongside `Interactive` — visual regression diffs aren't disturbed.

#### 8.5b. Scope inference for `intent_json.css_utilities`

When applying each utility from `intent_json.css_utilities`, route it to the element by **kind**, not by position. The annotation is prose-only — designers never write `root:` / `scroll:` prefixes. The build uses this table:

| Utility kind | Routed to |
|---|---|
| `overflow-*` / `scroll-*` / `snap-x` / `snap-mandatory` | Inner scroll wrapper if one exists (the flex-row child driven by `intent_json.scrollable`), else root |
| `snap-start` / `snap-center` / `snap-end` | Each rendered child of the scroll wrapper (e.g. each `<Card>` inside a `.map(...)`) |
| `min-w-*` / `max-w-*` / `w-*` / `h-*` / `min-h-*` / `max-h-*` | Root container |
| `rounded-*` / `border-*` / `shadow-*` / `ring-*` | Root container |
| `text-*` / `whitespace-*` / `truncate` / `font-*` / `tracking-*` / `leading-*` | The text-rendering child (`<h1>`/`<h2>`/`<h3>`/`<p>`/`<span>` that holds the prose) when one is identifiable; else root |
| `cursor-*` / `pointer-events-*` | The interactive element (`<button>`/`<a>`) if present; else root |
| `transition-*` / `duration-*` / `ease-*` | Interactive element if present (state-driven animations); else root |
| Anything else | Root container (default) |

Audit each routing decision: `css_utilities: +<class> → <scope>` in the per-tier digest.

#### 8.a. Entity `description` handling — process every segment (REQUIRED)

Replaces the legacy "default to act" rule. The build MUST attempt to map **every prose segment** in `description` to either a structured `intent_json` field or a `css_utilities[]` entry. No segment is silently dropped.

**Step 1 — Parse the prose into segments.** Split `description` on sentence boundaries (`. ` / `! ` / `? ` / blank line) and on `@tag:` line breaks. Each non-empty segment becomes a candidate intent fragment.

**Step 2 — For each segment, attempt mapping with one of three confidence outcomes:**

- **Confidence: high** — segment matches the vocabulary table verbatim or near-verbatim. Apply directly. Audit: `description: +<class>`. When the matched output is a structured field already present in `intent_json` (e.g. segment says "min width 760" and `intent_json.min_width=760`), no-op the segment — it's already covered.

- **Confidence: proposed** — segment is recognizable but multiple utilities plausibly fit (e.g. "scroll cards but clip the overflow" → `overflow-x-hidden` vs `overflow-x-clip` vs `snap-x snap-mandatory`). **Use `AskUserQuestion` inline.** Provide the recommended utility as the first option (with `(Recommended)` suffix on the label) plus 2–3 plausible alternatives. The chosen utility is appended to `intent_json.css_utilities[]`. Audit: `description: +<class> (resolved via clarification)`.

- **Confidence: low** — segment is genuinely ambiguous or off-domain (e.g. "make this feel premium", "match the marketing site"). **Use `AskUserQuestion` inline** with options framed as "describe the CSS behavior plainly" — accept free-form prose via the Other option, then re-attempt mapping on the new prose. If still unresolved, persist a `notes` entry on the entity and skip the segment. Audit: `description: skip — <reason>` and surface to the user in the per-tier digest.

**Step 3 — Vocabulary table** (mappings the build applies at confidence-high; extend over time):

| Description vocabulary | Tailwind utility | Notes |
|---|---|---|
| "should not be full width" / "fits its content" / "shrinks to content" | `w-fit` *or* swap `flex` → `inline-flex` | Block-level flex still fills cross-axis; needs explicit class. |
| "should fill" / "span the full width" | `w-full` | |
| "max width N" / "no wider than N" | `max-w-[Npx]` | Arbitrary-value syntax for off-scale numbers. |
| "min width N" | `min-w-[Npx]` | |
| "max height N" / "at most N tall" | `max-h-[Npx]` | |
| "min height N" / "at least N tall" | `min-h-[Npx]` | |
| "fixed width N" / "exactly N wide" | `w-[Npx]` | |
| "centered text" / "horizontally centered" | `text-center` | |
| "right-aligned" | `text-right` | |
| "should be inline" / "shouldn't break" | `inline-block` / `whitespace-nowrap` | |
| "truncate" / "ellipsis on overflow" | `truncate` | |
| "wraps to multiple lines" | `whitespace-normal` | |
| "circular" / "fully rounded" | `rounded-full` | |
| "fixed at top" / "sticky" | `fixed top-0` / `sticky top-0` | |
| "hide overflow" / "clip overflow" / "hidden when overflowed" / "no scrollbar" | `overflow-hidden` (or `overflow-x-hidden` / `overflow-y-hidden` when axis is implied) | Ambient — never registered. |
| "scroll snap" / "snap to items" / "carousel-style" | `snap-x snap-mandatory` on parent + `snap-start` on each child | Ambient. Routes via §8.5b. |
| "no wrap" / "single line" / "shouldn't break across lines" | `whitespace-nowrap` | Ambient. |
| "rotate <N> degrees" | `rotate-[<N>deg]` | Arbitrary-value syntax. |
| "transitions smoothly" / "animate property changes" | `transition-all duration-150` | Ambient. |
| "no pointer cursor" / "disabled cursor" / "not clickable" | `cursor-not-allowed` | Ambient. |
| "no interaction" / "ignore clicks" | `pointer-events-none` | Ambient. |

For description vocabulary not in the table, propose a utility that honors the intent (Confidence: proposed). Use arbitrary-value brackets for off-scale numbers. **Description-derived classes are never registered in `baluarte.tailwind.ts` — they are ambient per §8.invariant.**

**Step 4 — Persist the resolved utilities and write back to Figma.**

After the inference loop finishes for an entity:

1. **Persist to DB.** Call `baluarte-remember` to `update_component` (or `update_layout`) with the new `:intent_json` containing the merged `css_utilities` array. The composite `content_diff_hash` already includes the canonical intent string, so the hash is bumped automatically when this round-trip is complete.

2. **Write back to the Figma annotation.** Use `figma_write_evaluate_script` to update the `@baluarte intent:` annotation label so it carries a `@css: cls1, cls2, cls3` line. The Figma annotation becomes the canonical source — the next `/baluarte-analyze` run reads `@css:` directly, the build sees `css_utilities` already populated, and re-runs are byte-level no-ops. Example write:

   ```js
   const node = await figma.getNodeByIdAsync('<node-id>');
   const ann = (node.annotations || []).find(a => (a.label || '').startsWith('@baluarte intent:'));
   if (ann) {
     const lines = ann.label.split('\n').filter(l => !l.startsWith('@css:'));
     lines.push(`@css: ${classes.join(', ')}`);
     const others = (node.annotations || []).filter(a => a !== ann);
     node.annotations = [...others, { label: lines.join('\n'), properties: [] }];
   }
   ```

   This is the **only** Figma write the build skill is permitted to make. It does not modify the design, only the metadata annotation.

**Step 5 — Audit line on every entity with a non-NULL description** in the per-tier digest:

- `description: +<class>` — added a description-derived class (Confidence: high).
- `description: +<class> (resolved via clarification)` — Confidence: proposed, user-resolved.
- `description: skip — <reason>` — Confidence: low and unresolved; persisted to `notes`.
- `description: warn — registry has <X> but description says <Y>` — registry wins, contradiction surfaced.
- `description: warn — prose says <X>, @css says <Y>; using @css` — explicit `@css:` overrides inferred prose.
- `description: noop — already covered by intent_json.<field>` — segment matched a structured field that was already set.

#### 8.b. Designer override + idempotency

- When `intent_json.css_utilities` is already populated AND the prose hasn't changed since last extraction, **skip the inference loop entirely** — apply the persisted utilities verbatim.
- A designer who knows what they want can edit the Figma annotation directly and add `@css: overflow-hidden, scroll-smooth`. `baluarte-analyze` §6.5 drains that into `intent_json.css_utilities` on the next sync. Build respects designer-authored utilities without re-asking.
- **Legacy "Default to act" rule:** when an entity has `description` text but `intent_json` is NULL (legacy rows from the old pipeline), still run the per-segment loop above with no structured-field shortcuts — every prose segment goes through Confidence-high / proposed / low.

#### 8.legacy. Legacy prose-only path (transitional)

When `description` is non-NULL AND `intent_json` is NULL (or missing the relevant field):

**(a) Emit a JSDoc on the generated component function** between the AUTO-GENERATED header and the export:

```ts
/**
 * <PascalName>
 *
 * @description <text from row.description>
 *
 * @baluarte uuid <row uuid>
 */
export function <PascalName>(…) { … }
```

**(b) Default to acting on the description, not skipping it.** The registry's `*_properties` rows capture what Figma's design tokens can express; descriptions are the channel for intent the registry can't (sizing constraints, layout behavior, semantic role, interactive behavior). Default behavior is **to act** — convert intent into concrete className tokens or interactive story patterns. Skip only when the description is unambiguously narrative (business context, audience).

**(c) Vocabulary → Tailwind utility mapping:**

| Description vocabulary | Tailwind utility | Notes |
|---|---|---|
| "should not be full width" / "fits its content" / "shrinks to content" | `w-fit` *or* swap `flex` → `inline-flex` | Block-level flex still fills cross-axis; needs explicit class. |
| "should fill" / "span the full width" | `w-full` | |
| "max width N" / "no wider than N" | `max-w-[Npx]` | Arbitrary-value syntax for off-scale numbers. |
| "min width N" | `min-w-[Npx]` | |
| "max height N" / "at most N tall" | `max-h-[Npx]` | |
| "min height N" / "at least N tall" | `min-h-[Npx]` | |
| "fixed width N" / "exactly N wide" | `w-[Npx]` | |
| "centered text" / "horizontally centered" | `text-center` | |
| "right-aligned" | `text-right` | |
| "should be inline" / "shouldn't break" | `inline-block` / `whitespace-nowrap` | |
| "truncate" / "ellipsis on overflow" | `truncate` | |
| "wraps to multiple lines" | `whitespace-normal` | |
| "circular" / "fully rounded" | `rounded-full` | |
| "fixed at top" / "sticky" | `fixed top-0` / `sticky top-0` | |

For description vocabulary not in the table, propose a utility that honors the intent. Use arbitrary-value brackets for off-scale numbers. Description-derived classes are **not** registered in `baluarte.tailwind.ts` — they are per-entity escape hatches.

**(d) Audit line on every entity with a non-NULL description** in the per-tier digest:

- `description: +<class>` — added a description-derived class.
- `description: warn — registry has <X> but description says <Y>` — registry wins, contradiction surfaced.
- `description: noop — <one-line reason>` — only allowed for unambiguously narrative descriptions.
- `description: layout suppressed rounded-blte-<n> (no description override)` — fired by §10 when the constant filters a token.
- `description: warn — constant min-h-screen overrides description "<text>"` — fired by §10.

When the description suggests Storybook behavior ("change active state via useState"), update `.stories.tsx` with an interactive story export and audit it the same way.

### 9. Maintain `baluarte-app/baluarte.tailwind.ts`

Whenever `--scope` includes `properties` (or is `all`), regenerate the Tailwind theme whole. This is the **only** file the skill rewrites wholesale.

- Header: `// AUTO-GENERATED by baluarte-build — do not hand-edit. Source: SQLite properties.`
- Single export `export const baluarteTheme = { … } as const;` with buckets: `colors`, `spacing`, `borderRadius`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `boxShadow`, `_other`.
- **Every theme key carries the `blte-` namespace prefix** (e.g. `colors['blte-foundation-obsidian']`, `spacing['blte-10']`). Tailwind built-in utilities (`flex flex-row`, `justify-center`, etc.) are NOT prefixed.
- Every entry annotated with `// @baluarte uuid=<property uuid>` for traceability.

**Before emitting**, verify `properties.tailwind_class` uniqueness across the whole table. Collisions are a hard error — surface and stop. When proposing class names from a NULL `tailwind_class`, check existing claims and disambiguate by reincorporating a parent path segment.

Role mapping (derived from the second segment of `properties.name`):

| Role pattern | Tailwind prefix | Bucket |
|---|---|---|
| `Color-bg-…` | `bg-blte-<slug>` | `colors` |
| `Color-text-…` | `text-blte-<slug>` | `colors` |
| `Color-fill-…` | `fill-blte-<slug>` | `colors` |
| `Color-stroke-…` | `border-blte-<slug>` | `colors` |
| `Border-radius-<n>` | `rounded-blte-<n>` | `borderRadius` |
| `Border-width-<n>` | `border-blte-<n>` | `borderWidth` |
| `Spacing-pad-{top,bottom,left,right}-<n>` | `pt-/pb-/pl-/pr-blte-<n>` | `spacing` |
| `Spacing-gap-<n>` | `gap-blte-<n>` | `spacing` |
| `Flex-row` / `Flex-column` | `flex flex-row` / `flex flex-col` | — (built-in) |
| `Flex-justify-<v>` / `Flex-items-<v>` | `justify-<v>` / `items-<v>` | — (built-in) |
| `Typography-…` | `font-blte-<slug>` + `text-blte-<slug>` + `leading-blte-<slug>` + `tracking-blte-<slug>` | composite |
| `Shadow-…` | `shadow-blte-<slug>` | `boxShadow` |
| `Opacity-<n>` | `opacity-blte-<n>` | `opacity` |

When a property's name changes here, step 3's dependency graph ensures every dependent artifact picks up the matching className substitution in the same run.

### 10. Tier-level constant rules

These are invariants applied on top of registry-derived composition, before description-derived classes are reconciled.

**Layout component className (`src/layouts/<Name>/<Name>.tsx`):**

- **Always prepend `min-h-screen`** to the root container's className. If the description contradicts this, surface a warn line.
- **Filter every `rounded-*` token** out of the root className UNLESS the description matches `/\brounded\b|\bcorner radius\b|\bborder radius\b/i`. When suppression triggers, audit it.

**Layout `.stories.tsx`:**

- `parameters: { layout: 'fullscreen' }` on meta.
- A `decorators` array on meta with one decorator wrapping the story in a viewport-filling div:

  ```tsx
  decorators: [
    (Story) => (
      <div className="min-h-screen w-screen m-0 p-0">
        <Story />
      </div>
    ),
  ],
  ```

**Component `.stories.tsx`:**

- `parameters: { layout: 'centered' }` on meta.
- A `decorators` array on meta with one decorator flex-centering the story:

  ```tsx
  decorators: [
    (Story) => (
      <div className="flex min-h-screen w-screen items-center justify-center">
        <Story />
      </div>
    ),
  ],
  ```

These decorators are **identical for every entity within a tier**.

### 11. Record the artifact via `baluarte-remember`

Once per layout/component that was just `created` or `updated`:

- **If the entity already had a `storybook_id`:** call `update_storybook` with `:uuid=<existing>`, `:name=<PascalName>`, `:url_local='http://localhost:6006/?path=/story/<kebab(meta.title)>--default'`, `:url_prod=NULL`, `:src_ref='<repo-relative path>'`.
- **Else:** call `insert_storybook` (returns new uuid), then `update_<layout|component>` with `:uuid=<entity uuid>`, `:storybook_id=<new uuid>`, every other column NULL (COALESCE preserves the rest).

Properties get no `storybook` row.

## Outputs

A run prints, in order:

1. The **Plan** block (per step 3) listing the dirty set with trigger reasons (`hash_changed`, `property_<uuid>_changed`, `child_<uuid>_dirty`, `created`).
2. Manual-merge diffs (if any) under `Diffs (manual merge required):`.
3. The **Per-tier summary** table:

```
Layouts    | <name>   | <action>      | <abs path>  | <delta digest>
Components | <name>   | <action>      | <abs path>  | <delta digest>
Properties: baluarte.tailwind.ts: <N> entries (<M> changed)   |   or   "unchanged"
```

`<action>` ∈ `created` | `updated` | `unchanged` | `manual-merge`.

## Prerequisites

- `baluarte-app/` bootstrapped (Storybook, Vite, Tailwind v4, `baluarte.tailwind.ts` present).
- `.data/baluarte.db` populated by `/baluarte-analyze`.
- `baluarte-remember` skill available.

## Invariants

- **No direct DB access.** Every read/write of `.data/baluarte.db` flows through a `Skill` call to `baluarte-remember`.
- **No Figma access.** All inputs come from the registry; if data is missing, fail fast with "re-run /baluarte-analyze".
- **AUTO-GENERATED header on every write.**
- **Component artifacts are patched, not rewritten.** Clean re-run = byte-level no-op.
- **`baluarte.tailwind.ts` is the only file regenerated whole.**
- **One file per component; one story per state.** Never split a component across files.
- **React composition for nested components.** Always import + render `<ChildName />`; never inline the child's markup.
- **Property changes propagate** through `*_properties` and `*_registry` in the same run.
- **Idempotent storybook linkage.** Existing `storybook_id` values are reused via `update_storybook`.
- **Never touches files outside `baluarte-app/`** (other than invoking `baluarte-remember`).

## What NOT to do

- ❌ Run `sqlite3` from `Bash`. Every DB op is a `Skill` call to `baluarte-remember`.
- ❌ Add a new build sub-skill. One unified entry point.
- ❌ Cascade into other baluarte-* skills besides `baluarte-remember`.
- ❌ Auto-launch `npm run storybook`. Ask the user first.
- ❌ Wholesale `Write` an existing component when a targeted `Edit` covers the diff.
- ❌ Overwrite a file that lacks the AUTO-GENERATED marker. Print the diff, let the user merge.
- ❌ Inline a child component's markup in a parent's `.tsx`. Always import + render the child as JSX.
- ❌ **Insert a row into `properties` for a class that exists as a built-in Tailwind utility.** Ambient utilities (`overflow-*`, `truncate`, `snap-x`, `cursor-*`, `pointer-events-*`, etc.) NEVER enter `properties` or `baluarte.tailwind.ts`. They go on the component's className string only, sourced from `intent_json.css_utilities[]` or the §8.a vocabulary table. See §8.invariant for the decision rule.
- ❌ Drop an annotation segment silently. Every prose segment in `description` is either applied (Confidence: high), resolved via `AskUserQuestion` (Confidence: proposed/low), or audited with `description: skip — <reason>`. No silent waste.
