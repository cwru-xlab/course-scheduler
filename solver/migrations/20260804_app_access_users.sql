-- CaseID access allowlist for the Weatherhead Scheduler web app.
-- Run against the Postgres DB used by the solver (DATABASE_URL) BEFORE enabling
-- the platform access gate, and seed at least one 'active' caseID (yours).

CREATE TABLE IF NOT EXISTS app_access_users (
  network_id   VARCHAR(64) PRIMARY KEY,          -- lowercase caseID, e.g. abc123
  access_tier  VARCHAR(16) NOT NULL,             -- 'active' | 'developer'
  display_name VARCHAR(256),
  added_by     VARCHAR(64),                      -- caseID who added them (nullable for seeds)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT app_access_users_tier_chk
    CHECK (access_tier IN ('active', 'developer'))
);

CREATE INDEX IF NOT EXISTS ix_app_access_users_tier
  ON app_access_users (access_tier);

-- Seed examples — replace with real caseIDs before cutover:
-- INSERT INTO app_access_users (network_id, access_tier, display_name, added_by)
-- VALUES
--   ('abc123', 'active', 'Your Name', NULL),
--   ('devcase1', 'developer', 'Dev Person', NULL)
-- ON CONFLICT (network_id) DO NOTHING;

-- Ops-only developer management (not available in the app UI):
-- INSERT INTO app_access_users (network_id, access_tier) VALUES ('xyz123', 'developer');
-- DELETE FROM app_access_users WHERE network_id = 'xyz123' AND access_tier = 'developer';
-- UPDATE app_access_users SET access_tier = 'active', updated_at = NOW() WHERE network_id = 'xyz123';
