-- List every molecule joined with its figma_nodes row.
-- No params.
SELECT f.figma_node, m.uuid, m.edited_at, m.content_diff_hash
FROM molecules m
JOIN figma_nodes f
  ON f.reference_id   = m.uuid
 AND f.reference_type = 'molecule';
