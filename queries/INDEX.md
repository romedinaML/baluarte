# Query index

Reusable SQL for `.data/baluarte.db`. Owned by `baluarte-remember` — every other skill calls into `baluarte-remember`, which executes these via bash `sqlite3`.

## Protocol

1. Before writing new SQL, scan this index. Match by **operation + table + bound parameters**.
2. If a match exists, run it:
   ```bash
   sqlite3 .data/baluarte.db <<'EOF'
   PRAGMA foreign_keys=ON;
   .parameter set :name 'Button'
   .parameter set :storybook_id NULL
   .parameter set :description NULL
   .parameter set :edited_at NULL
   .parameter set :content_diff_hash NULL
   .read queries/insert_component.sql
   EOF
   ```
3. If no match, create `queries/<verb>_<table>[_<qualifier>].sql` using only `:bound_params` (no string interpolation), then append a row below.
4. **Bash `sqlite3` only.** No Python. No `node:sqlite`.

Naming: `<verb>_<table>[_<qualifier>].sql` — `verb` ∈ {`insert`, `select`, `list`, `update`, `delete`, `link`, `unlink`, `count`}.

Update queries use the **dynamic COALESCE pattern**: every column appears as `col = COALESCE(:col, col)`, so callers pass NULL for fields they don't want to change. Insert/upsert files for tables with natural keys (`pages.file_key`, `properties (name, type)`, `figma_nodes (reference_type, reference_id)`, `*_registry` UNIQUE keys, `component_variants (component_id, figma_node)`) are idempotent via `ON CONFLICT … DO UPDATE`.

## Single tables

### pages

| Name | File | Params | Description |
|---|---|---|---|
| insert_page | insert_page.sql | `:file_key`, `:edited_at` | Upsert by `file_key` (returns uuid) |
| select_page_by_uuid | select_page_by_uuid.sql | `:uuid` | Fetch one row |
| select_page_by_file_key | select_page_by_file_key.sql | `:file_key` | Fetch by Figma file key |
| select_pages_all | select_pages_all.sql | — | List all pages |
| update_page | update_page.sql | `:uuid`, `:file_key`, `:edited_at` | Dynamic update |
| delete_page | delete_page.sql | `:uuid` | Cascades to `pages_registry` |

### storybook

| Name | File | Params | Description |
|---|---|---|---|
| insert_storybook | insert_storybook.sql | `:name`, `:url_local`, `:url_prod`, `:src_ref` | Insert (returns uuid) |
| select_storybook_by_uuid | select_storybook_by_uuid.sql | `:uuid` | Fetch one row |
| select_storybook_all | select_storybook_all.sql | — | List all storybook entries |
| update_storybook | update_storybook.sql | `:uuid`, `:name`, `:url_local`, `:url_prod`, `:src_ref` | Dynamic update |
| delete_storybook | delete_storybook.sql | `:uuid` | Sets `storybook_id = NULL` on referencing layouts/components |

### layouts

| Name | File | Params | Description |
|---|---|---|---|
| insert_layout | insert_layout.sql | `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash` | Insert (returns uuid) |
| select_layout_by_uuid | select_layout_by_uuid.sql | `:uuid` | Fetch one row (incl. `content_diff_hash`) |
| select_layout_uuid_by_figma_node | select_layout_uuid_by_figma_node.sql | `:figma_node` | Resolve layout uuid by Figma node id |
| select_layouts_all | select_layouts_all.sql | — | List all layouts |
| list_layouts_with_figma_node | list_layouts_with_figma_node.sql | — | List `(figma_node, uuid, edited_at, content_diff_hash)` for every layout |
| update_layout | update_layout.sql | `:uuid`, `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash` | Dynamic update (COALESCE pattern) |
| delete_layout | delete_layout.sql | `:uuid` | Cascades to `layout_registry`, `layout_properties`, `pages_registry` |

### components

