-- Params: :uuid
-- Cascades to layout_registry, layout_properties, and any pages_registry rows referencing this layout.
DELETE FROM layouts
WHERE uuid = :uuid
RETURNING uuid;
