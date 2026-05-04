---
name: baluarte-build
description: Generate and incrementally patch Storybook artifacts (component/layout files + stories) and the Tailwind theme inside `baluarte-app/` from the registry. Reads the registry exclusively via `baluarte-remember`, never the DB directly. Computes a property/parent dependency graph, writes only the minimum delta per entity, and records each `storybook` row + entity `storybook_id` linkage back through `baluarte-remember`.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
---

# baluarte-build

Generates the React + Storybook artifacts inside `baluarte-app/` from rows the `baluarte-fetch-entities` MCP wrote into `.data/baluarte.db`. **Never touches the DB directly** — every read and every write goes through the `baluarte-remember` skill.

The skill is **incremental by design.** Re-running it after a Figma change applies the *minimum delta* between the registry and the on-disk artifact. A property value or name change is propagated to every entity that references the property (via `atoms_properties`, `molecules_properties`, `layout_properties`, plus the `*_registry` tables for parent/child fan-out) without churning unrelated parts of the file. Whole-file rewrites are not acceptable. The single exception is `baluarte-app/baluarte.tailwind.ts`, which is a pure projection of `properties` and is regenerated whole.

After every per-entity write, the skill calls `baluarte-remember` to upsert a `storybook` row (`name`, `url_local`, `src_ref`) and to set `storybook_id` on the originating layout/molecule/atom. That closes the loop so future runs are idempotent.

## When to use

- After `baluarte-analyze` has populated layouts/molecules/atoms/properties and you want code in `baluarte-app/`.
- After re-syncing a Figma file: re-running `/baluarte-build` rewrites only the affected artifacts.

## When NOT to use

- Reading or writing `.data/baluarte.db` directly → `baluarte-remember`.
- Pulling new entities out of Figma → `baluarte-analyze`.
- Hand-crafted artifacts that should not be overwritten → keep them outside `src/layouts/`, `src/molecules/`, `src/atoms/`, or move them to `stories/`.

## Inputs

| Argument | Required | Type | Description |
|---|---|---|---|
| `--scope` | no | `all\|layouts\|molecules\|atoms\|properties` | Tier(s) to build. Default `all`. When a non-`all` scope is selected, the skill still pulls `properties` if the dirty set requires className substitutions. |
| `--name <name>` | no | string | Limit to entities whose `name` matches exactly. |
| `--uuid <uuid>` | no | string | Limit to a single registry row. Mutually exclusive with `--name`. |
| `--prompt "<text>"` | no | string | Free-form guidance — naming overrides, render hints, etc. Surfaced verbatim to the user when ambiguous. |

If neither `--name` nor `--uuid` is given, build everything in scope.

## Procedure

For every invocation:

### 1. Verify the playground

The following must exist:
- `baluarte-app/package.json`
- `baluarte-app/.storybook/main.ts`
- `baluarte-app/baluarte.tailwind.ts`
- `baluarte-app/tailwind.config.ts`

If any is missing, fail fast with a copy-pasteable bootstrap suggestion (`cd baluarte-app && npm install`) and stop. Do not attempt to scaffold.

### 2. Fetch the registry through `baluarte-remember`

**This step is a `Skill` tool call with `skill=baluarte-remember`. Never run `sqlite3` from bash, never `.read queries/*.sql` from this skill, never use `node:sqlite`. The whole point of `baluarte-remember` as a boundary is undone the moment another skill inlines its protocol.**

Hand `baluarte-remember` a request that names the operations and bound parameters; let it execute the query cache and return the rows. Per scope tier:

- **layouts** → `select_layouts_all`, then for each row: `list_layout_registry_by_layout`, `list_layout_properties_by_layout`, and `select_figma_node_for_reference` with `:reference_type='layout'`.
- **molecules** → `select_molecules_all`, then per row: `list_molecule_variants_by_molecule`, `list_molecules_properties_by_molecule`, `list_molecules_registry_by_molecule`.
- **atoms** → `select_atoms_all`, then per row: `list_atom_variants_by_atom`, `list_atoms_properties_by_atom`.
- **properties** → `select_properties_all`.

