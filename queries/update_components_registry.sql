-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :parent_id, :child_id, :property_id
UPDATE components_registry
SET parent_id   = COALESCE(:parent_id,   parent_id),
    child_id    = COALESCE(:child_id,    child_id),
    property_id = COALESCE(:property_id, property_id)
WHERE uuid = :uuid
RETURNING uuid;
