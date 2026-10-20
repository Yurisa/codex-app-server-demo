const SETTINGS_OBJECT = 'private/ai-settings-v1.json';
export function isOwner(request, env) {
  const email = request.headers.get('oai-authenticated-user-email');
  return Boolean(env.SETTINGS_OWNER_EMAIL && email && email.toLowerCase() === env.SETTINGS_OWNER_EMAIL.toLowerCase());
}
export function settingsReady(env) { return Boolean(env.BUCKET && env.SETTINGS_ENCRYPTION_KEY); }
async function encryptionKey(env) {
  const bytes = Uint8Array.from(atob(env.SETTINGS_ENCRYPTION_KEY), c => c.charCodeAt(0));
  if(bytes.length !== 32) throw Error('Invalid encryption configuration');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt','decrypt']);
}
export async function readSettings(env) {
  if(!settingsReady(env)) return null;
  const object = await env.BUCKET.get(SETTINGS_OBJECT);
  if(!object) return null;
  const {iv, ciphertext} = await object.json();
  const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0)),additionalData:new TextEncoder().encode(SETTINGS_OBJECT)}, await encryptionKey(env), Uint8Array.from(atob(ciphertext),c=>c.charCodeAt(0)));
  return JSON.parse(new TextDecoder().decode(plain));
}
async function writeSettings(env, data) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(SETTINGS_OBJECT)},await encryptionKey(env),new TextEncoder().encode(JSON.stringify(data))));
  await env.BUCKET.put(SETTINGS_OBJECT,JSON.stringify({iv:btoa(String.fromCharCode(...iv)),ciphertext:btoa(String.fromCharCode(...ciphertext))}),{httpMetadata:{contentType:'application/json'}});
}
export async function settingsResponse(request, env, json) {
  if(!isOwner(request,env)) return json({error:'仅站点所有者登录后可管理配置。'},403);
  if(!settingsReady(env)) return json({error:'安全存储尚未就绪，请联系站点维护者。'},503);
  try {
    if(request.method==='GET') {const saved=await readSettings(env);return json({saved:Boolean(saved),model:saved?.AI_MODEL || env.AI_MODEL || 'deepseek-flash',hasKey:Boolean(saved?.AI_API_KEY),hasToken:Boolean(saved?.CHAT_ACCESS_TOKEN)});}
    if(request.method!=='POST') return json({error:'不支持此请求。'},405);
    if(request.headers.get('Origin')!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site') return json({error:'请求来源无效，请从本站配置页提交。'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'请求格式错误。'},415);
    const reader=request.body?.getReader();let size=0;const chunks=[];
    if(reader) while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();return json({error:'配置内容过长。'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'请求格式错误。'},400);}
    if(!input || typeof input!=='object')return json({error:'请求格式错误。'},400);
    const previous=await readSettings(env);
    const {apiKey='',accessToken='',model}=input;
    if(typeof apiKey!=='string'||typeof accessToken!=='string'||typeof model!=='string')return json({error:'配置字段无效。'},400);
    const key=apiKey.trim() || previous?.AI_API_KEY;
    const token=accessToken || previous?.CHAT_ACCESS_TOKEN;
    if(!key || key.length>1024 || /\s/.test(key) || !token || token.length<12 || token.length>256 || !/^[a-zA-Z0-9._:-]{1,100}$/.test(model))return json({error:'请填写密钥、有效模型名和至少 12 位的访问口令。'},400);
    // Fixed provider prevents a saved key being redirected to an arbitrary host.
    await writeSettings(env,{AI_BASE_URL:'https://api.deepseek.com',AI_MODEL:model,AI_API_KEY:key,CHAT_ACCESS_TOKEN:token});
    return json({saved:true,message:'配置已加密保存并立即生效。请返回聊天页验证。'});
  }catch{return json({error:'安全存储读取或保存失败，请稍后重试。'},503);}
}
