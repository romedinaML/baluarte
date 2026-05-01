-- Idempotent variant upsert. Params: :atom_id, :figma_node, :figma_url, :name, :variant, :state_id
INSERT INTO atom_variants (atom_id, figma_node, figma_url, name, variant, state_id)
VALUES (:atom_id, :figma_node, :figma_url, :name, :variant, :state_id)
ON CONFLICT(atom_id, figma_node) DO UPDATE
    SET figma_url = excluded.figma_url,
        name      = excluded.name,
        variant   = excluded.variant,
        state_id  = excluded.state_id
RETURNING uuid;
