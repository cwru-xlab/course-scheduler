-- Adds the section_number column introduced alongside section_code.
-- Run against the Postgres DB used by the solver (DATABASE_URL).

ALTER TABLE sections ADD COLUMN IF NOT EXISTS section_number VARCHAR(16) NOT NULL DEFAULT '';
