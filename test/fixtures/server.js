import { createInterface } from 'node:readline';
const send = message => process.stdout.write(`${JSON.stringify(message)}\n`);
createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'initialized') return;
  if (message.method === 'hang') return;
  if (message.method === 'exit') process.exit(7);
  if (message.method === 'malformed') return process.stdout.write('not-json\n');
  if (message.method === 'fail') return send({ id: message.id, error: { code: -32601, message: 'Unknown method' } });
  if (message.method === 'initialize') return send({ id: message.id, result: { userAgent: 'fixture' } });
  if (message.method === 'notify') send({ method: 'test/notification', params: { ok: true } });
  send({ id: message.id, result: message.params });
});
