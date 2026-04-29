-- Params: :file_key
SELECT uuid, file_key, edited_at, created_at
FROM pages
WHERE file_key = :file_key;
