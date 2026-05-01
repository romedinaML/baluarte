-- Insert (or fetch) a properties row. Idempotent on (name, type).
-- Params: :name, :tailwind_class, :css_style, :type, :origin, :figma_variable_id
-- A Custom upsert against a row previously seeded as a Figma Variable cannot
-- blank the variable id (COALESCE preserves the existing value).
INSERT INTO properties (name, tailwind_class, css_style, type, origin, figma_variable_id)
VALUES (:name, :tailwind_class, :css_style, :type, :origin, :figma_variable_id)
ON CONFLICT(name, type) DO UPDATE
    SET tailwind_class    = excluded.tailwind_class,
        css_style         = excluded.css_style,
        origin            = excluded.origin,
        figma_variable_id = COALESCE(properties.figma_variable_id, excluded.figma_variable_id)
RETURNING uuid;
