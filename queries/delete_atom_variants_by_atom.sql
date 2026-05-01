-- Wipe every variant of an atom (used before re-syncing).
-- Params: :atom_id
DELETE FROM atom_variants
WHERE atom_id = :atom_id;
