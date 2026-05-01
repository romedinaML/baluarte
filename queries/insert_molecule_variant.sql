-- Idempotent variant upsert. Params: :molecule_id, :figma_node, :figma_url, :name, :variant, :state_id
INSERT INTO molecule_variants (molecule_id, figma_node, figma_url, name, variant, state_id)
VALUES (:molecule_id, :figma_node, :figma_url, :name, :variant, :state_id)
ON CONFLICT(molecule_id, figma_node) DO UPDATE
    SET figma_url = excluded.figma_url,
        name      = excluded.name,
        variant   = excluded.variant,
        state_id  = excluded.state_id
RETURNING uuid;
