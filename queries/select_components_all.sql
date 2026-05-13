-- Params: (none)
SELECT uuid, name, storybook_id, description, edited_at, content_diff_hash, created_at
FROM components
ORDER BY name;
