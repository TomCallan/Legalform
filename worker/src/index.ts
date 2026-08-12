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
  const interactionLogs = typeof body.interaction_logs === 'string' 
    ? body.interaction_logs 
    : JSON.stringify(body.interaction_logs || []);

  // Calculate SHA-256 audit digest
  const auditData = `${doc.id}:${email}:${dataJson}:${signatureData}:${submittedAt}`;
  const auditHash = await sha256(auditData);

  // Store in D1 Database
  await c.env.DB.prepare(
    `INSERT INTO submissions (id, document_id, signer_email, signer_name, data_json, signature_data, audit_hash, submitted_at, interaction_logs)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(submissionId, doc.id, email, name, dataJson, signatureData, auditHash, submittedAt, interactionLogs).run();

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
    submitted_at: submittedAt,
    interaction_logs: body.interaction_logs || []
  };

  try {
    if (c.env.R2) {
      await c.env.R2.put(`submissions/${doc.id}/${submissionId}.json`, JSON.stringify(payload, null, 2));
    }
  } catch (err) {
    console.error('R2 save error (continuing):', err);
  }

  const parsedSpec = typeof doc.spec === 'string' ? JSON.parse(doc.spec) : doc.spec;

  // Dispatch HTTP webhook callback if configured in document spec
  if (parsedSpec.document?.webhook_url) {
    try {
      await fetch(parsedSpec.document.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'document.signed',
          document_id: doc.id,
          submission_id: submissionId,
          signer_email: email,
          signer_name: name,
          fields: body.fields || {},
          audit_hash: auditHash,
          submitted_at: submittedAt,
          interaction_logs: body.interaction_logs || []
        })
      });
    } catch (webhookErr) {
      console.error('Webhook dispatch error:', webhookErr);
    }
  }

  // Send email notification to sender / admin if configured
  if (c.env.RESEND_API_KEY) {
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

// ── Public: Verify SHA256 Signature & Document Integrity ──────
app.post('/api/verify', async (c) => {
  const body = await c.req.json();
  const { hash, payload, text } = body;

  // Mode 1: Text content SHA-256 verification
  if (text !== undefined && text !== null) {
    const textHash = await sha256(String(text));
    const matches = hash ? textHash.toLowerCase() === String(hash).trim().toLowerCase() : true;
    return c.json({
      valid: matches,
      calculated_hash: textHash,
      provided_hash: hash || null,
      message: matches ? 'SHA-256 Hash matches text content.' : 'SHA-256 Hash mismatch for text content.'
    });
  }

  // Mode 2: Submission JSON Payload verification
  if (payload) {
    let sub = payload;
    if (payload.submissions && Array.isArray(payload.submissions) && payload.submissions.length > 0) {
      sub = payload.submissions[0];
    } else if (payload.payload) {
      sub = payload.payload;
    }

    const docId = sub.document_id || sub.id;
    const email = (sub.signer_email || sub.email || '').toLowerCase().trim();
    const fields = sub.fields || {};
    const dataJson = typeof fields === 'string' ? fields : JSON.stringify(fields);
    const signatureData = sub.signature_data || sub.signature_svg || '';
    const submittedAt = sub.submitted_at;
    const expectedHash = sub.audit_hash || hash;

    if (docId && submittedAt && expectedHash) {
      const auditData = `${docId}:${email}:${dataJson}:${signatureData}:${submittedAt}`;
      const calculatedHash = await sha256(auditData);
      const isValid = calculatedHash.toLowerCase() === String(expectedHash).trim().toLowerCase();

      return c.json({
        valid: isValid,
        calculated_hash: calculatedHash,
        expected_hash: expectedHash,
        document_id: docId,
        signer_email: email,
        submitted_at: submittedAt,
        message: isValid ? 'Cryptographic SHA-256 Audit Signature is VALID.' : 'Cryptographic Audit Signature is INVALID or TAMPERED.'
      });
    }
  }

  // Mode 3: Check hash in Database
  if (hash) {
    const cleanHash = String(hash).trim().toLowerCase();
    const subMatch = await c.env.DB.prepare(
      'SELECT s.*, d.id as doc_id FROM submissions s JOIN documents d ON s.document_id = d.id WHERE LOWER(s.audit_hash) = ?'
    ).bind(cleanHash).first();

    if (subMatch) {
      return c.json({
        valid: true,
        calculated_hash: cleanHash,
        submission_id: subMatch.id,
        document_id: subMatch.document_id,
        signer_email: subMatch.signer_email,
        submitted_at: subMatch.submitted_at,
        message: 'SHA-256 Audit Signature found in official ledger.'
      });
    } else {
      return c.json({
        valid: false,
        provided_hash: cleanHash,
        message: 'SHA-256 Digest not found in legal ledger database.'
      });
    }
  }

  return c.json({ error: 'Please provide hash, text, or payload to verify.' }, 400);
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
