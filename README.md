# Legalform

A lightweight, developer-first electronic document platform to create, share, pre-fill, sign, and cryptographically archive legal agreements.

---

## 🚀 Key Features & Workflow

1. **Shareable Legal Document**: Declare documents in simple YAML files and generate immediate shareable signing URLs.
2. **Cryptographic Non-Repudiation**: SHA-256 digests lock submitted field data, signature data (drawn or typed), document ID, and execution timestamp.
3. **End-User PDF Download**: Signers can instantly print / save the compiled PDF agreement directly upon completing execution.
4. **Sender Email Notifications**: Senders automatically receive email execution alerts with signer details and SHA-256 hashes via Resend API.
5. **Dynamic Data-Driven Form Creation**: Create new document templates rapidly with declarative fields and pre-fill values dynamically via CLI flags (`-f receiving_party="Acme Corp"`) or URL parameters (`?receiving_party=Acme+Corp`).
6. **Lossless Local Rebuilding**: Export compact JSON datasets (`cli/legalform.py export`) and rebuild identical court-grade PDFs locally (`cli/legalform.py pdf`).
7. **Visual Drag-Drop Builder**: Build documents visually in the browser — no YAML hand-writing required. Save custom templates locally.
8. **Date Picker & Typed Signatures**: Native browser date/datetime-local inputs; signer can draw on canvas or type their full legal name.
9. **Document Lifecycle Controls**: Revoke, restart, duplicate, edit, and delete document runs from the dashboard.

---

## 🔑 Setup & API Keys Required

### 1. Cloudflare Environment (Optional for Cloud Hosting)
- **Account:** Cloudflare account (free tier compatible).
- **D1 Database:** `npx wrangler d1 create legalform-db`
- **R2 Storage Bucket:** `npx wrangler r2 bucket create legalform-docs`