For every layout/molecule/atom, also pull the row's current `storybook_id` via `select_<entity>_by_uuid` so the skill can decide insert-vs-update on the storybook side.

### 3. Build the dependency graph & dirty set (REQUIRED before any write)

- **Property → entity index** from the union of `atoms_properties`, `molecules_properties`, `layout_properties`. Each row maps a `property_id` to an entity uuid (with optional `state_id`).
- **Parent → child index** from `layout_registry` and `molecules_registry` so a dirty atom transitively marks its parent molecule(s) + layout(s).

**Dirty rules:**

- A registry row is dirty when its on-disk artifact's header `content_diff_hash` does not match the row's current `content_diff_hash`. A registry row with no on-disk artifact is also dirty (will be `created`).
- A property is dirty when its registry row no longer matches the entry currently emitted in `baluarte.tailwind.ts` (compared by the `// @baluarte uuid=…` annotation + the value). A property registered with no annotation in the file is also dirty.
- If a property is dirty, every entity that references it (via `*_properties`) is dirty even when the entity's own hash is unchanged — class names and CSS values may need substituting.
- Dirty propagates **upward**: a dirty atom marks its parent molecule(s) dirty (via `molecules_registry`); a dirty molecule marks its parent layout(s) dirty (via `layout_registry`). It does NOT propagate downward — a parent rerender doesn't force its children.

Emit the dirty set as a **Plan** block to the user before any write:

```
Plan
────
Properties: 5 dirty (1 renamed, 4 value-only)
Atoms:      2 dirty (nav-button → property navbar-button-active changed; age-pill → hash_changed)
Molecules:  1 dirty (nav-bar → child nav-button dirty)
Layouts:    0 dirty
```

### 4. Compute and apply the minimum delta per dirty entity

Decide the artifact path by tier:
- layout → `baluarte-app/src/layouts/<PascalName>/<PascalName>.tsx` (+ `.stories.tsx`)
- molecule → `baluarte-app/src/molecules/<PascalName>/<PascalName>.tsx` (+ `.stories.tsx`)
- atom → `baluarte-app/src/atoms/<PascalName>/<PascalName>.tsx` (+ `.stories.tsx`)

For each dirty entity:

1. **Parse the existing artifact (if any)** into a structured representation: header fields (`source`, `uuid`, `content_diff_hash`), prop signature, root `className` token list, variant story exports, `meta.title`, `src_ref`.
2. **Compute the desired representation** from the registry rows. Compose Tailwind class strings from the joined `properties.tailwind_class` values keyed by state; children render via `*_registry`. Variant rows (`atom_variants` / `molecule_variants`) drive an additional named export per row in the corresponding `.stories.tsx`.
3. **Diff at the field level** — never at the whole-file level. The diff buckets are:
   - `header.content_diff_hash` updated.
   - `className` tokens whose underlying property uuid was renamed → substitute the new token only on the affected lines.
   - Property uuids removed from the entity's `*_properties` link table → remove the corresponding tokens.
   - Property uuids added to the entity's `*_properties` link table → splice the new tokens into the existing className string in canonical (alphabetical) order.
   - Variant story exports added in the registry → append the export.
   - Variant story exports removed in the registry → remove them.
   - Prop-signature changes (a new `state` enum value, etc.) → patch the `interface` + `args` defaults in place.
4. **Apply substitutions surgically with `Edit`**, one targeted replacement per diff bucket. Use `Write` only when the file does not yet exist (initial scaffold). Untouched lines must remain byte-identical.

**Header (mandatory, always at top of every generated file):**

```ts
// AUTO-GENERATED by baluarte-build
// source: <layouts|molecules|atoms>
// uuid: <row uuid>
// content_diff_hash: <row.content_diff_hash>
// Edits will be overwritten on the next build. Edit the SQLite row instead.
```

**Marker recognized for ownership:** the prefix `// AUTO-GENERATED by baluarte-build` (matches both new files this skill writes and the legacy `baluarte-build-component` headers on the existing NavBar pair).

