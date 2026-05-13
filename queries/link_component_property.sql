-- Params: :component_id, :property_id, :state_id
INSERT INTO components_properties (component_id, property_id, state_id)
VALUES (:component_id, :property_id, :state_id)
ON CONFLICT(component_id, property_id, state_id) DO NOTHING
RETURNING uuid;
