import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  RESEND_API_KEY?: string;
  ADMIN_EMAIL?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

app.use('*', cors());

const now = () => Math.floor(Date.now() / 1000);

async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Public: Deploy / Store Document Spec ──────────────────────
app.post('/api/documents', async (c) => {
  const body = await c.req.json();
  const { id, slug, spec, expires_at } = body;

  if (!id || !slug || !spec) {
    return c.json({ error: 'Missing required fields: id, slug, spec' }, 400);
  }

  const specString = typeof spec === 'string' ? spec : JSON.stringify(spec);

  await c.env.DB.prepare(
    `INSERT INTO documents (id, slug, spec, status, expires_at)
     VALUES (?, ?, ?, 'active', ?)
     ON CONFLICT(id) DO UPDATE SET slug=excluded.slug, spec=excluded.spec, status='active', expires_at=excluded.expires_at`
  ).bind(id, slug, specString, expires_at ?? null).run();

  return c.json({ success: true, id, slug });
});

// ── Public: List All Documents ────────────────────────────────
app.get('/api/documents/list', async (c) => {
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

// ── Public: Get Document Spec by Slug ────────────────────────
app.get('/api/doc/:slug', async (c) => {
  const slug = c.req.param('slug');
  
  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE (slug = ? OR id = ?) AND status = ?'
  ).bind(slug, slug, 'active').first();

  if (!doc) return c.json({ error: 'Document not found or inactive' }, 404);

  const expiresAt = doc.expires_at as number | null;
  if (expiresAt && expiresAt < now()) {
    await c.env.DB.prepare('UPDATE documents SET status = ? WHERE id = ?').bind('expired', doc.id).run();
    return c.json({ error: 'Document expired' }, 410);
  }

  return c.json({
    id: doc.id,
    slug: doc.slug,
    spec: doc.spec,
    expires_at: doc.expires_at
  });
});

// ── Public: Submit Completed Document ────────────────────────
app.post('/api/submit/:slug', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();

  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE (slug = ? OR id = ?) AND status = ?'
  ).bind(slug, slug, 'active').first();

  if (!doc) return c.json({ error: 'Document not found or inactive' }, 404);

  const email = (body.email || body.fields?.signer_email || '').toLowerCase().trim();
  const name = body.name || body.fields?.receiving_party || body.fields?.signer_name || 'Signer';
  const submissionId = crypto.randomUUID();
  const submittedAt = now();

  const dataJson = JSON.stringify(body.fields || {});
  const signatureData = body.signature_data || body.signature_svg || '';

  // Calculate SHA-256 audit digest
  const auditData = `${doc.id}:${email}:${dataJson}:${signatureData}:${submittedAt}`;
  const auditHash = await sha256(auditData);

  // Store in D1 Database
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, document_id, signer_email, signer_name, data_json, signature_data, audit_hash, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(submissionId, doc.id, email, name, dataJson, signatureData, auditHash, submittedAt).run();

  // Archive full, compact payload to R2 bucket if available
  const payload = {
    submission_id: submissionId,
    document_id: doc.id,
    slug: doc.slug,
    spec: typeof doc.spec === 'string' ? JSON.parse(doc.spec) : doc.spec,
    signer_email: email,
    signer_name: name,
    fields: body.fields || {},
    signature_data: signatureData,
    audit_hash: auditHash,
    submitted_at: submittedAt
  };

  try {
    if (c.env.R2) {
      await c.env.R2.put(`submissions/${doc.id}/${submissionId}.json`, JSON.stringify(payload, null, 2));
    }
  } catch (err) {
    console.error('R2 save error (continuing):', err);
  }

  // Send email notification to sender / admin if configured
  if (c.env.RESEND_API_KEY) {
    const parsedSpec = typeof doc.spec === 'string' ? JSON.parse(doc.spec) : doc.spec;
    const adminEmail = parsedSpec.document?.admin_notification_email || c.env.ADMIN_EMAIL;
    if (adminEmail) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${c.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'LegalForm <noreply@resend.dev>',
            to: adminEmail,
            subject: `[EXECUTED AGREEMENT] ${doc.id} signed by ${email}`,
            html: `
              <h2>Document Execution Notification</h2>
              <p>Document <strong>${doc.id}</strong> has been signed.</p>
              <p><strong>Signer:</strong> ${name} (${email})</p>
              <p><strong>SHA-256 Audit Hash:</strong> <code>${auditHash}</code></p>
              <p><strong>Timestamp:</strong> ${new Date(submittedAt * 1000).toUTCString()}</p>
            `
          })
        });
      } catch (emailErr) {
        console.error('Failed to send admin email notification:', emailErr);
      }
    }
  }

  return c.json({
    submission_id: submissionId,
    audit_hash: auditHash,
    submitted_at: submittedAt,
    payload,
    message: 'Document signed successfully'
  });
});

// ── Public: Export Submission Data / Compact JSON Payload ────
app.get('/api/export/:doc_id', async (c) => {
  const docId = c.req.param('doc_id');

  const doc = await c.env.DB.prepare(
    'SELECT * FROM documents WHERE id = ? OR slug = ?'
  ).bind(docId, docId).first();

  if (!doc) return c.json({ error: 'Document not found' }, 404);

  const submissions = await c.env.DB.prepare(
    'SELECT * FROM submissions WHERE document_id = ? ORDER BY submitted_at DESC'
  ).bind(doc.id).all();

  return c.json({
    document_id: doc.id,
    spec: typeof doc.spec === 'string' ? JSON.parse(doc.spec as string) : doc.spec,
    submissions: submissions.results
  });
});

// ── Public: Close / Delete Document ─────────────────────────
app.post('/api/doc/:slug/close', async (c) => {
  const slug = c.req.param('slug');
  await c.env.DB.prepare('UPDATE documents SET status = ? WHERE slug = ? OR id = ?').bind('closed', slug, slug).run();
  return c.json({ success: true, message: `Document '${slug}' closed.` });
});

export default app;
