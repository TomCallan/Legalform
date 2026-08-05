# LegalForm: Production Architecture for CLI-Driven Legal Document Platform

LegalForm is an end-to-end legal electronic document platform built on Cloudflare Workers, Cloudflare D1, Cloudflare R2, Cloudflare Pages, and Python. It features complete support for **both cloud deployment and 100% local hosting**.

---

## 🚀 Key Features

* 💻 **Local & Cloud Hosting Support:** Run locally via Wrangler dev & Python static HTTP server, or publish to Cloudflare Workers + Pages.
* ✍️ **Pre-Filled Document Specs:** Supply pre-filled values inside the YAML spec or pass `--fill field_name="Value"` dynamically via the CLI.
* 📱 **Mobile Optimized UI:** Glassmorphism UI engineered with touch event handling (`touch-action: none`) for signature pads on iOS & Android, font scaling (16px base input prevention for iOS zoom), and flex/grid responsive breakpoints.
* 🛡️ **Cryptographic Audit Trail:** Telemetry records field focus, value hashing, IP hashes, and NTP timestamps.

---

## 🛠 Local Hosting Quick Start

### 1. Start Local Backend API (Worker + D1 in SQLite mode)
```bash
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
# Create starter template
python3 cli/legalform.py init -o custom-nda.yaml

# Deploy with pre-filled contents via CLI options:
python3 cli/legalform.py deploy custom-nda.yaml -f counterparty_name="Acme Corp" -f counterparty_email="ceo@acme.com"
```
The CLI will output a local signing URL (e.g. `http://localhost:8080/?slug=a1b2c3d4e5f6`) ready to view and sign in any browser or mobile device.

---

## ☁️ Cloudflare Production Deployment & Publishing Signable Links

### Step 1: Initialize Cloudflare Infrastructure
```bash
# Login to your Cloudflare account
npx wrangler login

# Create production D1 database
npx wrangler d1 create legalform-db
# Note: Copy the database_id output into worker/wrangler.toml

# Create production R2 bucket
npx wrangler r2 bucket create legalform-docs
```

### Step 2: Apply Schema & Deploy Worker Backend
```bash
# Execute D1 SQL schema on production
npx wrangler d1 execute legalform-db --remote --file=schema.sql

# Deploy Worker API
cd worker
npx wrangler deploy

# Set API authentication & email secrets
npx wrangler secret put ADMIN_API_KEY
npx wrangler secret put RESEND_API_KEY
```

### Step 3: Deploy Cloudflare Pages Static UI
```bash
cd ../pages
npx wrangler pages deploy . --project-name=legalform-ui
```

### Step 4: Deploy & Generate a Production Signable Link via CLI
Configure your CLI environment variables to point to your live Cloudflare endpoints:

```bash
export LEGALFORM_API="https://legalform-api.your-subdomain.workers.dev"
export LEGALFORM_PAGES="https://legalform-ui.pages.dev"
export LEGALFORM_KEY="your-admin-api-key"

# Deploy document to production Cloudflare Worker & D1
python3 cli/legalform.py deploy my-nda.yaml -f counterparty_name="Global Tech Ltd" -f counterparty_email="signer@globaltech.com"
```

**Output Signable Link Example:**
```text
🚀 Document Deployed Successfully!
• Document ID: nda-20260805-170000
• Signing URL: https://legalform-ui.pages.dev/?slug=9f8e7d6c5b4a
• Pre-filled Fields: {'counterparty_name': 'Global Tech Ltd', 'counterparty_email': 'signer@globaltech.com'}
• Expiry Date: 2026-09-04 17:00:00
```

Share the generated `https://legalform-ui.pages.dev/?slug=...` link with your counterparty to collect cryptographically audited electronic signatures over Cloudflare's global edge network.
