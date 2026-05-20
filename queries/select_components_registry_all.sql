-- Params: (none)
SELECT uuid, parent_id, child_id, property_id
FROM components_registry
ORDER BY parent_id, child_id;
