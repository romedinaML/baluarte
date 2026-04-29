-- Params: :uuid
-- layouts/molecules/atoms.storybook_id will be SET NULL.
DELETE FROM storybook
WHERE uuid = :uuid
RETURNING uuid;
