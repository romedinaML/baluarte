-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :name, :storybook_id, :description, :intent_json, :edited_at, :content_diff_hash
UPDATE components
SET name              = COALESCE(:name,              name),
    storybook_id      = COALESCE(:storybook_id,      storybook_id),
    description       = COALESCE(:description,       description),
    intent_json       = COALESCE(:intent_json,       intent_json),
    edited_at         = COALESCE(:edited_at,         edited_at),
    content_diff_hash = COALESCE(:content_diff_hash, content_diff_hash)
WHERE uuid = :uuid
RETURNING uuid;
