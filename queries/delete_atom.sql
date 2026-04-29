-- Params: :uuid
-- Cascades to atoms_properties.
DELETE FROM atoms
WHERE uuid = :uuid
RETURNING uuid;
