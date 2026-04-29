-- Params: :type
SELECT uuid, type
FROM states
WHERE type = :type;
