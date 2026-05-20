-- List every component joined with its figma_nodes row.
-- No params.
SELECT f.figma_node, c.uuid, c.edited_at, c.content_diff_hash
FROM components c
JOIN figma_nodes f
  ON f.reference_id   = c.uuid
 AND f.reference_type = 'component';
