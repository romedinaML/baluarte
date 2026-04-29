---
name: baluarte-build-layout
description: Generate a React + TypeScript + Tailwind layout file plus its Storybook story from a `layouts` row in SQLite. Fails fast if any referenced child component lacks an `artifact_path`, listing the exact `baluarte-build-component <reg_uuid>` commands the user must run first — this skill NEVER cascades into another baluarte-* skill. Records artifact_path / source_hash / generated_at so future Figma changes can drive an update. Requires `baluarte-build-setup` to have run.
---

# baluarte-build-layout

Reads one `layouts` row (joined to its `registry` row) and emits:

- `baluarte-app/src/layouts/<Name>/<Name>.tsx` — the layout implementation.
- `baluarte-app/src/layouts/<Name>/<Name>.stories.tsx` — the Storybook story.

Layouts compose components — this skill ensures every component the layout references is already on disk before generating layout code.

## Tool access for this skill

- Filesystem (`Read`, `Write`, `Edit`, `Glob`, `Grep`).
- `Bash`.
- `baluarte-remember` (read + write).
- **No Figma MCP access. No other baluarte-* skill calls.** If a child component is unbuilt, this skill fails and tells the user the exact command to run.

## Required argument

- `registry_uuid` — the layout's UUID in the `registry` table.

## Optional arguments

- `--prompt "<free-form context>"` — user-supplied guidance. Use it to:
  - Override the PascalCase component name (e.g. `--prompt "call this DashboardShell"`).
  - Add an extra `className` slot or wrapper (e.g. `--prompt "wrap the root in a <main> tag with role=main"`).
  - Note responsiveness expectations (e.g. `--prompt "mobile-first; collapse the sidebar below 768px"`).

## Pre-checks

1. **`baluarte-app` is set up.** Same check as `baluarte-build-component` — fail fast if missing.
1a. **Storybook globs include `src/**`.** Read `baluarte-app/.storybook/main.ts` and confirm the `stories` array contains a glob matching `../src/**/*.stories.@(js|jsx|mjs|ts|tsx)`. If absent, fail with: "`.storybook/main.ts` is missing the `../src/**` story glob — re-run `baluarte-build-setup` to patch it."
1b. **Relationship completeness.** Read the layout's `properties_json`.

  - **Placeholder allowance:** if `properties_json` is the original empty-placeholder shape (`children` empty, `tokens` empty, `notes` field starting with "first-pass"), build proceeds with this warning logged: `"Building <layout> from a first-pass placeholder properties_json. Re-run baluarte-orchestrate (Phase A enrichment) for richer output."` Skip the rest of pre-check 1b.
  - **Component children claimed:** if `properties_json.children` contains any `kind: "component"` entries (count = N), require:
    ```bash
    sqlite3 .data/baluarte.db \
      "SELECT COUNT(*) FROM layout_components WHERE layout_uuid='<L_UUID>';"
    ```
    ≥ N. On shortfall, **fail** with: `"Cannot build <layout>: properties_json claims N component children but layout_components has M edges. Run baluarte-document-layout to (re-)link, or baluarte-understand-product to repopulate registry_children."`
  - **Linked components must exist in `components`** — verified by the existing "Build child components first" step. The linked components will be built (or updated) via `baluarte-build-component` cascading; if any link points at a `components.uuid` that no longer exists, fail with: `"Cannot build <layout>: layout_components references component_uuid <x> that has no row in components. Re-run baluarte-document-component before retrying."`

  Do not write any file or stamp SQLite when the gate fails.
