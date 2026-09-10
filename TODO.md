# Legalform SaaS — Deployment & Production Setup TODO

## Overview
All multi-tenancy, magic link authentication, credit billing ($10 for 5 credits pack / $19/mo Pro plan), strict paywalls (0 free credits default), and UI components have been built, verified, and committed to `main`.

Follow this checklist to complete the production launch on Cloudflare, Stripe, and Resend.

---

## 1. Cloudflare Secrets Configuration

Run these commands in the terminal (`worker/` directory) to configure production API secrets in your Cloudflare Worker:

- [ ] Set **Stripe Secret Key**:
  ```bash
  cd worker
  npx wrangler secret put STRIPE_SECRET_KEY
  # Enter sk_live_... or sk_test_... when prompted
  ```

- [ ] Set **Stripe Webhook Signing Secret**:
  ```bash
  npx wrangler secret put STRIPE_WEBHOOK_SECRET
  # Enter whsec_... when prompted
  ```

- [ ] Set **Resend API Key**:
  ```bash
  npx wrangler secret put RESEND_API_KEY
  # Enter re_... when prompted
  ```

---

## 2. Database Migration (Cloudflare D1)

- [ ] Apply [schema.sql](file:///C:/Users/TomCa/Documents/Legalform/schema.sql) to your remote production D1 database (`legalform-db`):
  ```bash
  npx wrangler d1 execute legalform-db --remote --file=schema.sql
  ```

---

## 3. Stripe Webhook Registration

- [ ] In [Stripe Webhooks Dashboard](https://dashboard.stripe.com/webhooks), click **Add Endpoint**.
- [ ] Set **Endpoint URL**: `https://legalform-api.tomcallan0.workers.dev/api/billing/webhook` (or your custom API domain).
- [ ] Select **Event to send**: `checkout.session.completed` and `invoice.payment_succeeded`.
- [ ] Copy the signing secret (`whsec_...`) and save it to Wrangler as `STRIPE_WEBHOOK_SECRET`.

---

## 4. Transactional Email Setup (Resend)

- [ ] Add your sending domain in [Resend Dashboard](https://resend.com/domains).
- [ ] Update DNS records (SPF & DKIM) to ensure reliable deliverability for 6-digit magic codes and signed PDF attachments.

---

## 5. Deploy to Production

- [ ] Deploy Cloudflare Worker API Backend:
  ```bash
  cd worker
  npx wrangler deploy
  ```

- [ ] Deploy Cloudflare Pages Frontend:
  ```bash
  npx wrangler pages deploy pages --project-name=legalform
  ```

---

## 6. Post-Launch Verification

- [ ] Test magic link sign-in flow on production URL.
- [ ] Test document deployment with 0 credits to verify HTTP 402 Paywall modal.
- [ ] Perform a test credit purchase via Stripe Checkout.
