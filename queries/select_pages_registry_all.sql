-- Params: (none)
SELECT uuid, page_id, child_id, child_type
FROM pages_registry
ORDER BY page_id, child_type, child_id;
