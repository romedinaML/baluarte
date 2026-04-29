-- Params: :layout_id
SELECT uuid, layout_id, property_id
FROM layout_properties
WHERE layout_id = :layout_id
ORDER BY property_id;