| Name | File | Params | Description |
|---|---|---|---|
| insert_component | insert_component.sql | `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash` | Insert (returns uuid) |
| select_component_by_uuid | select_component_by_uuid.sql | `:uuid` | Fetch one row (incl. `content_diff_hash`) |
| select_component_uuid_by_figma_node | select_component_uuid_by_figma_node.sql | `:figma_node` | Resolve component uuid by Figma node id |
| select_components_all | select_components_all.sql | — | List all components |
| list_components_with_figma_node | list_components_with_figma_node.sql | — | List `(figma_node, uuid, edited_at, content_diff_hash)` for every component |
| update_component | update_component.sql | `:uuid`, `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash` | Dynamic update (COALESCE pattern) |
| delete_component | delete_component.sql | `:uuid` | Cascades to `components_properties`, `components_registry`, `component_variants` |

### component_variants

| Name | File | Params | Description |
|---|---|---|---|
| insert_component_variant | insert_component_variant.sql | `:component_id`, `:figma_node`, `:figma_url`, `:name`, `:variant`, `:state_id` | Idempotent upsert by `(component_id, figma_node)` |
| list_component_variants_by_component | list_component_variants_by_component.sql | `:component_id` | List variants of a component |
| delete_component_variants_by_component | delete_component_variants_by_component.sql | `:component_id` | Wipe variants before re-syncing |

### states

States are pre-seeded by `schema.sql`. The mutate queries below exist for completeness but should rarely be used.

| Name | File | Params | Description |
|---|---|---|---|
| select_state_by_uuid | select_state_by_uuid.sql | `:uuid` | Fetch one row |
| select_state_by_type | select_state_by_type.sql | `:type` | Fetch by type name |
| select_states_all | select_states_all.sql | — | List all states |
| update_state | update_state.sql | `:uuid`, `:type` | Dynamic update (rarely needed) |
| delete_state | delete_state.sql | `:uuid` | Cascades to `components_properties` |

### figma_nodes

| Name | File | Params | Description |
|---|---|---|---|
| insert_figma_node | insert_figma_node.sql | `:figma_node`, `:figma_url`, `:reference_id`, `:reference_type`, `:type` | Upsert by `(reference_type, reference_id)`. `:reference_type` ∈ `layout\|component` |
| select_figma_node_by_uuid | select_figma_node_by_uuid.sql | `:uuid` | Fetch one row |
| select_figma_node_for_reference | select_figma_node_for_reference.sql | `:reference_type`, `:reference_id` | Fetch by polymorphic ref |
| select_figma_nodes_all | select_figma_nodes_all.sql | — | List all figma_nodes |
| update_figma_node | update_figma_node.sql | `:uuid`, `:figma_node`, `:figma_url`, `:reference_id`, `:reference_type`, `:type` | Dynamic update |
| delete_figma_node | delete_figma_node.sql | `:uuid` | Delete one row |

### properties

| Name | File | Params | Description |
|---|---|---|---|
| insert_property | insert_property.sql | `:name`, `:tailwind_class`, `:css_style`, `:type`, `:origin`, `:figma_variable_id` | Upsert by `(name, type)`. `figma_variable_id` is preserved across Custom re-upserts |
| select_property_by_uuid | select_property_by_uuid.sql | `:uuid` | Fetch one row (incl. `figma_variable_id`) |
| select_property_by_figma_variable_id | select_property_by_figma_variable_id.sql | `:figma_variable_id` | Resolve a property by its Figma variable id |
| select_properties_all | select_properties_all.sql | — | List all properties (ordered by type, name) |
| update_property | update_property.sql | `:uuid`, `:name`, `:tailwind_class`, `:css_style`, `:type`, `:origin` | Dynamic update |
| delete_property | delete_property.sql | `:uuid` | Cascades to `*_properties`; sets `*.property_id` NULL on `*_registry` |

## Relationship tables

### pages_registry

