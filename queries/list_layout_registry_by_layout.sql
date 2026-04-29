-- Params: :layout_id
SELECT uuid, layout_id, child_id, child_type, child_property
FROM layout_registry
WHERE layout_id = :layout_id
ORDER BY child_type, child_id;
