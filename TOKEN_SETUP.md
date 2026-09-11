# API Token Setup — Checklist

Get three keys, export two locally, save all three as Worker secrets at deploy time.
Full deploy flow lives in `TODO.md`. This doc is only about where keys come from.

---

## 1. Cloudflare API token (local MCP + wrangler)

**Where:** [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) > **Create Token**.

- Start from the **Edit Cloudflare Workers** template.
- Add these permissions:
  - Account > **D1** > Edit (database create + migrate)
  - Account > **Workers R2 Storage** > Edit (bucket create)
  - Account > **Workers Scripts** > Edit (already in template; deploys worker)
  - Account > **Account Resources** > Read (lets API-token auth auto-detect your account ID)
- Zone resources: **Include > All zones** (needed later for `api.signful.co` DNS).
- TTL: leave default. Copy token once — Cloudflare never shows it again.

**Export (current PowerShell session):**

```powershell
$env:CLOUDFLARE_API_TOKEN="cf_token_here"
opencode mcp list   # cloudflare-api should flip from "needs authentication" to connected
```

**Persist across sessions** (optional): add the export line to your PowerShell `$PROFILE`,
or set a machine env var via System Properties > Environment Variables.

---

## 2. Stripe restricted key (local MCP, test mode)

**Where:** [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys) > **Create restricted key**
(stay in **Test mode** / sandbox until launch).

Minimum permissions for the billing setup step:
- **Products** > Write (create $10 pack + $19/mo Pro products and prices)
- **Checkout Sessions** > Write (test purchase flow)
- **Webhook Endpoints** > Write (register deploy webhook)
- **Customers** > Read, **Balance** > Read (verify test purchase + credit grant)

Key starts with `rk_test_`. Copy once.

**Export:**

```powershell
$env:STRIPE_SECRET_KEY="rk_test_..."
opencode mcp list   # stripe should flip to connected
```

Stripe manages MCP access separately per sandbox vs live. When going live,
create a second restricted key in **Live mode** and swap the env var.

---

## 3. Resend API key (deploy-time secret only, no local use)

**Where:** [resend.com/api-keys](https://resend.com/api-keys) > **Create API Key** >
permission **Sending access**, domain scoped once your sending domain is verified.

No local export needed. Saved straight to the Worker at deploy:

```bash
cd worker
npx wrangler secret put RESEND_API_KEY
```

---

## 4. Wrangler login (deploy auth, separate from API token)

```bash
cd worker
npx wrangler login   # browser OAuth into your Cloudflare account
```

---

## Verify all

- [ ] `opencode mcp list` shows `cloudflare-api` connected
- [ ] `opencode mcp list` shows `stripe` connected
- [ ] `npx wrangler whoami` shows your Cloudflare account
- [ ] Test Stripe purchase appears in [dashboard > Payments (test mode)](https://dashboard.stripe.com/test/payments)

## Next

Back to `TODO.md`: D1 migrate, secrets, Stripe webhook registration, deploy.
The webhook signing secret (`whsec_...`) only exists after the webhook endpoint
is created — it cannot be collected in advance.
