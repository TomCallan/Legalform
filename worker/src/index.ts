import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  RESEND_API_KEY?: string;
  ADMIN_API_KEY?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for all routes (for Pages dynamic form interactions)
app.use('*', cors());

// Helper utilities
async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const now = () => Math.floor(Date.now() / 1000);

async function checkRateLimit(
  db: D1Database,
  type: 'ip' | 'email',
  value: string,
  docId: string,
  max: number
): Promise<boolean> {
  const hour = Math.floor(now() / 3600);
  await db.prepare(
    `INSERT INTO rate_limits (resource_type, resource_value, document_id, window_hour, count)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(resource_type, resource_value, document_id, window_hour) 
     DO UPDATE SET count = count + 1`
  ).bind(type, value, docId, hour).run();

  const row = await db.prepare(
    `SELECT count FROM rate_limits 
     WHERE resource_type=? AND resource_value=? AND document_id=? AND window_hour=?`
  ).bind(type, value, docId, hour).first<{ count: number }>();

  return (row?.count ?? 0) <= max;
}

async function logAudit(
  db: D1Database,
  event: {
    submissionId?: string;
    documentId: string;
    type: string;
    data?: object;
    ip: string;
    ua: string;
    session: string;
  }
) {
  const ipHash = await sha256(event.ip);
  await db.prepare(
    `INSERT INTO audit_logs 
     (submission_id, document_id, event_type, event_data, ip_hash, user_agent, session_id, server_timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    event.submissionId ?? null,
    event.documentId,
    event.type,
    JSON.stringify(event.data ?? {}),
    ipHash,
    event.ua,
    event.session,
    now()
  ).run();
}

// ── Admin: List All Documents ──────────────────────────────
app.get('/api/documents/list', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : c.req.query('api_key');
  const adminKey = c.env.ADMIN_API_KEY;

  if (adminKey && apiKey !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const docs = await c.env.DB.prepare(
    `SELECT d.id, d.slug, d.status, d.expires_at, d.created_at, 
            COUNT(s.id) AS submission_count 
     FROM documents d 
     LEFT JOIN submissions s ON d.id = s.document_id 
     GROUP BY d.id, d.slug, d.status, d.expires_at, d.created_at 
     ORDER BY d.created_at DESC`
  ).all();

  return c.json({ documents: docs.results });
});

// ── Admin: Force Close Document / Slug ───────────────────────
app.post('/api/doc/:slug/close', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : c.req.query('api_key');
  const adminKey = c.env.ADMIN_API_KEY;

  if (adminKey && apiKey !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const slug = c.req.param('slug');
  const result = await c.env.DB.prepare(
    'UPDATE documents SET status = ? WHERE slug = ? OR id = ?'
  ).bind('closed', slug, slug).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Document or slug not found' }, 404);
  }

  return c.json({ success: true, message: `Document slug '${slug}' has been force closed.` });
});

// ── Admin: Reopen / Re-up Document Slug ─────────────────────
app.post('/api/doc/:slug/reopen', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : c.req.query('api_key');
  const adminKey = c.env.ADMIN_API_KEY;

  if (adminKey && apiKey !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const extendDays = body.extend_days || 30;
  const newExpiresAt = Math.floor(Date.now() / 1000) + (extendDays * 86400);

  const result = await c.env.DB.prepare(
    'UPDATE documents SET status = ?, expires_at = ? WHERE slug = ? OR id = ?'
  ).bind('active', newExpiresAt, slug, slug).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Document or slug not found' }, 404);
  }

  return c.json({ success: true, message: `Document slug '${slug}' has been reopened and re-upped for ${extendDays} days.`, expires_at: newExpiresAt });
});

// ── Admin: Deploy Document (from CLI) ──────────────────────
app.post('/api/documents', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : '';
  const body = await c.req.json();
  const effectiveKey = apiKey || body.api_key;

  const adminKey = c.env.ADMIN_API_KEY;
  if (adminKey && effectiveKey !== adminKey) {
    return c.json({ error: 'Unauthorized: Invalid API Key' }, 401);
  }

  const { id, slug, spec, expires_at, max_per_email, max_per_ip, require_verification } = body;
  if (!id || !slug || !spec) {
    return c.json({ error: 'Missing required fields: id, slug, spec' }, 400);
  }

  const apiKeyHash = effectiveKey ? await sha256(effectiveKey) : 'unauthenticated';

  await c.env.DB.prepare(
    `INSERT INTO documents (id, slug, spec, expires_at, max_per_email, max_per_ip, require_verification, owner_api_key_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET spec=excluded.spec, expires_at=excluded.expires_at`
  ).bind(
    id, slug, spec, expires_at ?? null,
    max_per_email ?? 1, max_per_ip ?? 3,
    require_verification ? 1 : 0, apiKeyHash
  ).run();

  return c.json({ success: true, id, slug });
});

// ── Public: Get Document Spec ──────────────────────────────
app.get('/api/doc/:slug', async (c) => {
  const slug = c.req.param('slug');
  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE slug = ? AND status = ?'
  ).bind(slug, 'active').first();

  if (!doc) return c.json({ error: 'Document not found or inactive' }, 404);

  const expiresAt = doc.expires_at as number | null;
  if (expiresAt && expiresAt < now()) {
    await c.env.DB.prepare('UPDATE documents SET status = ? WHERE id = ?').bind('expired', doc.id).run();
    return c.json({ error: 'Document expired' }, 410);
  }

  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? '127.0.0.1';
  const session = c.req.header('CF-Ray') ?? crypto.randomUUID();

  await logAudit(c.env.DB, {
    documentId: doc.id as string,
    type: 'page_open',
    ip,
    ua: c.req.header('User-Agent') ?? '',
    session
  });

  return c.json({
    id: doc.id,
    slug: doc.slug,
    spec: doc.spec,
    require_verification: doc.require_verification === 1,
    expires_at: doc.expires_at
  });
});

// ── Public: Send Verification Email ────────────────────────
app.post('/api/verify-email', async (c) => {
  const { slug, email, redirect_url } = await c.req.json();
  const doc = await c.env.DB.prepare('SELECT * FROM documents WHERE slug = ?').bind(slug).first();
  if (!doc) return c.json({ error: 'Document not found' }, 404);

  const token = crypto.randomUUID();
  const expires = now() + 3600; // 1 hour

  await c.env.DB.prepare(
    'INSERT INTO email_tokens (token, email, document_id, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, email, doc.id, expires).run();

  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? '127.0.0.1';

  // Send via Resend API if API key configured
  if (c.env.RESEND_API_KEY) {
    const verifyLink = `${redirect_url}?token=${token}&email=${encodeURIComponent(email)}`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'LegalForms <noreply@resend.dev>',
        to: email,
        subject: 'Verify your email to sign document',
        html: `<p>Click to verify: <a href="${verifyLink}">Verify Email & Sign</a></p>
               <p>Expires in 1 hour. Request IP: ${ip}</p>`
      })
    });
  }

  await logAudit(c.env.DB, {
    documentId: doc.id as string,
    type: 'email_sent',
    data: { email },
    ip,
    ua: c.req.header('User-Agent') ?? '',
    session: c.req.header('CF-Ray') ?? crypto.randomUUID()
  });

  return c.json({ sent: true, token });
});

// ── Public: Submit Document ────────────────────────────────
app.post('/api/submit/:slug', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('x-forwarded-for') ?? '127.0.0.1';
  const ua = c.req.header('User-Agent') ?? '';
  const session = c.req.header('CF-Ray') ?? crypto.randomUUID();

  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE slug = ? AND status = ?'
  ).bind(slug, 'active').first();

  if (!doc) return c.json({ error: 'Document not found' }, 404);
  const expiresAt = doc.expires_at as number | null;
  if (expiresAt && expiresAt < now()) {
    await c.env.DB.prepare('UPDATE documents SET status = ? WHERE id = ?').bind('expired', doc.id).run();
    return c.json({ error: 'Document expired' }, 410);
  }

  const email = (body.email || '').toLowerCase().trim();
  const ipHash = await sha256(ip);

  // Rate Limiting checks
  if (!await checkRateLimit(c.env.DB, 'email', email, doc.id as string, doc.max_per_email as number)) {
    return c.json({ error: 'Submission limit reached for this email address' }, 429);
  }
  if (!await checkRateLimit(c.env.DB, 'ip', ipHash, doc.id as string, doc.max_per_ip as number)) {
    return c.json({ error: 'Submission limit reached for this IP address' }, 429);
  }

  // Verify token if required
  let isEmailVerified = 0;
  if (doc.require_verification === 1) {
    if (body.verification_token) {
      const tokenRow = await c.env.DB.prepare(
        'SELECT * FROM email_tokens WHERE token = ? AND email = ? AND document_id = ? AND used = 0 AND expires_at > ?'
      ).bind(body.verification_token, email, doc.id, now()).first();

      if (tokenRow) {
        isEmailVerified = 1;
        await c.env.DB.prepare('UPDATE email_tokens SET used = 1 WHERE token = ?').bind(body.verification_token).run();
      } else {
        return c.json({ error: 'Invalid or expired email verification token' }, 403);
      }
    } else {
      return c.json({ error: 'Email verification required' }, 403);
    }
  }

  // Cryptographic audit chain calculation
  const submissionId = crypto.randomUUID();
  const auditData = {
    submission_id: submissionId,
    document_id: doc.id,
    email,
    ip_hash: ipHash,
    fingerprint: body.fingerprint,
    fields: body.fields,
    timestamp: now()
  };

  const auditHash = await sha256(JSON.stringify(auditData));

  await c.env.DB.prepare(
    `INSERT INTO submissions 
     (id, document_id, email, email_verified, ip_hash, user_agent, fingerprint, 
      submitted_at, data_json, signature_svg, audit_hash, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    submissionId, doc.id, email, isEmailVerified,
    ipHash, ua, body.fingerprint, now(),
    JSON.stringify(body.fields), body.signature_svg || '', auditHash, 'complete'
  ).run();

  // Log client interaction audit trail
  for (const event of (body.auditTrail || [])) {
    await logAudit(c.env.DB, {
      submissionId,
      documentId: doc.id as string,
      type: event.type,
      data: event.data,
      ip, ua, session
    });
  }

  await logAudit(c.env.DB, {
    submissionId,
    documentId: doc.id as string,
    type: 'submit_complete',
    data: { audit_hash: auditHash },
    ip, ua, session
  });

  // Store completed submission record in R2 storage
  const r2Key = `submissions/${doc.id}/${submissionId}.json`;
  const r2Record = {
    submission_id: submissionId,
    document_id: doc.id,
    spec: typeof doc.spec === 'string' ? JSON.parse(doc.spec) : doc.spec,
    email,
    submitted_at: now(),
    fields: body.fields,
    signature: body.signature_svg,
    audit_hash: auditHash,
    fingerprint: body.fingerprint,
    audit_trail: body.auditTrail || []
  };

  try {
    await c.env.R2.put(r2Key, JSON.stringify(r2Record, null, 2), {
      customMetadata: {
        document_id: doc.id as string,
        email,
        audit_hash: auditHash
      }
    });
  } catch (r2Err) {
    console.error('R2 storage error:', r2Err);
  }

  // Send completion confirmation via Resend to both Signer and Admin
  if (c.env.RESEND_API_KEY) {
    const parsedSpec = typeof doc.spec === 'string' ? JSON.parse(doc.spec) : doc.spec;
    const adminEmail = parsedSpec.document?.admin_notification_email || c.env.ADMIN_EMAIL || 'tomcallan0@outlook.com';
    const recipients = Array.from(new Set([email, adminEmail].filter(Boolean)));

    const fieldsSummaryHtml = Object.entries(body.fields || {})
      .map(([k, v]) => `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">${k}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${v}</td></tr>`)
      .join('');

    const certHtml = `
      <div style="font-family:serif;padding:30px;max-width:680px;margin:0 auto;border:2px solid #0f172a;background:#ffffff;color:#0f172a;">
        <div style="text-align:center;border-bottom:2px solid #0f172a;padding-bottom:15px;margin-bottom:20px;">
          <h2 style="margin:0;font-family:'Cinzel',Georgia,serif;letter-spacing:1px;">OFFICIAL CERTIFICATE OF ELECTRONIC EXECUTION</h2>
          <p style="margin:5px 0 0 0;font-style:italic;color:#475569;font-size:14px;">Legally Enforceable Instrument under ESIGN Act (15 U.S.C. § 7001) & UETA</p>
        </div>
        <p>This document execution certificate confirms that the agreement below has been electronically signed and cryptographically recorded.</p>
        
        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-family:sans-serif;font-size:14px;">
          <tr><td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Document ID</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${doc.id}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Execution Timestamp</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${new Date(now() * 1000).toUTCString()}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Signer Email</td><td style="padding:6px 12px;border:1px solid #e2e8f0;">${email || 'N/A'}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">Submission ID</td><td style="padding:6px 12px;border:1px solid #e2e8f0;font-family:monospace;">${submissionId}</td></tr>
          <tr><td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:600;background:#f8fafc;">IP Address Hash</td><td style="padding:6px 12px;border:1px solid #e2e8f0;font-family:monospace;">${ipHash}</td></tr>
          ${fieldsSummaryHtml}
        </table>

        <div style="margin-top:20px;padding:15px;background:#f8fafc;border:1px solid #cbd5e1;">
          <strong style="display:block;margin-bottom:5px;font-family:sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Cryptographic Audit SHA-256 Digest:</strong>
          <code style="word-break:break-all;font-family:monospace;font-size:12px;color:#1e3a8a;">${auditHash}</code>
        </div>
        
        <div style="margin-top:20px;text-align:center;font-size:12px;color:#64748b;font-style:italic;">
          Archived in Cloudflare R2 Vault: <code>${r2Key}</code>
        </div>
      </div>
    `;

    for (const recipient of recipients) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'LegalForm Executions <noreply@resend.dev>',
            to: recipient,
            subject: `[EXECUTED AGREEMENT] Certificate & Record: ${doc.id}`,
            html: certHtml
          })
        });
      } catch (emailErr) {
        console.error(`Resend email error sending to ${recipient}:`, emailErr);
      }
    }
  }

  return c.json({
    submission_id: submissionId,
    audit_hash: auditHash,
    r2_key: r2Key,
    message: 'Document successfully signed'
  });
});

