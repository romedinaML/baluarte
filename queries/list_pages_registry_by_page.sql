-- Params: :page_id
SELECT uuid, page_id, child_id, child_type
FROM pages_registry
WHERE page_id = :page_id
ORDER BY child_type, child_id;
