-- Idempotent variant upsert. Params: :component_id, :figma_node, :figma_url, :name, :variant, :state_id
INSERT INTO component_variants (component_id, figma_node, figma_url, name, variant, state_id)
VALUES (:component_id, :figma_node, :figma_url, :name, :variant, :state_id)
ON CONFLICT(component_id, figma_node) DO UPDATE
    SET figma_url = excluded.figma_url,
        name      = excluded.name,
        variant   = excluded.variant,
        state_id  = excluded.state_id
RETURNING uuid;
