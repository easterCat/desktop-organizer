// 桌面图标收纳盒 - 主窗口渲染进程

let config = { boxes: [], unassigned: [] };
let allShortcuts = [];
let iconCache = {};
let dragData = null;
let searchTimer = null;
let batchMode = false;
let selectedItems = new Set();
let organizeCandidates = []; // 快速整理候选项（PRD §5.5 候选建议）

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
  bindConfigCorruptedListener();
  bindConfigSaveFailedListener();
  bindPowershellUnavailableListener();
  bindKeyboardShortcuts();
  bindSettingsModal();
  bindActivityLogModal();

  await loadData();
  await refreshShortcuts();
  // F-34: 启动时检测无效快捷方式
  try { await window.api.detectInvalidShortcuts(); } catch (_) {}
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

  // 隐藏模式下，已隐藏的路径视为"有效"（不被过滤掉）
  const hiddenPaths = new Set((config.hiddenItems || []).map(h => h.originalPath || h.path));
  const effectivePaths = new Set([...existingPaths, ...hiddenPaths]);

  // 记录变更前状态 (PERF-04)
  const beforeBoxes = JSON.stringify(config.boxes.map(b => b.items.map(i => i.path)));
  const beforeUnassigned = JSON.stringify(config.unassigned.map(i => i.path));

  config.unassigned = config.unassigned.filter(item => effectivePaths.has(item.path));
  for (const box of config.boxes) {
    box.items = box.items.filter(item => effectivePaths.has(item.path));
  }

  const enrichItem = (item) => {
    const sc = shortcutMap.get(item.path);
    if (sc && sc.iconData && !item.iconData) { item.iconData = sc.iconData; changed = true; }
  };
  config.unassigned.forEach(enrichItem);
  config.boxes.forEach(box => box.items.forEach(enrichItem));

  // 隐藏模式下，不将已隐藏的快捷方式添加到未分类
  for (const sc of allShortcuts) {
    if (!assignedPaths.has(sc.path) && !config.unassigned.find(u => u.path === sc.path) && !hiddenPaths.has(sc.path)) {
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
    }
    // 增量更新 DOM 中对应的图标元素（包括失败的情况，移除 loading 状态）
    const cards = document.querySelectorAll(`[data-path="${CSS.escape(iconPath)}"] .shortcut-icon`);
    cards.forEach(el => {
      el.classList.remove('loading');
      if (iconData) {
        const card = el.closest('.shortcut-card');
        const isUrl = card && card.dataset.url;
        const fallback = isUrl ? '🌐' : '📄';
        el.innerHTML = `<img src="${iconCache[iconPath]}" alt="" onerror="this.onerror=null;this.parentElement.textContent='${fallback}'" />`;
      } else {
        // 提取失败，显示 fallback emoji
        const card = el.closest('.shortcut-card');
        const isUrl = card && card.dataset.url;
        el.textContent = isUrl ? '🌐' : '📄';
      }
    });
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

function matchesFilter(item, filter) {
  if (!filter) return true;
  const f = filter.toLowerCase();
  if (item.name.toLowerCase().includes(f)) return true;
  if (item.targetPath && item.targetPath.toLowerCase().includes(f)) return true;
  if (item.url && item.url.toLowerCase().includes(f)) return true;
  return false;
}

function renderUnassigned(filter = '') {
  const grid = document.getElementById('unassigned-grid');
  const count = document.getElementById('unassigned-count');
  const items = filter ? config.unassigned.filter(i => matchesFilter(i, filter)) : config.unassigned;
  count.textContent = items.length;

  // 构建候选路径集合（用于快速查找）
  const candidateMap = new Map(organizeCandidates.map(c => [c.item.path, c]));

  // CODE-06: 生成 HTML 并检查缓存
  let html;
  if (items.length === 0) {
    html = `<div class="empty-state">${filter ? '没有匹配的快捷方式' : '所有快捷方式已分类'}</div>`;
  } else {
    html = items.map(item => {
      const isLoading = item.iconPath && !iconCache[item.path] && !item.iconData;
      const candidate = candidateMap.get(item.path);
      const candidateClass = candidate ? ' candidate' : '';
      const candidateBadge = candidate
        ? `<div class="candidate-badge">建议归入「${escapeHtml(candidate.boxName)}」
             <button class="candidate-confirm" data-candidate-path="${escapeAttr(item.path)}" title="确认归入">✓</button>
             <button class="candidate-dismiss" data-dismiss-path="${escapeAttr(item.path)}" title="忽略">✕</button>
           </div>`
        : '';
      return `
      <div class="shortcut-card${candidateClass}" draggable="true"
           data-path="${escapeAttr(item.path)}"
           data-name="${escapeAttr(item.name)}"
           data-target="${escapeAttr(item.targetPath || '')}"
           data-url="${escapeAttr(item.url || '')}"
           data-source="unassigned"
           ${item.invalid ? 'data-invalid="true"' : ''}>
        <div class="shortcut-icon${isLoading ? ' loading' : ''}">${getIconHtml(item)}</div>
        <div class="shortcut-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
        ${candidateBadge}
      </div>
    `}).join('');
  }

  const cacheKey = html + filter;
  if (renderCache.unassigned === cacheKey) return;
  renderCache.unassigned = cacheKey;

  grid.innerHTML = html;

  grid.querySelectorAll('.shortcut-card').forEach(card => {
    bindDragEvents(card);
    // F-31: 批量模式下左键点击切换选中
    card.addEventListener('click', (e) => {
      if (batchMode) {
        e.preventDefault();
        e.stopPropagation();
        toggleItemSelection(card.dataset.path);
      }
    });
    card.addEventListener('dblclick', () => {
      if (!batchMode) openShortcutTracked(card.dataset.path, card.dataset.target, card.dataset.url);
    });
    // F-34: 无效快捷方式标记
    if (card.dataset.invalid === 'true') card.classList.add('invalid-shortcut');
  });

  // 候选建议：确认/忽略按钮
  grid.querySelectorAll('.candidate-confirm').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmCandidate(btn.dataset.candidatePath);
    });
  });
  grid.querySelectorAll('.candidate-dismiss').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissCandidate(btn.dataset.dismissPath);
    });
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
    const items = filter ? box.items.filter(i => matchesFilter(i, filter)) : box.items;
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
          <div class="box-title-wrap">
            <span class="box-title">${escapeHtml(box.name)}</span>
            ${desktopBadge}
          </div>
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
                   data-source="box-${idx}"
                   ${item.invalid ? 'data-invalid="true"' : ''}>
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

  // 未分类区域作为拖放目标
  const unassignedSection = document.getElementById('unassigned-section');
  if (unassignedSection && !unassignedSection._dropBound) {
    unassignedSection._dropBound = true;
    unassignedSection.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; unassignedSection.classList.add('drag-target'); });
    unassignedSection.addEventListener('dragleave', (e) => { if (!unassignedSection.contains(e.relatedTarget)) unassignedSection.classList.remove('drag-target'); });
    unassignedSection.addEventListener('drop', (e) => {
      e.preventDefault();
      unassignedSection.classList.remove('drag-target');
      handleDropOnUnassigned(e);
    });
  }

  container.querySelectorAll('.shortcut-card').forEach(card => {
    bindDragEvents(card);
    // F-31: 批量模式下左键点击切换选中
    card.addEventListener('click', (e) => {
      if (batchMode) {
        e.preventDefault();
        e.stopPropagation();
        toggleItemSelection(card.dataset.path);
      }
    });
    card.addEventListener('dblclick', () => {
      if (!batchMode) openShortcutTracked(card.dataset.path, card.dataset.target, card.dataset.url);
    });
    // F-34: 无效快捷方式标记
    if (card.dataset.invalid === 'true') card.classList.add('invalid-shortcut');
  });

  container.querySelectorAll('.box-content').forEach(zone => {
    zone.addEventListener('dragover', handleDragOver);
    zone.addEventListener('dragleave', handleDragLeave);
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const boxSection = zone.closest('.box-section');
      if (boxSection) {
        boxSection.classList.remove('drag-target');
        handleDropOnBox(e, parseInt(boxSection.dataset.boxIndex));
      }
    });
  });

  container.querySelectorAll('.box-section').forEach(section => {
    section.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; section.classList.add('drag-target'); });
    section.addEventListener('dragleave', (e) => { if (!section.contains(e.relatedTarget)) section.classList.remove('drag-target'); });
    section.addEventListener('drop', (e) => {
      e.preventDefault();
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
  // F-06a: 保存撤销快照
  await window.api.saveUndoSnapshot('move');
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

async function handleDropOnUnassigned(e) {
  if (!dragData) return;
  const { path, source } = dragData;
  // 只处理从收纳盒拖出的情况，未分类之间拖拽无意义
  if (!source.startsWith('box-')) { dragData = null; return; }
  // F-06a: 保存撤销快照
  await window.api.saveUndoSnapshot('move');
  const srcBoxIdx = parseInt(source.replace('box-', ''));
  const srcBox = config.boxes[srcBoxIdx];
  const idx = srcBox.items.findIndex(i => i.path === path);
  if (idx >= 0) {
    const item = srcBox.items.splice(idx, 1)[0];
    config.unassigned.push(item);
    await saveConfig();
    render(document.getElementById('search-input').value);
    showToast(`已将「${item.name}」移回未分类`);
    window.api.logActivity('move', `「${item.name}」移出「${srcBox.name}」，回到未分类`);
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
  const confirmed = await showConfirm('删除收纳盒', `确定删除收纳盒「${box.name}」吗？\n盒子内的 ${box.items.length} 个快捷方式将回到未分类区。`);
  if (!confirmed) return;
  // F-06a: 保存撤销快照
  await window.api.saveUndoSnapshot('delete-box');
  // F-06: 通过 main process 删除（含隐藏图标恢复）
  const result = await window.api.deleteBox(idx);
  if (result && result.ok) {
    config = await window.api.loadConfig();
    invalidateRenderCache();
    render(document.getElementById('search-input').value);
    let msg = `已删除收纳盒「${box.name}」`;
    if (result.restored > 0) msg += `，恢复 ${result.restored} 个已隐藏图标`;
    showToast(msg);
  } else {
    showToast('删除失败: ' + (result?.error || '未知错误'));
  }
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

// F-30: 切换收纳盒显示模式（面板 ↔ 桌面浮动）
async function toggleBoxDisplayMode(idx) {
  const box = config.boxes[idx];
  if (!box) return;
  if (box.onDesktop) {
    // 桌面 → 面板：关闭桌面浮动窗口
    await closeDesktopBox(idx);
    box.displayMode = 'panel';
    await saveConfig();
    render(document.getElementById('search-input').value);
    showToast(`「${box.name}」已切换为面板模式`);
  } else {
    // 面板 → 桌面：打开桌面浮动窗口
    await openDesktopBox(idx);
    box.displayMode = 'desktop';
    await saveConfig();
    render(document.getElementById('search-input').value);
    showToast(`「${box.name}」已切换为桌面模式`);
  }
  window.api.logActivity('rename', `「${box.name}」显示模式已切换`);
}

// --- 右键菜单 ---
let contextTarget = null;

function bindContextMenu() {
  document.addEventListener('click', () => hideContextMenu());
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('.shortcut-card') && !e.target.closest('.box-header')) hideContextMenu();
  });
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
        return;
      }
      // F-30: 收纳盒标题栏右键 → 排序 + 显示模式菜单
      const boxHeader = e.target.closest('.box-header');
      if (boxHeader) {
        showBoxHeaderMenu(e, parseInt(boxHeader.dataset.boxIndex));
      }
    });
  }

  // F-30: 收纳盒标题栏菜单事件绑定
  const boxHeaderMenu = document.getElementById('box-header-menu');
  if (boxHeaderMenu) {
    boxHeaderMenu.addEventListener('click', (e) => {
      const sortItem = e.target.closest('[data-sort]');
      if (sortItem) {
        const mode = sortItem.dataset.sort;
        if (boxHeaderMenu._targetBoxIdx != null) {
          sortBox(boxHeaderMenu._targetBoxIdx, mode);
        }
        hideBoxHeaderMenu();
        return;
      }
      const actionItem = e.target.closest('[data-box-action]');
      if (actionItem) {
        const action = actionItem.dataset.boxAction;
        if (action === 'toggle-display' && boxHeaderMenu._targetBoxIdx != null) {
          toggleBoxDisplayMode(boxHeaderMenu._targetBoxIdx);
        }
        hideBoxHeaderMenu();
      }
    });
  }
}

