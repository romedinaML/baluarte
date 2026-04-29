-- Params: :uuid
SELECT uuid, type
FROM states
WHERE uuid = :uuid;
