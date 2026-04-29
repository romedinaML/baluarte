---
name: baluarte-build-component
description: Generate a React + TypeScript + Tailwind component file plus its Storybook story from a `components` row in SQLite. Component-only — fails for `node_type='layout'` or `'property'`. Records artifact_path, source_hash, and generated_at on the row so future Figma changes can be detected and trigger an update. Requires `baluarte-build-setup` to have run first.
---

# baluarte-build-component

Reads one `components` row (joined to its `registry` row) and emits:

- `baluarte-app/src/components/<Name>/<Name>.tsx` — the component implementation.
- `baluarte-app/src/components/<Name>/<Name>.stories.tsx` — the Storybook story (one story per variant if the row has variants).

## Tool access for this skill

- Filesystem (`Read`, `Write`, `Edit`, `Glob`, `Grep`).
- `Bash` (npm/npx/sha256sum/sqlite3 — only via the `baluarte-remember` patterns documented there).
- `baluarte-remember` (read + write).
- **No Figma MCP access.** All input comes from SQLite.

## Required argument

- `registry_uuid` — the component's UUID in the `registry` table.

## Optional arguments

- `--prompt "<free-form context>"` — user-supplied guidance. Use it to:
  - Override the sanitised PascalCase name (e.g. `--prompt "call this PrimaryCTA"`).
  - Force a granularity-driven template choice (e.g. `--prompt "treat as atomic even though properties_json says molecular"`).
  - Add semantic intent that informs prop typing or accessibility attributes (e.g. `--prompt "this is a destructive action — add aria-label and a confirm dialog wrapper prop"`).
  Treat the prompt as authoritative when it conflicts with the row's `properties_json`.

## Pre-checks

1. **`baluarte-app` exists and is set up.** Verify `baluarte-app/package.json`, `baluarte-app/.storybook/main.ts`, and `baluarte-app/baluarte.tailwind.ts` all exist. If any is missing, fail with: "Run `baluarte-build-setup` first."
1a. **Storybook globs include `src/**`.** Read `baluarte-app/.storybook/main.ts` and confirm the `stories` array contains a glob matching `../src/**/*.stories.@(js|jsx|mjs|ts|tsx)`. If absent, the generated story file will exist on disk but Storybook will never render it. Fail fast with: "`.storybook/main.ts` is missing the `../src/**` story glob — re-run `baluarte-build-setup` (it patches main.ts idempotently)."
1b. **Relationship completeness.** Read the component's `properties_json`.

  - **Placeholder allowance:** if `properties_json` is the original empty-placeholder shape (`children` empty, `tokens`/`tokens_observed` empty, `notes` field starting with "first-pass"), the build proceeds with this warning logged: `"Building <component> from a first-pass placeholder properties_json. Re-run baluarte-understand-product with full enrichment for richer output."` Skip the rest of pre-check 1b.
  - **Tokens claimed:** if `properties_json.tokens` (or `tokens_observed`) is non-empty with N entries, require:
    ```bash
    sqlite3 .data/baluarte.db \
      "SELECT COUNT(*) FROM registry_tokens WHERE registry_uuid='<REG_UUID>';"
    ```
    ≥ N. On shortfall, **fail** with: `"Cannot build <component>: properties_json claims N tokens but registry_tokens has M edges. Run baluarte-understand-product (or its token-fallback step) before retrying."`
  - **Component children claimed:** for every `properties_json.children` entry whose `type='INSTANCE'` and which carries a `registry_match` (or whose `componentId` resolves to a `registry.node_id`), require the referenced component to exist in `components` (joined to `registry`). On shortfall, **fail** with: `"Cannot build <component>: properties_json references child component <name> (registry_uuid=<x>) which has no row in components. Run baluarte-document-component on it first."`

  Do not write any file or stamp SQLite when the gate fails.
