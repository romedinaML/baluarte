-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :file_key, :edited_at
UPDATE pages
SET file_key  = COALESCE(:file_key,  file_key),
    edited_at = COALESCE(:edited_at, edited_at)
WHERE uuid = :uuid
RETURNING uuid;
