# Query index

Reusable SQL for `.data/baluarte.db`. Owned by `baluarte-remember` — every other skill calls into `baluarte-remember`, which executes these via bash `sqlite3`.

## Protocol

1. Before writing new SQL, scan this index. Match by **operation + table + bound parameters**.
2. If a match exists, run it:
   ```bash
   sqlite3 .data/baluarte.db <<'EOF'
   PRAGMA foreign_keys=ON;
   .parameter set :name 'Button'
   .parameter set :type 'static'
   .read queries/insert_atom.sql
   EOF
   ```
3. If no match, create `queries/<verb>_<table>[_<qualifier>].sql` using only `:bound_params` (no string interpolation), then append a row below.
4. **Bash `sqlite3` only.** No Python. No `node:sqlite`.

Naming: `<verb>_<table>[_<qualifier>].sql` — `verb` ∈ {`insert`, `select`, `list`, `update`, `delete`, `link`, `unlink`, `count`}.

Update queries use the **dynamic COALESCE pattern**: every column appears as `col = COALESCE(:col, col)`, so callers pass NULL for fields they don't want to change. Insert/upsert files for tables with natural keys (`pages.file_key`, `properties (name, type)`, `figma_nodes (reference_type, reference_id)`) are idempotent via `ON CONFLICT … DO UPDATE`.

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
| delete_storybook | delete_storybook.sql | `:uuid` | Sets `storybook_id = NULL` on referencing layouts/molecules/atoms |

### layouts

| Name | File | Params | Description |
|---|---|---|---|
| insert_layout | insert_layout.sql | `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash`, `:type` | Insert (returns uuid) |
| select_layout_by_uuid | select_layout_by_uuid.sql | `:uuid` | Fetch one row (incl. `content_diff_hash`) |
| select_layout_uuid_by_figma_node | select_layout_uuid_by_figma_node.sql | `:figma_node` | Resolve layout uuid by Figma node id |
| select_layouts_all | select_layouts_all.sql | — | List all layouts |
| list_layouts_with_figma_node | list_layouts_with_figma_node.sql | — | List `(figma_node, uuid, edited_at, content_diff_hash)` for every layout |
| update_layout | update_layout.sql | `:uuid`, `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash`, `:type` | Dynamic update (COALESCE pattern) |
| delete_layout | delete_layout.sql | `:uuid` | Cascades to `layout_registry`, `layout_properties`, `pages_registry` |

### molecules

| Name | File | Params | Description |
|---|---|---|---|
| insert_molecule | insert_molecule.sql | `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash`, `:type` | Insert (returns uuid) |
| select_molecule_by_uuid | select_molecule_by_uuid.sql | `:uuid` | Fetch one row (incl. `content_diff_hash`) |
| select_molecule_uuid_by_figma_node | select_molecule_uuid_by_figma_node.sql | `:figma_node` | Resolve molecule uuid by Figma node id |
| select_molecules_all | select_molecules_all.sql | — | List all molecules |
| list_molecules_with_figma_node | list_molecules_with_figma_node.sql | — | List `(figma_node, uuid, edited_at, content_diff_hash)` for every molecule |
| update_molecule | update_molecule.sql | `:uuid`, `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash`, `:type` | Dynamic update (COALESCE pattern) |
| delete_molecule | delete_molecule.sql | `:uuid` | Cascades to `molecules_registry`, `molecules_properties`, `molecule_variants` |

### atoms

| Name | File | Params | Description |
|---|---|---|---|
| insert_atom | insert_atom.sql | `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash`, `:type` | Insert (returns uuid) |
| select_atom_by_uuid | select_atom_by_uuid.sql | `:uuid` | Fetch one row (incl. `content_diff_hash`) |
| select_atom_uuid_by_figma_node | select_atom_uuid_by_figma_node.sql | `:figma_node` | Resolve atom uuid by Figma node id |
| select_atoms_all | select_atoms_all.sql | — | List all atoms |
| list_atoms_with_figma_node | list_atoms_with_figma_node.sql | — | List `(figma_node, uuid, edited_at, content_diff_hash)` for every atom |
| update_atom | update_atom.sql | `:uuid`, `:name`, `:storybook_id`, `:description`, `:edited_at`, `:content_diff_hash`, `:type` | Dynamic update (COALESCE pattern) |
| delete_atom | delete_atom.sql | `:uuid` | Cascades to `atoms_properties`, `atom_variants` |

