-- List every atom joined with its figma_nodes row.
-- No params.
SELECT f.figma_node, a.uuid, a.edited_at, a.content_diff_hash
FROM atoms a
JOIN figma_nodes f
  ON f.reference_id   = a.uuid
 AND f.reference_type = 'atom';
