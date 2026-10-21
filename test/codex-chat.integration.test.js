import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {codexChat} from '../src/codex-chat.js';
import {createApp} from '../src/server.js';

test('real Codex app-server completes a turn against a local Responses SSE provider', {timeout:65000},async t=>{
 const requests=[];
 const server=createServer(async(req,res)=>{
  let text='';for await(const c of req)text+=c;
  if(!req.url.startsWith('/responses')) {res.writeHead(404);res.end();return;}
  const body=JSON.parse(text);requests.push({body,auth:req.headers.authorization});
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const item={id:'msg_demo',type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Hello from app-server',annotations:[]}],phase:'final_answer'};
  const response={id:'resp_demo',object:'response',created_at:1,status:'completed',model:'deepseek-flash',output:[item],usage:{input_tokens:10,output_tokens:5,total_tokens:15}};
  for(const event of [
   {type:'response.created',response:{...response,status:'in_progress',output:[]}},
   {type:'response.output_item.added',output_index:0,item:{...item,status:'in_progress',content:[]}},
   {type:'response.content_part.added',item_id:item.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},
   {type:'response.output_text.delta',item_id:item.id,output_index:0,content_index:0,delta:'Hello from app-server'},
   {type:'response.output_text.done',item_id:item.id,output_index:0,content_index:0,text:'Hello from app-server'},
   {type:'response.output_item.done',output_index:0,item},
   {type:'response.completed',response}
  ])res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const appEnv={...process.env,AI_API_KEY:'test-key-not-real',AI_MODEL:'deepseek-flash',CHAT_ACCESS_TOKEN:'test-access',CHAT_BACKEND:'codex'};
 const app=createApp({env:appEnv,codexChatImpl:(messages,options)=>codexChat(messages,{...options,endpoint:`http://127.0.0.1:${server.address().port}`,timeout:50000})});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>app.close(r)));
 const httpResponse=await fetch(`http://127.0.0.1:${app.address().port}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-access'},body:JSON.stringify({messages:[{role:'user',content:'Hello'}]})});
 assert.equal(httpResponse.status,200);const result=await httpResponse.json();
 assert.equal(result.reply,'Hello from app-server');assert.ok(result.threadId);assert.ok(result.turnId);assert.equal(requests.length,1);assert.equal(requests[0].auth,'Bearer test-key-not-real');assert.equal(requests[0].body.model,'deepseek-flash');assert.equal(requests[0].body.stream,true);
 assert.ok((requests[0].body.tools||[]).every(x=>['request_user_input'].includes(x.name||x.type)), 'No filesystem, execution, browsing, or delegation tools should be exposed');
});
test('real app-server is terminated on cancellation without waiting for upstream', {timeout:10000},async t=>{
 const server=createServer(()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),500);t.after(()=>clearTimeout(timer));
 await assert.rejects(codexChat([{role:'user',content:'hello'}],{env:{...process.env,AI_API_KEY:'fake'},endpoint:`http://127.0.0.1:${server.address().port}`,signal:controller.signal}),/取消/);
});
