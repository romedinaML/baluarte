---
name: baluarte-design
description: Build/extend Figma components in the Baluarte design system using the Metalab Figma MCP. Use when the user asks to create or modify a component in Figma, especially when they pass /baluarte-design followed by a prompt and/or Figma URL.
---

# baluarte-design

Conventions for every Figma component built through `mcp__metalab__figma_*` tools. Apply silently — don't restate them to the user.

## Setup

1. Call `figma_write_check_connection` first. If `connected: false`, ask the user to open Figma → Plugins → Metalab MCP Bridge (port 9381) and stop.
2. Prefer `figma_write_evaluate_script` for variable/style work — the granular write tools don't cover Variables, TextStyles, or `combineAsVariants`.
3. All `figma.variables.getLocal*` calls **must be async** (`getLocalVariableCollectionsAsync`, `getLocalVariablesAsync`, `getLocalTextStylesAsync`). Wrap scripts as `(async () => { ... })()`.

## Token system (two-tier, always)

- Collection `primitives` — raw values: `color/<hue>/<step>`, `radius/<size>`, `spacing/<n>`, `font/family/*`, `font/weight/*` (STRING, e.g. `"Semi Bold"`), `font/size/*`, `font/lineHeight/*`, `border/width/*`, `border/offset/*`.
- Collection `semantic` — **aliases only** via `figma.variables.createVariableAlias(prim)`. Names are component-scoped: `button/bg/hover`, `card/radius`, `pill/fg/high`, `text/heading/size`, `card/pill/offset`.
- Components bind **only** to `semantic/*`. Never bind raw primitives on a node.
- Make adding tokens idempotent: look up `byName[...]`, update if present, create otherwise.

## Binding

- Colors: `figma.variables.setBoundVariableForPaint(paint, 'color', semVar)` — assign the returned paint back into `fills` / `strokes`.
- Numeric props: `node.setBoundVariable('topLeftRadius' | 'strokeWeight' | 'minHeight' | ..., semVar)`. Bind all 4 corners individually.
- Text: bind `fontFamily`, `fontStyle`, `fontSize`, `lineHeight` on the **TextStyle**, not the text node. Set fallback `fontName/fontSize/lineHeight` first, then bind on top.
- `x`/`y` cannot be bound — set raw values and document tokens via layer name + plugin data (see Absolute positioning).

## TextStyles

Always create reusable TextStyles (`Heading`, `Body`, `Pill`, `Eyebrow`, ...) bound to `text/<role>/{family,weight,size,lineHeight}`. Apply with `await textNode.setTextStyleIdAsync(style.id)`. `loadFontAsync` every weight before use.

## Variant naming & layout

- Single axis: `State=Default | Hover | Disabled | Focus`.
- Multi-axis: `Property 1=A, State=Hover` (comma-space). Use `figma.combineAsVariants([...], page)` for new sets.
- Lay variants out in a single row inside the ComponentSet: 24px gap, ~24/40 padding, vertically center when heights differ.
- Set `componentSet.clipsContent = false` and each variant `clipsContent = false` if any outer rings or shadows extend past the bounds.

## Interactive vs non-interactive components

- Interactive (button, link): give them a `State` axis with **Default / Hover / Disabled / Focus**. Each state binds to its own semantic token, never opacity hacks.
- Non-interactive (pill, badge): variants on the meaningful axis only (e.g. `Priority=High|Medium|Low`). No state axis.
- Focus ring: separate rectangle child (named `Focus Ring`) sitting *outside* the button, offset by `<comp>/ring/offset`, stroke bound to `<comp>/ring/focus`, weight bound to `<comp>/ring/width`. Use `strokeAlign='CENTER'` for crisp offset.

## Related components (not variants)

When a button-like element shouldn't be a variant of `button`, name it `button-<modifier>` (e.g. `button-link`). It's its own component, but token names stay in the same family (`buttonLink/fg/default`, `buttonLink/icon/default`).

## Composition

- Always compose with **instances** (`source.createInstance()`). Never duplicate.
- Wrappers (cards, sections, headers) are **auto-layout frames**. Children use `layoutSizingHorizontal = 'FILL'` (or `'HUG'`) — never absolute math.
- Use `primaryAxisAlignItems = 'SPACE_BETWEEN'` for header bars (label left, action right).
- Cards: vertical auto-layout, `clipsContent = true`, radius bound to `card/radius`, bg bound to `card/bg`, soft drop shadow effect.
- Scrollable rows: horizontal auto-layout + `clipsContent = true` + `overflowDirection = 'HORIZONTAL'`.

## Absolute positioning (for React extraction)

When a child must be absolutely positioned (e.g. pill overlay on a card image):

1. `node.layoutPositioning = 'ABSOLUTE'`
2. `node.constraints = { horizontal: 'MIN' | 'MAX', vertical: 'MIN' | 'MAX' }`
3. Set `x` / `y` to the raw token value.
4. Layer name encodes the spec: `<Name> / position:absolute top:<token.path> left:<token.path>`.
5. Stamp shared plugin data so an extractor LLM has a deterministic signal:
   ```js
   node.setSharedPluginData('design_system', 'positioning', 'absolute');
   node.setSharedPluginData('design_system', 'top', '{semantic.card.pill.offset}');
   node.setSharedPluginData('design_system', 'left', '{semantic.card.pill.offset}');
   ```
6. Add the offset as a semantic token (e.g. `card/pill/offset` → `spacing/2`).

## Min-height / dynamic sizing

`minHeight` only works on auto-layout nodes. To give an image a min height: convert its frame to auto-layout (`layoutMode = 'VERTICAL'`), set absolute children to `layoutPositioning = 'ABSOLUTE'` so they don't flow, then `node.minHeight = value`.