**Files without the marker:** DO NOT WRITE. Compute the same structured diff in memory and print it under a `Diffs (manual merge required):` block. Surface this in the final summary as `manual-merge` and continue with the rest of the dirty set.

**Entity `description` handling.** Every layout/molecule/atom row carries an optional `description` column populated by the MCP from a Figma comment's `--description="…"` flag. When non-NULL, `baluarte-build` MUST do all four of:

**1. Emit a JSDoc on the generated component function** (always, regardless of CSS implication). Between the AUTO-GENERATED header and the export:

```ts
/**
 * <PascalName>
 *
 * @description <text from properties.description>
 *
 * @baluarte uuid <row uuid>
 */
export function <PascalName>(…) { … }
```

The `@description` line is the verbatim string. The JSDoc updates whenever the registry's description changes (a comment edit in Figma → `applyLatestReply` bumps the entity's `edited_at` → the entity is dirty → JSDoc is patched).

**2. Default to acting on the description, not skipping it.** The registry's `*_properties` rows capture what Figma's design tokens can express; descriptions are the channel for intent the registry can't (sizing constraints, layout behavior, semantic role, interactive behavior). The default behavior is **to act** — convert the description's intent into concrete className tokens or interactive story patterns. Skipping is only acceptable when the description is unambiguously narrative (business context, audience, "the primary CTA on the home page"). Phrases like "should be / shouldn't be / must / should not / no wider / fits / fills / centered / sized / wrapped / inline / block / fixed / sticky / max / min / takes up / spans / shrinks / grows / wraps / truncates" all default to *act*, not skip.

> *Tier-level constants (§6.5) take precedence over description hints when they conflict. A description suggesting "no min-height" on a layout still loses to the constant `min-h-screen`; surface that as a `warn` audit line.*

**3. Vocabulary → Tailwind utility mapping (extend as new descriptions arrive):**

| Description vocabulary | Tailwind utility | Notes |
|---|---|---|
| "should not be full width" / "fits its content" / "shrinks to content" / "width determined by children" / "intrinsic width" | `w-fit` *or* swap `flex` → `inline-flex` | Block-level flex containers still fill the cross-axis; this needs an explicit class. |
| "should fill" / "span the full width" / "takes up the full width" | `w-full` | |
| "max width N" / "no wider than N" / "capped at N" | `max-w-[Npx]` | Arbitrary-value syntax for off-scale numbers. |
| "min width N" | `min-w-[Npx]` | |
| "max height N" / "at most N tall" | `max-h-[Npx]` | |
| "min height N" / "at least N tall" | `min-h-[Npx]` | |
| "fixed width N" / "exactly N wide" | `w-[Npx]` | |
| "centered text" / "horizontally centered" | `text-center` | |
| "right-aligned" | `text-right` | |
| "should be inline" / "shouldn't break / wrap" | `inline-block` / `whitespace-nowrap` | |
| "truncate" / "ellipsis on overflow" | `truncate` | |
| "wraps to multiple lines" | `whitespace-normal` (or remove `whitespace-nowrap`) | |
| "circular" / "fully rounded" | `rounded-full` | |
| "fixed at top" / "sticky" | `fixed top-0` / `sticky top-0` | |

For description vocabulary not in the table, propose a Tailwind utility that honors the intent. Use arbitrary-value brackets (`max-w-[300px]`, `mt-[7px]`) for off-scale numbers. Description-derived classes are **not** registered in `baluarte.tailwind.ts` — they are per-component escape hatches that go on the `className` line after the registry-derived tokens.

**4. Reconcile against the registry, then emit a `description:` audit line on every entity with a non-NULL description.** Mandatory — silent skips are a bug. Three valid forms in the per-tier summary digest:

