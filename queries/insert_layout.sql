-- Params: :name, :storybook_id, :description, :edited_at, :content_diff_hash, :type
INSERT INTO layouts (name, storybook_id, description, edited_at, content_diff_hash, type)
VALUES (:name, :storybook_id, :description, :edited_at, :content_diff_hash, :type)
RETURNING uuid;
