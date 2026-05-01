-- Params: :uuid
SELECT uuid, name, tailwind_class, css_style, type, origin, figma_variable_id
FROM properties
WHERE uuid = :uuid;
