import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { Color, PDFFont } from 'pdf-lib';

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

app.notFound((c) => {
  return c.json({ error: 'Route Not Found', path: c.req.path }, 404);
});

app.use('*', cors());

const now = () => Math.floor(Date.now() / 1000);

app.get('/', (c) => c.json({ status: 'ok', service: 'LegalForm API' }));
app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: now() }));

async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
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
          submitted_at: submittedAt
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

// ── Public: Render PDF Certificate / Compiled Agreement ────
app.post('/api/render-pdf', async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const submissionId = String(body.submission_id ?? 'unknown');
  const docId = String(body.document_id ?? body.slug ?? 'unknown');
  const specRaw = typeof body.spec === 'string' ? safeParseJson(body.spec) : (body.spec ?? {});
  const spec = (specRaw && typeof specRaw === 'object' ? specRaw : {}) as Record<string, any>;
  const docTitle = String(spec.document?.title ?? docId);
  const signerName = String(body.signer_name ?? body.name ?? 'Signer');
  const signerEmail = String(body.signer_email ?? body.email ?? '');
  const fields = (body.fields && typeof body.fields === 'object' ? body.fields : {}) as Record<string, unknown>;
  const signatureData = String(body.signature_data ?? '');
  const auditHash = String(body.audit_hash ?? '');
  const submittedAt = typeof body.submitted_at === 'number' ? body.submitted_at : 0;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter portrait
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const margin = 56;
  const maxWidth = 612 - margin * 2;
  const ink = rgb(0.09, 0.1, 0.13);
  const muted = rgb(0.45, 0.47, 0.52);
  let y = 792 - margin;

  const centered = (text: string, font: PDFFont, size: number, color: Color = ink) => {
    page.drawText(text, { x: (612 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  };
  const drawLine = (text: string, opts: { font?: PDFFont; size?: number; color?: Color; gap?: number } = {}) => {
    page.drawText(text, { x: margin, y, size: opts.size ?? 11, font: opts.font ?? helv, color: opts.color ?? ink });
    y -= opts.gap ?? 16;
  };
  const drawWrapped = (text: string, opts: { font?: PDFFont; size?: number; color?: Color; gap?: number } = {}) => {
    for (const line of wrapText(text, opts.font ?? helv, opts.size ?? 11, maxWidth)) drawLine(line, opts);
  };
  const rule = () => {
    page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 0.7, color: muted });
    y -= 14;
  };

  centered('CERTIFICATE OF EXECUTION', helvBold, 19, ink);
  y -= 6;
  centered('LegalForm — Court-Enforceable Signature Infrastructure', helv, 8.5, muted);
  y -= 14;
  rule();

  drawLine(docTitle.toUpperCase(), { font: helvBold, size: 12, gap: 20 });
  drawLine(`Document ID: ${docId}`, { size: 10.5, gap: 8 });
  drawLine(`Signer: ${signerName}${signerEmail ? ` <${signerEmail}>` : ''}`, { size: 10.5, gap: 8 });
  drawLine(`Submitted: ${submittedAt ? new Date(submittedAt * 1000).toUTCString() : 'n/a'}`, { size: 10.5, gap: 16 });

  const fieldEntries = Object.entries(fields);
  if (fieldEntries.length > 0) {
    drawLine('Executed Terms / Fields', { font: helvBold, size: 11, gap: 10 });
    for (const [k, v] of fieldEntries) {
      const val = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
      drawWrapped(`${k}: ${val}`, { size: 10, gap: 13 });
    }
    y -= 6;
  }

  if (signatureData) {
    drawLine('Signature: Captured (electronic) — see exported JSON payload for raw data', { size: 10, gap: 16 });
  }

  drawLine('Cryptographic Audit — SHA-256 Digest', { font: helvBold, size: 11, gap: 10 });
  const hashChunks = auditHash.match(/.{1,76}/g) ?? [auditHash || 'n/a'];
  for (const chunk of hashChunks) {
    drawLine(chunk, { font: courier, size: 9, gap: 14 });
  }

  y = 40;
  centered('Generated by LegalForm — verify this digest against the sender ledger export', helv, 8, muted);

  const pdfBytes = new Uint8Array(await pdfDoc.save());
  const subShortId = submissionId.slice(0, 8);
  return c.body(pdfBytes, 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="executed-agreement-${subShortId}.pdf"`
  });
});

// ── Public: Close / Delete Document ─────────────────────────
app.post('/api/doc/:slug/close', async (c) => {
  const slug = c.req.param('slug');
  await c.env.DB.prepare('UPDATE documents SET status = ? WHERE slug = ? OR id = ?').bind('closed', slug, slug).run();
  return c.json({ success: true, message: `Document '${slug}' closed.` });
});

export default app;