- `description: +<class>` — added a description-derived class. May list multiple: `description: +w-fit +max-w-[300px]`.
- `description: warn — registry has <X> but description says <Y>` — registry wins, but the contradiction is surfaced.
- `description: noop — <one-line reason>` — explicitly chose not to add a class. Allowed only when the description is unambiguously narrative. The reason must name *what* about the description was non-actionable (e.g., `noop — pure business context: "primary CTA on the home page"`). "Already implicit in flex layout" is NOT an acceptable reason — if the user wrote a CSS constraint, emit the explicit class.
- `description: layout suppressed rounded-blte-<n> (no description override)` — fired by §6.5 when rule 2 filters a registry-derived rounded token from a layout.
- `description: warn — constant min-h-screen overrides description "<text>"` — fired by §6.5 when the constant `min-h-screen` conflicts with a description-derived min-height.

When the description suggests Storybook behavior ("change active state via useState", "trigger an action on click"), update the entity's `.stories.tsx` with a corresponding interactive story export in addition to the component-side handling. Audit it the same way: `description: +Interactive story (useState + fn() action)`.

### 5. Variants in stories

Every `.stories.tsx` exports:

- `Default` — args derived from the parent atom/molecule row's properties.
- One named export per row in `atom_variants` / `molecule_variants`. Export name is PascalCase from the variant's `variant` column (or `name` when `variant` is null), parameterized to drive the variant rendering.
- Layouts have no variant table — `layouts.type` already gives device variants (`Mobile`/`Desktop`/`All`) as separate `layouts` rows. Each device row gets its own component file and a single `Default` story.

`meta.title` (tier-prefixed):
- layout → `Layouts/<Name>`
- molecule → `Molecules/<Name>`
- atom → `Atoms/<Name>`

The kebab-case version of `meta.title` is the slug for `url_local`.

### 6. Maintain `baluarte-app/baluarte.tailwind.ts`

Whenever `--scope` includes `properties` (or is `all`), regenerate the Tailwind theme as a whole. This is the **only** file the skill rewrites wholesale — `properties` has no hand-edit semantics.

- Header: `// AUTO-GENERATED by baluarte-build — do not hand-edit. Source: SQLite properties.`
- Single export `export const baluarteTheme = { … } as const;` with the existing bucket shape: `colors`, `spacing`, `borderRadius`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `boxShadow`, `_other`.
- **Every theme key carries the `blte-` namespace prefix** (e.g. `colors['blte-foundation-obsidian']`, `spacing['blte-10']`, `borderRadius['blte-30']`). The resulting Tailwind classes (`bg-blte-foundation-obsidian`, `pt-blte-10`, `rounded-blte-30`) cannot collide with the built-in Tailwind palette / spacing scale / radius / shadow names. Tailwind built-in utilities like `flex flex-row` are NOT prefixed — they're not theme entries.
- Every entry annotated with `// @baluarte uuid=<property uuid>` so the row stays traceable.

**Before emitting**, verify `properties.tailwind_class` uniqueness across the whole table. Two property rows resolving to the same class is a hard error — surface the conflict and stop. When proposing class names from a NULL `tailwind_class`, the proposer must check the existing set and disambiguate by re-incorporating a parent path segment (e.g. `Text/Primary` → `text-blte-text-primary`, not `text-blte-primary`, when `Surfaces/Primary` already claimed the leaf).

Tailwind utility prefix is **role-aware** — derived from the role token baked into `properties.name` by the MCP extractor. The role appears as the second segment of the name (e.g. `Color-bg-…`, `Color-text-…`, `Color-fill-…`, `Color-stroke-…`, `Border-radius-…`, `Border-width-…`, `Spacing-pad-top-…`, `Spacing-gap-…`, `Flex-justify-…`, `Flex-items-…`, `Flex-row`/`Flex-column`, `Typography-…`, `Shadow-…`, `Opacity-…`).

