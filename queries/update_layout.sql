-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :name, :storybook_id, :description, :edited_at, :content_diff_hash, :type
UPDATE layouts
SET name              = COALESCE(:name,              name),
    storybook_id      = COALESCE(:storybook_id,      storybook_id),
    description       = COALESCE(:description,       description),
    edited_at         = COALESCE(:edited_at,         edited_at),
    content_diff_hash = COALESCE(:content_diff_hash, content_diff_hash),
    type              = COALESCE(:type,              type)
WHERE uuid = :uuid
RETURNING uuid;
