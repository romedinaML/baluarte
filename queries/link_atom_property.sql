-- Params: :atom_id, :property_id, :state_id
INSERT INTO atoms_properties (atom_id, property_id, state_id)
VALUES (:atom_id, :property_id, :state_id)
ON CONFLICT(atom_id, property_id, state_id) DO NOTHING
RETURNING uuid;
