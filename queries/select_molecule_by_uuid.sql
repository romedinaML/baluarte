-- Params: :uuid
SELECT uuid, name, storybook_id, description, edited_at, created_at, type
FROM molecules
WHERE uuid = :uuid;
