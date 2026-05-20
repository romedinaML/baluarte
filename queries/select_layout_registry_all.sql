-- Params: (none)
SELECT uuid, layout_id, child_id, child_property
FROM layout_registry
ORDER BY layout_id, child_id;
