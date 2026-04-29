-- Insert (or fetch) a properties row. Idempotent on (name, type).
-- Params: :name, :tailwind_class, :css_style, :type, :origin
INSERT INTO properties (name, tailwind_class, css_style, type, origin)
VALUES (:name, :tailwind_class, :css_style, :type, :origin)
ON CONFLICT(name, type) DO UPDATE
    SET tailwind_class = excluded.tailwind_class,
        css_style      = excluded.css_style,
        origin         = excluded.origin
RETURNING uuid;
