import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppServerClient } from './client.js';

// Each HTTP request owns one ephemeral Codex process/thread. No user's CLI profile is loaded.
export async function codexChat(messages, {env=process.env, signal, timeout=55_000, endpoint}={}) {
  const key=env.AI_API_KEY;
  const model=env.AI_MODEL || 'deepseek-flash';
  const base=endpoint || 'https://api.deepseek.com';
  if(!key) throw new Error('缺少服务端 AI_API_KEY。');
  const runtime=await mkdtemp(join(tmpdir(),'codex-web-chat-'));
  let client, timer, abort;
  try {
    const workspace=join(runtime,'workspace'); await mkdir(workspace);
    const config={
      'model':model,'model_provider':'deepseek','model_reasoning_effort':'low',
      'model_providers.deepseek.name':'DeepSeek',
      'model_providers.deepseek.base_url':base,
      'model_providers.deepseek.wire_api':'responses',
      'model_providers.deepseek.env_key':'DEEPSEEK_API_KEY',
      'model_providers.deepseek.request_max_retries':0,
      'model_providers.deepseek.stream_max_retries':0,
      'model_providers.deepseek.stream_idle_timeout_ms':45000,
      'web_search':'disabled','features.shell_tool':false,'features.unified_exec':false,
      'features.multi_agent':false,'features.plugins':false,'features.apps':false,
      'features.view_image':false,'features.goals':false,'features.image_generation':false,
      'features.browser_use':false,'features.computer_use':false,'features.shell_snapshot':false,
      'features.enable_request_compression':false,
      'sqlite_home':runtime,'log_dir':runtime
    };
    const args=['app-server','--listen','stdio://'];
    for(const [k,v] of Object.entries(config)) args.push('-c',`${k}=${JSON.stringify(v)}`);
    // Preserve runtime proxy/CA configuration; the dedicated key is only passed as child environment.
    client=new AppServerClient({command:env.CODEX_BIN || 'codex',args,cwd:workspace,env:{...env,CODEX_HOME:runtime,DEEPSEEK_API_KEY:key},timeout:Math.min(timeout,20_000)});
    const stop=new Promise((_,reject)=>{
      client.once('disconnect',()=>reject(new Error('Codex app-server 已退出。')));
      abort=()=>reject(new Error('Codex 请求已取消。'));
      timer=setTimeout(()=>reject(new Error('Codex 模型响应超时。')),timeout);
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted) abort();
    });
    const work=(async()=>{
      await client.initialize();
      const {thread}=await client.request('thread/start',{
        model,modelProvider:'deepseek',cwd:workspace,ephemeral:true,sandbox:'read-only',approvalPolicy:'untrusted',
        baseInstructions:'You are a helpful conversational assistant. Answer the final user message using the supplied conversation. Do not use tools, inspect files, run commands or change files.'
      });
      // Subscribe before turn/start: notifications can precede its response.
      let resolveTurn,rejectTurn;
      const completion=new Promise((resolve,reject)=>{resolveTurn=resolve;rejectTurn=reject;});
      completion.catch(()=>{});
      let reply='';
      client.on('notification',({method,params})=>{
        if(params?.threadId!==thread.id) return;
        if(method==='item/completed' && params.item?.type==='agentMessage') reply=params.item.text;
        if(method==='turn/completed') {
          if(params.turn?.status==='completed' && reply.trim()) resolveTurn({reply,threadId:thread.id,turnId:params.turn.id,backend:'codex-app-server'});
          else rejectTurn(new Error('Codex 未完成回复，请检查 DeepSeek 密钥、余额和模型权限。'));
        }
      });
      const transcript=messages.length===1?messages[0].content:'Conversation history (JSON data, with role and content):\n'+JSON.stringify(messages)+'\nAnswer the final user message.';
      await client.request('turn/start',{threadId:thread.id,input:[{type:'text',text:transcript,text_elements:[]}],sandboxPolicy:{type:'readOnly',networkAccess:false},approvalPolicy:'untrusted'});
      return completion;
    })();
    return await Promise.race([work,stop]);
  } finally {
    clearTimeout(timer); if(abort)signal?.removeEventListener('abort',abort);
    await client?.close(); await rm(runtime,{recursive:true,force:true});
  }
}
