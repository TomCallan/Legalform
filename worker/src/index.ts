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
  if (!text) return '';
  return String(text)
    .replace(/[\u2028\u2029\v\f]/g, '\n')       // Unicode line & paragraph separators -> newlines
    .replace(/\r\n?/g, '\n')                   // CR / CRLF -> LF
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '') // strip non-printable & zero-width characters
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'") // single quotes / apostrophes (e.g. ’ -> ')
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"') // double quotes (e.g. “ ” -> ")
    .replace(/[\u2010-\u2015]/g, '-')          // hyphens & en/em dashes (e.g. — -> -)
    .replace(/\u2026/g, '...')                 // horizontal ellipsis (…)
    .replace(/\u2022/g, '*')                   // bullet (•)
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // non-breaking & special spaces -> standard space
    .replace(WIN_ANSI_SAFE, (m) => (/\s/.test(m) ? ' ' : '')); // strip unmapped chars without adding ?
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const safeText = winAnsiSafe(String(text ?? ''));
  const rawLines = safeText.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      lines.push('');
      continue;
    }
    const words = rawLine.split(/\s+/);
    let line = '';
    for (const word of words) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
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
    const rawText = String(text);
    const textHash = await sha256(rawText);
    const matches = hash ? textHash.toLowerCase() === String(hash).trim().toLowerCase() : true;
    return c.json({
      valid: matches,
      calculated_hash: textHash,
      provided_hash: hash || null,
      text: rawText,
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
        signer_name: sub.signer_name || null,
        submitted_at: submittedAt,
        fields: typeof fields === 'string' ? (fields.startsWith('{') ? JSON.parse(fields) : fields) : fields,
        signature_data: signatureData,
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
    const gap = size + 6;
    for (const line of wrapText(text, font, size, maxWidth)) {
      if (!line) {
        y -= gap;
        continue;
      }
      newPageIfNeeded(gap);
      page.drawText(line, { x: (pageW - font.widthOfTextAtSize(line, size)) / 2, y, size, font, color });
      y -= gap;
    }
  };

  const drawWrapped = (text: string, opts: { font?: PDFFont; size?: number; color?: Color; gap?: number } = {}) => {
    const font = opts.font ?? helv;
    const size = opts.size ?? 11;
    const gap = opts.gap ?? size + 4.5;
    for (const line of wrapText(text, font, size, maxWidth)) {
      if (!line) {
        y -= gap;
        continue;
      }
      newPageIfNeeded(gap);
      page.drawText(line, { x: margin, y, size, font, color: opts.color ?? ink });
      y -= gap;
    }
  };

  const rule = (thickness: number, color: Color, spaceAfter: number) => {
    newPageIfNeeded(thickness + spaceAfter);
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
      
      let labelIdx = 0;
      let valueIdx = 0;
      const totalLabelLines = labelLines.length;
      const totalValueLines = valueLines.length;

      if (totalLabelLines === 0 && totalValueLines === 0) continue;

      while (labelIdx < totalLabelLines || valueIdx < totalValueLines) {
        const minHeightNeeded = lineHeight + pad * 2;
        if (y - minHeightNeeded < margin) {
          page = pdfDoc.addPage([pageW, pageH]);
          y = pageH - margin;
        }

        const availHeight = y - margin;
        const maxLinesFit = Math.max(1, Math.floor((availHeight - pad * 2) / lineHeight));
        const remLabel = totalLabelLines - labelIdx;
        const remValue = totalValueLines - valueIdx;
        const linesToDraw = Math.min(maxLinesFit, Math.max(remLabel, remValue));

        const chunkHeight = linesToDraw * lineHeight + pad * 2;
        const top = y;
        const bottom = y - chunkHeight;

        page.drawRectangle({ x: margin, y: bottom, width: labelCol, height: chunkHeight, color: tableBg });
        page.drawRectangle({ x: margin, y: bottom, width: labelCol + valueCol, height: chunkHeight, borderColor: grid, borderWidth: 0.5 });
        page.drawLine({ start: { x: margin + labelCol, y: top }, end: { x: margin + labelCol, y: bottom }, thickness: 0.5, color: grid });

        let ty = top - pad;
        const labelEnd = Math.min(labelIdx + linesToDraw, totalLabelLines);
        while (labelIdx < labelEnd) {
          const l = labelLines[labelIdx++];
          if (l) page.drawText(l, { x: margin + pad, y: ty - 10, size: 10, font: helvBold, color: ink });
          ty -= lineHeight;
        }

        let vy = top - pad;
        const valueEnd = Math.min(valueIdx + linesToDraw, totalValueLines);
        while (valueIdx < valueEnd) {
          const l = valueLines[valueIdx++];
          if (l) page.drawText(l, { x: margin + labelCol + pad, y: vy - valueSize, size: valueSize, font: valueFont, color: row.valueColor ?? cell });
          vy -= lineHeight;
        }

        y = bottom;
      }
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
  const hasTypedSignature = !!signatureData && !/^data:image\//.test(signatureData);
  const hasRecordedSignature = hasEmbeddableSignature || hasTypedSignature;

  // Draw either an embedded signature image or a typed (plain-text) signature,
  // followed by an underline to read as a signature block.
  const drawSignatureBlock = async (label: string, width: number) => {
    if (!hasRecordedSignature) return;
    newPageIfNeeded(140);
    page.drawText(label, { x: margin, y, size: 10, font: helvBold, color: ink });
    y -= 14;
    if (hasEmbeddableSignature) {
      await embedSignatureImage(width);
    } else {
      page.drawText(signatureData, { x: margin, y, size: 18, font: helvOblique, color: ink });
      y -= 4;
      page.drawRectangle({ x: margin, y: y + 6, width: Math.min(width + 40, page.getWidth() - margin * 2), height: 1, color: grid });
      y -= 12;
    }
  };

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

  if (hasRecordedSignature) {
    try {
      await drawSignatureBlock('SIGNATURE OF RECORD', 200);
    } catch (err) {
      console.error('Signature block failed (agreement page):', err);
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

  if (hasRecordedSignature) {
    try {
      await drawSignatureBlock('DIGITAL SIGNATURE CANVAS RECORD', 220);
    } catch (err) {
      console.error('Signature block failed (certificate page):', err);
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
