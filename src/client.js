import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createInterface } from 'node:readline';

/** Newline-delimited JSON-RPC client for Codex app-server's stdio transport. */
export class AppServerClient extends EventEmitter {
  #child;
  #pending = new Map();
  #nextId = 1;
  #closed = false;
  #timeout;
  #exited;

  constructor({ command = process.env.CODEX_BIN || 'codex', args = ['app-server', '--listen', 'stdio://'], timeout = 20_000, env = process.env, cwd } = {}) {
    super();
    this.#timeout = timeout;
    this.#child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env, cwd });
    this.#exited = new Promise(resolve => this.#child.once('close', resolve));
    this.#child.once('error', error => this.#fail(error));
    this.#child.once('close', code => this.#fail(new Error(`app-server exited (${code})`)));
    this.#child.stdin.on('error', error => this.#fail(error));
    this.#child.stderr.on('data', data => this.emit('diagnostic', data.toString()));
    createInterface({ input: this.#child.stdout }).on('line', line => {
      try {
        this.#receive(JSON.parse(line));
      } catch (error) {
        this.#fail(new Error(`Invalid app-server protocol message: ${error.message}`));
        this.#child.kill();
      }
    });
  }

  #fail(error) {
    const wasClosed = this.#closed;
    this.#closed = true;
    if (!wasClosed) this.emit('disconnect', error);
    for (const { reject, timer } of this.#pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    this.#pending.clear();
  }

  #receive(message) {
    if (message.method) {
      if (message.id !== undefined) {
        // This smoke client grants no approvals and implements no server requests.
        this.#write({ id: message.id, error: { code: -32601, message: 'Server requests are not supported by this test client' } });
      } else {
        this.emit('notification', message);
      }
      return;
    }
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(message.id);
    if (message.error) {
      const error = new Error(message.error.message);
      error.code = message.error.code;
      pending.reject(error);
    } else {
      pending.resolve(message.result);
    }
  }

  #write(message) {
    if (this.#closed) throw new Error('app-server connection is closed');
    this.#child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params = {}) {
    if (this.#closed) return Promise.reject(new Error('app-server connection is closed'));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`Request timed out: ${method}`));
      }, this.#timeout);
      this.#pending.set(id, { resolve, reject, timer });
      try {
        this.#write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  async initialize() {
    const result = await this.request('initialize', {
      clientInfo: { name: 'codex_app_server_demo', title: 'Codex app-server demo', version: '0.1.0' },
      capabilities: { experimentalApi: false },
    });
    this.#write({ method: 'initialized' });
    return result;
  }

  async close() {
    this.#fail(new Error('app-server connection is closed'));
    this.#child.stdin.end();
    this.#child.kill('SIGTERM');
    const timer = setTimeout(() => this.#child.kill('SIGKILL'), 2_000);
    try {
      await this.#exited;
    } finally {
      clearTimeout(timer);
    }
  }
}
