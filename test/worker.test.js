import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from '../worker/handler.js';
const env={OPENAI_API_KEY:'secret',OPENAI_MODEL:'test-model',CHAT_ACCESS_TOKEN:'access'};
const req=(messages,token='access')=>new Request('https://example.com/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({messages})});
test('Worker serves pages and reports actual unconfigured state',async()=>{
 const app=createWorker({'/':['text/html','<h1>Hello</h1>']});assert.equal(await (await app.fetch(new Request('https://example.com/'),{})).text(),'<h1>Hello</h1>');
 assert.equal((await (await app.fetch(new Request('https://example.com/api/status'),{})).json()).ai,'unconfigured');
 assert.equal((await app.fetch(req([{role:'user',content:'hi'}]),{})).status,503);
 assert.equal((await app.fetch(new Request('https://example.com/.env'),{})).status,404);
});
test('Worker authenticates, validates, limits input, and records successful calls',async()=>{
 let calls=0;const app=createWorker({},async(url,options)=>{calls++;assert.equal(JSON.parse(options.body).model,'test-model');return Response.json({choices:[{message:{content:'Hello'}}]});});
 assert.equal((await app.fetch(req([{role:'user',content:'hi'}],'wrong'),env)).status,401);
 assert.equal((await app.fetch(req([{role:'system',content:'hi'}]),env)).status,400);
 assert.equal((await app.fetch(req([{role:'user',content:'x'.repeat(65000)}]),env)).status,413);assert.equal(calls,0);
 assert.equal((await (await app.fetch(req([{role:'user',content:'hi'}]),env)).json()).reply,'Hello');
 assert.ok((await (await app.fetch(new Request('https://example.com/api/status'),env)).json()).lastSuccess);
});
test('Worker hides provider errors and never marks failed inference successful',async()=>{
 const app=createWorker({},async()=>new Response('provider secret',{status:401}));const r=await app.fetch(req([{role:'user',content:'hi'}]),env);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('provider secret'));assert.equal((await (await app.fetch(new Request('https://example.com/api/status'),env)).json()).lastSuccess,null);
});
test('Worker uses supported redirect mode and never follows provider redirects',async()=>{
 let calls=0;const app=createWorker({},async(url,options)=>{calls++;if(options.redirect==='error')throw new TypeError('Unsupported redirect mode');assert.equal(options.redirect,'manual');return new Response(null,{status:307,headers:{location:'https://other.example'}});});
 const r=await app.fetch(req([{role:'user',content:'hello'}]),env);assert.equal(r.status,502);assert.equal((await r.json()).code,'UPSTREAM_HTTP_307');assert.equal(calls,1);
});
test('Worker distinguishes invalid credentials and insufficient balance',async()=>{
 for(const status of [401,402]){const app=createWorker({},async()=>new Response('private provider details',{status}));const r=await app.fetch(req([{role:'user',content:'hello'}]),env);const data=await r.json();assert.equal(data.code,`UPSTREAM_HTTP_${status}`);assert.ok(!data.error.includes('private provider'));}
});