// F-30: 显示收纳盒标题栏右键菜单
function showBoxHeaderMenu(e, boxIdx) {
  e.preventDefault();
  e.stopPropagation();
  const box = config.boxes[boxIdx];
  if (!box) return;
  const menu = document.getElementById('box-header-menu');
  menu._targetBoxIdx = boxIdx;
  menu.style.display = 'block';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  // 高亮当前排序模式
  menu.querySelectorAll('[data-sort]').forEach(item => {
    item.classList.toggle('active', item.dataset.sort === (box.sortMode || 'manual'));
  });
}

function hideBoxHeaderMenu() {
  const menu = document.getElementById('box-header-menu');
  if (menu) menu.style.display = 'none';
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
  hideBoxHeaderMenu();
  contextTarget = null;
}

async function handleContextAction(action) {
  if (!contextTarget) return;
  const { path, source, targetPath, url } = contextTarget;
  switch (action) {
    case 'open': {
      hideContextMenu();
      const res = await openShortcutTracked(path, targetPath, url);
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
  // F-06a: 保存撤销快照
  await window.api.saveUndoSnapshot('move');
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
  // F-06a: 保存撤销快照
  await window.api.saveUndoSnapshot('move');
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

// --- F-30: 打开快捷方式并记录最近使用时间 ---
async function openShortcutTracked(path, targetPath, url) {
  const res = await window.api.openShortcut(path, targetPath, url);
  // 更新最近使用时间（用于 "最近使用" 排序模式）
  const now = Date.now();
  for (const box of config.boxes) {
    const item = box.items.find(i => i.path === path);
    if (item) { item.lastUsedTime = now; await saveConfig(); break; }
  }
  const unItem = config.unassigned.find(i => i.path === path);
  if (unItem) { unItem.lastUsedTime = now; await saveConfig(); }
  return res;
}

// --- 工具栏 ---
function bindToolbar() {
  document.getElementById('btn-refresh').addEventListener('click', async () => {
    showToast('正在刷新...');
    await refreshShortcuts();
    render(document.getElementById('search-input').value);
    showToast('刷新完成');
  });
  // F-18: 搜索 debounce 200ms
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => render(e.target.value), 200);
  });
  document.getElementById('btn-quick-organize').addEventListener('click', () => quickOrganize());
  // F-06a: 撤销按钮
  document.getElementById('btn-undo').addEventListener('click', () => undoAction());
  // F-29: 导入/导出按钮
  document.getElementById('btn-export').addEventListener('click', () => exportConfig());
  document.getElementById('btn-import').addEventListener('click', () => importConfig());
  // F-31: 批量操作按钮
  document.getElementById('btn-batch').addEventListener('click', () => toggleBatchMode());
  document.getElementById('btn-batch-move').addEventListener('click', () => batchMoveToBox());
  document.getElementById('btn-batch-remove').addEventListener('click', () => batchRemoveFromBox());
  document.getElementById('btn-batch-cancel').addEventListener('click', () => toggleBatchMode());
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
    document.querySelector('.tone-opt[data-color="#4a90d9"]').classList.add('selected');
    document.querySelectorAll('.mode-opt').forEach(o => o.classList.remove('selected'));
    document.querySelector('.mode-opt[data-mode="panel"]').classList.add('selected');
    selectedIcon = '📁'; selectedColor = '#4a90d9'; selectedMode = 'panel';
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

  document.getElementById('modal-create-confirm').addEventListener('click', async () => {
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
      displayMode: selectedMode,
      sortMode: 'manual',
      sortOrder: [],
      desktopPos: { x: 100 + (config.boxes.length * 30) % 300, y: 100 + (config.boxes.length * 30) % 200 },
      desktopSize: { width: 260, height: 320 },
      createdTime: Date.now()
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

  inputName.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('modal-create-confirm').click(); });
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

    // 内存使用
    if (sysInfo.memTotal > 0) {
      const memPercent = Math.round((sysInfo.memUsed / sysInfo.memTotal) * 100);
      document.getElementById('status-mem').textContent = `💾 ${memPercent}%`;
      document.getElementById('status-mem').title = `内存: ${formatBytes(sysInfo.memUsed)} / ${formatBytes(sysInfo.memTotal)}`;
    }

    // CPU 使用率
    const cpuEl = document.getElementById('status-cpu');
    if (cpuEl && sysInfo.cpuUsage >= 0) {
      cpuEl.textContent = `🖥 ${sysInfo.cpuUsage}%`;
      cpuEl.title = `CPU: ${sysInfo.cpuModel} (${sysInfo.cpuCores} 核)`;
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

    let resolved = false;
    const cleanup = (result) => {
      if (resolved) return;
      resolved = true;
      modal.style.display = 'none';
      document.getElementById('confirm-ok').removeEventListener('click', onOk);
      document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
      document.getElementById('confirm-close').removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlayClick);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onOverlayClick = (e) => { if (e.target === modal) onCancel(); };
    document.getElementById('confirm-ok').addEventListener('click', onOk);
    document.getElementById('confirm-cancel').addEventListener('click', onCancel);
    document.getElementById('confirm-close').addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlayClick);
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
  config = await window.api.loadConfig();
  invalidateRenderCache();

  // 存储候选建议供渲染使用
  organizeCandidates = result.candidates || [];

  render(document.getElementById('search-input').value);

  const boxCount = config.boxes.length;
  const skipped = result.skipped || 0;
  if (result.moved > 0 && organizeCandidates.length > 0) {
    showToast(`快速整理完成：已归类 ${result.moved} 个项目到 ${boxCount} 个盒子，${organizeCandidates.length} 个待确认` + (skipped > 0 ? `，跳过 ${skipped} 个模糊匹配项` : ''));
  } else if (result.moved > 0) {
    showToast(`快速整理完成：已归类 ${result.moved} 个项目到 ${boxCount} 个盒子` + (skipped > 0 ? `，跳过 ${skipped} 个模糊匹配项` : ''));
  } else if (organizeCandidates.length > 0) {
    showToast(`${organizeCandidates.length} 个候选项待确认` + (skipped > 0 ? `，跳过 ${skipped} 个模糊匹配项` : ''));
  } else {
    showToast('没有可自动归类的快捷方式');
  }
}