### 2. Resend API Key (For Sender Email Notifications)
- **Where to get:** Sign up at [resend.com](https://resend.com), create an API Key, and verify your domain (or use `noreply@resend.dev` for testing).
- **Setting the key:**
  - **Local:** Pass `RESEND_API_KEY="re_..."` in your environment or `wrangler.toml` / `.env`.
  - **Cloudflare Worker:** Run `npx wrangler secret put RESEND_API_KEY` inside the `worker/` directory.
  - **Admin Notification Email:** Set `admin_notification_email` in the document YAML spec or pass `--admin-email` via CLI.

---

## ⚡ Fast Data-Driven Document Creation

New agreements are declared in simple YAML specs. Create a new document in seconds:

### Example: `templates/contractor-sow.yaml`
```yaml
document:
  id: "sow-2026-001"
  title: "STATEMENT OF WORK & SERVICES AGREEMENT"
  jurisdiction: "State of California, USA"
  expires_in_days: 30
  admin_notification_email: "sender@yourcompany.com"
  legal_footer: "By signing below, the contractor agrees to perform the services detailed above under the specified terms."

sections:
  - type: "static"
    content: |
      ## 1. SERVICES & DELIVERABLES
      Contractor agrees to perform software development services as specified in this Statement of Work.

  - type: "form"
    fields:
      - name: "contractor_name"
        label: "Contractor Legal Name"
        type: "text"
        required: true
        value: "Jane Doe" # Default pre-fill

      - name: "contractor_email"
        label: "Contractor Email"
        type: "email"
        required: true

      - name: "hourly_rate"
        label: "Agreed Hourly Rate ($ USD)"
        type: "text"
        required: true
        value: "150"

      - name: "start_date"
        label: "Engagement Start Date"
        type: "date"          # Native date picker
        required: true

      - name: "execution_timestamp"
        label: "Execution Timestamp"
        type: "datetime"      # Native datetime-local picker

  - type: "signature"
    signer_label: "CONTRACTOR EXECUTION"
    fields:
      - name: "signature_date"
        label: "Execution Date"
        type: "datetime-auto" # Automatically populates today's UTC timestamp
```

---

## 🛠️ Local Hosting Quick Start

```bash
# 1. Start Cloudflare Worker Local Backend API
cd worker
npm install
npx wrangler d1 execute legalform-db --local --file=../schema.sql
npx wrangler dev --local --port 8787

# 2. Start Local Web Server with Automatic API Proxying
python3 cli/legalform.py serve --port 8080
```

### Deploying & Generating Dynamic Links

```bash
# Deploy spec with dynamic pre-filled fields:
python3 cli/legalform.py deploy templates/contractor-sow.yaml -f contractor_name="Acme Consulting" -f contractor_email="jane@acme.com"
```

Output:
```text
🚀 Document Deployed Successfully!
• Document ID: sow-2026-001
• Shareable Signing Link: http://localhost:8080/?slug=a1b2c3d4e5f6&contractor_name=Acme+Consulting&contractor_email=jane%40acme.com
```

---

## 📄 Exporting Data & Rebuilding PDF Locally

```bash
# Export local compact JSON payload
python3 cli/legalform.py export sow-2026-001 -o submission.json

# Rebuild exact signed PDF agreement locally
python3 cli/legalform.py pdf submission.json -s templates/contractor-sow.yaml -o executed-contract.pdf
```

---

## 🎯 New Features (v2026.08)

### Date Selector UI Module
- **Builder**: Add `date` or `datetime` fields via the visual builder or YAML.
- **Preview**: Date/datetime fields show an empty input preview in the builder.
- **Signer**: Native browser date picker (`type="date"`) and datetime-local picker (`type="datetime-local"`). Values are submitted as ISO strings.
- **Worker**: Stored in `fields` JSON; no special handling needed — treated as strings.

### Typed Signature Option
- **Signer UI**: Toggle between **Draw** (canvas signature pad) and **Type** (text input for full legal name).
- **Payload**: `signature_data` = SVG data URL (draw) or plain text string (type).
- **PDF Rendering**: Worker renders typed signatures as italic text with an underline block on both agreement and certificate pages.
- **Audit**: Typed signature text participates in the SHA-256 audit hash identically to drawn signatures.

### Document Dashboard Controls
- **Duplicate**: Clone a document spec into the builder for editing.
- **Edit**: Load an existing document spec into the builder for modifications.
- **Revoke**: Disable a document (set status to `closed`) — signer gets "Document expired".
- **Restart**: Re-activate a closed document (set status to `active`).
- **Delete**: Permanently remove a document and all its submissions.

### Custom Template Library
- Save custom YAML specs as templates via the builder.
- Templates persist in `localStorage` (`legalform_builder_templates`).
- Access saved templates from the builder panel.

---

## 🎨 Design System (MONARCH)

| Token | Value | Usage |
|---|---|---|
| `--bg-base` | `#ffffff` | Page background |
| `--bg-surface` | `#fafafa` | Expanded detail background, pane headers |
| `--bg-surface-hover` | `#f5f5f5` | Row hover, form input resting background |
| `--border-subtle` | `#e5e5e5` | Hairline separators, borders, inactive underlines |
| `--border-active` | `#000000` | Focus / active border |
| `--text-main` | `#000000` | Primary text, primary borders, primary buttons |
| `--text-muted` | `#6e6e73` | Secondary text, labels, metadata |
| `--accent-brand` | `#000000` | Link and primary-action color |
| `--success` | `#0f7b3d` | Form status — success |
| `--error` | `#c02424` | Form status — error |

**Hard rules:** White background, black text, left-aligned, sharp corners (no `border-radius`), uppercase labels with wide tracking (`letter-spacing: 0.14em`), tabular numerals, Zen Kaku Gothic New typeface only. No dark mode, no rounded corners, no decorative fonts.

---

## 🧪 Testing & Verification

```bash
cd worker
npm run typecheck   # TypeScript compilation (0 errors)
npm test            # Unit tests (5/5 pass)
```

```bash
cd pages
node --check builder.js     # Syntax check
# inline <script> in index.html: awk '/^<script>/{f=1;next} /^<\/script>/{f=0} f' index.html > .check.js && node --check .check.js
```

**All tests pass.** Live API verified at `https://legalform-api.tomcallan0.workers.dev/` (submit, export, render-pdf).

---

## 📦 Project Structure

```
├── pages/
│   ├── index.html       # Single-file UI (dashboard + signer flow + inline <script>)
│   ├── builder.js       # Visual drag-drop builder
│   └── server.py        # Dev server with API proxy
├── worker/
│   ├── src/
│   │   ├── index.ts     # Hono Worker: API + PDF rendering
│   │   └── index.test.ts # Unit tests (tsx --test)
│   ├── wrangler.toml    # Cloudflare Worker config (D1 + R2 bindings)
│   └── package.json
├── templates/
│   ├── *.yaml           # Document specs (NDA, Contractor SOW, Affidavit, Personal Statement)
├── cli/
│   └── legalform.py     # Deploy, export, pdf, serve
├── schema.sql           # D1 database schema
├── DESIGN_SYSTEM.md     # MONARCH design tokens & rules
└── AGENTS.md            # This guide
```

---

## 🔒 Security & Compliance

- **ESIGN Act / UETA / eIDAS** compliant PDF output.
- **SHA-256** audit hash covers: `document_id:email:fields_json:signature_data:timestamp`.
- **Audit hash** printed in PDF and returned in submit response.
- **Signature data** stored verbatim (SVG or plain text) in D1 and R2.
- **No secrets in repo** — `RESEND_API_KEY` set via `wrangler secret put`.

---

## 📚 Further Reading

- `DESIGN_SYSTEM.md` — Full MONARCH tokens, typography, components, layouts.
- `worker/src/index.ts` — Worker implementation (API endpoints, PDF rendering).
- `pages/builder.js` — Visual builder logic (drag-drop, preview, template storage).
- `templates/*.yaml` — Example document specifications.