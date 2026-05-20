-- Params: :name, :storybook_id, :description, :intent_json, :edited_at, :content_diff_hash
INSERT INTO layouts (name, storybook_id, description, intent_json, edited_at, content_diff_hash)
VALUES (:name, :storybook_id, :description, :intent_json, :edited_at, :content_diff_hash)
RETURNING uuid;