// ── Admin: Export Submissions & Audit Trail ────────────────
app.get('/api/export/:doc_id', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : c.req.query('api_key');
  const adminKey = c.env.ADMIN_API_KEY;

  if (adminKey && apiKey !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const docId = c.req.param('doc_id');

  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE id = ? OR slug = ?'
  ).bind(docId, docId).first();

  const submissions = await c.env.DB.prepare(
    'SELECT * FROM submissions WHERE document_id = ? ORDER BY submitted_at DESC'
  ).bind(docId).all();

  const auditLogs = await c.env.DB.prepare(
    'SELECT * FROM audit_logs WHERE document_id = ? ORDER BY server_timestamp ASC'
  ).bind(docId).all();

  return c.json({
    document_id: docId,
    doc: doc,
    submissions: submissions.results,
    audit_logs: auditLogs.results
  });
});

// ── Admin: Delete Document & Purge R2 Archives ──────────────
app.delete('/api/doc/:id', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : c.req.query('api_key');
  const adminKey = c.env.ADMIN_API_KEY;

  if (adminKey && apiKey !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const id = c.req.param('id');

  // Fetch submissions to purge from R2
  const subs = await c.env.DB.prepare(
    'SELECT id FROM submissions WHERE document_id = ?'
  ).bind(id).all();

  for (const sub of (subs.results || [])) {
    const r2Key = `submissions/${id}/${sub.id}.json`;
    try { await c.env.R2.delete(r2Key); } catch(e) {}
  }

  await c.env.DB.prepare('DELETE FROM submissions WHERE document_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM audit_logs WHERE document_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ? OR slug = ?').bind(id, id).run();

  return c.json({ success: true, message: `Document '${id}' and all R2 archived objects purged.` });
});

