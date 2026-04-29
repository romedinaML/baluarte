-- Params: :uuid
DELETE FROM atoms_properties
WHERE uuid = :uuid
RETURNING uuid;
