-- Params: :page_id, :child_id, :child_type
INSERT INTO pages_registry (page_id, child_id, child_type)
VALUES (:page_id, :child_id, :child_type)
ON CONFLICT(page_id, child_type, child_id) DO NOTHING
RETURNING uuid;
