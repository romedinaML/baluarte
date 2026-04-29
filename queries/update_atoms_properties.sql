-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :atom_id, :property_id, :state_id
UPDATE atoms_properties
SET atom_id     = COALESCE(:atom_id,     atom_id),
    property_id = COALESCE(:property_id, property_id),
    state_id    = COALESCE(:state_id,    state_id)
WHERE uuid = :uuid
RETURNING uuid;
