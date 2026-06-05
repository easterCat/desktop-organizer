// 桌面图标收纳盒 - 主窗口渲染进程

let config = { boxes: [], unassigned: [] };
let allShortcuts = [];
let iconCache = {};
let dragData = null;

// CODE-06: DOM 更新优化 - 渲染缓存
const renderCache = { unassigned: '', boxes: '' };

// --- 初始化 ---
async function init() {
  bindTitlebar();
  bindToolbar();
  bindModal();
  bindContextMenu();
  bindBoxUpdateListener();
  bindIconUpdateListener();
  bindActivityLogListener();
  bindKeyboardShortcuts();
  bindSettingsModal();
  bindActivityLogModal();

  await loadData();
  await refreshShortcuts();
  render();
  updateStatusBar();
}

async function loadData() {
  config = await window.api.loadConfig();
  invalidateRenderCache();
}

async function refreshShortcuts() {
  allShortcuts = await window.api.getShortcuts();
  for (const sc of allShortcuts) {
    if (sc.iconData) iconCache[sc.path] = `data:image/png;base64,${sc.iconData}`;
  }
  syncUnassigned();
  invalidateRenderCache();
}

function syncUnassigned() {
  let changed = false;
  const assignedPaths = new Set();
  for (const box of config.boxes) {
    for (const item of box.items) assignedPaths.add(item.path);
  }
  const shortcutMap = new Map(allShortcuts.map(s => [s.path, s]));
  const existingPaths = new Set(allShortcuts.map(s => s.path));

  // 记录变更前状态 (PERF-04)
  const beforeBoxes = JSON.stringify(config.boxes.map(b => b.items.map(i => i.path)));
  const beforeUnassigned = JSON.stringify(config.unassigned.map(i => i.path));

  config.unassigned = config.unassigned.filter(item => existingPaths.has(item.path));
  for (const box of config.boxes) {
    box.items = box.items.filter(item => existingPaths.has(item.path));
  }

  const enrichItem = (item) => {
    const sc = shortcutMap.get(item.path);
    if (sc && sc.iconData && !item.iconData) { item.iconData = sc.iconData; changed = true; }
  };
  config.unassigned.forEach(enrichItem);
  config.boxes.forEach(box => box.items.forEach(enrichItem));

  for (const sc of allShortcuts) {
    if (!assignedPaths.has(sc.path) && !config.unassigned.find(u => u.path === sc.path)) {
      config.unassigned.push(shortcutToItem(sc));
      changed = true;
    }
  }

  // 仅在数据实际变化时保存 (PERF-04)
  const afterBoxes = JSON.stringify(config.boxes.map(b => b.items.map(i => i.path)));
  const afterUnassigned = JSON.stringify(config.unassigned.map(i => i.path));
  if (beforeBoxes !== afterBoxes || beforeUnassigned !== afterUnassigned) changed = true;

  if (changed) saveConfig();
}

function shortcutToItem(sc) {
  return { name: sc.name, path: sc.path, type: sc.type, targetPath: sc.targetPath || '', iconPath: sc.iconPath || '', iconIndex: sc.iconIndex || 0, url: sc.url || '', iconData: sc.iconData || null };
}

// getIconHtml 使用 utils.js 中的共享版本，传入本地 iconCache
function getIconHtml(item) {
  return getIconHtmlFromUtils(item, iconCache);
}

async function saveConfig() {
  await window.api.saveConfig(config);
}

let boxUpdateCleanup = null;
function bindBoxUpdateListener() {
  if (boxUpdateCleanup) boxUpdateCleanup();
  boxUpdateCleanup = window.api.onBoxUpdated(async () => {
    // 桌面浮动窗口数据变化，重新加载配置并刷新
    config = await window.api.loadConfig();
    invalidateRenderCache();
    render(document.getElementById('search-input').value);
  });
}

