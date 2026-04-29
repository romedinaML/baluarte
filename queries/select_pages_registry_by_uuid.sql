-- Params: :uuid
SELECT uuid, page_id, child_id, child_type
FROM pages_registry
WHERE uuid = :uuid;
