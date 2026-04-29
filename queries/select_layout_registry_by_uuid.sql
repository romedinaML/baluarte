-- Params: :uuid
SELECT uuid, layout_id, child_id, child_type, child_property
FROM layout_registry
WHERE uuid = :uuid;
