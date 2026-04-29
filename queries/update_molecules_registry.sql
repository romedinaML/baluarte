-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :molecule_id, :child_id, :property_id
UPDATE molecules_registry
SET molecule_id = COALESCE(:molecule_id, molecule_id),
    child_id    = COALESCE(:child_id,    child_id),
    property_id = COALESCE(:property_id, property_id)
WHERE uuid = :uuid
RETURNING uuid;
