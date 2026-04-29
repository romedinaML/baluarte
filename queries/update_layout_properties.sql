-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :layout_id, :property_id
UPDATE layout_properties
SET layout_id   = COALESCE(:layout_id,   layout_id),
    property_id = COALESCE(:property_id, property_id)
WHERE uuid = :uuid
RETURNING uuid;
