import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { AppServerClient } from '../src/client.js';
const fixture = fileURLToPath(new URL('./fixtures/server.js', import.meta.url));
function client(t, timeout = 2_000) {
  const instance = new AppServerClient({ command: process.execPath, args: [fixture], timeout });
  t.after(() => instance.close());
  return instance;
}
test('initializes and correlates concurrent requests', async t => {
  const instance = client(t);
  assert.equal((await instance.initialize()).userAgent, 'fixture');
  assert.deepEqual(await Promise.all([instance.request('echo', { n: 1 }), instance.request('echo', { n: 2 })]), [{ n: 1 }, { n: 2 }]);
});
test('delivers server notifications', async t => {
  const instance = client(t);
  const notification = once(instance, 'notification');
  await instance.request('notify');
  assert.equal((await notification)[0].method, 'test/notification');
});
test('preserves JSON-RPC errors', async t => {
  await assert.rejects(client(t).request('fail'), { code: -32601, message: 'Unknown method' });
});
test('times out a request without breaking subsequent requests', async t => {
  const instance = client(t, 200);
  await assert.rejects(instance.request('hang'), /timed out/);
  assert.deepEqual(await instance.request('echo', { ok: true }), { ok: true });
});
test('rejects pending requests when the server exits', async t => {
  await assert.rejects(client(t).request('exit'), /exited \(7\)/);
});
test('rejects malformed protocol output', async t => {
  await assert.rejects(client(t).request('malformed'), /Invalid app-server protocol/);
});
test('reports a missing executable', async t => {
  const instance = new AppServerClient({ command: '/nonexistent/codex-app-server-demo' });
  t.after(() => instance.close());
  await assert.rejects(instance.initialize(), /ENOENT/);
});
test('rejects requests after shutdown', async t => {
  const instance = client(t);
  await instance.close();
  await assert.rejects(instance.request('echo'), /closed/);
});
