-- Params: :component_id
SELECT uuid, component_id, figma_node, figma_url, name, variant, state_id
FROM component_variants
WHERE component_id = :component_id
ORDER BY variant, figma_node;
