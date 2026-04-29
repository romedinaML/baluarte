-- Params: :uuid
SELECT uuid, molecule_id, property_id, state_id
FROM molecules_properties
WHERE uuid = :uuid;
