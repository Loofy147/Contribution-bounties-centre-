import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const manifest = JSON.parse(
  await readFile(new URL('./tests.json', import.meta.url), 'utf8'),
);
const backend = await readFile(new URL('../backend/index.ts', import.meta.url), 'utf8');

test('QA manifest includes the core workflow scenarios', () => {
  assert.equal(manifest.length, 5, 'expected five documented browser scenarios');
  assert.equal(
    manifest.filter((item) => item.sanity === true).length,
    1,
    'exactly one scenario should be marked as the sanity test',
  );

  const names = new Set(manifest.map((item) => item.name));
  for (const required of [
    'Browse bounties and inspect the acceptance contract',
    'Create a bounty with validated acceptance criteria',
    'Submit work against a snapshot of agreed criteria',
    'Request changes, revise, and accept only the compliant version',
    'Reject unauthorized and incomplete acceptance transitions',
  ]) {
    assert.ok(names.has(required), `missing QA scenario: ${required}`);
  }
});

test('backend source retains key acceptance and resubmission guards', () => {
  assert.match(backend, /'POST \/api\/bounties': \[\s*requireAuth\(\)/);
  assert.match(backend, /acceptanceCriteria\.length < 1 \|\| acceptanceCriteria\.length > 10/);
  assert.match(backend, /new Set\(acceptanceCriteria\.map\(item => item\.toLowerCase\(\)\)\)\.size !== acceptanceCriteria\.length/);
  assert.match(backend, /Provide between 1 and 10 acceptance criteria/);
  assert.match(backend, /acceptanceCriteria: \[\.\.\.acceptanceCriteria\]/);
  assert.match(backend, /'POST \/api\/contributions\/:id\/resubmit': \[\s*requireAuth\(\)/);
  assert.match(backend, /contribution\.submitterId !== user\.userId/);
  assert.match(backend, /contribution\.status !== 'needs_changes'/);
  assert.match(backend, /criteriaChecks\.length !== acceptanceCriteria\.length/);
  assert.match(backend, /status === 'accepted' && !criteriaChecks\.every\(Boolean\)/);
  assert.match(backend, /record: \{ xp: increment\(50\), acceptedCount: increment\(1\) \}/);
});
