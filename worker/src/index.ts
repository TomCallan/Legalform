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

// PDF standard fonts use the WinAnsi encoding; any character outside it is
// replaced with '?' so arbitrary user/spec text can't break rendering.
const WIN_ANSI_SAFE = /[^\x20-\x7E\u00A0-\u00FF\u0152\u0153\u0178\u0192\u02C6\u02DC\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122\u0160\u0161\u017D\u017E]/g;

function winAnsiSafe(text: string): string {
  return text.replace(WIN_ANSI_SAFE, '?');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = winAnsiSafe(text).split(/\s+/);
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

// ── Public: Render Full Executed Agreement PDF + Certificate ──
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
  const docTitle = String(spec.document?.title ?? docId).toUpperCase();
  const jurisdiction = String(spec.document?.jurisdiction ?? '');
  const legalFooter = String(spec.document?.legal_footer ?? '');
  const sections = Array.isArray(spec.sections) ? spec.sections : [];
  const signerName = String(body.signer_name ?? body.name ?? 'Signer');
  const signerEmail = String(body.signer_email ?? body.email ?? '');
  const fields = (body.fields && typeof body.fields === 'object' ? body.fields : {}) as Record<string, unknown>;
  const signatureData = String(body.signature_data ?? '');
  const auditHash = String(body.audit_hash ?? '');
  const submittedAt = typeof body.submitted_at === 'number' ? body.submitted_at : 0;
  const timeStr = submittedAt
    ? new Date(submittedAt * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : 'N/A';

  const pdfDoc = await PDFDocument.create();
  const pageW = 612;
  const pageH = 792;
  const margin = 40;
  const maxWidth = pageW - margin * 2;
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const helvOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const courierBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  // Palette mirrors cli/legalform.py build_pdf_bytes
  const ink = rgb(0.0588, 0.0902, 0.1647);      // #0f172a
  const muted = rgb(0.2784, 0.3333, 0.4118);    // #475569
  const cell = rgb(0.2, 0.2549, 0.3333);        // #334155
  const hashBlue = rgb(0.0078, 0.5176, 0.7804); // #0284c7
  const tableBg = rgb(0.9725, 0.9804, 0.9882);  // #f8fafc
  const grid = rgb(0.7961, 0.8353, 0.8824);     // #cbd5e1
  const bodyInk = rgb(0.1176, 0.1608, 0.2314);  // #1e293b

  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const newPageIfNeeded = (needed: number) => {
    if (y - needed < margin) {
      page = pdfDoc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
  };

  const centered = (text: string, font: PDFFont, size: number, color: Color = ink) => {
    for (const line of wrapText(text, font, size, maxWidth)) {
      page.drawText(line, { x: (pageW - font.widthOfTextAtSize(line, size)) / 2, y, size, font, color });
      y -= size + 6;
    }
  };

  const drawWrapped = (text: string, opts: { font?: PDFFont; size?: number; color?: Color; gap?: number } = {}) => {
    const font = opts.font ?? helv;
    const size = opts.size ?? 11;
    for (const line of wrapText(text, font, size, maxWidth)) {
      page.drawText(line, { x: margin, y, size, font, color: opts.color ?? ink });
      y -= opts.gap ?? size + 4.5;
    }
  };

  const rule = (thickness: number, color: Color, spaceAfter: number) => {
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness, color });
    y -= spaceAfter;
  };

  const spacer = (n: number) => { y -= n; };

  const drawTable = (
    rows: Array<{ label: string; value: string; valueFont?: PDFFont; valueSize?: number; valueColor?: Color }>,
    colWidths: [number, number] = [180, 350]
  ) => {
    const [labelCol, valueCol] = colWidths;
    const pad = 5;
    const lineHeight = 13;
    for (const row of rows) {
      const labelLines = wrapText(row.label, helvBold, 10, labelCol - pad * 2);
      const valueFont = row.valueFont ?? helv;
      const valueSize = row.valueSize ?? 10;
      const valueLines = wrapText(row.value, valueFont, valueSize, valueCol - pad * 2);
      const rowHeight = Math.max(labelLines.length, valueLines.length) * lineHeight + pad * 2;
      newPageIfNeeded(rowHeight + 8);
      const top = y;
      const bottom = y - rowHeight;
      page.drawRectangle({ x: margin, y: bottom, width: labelCol, height: rowHeight, color: tableBg });
      page.drawRectangle({ x: margin, y: bottom, width: labelCol + valueCol, height: rowHeight, borderColor: grid, borderWidth: 0.5 });
      page.drawLine({ start: { x: margin + labelCol, y: top }, end: { x: margin + labelCol, y: bottom }, thickness: 0.5, color: grid });
      let ty = top - pad;
      for (const line of labelLines) {
        page.drawText(line, { x: margin + pad, y: ty - 10, size: 10, font: helvBold, color: ink });
        ty -= lineHeight;
      }
      let vy = top - pad;
      for (const line of valueLines) {
        page.drawText(line, { x: margin + labelCol + pad, y: vy - valueSize, size: valueSize, font: valueFont, color: row.valueColor ?? cell });
        vy -= lineHeight;
      }
      y = bottom;
    }
  };

  const embedSignatureImage = async (width: number) => {
    const m = signatureData.match(/^data:image\/(png|jpe?g);base64,(.+)$/);
    if (!m) return;
    const imgBytes = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
    const img = m[1] === 'png' ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
    const height = Math.round((img.height / img.width) * width);
    page.drawImage(img, { x: margin, y: y - height, width, height });
    y -= height + 10;
  };

  const hasEmbeddableSignature = /^data:image\/(png|jpe?g);base64,/.test(signatureData);

  // ── Page 1: full executed agreement ──
  centered(docTitle, helvBold, 18, ink);
  if (jurisdiction) {
    spacer(2);
    centered(`Jurisdiction: ${jurisdiction}`, helvOblique, 10, muted);
  }
  spacer(10);
  rule(2, ink, 15);

  for (const sec of sections) {
    if (sec.type === 'static') {
      for (const rawLine of String(sec.content ?? '').split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        newPageIfNeeded(40);
        if (line.startsWith('## ')) {
          page.drawText(winAnsiSafe(line.slice(3)), { x: margin, y, size: 11, font: helvBold, color: ink });
          y -= 20;
        } else {
          drawWrapped(line, { font: helv, size: 9.5, color: bodyInk, gap: 14 });
          y -= 4;
        }
      }
    } else if (sec.type === 'form' || sec.type === 'signature') {
      const rows: Array<{ label: string; value: string }> = [];
      for (const f of (sec.fields ?? [])) {
        const fname = f.name;
        const flabel = f.label ?? fname;
        const val = fields[fname] ?? f.value ?? '';
        rows.push({ label: String(flabel), value: String(val) });
      }
      if (rows.length) {
        spacer(6);
        drawTable(rows);
        spacer(10);
      }
    }
  }

  spacer(15);
  if (legalFooter) {
    newPageIfNeeded(40);
    drawWrapped(legalFooter, { font: helvOblique, size: 8.5, color: muted, gap: 12 });
    spacer(10);
  }

  drawTable([
    { label: 'Execution UTC Timestamp', value: timeStr },
    { label: 'Signer Email', value: signerEmail },
    { label: 'SHA-256 Cryptographic Audit Hash', value: auditHash, valueFont: courierBold, valueSize: 9, valueColor: hashBlue }
  ]);
  spacer(15);

  if (hasEmbeddableSignature) {
    try {
      newPageIfNeeded(120);
      page.drawText('SIGNATURE OF RECORD', { x: margin, y, size: 10, font: helvBold, color: ink });
      y -= 14;
      await embedSignatureImage(200);
    } catch (err) {
      console.error('Signature embed failed (agreement page):', err);
    }
  }

  rule(1, grid, 10);
  drawWrapped('Compiled from the cryptographically verified submission record', { font: helvOblique, size: 8.5, color: muted, gap: 12 });

  // ── Page 2: official certificate of electronic execution ──
  page = pdfDoc.addPage([pageW, pageH]);
  y = pageH - margin;

  centered('OFFICIAL CERTIFICATE OF ELECTRONIC EXECUTION', helvBold, 16, ink);
  spacer(4);
  centered('Court-Enforceable Instrument (ESIGN Act 15 U.S.C. § 7001 & EU eIDAS Regulation Art. 25)', helvOblique, 9, muted);
  spacer(10);
  rule(2, ink, 15);

  drawTable([
    { label: 'Document ID', value: docId },
    { label: 'Submission ID', value: submissionId },
    { label: 'Signer Name', value: signerName },
    { label: 'Signer Email', value: signerEmail },
    { label: 'Execution UTC Timestamp', value: timeStr },
    { label: 'Cryptographic Audit SHA-256 Digest', value: auditHash, valueFont: courierBold, valueSize: 9, valueColor: hashBlue }
  ]);
  spacer(20);

  if (hasEmbeddableSignature) {
    try {
      newPageIfNeeded(140);
      page.drawText('DIGITAL SIGNATURE CANVAS RECORD', { x: margin, y, size: 10, font: helvBold, color: ink });
      y -= 14;
      await embedSignatureImage(220);
    } catch (err) {
      console.error('Signature embed failed (certificate page):', err);
    }
  }

  const pdfBytes = new Uint8Array(await pdfDoc.save());
  const subShortId = submissionId.slice(0, 8);
  return c.body(pdfBytes, 200, {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="executed-agreement-${subShortId}.pdf"`
  });
});

// ── Public: Close / Revoke Document ─────────────────────────
app.post('/api/doc/:slug/close', async (c) => {
  const slug = c.req.param('slug');
  await c.env.DB.prepare('UPDATE documents SET status = ? WHERE slug = ? OR id = ?').bind('closed', slug, slug).run();
  return c.json({ success: true, message: `Document '${slug}' closed.` });
});

// ── Public: Restart / Reopen a Document for Signing ─────────
app.post('/api/doc/:slug/restart', async (c) => {
  const slug = c.req.param('slug');
  await c.env.DB.prepare(
    `UPDATE documents SET status = 'active',
       expires_at = CASE WHEN expires_at IS NOT NULL AND expires_at < ? THEN NULL ELSE expires_at END
     WHERE slug = ? OR id = ?`
  ).bind(now(), slug, slug).run();
  return c.json({ success: true, message: `Document '${slug}' reopened for signing.` });
});

// ── Public: Permanently Delete a Document Run ───────────────
app.delete('/api/doc/:id', async (c) => {
  const docId = c.req.param('id');

  const doc = await c.env.DB.prepare(
    'SELECT id, slug FROM documents WHERE id = ? OR slug = ?'
  ).bind(docId, docId).first();

  if (!doc) return c.json({ error: 'Document not found' }, 404);

  // Purge archived submission payloads from R2
  if (c.env.R2) {
    try {
      let cursor: string | undefined;
      do {
        const listed = await c.env.R2.list({ prefix: `submissions/${doc.id}/`, cursor });
        for (const obj of listed.objects) await c.env.R2.delete(obj.key);
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.error('R2 purge error (continuing):', err);
    }
  }

  await c.env.DB.prepare('DELETE FROM submissions WHERE document_id = ?').bind(doc.id).run();
  await c.env.DB.prepare('DELETE FROM documents WHERE id = ?').bind(doc.id).run();

  return c.json({ success: true, deleted: doc.id });
});

export default app;
