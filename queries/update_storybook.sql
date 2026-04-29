-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :name, :url_local, :url_prod, :src_ref
UPDATE storybook
SET name      = COALESCE(:name,      name),
    url_local = COALESCE(:url_local, url_local),
    url_prod  = COALESCE(:url_prod,  url_prod),
    src_ref   = COALESCE(:src_ref,   src_ref)
WHERE uuid = :uuid
RETURNING uuid;
