// 桌面图标收纳盒 — 共享工具函数 (CODE-01)

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getIconHtmlFromUtils(item, iconCache) {
  // PRD §12.3: PowerShell 解析失败时显示灰色占位符
  if (item.parseFailed) return '<span style="display:inline-block;width:32px;height:32px;border-radius:6px;background:rgba(255,255,255,0.08);opacity:0.4;" title="解析失败"></span>';
  const fallback = item.type === 'url' ? '🌐' : '📄';
  const onerror = `this.onerror=null;this.parentElement.textContent='${fallback}'`;
  if (iconCache[item.path]) return `<img src="${iconCache[item.path]}" alt="${item.name}" onerror="${onerror}" />`;
  if (item.iconData) return `<img src="data:image/png;base64,${item.iconData}" alt="${item.name}" onerror="${onerror}" />`;
  // iconPath 存在但图标尚未加载时，显示 fallback emoji 而非空字符串（避免永久转圈）
  return fallback;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}