// 图标增量更新监听 (UX-02)
let iconUpdateCleanup = null;
function bindIconUpdateListener() {
  if (iconUpdateCleanup) iconUpdateCleanup();
  iconUpdateCleanup = window.api.onIconUpdated(({ path: iconPath, iconData }) => {
    if (iconData) {
      iconCache[iconPath] = `data:image/png;base64,${iconData}`;
      // 增量更新 DOM 中对应的图标元素
      const cards = document.querySelectorAll(`[data-path="${CSS.escape(iconPath)}"] .shortcut-icon`);
      cards.forEach(el => {
        el.classList.remove('loading');
        el.innerHTML = `<img src="${iconCache[iconPath]}" alt="" />`;
      });
    }
  });
}

// --- 渲染 ---
function render(filter = '') {
  renderUnassigned(filter);
  renderBoxes(filter);
  updateStatusBar();
}

// 清除渲染缓存（数据变化时调用）
function invalidateRenderCache() {
  renderCache.unassigned = '';
  renderCache.boxes = '';
}

function renderUnassigned(filter = '') {
  const grid = document.getElementById('unassigned-grid');
  const count = document.getElementById('unassigned-count');
  const items = filter ? config.unassigned.filter(i => i.name.toLowerCase().includes(filter.toLowerCase())) : config.unassigned;
  count.textContent = items.length;

  // CODE-06: 生成 HTML 并检查缓存
  let html;
  if (items.length === 0) {
    html = `<div class="empty-state">${filter ? '没有匹配的快捷方式' : '所有快捷方式已分类'}</div>`;
  } else {
    html = items.map(item => {
      const isLoading = item.iconPath && !iconCache[item.path] && !item.iconData;
      return `
      <div class="shortcut-card" draggable="true"
           data-path="${escapeAttr(item.path)}"
           data-name="${escapeAttr(item.name)}"
           data-target="${escapeAttr(item.targetPath || '')}"
           data-url="${escapeAttr(item.url || '')}"
           data-source="unassigned">
        <div class="shortcut-icon${isLoading ? ' loading' : ''}">${getIconHtml(item)}</div>
        <div class="shortcut-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
      </div>
    `}).join('');
  }

  const cacheKey = html + filter;
  if (renderCache.unassigned === cacheKey) return;
  renderCache.unassigned = cacheKey;

  grid.innerHTML = html;

  grid.querySelectorAll('.shortcut-card').forEach(card => {
    bindDragEvents(card);
    card.addEventListener('dblclick', () => window.api.openShortcut(card.dataset.path, card.dataset.target, card.dataset.url));
  });
}

