-- Params: :atom_id
SELECT uuid, atom_id, figma_node, figma_url, name, variant, state_id
FROM atom_variants
WHERE atom_id = :atom_id
ORDER BY figma_node;
