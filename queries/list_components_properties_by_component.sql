-- Params: :component_id
SELECT uuid, component_id, property_id, state_id
FROM components_properties
WHERE component_id = :component_id
ORDER BY property_id, state_id;
