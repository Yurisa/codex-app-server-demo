const $ = s => document.querySelector(s);
let history = [], busy = false, ready = false;
function bubble(role, content) { const item = document.createElement('article'); item.className = `message ${role}`; const label = document.createElement('b'); label.textContent = role === 'user' ? '你' : '✳ 知言'; const text = document.createElement('div'); text.textContent = content; item.append(label, text); $('#messages').append(item); item.scrollIntoView({block:'end', behavior:'smooth'}); return item; }
async function status() {
  try { const r = await fetch('/api/status'); if (!r.ok) throw Error(); const s = await r.json(); ready = s.ai === 'configured'; $('#connection').textContent = ready ? '● AI 已配置' : '○ AI 待配置'; $('#notice').textContent = ready ? '输入应用访问口令后，即可开始对话。' : '网页服务已运行。AI 尚未配置，请查看「部署与连接状态」。'; }
  catch { $('#connection').textContent = '○ 连接异常'; $('#notice').textContent = '无法连接应用服务，请刷新页面重试。'; }
  $('#send').disabled = !ready || busy;
}
$('#chat-form').addEventListener('submit', async e => {
  e.preventDefault(); const content = $('#prompt').value.trim(); if (!content || busy || !ready) return;
  if (!$('#token').value.trim()) { $('#notice').textContent = '请先输入应用访问口令。'; $('details').open = true; $('#token').focus(); return; }
  if (history.length >= 40) { $('#notice').textContent = '当前对话已达长度限制，请新建对话。'; return; }
  busy = true; $('#send').disabled = true; $('#new-chat').disabled = true; $('#welcome').hidden = true;
  const user = bubble('user', content); const pending = bubble('assistant', '正在思考…'); $('#prompt').value = ''; $('#notice').textContent = '';
  try {
    const r = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${$('#token').value.trim()}`}, body:JSON.stringify({messages:[...history,{role:'user',content}]}), signal:AbortSignal.timeout(65_000) });
    const data = await r.json(); if (!r.ok) throw Error(data.error || '发送失败，请重试。');
    pending.lastElementChild.textContent = data.reply; history.push({role:'user',content},{role:'assistant',content:data.reply}); pending.scrollIntoView({block:'end',behavior:'smooth'});
  } catch (error) { user.remove(); pending.remove(); $('#prompt').value = content; $('#notice').textContent = error.name === 'TimeoutError' ? '请求超时，消息已保留，请重试。' : error.message; }
  finally { busy = false; $('#send').disabled = !ready; $('#new-chat').disabled = false; $('#prompt').focus(); }
});
$('#prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
$('#new-chat').onclick = () => { if (busy) return; history = []; $('#messages').replaceChildren(); $('#welcome').hidden = false; $('#prompt').value = ''; $('#notice').textContent = ''; $('#prompt').focus(); };
document.querySelectorAll('[data-prompt]').forEach(b => b.onclick = () => { $('#prompt').value = b.dataset.prompt; $('#prompt').focus(); });
status();
