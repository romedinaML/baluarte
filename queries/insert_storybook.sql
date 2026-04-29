-- Params: :name, :url_local, :url_prod, :src_ref
INSERT INTO storybook (name, url_local, url_prod, src_ref)
VALUES (:name, :url_local, :url_prod, :src_ref)
RETURNING uuid;
