-- Params: :parent_id
SELECT uuid, parent_id, child_id, property_id
FROM components_registry
WHERE parent_id = :parent_id
ORDER BY child_id;
