# LegalForm: Production Architecture for CLI-Driven Legal Document Platform

LegalForm is an end-to-end legal electronic document platform built on Cloudflare Workers, Cloudflare D1, Cloudflare R2, Cloudflare Pages, and Python. It features complete support for **both cloud deployment and 100% local hosting**, engineered for compliance under **US ESIGN Act (15 U.S.C. § 7001)** and **EU eIDAS Regulation (No 910/2014, Art. 25)**.

---

## 🚀 Key Features

* 💻 **Local & Cloud Hosting Support:** Run locally via Wrangler dev & Python static HTTP server, or publish to Cloudflare Workers + Pages.
* ✍️ **Pre-Filled Document Specs:** Supply pre-filled values inside the YAML spec or pass `--fill field_name="Value"` dynamically via the CLI.
* 🇪🇺 **EU & US Court-Enforceable Legal Framework:** Native legal clauses and cryptographic audit chain compliant with EU eIDAS (Advanced Electronic Signature - AdES), UETA, and ESIGN.
* 📧 **Dual Resend Execution Certificates:** Automatically emails both the signer and the document owner / admin with official execution certificates.
* 🛡️ **Cryptographic Audit Trail:** Telemetry records field focus, value hashing, IP hashes, UTC NTP server timestamps, and archives JSON records to Cloudflare R2 storage.

---

## 📄 YAML Specification Format Guide

LegalForm documents are declared using simple, expressive YAML specifications (see [`my-nda.yaml`](file:///C:/Users/TomCa/Desktop/Sig/my-nda.yaml) for a complete working example).

### Top-Level Properties (`document`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique internal document identifier (e.g. `nda-2026-001`) |
| `title` | String | Title displayed at the top of the agreement |
| `jurisdiction` | String | Legal jurisdiction (e.g. `International, EU eIDAS & Delaware, USA`) |
| `admin_notification_email` | String | Email address to receive a copy of signed document certificate |
| `expires_in_days` | Integer | Number of days until the signing link expires |
| `max_submissions_per_email` | Integer | Rate limit ceiling per signer email (default: `1`) |
| `max_submissions_per_ip` | Integer | Rate limit ceiling per IP address (default: `3`) |
| `require_email_verification` | Boolean | Whether an email verification link is required (`true`/`false`) |
| `legal_footer` | String | Statutory agreement text shown directly above the signature block |

---

### Sections Structure (`sections`)

Each document consists of a list of sequential section objects:

#### 1. Static Text Section (`type: "static"`)
Contains Markdown-formatted text for legal clauses:
```yaml
- type: "static"
  content: |
    ## 1. Confidential Information
    "Confidential Information" refers to non-public details...
```

#### 2. Form Input Section (`type: "form"`)
Defines interactive form inputs for the document:
```yaml
- type: "form"
  fields:
    - name: "disclosing_party"     # Variable key
      label: "Disclosing Party"   # Input label in UI
      type: "text"                 # text | email | select | date | datetime-auto
      required: true               # Validation constraint
      value: "Acme Corp"           # Default / pre-filled value
```

#### 3. Signature Section (`type: "signature"`)
Displays the digital canvas signature pad along with automatic date/timestamp fields:
```yaml
- type: "signature"
  signer_label: "Authorized Signer"
  fields:
    - name: "signer_title"
      label: "Title / Corporate Capacity"
      type: "text"
      required: true
    - name: "signature_timestamp"
      label: "Date & Timestamp of Execution"
      type: "datetime-auto"       # Auto-locks exact current UTC date & time
      required: true
```

---

## 📧 Setting Admin Notification Email

You can configure the admin email to receive copies of signed execution certificates via **3 flexible methods** (evaluated in order of priority):

1. **CLI Flag `--admin-email` / `-a`:**
   ```bash
   python3 cli/legalform.py deploy my-nda.yaml --admin-email "admin@yourcompany.com"
   ```

2. **Environment Variable `LEGALFORM_ADMIN_EMAIL`:**
   ```bash
   # In PowerShell:
   $env:LEGALFORM_ADMIN_EMAIL="admin@yourcompany.com"

   # In Bash / Mac / Linux:
   export LEGALFORM_ADMIN_EMAIL="admin@yourcompany.com"
   ```

3. **YAML Document Spec (`admin_notification_email`):**
   ```yaml
   document:
     id: "nda-sample-2026"
     admin_notification_email: "admin@yourcompany.com"
   ```

---

## 🛠 Local Hosting Quick Start

### 1. Install Dependencies & Start Local Backend API
```bash
# Install Python CLI dependencies
pip install -r requirements.txt

# Start Worker + D1 in SQLite mode
cd worker
npm install
npx wrangler d1 execute legalform-db --local --file=../schema.sql
npx wrangler dev --local
```

### 2. Start Local Static UI Server
In a separate terminal window:
```bash
python3 cli/legalform.py serve --port 8080
```

### 3. Deploy & Sign a Pre-Filled Document Locally
```bash
# Deploy with pre-filled contents & custom admin notification email:
python3 cli/legalform.py deploy my-nda.yaml -a "owner@company.com" -f receiving_party="Global Tech Ltd" -f signer_email="ceo@globaltech.com"
```
The CLI will output a local signing URL (e.g. `http://localhost:8080/?slug=a1b2c3d4e5f6`) ready to view and sign in any browser or mobile device.

---

## ☁️ Cloudflare Production Deployment & Publishing Signable Links

### Step 1: Initialize Cloudflare Infrastructure
```bash
# Login to your Cloudflare account
npx wrangler login

# Create production D1 database & R2 bucket
npx wrangler d1 create legalform-db
npx wrangler r2 bucket create legalform-docs
```

### Step 2: Apply Schema & Deploy Worker Backend
```bash
# Execute D1 SQL schema on production
npx wrangler d1 execute legalform-db --remote --file=schema.sql

# Deploy Worker API
cd worker
npx wrangler deploy

# Set secrets
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put RESEND_API_KEY
```

### Step 3: Deploy Cloudflare Pages Static UI
```bash
cd ../pages
npx wrangler pages project create legalform-ui --production-branch=main
npx wrangler pages deploy . --project-name=legalform-ui
```

### Step 4: Deploy & Generate a Production Signable Link via CLI
Configure your CLI environment variables to point to your live Cloudflare endpoints:

```bash
export LEGALFORM_API="https://legalform-api.your-subdomain.workers.dev"
export LEGALFORM_PAGES="https://legalform-ui.pages.dev"
export LEGALFORM_KEY="your-admin-api-key"
export LEGALFORM_ADMIN_EMAIL="admin@yourcompany.com"

# Deploy document to production Cloudflare Worker & D1
python3 cli/legalform.py deploy my-nda.yaml -a "owner@yourcompany.com" -f receiving_party="Global Tech Ltd" -f signer_email="signer@globaltech.com"
```

**Output Signable Link Example:**
```text
🚀 Document Deployed Successfully!
• Document ID: nda-sample-2026
• Signing URL: https://legalform-ui.pages.dev/?slug=9f8e7d6c5b4a
• Expiry Date: 2026-09-04 17:00:00
```

Share the generated link with your counterparty to collect cryptographically audited electronic signatures over Cloudflare's global edge network.
