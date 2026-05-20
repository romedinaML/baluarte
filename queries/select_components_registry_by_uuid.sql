-- Params: :uuid
SELECT uuid, parent_id, child_id, property_id
FROM components_registry
WHERE uuid = :uuid;
