-- Resolve a properties row from a Figma variable id (e.g. "VariableID:abc/123").
-- Used to map `boundVariables.<field>.id` references back to a property uuid.
-- Params: :figma_variable_id
SELECT uuid, name, tailwind_class, css_style, type, origin, figma_variable_id
FROM properties
WHERE figma_variable_id = :figma_variable_id;
