-- One-time production fix when sections table predates dev branch schema.
-- Run against the Postgres DB used by the solver (DATABASE_URL).

ALTER TABLE sections ADD COLUMN IF NOT EXISTS department VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE sections ADD COLUMN IF NOT EXISTS previous_meeting_pattern VARCHAR;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS state VARCHAR(16) NOT NULL DEFAULT 'active';
