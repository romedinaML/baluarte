-- Params: :uuid
SELECT uuid, figma_node, figma_url, reference_id, reference_type, type
FROM figma_nodes
WHERE uuid = :uuid;
