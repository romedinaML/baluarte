-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :page_id, :child_id, :child_type
UPDATE pages_registry
SET page_id    = COALESCE(:page_id,    page_id),
    child_id   = COALESCE(:child_id,   child_id),
    child_type = COALESCE(:child_type, child_type)
WHERE uuid = :uuid
RETURNING uuid;
