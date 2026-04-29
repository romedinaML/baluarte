-- Params: :name, :storybook_id, :description, :edited_at, :type
INSERT INTO atoms (name, storybook_id, description, edited_at, type)
VALUES (:name, :storybook_id, :description, :edited_at, :type)
RETURNING uuid;
