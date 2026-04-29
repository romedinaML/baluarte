-- Params: :uuid
DELETE FROM figma_nodes
WHERE uuid = :uuid
RETURNING uuid;
