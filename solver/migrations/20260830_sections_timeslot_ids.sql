-- Adds multi-day timeslot_ids array on sections (legacy timeslot_id remains for FK).
-- Run against the Postgres DB used by the solver (DATABASE_URL).

ALTER TABLE sections ADD COLUMN IF NOT EXISTS timeslot_ids JSON NOT NULL DEFAULT '[]';

-- Backfill from legacy single timeslot_id where the array is still empty.
UPDATE sections
SET timeslot_ids = json_build_array(timeslot_id)
WHERE timeslot_id IS NOT NULL
  AND (timeslot_ids IS NULL OR timeslot_ids = '[]'::json);