| Role pattern in `properties.name` | Tailwind prefix | Theme bucket |
|---|---|---|
| `Color-bg-…` | `bg-blte-<slug>` | `colors` |
| `Color-text-…` | `text-blte-<slug>` | `colors` |
| `Color-fill-…` | `fill-blte-<slug>` | `colors` |
| `Color-stroke-…` | `border-blte-<slug>` | `colors` (Tailwind borrows from `colors` for `border-*`) |
| `Border-radius-<n>` | `rounded-blte-<n>` | `borderRadius` |
| `Border-width-<n>` | `border-blte-<n>` (width) | `borderWidth` |
| `Spacing-pad-top-<n>` | `pt-blte-<n>` | `spacing` |
| `Spacing-pad-bottom-<n>` | `pb-blte-<n>` | `spacing` |
| `Spacing-pad-left-<n>` | `pl-blte-<n>` | `spacing` |
| `Spacing-pad-right-<n>` | `pr-blte-<n>` | `spacing` |
| `Spacing-gap-<n>` | `gap-blte-<n>` | `spacing` |
| `Flex-row` / `Flex-column` | `flex flex-row` / `flex flex-col` | — (Tailwind built-in) |
| `Flex-justify-<v>` | `justify-<v>` | — (Tailwind built-in) |
| `Flex-items-<v>` | `items-<v>` | — (Tailwind built-in) |
| `Typography-…` | composes multiple: `font-blte-<slug>` (family) + `text-blte-<slug>` (size) + `leading-blte-<slug>` (lineHeight) + `tracking-blte-<slug>` (letterSpacing) + `font-blte-<slug>` (weight, via `fontWeight`) | `fontFamily` / `fontSize` / `lineHeight` / `letterSpacing` / `fontWeight` |
| `Shadow-…` | `shadow-blte-<slug>` | `boxShadow` |
| `Opacity-<n>` | `opacity-blte-<n>` | `opacity` |

The `flex flex-row`, `justify-*`, and `items-*` rows do not register theme entries — they rely on Tailwind's built-in scale. Custom registered keys always carry the `blte-` prefix.

When a property's name changes here, the dependency graph from step 3 ensures every component artifact gets the matching className substitution in step 4 — same run, no follow-up command needed.

### 6.5 Tier-level constant rules

These rules are **invariants** that apply to every build, on top of the registry-derived className composition and before description-derived class additions are reconciled. The registry is still the source of truth for tokens that ARE emitted; these constants govern which registry tokens are projected to the artifact and which scaffolding the stories file gets.

**Layout component className (`src/layouts/<Name>/<Name>.tsx`):**

- **Always prepend `min-h-screen`** to the root container's className. Constant — even if the description hints at a different min-height. If a contradiction exists, surface a one-line `description: warn — constant min-h-screen overrides description "<text>"` in the per-tier digest.
- **Filter every `rounded-blte-*` (or any `rounded-*`) token** out of the className UNLESS the entity's `description` matches `/\brounded\b|\bcorner radius\b|\bborder radius\b/i` (case-insensitive substring on those phrases). When suppression triggers, emit an audit line: `description: layout suppressed rounded-blte-<n> (no description override)`. The `Border-radius-*` row in `layout_properties` stays in the registry — only the *render* drops it. When the description does match, retain the class and emit `description: rounded retained per description override`.

**Layout `.stories.tsx`:**

- Always include `parameters: { layout: 'fullscreen' }` on the meta object.
- Always include a `decorators` array on the meta with a single decorator that wraps the story in a div whose className resets Storybook's default canvas padding/margin and ensures the layout fills the viewport:

  ```tsx
  decorators: [
    (Story) => (
      <div className="min-h-screen w-screen m-0 p-0">
        <Story />
      </div>
    ),
  ],
  ```

**Atom + molecule `.stories.tsx`:**

- Always include `parameters: { layout: 'centered' }` on the meta object.
- Always include a `decorators` array on the meta with a single decorator that flex-centers the story in a viewport-sized wrapper:

  ```tsx
  decorators: [
    (Story) => (
      <div className="flex min-h-screen w-screen items-center justify-center">
        <Story />
      </div>
    ),
  ],
  ```

These decorators are **identical for every entity within a tier** — every layout's `.stories.tsx` carries the same fullscreen decorator, every atom's and every molecule's `.stories.tsx` carries the same centered decorator.

### 7. Record the artifact via `baluarte-remember`