### atom_variants

| Name | File | Params | Description |
|---|---|---|---|
| insert_atom_variant | insert_atom_variant.sql | `:atom_id`, `:figma_node`, `:figma_url`, `:name`, `:variant`, `:state_id` | Idempotent upsert by `(atom_id, figma_node)` |
| list_atom_variants_by_atom | list_atom_variants_by_atom.sql | `:atom_id` | List variants of an atom |
| delete_atom_variants_by_atom | delete_atom_variants_by_atom.sql | `:atom_id` | Wipe variants before re-syncing |

### molecule_variants

| Name | File | Params | Description |
|---|---|---|---|
| insert_molecule_variant | insert_molecule_variant.sql | `:molecule_id`, `:figma_node`, `:figma_url`, `:name`, `:variant`, `:state_id` | Idempotent upsert by `(molecule_id, figma_node)` |
| list_molecule_variants_by_molecule | list_molecule_variants_by_molecule.sql | `:molecule_id` | List variants of a molecule |
| delete_molecule_variants_by_molecule | delete_molecule_variants_by_molecule.sql | `:molecule_id` | Wipe variants before re-syncing |

### states

States are pre-seeded by `schema.sql`. The mutate queries below exist for completeness but should rarely be used.

| Name | File | Params | Description |
|---|---|---|---|
| select_state_by_uuid | select_state_by_uuid.sql | `:uuid` | Fetch one row |
| select_state_by_type | select_state_by_type.sql | `:type` | Fetch by type name |
| select_states_all | select_states_all.sql | — | List all states |
| update_state | update_state.sql | `:uuid`, `:type` | Dynamic update (rarely needed) |
| delete_state | delete_state.sql | `:uuid` | Cascades to `molecules_properties`, `atoms_properties` |

### figma_nodes

| Name | File | Params | Description |
|---|---|---|---|
| insert_figma_node | insert_figma_node.sql | `:figma_node`, `:figma_url`, `:reference_id`, `:reference_type`, `:type` | Upsert by `(reference_type, reference_id)`. `:type` ∈ Figma node-kind enum |
| select_figma_node_by_uuid | select_figma_node_by_uuid.sql | `:uuid` | Fetch one row |
| select_figma_node_for_reference | select_figma_node_for_reference.sql | `:reference_type`, `:reference_id` | Fetch by polymorphic ref |
| select_figma_nodes_all | select_figma_nodes_all.sql | — | List all figma_nodes |
| update_figma_node | update_figma_node.sql | `:uuid`, `:figma_node`, `:figma_url`, `:reference_id`, `:reference_type`, `:type` | Dynamic update |
| delete_figma_node | delete_figma_node.sql | `:uuid` | Delete one row |

### properties

| Name | File | Params | Description |
|---|---|---|---|
| insert_property | insert_property.sql | `:name`, `:tailwind_class`, `:css_style`, `:type`, `:origin` | Upsert by `(name, type)` |
| select_property_by_uuid | select_property_by_uuid.sql | `:uuid` | Fetch one row |
| select_properties_all | select_properties_all.sql | — | List all properties (ordered by type, name) |
| update_property | update_property.sql | `:uuid`, `:name`, `:tailwind_class`, `:css_style`, `:type`, `:origin` | Dynamic update |
| delete_property | delete_property.sql | `:uuid` | Cascades to `*_properties`; sets `*.property_id` NULL on `*_registry` |

## Relationship tables

### pages_registry

