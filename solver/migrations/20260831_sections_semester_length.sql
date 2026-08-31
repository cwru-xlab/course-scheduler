-- Whether a section meets the full semester or a half-semester window.
-- Values: full, half_any, first_half, second_half.

ALTER TABLE sections ADD COLUMN IF NOT EXISTS semester_length VARCHAR(32) NOT NULL DEFAULT 'full';
