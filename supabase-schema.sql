-- Mandarin Master — Supabase Schema
-- Run this in your Supabase Dashboard > SQL Editor
-- URL: https://supabase.com/dashboard/project/dpvfmurocginoxatxlut/sql

-- ============================================
-- Table 1: user_progress
-- Stores overall learning progress per user
-- ============================================
CREATE TABLE IF NOT EXISTS user_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 6),
    word_index INTEGER NOT NULL DEFAULT 0,
    score INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0,
    xp_today INTEGER NOT NULL DEFAULT 0,
    last_study_date DATE,
    vocab_completed BOOLEAN NOT NULL DEFAULT FALSE,
    phrases_completed BOOLEAN NOT NULL DEFAULT FALSE,
    story_completed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own progress"
    ON user_progress FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
    ON user_progress FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
    ON user_progress FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================
-- Table 2: word_scores
-- Tracks per-word learning progress
-- ============================================
CREATE TABLE IF NOT EXISTS word_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
    word_index INTEGER NOT NULL,
    chinese TEXT NOT NULL,
    listen_passed BOOLEAN NOT NULL DEFAULT FALSE,
    speak_passed BOOLEAN NOT NULL DEFAULT FALSE,
    write_passed BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INTEGER NOT NULL DEFAULT 0,
    failed_strokes INTEGER NOT NULL DEFAULT 0,
    mastered BOOLEAN NOT NULL DEFAULT FALSE,
    last_practiced TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, level, word_index)
);

ALTER TABLE word_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own word_scores"
    ON word_scores FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own word_scores"
    ON word_scores FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own word_scores"
    ON word_scores FOR UPDATE
    USING (auth.uid() = user_id);

-- ============================================
-- Table 3: study_sessions
-- Tracks study session history
-- ============================================
CREATE TABLE IF NOT EXISTS study_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    words_studied INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 6),
    xp_earned INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own sessions"
    ON study_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
    ON study_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
    ON study_sessions FOR UPDATE
    USING (auth.uid() = user_id);
