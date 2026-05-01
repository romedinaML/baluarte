-- Wipe every variant of a molecule (used before re-syncing).
-- Params: :molecule_id
DELETE FROM molecule_variants
WHERE molecule_id = :molecule_id;
