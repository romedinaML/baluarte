-- Remove every molecules_registry row for a molecule (used before re-syncing children).
-- Params: :molecule_id
DELETE FROM molecules_registry
WHERE molecule_id = :molecule_id;
