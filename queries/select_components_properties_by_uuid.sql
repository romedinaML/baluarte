-- Params: :uuid
SELECT uuid, component_id, property_id, state_id
FROM components_properties
WHERE uuid = :uuid;
