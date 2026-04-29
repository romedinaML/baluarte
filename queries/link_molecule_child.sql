-- Params: :molecule_id, :child_id, :property_id
INSERT INTO molecules_registry (molecule_id, child_id, property_id)
VALUES (:molecule_id, :child_id, :property_id)
RETURNING uuid;
