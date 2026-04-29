-- Params: :uuid
DELETE FROM molecules_registry
WHERE uuid = :uuid
RETURNING uuid;
