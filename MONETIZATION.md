# Hosted Platform Monetization & SaaS Strategy

This document outlines the commercial strategy, pricing structure, unit economics, infrastructure architecture, and go-to-market roadmap for launching a hosted SaaS platform built on top of the open-core document execution engine.

---

## 1. Executive Summary & Core Value Proposition

While legacy e-signature platforms (DocuSign, Adobe Sign, HelloSign) charge heavy per-envelope fees and rely on proprietary closed ecosystems, our hosted platform provides a **developer-first, API-native, declarative agreement platform**.

### Key Differentiators:
1. **Declarative YAML Specs**: Define dynamic legal agreements as code.
2. **Zero Lock-in & Lossless Local Rebuilding**: Export raw cryptographic JSON payloads and rebuild identical court-grade PDFs locally at any time.
3. **Cryptographic Non-Repudiation**: SHA-256 state locking on field data, signature canvas data, document IDs, and execution timestamps.
4. **Developer Workflows & CLI**: Native integration into CI/CD, webhooks, API endpoints, and terminal workflows.

---

## 2. Pricing Strategy & Tiers

A hybrid **tiered SaaS + usage-based metering** model designed to lower friction for developers while capturing enterprise scale.

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│    DEVELOPER     │    │       PRO        │    │       TEAM       │    │    ENTERPRISE    │
│    $0 / mo       │    │     $19 / mo     │    │     $79 / mo     │    │     Custom       │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│ • 15 docs / mo   │    │ • 250 docs / mo  │    │ • 1,500 docs/mo  │    │ • Unlimited docs │
│ • 1 User         │    │ • 3 Users        │    │ • 10 Users       │    │ • Unlimited Users│
│ • Webhooks & API │    │ • Custom Domains │    │ • Team Workspaces│    │ • Dedicated R2/DB│
│ • Community Sup. │    │ • Email Alerts   │    │ • Audit Logs     │    │ • Custom SLA & SOC│
└──────────────────┘    └──────────────────┘    └──────────────────┘    └──────────────────┘
```

### Detailed Tier Breakdown

| Feature | Developer (Free) | Pro ($19/mo) | Team ($79/mo) | Enterprise (Custom) |
| :--- | :--- | :--- | :--- | :--- |
| **Monthly Executions** | 15 included | 250 included | 1,500 included | Custom allocation |
| **Overage Fee** | N/A (Hard limit) | $0.15 / addl doc | $0.10 / addl doc | Volume discounts |
| **Team Seats** | 1 | 3 included ($5/addl) | 10 included ($5/addl) | Unlimited |
| **Custom Subdomains / Domains** | Shared (`*.fyi`) | Custom Domain (`sign.yourco.com`) | Multiple Custom Domains | Dedicated white-label |
| **Cryptographic Proof Engine** | SHA-256 | SHA-256 | SHA-256 + TSA Stamping | Qualified Timestamps / HSM |
| **Storage & Retention** | 90 days | Unlimited R2 Storage | Unlimited R2 Storage | Bring-Your-Own-Bucket (S3/R2) |
| **Email Delivery** | Standard | Resend Verified Domain | Dedicated IP Email | Custom SMTP / Resend |
| **Support** | Discord / GitHub | Email (<24h response) | Priority Email/Chat (<4h) | Dedicated TAM & 99.99% SLA |

---

## 3. Usage-Based & Add-on Monetization

Beyond tier subscriptions, revenue is generated via high-margin modular add-ons:

* **SBA / SMS Signer Authentication**: $0.20 per SMS verification code sent.
* **Identity Verification (IDV / KYC)**: $1.50 per government ID check + selfie match.
* **Qualified Electronic Signatures (QES / eIDAS)**: $3.00 per certificate issuance for EU compliance.
* **RFC 3161 Trusted Timestamping (TSA)**: $0.05 per execution stamp from certified Certificate Authorities.
* **Long-Term Storage Archival**: $0.01 per GB/month for cold-tier S3 Glacier storage after 1 year.

---

## 4. Unit Economics & Margin Structure

Built on edge serverless infrastructure (Cloudflare Workers, D1, R2, Resend), yielding industry-leading gross margins (**>92%**).

### Estimated Cost Per 1,000 Executions:

```
┌─────────────────────────────────────────────────────────┬──────────────┐
│ Infrastructure Item                                     │ Cost (USD)   │
├─────────────────────────────────────────────────────────┼──────────────┤
│ Cloudflare Worker Invocations (1,000 requests)          │ $0.0003      │
│ Cloudflare D1 Reads & Writes                            │ $0.0010      │
│ Cloudflare R2 PDF & Asset Storage (~500 KB / doc = 0.5GB│ $0.0075      │
│ Email Notifications via Resend API ($1.00 / 1k emails)  │ $1.0000      │
├─────────────────────────────────────────────────────────┼──────────────┤
│ TOTAL COGS (Cost of Goods Sold)                         │ $1.0088      │
└─────────────────────────────────────────────────────────┴──────────────┘
```

* **Average Revenue Per 1,000 Executions (Pro Tier)**: ~$76.00
* **Gross Profit Per 1,000 Executions**: ~$74.99 (**98.6% Gross Margin**)

---

## 5. Go-To-Market (GTM) & Acquisition Strategy

1. **Open-Core Product-Led Growth (PLG)**:
   * Maintain the open-source CLI and engine for developers.
   * Free CLI users upgrade to hosted platform when requiring custom domains, instant email delivery, compliance logs, or managed Cloudflare R2 persistence.
2. **Developer Tool Integrations**:
   * Official SDKs for Node.js, Python, Go, and Rust.
   * Native Zapier, Make, and GitHub Actions integrations for document generation CI/CD pipelines.
3. **Template Marketplace & SEO Engine**:
   * Host an open directory of common legal templates (NDAs, SOWs, SAFEs, Independent Contractor Agreements).
   * Programmatic SEO pages generated for dynamic template previews.

---

## 6. Financial Projections (Year 1 to Year 3)

```
                       Year 1         Year 2         Year 3
----------------------------------------------------------------
ARR (Annual Recurring)  $120,000       $750,000       $3,200,000
Active Paid Accounts    400            2,200          8,500
Gross Margin            94%            96%            97%
Monthly Executions      250k           2.1M           12.5M
----------------------------------------------------------------
```

---

## 7. Implementation Milestones for Hosting

1. **Phase 1: Multi-Tenancy & Auth**
   * Integrate Stripe Billing & Customer Portal.
   * Implement Multi-tenant Account / Workspace Isolation in Cloudflare D1.
2. **Phase 2: Custom Domains & Branding**
   * Cloudflare Custom Hostnames (SSL for SaaS) for client domains (`sign.company.com`).
   * Custom white-label CSS/Branding engine.
3. **Phase 3: Team Management & Audit Trail**
   * Organization RBAC (Owner, Admin, Member, Viewer).
   * Full JSON log stream for SOC2 / ISO27001 audit readiness.
