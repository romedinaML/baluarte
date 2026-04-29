-- Params: :layout_id, :property_id
INSERT INTO layout_properties (layout_id, property_id)
VALUES (:layout_id, :property_id)
ON CONFLICT(layout_id, property_id) DO NOTHING
RETURNING uuid;
