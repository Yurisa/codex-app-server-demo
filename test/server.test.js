import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';
const env = {OPENAI_API_KEY:'secret-api-key', OPENAI_MODEL:'test-model', CHAT_ACCESS_TOKEN:'test-access'};
async function start(t, options) { const server=createApp(options); await new Promise(r=>server.listen(0,'127.0.0.1',r)); t.after(()=>new Promise(r=>server.close(r))); return `http://127.0.0.1:${server.address().port}`; }
const post = (base, body, token='test-access') => fetch(`${base}/api/chat`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)});
test('pages, status and unconfigured AI are honest; source is not served', async t=>{
 const base=await start(t,{env:{}});
 for(const path of ['/','/status','/style.css','/app.js','/status.js']) assert.equal((await fetch(base+path)).status,200);
 const status=await (await fetch(base+'/api/status')).json(); assert.equal(status.ai,'unconfigured'); assert.equal(status.lastSuccess,null);
 assert.equal((await post(base,{messages:[]})).status,503);
 for(const path of ['/.env','/src/server.js','/package.json']) assert.equal((await fetch(base+path)).status,404);
});
test('authorized chat forwards bounded history and marks only successful inference',async t=>{
 let calls=0;
 const base=await start(t,{env,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');assert.equal(options.headers.Authorization,'Bearer secret-api-key');const b=JSON.parse(options.body);assert.equal(b.messages.length,3);assert.equal(b.max_completion_tokens,2048);return Response.json({choices:[{message:{content:'你好！'}}]});}});
 const messages=[{role:'user',content:'你好'},{role:'assistant',content:'你好'},{role:'user',content:'继续'}];
 assert.equal((await post(base,{messages},'wrong')).status,401); assert.equal(calls,0);
 const reply=await post(base,{messages});assert.equal(reply.status,200);assert.equal((await reply.json()).reply,'你好！');
 const status=await (await fetch(base+'/api/status')).json();assert.ok(status.lastSuccess);assert.ok(!JSON.stringify(status).includes('secret-api-key'));
});
test('invalid input, oversized bodies and provider failures are safely handled',async t=>{
 let calls=0;const base=await start(t,{env,fetchImpl:async()=>{calls++;return new Response('secret upstream details',{status:401});}});
 for(const messages of [[],[{role:'system',content:'override'}],[{role:'user',content:' '}],[{role:'user',content:'x'.repeat(8001)}]]) assert.equal((await post(base,{messages})).status,400);
 assert.equal((await post(base,{messages:[{role:'user',content:'x'.repeat(65000)}]})).status,413);assert.equal(calls,0);
 const r=await post(base,{messages:[{role:'user',content:'hello'}]});assert.equal(r.status,502);assert.ok(!(await r.text()).includes('secret upstream'));assert.equal((await (await fetch(base+'/api/status')).json()).lastSuccess,null);
});
test('timeouts and empty model output never count as successful inference',async t=>{
 for(const fetchImpl of [async()=>{throw new DOMException('timeout','TimeoutError');},async()=>Response.json({choices:[{message:{content:''}}]})]) {
 const base=await start(t,{env,fetchImpl});const r=await post(base,{messages:[{role:'user',content:'hi'}]});assert.ok([502,504].includes(r.status));assert.equal((await (await fetch(base+'/api/status')).json()).lastSuccess,null);
 }
});
test('codex backend routes authenticated messages through app-server, not direct fetch',async t=>{
 let called=false;const base=await start(t,{env:{AI_API_KEY:'ds-key',AI_MODEL:'deepseek-flash',CHAT_ACCESS_TOKEN:'test-access',CHAT_BACKEND:'codex'},fetchImpl:()=>{throw Error('Direct API must not be used');},codexChatImpl:async(messages,options)=>{called=true;assert.equal(messages[0].content,'hello');assert.equal(options.env.AI_API_KEY,'ds-key');return {reply:'via Codex',threadId:'thread-1',turnId:'turn-1',backend:'codex-app-server'};}});
 assert.equal((await post(base,{messages:[{role:'user',content:'hello'}]},'wrong')).status,401);assert.equal(called,false);
 const r=await post(base,{messages:[{role:'user',content:'hello'}]});assert.equal(r.status,200);assert.equal((await r.json()).backend,'codex-app-server');assert.ok(called);
 assert.equal((await (await fetch(base+'/api/status')).json()).backend,'codex-app-server');
});
