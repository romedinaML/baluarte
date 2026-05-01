-- Resolve a molecule uuid from a Figma node id.
-- Params: :figma_node
SELECT reference_id AS uuid
FROM figma_nodes
WHERE figma_node     = :figma_node
  AND reference_type = 'molecule';
