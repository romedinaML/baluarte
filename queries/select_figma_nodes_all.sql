-- Params: (none)
SELECT uuid, figma_node, figma_url, reference_id, reference_type
FROM figma_nodes
ORDER BY reference_type, reference_id;
