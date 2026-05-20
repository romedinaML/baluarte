-- Params: (none)
SELECT uuid, name, storybook_id, description, intent_json, edited_at, content_diff_hash, created_at
FROM layouts
ORDER BY created_at;