Once per layout/molecule/atom that was just `created` or `updated`:

- **If the entity already had a `storybook_id`:** call `update_storybook` via `baluarte-remember` with:
  - `:uuid=<existing storybook_id>`
  - `:name=<PascalName>`
  - `:url_local='http://localhost:6006/?path=/story/<kebab(meta.title)>--default'`
  - `:url_prod=NULL`
  - `:src_ref='<repo-relative path to .stories.tsx>'`
- **Else:** call `insert_storybook` (returns a new uuid), then `update_<layout|molecule|atom>` with `:uuid=<entity uuid>`, `:storybook_id=<new uuid>`, every other column NULL (the COALESCE pattern preserves the rest).

Properties get no `storybook` row — the Tailwind theme is not a story.

## Outputs

A run prints, in order:

1. The **Plan** block (per step 3) listing the dirty set with the trigger reason for each row (`hash_changed`, `property_<uuid>_changed`, `child_<uuid>_dirty`, `created`).
2. Manual-merge diffs (if any) under `Diffs (manual merge required):`.
3. The **Per-tier summary** table:

```
Layouts    | <name>      | <action>      | <abs path>           | <delta digest>
Molecules  | <name>      | <action>      | <abs path>           | <delta digest>
Atoms      | <name>      | <action>      | <abs path>           | <delta digest>
Properties: baluarte.tailwind.ts: <N> entries (<M> changed)   |   or   "unchanged"
```

`<action>` is one of `created` | `updated` | `unchanged` | `manual-merge`. The `<delta digest>` is one short line per `updated` row (e.g. `className tokens: 2 swapped`, `variants: +Active`, `prop signature: +state`, `header only`).

## Prerequisites

- `baluarte-app/` bootstrapped (Storybook, Vite, Tailwind v4, `baluarte.tailwind.ts` present).
- `.data/baluarte.db` populated by `/baluarte-analyze`.
- `baluarte-remember` skill available.

## Invariants

- **No direct DB access.** Every read and write of `.data/baluarte.db` flows through a `Skill` tool call to `baluarte-remember`. The `Bash` tool must NOT run `sqlite3` from this skill, `.read queries/*.sql` is off-limits here, and `node:sqlite` is forbidden. No `mcp__baluarte-tools__*` either.
- **No Figma access.** All inputs come from the registry; if data is missing, fail fast with a suggestion to re-run `/baluarte-analyze`.
- **AUTO-GENERATED header on every write.** Hand edits in those files will be overwritten on the next build — the SQLite row is the source of truth.
- **Component artifacts are patched, not rewritten.** A clean re-run with no registry changes is a byte-level no-op on every `.tsx` file the skill owns.
- **`baluarte.tailwind.ts` is the only file regenerated whole.**
- **Story-per-entity, variants-as-named-exports.** Never split variants across multiple `.stories.tsx` files.
- **Property changes propagate.** A renamed `properties.tailwind_class` updates every dependent component in the same run via the `*_properties` graph.
- **Idempotent storybook linkage.** Re-running the skill never creates orphan `storybook` rows — existing `storybook_id` values are reused via `update_storybook`.
- **Never touches files outside `baluarte-app/`** (other than invoking `baluarte-remember`, which executes its own bash `sqlite3` calls).

## What NOT to do

- ❌ Run `sqlite3` from `Bash`. Every DB operation is a `Skill` call with `skill=baluarte-remember`.
- ❌ Hand-tune SQL inside this skill. Every DB operation goes through `baluarte-remember` and the `/queries/*.sql` cache.
- ❌ Add a new build sub-skill. One unified entry point.
- ❌ Cascade into other baluarte-* skills besides `baluarte-remember`. If something is missing, fail fast and suggest the next command.
- ❌ Auto-launch `npm run storybook`. Ask the user first per repo convention.
- ❌ Wholesale `Write` an existing component or story file when a targeted `Edit` covers the diff.
- ❌ Overwrite a file that lacks the AUTO-GENERATED marker. Print the diff and let the user merge.