// ── Admin: Force Close Document / Slug ───────────────────────
app.post('/api/doc/:slug/close', async (c) => {
  const authHeader = c.req.header('Authorization');
  const apiKey = authHeader ? authHeader.replace('Bearer ', '').trim() : c.req.query('api_key');
  const adminKey = c.env.ADMIN_API_KEY;

  if (adminKey && apiKey !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const slug = c.req.param('slug');
  const result = await c.env.DB.prepare(
    'UPDATE documents SET status = ? WHERE slug = ? OR id = ?'
  ).bind('closed', slug, slug).run();

  if (result.meta.changes === 0) {
    return c.json({ error: 'Document or slug not found' }, 404);
  }

  return c.json({ success: true, message: `Document slug '${slug}' has been force closed.` });
});

// ── Public: Single Submission Audit Verification ───────────
app.get('/api/audit/:submission_id', async (c) => {
  const subId = c.req.param('submission_id');
  const sub = await c.env.DB.prepare(
    'SELECT * FROM submissions WHERE id = ?'
  ).bind(subId).first();

  if (!sub) return c.json({ error: 'Submission not found' }, 404);

  const logs = await c.env.DB.prepare(
    `SELECT event_type, event_data, server_timestamp, ip_hash, user_agent 
     FROM audit_logs WHERE submission_id = ? ORDER BY server_timestamp ASC`
  ).bind(subId).all();

  return c.json({
    submission: sub,
    audit_trail: logs.results,
    integrity: {
      algorithm: 'SHA-256',
      audit_hash: sub.audit_hash
    }
  });
});

export default app;
