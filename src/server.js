import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function createApp({ env = process.env, fetchImpl = fetch } = {}) {
  let lastSuccess = null;
  let active = 0;
  let requests = [];
  const configured = () => Boolean(env.OPENAI_API_KEY && env.OPENAI_MODEL && env.CHAT_ACCESS_TOKEN);
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/api/status') return json(res, 200, { web: 'online', ai: configured() ? 'configured' : 'unconfigured', model: env.OPENAI_MODEL || null, lastSuccess });
    if (req.method === 'POST' && path === '/api/chat') {
      if (!configured()) return json(res, 503, { error: 'AI 尚未配置，请在服务端设置 API 密钥、模型和应用访问口令。' });
      const expected = Buffer.from(`Bearer ${env.CHAT_ACCESS_TOKEN}`);
      const supplied = Buffer.from(req.headers.authorization || '');
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return json(res, 401, { error: '访问口令不正确，请检查后重试。' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: '不允许跨站请求。' });
      requests = requests.filter(t => t > Date.now() - 60_000);
      if (requests.length >= 20 || active >= 3) return json(res, 429, { error: '请求较多，请稍后重试。' });
      requests.push(Date.now());
      active++;
      try {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: '请发送 JSON。' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 64_000) return json(res, 413, { error: '对话太长，请新建对话。' });
        }
        let messages;
        try { ({ messages } = JSON.parse(body)); } catch { return json(res, 400, { error: '请求格式错误。' }); }
        if (!Array.isArray(messages) || !messages.length || messages.length > 40 || messages.at(-1)?.role !== 'user' || messages.some(m => !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 8000)) return json(res, 400, { error: '消息无效：最多 40 条，每条最多 8000 字。' });
        const upstream = await fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: env.OPENAI_MODEL, messages: messages.map(({role, content}) => ({role, content})), max_completion_tokens: 2048, store: false }),
          signal: AbortSignal.timeout(60_000)
        });
        if (!upstream.ok) return json(res, 502, { error: upstream.status === 429 ? '模型服务额度不足或请求过多，请检查额度后重试。' : '模型服务调用失败，请检查服务端密钥和模型权限。' });
        const data = await upstream.json();
        const reply = data.choices?.[0]?.message?.content;
        if (typeof reply !== 'string' || !reply.trim()) return json(res, 502, { error: '模型未返回文本，请重试。' });
        lastSuccess = new Date().toISOString();
        return json(res, 200, { reply });
      } catch (error) {
        return json(res, error.name === 'TimeoutError' ? 504 : 502, { error: error.name === 'TimeoutError' ? '模型响应超时，请重试。' : '无法连接模型服务，请稍后重试。' });
      } finally { active--; }
    }
    const files = { '/': ['index.html', 'text/html'], '/status': ['status.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/status.js': ['status.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
    if (req.method === 'GET' && files[path]) {
      try {
        const [file, mime] = files[path];
        const content = await readFile(new URL(`../public/${file}`, import.meta.url));
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); res.end(content); return;
      } catch { return json(res, 500, { error: '页面加载失败。' }); }
    }
    return json(res, 404, { error: '页面不存在。' });
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, '0.0.0.0', () => console.log(`Chat app listening on port ${port}`));
}