// 确认候选建议：将候选项归入建议的盒子
async function confirmCandidate(itemPath) {
  const idx = organizeCandidates.findIndex(c => c.item.path === itemPath);
  if (idx < 0) return;
  const candidate = organizeCandidates[idx];
  const boxIdx = candidate.boxIdx;

  // 从 unassigned 中移除并归入盒子
  const itemIdx = config.unassigned.findIndex(i => i.path === itemPath);
  if (itemIdx >= 0) {
    const item = config.unassigned.splice(itemIdx, 1)[0];
    config.boxes[boxIdx].items.push(item);
    await saveConfig();
    organizeCandidates.splice(idx, 1);
    invalidateRenderCache();
    render(document.getElementById('search-input').value);
    showToast(`已将「${item.name}」归入「${config.boxes[boxIdx].name}」`);
    window.api.logActivity('move', `「${item.name}」归入「${config.boxes[boxIdx].name}」（候选确认）`);
  }
}

// 忽略候选建议：保留在未分类区
function dismissCandidate(itemPath) {
  organizeCandidates = organizeCandidates.filter(c => c.item.path !== itemPath);
  render(document.getElementById('search-input').value);
}

// --- F-06a: 撤销操作 ---
async function undoAction() {
  const result = await window.api.undo();
  if (result.ok) {
    config = await window.api.loadConfig();
    invalidateRenderCache();
    render(document.getElementById('search-input').value);
    showToast('已撤销上一步操作');
  } else {
    showToast(result.error || '无法撤销');
  }
}

