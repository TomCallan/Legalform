# Signful SaaS — Deployment & Production Setup TODO

## Overview
All multi-tenancy, magic link authentication, credit billing ($10 for 5 credits pack / $19/mo Pro plan), strict paywalls (0 free credits default), and UI components have been built, verified, and committed to `main`.

Follow this checklist to complete the production launch on Cloudflare, Stripe, and Resend.

---

## 1. Cloudflare Secrets Configuration

Run these commands in the terminal (`worker/` directory) to configure production API secrets in your Cloudflare Worker:

- [x] Set **Stripe Secret Key** (test key live on Worker):
  ```bash
  cd worker
  echo "<sk_test/rk_test>" | npx wrangler secret put STRIPE_SECRET_KEY
  ```
  Test products created 2026-09-11: `Signful Credits - 5 Pack` (`price_1UEJm9CobHzbIE2KcKqv3Jgi`, $10) + `Signful Pro` (`price_1UEJmECobHzbIE2KAlOsIvvw`, $19/mo). IDs wired into `worker/src/index.ts`.

- [x] Set **Stripe Webhook Signing Secret**:
  ```bash
  echo "<whsec>" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
  ```
  Endpoint `we_1UEJmNCobHzbIE2KwrNDTcPK` registered via API for `checkout.session.completed` + `invoice.payment_succeeded`. Worker verifies HMAC signatures (400 on forgery).

- [x] Set **Resend API Key**:
  ```bash
  echo "<re_...>" | npx wrangler secret put RESEND_API_KEY
  ```

---

## 2. Database Migration (Cloudflare D1)

- [x] Apply migrations to remote production D1 (`legalform-db`):
  ```bash
  npx wrangler d1 execute legalform-db --remote --file=../migrations/0002_saas_auth.sql
  ```
  Applied 2026-09-11 (12 tables). `migrations/0001_init.sql` = fresh-DB baseline. Note: 2 legacy docs have NULL `user_id` (locked until backfilled to owner).

---

## 3. Stripe Webhook Registration

- [x] In [Stripe Webhooks Dashboard](https://dashboard.stripe.com/webhooks), click **Add Endpoint**.
- [x] Set **Endpoint URL**: `https://signful-api.tomcallan0.workers.dev/api/billing/webhook` (or your custom API domain).
- [x] Select **Event to send**: `checkout.session.completed` and `invoice.payment_succeeded`.
- [x] Copy the signing secret (`whsec_...`) and save it to Wrangler as `STRIPE_WEBHOOK_SECRET`.
  (All four done via Stripe API 2026-09-11; verify in dashboard.)

---

## 4. Transactional Email Setup (Resend)

- [x] Add your sending domain in [Resend Dashboard](https://resend.com/domains).
  `signful.co` added 2026-09-11 (ID `5a443235-...`). DNS records live in Porkbun (verified via Google DoH):
  - `TXT resend._domainkey.signful.co` (DKIM, resolving)
  - `MX send.signful.co = feedback-smtp.us-east-1.amazonses.com`
  - `TXT send.signful.co = v=spf1 include:amazonses.com ~all`
  Resend status: `verified` 2026-09-11 (needed 4th record: `CNAME rsend`).
- [x] Update worker `from` address to `noreply@signful.co` once domain verifies. Deployed + proven: live sign-in email to outlook delivered (`delivered` event).
- [x] DMARC added: `TXT _dmarc.signful.co = v=DMARC1; p=none; rua=mailto:dmarc@signful.co` (fixes Outlook spam placement).
- [x] Fix failing GitHub Actions (every push since phase 0/1): `cloudflare/wrangler-action@v3` broke on wrangler v4 project. Replaced with direct `npx wrangler deploy`, node 20 -> 22, added typecheck gate. Green on `073e965`.

---

## 5. Deploy to Production

- [ ] Deploy Cloudflare Worker API Backend:
  ```bash
  cd worker
  npx wrangler deploy
  ```

- [ ] Deploy Cloudflare Pages Frontend:
  ```bash
  npx wrangler pages deploy pages --project-name=signful
  ```

---

## 6. Post-Launch Verification

- [ ] Test magic link sign-in flow on production URL.
- [ ] Test document deployment with 0 credits to verify HTTP 402 Paywall modal.
- [ ] Perform a test credit purchase via Stripe Checkout.
