# Legalform

A lightweight, developer-first electronic document platform to create, share, pre-fill, sign, and cryptographically archive legal agreements.

---

## 🚀 Key Features & Workflow

1. **Shareable Legal Document**: Declare documents in simple YAML files and generate immediate shareable signing URLs.
2. **Cryptographic Non-Repudiation**: SHA-256 digests lock submitted field data, signature canvas data, document ID, and execution timestamp.
3. **End-User PDF Download**: Signers can instantly print / save the compiled PDF agreement directly upon completing execution.
4. **Sender Email Notifications**: Senders automatically receive email execution alerts with signer details and SHA-256 hashes via Resend API.
5. **Dynamic Data-Driven Form Creation**: Create new document templates rapidly with declarative fields and pre-fill values dynamically via CLI flags (`-f receiving_party="Acme Corp"`) or URL parameters (`?receiving_party=Acme+Corp`).
6. **Lossless Local Rebuilding**: Export compact JSON datasets (`cli/legalform.py export`) and rebuild identical court-grade PDFs locally (`cli/legalform.py pdf`).

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
