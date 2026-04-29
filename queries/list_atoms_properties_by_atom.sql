-- Params: :atom_id
SELECT uuid, atom_id, property_id, state_id
FROM atoms_properties
WHERE atom_id = :atom_id
ORDER BY property_id, state_id;
