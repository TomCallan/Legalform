-- Drift fix for pre-existing legalform-db (created before SaaS auth).
-- Adds users/sessions/auth_tokens tables and missing columns on documents/submissions.
-- Safe to re-run: table creates are IF NOT EXISTS, index creates are IF NOT EXISTS.
-- NOTE: ALTER TABLE has no IF NOT EXISTS in SQLite — run once. If a column already
-- exists the statement errors; remaining statements still apply (D1 executes per statement).
-- Apply: npx wrangler d1 execute legalform-db --remote --file=migrations/0002_saas_auth.sql

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    plan TEXT DEFAULT 'none',
    credits INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

ALTER TABLE documents ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE submissions ADD COLUMN interaction_logs TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
