-- Params: (none)
SELECT uuid, molecule_id, property_id, state_id
FROM molecules_properties
ORDER BY molecule_id, property_id, state_id;
