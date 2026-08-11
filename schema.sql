-- Simplified Schema for LegalForm (Cloudflare D1 / SQLite)

-- Documents table: stores document specification and sharing metadata
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
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
    submitted_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_submissions_doc ON submissions(document_id, submitted_at);
