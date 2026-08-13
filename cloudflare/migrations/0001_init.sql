-- Roster and delivery history.
--
-- Birthdays are stored as the ISO date of birth, and matched on month+day so
-- the year is kept (useful later for "turning 21" style messages) without
-- affecting matching.

CREATE TABLE IF NOT EXISTS students (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  dob         TEXT NOT NULL,            -- YYYY-MM-DD
  birth_month INTEGER NOT NULL,         -- 1-12, denormalised for fast matching
  birth_day   INTEGER NOT NULL,         -- 1-31
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One entry per person. Case is normalised in the application layer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_students_email ON students(email);

-- The query the daily job runs.
CREATE INDEX IF NOT EXISTS idx_students_birthday ON students(birth_month, birth_day, active);

-- Every delivery attempt. A successful row for (email, occasion_date) is what
-- stops a second run on the same day from wishing anyone twice.
CREATE TABLE IF NOT EXISTS send_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL,
  name          TEXT NOT NULL,
  occasion_date TEXT NOT NULL,          -- YYYY-MM-DD the wish was for
  status        TEXT NOT NULL,          -- sent | failed | skipped
  detail        TEXT,
  source        TEXT NOT NULL DEFAULT 'daily',  -- daily | manual | one-off
  sent_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_send_log_once
  ON send_log(email, occasion_date) WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_send_log_recent ON send_log(sent_at DESC);
