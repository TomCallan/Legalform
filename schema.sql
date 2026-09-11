-- Schema for Signful SaaS (Cloudflare D1 / SQLite)

-- Users table: stores user account, plan, and credit balance (Strict: default 0 credits)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    plan TEXT DEFAULT 'none',      -- 'none' | 'payg' | 'pro'
    credits INTEGER DEFAULT 0,     -- Strictly 0 free credits
    created_at INTEGER DEFAULT (unixepoch())
);

-- Sessions table: active user authentication sessions
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

-- Auth Tokens table: magic link login tokens and 6-digit verification codes
CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

-- Documents table: stores document specification and sharing metadata
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    spec TEXT NOT NULL,           -- JSON/YAML document specification
    status TEXT DEFAULT 'active', -- active | closed
    expires_at INTEGER,           -- Unix epoch timestamp (optional expiry)
    created_at INTEGER DEFAULT (unixepoch())
);

-- Submissions table: stores completed signature, field values, and cryptographic hash
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    signer_email TEXT NOT NULL,
    signer_name TEXT,
    data_json TEXT NOT NULL,      -- All field values submitted by user
    signature_data TEXT NOT NULL, -- SVG or PNG data URL of user signature
    audit_hash TEXT NOT NULL,     -- SHA-256(document_id + data_json + signature + timestamp)
    submitted_at INTEGER DEFAULT (unixepoch()),
    interaction_logs TEXT         -- JSON metadata of input events (typing, pasting, additions)
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_doc ON submissions(document_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
