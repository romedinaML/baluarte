-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :molecule_id, :property_id, :state_id
UPDATE molecules_properties
SET molecule_id = COALESCE(:molecule_id, molecule_id),
    property_id = COALESCE(:property_id, property_id),
    state_id    = COALESCE(:state_id,    state_id)
WHERE uuid = :uuid
RETURNING uuid;
