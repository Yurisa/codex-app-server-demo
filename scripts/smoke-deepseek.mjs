import {codexChat} from '../src/codex-chat.js';
if(!process.env.AI_API_KEY){console.error('请先在 .env 中配置 AI_API_KEY（DeepSeek 密钥），无需 OpenAI 密钥。');process.exitCode=1;}
else try {
 const result=await codexChat([{role:'user',content:'只回复：连接成功'}]);
 console.log(JSON.stringify({backend:result.backend,reply:result.reply,threadId:result.threadId,turnId:result.turnId},null,2));
} catch {console.error('真实模型验证失败，请检查 DeepSeek 密钥、余额、模型和网络访问。');process.exitCode=1;}
