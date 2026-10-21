import { isOwner, settingsReady, readSettings, settingsResponse } from './settings.js';
import { aiConfig, chatPayload } from '../src/ai-config.js';
// Fetch adapter for Sites / Cloudflare Workers. Node server remains available for Render.
export function createWorker(assets, fetchImpl = fetch) {
  let lastSuccess = null;
  let active = 0;
  let recent = [];
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
  const json = (data, status = 200) => Response.json(data, { status, headers });
  return { async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if(path === '/api/settings') return settingsResponse(request,env,json);
    if(path === '/settings' && !isOwner(request,env)) return json({error:'仅站点所有者登录后可管理配置。'},403);
    let effectiveEnv=env;
    if(path === '/api/chat' || path === '/api/status') {
      if(env.SETTINGS_OWNER_EMAIL && !isOwner(request,env)) return json({error:'请以站点所有者身份登录。'},403);
      try {const saved=await readSettings(env);if(saved) effectiveEnv={...env,...saved};}
      catch {return json({error:'无法读取 AI 配置，请稍后重试。'},503);}
    }
    const config = aiConfig(effectiveEnv);
    const configured = config.configured;
    if (request.method === 'GET' && path === '/api/status') return json({ web: 'online', ai: configured ? 'configured' : 'unconfigured', model: config.model || null, provider: config.provider, lastSuccess });
    if (request.method === 'GET' && assets[path]) {
      const [type, body] = assets[path];
      return new Response(body, {headers:{...headers, 'Content-Type':type+'; charset=utf-8'}});
    }
    if (request.method !== 'POST' || path !== '/api/chat') return json({error:'页面不存在。'},404);
    if (!configured) return json({error:'AI 尚未配置，请打开「AI 配置」页面设置密钥和访问口令。'},503);
    const hash = async s => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
    const [expected, supplied] = await Promise.all([hash(`Bearer ${effectiveEnv.CHAT_ACCESS_TOKEN}`), hash(request.headers.get('Authorization') || '')]);
    let mismatch = 0; for(let i=0;i<expected.length;i++) mismatch |= expected[i]^supplied[i];
    if(mismatch) return json({error:'访问口令不正确，请检查后重试。'},401);
    if(request.headers.get('sec-fetch-site') === 'cross-site') return json({error:'不允许跨站请求。'},403);
    recent = recent.filter(t => t > Date.now()-60_000);
    if(recent.length >= 20 || active >= 3) return json({error:'请求较多，请稍后重试。'},429);
    recent.push(Date.now()); active++;
    try {
      if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'请发送 JSON。'},415);
      let size=0; const chunks=[]; const reader=request.body?.getReader();
      if(reader) {
        while(true) {const {value,done}=await reader.read(); if(done) break;size+=value.byteLength;if(size>64_000){await reader.cancel();return json({error:'对话太长，请新建对话。'},413);} chunks.push(value);}
      }
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
      let messages;try{({messages}=JSON.parse(new TextDecoder().decode(bytes)));}catch{return json({error:'请求格式错误。'},400);}
      if(!Array.isArray(messages)||!messages.length||messages.length>40||messages.at(-1)?.role!=='user'||messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>8000)) return json({error:'消息无效：最多 40 条，每条最多 8000 字。'},400);
      const upstream=await fetchImpl(config.endpoint,{
        method:'POST',redirect:'manual',headers:{Authorization:`Bearer ${config.key}`,'Content-Type':'application/json'},
        body:JSON.stringify(chatPayload(config,messages)),signal:AbortSignal.timeout(60_000)
      });
      if(!upstream.ok) {
        const messages={400:'模型请求参数不受支持，请检查模型名称。',401:'DeepSeek 密钥无效，请在 AI 配置页更新。',402:'DeepSeek 账户余额不足，请充值后重试。',403:'模型服务拒绝访问，请检查账号权限。',404:'模型或接口不存在，请检查模型名称。',429:'模型请求过多，请稍后重试。'};
        console.error(JSON.stringify({event:'ai_upstream_error',status:upstream.status}));
        return json({error:upstream.status>=300&&upstream.status<400?'模型接口返回重定向，已停止请求以保护密钥。':messages[upstream.status]||'模型服务暂时不可用，请稍后重试。',code:'UPSTREAM_HTTP_'+upstream.status},502);
      }
      const data=await upstream.json(); const reply=data.choices?.[0]?.message?.content;
      if(typeof reply!=='string'||!reply.trim()) return json({error:'模型未返回文本，请重试。'},502);
      lastSuccess=new Date().toISOString();return json({reply});
    }catch(error){console.error(JSON.stringify({event:'ai_request_failed',kind:error.name==='TimeoutError'?'timeout':error instanceof SyntaxError?'invalid_json':'transport_or_runtime'}));return json({error:error.name==='TimeoutError'?'模型响应超时，请重试。':'无法连接模型服务，请稍后重试。'},error.name==='TimeoutError'?504:502);}
    finally{active--;}
  }};
}
