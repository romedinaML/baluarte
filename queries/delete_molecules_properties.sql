-- Params: :uuid
DELETE FROM molecules_properties
WHERE uuid = :uuid
RETURNING uuid;