function renderBoxes(filter = '') {
  const container = document.getElementById('boxes-container');
  if (config.boxes.length === 0) {
    const emptyHtml = `<div class="empty-state">还没有收纳盒，点击「新建收纳盒」开始整理桌面图标</div>`;
    if (renderCache.boxes === emptyHtml) return;
    renderCache.boxes = emptyHtml;
    container.innerHTML = emptyHtml;
    return;
  }

  // CODE-06: 生成 HTML 并检查缓存
  const html = config.boxes.map((box, idx) => {
    const items = filter ? box.items.filter(i => i.name.toLowerCase().includes(filter.toLowerCase())) : box.items;
    const isCollapsed = box.collapsed ? 'collapsed' : '';
    const toggleIcon = box.collapsed ? 'collapsed' : '';
    const desktopBadge = box.onDesktop ? '<span class="box-desktop-badge">桌面</span>' : '';
    const desktopToggleBtn = box.onDesktop
      ? `<button type="button" class="box-action-btn" data-action="close-desktop" data-idx="${idx}" title="关闭桌面窗口">📺</button>`
      : `<button type="button" class="box-action-btn" data-action="open-desktop" data-idx="${idx}" title="放到桌面">🖥️</button>`;

    return `
      <div class="box-section" data-box-index="${idx}">
        <div class="box-header" data-box-index="${idx}">
          <div class="box-color-bar" style="background:${box.color || '#6c5ce7'}"></div>
          <span class="box-icon">${box.icon || '📁'}</span>
          <span class="box-title">${escapeHtml(box.name)}${desktopBadge}</span>
          <span class="box-count">${items.length}</span>
          <div class="box-actions">
            ${desktopToggleBtn}
            <button type="button" class="box-action-btn" data-action="rename" data-idx="${idx}" title="重命名">✏️</button>
            <button type="button" class="box-action-btn danger" data-action="delete" data-idx="${idx}" title="删除收纳盒">🗑️</button>
          </div>
          <span class="box-toggle ${toggleIcon}">▼</span>
        </div>
        <div class="box-content ${isCollapsed}" data-box-index="${idx}">
          ${items.length === 0
            ? `<div class="empty-state">拖拽快捷方式到此处</div>`
            : items.map(item => {
              const isLoading = item.iconPath && !iconCache[item.path] && !item.iconData;
              return `
              <div class="shortcut-card" draggable="true"
                   data-path="${escapeAttr(item.path)}"
                   data-name="${escapeAttr(item.name)}"
                   data-target="${escapeAttr(item.targetPath || '')}"
                   data-url="${escapeAttr(item.url || '')}"
                   data-source="box-${idx}">
                <div class="shortcut-icon${isLoading ? ' loading' : ''}">${getIconHtml(item)}</div>
                <div class="shortcut-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
              </div>
            `}).join('')
          }
        </div>
      </div>
    `;
  }).join('');

  const cacheKey = html + filter;
  if (renderCache.boxes === cacheKey) return;
  renderCache.boxes = cacheKey;

  container.innerHTML = html;

  container.querySelectorAll('.box-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.box-action-btn')) return;
      const idx = parseInt(header.dataset.boxIndex);
      toggleBox(idx);
    });
  });

  container.querySelectorAll('.box-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      if (action === 'delete') deleteBox(idx);
      else if (action === 'rename') renameBox(idx);
      else if (action === 'open-desktop') openDesktopBox(idx);
      else if (action === 'close-desktop') closeDesktopBox(idx);
    });
  });

  container.querySelectorAll('.shortcut-card').forEach(card => {
    bindDragEvents(card);
    card.addEventListener('dblclick', () => window.api.openShortcut(card.dataset.path, card.dataset.target, card.dataset.url));
  });

  container.querySelectorAll('.box-content').forEach(zone => {
    zone.addEventListener('dragover', handleDragOver);
    zone.addEventListener('dragleave', handleDragLeave);
    zone.addEventListener('drop', handleDrop);
  });

  container.querySelectorAll('.box-section').forEach(section => {
    section.addEventListener('dragover', (e) => { e.preventDefault(); section.classList.add('drag-target'); });
    section.addEventListener('dragleave', (e) => { if (!section.contains(e.relatedTarget)) section.classList.remove('drag-target'); });
    section.addEventListener('drop', (e) => {
      section.classList.remove('drag-target');
      handleDropOnBox(e, parseInt(section.dataset.boxIndex));
    });
  });
}

// --- 拖拽 ---
function bindDragEvents(card) {
  card.addEventListener('dragstart', (e) => {
    dragData = { path: card.dataset.path, name: card.dataset.name, source: card.dataset.source };
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    // 设置可被桌面浮动窗口识别的数据
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'shortcut-item',
      itemPath: card.dataset.path,
      itemName: card.dataset.name
    }));
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    dragData = null;
    document.querySelectorAll('.drag-target, .drag-over').forEach(el => el.classList.remove('drag-target', 'drag-over'));
  });
}

function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function handleDragLeave(e) {}
function handleDrop(e) { e.preventDefault(); }

async function handleDropOnBox(e, boxIndex) {
  if (!dragData) return;
  const { path, source } = dragData;
  let item = null;
  if (source === 'unassigned') {
    const idx = config.unassigned.findIndex(i => i.path === path);
    if (idx >= 0) item = config.unassigned.splice(idx, 1)[0];
  } else if (source.startsWith('box-')) {
    const srcBoxIdx = parseInt(source.replace('box-', ''));
    const idx = config.boxes[srcBoxIdx].items.findIndex(i => i.path === path);
    if (idx >= 0) item = config.boxes[srcBoxIdx].items.splice(idx, 1)[0];
  }
  if (item) {
    config.boxes[boxIndex].items.push(item);
    await saveConfig();
    render(document.getElementById('search-input').value);
    showToast(`已将「${item.name}」移入「${config.boxes[boxIndex].name}」`);
    window.api.logActivity('move', `「${item.name}」移入「${config.boxes[boxIndex].name}」`);
  }
  dragData = null;
}

