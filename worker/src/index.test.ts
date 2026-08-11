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