2. **Type check.**
   ```bash
   sqlite3 .data/baluarte.db \
     "SELECT r.node_id, r.node_type, c.uuid, c.description, c.properties_json, c.source_hash, c.artifact_path
      FROM registry r LEFT JOIN components c ON c.registry_uuid = r.uuid
      WHERE r.uuid='<REG_UUID>';"
   ```
   - No registry row → fail.
   - `node_type != 'component'` → fail with: "registry uuid is type=<X>; this skill only handles components. Use baluarte-build-layout for layouts."
   - No matching `components` row → fail with: "registry uuid has no `components` row yet. Run `baluarte-document-component` first to populate properties_json."

3. **Decide generate vs update vs skip.**
   ```bash
   CURRENT_HASH=$(sqlite3 .data/baluarte.db \
     "SELECT properties_json FROM components WHERE registry_uuid='<REG_UUID>';" \
     | sha256sum | awk '{print $1}')
   ```
   Compare `CURRENT_HASH` to the row's `source_hash`:
   - `source_hash IS NULL` or `artifact_path IS NULL` → **generate** (first build).
   - `source_hash == CURRENT_HASH` and the file at `artifact_path` exists → **skip** (fresh; tell the user nothing to do).
   - `source_hash != CURRENT_HASH` → **update** (Figma data changed; regenerate the file).

## Generate / update

### File layout

Component name = a PascalCase rendering of `registry.description` or `properties_json.kind`+`registry.node_id`. Sanitise to `[A-Za-z][A-Za-z0-9]*`.

**Naming edge cases (learned the hard way):**
- Descriptions often look like `"<Name> — <prose details>"` with an em-dash `—` (U+2014). Split *only* on em-dash to extract the name; do **not** split on regular hyphen `-`, because component names like `03- Simple Star` use a hyphen inside the name itself.
- Descriptions starting with a digit (e.g. `"03- Simple Star"`) need the leading digits stripped *carefully* — a naïve `^[0-9]+` strip on `"03"` leaves an empty string. Prefer to keep the alpha part and drop the leading digit token, e.g. `"03- Simple Star" → "SimpleStar"`. Falling back to `node_id`-based names produces ugly identifiers like `Cexternalcomponent03_Simple_Star`.
- When two registry rows yield the same PascalCase name (e.g. two slides both titled "Heart Health screen"), append a numeric suffix (`HeartHealthScreen`, `HeartHealthScreen1`). Don't reuse a directory.

```
baluarte-app/src/components/<Name>/
├── <Name>.tsx
└── <Name>.stories.tsx
```

If the directory exists but the file you're about to write is missing, write it. If it exists and you're in **update** mode, fully overwrite both files (a stale half-edit would be worse than a clean rewrite).

### Granularity-driven template choice

Read `granularity` from the `components` row before rendering JSX:

- **`atomic`** — emit a single-purpose leaf component. The whole render is one element: an `<input className="…" />`, `<button className="…">label</button>`, `<span className="…">…</span>`. No nested INSTANCE imports. Props mirror the source's `componentProperties` (variant + boolean inputs).
- **`molecular`** — emit a composed component that imports its atomic children (resolved via `registry_children` join → registered atomic components in `components`). Render them inside a flex container that mirrors `properties_json.root.layout_mode`/`gap`/`padding`. Use the registered atomic Tailwind classes for any tokens consumed.
- **`unknown`** — emit a placeholder with a clear `// TODO(baluarte): granularity unknown — confirm via baluarte-orchestrate's classification-review checkpoint` comment, then render the same thin first-pass placeholder used historically. Don't pretend to know the structure.

The granularity tag survives across regenerations — the build script reads it from the row and chooses the template path.

### Driving the codegen from `properties_json`

The shape (from `baluarte-document-component`) is:

```json
{
  "kind": "component",
  "variants": [{ "name": "default", "node_id": "...", "props": { "size": "md" } }],
  "props": [{ "name": "label", "type": "string", "default": "Click me" }],
  "slots": ["leading-icon", "trailing-icon"],
  "tokens": [{ "name": "color/brand/primary", "type": "color" }],
  "custom_values": []
}
```

