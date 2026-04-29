-- Params: :molecule_id
SELECT uuid, molecule_id, property_id, state_id
FROM molecules_properties
WHERE molecule_id = :molecule_id
ORDER BY property_id, state_id;
