-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :figma_node, :figma_url, :reference_id, :reference_type, :type
UPDATE figma_nodes
SET figma_node     = COALESCE(:figma_node,     figma_node),
    figma_url      = COALESCE(:figma_url,      figma_url),
    reference_id   = COALESCE(:reference_id,   reference_id),
    reference_type = COALESCE(:reference_type, reference_type),
    type           = COALESCE(:type,           type)
WHERE uuid = :uuid
RETURNING uuid;
