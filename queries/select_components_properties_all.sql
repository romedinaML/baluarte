-- Params: (none)
SELECT uuid, component_id, property_id, state_id
FROM components_properties
ORDER BY component_id, property_id, state_id;