// --- 收纳盒操作 ---
function toggleBox(idx) {
  config.boxes[idx].collapsed = !config.boxes[idx].collapsed;
  saveConfig();
  render(document.getElementById('search-input').value);
}

async function deleteBox(idx) {
  const box = config.boxes[idx];
  const confirmed = await showConfirm('删除收纳盒', `确定删除收纳盒「${box.name}」吗？\n其中的快捷方式将移回未分类。`);
  if (!confirmed) return;
  // 如果在桌面显示，先关闭桌面窗口
  if (box.onDesktop) await window.api.closeDesktopBox(box.id);
  config.unassigned.push(...box.items);
  config.boxes.splice(idx, 1);
  await saveConfig();
  render(document.getElementById('search-input').value);
  showToast(`已删除收纳盒「${box.name}」`);
  window.api.logActivity('delete', `删除收纳盒「${box.name}」，${box.items.length} 个图标移回未分类`);
}

function renameBox(idx) {
  const box = config.boxes[idx];
  const modal = document.getElementById('modal-rename-box');
  const input = document.getElementById('input-rename-box');
  const confirmBtn = document.getElementById('modal-rename-confirm');
  const cancelBtn = document.getElementById('modal-rename-cancel');
  const closeBtn = document.getElementById('modal-rename-close');

  // 重置输入框并显示模态框
  input.value = box.name;
  modal.style.display = 'flex';
  input.focus();
  input.select();

  // 清理函数
  let resolved = false;
  function cleanup() {
    if (resolved) return;
    resolved = true;
    modal.style.display = 'none';
    // 移除事件监听器
    confirmBtn.removeEventListener('click', onConfirm);
    cancelBtn.removeEventListener('click', onCancel);
    closeBtn.removeEventListener('click', onCancel);
    input.removeEventListener('keydown', onKeyDown);
    modal.removeEventListener('click', onOverlayClick);
  }

  async function onConfirm() {
    const newName = input.value.trim();
    if (newName && newName !== box.name) {
      const oldName = box.name;
      box.name = newName;
      await saveConfig();
      render(document.getElementById('search-input').value);
      showToast(`已重命名为「${newName}」`);
      window.api.logActivity('rename', `收纳盒「${oldName}」重命名为「${newName}」`);
    }
    cleanup();
  }

  function onCancel() {
    cleanup();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') onConfirm();
    if (e.key === 'Escape') onCancel();
  }

  function onOverlayClick(e) {
    if (e.target === modal) onCancel();
  }

  // 绑定事件
  confirmBtn.addEventListener('click', onConfirm);
  cancelBtn.addEventListener('click', onCancel);
  closeBtn.addEventListener('click', onCancel);
  input.addEventListener('keydown', onKeyDown);
  modal.addEventListener('click', onOverlayClick);
}

async function openDesktopBox(idx) {
  const box = config.boxes[idx];
  if (!box.id) {
    // 老数据没有 id，生成一个
    box.id = 'box_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    await saveConfig();
  }
  await window.api.createDesktopBox(box.id);
  box.onDesktop = true;
  await saveConfig();
  render(document.getElementById('search-input').value);
  showToast(`「${box.name}」已放到桌面`);
}

async function closeDesktopBox(idx) {
  const box = config.boxes[idx];
  await window.api.closeDesktopBox(box.id);
  box.onDesktop = false;
  await saveConfig();
  render(document.getElementById('search-input').value);
}

// --- 右键菜单 ---
let contextTarget = null;

