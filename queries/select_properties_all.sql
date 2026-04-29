-- Params: (none)
SELECT uuid, name, tailwind_class, css_style, type, origin
FROM properties
ORDER BY type, name;
