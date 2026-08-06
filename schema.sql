-- Schema for Cloudflare D1 Database

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    spec TEXT NOT NULL,           -- stored YAML/JSON
    status TEXT DEFAULT 'active', -- active | expired | revoked
    expires_at INTEGER,           -- unix epoch
    max_per_email INTEGER DEFAULT 1,
    max_per_ip INTEGER DEFAULT 3,
    require_verification INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (unixepoch()),
    owner_api_key_hash TEXT       -- for CLI auth
);

-- Submissions with cryptographic non-repudiation
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    email TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    ip_hash TEXT NOT NULL,        -- SHA-256 of IP (privacy)
    user_agent TEXT,
    fingerprint TEXT,             -- browser fingerprint
    submitted_at INTEGER,
    data_json TEXT NOT NULL,      -- all field values
    signature_svg TEXT,           -- SVG path of signature
    audit_hash TEXT NOT NULL,     -- SHA-256(chain of events)
    pdf_path TEXT,                -- R2 key
    status TEXT DEFAULT 'complete'
);

-- Immutable audit trail (append-only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submission_id TEXT,
    document_id TEXT,
    event_type TEXT NOT NULL,     -- page_open | field_focus | field_blur | value_change | email_sent | email_verified | submit_start | submit_complete | signature_drawn
    event_data TEXT,              -- JSON: {field_name, value_hash, timestamp_ms}
    client_timestamp INTEGER,     -- browser timestamp
    server_timestamp INTEGER DEFAULT (unixepoch()),
    ip_hash TEXT,
    user_agent TEXT,
    session_id TEXT
);

-- Rate limiting (sliding window)
CREATE TABLE IF NOT EXISTS rate_limits (
    resource_type TEXT,           -- 'ip' | 'email'
    resource_value TEXT,
    document_id TEXT,
    window_hour INTEGER,          -- unix epoch / 3600
    count INTEGER DEFAULT 0,
    PRIMARY KEY (resource_type, resource_value, document_id, window_hour)
);

-- Verification tokens
CREATE TABLE IF NOT EXISTS email_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    document_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER DEFAULT 0
);

-- Multi-party & Sequential Signing
CREATE TABLE IF NOT EXISTS document_parties (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    party_id TEXT NOT NULL,           -- e.g. 'discloser', 'contractor', 'witness'
    role TEXT NOT NULL,               -- e.g. 'Disclosing Party', 'Witness'
    email TEXT,
    sequence INTEGER DEFAULT 1,
    party_token TEXT UNIQUE NOT NULL, -- unique URL token for this party
    status TEXT DEFAULT 'pending',    -- 'pending' | 'unlocked' | 'completed' | 'declined'
    completed_at INTEGER,
    submission_id TEXT REFERENCES submissions(id)
);

-- Optional Team / Organization tables (Feature-flagged)
CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS org_members (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'sender', -- 'admin' | 'sender' | 'viewer'
    created_at INTEGER DEFAULT (unixepoch())
);

-- Indexes for legal discovery queries
CREATE INDEX IF NOT EXISTS idx_audit_submission ON audit_logs(submission_id, server_timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_document ON audit_logs(document_id, server_timestamp);
CREATE INDEX IF NOT EXISTS idx_submissions_doc ON submissions(document_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_doc_parties ON document_parties(document_id, party_token);
CREATE INDEX IF NOT EXISTS idx_doc_parties_seq ON document_parties(document_id, sequence, status);

