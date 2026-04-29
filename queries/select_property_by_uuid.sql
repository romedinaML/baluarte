-- Params: :uuid
SELECT uuid, name, tailwind_class, css_style, type, origin
FROM properties
WHERE uuid = :uuid;
