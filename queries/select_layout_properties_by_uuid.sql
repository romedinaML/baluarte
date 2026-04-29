-- Params: :uuid
SELECT uuid, layout_id, property_id
FROM layout_properties
WHERE uuid = :uuid;
