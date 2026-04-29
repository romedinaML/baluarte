-- Params: :uuid
DELETE FROM layout_properties
WHERE uuid = :uuid
RETURNING uuid;
