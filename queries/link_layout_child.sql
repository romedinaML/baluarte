-- Idempotent: a layout always contains components, so child_type is implicit.
-- :child_property is optional and must point to a Positioning/Spacing property (trigger-enforced).
-- Params: :layout_id, :child_id, :child_property
INSERT INTO layout_registry (layout_id, child_id, child_property)
VALUES (:layout_id, :child_id, :child_property)
ON CONFLICT(layout_id, child_id) DO UPDATE
    SET child_property = COALESCE(excluded.child_property, layout_registry.child_property)
RETURNING uuid;
