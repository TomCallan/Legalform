import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from './index';

const fullPayload = {
  submission_id: '11111111-2222-3333-4444-555555555555',
  document_id: 'nda-001',
  slug: 'aijiz88japn',
  spec: { document: { title: 'MUTUAL NON-DISCLOSURE AND CONFIDENTIALITY AGREEMENT' } },
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
