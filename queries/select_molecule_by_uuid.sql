-- Params: :uuid
SELECT uuid, name, storybook_id, description, edited_at, content_diff_hash, created_at, type
FROM molecules
WHERE uuid = :uuid;
