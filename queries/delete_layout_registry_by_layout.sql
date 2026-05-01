-- Remove every layout_registry row for a layout (used before re-syncing children).
-- Params: :layout_id
DELETE FROM layout_registry
WHERE layout_id = :layout_id;
