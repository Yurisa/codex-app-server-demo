import test from 'node:test';
import assert from 'node:assert/strict';
import {aiConfig,chatPayload} from '../src/ai-config.js';
import {createApp} from '../src/server.js';
import {createWorker} from '../worker/handler.js';
const env={AI_BASE_URL:'https://api.deepseek.com/',AI_MODEL:'deepseek-flash',AI_API_KEY:'deepseek-secret',CHAT_ACCESS_TOKEN:'access'};
test('provider credentials are isolated and invalid URLs fail closed',()=>{
 assert.equal(aiConfig({...env,AI_API_KEY:'',OPENAI_API_KEY:'old-secret'}).configured,false);
 assert.equal(aiConfig(env).endpoint,'https://api.deepseek.com/chat/completions');
 assert.equal(aiConfig({...env,AI_BASE_URL:'https://api.deepseek.com/v1/'}).endpoint,'https://api.deepseek.com/v1/chat/completions');
 for(const base of ['http://api.deepseek.com','https://key@api.deepseek.com','https://api.deepseek.com?token=secret']) assert.equal(aiConfig({...env,AI_BASE_URL:base}).configured,false);
 const payload=chatPayload(aiConfig(env),[{role:'user',content:'你好'}]);assert.equal(payload.max_tokens,2048);assert.equal(payload.thinking.type,'disabled');assert.ok(!('store' in payload));assert.ok(!('max_completion_tokens' in payload));
});
for(const runtime of ['node','worker']) test(`${runtime} sends DeepSeek-compatible requests and reports provider without key`,async t=>{
 let calls=0;const upstream=async(url,options)=>{calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer deepseek-secret');assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).max_tokens,2048);return Response.json({choices:[{message:{content:'你好'}}]});};
 let call;
 if(runtime==='node'){const app=createApp({env,fetchImpl:upstream});await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));call=(path,options)=>fetch(`http://127.0.0.1:${app.address().port}${path}`,options);}
 else {const app=createWorker({},upstream);call=(path,options)=>app.fetch(new Request('https://example.com'+path,options),env);}
 const r=await call('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer access'},body:JSON.stringify({messages:[{role:'user',content:'你好'}]})});assert.equal(r.status,200);assert.equal((await r.json()).reply,'你好');assert.equal(calls,1);
 const status=await (await call('/api/status')).json();assert.equal(status.provider,'api.deepseek.com');assert.ok(!JSON.stringify(status).includes('deepseek-secret'));
});
