-- Params: :molecule_id
SELECT uuid, molecule_id, child_id, property_id
FROM molecules_registry
WHERE molecule_id = :molecule_id
ORDER BY child_id;
