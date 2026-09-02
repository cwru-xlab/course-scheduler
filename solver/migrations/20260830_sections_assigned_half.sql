-- Add assigned_half for resolved half_any sections (first_half | second_half | null).
ALTER TABLE sections ADD COLUMN IF NOT EXISTS assigned_half VARCHAR(16);