function bindContextMenu() {
  document.addEventListener('click', () => hideContextMenu());
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('.shortcut-card')) hideContextMenu(); });
  document.querySelectorAll('#context-menu .ctx-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      handleContextAction(item.dataset.action);
    });
  });

  // 未分类区域：事件委托处理右键菜单
  const unassignedGrid = document.getElementById('unassigned-grid');
  if (unassignedGrid) {
    unassignedGrid.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.shortcut-card');
      if (card) {
        showContextMenu(e, card.dataset.path, card.dataset.source);
      }
    });
  }

  // 收纳盒区域：事件委托处理右键菜单
  const boxesContainer = document.getElementById('boxes-container');
  if (boxesContainer) {
    boxesContainer.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.shortcut-card');
      if (card) {
        showContextMenu(e, card.dataset.path, card.dataset.source);
      }
    });
  }
}

function showContextMenu(e, path, source) {
  e.preventDefault();
  e.stopPropagation();
  const card = e.target.closest('.shortcut-card');
  const targetPath = card ? card.dataset.target : '';
  const url = card ? card.dataset.url : '';
  contextTarget = { path, source, targetPath, url };
  const menu = document.getElementById('context-menu');
  menu.style.display = 'block';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.querySelector('[data-action="remove"]').style.display = source === 'unassigned' ? 'none' : '';
  menu.querySelector('[data-action="move"]').style.display = config.boxes.length === 0 ? 'none' : '';
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
  document.getElementById('move-menu').style.display = 'none';
  contextTarget = null;
}

async function handleContextAction(action) {
  if (!contextTarget) return;
  const { path, source, targetPath, url } = contextTarget;
  switch (action) {
    case 'open': {
      hideContextMenu();
      const res = await window.api.openShortcut(path, targetPath, url);
      if (res && !res.ok) showToast('打开失败: ' + (res.error || '未知错误'));
      return;
    }
    case 'explorer': {
      hideContextMenu();
      const res = await window.api.openInExplorer(path, targetPath);
      if (res && !res.ok) showToast('定位失败: ' + (res.error || '未知错误'));
      return;
    }
    case 'remove': await removeFromBox(path, source); break;
    case 'move': showMoveMenu(path, source); return;
  }
  hideContextMenu();
}

function showMoveMenu(path, source) {
  const moveMenu = document.getElementById('move-menu');
  moveMenu.innerHTML = config.boxes.map((box, idx) => `
    <div class="ctx-item" data-move-to="${idx}">${box.icon} ${escapeHtml(box.name)}</div>
  `).join('');
  moveMenu.querySelectorAll('[data-move-to]').forEach(item => {
    item.addEventListener('click', async () => {
      await moveItemToBox(path, source, parseInt(item.dataset.moveTo));
      hideContextMenu();
    });
  });
  const rect = document.getElementById('context-menu').getBoundingClientRect();
  moveMenu.style.display = 'block';
  moveMenu.style.left = rect.right + 'px';
  moveMenu.style.top = rect.top + 'px';
}

async function moveItemToBox(path, source, boxIdx) {
  let item = null;
  if (source === 'unassigned') {
    const idx = config.unassigned.findIndex(i => i.path === path);
    if (idx >= 0) item = config.unassigned.splice(idx, 1)[0];
  } else if (source.startsWith('box-')) {
    const srcBoxIdx = parseInt(source.replace('box-', ''));
    const idx = config.boxes[srcBoxIdx].items.findIndex(i => i.path === path);
    if (idx >= 0) item = config.boxes[srcBoxIdx].items.splice(idx, 1)[0];
  }
  if (item) {
    config.boxes[boxIdx].items.push(item);
    await saveConfig();
    render(document.getElementById('search-input').value);
    showToast(`已将「${item.name}」移入「${config.boxes[boxIdx].name}」`);
    window.api.logActivity('move', `「${item.name}」移入「${config.boxes[boxIdx].name}」`);
  }
}

async function removeFromBox(path, source) {
  if (!source.startsWith('box-')) return;
  const boxIdx = parseInt(source.replace('box-', ''));
  const idx = config.boxes[boxIdx].items.findIndex(i => i.path === path);
  if (idx >= 0) {
    const item = config.boxes[boxIdx].items.splice(idx, 1)[0];
    config.unassigned.push(item);
    await saveConfig();
    render(document.getElementById('search-input').value);
    showToast(`已将「${item.name}」移回未分类`);
    window.api.logActivity('move', `「${item.name}」从「${config.boxes[boxIdx].name}」移回未分类`);
  }
}

