// 桌面浮动收纳盒 - 渲染进程

let boxData = null;
let dragItem = null;

async function init() {
  boxData = await window.boxApi.getBoxData();
  if (!boxData) return;

  renderBox();
  bindEvents();
  listenUpdates();
}

function renderBox() {
  if (!boxData) return;
  const emoji = document.getElementById('box-emoji');
  const label = document.getElementById('box-label');
  const count = document.getElementById('box-count');
  const glassBox = document.getElementById('glass-box');

  emoji.textContent = boxData.icon || '📁';
  label.textContent = boxData.name || '收纳盒';
  count.textContent = boxData.items ? boxData.items.length : 0;

  // 设置颜色条
  const color = boxData.color || '#6c5ce7';
  glassBox.style.borderTop = `3px solid ${color}`;

  // 折叠状态
  glassBox.classList.toggle('collapsed', !!boxData.collapsed);

  renderItems();
}

function renderItems() {
  const container = document.getElementById('box-items');
  const hint = document.getElementById('drop-hint');
  const items = boxData.items || [];

  if (items.length === 0) {
    container.innerHTML = '<div class="drop-zone" id="drop-hint"><span class="drop-text">拖入图标</span></div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="shortcut-card" draggable="true"
         data-path="${escapeAttr(item.path)}"
         data-name="${escapeAttr(item.name)}"
         data-target="${escapeAttr(item.targetPath || '')}"
         data-url="${escapeAttr(item.url || '')}">
      <div class="shortcut-icon">${getIconHtml(item)}</div>
      <div class="shortcut-name" title="${escapeAttr(item.name)}">${escapeHtml(item.name)}</div>
    </div>
  `).join('');

  // 绑定事件
  container.querySelectorAll('.shortcut-card').forEach(card => {
    card.addEventListener('dblclick', () => {
      window.boxApi.openShortcut(card.dataset.path, card.dataset.target, card.dataset.url);
    });

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, card.dataset.path, card.dataset.name);
    });

    card.addEventListener('dragstart', (e) => {
      dragItem = card.dataset.path;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      // 设置拖拽数据
      e.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'box-item',
        boxId: boxData.id,
        itemPath: card.dataset.path,
        itemName: card.dataset.name
      }));
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragItem = null;
    });
  });
}

function getIconHtml(item) {
  const fallback = item.type === 'url' ? '🌐' : '📄';
  const onerror = `this.onerror=null;this.parentElement.textContent='${fallback}'`;
  if (item.iconData) {
    return `<img src="data:image/png;base64,${item.iconData}" alt="${escapeAttr(item.name)}" onerror="${onerror}" />`;
  }
  return fallback;
}

function bindEvents() {
  const glassBox = document.getElementById('glass-box');
  const titlebar = document.getElementById('box-titlebar');

  // 折叠按钮
  document.getElementById('btn-collapse').addEventListener('click', () => {
    window.boxApi.toggleCollapse();
  });

  // 关闭按钮 - 关闭桌面浮动窗口（不删除收纳盒）
  document.getElementById('btn-close-box').addEventListener('click', () => {
    window.boxApi.close();
  });

  // 拖放接收
  glassBox.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    glassBox.classList.add('drag-over');
  });

  glassBox.addEventListener('dragleave', (e) => {
    if (!glassBox.contains(e.relatedTarget)) {
      glassBox.classList.remove('drag-over');
    }
  });

  glassBox.addEventListener('drop', async (e) => {
    e.preventDefault();
    glassBox.classList.remove('drag-over');

    // 尝试从主窗口拖来的数据
    const textData = e.dataTransfer.getData('text/plain');
    if (textData) {
      try {
        const data = JSON.parse(textData);
        if (data.type === 'shortcut-item') {
          // 从主窗口拖入的快捷方式
          await window.boxApi.addItem(data);
          return;
        }
        if (data.type === 'box-item' && data.boxId !== boxData.id) {
          // 从其他桌面收纳盒拖入
          await window.boxApi.addItem(data);
          return;
        }
      } catch (err) {}
    }

    // 从系统文件管理器拖入的文件
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const paths = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.path && (f.path.endsWith('.lnk') || f.path.endsWith('.url'))) {
          paths.push(f.path);
        }
      }
      if (paths.length > 0) {
        await window.boxApi.addItem({ type: 'file-drop', paths });
      }
    }
  });

  // 点击空白关闭右键菜单
  document.addEventListener('click', () => hideContextMenu());
}

let dataUpdateCleanup = null;
function listenUpdates() {
  if (dataUpdateCleanup) dataUpdateCleanup();
  dataUpdateCleanup = window.boxApi.onDataUpdate((data) => {
    boxData = data;
    renderBox();
  });
}

// --- 右键菜单 ---
let contextTarget = null;

function showContextMenu(e, itemPath, itemName) {
  const card = e.target.closest('.shortcut-card');
  const targetPath = card ? card.dataset.target : '';
  const url = card ? card.dataset.url : '';
  contextTarget = { path: itemPath, name: itemName, targetPath, url };

  let menu = document.querySelector('.ctx-menu');
  if (!menu) {
    menu = document.createElement('div');
    menu.className = 'ctx-menu';
    document.body.appendChild(menu);
  }

  menu.innerHTML = `
    <div class="ctx-item" data-action="open">打开</div>
    <div class="ctx-item" data-action="explorer">打开文件位置</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="restore">还原到桌面</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item ctx-danger" data-action="remove">移出收纳盒</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item" data-action="reset-pos">重置位置</div>
  `;
  menu.style.display = 'block';
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';

  menu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const itemPath = contextTarget ? contextTarget.path : null;
      const targetPath = contextTarget ? contextTarget.targetPath : '';
      const url = contextTarget ? contextTarget.url : '';
      hideContextMenu();
      if (!itemPath) return;
      if (action === 'open') {
        const res = await window.boxApi.openShortcut(itemPath, targetPath, url);
        if (res && !res.ok) console.warn('[box] 打开失败:', res.error);
      } else if (action === 'explorer') {
        const res = await window.boxApi.openInExplorer(itemPath, targetPath);
        if (res && !res.ok) console.warn('[box] 定位失败:', res.error);
      } else if (action === 'restore') {
        // 还原到桌面
        const itemData = boxData.items.find(i => i.path === itemPath);
        if (itemData) {
          const res = await window.boxApi.restoreSingle(itemData);
          if (res && res.ok) {
            // 数据会通过 onDataUpdate 自动刷新
          } else if (res && !res.ok) {
            console.warn('[box] 还原失败:', res.error);
          }
        }
      } else if (action === 'remove') {
        await window.boxApi.removeItem(itemPath);
      } else if (action === 'reset-pos') {
        await window.boxApi.resetPosition();
      }
    });
  });
}

function hideContextMenu() {
  const menu = document.querySelector('.ctx-menu');
  if (menu) menu.style.display = 'none';
  contextTarget = null;
}

// escapeHtml, escapeAttr 已在 utils.js 中定义

// --- 启动 ---
init();
