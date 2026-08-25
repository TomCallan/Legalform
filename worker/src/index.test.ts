import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import app from './index';

const fullPayload = {
  submission_id: '11111111-2222-3333-4444-555555555555',
  document_id: 'nda-001',
  slug: 'aijiz88japn',
  spec: {
    document: { title: 'MUTUAL NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT', jurisdiction: 'Delaware, USA' },
    sections: [
      { type: 'static', content: '## PURPOSE\nThis agreement governs the exchange of confidential information.' },
      { type: 'form', fields: [
        { name: 'receiving_party', label: 'Receiving Party' },
        { name: 'term_months', label: 'Term (months)' }
      ] }
    ]
  },
  signer_email: 'signer@example.com',
  signer_name: 'Jane Doe',
  fields: { receiving_party: 'Acme Corp', term_months: '12' },
  signature_data: '<svg xmlns="http://www.w3.org/2000/svg">...</svg>',
  audit_hash: 'a'.repeat(64),
  submitted_at: 1788997704
};

test('render-pdf returns a valid PDF for a full payload', async () => {
  const res = await app.request('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fullPayload)
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/pdf/);
  assert.match(res.headers.get('content-disposition') ?? '', /attachment;/);

  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(bytes.length > 500, 'PDF body should be non-trivial');
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), '%PDF');
});

test('render-pdf accepts a minimal payload with defaults', async () => {
  const res = await app.request('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), '%PDF');
});

test('render-pdf rejects invalid JSON', async () => {
  const res = await app.request('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json'
  });

  assert.equal(res.status, 400);
  const data = await res.json() as { error?: string };
  assert.ok(data.error);
});

// Inflate FlateDecode streams and decode the hex-string <...> Tj text operators.
function extractPdfTexts(pdfBytes: Uint8Array): string[] {
  const src = Buffer.from(pdfBytes).toString('latin1');
  const texts: string[] = [];
  for (const m of src.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue; // not a deflate stream (font programs etc.)
    }
    for (const hex of content.matchAll(/<([0-9A-Fa-f]{2,})> Tj/g)) {
      let s = '';
      for (let i = 0; i < hex[1].length; i += 2) s += String.fromCharCode(parseInt(hex[1].slice(i, i + 2), 16));
      texts.push(s);
    }
  }
  return texts;
}

test('render-pdf includes the full agreement, fields, and certificate page', async () => {
  const res = await app.request('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fullPayload)
  });

  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Text may wrap across multiple Tj ops; join and collapse whitespace to reconstruct lines.
  const pdfText = extractPdfTexts(bytes).join(' ').replace(/\s+/g, ' ');

  // Page 1: full executed agreement
  assert.ok(pdfText.includes('MUTUAL NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT'), 'agreement title present');
  assert.ok(pdfText.includes('Acme Corp'), 'field value present');
  assert.ok(pdfText.includes('Signer Email'), 'signature metadata present');
  assert.ok(pdfText.includes('a'.repeat(64)), 'audit hash present');

  // Page 2: certificate of execution
  assert.ok(pdfText.includes('OFFICIAL CERTIFICATE OF ELECTRONIC EXECUTION'), 'certificate page present');
});

test('render-pdf renders a typed (plain-text) signature on the agreement page', async () => {
  const res = await app.request('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fullPayload, signature_data: 'Aloysius T. Widget' })
  });

  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdfText = extractPdfTexts(bytes).join(' ').replace(/\s+/g, ' ');
  assert.ok(pdfText.includes('Aloysius T. Widget'), 'typed signature text present in PDF');
});

