-- Dynamic update: pass NULL for any field you don't want to change.
-- Params: :uuid, :name, :tailwind_class, :css_style, :type, :origin
UPDATE properties
SET name           = COALESCE(:name,           name),
    tailwind_class = COALESCE(:tailwind_class, tailwind_class),
    css_style      = COALESCE(:css_style,      css_style),
    type           = COALESCE(:type,           type),
    origin         = COALESCE(:origin,         origin)
WHERE uuid = :uuid
RETURNING uuid;
