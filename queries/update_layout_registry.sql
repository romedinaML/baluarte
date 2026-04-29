-- Dynamic update: pass NULL for any field you don't want to change.
-- :child_property must point to a Positioning/Spacing property (trigger-enforced).
-- Params: :uuid, :layout_id, :child_id, :child_type, :child_property
UPDATE layout_registry
SET layout_id      = COALESCE(:layout_id,      layout_id),
    child_id       = COALESCE(:child_id,       child_id),
    child_type     = COALESCE(:child_type,     child_type),
    child_property = COALESCE(:child_property, child_property)
WHERE uuid = :uuid
RETURNING uuid;