// --- F-29: 配置导入/导出 ---
async function exportConfig() {
  showToast('正在导出...');
  const result = await window.api.exportConfig();
  if (result.ok) {
    showToast('配置已导出');
  } else if (result.error) {
    showToast('导出失败: ' + result.error);
  }
}

async function importConfig() {
  showToast('正在导入...');
  const result = await window.api.importConfig();
  if (result.ok) {
    config = await window.api.loadConfig();
    invalidateRenderCache();
    render(document.getElementById('search-input').value);
    showToast(`导入完成，新增 ${result.imported} 个收纳盒`);
  } else if (result.error) {
    showToast('导入失败: ' + result.error);
  }
}

// --- F-31: 批量操作 ---
function toggleBatchMode() {
  batchMode = !batchMode;
  selectedItems.clear();
  const batchBar = document.getElementById('batch-bar');
  const batchBtn = document.getElementById('btn-batch');
  if (batchBar) batchBar.style.display = batchMode ? 'flex' : 'none';
  if (batchBtn) batchBtn.classList.toggle('active', batchMode);
  updateBatchCount();
  render(document.getElementById('search-input').value);
}

function updateBatchCount() {
  const countEl = document.getElementById('batch-count');
  if (countEl) countEl.textContent = `已选 ${selectedItems.size} 项`;
  const moveBtn = document.getElementById('btn-batch-move');
  if (moveBtn) moveBtn.disabled = selectedItems.size === 0;
  // 检查选中项是否有来自盒子的（有则启用移出按钮）
  const hasBoxItems = [...selectedItems].some(p => {
    for (const box of config.boxes) {
      if (box.items.find(i => i.path === p)) return true;
    }
    return false;
  });
  const removeBtn = document.getElementById('btn-batch-remove');
  if (removeBtn) removeBtn.disabled = selectedItems.size === 0 || !hasBoxItems;
}

