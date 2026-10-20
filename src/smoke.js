import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppServerClient } from './client.js';

export async function runSmoke() {
  const runtime = await mkdtemp(join(tmpdir(), 'codex-app-server-demo-'));
  const client = new AppServerClient({ env: { ...process.env, CODEX_HOME: runtime }, args: [
    'app-server', '--listen', 'stdio://',
    '-c', `sqlite_home=${JSON.stringify(runtime)}`,
    '-c', `log_dir=${JSON.stringify(runtime)}`,
  ] });
  if (process.env.DEMO_DEBUG === '1') client.on('diagnostic', text => process.stderr.write(text));
  try {
    const initialized = await client.initialize();
    assert.equal(typeof initialized.userAgent, 'string');
    const models = await client.request('model/list', { limit: 5 });
    assert.ok(Array.isArray(models.data), 'model/list must return a data array');
    const threads = await client.request('thread/list', { limit: 5 });
    assert.ok(Array.isArray(threads.data), 'thread/list must return a data array');
    return {
      status: 'passed',
      checks: ['initialize', 'initialized', 'model/list', 'thread/list'],
      modelCount: models.data.length,
      threadCount: threads.data.length,
    };
  } finally {
    await client.close();
    await rm(runtime, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  try {
    console.log(JSON.stringify(await runSmoke(), null, 2));
  } catch (error) {
    console.error(`Smoke test failed: ${error.message}`);
    process.exitCode = 1;
  }
}
