-- Params: :uuid
SELECT uuid, atom_id, property_id, state_id
FROM atoms_properties
WHERE uuid = :uuid;
