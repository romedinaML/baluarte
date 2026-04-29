-- Params: :reference_type, :reference_id
SELECT uuid, figma_node, figma_url, reference_id, reference_type
FROM figma_nodes
WHERE reference_type = :reference_type
  AND reference_id   = :reference_id;