| Name | File | Params | Description |
|---|---|---|---|
| link_page_child | link_page_child.sql | `:page_id`, `:child_id`, `:child_type` | Idempotent insert |
| select_pages_registry_by_uuid | select_pages_registry_by_uuid.sql | `:uuid` | Fetch one row |
| select_pages_registry_all | select_pages_registry_all.sql | — | List all rows |
| list_pages_registry_by_page | list_pages_registry_by_page.sql | `:page_id` | List a page's children |
| update_pages_registry | update_pages_registry.sql | `:uuid`, `:page_id`, `:child_id`, `:child_type` | Dynamic update |
| delete_pages_registry | delete_pages_registry.sql | `:uuid` | Delete one row |

### layout_registry

| Name | File | Params | Description |
|---|---|---|---|
| link_layout_child | link_layout_child.sql | `:layout_id`, `:child_id`, `:child_type`, `:child_property` | Insert (Positioning/Spacing only via trigger) |
| select_layout_registry_by_uuid | select_layout_registry_by_uuid.sql | `:uuid` | Fetch one row |
| select_layout_registry_all | select_layout_registry_all.sql | — | List all rows |
| list_layout_registry_by_layout | list_layout_registry_by_layout.sql | `:layout_id` | List a layout's children |
| update_layout_registry | update_layout_registry.sql | `:uuid`, `:layout_id`, `:child_id`, `:child_type`, `:child_property` | Dynamic update (trigger-checked) |
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

### molecules_registry

| Name | File | Params | Description |
|---|---|---|---|
| link_molecule_child | link_molecule_child.sql | `:molecule_id`, `:child_id`, `:property_id` | Insert |
| select_molecules_registry_by_uuid | select_molecules_registry_by_uuid.sql | `:uuid` | Fetch one row |
| select_molecules_registry_all | select_molecules_registry_all.sql | — | List all rows |
| list_molecules_registry_by_molecule | list_molecules_registry_by_molecule.sql | `:molecule_id` | List a molecule's children |
| update_molecules_registry | update_molecules_registry.sql | `:uuid`, `:molecule_id`, `:child_id`, `:property_id` | Dynamic update |
| delete_molecules_registry | delete_molecules_registry.sql | `:uuid` | Delete one row |
| delete_molecules_registry_by_molecule | delete_molecules_registry_by_molecule.sql | `:molecule_id` | Wipe a molecule's children before re-syncing |

### molecules_properties

| Name | File | Params | Description |
|---|---|---|---|
| link_molecule_property | link_molecule_property.sql | `:molecule_id`, `:property_id`, `:state_id` | Idempotent insert |
| select_molecules_properties_by_uuid | select_molecules_properties_by_uuid.sql | `:uuid` | Fetch one row |
| select_molecules_properties_all | select_molecules_properties_all.sql | — | List all rows |
| list_molecules_properties_by_molecule | list_molecules_properties_by_molecule.sql | `:molecule_id` | List a molecule's property × state pairs |
| update_molecules_properties | update_molecules_properties.sql | `:uuid`, `:molecule_id`, `:property_id`, `:state_id` | Dynamic update |
| delete_molecules_properties | delete_molecules_properties.sql | `:uuid` | Delete one row |

### atoms_properties

| Name | File | Params | Description |
|---|---|---|---|
| link_atom_property | link_atom_property.sql | `:atom_id`, `:property_id`, `:state_id` | Idempotent insert |
| select_atoms_properties_by_uuid | select_atoms_properties_by_uuid.sql | `:uuid` | Fetch one row |
| select_atoms_properties_all | select_atoms_properties_all.sql | — | List all rows |
| list_atoms_properties_by_atom | list_atoms_properties_by_atom.sql | `:atom_id` | List an atom's property × state pairs |
| update_atoms_properties | update_atoms_properties.sql | `:uuid`, `:atom_id`, `:property_id`, `:state_id` | Dynamic update |
| delete_atoms_properties | delete_atoms_properties.sql | `:uuid` | Delete one row |