function toggleItemSelection(path) {
  if (selectedItems.has(path)) selectedItems.delete(path);
  else selectedItems.add(path);
  updateBatchCount();
  // 更新卡片选中状态
  const card = document.querySelector(`.shortcut-card[data-path="${CSS.escape(path)}"]`);
  if (card) card.classList.toggle('selected', selectedItems.has(path));
}

async function batchMoveToBox() {
  if (selectedItems.size === 0) return;
  if (config.boxes.length === 0) { showToast('请先创建收纳盒'); return; }

  // 弹出盒子选择菜单
  const moveMenu = document.getElementById('move-menu');
  moveMenu.innerHTML = config.boxes.map((box, idx) => `
    <div class="ctx-item" data-batch-move-to="${idx}">${box.icon} ${escapeHtml(box.name)}</div>
  `).join('');
  moveMenu.style.display = 'block';

  // 定位到批量操作按钮附近
  const batchBar = document.getElementById('batch-bar');
  const rect = batchBar ? batchBar.getBoundingClientRect() : { left: 100, top: 100 };
  moveMenu.style.left = rect.left + 'px';
  moveMenu.style.top = (rect.top - moveMenu.offsetHeight - 5) + 'px';

  // 绑定选择事件
  const handleSelect = async (e) => {
    const option = e.target.closest('[data-batch-move-to]');
    if (!option) return;
    moveMenu.style.display = 'none';
    moveMenu.removeEventListener('click', handleSelect);
    document.removeEventListener('click', handleOutside);

    const boxIdx = parseInt(option.dataset.batchMoveTo);
    const targetBox = config.boxes[boxIdx];
    // F-06a: 保存撤销快照
    await window.api.saveUndoSnapshot('move');
    let moved = 0;
    for (const path of selectedItems) {
      const idx = config.unassigned.findIndex(i => i.path === path);
      if (idx >= 0) {
        targetBox.items.push(config.unassigned.splice(idx, 1)[0]);
        moved++;
      } else {
        for (const box of config.boxes) {
          const bIdx = box.items.findIndex(i => i.path === path);
          if (bIdx >= 0) {
            targetBox.items.push(box.items.splice(bIdx, 1)[0]);
            moved++;
            break;
          }
        }
      }
    }
    if (moved > 0) {
      await saveConfig();
      toggleBatchMode();
      render(document.getElementById('search-input').value);
      showToast(`批量移动 ${moved} 个图标到「${targetBox.name}」`);
      window.api.logActivity('move', `批量移动 ${moved} 个图标到「${targetBox.name}」`);
    }
  };

  const handleOutside = (e) => {
    if (!moveMenu.contains(e.target)) {
      moveMenu.style.display = 'none';
      moveMenu.removeEventListener('click', handleSelect);
      document.removeEventListener('click', handleOutside);
    }
  };

  moveMenu.addEventListener('click', handleSelect);
  setTimeout(() => document.addEventListener('click', handleOutside), 0);
}

