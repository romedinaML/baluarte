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

### 8. Entity `description` handling

Every layout/component row carries an optional `description` column. When non-NULL:

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
