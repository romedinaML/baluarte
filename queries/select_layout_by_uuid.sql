-- Params: :uuid
SELECT uuid, name, storybook_id, description, edited_at, content_diff_hash, created_at, type
FROM layouts
WHERE uuid = :uuid;
