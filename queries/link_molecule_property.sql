-- Params: :molecule_id, :property_id, :state_id
INSERT INTO molecules_properties (molecule_id, property_id, state_id)
VALUES (:molecule_id, :property_id, :state_id)
ON CONFLICT(molecule_id, property_id, state_id) DO NOTHING
RETURNING uuid;
