-- Params: :uuid
-- Cascades to molecules_registry and molecules_properties.
DELETE FROM molecules
WHERE uuid = :uuid
RETURNING uuid;
