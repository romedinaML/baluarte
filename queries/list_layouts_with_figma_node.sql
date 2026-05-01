-- List every layout joined with its figma_nodes row.
-- No params.
SELECT f.figma_node, l.uuid, l.edited_at, l.content_diff_hash
FROM layouts l
JOIN figma_nodes f
  ON f.reference_id   = l.uuid
 AND f.reference_type = 'layout';
