-- Insert (or fetch) a pages row. Idempotent on file_key.
-- Params: :file_key, :edited_at
INSERT INTO pages (file_key, edited_at)
VALUES (:file_key, :edited_at)
ON CONFLICT(file_key) DO UPDATE
    SET edited_at = COALESCE(excluded.edited_at, pages.edited_at)
RETURNING uuid;
