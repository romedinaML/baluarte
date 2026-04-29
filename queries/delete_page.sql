-- Params: :uuid
-- Cascades to pages_registry rows referencing this page.
DELETE FROM pages
WHERE uuid = :uuid
RETURNING uuid;
