-- States are pre-seeded by schema.sql; updating one will rewrite every reference.
-- Use only when extending the schema (and the new value must already be in the CHECK enum).
-- Params: :uuid, :type
UPDATE states
SET type = COALESCE(:type, type)
WHERE uuid = :uuid
RETURNING uuid;
