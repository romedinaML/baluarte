-- Idempotent self-referential composition: parent component renders child component.
-- Params: :parent_id, :child_id, :property_id (nullable)
INSERT INTO components_registry (parent_id, child_id, property_id)
VALUES (:parent_id, :child_id, :property_id)
ON CONFLICT(parent_id, child_id) DO UPDATE
    SET property_id = COALESCE(excluded.property_id, components_registry.property_id)
RETURNING uuid;