Translation rules:

- **`props`** become a TypeScript prop interface. `string` → `string`, `boolean` → `boolean`, `enum` → string-literal union from `values[]`. Defaults become defaults in the destructured signature.
- **`slots`** become `ReactNode` props named exactly as the slot, except in TS-friendly camelCase. A "leading-icon" slot becomes `leadingIcon?: React.ReactNode`.
- **`tokens`** drive Tailwind classes: prefer the `tailwind_name` of any matching `visual_properties` row. Look it up:
  ```bash
  sqlite3 -header -box .data/baluarte.db \
    "SELECT vp.tailwind_name, vp.css_property, vp.value
     FROM visual_properties vp
     WHERE vp.name='<TOKEN_NAME>' AND vp.type='<TOKEN_TYPE>';"
  ```
  If a token has no matching `visual_properties` row, leave a `TODO(baluarte-build-properties)` comment in the JSX and use the raw value (hex, px) inline. The comment is the human signal to run `baluarte-build-properties`.
- **`custom_values`** become inline Tailwind/CSS — emit them but flag with a `TODO` comment if they look like they should be tokens.

### Example output

`<Name>.tsx`:

```tsx
import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Auto-generated by baluarte-build-component. Edit baluarte's SQLite row instead. */
  size?: 'sm' | 'md' | 'lg';
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  label?: string;
}

export function Button({ size = 'md', leadingIcon, trailingIcon, label = 'Click me', className = '', ...rest }: ButtonProps) {
  const sizeCls = size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm';
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-md bg-brand-primary text-white ${sizeCls} ${className}`}
      {...rest}
    >
      {leadingIcon}
      <span>{label}</span>
      {trailingIcon}
    </button>
  );
}
```

`<Name>.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = { args: { label: 'Click me', size: 'md' } };
export const Small: Story = { args: { label: 'Click me', size: 'sm' } };
export const Large: Story = { args: { label: 'Click me', size: 'lg' } };
```

If `properties_json.variants` has entries, emit one named export per variant whose `args` come from the variant's `props` map. Otherwise emit `Default`.

### Header comment (every generated file)

```
// AUTO-GENERATED by baluarte-build-component
// registry_uuid: <REG_UUID>
// components.uuid: <UUID>
// source_hash: <HASH>
// Edits will be overwritten when the source figma data changes. Edit the SQLite row instead.
```

This makes the regeneration story unambiguous when a developer opens the file.

## Persist

After writing the files:

```bash
sqlite3 .data/baluarte.db \
  "UPDATE components
   SET source_hash='<HASH>',
       artifact_path='src/components/<Name>/<Name>.stories.tsx',
       generated_at=datetime('now')
   WHERE uuid='<UUID>';"
```

`artifact_path` is the *story* file (one path; the implementation file is implied by the same directory). The `source_hash` is what you computed in pre-check 3.

## Smoke check

```bash
cd baluarte-app && npx tsc --noEmit
```

If TypeScript fails on the new files only, treat as a bug in this skill — report the specific errors and fix before reporting success. If it fails on unrelated stories, report and proceed.

## Hard rules

- Component-only. Never run on a `layout` or `property` registry row.
- **Never call another baluarte-* skill** other than `baluarte-remember`. If a nested registered child is unbuilt, fail fast with the suggested `baluarte-build-component <reg_uuid>` command.
- Never call Figma MCP. All inputs come from SQLite.
- Always overwrite both `<Name>.tsx` and `<Name>.stories.tsx` together when updating — partial regeneration causes drift.
- Always update `source_hash`, `artifact_path`, and `generated_at` after a successful write.
- Tokens with no matching `visual_properties` row leave a `TODO(baluarte-build-properties)` comment, not silent inline values.
- Never write to files outside `baluarte-app/`.
