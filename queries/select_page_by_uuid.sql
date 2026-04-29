-- Params: :uuid
SELECT uuid, file_key, edited_at, created_at
FROM pages
WHERE uuid = :uuid;
