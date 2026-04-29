-- Params: :layout_id, :child_id, :child_type, :child_property (nullable; must be Positioning/Spacing if set)
INSERT INTO layout_registry (layout_id, child_id, child_type, child_property)
VALUES (:layout_id, :child_id, :child_type, :child_property)
RETURNING uuid;
