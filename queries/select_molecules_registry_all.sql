-- Params: (none)
SELECT uuid, molecule_id, child_id, property_id
FROM molecules_registry
ORDER BY molecule_id, child_id;
