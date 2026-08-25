# Legalform — Agent Guide

## Project Overview
Legalform is a lightweight, developer-first electronic document platform for creating, sharing, pre-filling, signing, and cryptographically archiving legal agreements.

## Architecture

- **Frontend** (`pages/`): Single-page UI (`index.html` — inline script), visual drag-drop builder (`builder.js`), signed-page rendering (`index.html`).
- **Worker** (`worker/src/index.ts`): Hono-based Cloudflare Worker (API server, renders PDFs). D1 database (submissions), R2 storage (archived submissions).
- **Templates** (`templates/*.yaml`): YAML document specs for building new documents.
- **CLI** (`cli/`): Python scripts for deploy, export, pdf rebuild.
- **Tests**: `worker/src/index.test.ts` — unit test suite with `tsx --test`.

## Build & Test Commands

```bash
cd worker
npm install
npm run typecheck       # TypeScript compilation check
npm test                # Unit tests (5/5 pass)
npm run deploy          # Deploy to Cloudflare Workers (remote)
```

```bash
cd pages
node --check builder.js     # Syntax check
```

## Local Development Setup

```bash
# 1. Start Cloudflare Worker local backend API
cd worker
npx wrangler dev          # listens on 127.0.0.1:8789

# 2. Start local web server with API proxying (uses /api/* -> live worker)
python3 cli/legalform.py serve --port 8080
```

Note: `wrangler.dev` uses the built `wrangler.toml` in the `worker/` directory. No entry-point override is needed — `main = "src/index.ts"` in wrangler.toml points to the worker script.

## Environment

- **Platform**: Windows + Git Bash (Bash via Git)
- **Python**: `python` (not `python3`) — required for CLI scripts
- **Node**: available; `js-yaml` NOT in worker/node_modules — use pyyaml bridge or stub for tests
- **DB**: Cloudflare D1 (`legalform-db`) — production `submissions` table had an outdated schema (missing `signer_email`, `signer_name`, `signature_data` columns) that caused 500 on every submit. Fixed by migrating the table schema to match `schema.sql`.
- **Cloudflare blocks python-urllib UA on `/api/*`** — expected, not a bug. `curl` works fine.

## Design System (MONARCH)

| Property | Value |
|---|---|
| Background | White (`#ffffff`) |
| Text | Black (`#000000`) |
| Borders | `#e5e5e5` (hairline, `--border-subtle`) |
| Accent | Black (`#000000`) |
| Typeface | Zen Kaku Gothic New (400, 500, 600, 700, 900) |
| Layout | Left-aligned, no rounded corners, no dark theme |

Key CSS properties from the MONARCH system:
- `border-radius: 0` on all cards, buttons, and inputs
- `1px var(--border-subtle)` for all borders and separators
- `letter-spacing: 0.14em` uppercase labels
- `text-transform: uppercase` on all labels
- `font-size: clamp(15px, 1.1vw, 19px)` on text inputs
- `background: transparent; border: 1px solid var(--border-subtle)` on toasts

## Document Spec Format (YAML)

```yaml
document:
  id: "unique-id"
  title: "Document Title"
  jurisdiction: "State, USA"
  expires_in_days: 60
  admin_notification_email: "admin@company.com"
  legal_footer: "By signing below..."

sections:
  - type: "static"
    content: "## Section Title\nPlain text here."
  - type: "form"
    signer_label: "SIGNER LABEL"
    fields:
      - name: "field_name"
        label: "Display Name"
        type: "text"       # or "email", "textarea", "checkbox", "select", "radio", "datetime-auto", "date", "datetime"
        required: true
        value: "default"   # pre-fill
  - type: "signature"
    signer_label: "AUTHOR SIGNATURE"
    fields: []   # signature pad section
```

## New Feature Support (as of commit `f774d14`)

### Date Selector UI Module
- **Builder**: Added `date` and `datetime` to `FIELD_TYPES` array (`pages/builder.js`).
- **Preview**: Date/datetime fields render an empty input with a `date/datetime` style.
- **Signer**: `date` maps to `date` field type (date picker), `datetime` maps to `datetime-local` (local date picker).
- **Worker**: Date/datetime values stored as strings in `signature_data`.

### Typed Signature Option
- **Signer UI**: Toggle between "Draw" (canvas signature pad) and "Type" (text input for full legal name).
- **Mode buttons**: `.sig-mode-btn` with active state class (MonARCH design).
- **Payload**: `signature_data` = SVG (from canvas) or plain text (from type input).
- **PDF rendering**: Worker `drawSignatureBlock` function renders typed signature as `page.drawText(signatureData, ...)` alongside the signature label.

## Custom Templates

Custom templates are persisted in `localStorage` key `legalform_builder_templates` (`{name: yaml-string}`).

## Worker PDF Rendering

The worker (`worker/src/index.ts`) renders:
- **Page 1**: Full executed agreement + table of fields, signature block with `SIGNATURE OF RECORD` label
- **Page 2**: Official certificate of electronic execution

Signature rendering supports:
- **Embedded image**: PNG/JPEG data URL (via `embedSignatureImage`)
- **Typed signature**: Plain text string (rendered via `page.drawText` in `drawSignatureBlock`)
- **Canvas draw**: SVG data URL from canvas (`sigPadInit.toSVG()`)

## Database Schema

`schema.sql` defines:
- `documents`: id, slug, spec, status, expires_at, created_at
- `submissions`: id, document_id, signer_email, signer_name, data_json, signature_data, audit_hash, submitted_at

```sql
CREATE INDEX IF NOT EXISTS idx_submissions_doc ON submissions(document_id, submitted_at);
```

## Git Workflow

- Always commit and push verified changes directly to `origin/main` upon task completion.
- Run verification checklist (`npm test`, `typecheck`, syntax checks) before pushing.
- **Deploy to production**: require separate confirmation (non-local).

## Verification Checklist (before push)

- [x] `npm run typecheck` passes
- [x] `npm test` passes (all tests green)
- [x] Syntax check: `node --check pages/builder.js`, `node --check pages/index.html` (inline)
- [x] Live submit API verified via curl (`/api/submit/<slug>` returns 200)
- [x] D1 schema migration applied (adds missing `signer_email`, `signer_name`, `signature_data` columns)
- [x] Local dev server verified (for `render-pdf` smoke with typed signature)
- [ ] Production deploy: `wrangler deploy` (requires commit+push confirmation)
- [ ] Pages deploy: `npx wrangler pages deploy` (requires commit+push confirmation)

## Notes

- `pages/index.html` is a single-file UI — the `app()` function in index.html handles all rendering, including builder panel initialization and signer UI.
- `builder.js` is a separate visual drag-drop builder component.
- `worker/src/index.ts` handles PDF rendering, API endpoints, and database operations.
- `wrangler.toml` (`worker/`) defines the Cloudflare Worker project (D1 DB binding, R2 bucket binding).
- `npx wrangler dev --remote` is the production dev server.
- `npx wrangler dev --local --port 8789` is the local dev server (for `127.0.0.1:8789`).
- **Sender Ledger Passcode**: Gated by `DASHBOARD_AUTH_HASH` (default passcode: `admin`).