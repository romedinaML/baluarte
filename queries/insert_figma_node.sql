-- Insert (or update) a figma_nodes row. Idempotent on (reference_type, reference_id).
-- Params: :figma_node, :figma_url, :reference_id, :reference_type
INSERT INTO figma_nodes (figma_node, figma_url, reference_id, reference_type)
VALUES (:figma_node, :figma_url, :reference_id, :reference_type)
ON CONFLICT(reference_type, reference_id) DO UPDATE
    SET figma_node = excluded.figma_node,
        figma_url  = excluded.figma_url
RETURNING uuid;