// F-31: 批量从盒子移出到未分类
async function batchRemoveFromBox() {
  if (selectedItems.size === 0) return;
  // F-06a: 保存撤销快照
  await window.api.saveUndoSnapshot('move');
  let removed = 0;
  for (const path of selectedItems) {
    for (const box of config.boxes) {
      const idx = box.items.findIndex(i => i.path === path);
      if (idx >= 0) {
        const item = box.items.splice(idx, 1)[0];
        config.unassigned.push(item);
        removed++;
        break;
      }
    }
  }
  if (removed > 0) {
    await saveConfig();
    toggleBatchMode();
    render(document.getElementById('search-input').value);
    showToast(`批量移出 ${removed} 个图标到未分类`);
    window.api.logActivity('move', `批量移出 ${removed} 个图标到未分类`);
  }
}

// --- F-30: 排序功能 ---
async function sortBox(boxIdx, mode) {
  const box = config.boxes[boxIdx];
  if (!box) return;
  // 切换到非手动排序前，保存当前顺序作为 sortOrder（用于恢复手动排序）
  if (box.sortMode === 'manual' && mode !== 'manual') {
    box.sortOrder = box.items.map(item => item.path);
  }
  box.sortMode = mode;
  switch (mode) {
    case 'alpha':
      box.items.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
      break;
    case 'createTime':
      box.items.sort((a, b) => (a.createdTime || 0) - (b.createdTime || 0));
      break;
    case 'recent':
      // 按最近使用时间排序（记录最近打开时间，新打开的排在前面）
      box.items.sort((a, b) => (b.lastUsedTime || 0) - (a.lastUsedTime || 0));
      break;
    case 'manual':
    default:
      // 恢复 sortOrder 中保存的顺序
      if (box.sortOrder && box.sortOrder.length > 0) {
        const pathOrder = new Map(box.sortOrder.map((path, i) => [path, i]));
        box.items.sort((a, b) => (pathOrder.get(a.path) ?? Infinity) - (pathOrder.get(b.path) ?? Infinity));
      }
      break;
  }
  await saveConfig();
  render(document.getElementById('search-input').value);
  showToast(`已切换为${mode === 'alpha' ? '字母序' : mode === 'createTime' ? '创建时间' : mode === 'recent' ? '最近使用' : '手动'}排序`);
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

    // 填充应用版本号
    try {
      const version = await window.api.getAppVersion();
      document.getElementById('info-version').textContent = version;
    } catch (e) {}

    // 填充统计信息
    const totalItems = config.boxes.reduce((sum, b) => sum + b.items.length, 0) + config.unassigned.length;
    const classifiedCount = config.boxes.reduce((sum, b) => sum + b.items.length, 0);
    document.getElementById('info-box-count').textContent = config.boxes.length;
    document.getElementById('info-classified-count').textContent = classifiedCount;
    document.getElementById('info-unassigned-count').textContent = config.unassigned.length;

    // 填充隐藏开关状态
    const hideToggle = document.getElementById('btn-hide-icons');
    try {
      const status = await window.api.getHideStatus();
      hideToggle.classList.toggle('active', status.hideCollectedIcons);
      document.getElementById('info-hidden-count').textContent = status.hiddenCount || 0;
    } catch (e) {
      hideToggle.classList.remove('active');
      document.getElementById('info-hidden-count').textContent = 0;
    }

    // 填充存储路径信息
    try {
      const paths = await window.api.getStoragePaths();
      document.getElementById('info-data-dir').textContent = paths.dataDir || '--';
      document.getElementById('info-data-dir').title = paths.dataDir || '';
      document.getElementById('info-icon-cache-dir').textContent = paths.iconCacheDir || '--';
      document.getElementById('info-icon-cache-dir').title = paths.iconCacheDir || '';
    } catch (e) {}

    modal.style.display = 'flex';
  });

  // 隐藏/显示已收纳桌面图标 toggle
  const hideToggle = document.getElementById('btn-hide-icons');
  hideToggle.addEventListener('click', async () => {
    const isActive = hideToggle.classList.contains('active');
    const newHide = !isActive;

    hideToggle.disabled = true;
    hideToggle.style.opacity = '0.5';

    try {
      const result = await window.api.toggleHideIcons(newHide);
      if (result.ok) {
        hideToggle.classList.toggle('active', newHide);
        // 只更新隐藏计数，面板和浮动窗口数据不变
        const status = await window.api.getHideStatus();
        document.getElementById('info-hidden-count').textContent = status.hiddenCount || 0;
        if (newHide) {
          showToast(`已隐藏 ${result.count} 个桌面图标`);
          // F-19: 公共桌面权限不足时提示用户提权
          if (result.permissionErrors && result.permissionErrors.length > 0) {
            const needsAdmin = await showConfirm(
              '需要管理员权限',
              `${result.permissionErrors.length} 个公共桌面图标因权限不足无法隐藏。\n是否以管理员身份重启应用？`
            );
            if (needsAdmin) {
              await window.api.restartAsAdmin();
            } else {
              showToast('公共桌面操作已跳过');
            }
          }
        } else {
          showToast(`已恢复 ${result.count} 个桌面图标`);
        }
      } else {
        showToast('操作失败，请重试');
      }
    } catch (e) {
      showToast('操作失败: ' + e.message);
    } finally {
      hideToggle.disabled = false;
      hideToggle.style.opacity = '';
    }
  });

  async function closeModal() {
    modal.style.display = 'none';
    // 重新加载配置，确保渲染器内存与磁盘一致（设置中可能修改了 hiddenItems 等字段）
    await loadData();
    render(document.getElementById('search-input').value);
  }

  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  saveBtn.addEventListener('click', () => {
    closeModal();
    showToast('设置已保存');
  });

  // 打开文件夹按钮
  document.querySelectorAll('.btn-open-folder').forEach(btn => {
    btn.addEventListener('click', async () => {
      const folderType = btn.dataset.folder;
      try {
        const paths = await window.api.getStoragePaths();
        const folderPath = folderType === 'data' ? paths.dataDir : paths.iconCacheDir;
        if (folderPath) {
          const res = await window.api.openFolder(folderPath);
          if (res && !res.ok) showToast('打开失败: ' + res.error);
        }
      } catch (e) {
        showToast('打开失败: ' + e.message);
      }
    });
  });

  // 重置图标缓存（暂时隐藏，元素不存在时跳过）
  const resetCachesBtn = document.getElementById('btn-reset-caches');
  if (resetCachesBtn) {
    resetCachesBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm('重置缓存', '确定要清除所有图标缓存吗？\n首次加载会稍慢，图标将重新提取。');
      if (!confirmed) return;
      try {
        const res = await window.api.resetCaches();
        if (res && res.ok) {
          iconCache = {};
          await refreshShortcuts();
          render(document.getElementById('search-input').value);
          showToast('缓存已重置，图标重新提取中...');
        }
      } catch (e) {
        showToast('重置失败: ' + e.message);
      }
    });
  }

  browseBtn.addEventListener('click', async () => {
    const folder = await window.api.pickFolder();
    if (folder) {
      pathInput.value = folder;
      showToast('桌面路径已更新');
    }
  });

  // F-34: 清理无效快捷方式
  const cleanupBtn = document.getElementById('btn-cleanup-invalid');
  if (cleanupBtn) {
    cleanupBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm('清理无效快捷方式', '确定要移除所有目标不存在的快捷方式吗？');
      if (!confirmed) return;
      try {
        const result = await window.api.cleanupInvalidShortcuts();
        if (result && result.removed > 0) {
          config = await window.api.loadConfig();
          render(document.getElementById('search-input').value);
          showToast(`已清理 ${result.removed} 个无效快捷方式`);
        } else {
          showToast('没有需要清理的无效快捷方式');
        }
      } catch (e) {
        showToast('清理失败: ' + e.message);
      }
    });
  }
}

