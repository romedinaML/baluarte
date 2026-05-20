-- Params: :figma_node
SELECT c.uuid
FROM components c
JOIN figma_nodes f
  ON f.reference_id   = c.uuid
 AND f.reference_type = 'component'
WHERE f.figma_node = :figma_node;