2. **Type check.**
   ```bash
   sqlite3 .data/baluarte.db \
     "SELECT r.node_id, r.node_type, l.uuid, l.description, l.properties_json, l.source_hash, l.artifact_path
      FROM registry r LEFT JOIN layouts l ON l.registry_uuid = r.uuid
      WHERE r.uuid='<REG_UUID>';"
   ```
   - `node_type != 'layout'` → fail with: "registry uuid is type=<X>; this skill only handles layouts."
   - No `layouts` row → fail with: "Run `baluarte-document-layout` first to populate properties_json."

  **Stale-classification cleanup**: when iterating the work list and you encounter a `layouts` row whose joined `registry.node_type` is **no longer** `'layout'` (e.g. user reclassified the row as `'page'` via the orchestrator's classification-review checkpoint), delete the row + its layout_components edges + its React file:
  ```bash
  ARTIFACT=$(sqlite3 .data/baluarte.db "SELECT artifact_path FROM layouts WHERE uuid='<L_UUID>';")
  sqlite3 .data/baluarte.db "DELETE FROM layouts WHERE uuid='<L_UUID>';"
  if [ -n "$ARTIFACT" ]; then
    DIR="baluarte-app/$(dirname "$ARTIFACT")"
    rm -rf "$DIR"
  fi
  ```
  This keeps Storybook clean of stale presentation-slide layouts after a re-classification pass.
3. **Decide generate vs update vs skip** — same hash logic as `baluarte-build-component`, against `layouts.source_hash` and the file at `layouts.artifact_path`.

## Verify child components are already built — fail fast otherwise

This skill never cascades into `baluarte-build-component`. The user runs that skill manually before retrying this one.

```bash
sqlite3 -header -box .data/baluarte.db <<SQL
SELECT c.uuid AS component_uuid, c.registry_uuid AS reg_uuid, r.node_id, r.description,
       c.artifact_path
FROM layout_components lc
JOIN components c ON c.uuid = lc.component_uuid
JOIN registry  r ON r.uuid = c.registry_uuid
WHERE lc.layout_uuid = (SELECT uuid FROM layouts WHERE registry_uuid='<REG_UUID>');
SQL
```

For each row:

- If `artifact_path IS NULL` or the file at `baluarte-app/<artifact_path>` does not exist → the child is unbuilt.
- Collect every unbuilt child's `reg_uuid` and `description`.

If the unbuilt list is non-empty, **fail fast** with this exact shape:

```
Cannot build <Layout name>: <N> child component(s) are not yet built.

Run these commands first, then retry baluarte-build-layout:
  baluarte-build-component <reg_uuid_1>   # <description 1>
  baluarte-build-component <reg_uuid_2>   # <description 2>
  ...
```

Do not write any file or stamp SQLite when this gate fails. The user invokes the suggested commands manually, in any order, then re-runs this skill.

## Generate / update

### File layout

```
baluarte-app/src/layouts/<Name>/
├── <Name>.tsx
└── <Name>.stories.tsx
```

Layout name = PascalCase from `registry.description` or the layout's title in `properties_json`.

### Driving the codegen from `properties_json`

Shape (from `baluarte-document-layout`):

```json
{
  "auto_layout": { "direction": "vertical", "gap": 16, "padding": [24, 16, 24, 16] },
  "sizing": { "width": "fill", "height": "hug" },
  "breakpoints": [],
  "children": [
    { "kind": "component", "registry_uuid": "...", "component_uuid": "..." },
    { "kind": "layout",    "registry_uuid": "...", "layout_uuid": "..." }
  ],
  "tokens": [{ "name": "color/brand/primary", "type": "color" }],
  "custom_values": []
}
```

Translation:

- **`auto_layout.direction`** → flexbox (`flex flex-col` for vertical, `flex flex-row` for horizontal, `flex flex-wrap` for wrap).
- **`auto_layout.gap`** → `gap-[<N>px]` (or matched Tailwind spacing token if present in `visual_properties`).
- **`auto_layout.padding`** → `pt-[N] pr-[N] pb-[N] pl-[N]`, prefer named Tailwind classes when a `visual_properties` row matches.
- **`sizing.width / height`** → `w-full / h-full / w-fit / h-fit / w-[<N>px]`.
- **`children`** — for each child:
  - Look up its built artifact (`components.artifact_path` or `layouts.artifact_path`) to know what to import.
  - Import the child by relative path. Render it in the order given.
- **`tokens`** are referenced by class via the same `visual_properties` lookup as `baluarte-build-component`. Same `TODO(baluarte-build-properties)` comment when a token has no matching property.

### Example output

`<Name>.tsx`:

```tsx
import * as React from 'react';
import { Button } from '../../components/Button/Button';
import { Card } from '../../components/Card/Card';

export interface DashboardShellProps {
  className?: string;
}

export function DashboardShell({ className = '' }: DashboardShellProps) {
  return (
    <div className={`flex flex-col gap-4 px-4 py-6 w-full bg-surface-default ${className}`}>
      <Card>
        <Button label="Primary action" />
      </Card>
    </div>
  );
}
```

`<Name>.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { DashboardShell } from './DashboardShell';

const meta: Meta<typeof DashboardShell> = {
  title: 'Layouts/DashboardShell',
  component: DashboardShell,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof DashboardShell>;

export const Default: Story = {};
```

### Header comment (every generated file)

```
// AUTO-GENERATED by baluarte-build-layout
// registry_uuid: <REG_UUID>
// layouts.uuid:  <UUID>
// source_hash:   <HASH>
// Edits will be overwritten when the source figma data changes. Edit the SQLite row instead.
```

## Persist

```bash
sqlite3 .data/baluarte.db \
  "UPDATE layouts
   SET source_hash='<HASH>',
       artifact_path='src/layouts/<Name>/<Name>.stories.tsx',
       generated_at=datetime('now')
   WHERE uuid='<UUID>';"
```

## Smoke check

```bash
cd baluarte-app && npx tsc --noEmit
```

## Hard rules

- Layout-only. Never run on a `component` or `property` registry row.
- **Never call another baluarte-* skill** other than `baluarte-remember`. If a child component is unbuilt, fail fast with the exact `baluarte-build-component <reg_uuid>` command for the user to run.
- Never call Figma MCP.
- Always overwrite both files together when updating.
- Always update `source_hash`, `artifact_path`, `generated_at` after a successful write.
- Never write outside `baluarte-app/`.
