-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :component_id, :property_id, :state_id
UPDATE components_properties
SET component_id = COALESCE(:component_id, component_id),
    property_id  = COALESCE(:property_id,  property_id),
    state_id     = COALESCE(:state_id,     state_id)
WHERE uuid = :uuid
RETURNING uuid;
