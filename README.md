# LegalForm: Production Architecture for CLI-Driven Legal Document Platform

LegalForm is an end-to-end, zero-cost, always-on legal electronic document platform built on Cloudflare Workers, Cloudflare D1, Cloudflare R2, Cloudflare Pages, and Python.

---

## 🏗 Architecture Diagram

```
┌──────────────┐      ┌──────────────────┐      ┌──────────────────┐
│  Python CLI  │─────▶│ Cloudflare Pages │─────▶│ Cloudflare       │
│ (legalform)  │      │ (Form Renderer)  │      │ Workers API + D1 │
└──────────────┘      └──────────────────┘      └──────────────────┘
       │                                                  │
       └─────────────────── API Calls ────────────────────┘
```

---

## 📁 Repository Structure

```
.
├── schema.sql              # Cloudflare D1 SQLite database schema
├── worker/                 # Cloudflare Worker backend API (TypeScript / Hono)
│   ├── src/index.ts        # Worker routes, audit trail hashing, rate limits
│   ├── wrangler.toml       # Cloudflare Wrangler configuration
│   └── package.json
├── pages/                  # Static dynamic form renderer UI for Cloudflare Pages
│   └── index.html          # High-aesthetics glassmorphism Web Signing UI & audit tracker
├── cli/                    # Python CLI tool
│   ├── legalform.py        # CLI logic (init, deploy, list, export)
│   ├── setup.py            # Pip installation script
│   └── requirements.txt
└── .github/workflows/      # Automated deployment pipelines
    └── deploy.yml
```

---

## ⚡ Quick Start & Local Testing

### 1. Backend Worker Setup
```bash
cd worker
npm install
# Start local development server (runs D1 in local SQLite mode)
npx wrangler dev --local
```

### 2. Run D1 Local Migration
```bash
npx wrangler d1 execute legalform-db --local --file=../schema.sql
```

### 3. Install CLI Tool
```bash
cd ../cli
pip install -e .
```

### 4. Deploy a Document locally
```bash
legalform init --output my-nda.yaml
legalform deploy my-nda.yaml
```

---

## 🚀 Cloudflare Production Deployment

### Step 1: Initialize Cloudflare Services
```bash
# Login to Cloudflare
npx wrangler login

# Create D1 Database
npx wrangler d1 create legalform-db
# Copy database_id into worker/wrangler.toml

# Create R2 Bucket
npx wrangler r2 bucket create legalform-docs
```

### Step 2: Apply Database Schema to Production
```bash
npx wrangler d1 execute legalform-db --remote --file=schema.sql
```

### Step 3: Deploy Worker & Secrets
```bash
cd worker
npx wrangler deploy

# Set secrets
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put ADMIN_API_KEY
```

### Step 4: Deploy Static Pages
```bash
cd ../pages
npx wrangler pages deploy . --project-name=legalform-ui
```
