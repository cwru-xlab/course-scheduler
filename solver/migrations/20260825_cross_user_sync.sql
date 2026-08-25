-- Cross-user sync state for the Weatherhead Scheduler (shared across Next.js replicas).
-- Optional: db.create_all() also creates these tables on solver boot.
-- Run against the Postgres DB used by the solver (DATABASE_URL) if you prefer
-- explicit migrations over create_all.

CREATE TABLE IF NOT EXISTS shared_schedule_state (
  id       INTEGER PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  ran_by   VARCHAR(256),
  ran_at   BIGINT,
  snapshot JSONB
);

CREATE TABLE IF NOT EXISTS activity_events (
  id          VARCHAR(64) PRIMARY KEY,
  network_id  VARCHAR(64) NOT NULL,
  actor_name  VARCHAR(256) NOT NULL,
  kind        VARCHAR(64) NOT NULL,
  message     VARCHAR(512) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_activity_events_created_at
  ON activity_events (created_at DESC);

CREATE TABLE IF NOT EXISTS scheduling_data_revision (
  id                            INTEGER PRIMARY KEY,
  last_modified_by_network_id   VARCHAR(64) NOT NULL,
  last_modified_by_name         VARCHAR(256) NOT NULL,
  last_modified_at              VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS solver_session_lock (
  id                      INTEGER PRIMARY KEY,
  locked                  BOOLEAN NOT NULL DEFAULT FALSE,
  run_id                  VARCHAR(64),
  progress                INTEGER NOT NULL DEFAULT 0,
  status                  VARCHAR(32) NOT NULL DEFAULT 'idle',
  started_by              VARCHAR(256),
  started_by_network_id   VARCHAR(64),
  started_at              BIGINT,
  error                   TEXT,
  expires_at              BIGINT,
  cancel_requested        BOOLEAN NOT NULL DEFAULT FALSE
);
