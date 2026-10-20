const $ = s => document.querySelector(s);
async function refresh() {
  $('#refresh').disabled = true;
  try {
    const r = await fetch('/api/status', {cache:'no-store'}); if (!r.ok) throw Error(); const s = await r.json();
    $('#headline').textContent = '网页服务运行正常'; $('#web').textContent = '● 在线'; $('#ai').textContent = s.ai === 'configured' ? '● 已配置' : '○ 待配置'; $('#model').textContent = s.model ? `当前模型：${s.model} · ${s.provider || "模型服务"}` : '尚未设置模型。';
    $('#inference').textContent = s.lastSuccess ? '● 已验证' : '○ 尚未验证'; $('#last').textContent = s.lastSuccess ? `本进程最近成功调用：${new Date(s.lastSuccess).toLocaleString('zh-CN')}` : '尚无成功调用记录；重启后记录会重置。';
    $('#checked').textContent = `检查时间：${new Date().toLocaleString('zh-CN')}`;
  } catch { $('#headline').textContent = '暂时无法连接服务'; $('#web').textContent = '○ 检查失败'; $('#ai').textContent = '未知'; $('#inference').textContent = '未知'; $('#model').textContent = '无法读取当前配置。'; $('#last').textContent = '无法读取验证记录。'; $('#checked').textContent = '请检查服务是否启动后重试。'; }
  finally { $('#refresh').disabled = false; }
}
$('#refresh').onclick = refresh; refresh();
