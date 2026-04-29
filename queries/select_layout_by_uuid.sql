-- Params: :uuid
SELECT uuid, name, storybook_id, description, edited_at, created_at, type
FROM layouts
WHERE uuid = :uuid;
