-- Params: :uuid
SELECT uuid, name, url_local, url_prod, src_ref
FROM storybook
WHERE uuid = :uuid;
