import test from 'node:test';
import assert from 'node:assert/strict';
import { runSmoke } from '../src/smoke.js';
test('real Codex app-server handshake, model catalog and thread listing', { timeout: 70_000 }, async () => {
  const result = await runSmoke();
  assert.equal(result.status, 'passed');
  assert.deepEqual(result.checks, ['initialize', 'initialized', 'model/list', 'thread/list']);
});
