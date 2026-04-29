-- Params: :uuid
DELETE FROM pages_registry
WHERE uuid = :uuid
RETURNING uuid;