// --- 工具栏 ---
function bindToolbar() {
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    showToast('正在刷新...');
    await refreshShortcuts();
    render(document.getElementById('search-input').value);
    showToast('刷新完成');
  });
  document.getElementById('search-input').addEventListener('input', (e) => render(e.target.value));
  document.getElementById('btn-quick-organize').addEventListener('click', () => quickOrganize());
}

// --- 模态框 ---
function bindModal() {
  const modal = document.getElementById('modal-add-box');
  const inputName = document.getElementById('input-box-name');
  let selectedIcon = '📁';
  let selectedColor = '#6c5ce7';
  let selectedMode = 'panel';

  document.getElementById('btn-add-box').addEventListener('click', () => {
    modal.style.display = 'flex';
    inputName.value = '';
    inputName.focus();
    document.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
    document.querySelector('.icon-opt[data-icon="📁"]').classList.add('selected');
    document.querySelectorAll('.tone-opt').forEach(o => o.classList.remove('selected'));
    document.querySelector('.tone-opt[data-color="#888"]').classList.add('selected');
    document.querySelectorAll('.mode-opt').forEach(o => o.classList.remove('selected'));
    document.querySelector('.mode-opt[data-mode="panel"]').classList.add('selected');
    selectedIcon = '📁'; selectedColor = '#888'; selectedMode = 'panel';
  });

  document.getElementById('modal-cancel').addEventListener('click', () => modal.style.display = 'none');
  document.getElementById('modal-close').addEventListener('click', () => modal.style.display = 'none');

  document.getElementById('icon-picker').addEventListener('click', (e) => {
    const option = e.target.closest('.icon-opt');
    if (!option) return;
    document.querySelectorAll('.icon-opt').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    selectedIcon = option.dataset.icon;
  });

  document.getElementById('color-picker').addEventListener('click', (e) => {
    const option = e.target.closest('.tone-opt');
    if (!option) return;
    document.querySelectorAll('.tone-opt').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    selectedColor = option.dataset.color;
  });

  document.getElementById('display-mode-picker').addEventListener('click', (e) => {
    const option = e.target.closest('.mode-opt');
    if (!option) return;
    document.querySelectorAll('.mode-opt').forEach(o => o.classList.remove('selected'));
    option.classList.add('selected');
    selectedMode = option.dataset.mode;
  });

  document.getElementById('modal-confirm').addEventListener('click', async () => {
    const name = inputName.value.trim();
    if (!name) { inputName.style.borderColor = 'var(--danger)'; return; }

    const boxId = 'box_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const newBox = {
      id: boxId,
      name,
      icon: selectedIcon,
      color: selectedColor,
      items: [],
      collapsed: false,
      onDesktop: selectedMode === 'desktop',
      desktopPos: { x: 100 + (config.boxes.length * 30) % 300, y: 100 + (config.boxes.length * 30) % 200 },
      desktopSize: { width: 260, height: 320 }
    };

    config.boxes.push(newBox);
    await saveConfig();
    modal.style.display = 'none';
    render(document.getElementById('search-input').value);

    if (selectedMode === 'desktop') {
      await window.api.createDesktopBox(boxId);
      showToast(`已创建桌面收纳盒「${name}」`);
      window.api.logActivity('create', `创建桌面收纳盒「${name}」`);
    } else {
      showToast(`已创建收纳盒「${name}」`);
      window.api.logActivity('create', `创建收纳盒「${name}」`);
    }
  });

  inputName.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('modal-confirm').click(); });
  inputName.addEventListener('input', () => { inputName.style.borderColor = ''; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
}

// --- 标题栏 ---
function bindTitlebar() {
  document.getElementById('btn-minimize').addEventListener('click', () => window.api.windowMinimize());
  document.getElementById('btn-maximize').addEventListener('click', () => window.api.windowMaximize());
  document.getElementById('btn-close').addEventListener('click', () => window.api.windowClose());
}

// --- Toast ---
function showToast(message) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// escapeHtml, escapeAttr, formatBytes, formatRelativeTime 已在 utils.js 中定义

// --- P2: 状态栏 (D01) ---
async function updateStatusBar() {
  // 更新计数
  const totalItems = config.boxes.reduce((sum, b) => sum + b.items.length, 0) + config.unassigned.length;
  const classifiedCount = config.boxes.reduce((sum, b) => sum + b.items.length, 0);
  document.getElementById('status-box-count').textContent = `📦 ${config.boxes.length}`;
  document.getElementById('status-total-count').textContent = `📄 ${totalItems}`;
  document.getElementById('status-unassigned-count').textContent = `❓ ${config.unassigned.length}`;

  // 更新上次整理时间
  const lastTime = config.lastOrganizeTime;
  const lastTimeEl = document.getElementById('status-last-organize');
  if (lastTime) {
    lastTimeEl.textContent = `🕐 ${formatRelativeTime(lastTime)}`;
  }

  // 异步获取系统信息
  try {
    const sysInfo = await window.api.getSystemInfo();

    // 磁盘使用率
    if (sysInfo.diskTotal > 0) {
      const usagePercent = Math.round((sysInfo.diskUsed / sysInfo.diskTotal) * 100);
      const fillEl = document.getElementById('disk-bar-fill');
      const textEl = document.getElementById('disk-text');
      fillEl.style.width = usagePercent + '%';
      textEl.textContent = usagePercent + '%';

      // 颜色变化
      fillEl.classList.remove('warning', 'danger');
      if (usagePercent >= 90) fillEl.classList.add('danger');
      else if (usagePercent >= 75) fillEl.classList.add('warning');

      document.getElementById('disk-usage-wrap').title = `磁盘使用: ${formatBytes(sysInfo.diskUsed)} / ${formatBytes(sysInfo.diskTotal)}`;
    }

    // 内存使用
    if (sysInfo.memTotal > 0) {
      const memPercent = Math.round((sysInfo.memUsed / sysInfo.memTotal) * 100);
      document.getElementById('status-mem').textContent = `💾 ${memPercent}%`;
      document.getElementById('status-mem').title = `内存: ${formatBytes(sysInfo.memUsed)} / ${formatBytes(sysInfo.memTotal)}`;
    }
  } catch (e) {}
}

// --- CODE-05: 自定义确认对话框 ---
function showConfirm(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    modal.style.display = 'flex';

    const cleanup = (result) => {
      modal.style.display = 'none';
      document.getElementById('confirm-ok').removeEventListener('click', onOk);
      document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
      document.getElementById('confirm-close').removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    document.getElementById('confirm-ok').addEventListener('click', onOk);
    document.getElementById('confirm-cancel').addEventListener('click', onCancel);
    document.getElementById('confirm-close').addEventListener('click', onCancel);
  });
}

