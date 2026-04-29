-- Params: :uuid
SELECT uuid, molecule_id, child_id, property_id
FROM molecules_registry
WHERE uuid = :uuid;
