-- ============================================================
-- SlidePlay PostgreSQL Migration: Simple Tables
-- Run this first before the sessions/payments migration.
-- Compatible with PostgreSQL 13+
-- ============================================================

-- Enable uuid generation (run once per database)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. USERS
--    Bridge between Firebase Auth (firebase_uid) and the DB.
--    Insert a row here after every successful Firebase signup.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid  TEXT        UNIQUE NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  username      TEXT,
  display_name  TEXT,
  role          TEXT        NOT NULL DEFAULT 'student'
                            CHECK (role IN ('teacher', 'student', 'admin')),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users (firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_role         ON users (role);

-- ============================================================
-- 2. USER_SETTINGS
--    One row per user. Replaces localStorage theme/prefs.
--    Created automatically when user row is inserted.
-- ============================================================
CREATE TABLE IF NOT EXISTS user_settings (
  user_id          UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  theme            TEXT        NOT NULL DEFAULT 'dark-mode',
  notifications_on BOOLEAN     NOT NULL DEFAULT true,
  sound_on         BOOLEAN     NOT NULL DEFAULT true,
  language         TEXT        NOT NULL DEFAULT 'en',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create default settings when a user is added
CREATE OR REPLACE FUNCTION create_default_settings()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO user_settings (user_id) VALUES (NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_settings ON users;
CREATE TRIGGER trg_default_settings
  AFTER INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION create_default_settings();

-- ============================================================
-- 3. LEADERBOARD
--    Best score per user per game.
--    Replaces the MongoDB /api/leaderboard/:game endpoint.
--    UPSERT: update if the new score beats the old best.
-- ============================================================
CREATE TABLE IF NOT EXISTS leaderboard (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game        TEXT        NOT NULL,
  best_score  INT         NOT NULL DEFAULT 0,
  play_count  INT         NOT NULL DEFAULT 1,
  last_played TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_game       ON leaderboard (game);
CREATE INDEX IF NOT EXISTS idx_leaderboard_best_score ON leaderboard (game, best_score DESC);

-- Helper: call this after every game to record the score
-- INSERT INTO leaderboard (user_id, game, best_score)
-- VALUES ($1, $2, $3)
-- ON CONFLICT (user_id, game) DO UPDATE
--   SET best_score  = GREATEST(leaderboard.best_score, EXCLUDED.best_score),
--       play_count  = leaderboard.play_count + 1,
--       last_played = now();

-- ============================================================
-- 4. GAME_PROGRESS
--    Every game play logged here.
--    Replaces localStorage sp_class_progress.
-- ============================================================
CREATE TABLE IF NOT EXISTS game_progress (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game        TEXT        NOT NULL,
  score       INT         NOT NULL DEFAULT 0,
  duration_ms INT,
  completion  SMALLINT    CHECK (completion BETWEEN 0 AND 100),
  played_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_progress_user    ON game_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_game_progress_game    ON game_progress (game);
CREATE INDEX IF NOT EXISTS idx_game_progress_played  ON game_progress (user_id, played_at DESC);

-- ============================================================
-- 5. DAILY_ACTIVITY
--    One row per user per day. Replaces localStorage sp_class_activities.
--    Use UPSERT to accumulate time when the user plays multiple games in a day.
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_activity (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date          DATE    NOT NULL DEFAULT CURRENT_DATE,
  time_ms       BIGINT  NOT NULL DEFAULT 0,
  session_count INT     NOT NULL DEFAULT 0,
  streak_day    INT     NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_activity_user ON daily_activity (user_id, date DESC);

-- Helper UPSERT:
-- INSERT INTO daily_activity (user_id, date, time_ms, session_count)
-- VALUES ($1, CURRENT_DATE, $2, 1)
-- ON CONFLICT (user_id, date) DO UPDATE
--   SET time_ms       = daily_activity.time_ms + EXCLUDED.time_ms,
--       session_count = daily_activity.session_count + 1;

-- ============================================================
-- 6. QUESTIONS
--    Reusable question bank — AI-generated and teacher-created.
--    Replaces the hardcoded pool in firebase-session.js.
-- ============================================================
CREATE TABLE IF NOT EXISTS questions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  topic         TEXT,
  question_text TEXT        NOT NULL,
  options       JSONB       NOT NULL,  -- ["Option A", "Option B", "Option C", "Option D"]
  correct_index SMALLINT    NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  question_type TEXT        NOT NULL DEFAULT 'mcq' CHECK (question_type IN ('mcq', 'true_false')),
  difficulty    TEXT        CHECK (difficulty IN ('easy', 'medium', 'hard')),
  bloom_level   TEXT,
  explanation   TEXT,
  source        TEXT        NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'teacher', 'system')),
  is_public     BOOLEAN     NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_questions_creator   ON questions (creator_id);
CREATE INDEX IF NOT EXISTS idx_questions_topic     ON questions (topic);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions (difficulty);

-- ============================================================
-- 7. UPLOADED_FILES
--    Metadata for files teachers upload for AI processing.
--    The actual file goes to Firebase Storage / S3 — store the path here.
-- ============================================================
CREATE TABLE IF NOT EXISTS uploaded_files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  filename        TEXT        NOT NULL,
  file_type       TEXT        NOT NULL CHECK (file_type IN ('pdf', 'pptx', 'docx', 'txt', 'md')),
  file_size_kb    INT,
  storage_path    TEXT,                -- Firebase Storage / S3 URL or path
  extracted_text  TEXT,                -- cached extracted text (avoids re-extraction)
  topic_inferred  TEXT,                -- AI-inferred topic from filename + content
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uploaded_files_uploader ON uploaded_files (uploader_id);