// --- P2: 快速整理 (D02) ---
async function quickOrganize() {
  const btn = document.getElementById('btn-quick-organize');
  btn.classList.add('btn-quick-organize-flash');
  setTimeout(() => btn.classList.remove('btn-quick-organize-flash'), 300);

  if (config.boxes.length === 0) {
    showToast('请先创建收纳盒');
    return;
  }
  if (config.unassigned.length === 0) {
    showToast('没有未分类的快捷方式');
    return;
  }

  showToast('正在快速整理...');
  const result = await window.api.quickOrganize();
  if (result.moved > 0) {
    config = await window.api.loadConfig();
    render(document.getElementById('search-input').value);
    showToast(`快速整理完成，自动归类 ${result.moved} 个快捷方式`);
  } else {
    showToast('没有可自动归类的快捷方式');
  }
}

// --- P2: 设置面板 (D03) ---
function bindSettingsModal() {
  const modal = document.getElementById('modal-settings');
  const closeBtn = document.getElementById('modal-settings-close');
  const cancelBtn = document.getElementById('modal-settings-cancel');
  const saveBtn = document.getElementById('modal-settings-save');
  const browseBtn = document.getElementById('btn-browse-path');
  const pathInput = document.getElementById('input-desktop-path');

  document.getElementById('btn-settings').addEventListener('click', async () => {
    // 填充当前设置
    const desktopPath = await window.api.getDesktopPath();
    pathInput.value = desktopPath;

    // 填充统计信息
    const totalItems = config.boxes.reduce((sum, b) => sum + b.items.length, 0) + config.unassigned.length;
    const classifiedCount = config.boxes.reduce((sum, b) => sum + b.items.length, 0);
    document.getElementById('info-box-count').textContent = config.boxes.length;
    document.getElementById('info-classified-count').textContent = classifiedCount;
    document.getElementById('info-unassigned-count').textContent = config.unassigned.length;

    modal.style.display = 'flex';
  });

  function closeModal() { modal.style.display = 'none'; }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  saveBtn.addEventListener('click', () => {
    closeModal();
    showToast('设置已保存');
  });

  browseBtn.addEventListener('click', async () => {
    const folder = await window.api.pickFolder();
    if (folder) {
      pathInput.value = folder;
      showToast('桌面路径已更新');
    }
  });
}

