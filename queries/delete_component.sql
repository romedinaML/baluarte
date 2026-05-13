-- Params: :uuid
-- Cascades to components_properties, components_registry, component_variants,
-- and clears figma_nodes / pages_registry references via app logic.
DELETE FROM components WHERE uuid = :uuid;
