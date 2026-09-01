-- Stores solver/calendar-resolved half for half_any sections.
-- Run against the Postgres DB used by the solver (DATABASE_URL).

ALTER TABLE sections ADD COLUMN IF NOT EXISTS assigned_half VARCHAR(16);