## Idempotency

Before creating a collection / style / component, look it up by name and either reuse or `.remove()` the old one. Scripts should be safe to re-run.

## Verification

After significant changes, run a small read-only script that returns:
- ComponentSet `variantGroupProperties` (catches name collisions — Figma throws "Component set has existing errors" when two variants share a name).
- For each variant: bound variable IDs for fills/strokes/radius so you can prove the binding made it through.

## Persist intent (REQUIRED on every create/modify)

After the component is built/updated, record the user's intent so `baluarte-analyze` can drain it into the registry and `baluarte-build` can act on it downstream. Do this in **two places at once**:

### 1. Figma node annotation (`node.annotations`) — DESIGNER-FACING

Set a single annotation on the node containing the structured prose block. Annotations are:
- **Designer-editable** via the right-panel Annotations section in Figma.
- **Visible on the canvas** as numbered markers (toggle annotations to show/hide).
- **Available on every node type** including `FRAME` (unlike `.description`, which only exists on `COMPONENT` / `COMPONENT_SET`).

This is the canonical channel — anything written here can be edited by a designer later, and `baluarte-analyze` will pick up their edits on the next sync. The `.description` field on COMPONENT/COMPONENT_SET is no longer used (annotations subsume it; do not write to it).

Prose shape (one annotation per node, single `label` string):

```
@baluarte intent:
<verbatim original user prompt — the exact text after /baluarte-design>

@scrollable: x | y                 // omit when not scrollable
@min-width: <px-number>            // omit when no constraint
@max-width: <px-number>
@interactive: click→active, hover→hover    // comma-separated event→target_state pairs
```

Set via plugin script:
```js
node.annotations = [{
  label: `@baluarte intent:\n${prompt}\n\n${tags.join('\n')}`,
  properties: [],
}];
```

Replace any existing annotation whose `label` starts with `@baluarte intent:` rather than appending — there is only one baluarte annotation per node. Leave designer-authored annotations on other categories untouched.

### 2. `setSharedPluginData('baluarte', 'intent_v1', <JSON>)`

Same data in a parseable shape — the analyze skill prefers this when present:

```js
node.setSharedPluginData('baluarte', 'intent_v1', JSON.stringify({
  prompt:        '<verbatim user prompt>',
  scrollable:    'x' | 'y' | null,
  min_width:     <number-of-px> | null,
  max_width:     <number-of-px> | null,
  interactivity: [
    { event: 'click' | 'hover' | 'focus', target_state: 'hover' | 'active' | 'clicked' | ... }
  ],
  notes:         '<additional context, or empty string>'
}));
```

Apply to the top-level `COMPONENT_SET` (or top-level `COMPONENT`/`FRAME` if no set exists) — never to child layers. The DB row `components.intent_json` will mirror this object after analyze runs.

### Intent vocabulary

- **scrollable** — when the component has an inner row/column of children meant to scroll, set `scrollable: 'x'` (horizontal) or `'y'` (vertical). Pair with `overflowDirection` on the Figma frame.
- **min_width / max_width** — when the user said things like "no wider than 300", "fits content but at least 200", encode the numeric constraint here. Leave null when the component is fully fluid.
- **interactivity** — every interactive event→state transition the user described ("clicking the button moves it to active", "hover should brighten"). Each entry maps a DOM-like event to a target state name. Build emits an `Interactive` Storybook story that wires `React.useState` + the prescribed handlers, so the user can click through real transitions in the playground.
- **css_utilities** — array of verbatim Tailwind built-in classes (e.g. `["overflow-x-hidden", "snap-x", "snap-mandatory"]`). **Usually populated automatically by `baluarte-build`** after inferring from prose (and writing back to a `@css:` line in this annotation). Designers may also author the `@css:` line manually if they happen to know the exact Tailwind class they want; the build will respect it. Never register these as design tokens — they are ambient utilities, not theme entries.
- **prompt** — always the original user request, verbatim. Survives forever as the audit trail of why the component exists.

### Idempotency

When updating an existing component, **read** `getSharedPluginData('baluarte','intent_v1')` first. If present, merge: keep the original `prompt` (audit trail), update other fields from the latest request. Never blank a non-empty prompt.

## Chain into analyze + build (REQUIRED on every successful run)

After persisting intent (and only when the Figma write succeeded — no errors, no failed connection), **always** invoke the analyze + build pipeline as the final step. This drains the intent we just wrote into `.data/baluarte.db` and regenerates the corresponding Storybook artifacts in the same turn, so the user sees the round-trip without a second command.

```text
Skill(skill="baluarte-analyze", args="<the Figma file URL the user passed> --with-build")
```

Rules:
- **File URL.** Pass whichever Figma URL the user supplied. If multiple URLs were given (e.g. multiple node-id URLs into the same file), use any one of them — `baluarte-analyze` only reads the `file_key`.
- **Skip on failure.** If `figma_write_check_connection` returned `connected:false`, or any earlier write threw, do NOT chain — surface the error and stop.
- **Single chain per turn.** Do not loop or re-invoke analyze multiple times in one `/baluarte-design` run. One terminal chain, after all design writes are committed.
- **Verbatim output.** Append the analyze + build output to your final response without summarizing — the user wants to see the round-trip artifacts.

This is part of the skill's contract, not optional. The reason: `/baluarte-design` writes intent that is invisible to humans until it makes it through the analyze → build → Storybook path. Auto-chaining closes the loop on every run.

## Scope discipline

Build only what the user asked for. Don't add hover states, dark themes, or extra components unprompted. The semantic layer is designed to grow later — leave the door open without walking through it.