// --- P2: 活动日志面板 (D04) ---
function bindActivityLogModal() {
  const modal = document.getElementById('modal-activity-log');
  const closeBtn = document.getElementById('modal-log-close');
  const closeBtn2 = document.getElementById('modal-log-close-btn');
  const clearBtn = document.getElementById('btn-clear-log');
  const exportBtn = document.getElementById('btn-export-log');

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

  // F-21: 导出活动日志
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const result = await window.api.exportActivityLog();
      if (result && result.ok) {
        showToast('活动日志已导出');
      } else if (result && result.error) {
        showToast('导出失败: ' + result.error);
      }
    });
  }
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

// §12.2: 配置损坏通知（PRD §12.2: Toast 中的'从备份恢复'为可点击链接）
function bindConfigCorruptedListener() {
  window.api.onConfigCorrupted(({ backupPath }) => {
    if (backupPath) {
      showToast(`⚠️ 配置文件已损坏，已重置。点击<a href="#" onclick="restoreFromBackup('${backupPath.replace(/\\/g, '\\\\')}')" style="color:#6cb4ee;text-decoration:underline;">从备份恢复</a>`);
    } else {
      showToast('⚠️ 配置文件已损坏，已重置为默认配置');
    }
  });
}

// PRD §12.2: 从 .bak 文件恢复配置
window.restoreFromBackup = async function(backupPath) {
  if (!backupPath) return;
  try {
    const result = await window.api.restoreFromBackup(backupPath);
    if (result.ok) {
      showToast('正在从备份恢复并重启...');
    } else {
      showToast('恢复失败: ' + (result.error || '未知错误'));
    }
  } catch (e) {
    showToast('恢复失败: ' + e.message);
  }
};

// PRD §12.2: 配置保存失败通知
function bindConfigSaveFailedListener() {
  window.api.onConfigSaveFailed(({ error }) => {
    showToast(`⚠️ 配置保存失败，请检查是否有其他程序占用: ${error || '未知错误'}`);
  });
}

// PRD §12.3: PowerShell 不可用通知
function bindPowershellUnavailableListener() {
  window.api.onPowershellUnavailable(() => {
    showToast('⚠️ 此应用需要 PowerShell 支持，请联系系统管理员', 8000);
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
    // F-06a: Ctrl+Z 撤销
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undoAction();
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
      // 如果确认对话框打开，点击取消
      const confirmModal = document.getElementById('modal-confirm');
      if (confirmModal.style.display === 'flex') {
        document.getElementById('confirm-cancel').click();
        return;
      }
      // 关闭其他模态框
      document.querySelectorAll('.modal-overlay').forEach(m => {
        if (m !== confirmModal && m.style.display === 'flex') m.style.display = 'none';
      });
      hideContextMenu();
    }
  });
}

init();
