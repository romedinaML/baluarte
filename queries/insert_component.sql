-- Params: :name, :storybook_id, :description, :edited_at, :content_diff_hash
INSERT INTO components (name, storybook_id, description, edited_at, content_diff_hash)
VALUES (:name, :storybook_id, :description, :edited_at, :content_diff_hash)
RETURNING uuid;