| Name | File | Params | Description |
|---|---|---|---|
| link_page_child | link_page_child.sql | `:page_id`, `:child_id`, `:child_type` | Idempotent insert (`child_type` ∈ `layout\|component`) |
| select_pages_registry_by_uuid | select_pages_registry_by_uuid.sql | `:uuid` | Fetch one row |
| select_pages_registry_all | select_pages_registry_all.sql | — | List all rows |
| list_pages_registry_by_page | list_pages_registry_by_page.sql | `:page_id` | List a page's children |
| update_pages_registry | update_pages_registry.sql | `:uuid`, `:page_id`, `:child_id`, `:child_type` | Dynamic update |
| delete_pages_registry | delete_pages_registry.sql | `:uuid` | Delete one row |

### layout_registry

A layout always contains components, so `child_type` is no longer stored — every row is a layout→component edge.

| Name | File | Params | Description |
|---|---|---|---|
| link_layout_child | link_layout_child.sql | `:layout_id`, `:child_id`, `:child_property` | Idempotent insert (`:child_property` Positioning/Spacing only) |
| select_layout_registry_by_uuid | select_layout_registry_by_uuid.sql | `:uuid` | Fetch one row |
| select_layout_registry_all | select_layout_registry_all.sql | — | List all rows |
| list_layout_registry_by_layout | list_layout_registry_by_layout.sql | `:layout_id` | List a layout's component children |
| update_layout_registry | update_layout_registry.sql | `:uuid`, `:layout_id`, `:child_id`, `:child_property` | Dynamic update (trigger-checked) |
| delete_layout_registry | delete_layout_registry.sql | `:uuid` | Delete one row |
| delete_layout_registry_by_layout | delete_layout_registry_by_layout.sql | `:layout_id` | Wipe a layout's children before re-syncing |

### layout_properties

| Name | File | Params | Description |
|---|---|---|---|
| link_layout_property | link_layout_property.sql | `:layout_id`, `:property_id` | Idempotent insert |
| select_layout_properties_by_uuid | select_layout_properties_by_uuid.sql | `:uuid` | Fetch one row |
| select_layout_properties_all | select_layout_properties_all.sql | — | List all rows |
| list_layout_properties_by_layout | list_layout_properties_by_layout.sql | `:layout_id` | List a layout's CSS properties |
| update_layout_properties | update_layout_properties.sql | `:uuid`, `:layout_id`, `:property_id` | Dynamic update |
| delete_layout_properties | delete_layout_properties.sql | `:uuid` | Delete one row |

### components_registry

Self-referential composition: parent component renders child component (React composition). `property_id` optionally records the spacing/positioning property applied to the child as rendered inside the parent.

| Name | File | Params | Description |
|---|---|---|---|
| link_component_child | link_component_child.sql | `:parent_id`, `:child_id`, `:property_id` | Idempotent on `(parent_id, child_id)` |
| select_components_registry_by_uuid | select_components_registry_by_uuid.sql | `:uuid` | Fetch one row |
| select_components_registry_all | select_components_registry_all.sql | — | List all rows |
| list_components_registry_by_parent | list_components_registry_by_parent.sql | `:parent_id` | List a parent component's children |
| update_components_registry | update_components_registry.sql | `:uuid`, `:parent_id`, `:child_id`, `:property_id` | Dynamic update |
| delete_components_registry | delete_components_registry.sql | `:uuid` | Delete one row |
| delete_components_registry_by_parent | delete_components_registry_by_parent.sql | `:parent_id` | Wipe a parent's children before re-syncing |

### components_properties

| Name | File | Params | Description |
|---|---|---|---|
| link_component_property | link_component_property.sql | `:component_id`, `:property_id`, `:state_id` | Idempotent on `(component_id, property_id, state_id)` |
| select_components_properties_by_uuid | select_components_properties_by_uuid.sql | `:uuid` | Fetch one row |
| select_components_properties_all | select_components_properties_all.sql | — | List all rows |
| list_components_properties_by_component | list_components_properties_by_component.sql | `:component_id` | List a component's property × state pairs |
| update_components_properties | update_components_properties.sql | `:uuid`, `:component_id`, `:property_id`, `:state_id` | Dynamic update |
| delete_components_properties | delete_components_properties.sql | `:uuid` | Delete one row |