// --- P2: 活动日志面板 (D04) ---
function bindActivityLogModal() {
  const modal = document.getElementById('modal-activity-log');
  const closeBtn = document.getElementById('modal-log-close');
  const closeBtn2 = document.getElementById('modal-log-close-btn');
  const clearBtn = document.getElementById('btn-clear-log');

  document.getElementById('btn-activity-log').addEventListener('click', async () => {
    await renderActivityLog();
    modal.style.display = 'flex';
  });

  function closeModal() { modal.style.display = 'none'; }

  closeBtn.addEventListener('click', closeModal);
  closeBtn2.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  clearBtn.addEventListener('click', async () => {
    await window.api.clearActivityLog();
    renderActivityLogEmpty();
    showToast('日志已清空');
  });
}

async function renderActivityLog() {
  const logList = document.getElementById('activity-log-list');
  const log = await window.api.getActivityLog();

  if (!log || log.length === 0) {
    logList.innerHTML = '<div class="empty-state">暂无活动记录</div>';
    return;
  }

  logList.innerHTML = log.map(entry => {
    const icon = getLogTypeIcon(entry.type);
    const timeStr = formatRelativeTime(entry.time);
    return `
      <div class="log-entry log-type-${entry.type}">
        <span class="log-icon">${icon}</span>
        <div class="log-content">
          <div class="log-message">${escapeHtml(entry.message)}</div>
          <div class="log-time">${timeStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderActivityLogEmpty() {
  document.getElementById('activity-log-list').innerHTML = '<div class="empty-state">暂无活动记录</div>';
}

function getLogTypeIcon(type) {
  const icons = {
    move: '↔️',
    create: '✨',
    delete: '🗑️',
    rename: '✏️',
    organize: '⚡',
    system: '🔧'
  };
  return icons[type] || '📌';
}

function bindActivityLogListener() {
  window.api.onActivityUpdated(() => {
    // 如果日志面板打开，自动刷新
    const modal = document.getElementById('modal-activity-log');
    if (modal.style.display === 'flex') {
      renderActivityLog();
    }
  });
}

// --- P2: 键盘快捷键 (D05) ---
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+F: 聚焦搜索框
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      document.getElementById('search-input').focus();
    }
    // Ctrl+N: 新建收纳盒
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      document.getElementById('btn-add-box').click();
    }
    // Ctrl+R: 刷新
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
      document.getElementById('btn-refresh').click();
    }
    // Ctrl+Shift+O: 快速整理
    if (e.ctrlKey && e.shiftKey && e.key === 'O') {
      e.preventDefault();
      quickOrganize();
    }
    // Escape: 关闭搜索/模态框
    if (e.key === 'Escape') {
      const searchInput = document.getElementById('search-input');
      if (document.activeElement === searchInput && searchInput.value) {
        searchInput.value = '';
        render('');
        searchInput.blur();
        return;
      }
      // 关闭所有模态框
      document.querySelectorAll('.modal-overlay').forEach(m => {
        if (m.style.display === 'flex') m.style.display = 'none';
      });
      hideContextMenu();
    }
  });
}

init();
