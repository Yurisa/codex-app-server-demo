// Resolve credentials as a pair: never send a legacy OpenAI key to another provider.
export function aiConfig(env) {
  const generic = ['AI_BASE_URL', 'AI_MODEL', 'AI_API_KEY'].some(k => env[k] !== undefined);
  const key = generic ? env.AI_API_KEY : env.OPENAI_API_KEY;
  const model = generic ? env.AI_MODEL : env.OPENAI_MODEL;
  const base = generic ? (env.AI_BASE_URL || 'https://api.deepseek.com') : 'https://api.openai.com/v1';
  let endpoint = null, provider = null;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error();
    provider = url.hostname;
    endpoint = url.href.replace(/\/+$/, '') + '/chat/completions';
  } catch { /* Invalid configuration is reported as unconfigured. */ }
  return { key, model, endpoint, provider, configured: Boolean(key && model && endpoint && env.CHAT_ACCESS_TOKEN) };
}
export function chatPayload(config, messages) {
  const body = {model:config.model,messages:messages.map(({role,content})=>({role,content}))};
  if (config.provider === 'api.openai.com') Object.assign(body,{max_completion_tokens:2048,store:false});
  else body.max_tokens = 2048;
  if (config.provider === 'api.deepseek.com') body.thinking = {type:'disabled'};
  return body;
}
