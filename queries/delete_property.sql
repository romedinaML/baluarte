-- Params: :uuid
-- Cascades to layout_properties, molecules_properties, atoms_properties.
-- layout_registry.child_property and molecules_registry.property_id will be SET NULL.
DELETE FROM properties
WHERE uuid = :uuid
RETURNING uuid;
