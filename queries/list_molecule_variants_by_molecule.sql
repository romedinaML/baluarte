-- Params: :molecule_id
SELECT uuid, molecule_id, figma_node, figma_url, name, variant, state_id
FROM molecule_variants
WHERE molecule_id = :molecule_id
ORDER BY figma_node;
