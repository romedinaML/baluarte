-- Params: :uuid
-- Cascades to molecules_properties and atoms_properties referencing this state.
-- States are pre-seeded; deleting one removes every property-state pair using it.
DELETE FROM states
WHERE uuid = :uuid
RETURNING uuid;
