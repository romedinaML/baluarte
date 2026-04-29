-- Params: :uuid
DELETE FROM layout_registry
WHERE uuid = :uuid
RETURNING uuid;
