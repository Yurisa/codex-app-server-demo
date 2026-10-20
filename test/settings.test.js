import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/handler.js';
function fixture(){const objects=new Map();return {objects,env:{SETTINGS_OWNER_EMAIL:'owner@example.com',SETTINGS_ENCRYPTION_KEY:btoa('x'.repeat(32)),BUCKET:{get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,put:async(k,v)=>objects.set(k,v)}}};}
const request=(path,body,email='owner@example.com',origin='https://example.com')=>new Request('https://example.com'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-email':email,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
const payload={apiKey:'private-deepseek-key',accessToken:'my-private-token-123',model:'deepseek-flash'};
test('only owner can read/write settings; cross-origin and invalid fields rejected',async()=>{
 const {env,objects}=fixture();const app=createWorker({});
 for(const email of ['','someone@example.com']){assert.equal((await app.fetch(request('/api/settings',null,email),env)).status,403);assert.equal((await app.fetch(request('/api/settings',payload,email),env)).status,403);assert.equal((await app.fetch(request('/api/chat',payload,email),env)).status,403);}
 assert.equal((await app.fetch(request('/api/settings',payload,'owner@example.com','https://evil.example'),env)).status,403);
 assert.equal((await app.fetch(request('/api/settings',{...payload,accessToken:'short'}),env)).status,400);assert.equal(objects.size,0);
});
test('ciphertext persists across worker instances, read never leaks keys, chat uses saved config',async()=>{
 const {env,objects}=fixture();let app=createWorker({});const saved=await app.fetch(request('/api/settings',payload),env);assert.equal(saved.status,200);
 const stored=[...objects.values()][0];assert.ok(!stored.includes(payload.apiKey));assert.ok(!stored.includes(payload.accessToken));
 let called=false;app=createWorker({},async(url,options)=>{called=true;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(options.headers.Authorization,'Bearer '+payload.apiKey);return Response.json({choices:[{message:{content:'hello'}}]});});
 const read=await app.fetch(request('/api/settings'),env);const text=await read.text();assert.ok(!text.includes(payload.apiKey));assert.ok(!text.includes(payload.accessToken));assert.equal(JSON.parse(text).hasKey,true);
 assert.equal((await app.fetch(request('/api/settings',{model:'deepseek-v4-pro',apiKey:'',accessToken:''}),env)).status,200);
 const chat=request('/api/chat',{messages:[{role:'user',content:'hi'}]});chat.headers.set('Authorization','Bearer '+payload.accessToken);assert.equal((await app.fetch(chat,env)).status,200);assert.ok(called);
 env.SETTINGS_ENCRYPTION_KEY=btoa('z'.repeat(32));assert.equal((await app.fetch(request('/api/settings'),env)).status,503);
});