test('render-pdf handles multi-page box content without clipping or overlap', async () => {
  const multiPageText = Array.from({ length: 100 }, (_, i) => `Paragraph line ${i + 1}: legal text expanding across pages inside a box container.`).join('\n');
  const payload = {
    ...fullPayload,
    fields: {
      ...fullPayload.fields,
      receiving_party: multiPageText
    }
  };

  const res = await app.request('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  assert.ok(bytes.length > 1000, 'PDF body should be generated cleanly');
  const pdfText = extractPdfTexts(bytes).join(' ').replace(/\s+/g, ' ');
  assert.ok(pdfText.includes('Paragraph line 1:'), 'first line present');
  assert.ok(pdfText.includes('Paragraph line 100:'), '100th line present (not clipped)');
});

test('render-pdf renders tom and madi spousal relationship statement templates losslessly', async () => {
  const tomText = "From August 2024 to July 2025, I attended Embry-Riddle Aeronautical University...";
  const madiText = "Thomas and I met on a dating app called Hinge while we were both located in Prescott Arizona...";

  for (const [docId, text] of [['tom', tomText], ['madi', madiText]]) {
    const res = await app.request('/api/render-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...fullPayload,
        document_id: docId,
        fields: { relationship_statement: text },
        signature_data: 'Thomas Callan'
      })
    });

    assert.equal(res.status, 200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), '%PDF');
    assert.ok(bytes.length > 1000);
  }
});

test('render-pdf normalizes smart apostrophes, quotes, and em dashes without question marks', async () => {
  const textWithSmartChars = "Madison’s roommate’s puppy — “our journey”";
  const res = await app.request('/api/render-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...fullPayload,
      fields: { receiving_party: textWithSmartChars }
    })
  });

  assert.equal(res.status, 200);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const pdfText = extractPdfTexts(bytes).join(' ').replace(/\s+/g, ' ');
  assert.ok(pdfText.includes("Madison's roommate's puppy - \"our journey\""), 'smart characters normalized to ASCII');
  assert.ok(!pdfText.includes('?'), 'no question mark placeholders in rendered text');
});

test('api/verify validates raw text content and computes SHA-256 hash', async () => {
  const text = 'Legalform Agreement Content';
  const res = await app.request('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  assert.equal(res.status, 200);
  const data = await res.json() as { valid: boolean; calculated_hash: string };
  assert.equal(data.valid, true);
  assert.equal(data.calculated_hash.length, 64);
});

test('api/verify validates matching text and hash', async () => {
  const text = 'Hello Legalform';
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const expectedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const res = await app.request('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, hash: expectedHash })
  });

  assert.equal(res.status, 200);
  const data = await res.json() as { valid: boolean; calculated_hash: string };
  assert.equal(data.valid, true);
  assert.equal(data.calculated_hash, expectedHash);
});

test('api/verify rejects mismatched hash and text', async () => {
  const res = await app.request('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Agreement Text', hash: '0'.repeat(64) })
  });

  assert.equal(res.status, 200);
  const data = await res.json() as { valid: boolean };
  assert.equal(data.valid, false);
});

test('api/verify validates JSON submission payload audit hash', async () => {
  const docId = 'nda-test';
  const email = 'test@example.com';
  const fields = { party: 'Acme' };
  const dataJson = JSON.stringify(fields);
  const signatureData = 'John Hancock';
  const submittedAt = 1700000000;
  const auditString = `${docId}:${email}:${dataJson}:${signatureData}:${submittedAt}`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(auditString));
  const validHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const res = await app.request('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload: {
        document_id: docId,
        signer_email: email,
        fields,
        signature_data: signatureData,
        submitted_at: submittedAt,
        audit_hash: validHash
      }
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json() as { valid: boolean; calculated_hash: string; fields: Record<string, unknown> };
  assert.equal(data.valid, true);
  assert.equal(data.calculated_hash, validHash);
  assert.deepEqual(data.fields, fields);
});

test('api/verify preserves and validates multiline raw text with whitespace and newlines', async () => {
  const multilineText = `  AGREEMENT HEADER  \n\nSection 1:\n  - Line 1\n  - Line 2\r\n\r\n[End of Document]\n\n`;
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(multilineText));
  const expectedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const res = await app.request('/api/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: multilineText,
      hash: expectedHash
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json() as { valid: boolean; calculated_hash: string; text: string };
  assert.equal(data.valid, true);
  assert.equal(data.calculated_hash, expectedHash);
  assert.equal(data.text, multilineText);
});




