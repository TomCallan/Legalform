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

### 3. Deploy & Sign a Pre-Filled Document
```bash
# Create starter template
python3 cli/legalform.py init -o custom-nda.yaml

# Deploy with pre-filled contents via CLI options:
python3 cli/legalform.py deploy custom-nda.yaml -f counterparty_name="Acme Corp" -f counterparty_email="ceo@acme.com"
```
The CLI will output a signing URL (e.g. `http://localhost:8080/?slug=a1b2c3d4e5f6`) ready to view and sign in any browser or mobile device.

---

## ☁️ Cloudflare Production Deployment

### Step 1: Initialize Cloudflare Services
```bash
npx wrangler login
npx wrangler d1 create legalform-db
npx wrangler r2 bucket create legalform-docs
```

### Step 2: Apply Database Schema & Deploy Worker
```bash
npx wrangler d1 execute legalform-db --remote --file=schema.sql
cd worker && npx wrangler deploy
```

### Step 3: Deploy Pages Frontend
```bash
cd pages && npx wrangler pages deploy . --project-name=legalform-ui
```
