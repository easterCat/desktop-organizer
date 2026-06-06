const { app, BrowserWindow, ipcMain, shell, screen, Tray, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, execFile } = require('child_process');

let DATA_DIR, CONFIG_FILE, LOG_FILE, APP_LOG_FILE, BACKUP_DIR;
let mainWindow;

// 应用日志系统 (CODE-02)
function appLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${args.join(' ')}\n`;
  if (level === 'ERROR') console.error(line.trim());
  else if (level === 'WARN') console.warn(line.trim());
  else console.log(line.trim());
  try {
    if (APP_LOG_FILE) fs.appendFileSync(APP_LOG_FILE, line);
  } catch (_) {}
}

// 桌面浮动窗口管理 { boxId: BrowserWindow }
const desktopBoxes = new Map();

const PS_DIR = path.join(__dirname, 'ps');

// 图标缓存（内存 + 磁盘）
const iconCache = new Map();
let ICON_CACHE_DIR;

// 系统托盘
let tray = null;

// 活动日志
let activityLog = [];
const MAX_LOG_ENTRIES = 200;

function addActivity(type, message, detail = '') {
  const entry = {
    time: Date.now(),
    type,      // 'move', 'create', 'delete', 'rename', 'organize', 'system'
    message,
    detail
  };
  activityLog.unshift(entry);
  if (activityLog.length > MAX_LOG_ENTRIES) activityLog.pop();
  // 持久化日志
  try {
    fs.ensureDirSync(DATA_DIR);
    fs.writeJsonSync(LOG_FILE, activityLog, { spaces: 0 });
  } catch (e) {}
  // 通知渲染进程
  notifyMainWindow('activity-updated', entry);
}

function loadActivityLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      activityLog = fs.readJsonSync(LOG_FILE);
      if (!Array.isArray(activityLog)) activityLog = [];
    }
  } catch (e) {
    activityLog = [];
  }
}

// 获取系统信息（磁盘使用率、内存）
function getSystemInfo() {
  const info = { diskTotal: 0, diskFree: 0, diskUsed: 0, memTotal: 0, memFree: 0, memUsed: 0, cpuModel: '', cpuCores: 0 };

  // 内存信息
  info.memTotal = os.totalmem();
  info.memFree = os.freemem();
  info.memUsed = info.memTotal - info.memFree;

  // CPU 信息
  const cpus = os.cpus();
  info.cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';
  info.cpuCores = cpus.length;

  // 磁盘信息（桌面所在盘符）
  try {
    const desktopPath = getDesktopPath();
    const driveLetter = path.parse(desktopPath).root; // e.g. "C:\\"
    const result = execFileSync('wmic', ['logicaldisk', 'where', `DeviceID='${driveLetter.replace('\\', '').replace(':', '')}'`, 'get', 'FreeSpace,Size', '/format:csv'], { encoding: 'utf-8', timeout: 5000 }).trim();
    const lines = result.split('\n').filter(l => l.trim() && !l.startsWith('Node'));
    if (lines.length > 0) {
      const parts = lines[lines.length - 1].split(',');
      if (parts.length >= 3) {
        info.diskFree = parseInt(parts[1]) || 0;
        info.diskTotal = parseInt(parts[2]) || 0;
        info.diskUsed = info.diskTotal - info.diskFree;
      }
    }
  } catch (e) {
    // fallback: 使用 PowerShell
    try {
      const desktopPath = getDesktopPath();
      const drive = path.parse(desktopPath).root.replace('\\', '');
      const psResult = execFileSync('powershell', ['-NoProfile', '-Command', `Get-PSDrive ${drive} | Select-Object Used,Free | ConvertTo-Json`], { encoding: 'utf-8', timeout: 5000 }).trim();
      const psData = JSON.parse(psResult);
      info.diskUsed = psData.Used || 0;
      info.diskFree = psData.Free || 0;
      info.diskTotal = info.diskUsed + info.diskFree;
    } catch (e2) {}
  }

  return info;
}

// 快速整理：将未分类的快捷方式按名称关键词自动归入已有收纳盒
function quickOrganize() {
  const config = loadConfig();
  if (config.boxes.length === 0 || config.unassigned.length === 0) return { moved: 0 };

  let moved = 0;
  const remaining = [];

  for (const item of config.unassigned) {
    let matched = false;
    const nameLower = item.name.toLowerCase();

    for (const box of config.boxes) {
      const boxNameLower = box.name.toLowerCase();
      // 简单关键词匹配：收纳盒名称包含在快捷方式名称中，或反之
      if (nameLower.includes(boxNameLower) || boxNameLower.includes(nameLower)) {
        box.items.push(item);
        moved++;
        matched = true;
        break;
      }
    }

    if (!matched) remaining.push(item);
  }

  if (moved > 0) {
    config.unassigned = remaining;
    config.lastOrganizeTime = Date.now();
    saveConfig(config);
    addActivity('organize', `快速整理完成，自动归类 ${moved} 个快捷方式`);
  }

  return { moved };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 720,
    minHeight: 500,
    title: '桌面图标收纳盒',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    // 主窗口关闭时同时关闭所有桌面浮动窗口
    for (const [id, win] of desktopBoxes) {
      if (!win.isDestroyed()) win.close();
    }
    desktopBoxes.clear();
  });
}

// --- 配置读写 ---
function loadConfig() {
  fs.ensureDirSync(DATA_DIR);
  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig = { boxes: [], unassigned: [], hideCollectedIcons: true, hiddenItems: [] };
    fs.writeJsonSync(CONFIG_FILE, defaultConfig, { spaces: 2 });
    return defaultConfig;
  }
  try {
    const config = fs.readJsonSync(CONFIG_FILE);
    if (!config.boxes || !Array.isArray(config.boxes)) {
      throw new Error('Invalid config structure');
    }
    // 兼容旧数据：为缺少 id 的 box 生成 id
    let dirty = false;
    for (const box of config.boxes) {
      if (!box.id) {
        box.id = 'box_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        dirty = true;
      }
    }
    // 兼容旧数据：隐藏图标相关字段默认值
    if (typeof config.hideCollectedIcons !== 'boolean') {
      config.hideCollectedIcons = true;
      dirty = true;
    }
    if (!Array.isArray(config.hiddenItems)) {
      config.hiddenItems = [];
      dirty = true;
    }
    if (dirty) saveConfig(config);
    return config;
  } catch (e) {
    console.error('[Config] 配置文件读取失败，已备份并重置:', e.message);
    const backupPath = CONFIG_FILE + '.bak.' + Date.now();
    try { fs.copySync(CONFIG_FILE, backupPath); } catch (_) {}
    const defaultConfig = { boxes: [], unassigned: [], hideCollectedIcons: true, hiddenItems: [] };
    fs.writeJsonSync(CONFIG_FILE, defaultConfig, { spaces: 2 });
    return defaultConfig;
  }
}

function saveConfig(config) {
  fs.ensureDirSync(DATA_DIR);
  const tmpFile = CONFIG_FILE + '.tmp';
  fs.writeJsonSync(tmpFile, config, { spaces: 2 });
  fs.renameSync(tmpFile, CONFIG_FILE);
}

// --- 图标磁盘缓存 (PERF-02) ---
function getIconCacheKey(iconPath) {
  return crypto.createHash('md5').update(iconPath).digest('hex') + '.png';
}

function getCachedIcon(iconPath) {
  if (!ICON_CACHE_DIR) return null;
  const cacheFile = path.join(ICON_CACHE_DIR, getIconCacheKey(iconPath));
  if (!fs.existsSync(cacheFile)) return null;
  try {
    if (!fs.existsSync(iconPath)) return null; // 源文件不存在，缓存无效
    const srcStat = fs.statSync(iconPath);
    const cacheStat = fs.statSync(cacheFile);
    // 以缓存文件的修改时间作为基准，若源文件较新则缓存失效
    if (srcStat.mtimeMs > cacheStat.mtimeMs) return null;
    return fs.readFileSync(cacheFile).toString('base64');
  } catch (e) {
    appLog('WARN', '读取图标缓存失败:', iconPath, e.message);
  }
  return null;
}

function setCachedIcon(iconPath, base64) {
  if (!ICON_CACHE_DIR) return;
  const cacheFile = path.join(ICON_CACHE_DIR, getIconCacheKey(iconPath));
  try {
    // 将 base64 解码后以 PNG 二进制文件写入磁盘，便于备份和浏览
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(cacheFile, buf);
  } catch (e) {
    appLog('WARN', '写入图标缓存失败:', iconPath, e.message);
  }
}

// --- PowerShell ---
function runPSScript(scriptName, args = []) {
  const scriptPath = path.join(PS_DIR, scriptName);
  const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
  for (const a of args) psArgs.push('-Arg', a);
  try {
    return execFileSync('powershell', psArgs, { encoding: 'utf-8', timeout: 10000 }).trim();
  } catch (e) { return ''; }
}

// 异步 PowerShell 调用 (PERF-01)
function runPSScriptAsync(scriptName, args = []) {
  return new Promise((resolve) => {
    const scriptPath = path.join(PS_DIR, scriptName);
    const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    for (const a of args) psArgs.push('-Arg', a);
    execFile('powershell', psArgs, { encoding: 'utf-8', timeout: 10000 }, (err, stdout) => {
      resolve(err ? '' : (stdout || '').trim());
    });
  });
}

// --- 图标提取 ---
function extractIconBase64(iconPath) {
  if (!iconPath) return null;
  // 内存缓存：跳过之前提取失败（null）的条目，允许重试
  if (iconCache.has(iconPath)) {
    const cached = iconCache.get(iconPath);
    if (cached) return cached;
    // null 缓存条目不返回，允许重试提取
  }
  // 磁盘缓存 (PERF-02)
  const diskCached = getCachedIcon(iconPath);
  if (diskCached) { iconCache.set(iconPath, diskCached); return diskCached; }
  if (!fs.existsSync(iconPath)) { iconCache.set(iconPath, null); return null; }
  const result = runPSScript('extract-icon.ps1', [iconPath]);
  const base64 = result || null;
  iconCache.set(iconPath, base64);
  if (base64) setCachedIcon(iconPath, base64);
  return base64;
}

// 并发异步图标提取 (PERF-01)
async function extractIconsConcurrently(shortcuts, concurrency = 4) {
  const queue = shortcuts.filter(sc => sc.iconPath && !sc.iconData && fs.existsSync(sc.iconPath));
  if (queue.length === 0) return;

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const sc = queue.shift();
        if (!sc) break;
        // 内存缓存命中
        if (iconCache.has(sc.iconPath)) {
          sc.iconData = iconCache.get(sc.iconPath);
        } else {
          // 磁盘缓存
          const diskCached = getCachedIcon(sc.iconPath);
          if (diskCached) {
            sc.iconData = diskCached;
            iconCache.set(sc.iconPath, diskCached);
          } else {
            const result = await runPSScriptAsync('extract-icon.ps1', [sc.iconPath]);
            sc.iconData = result || null;
            iconCache.set(sc.iconPath, sc.iconData);
            if (sc.iconData) setCachedIcon(sc.iconPath, sc.iconData);
          }
        }
        // 推送增量更新到渲染进程（包括失败的情况，让渲染器移除 loading 状态）
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('icon-updated', { path: sc.path, iconData: sc.iconData });
        }
      }
    })());
  }
  await Promise.all(workers);
}

function getDesktopPath() {
  return path.join(os.homedir(), 'Desktop');
}

function resolveIconPath(iconLocation, targetPath) {
  if (iconLocation && iconLocation.trim() !== '') {
    const parts = iconLocation.split(',');
    const iconPath = parts[0].trim();
    if (iconPath !== '') return iconPath;
  }
  if (targetPath && fs.existsSync(targetPath)) return targetPath;
  return null;
}

function readDesktopShortcuts() {
  const desktopPath = getDesktopPath();
  const publicDesktop = path.join('C:', 'Users', 'Public', 'Desktop');
  const shortcuts = [];

  for (const dir of [desktopPath, publicDesktop]) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const ext = path.extname(file).toLowerCase();
      if (ext !== '.lnk' && ext !== '.url') continue;
      const fullPath = path.join(dir, file);
      const name = path.basename(file, ext);
      const shortcut = { name, path: fullPath, type: ext === '.lnk' ? 'lnk' : 'url', desktop: dir === desktopPath ? 'user' : 'public', iconData: null };

      if (ext === '.lnk') {
        const parsed = parseLnkFile(fullPath);
        if (parsed) {
          shortcut.targetPath = parsed.targetPath;
          shortcut.workingDir = parsed.workingDir;
          shortcut.arguments = parsed.arguments;
          const iconPath = resolveIconPath(parsed.iconLocation, parsed.targetPath);
          if (iconPath) {
            shortcut.iconPath = iconPath;
            // 同步提取图标（与浮动窗口行为一致，确保图标在首次渲染时就可用）
            shortcut.iconData = extractIconBase64(iconPath);
            // 如果 iconPath 提取失败且 targetPath 不同，尝试从 targetPath 提取
            if (!shortcut.iconData && parsed.targetPath && parsed.targetPath !== iconPath) {
              shortcut.iconData = extractIconBase64(parsed.targetPath);
              if (shortcut.iconData) shortcut.iconPath = parsed.targetPath;
            }
          }
        }
      } else {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const urlMatch = content.match(/URL=(.+)/i);
          const iconMatch = content.match(/IconFile=(.+)/i);
          if (urlMatch) shortcut.url = urlMatch[1].trim();
          if (iconMatch) {
            const iconPath = iconMatch[1].trim();
            if (iconPath) {
              shortcut.iconPath = iconPath;
              shortcut.iconData = extractIconBase64(iconPath);
            }
          }
        } catch (e) {
          appLog('WARN', '解析 .url 文件失败:', fullPath, e.message);
        }
      }
      shortcuts.push(shortcut);
    }
  }
  return shortcuts;
}

function parseLnkFile(lnkPath) {
  try {
    const result = runPSScript('parse-lnk.ps1', [lnkPath]);
    if (!result) return null;
    const [targetPath, iconLocation, workingDir, arguments_] = result.split('|');
    return { targetPath, iconLocation, workingDir, arguments: arguments_ };
  } catch (e) {
    appLog('WARN', '解析 .lnk 文件失败:', lnkPath, e.message);
    return null;
  }
}

// --- 为单个快捷方式补充图标数据 ---
function enrichShortcut(shortcut) {
  if (shortcut.iconData) return shortcut;
  if (shortcut.iconPath) {
    shortcut.iconData = extractIconBase64(shortcut.iconPath);
  }
  return shortcut;
}

// ============ 桌面浮动窗口管理 ============

function createDesktopBox(boxId) {
  // 如果窗口已存在，聚焦
  if (desktopBoxes.has(boxId)) {
    const existing = desktopBoxes.get(boxId);
    if (!existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }
    desktopBoxes.delete(boxId);
  }

  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (!box) return null;

  const pos = box.desktopPos || { x: 100, y: 100 };
  const size = box.desktopSize || { width: 260, height: 320 };

  const win = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
    minWidth: 200,
    minHeight: 80,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: false,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'desktop-box', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'desktop-box', 'index.html'));

  // 保存窗口位置（防抖，PERF-03）
  win.on('moved', () => {
    if (win.isDestroyed()) return;
    debouncedSavePosition(boxId, win.getPosition(), win.getSize());
  });

  win.on('resized', () => {
    if (win.isDestroyed()) return;
    debouncedSavePosition(boxId, win.getPosition(), win.getSize());
  });

  win.on('closed', () => {
    desktopBoxes.delete(boxId);
    // 通知主窗口刷新
    notifyMainWindow('box-updated');
  });

  desktopBoxes.set(boxId, win);
  return win;
}

// 配置保存防抖 (PERF-03)
const saveTimers = new Map();

function debouncedSavePosition(boxId, position, size, delay = 300) {
  if (saveTimers.has(boxId)) clearTimeout(saveTimers.get(boxId));
  saveTimers.set(boxId, setTimeout(() => {
    saveTimers.delete(boxId);
    saveDesktopBoxPosition(boxId, position, size);
  }, delay));
}

function saveDesktopBoxPosition(boxId, position, size) {
  try {
    const config = loadConfig();
    const box = config.boxes.find(b => b.id === boxId);
    if (box) {
      box.desktopPos = { x: position[0], y: position[1] };
      box.desktopSize = { width: size[0], height: size[1] };
      saveConfig(config);
    }
  } catch (e) {
    appLog('ERROR', '保存桌面窗口位置失败:', boxId, e.message);
  }
}

function getBoxData(boxId) {
  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (!box) return null;
  // 补充图标数据
  const items = (box.items || []).map(item => enrichShortcut({ ...item }));
  return { ...box, items };
}

function notifyMainWindow(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function notifyDesktopBox(boxId) {
  const win = desktopBoxes.get(boxId);
  if (win && !win.isDestroyed()) {
    const data = getBoxData(boxId);
    if (data) {
      win.webContents.send('desktop-box:data-updated', data);
    }
  }
}

function notifyAllDesktopBoxes() {
  for (const [boxId] of desktopBoxes) {
    notifyDesktopBox(boxId);
  }
}

// ============ 隐藏/显示已收纳桌面图标 ============

function hideCollectedIconsFn() {
  const config = loadConfig();

  fs.ensureDirSync(BACKUP_DIR);
  let count = 0;
  // 保留已有 hiddenItems，追加新隐藏的项
  const hiddenItems = Array.isArray(config.hiddenItems) ? [...config.hiddenItems] : [];
  const alreadyHidden = new Set(hiddenItems.map(h => h.path));

  // 只移动桌面文件到 backup，不清空 box.items / unassigned（保留面板和浮动窗口中的图标）
  const itemsToHide = [];
  for (const box of config.boxes) {
    for (const item of box.items) itemsToHide.push(item);
  }
  // 未分类面板中的图标也视为已整理，一并隐藏
  for (const item of config.unassigned) itemsToHide.push(item);

  for (const item of itemsToHide) {
    const desktopPath = item.path;
    if (alreadyHidden.has(desktopPath)) continue; // 已在 backup 中，跳过
    if (!fs.existsSync(desktopPath)) continue;

    const fileName = path.basename(desktopPath);
    const backupPath = path.join(BACKUP_DIR, fileName);

    // 避免覆盖 backup 中已有的同名文件（加时间戳后缀）
    let finalBackupPath = backupPath;
    if (fs.existsSync(backupPath)) {
      const ext = path.extname(fileName);
      const base = path.basename(fileName, ext);
      finalBackupPath = path.join(BACKUP_DIR, `${base}_${Date.now()}${ext}`);
    }

    try {
      fs.moveSync(desktopPath, finalBackupPath);
      hiddenItems.push({ path: desktopPath, tempPath: finalBackupPath });
      count++;
    } catch (e) {
      appLog('ERROR', '隐藏图标失败:', desktopPath, e.message);
    }
  }

  config.hiddenItems = hiddenItems;
  config.hideCollectedIcons = true;
  saveConfig(config);

  addActivity('system', `隐藏 ${count} 个已整理的桌面图标`);
  // 不通知 box-updated，因为面板和浮动窗口数据不变

  return { ok: true, count };
}

function showCollectedIconsFn() {
  const config = loadConfig();
  const hiddenItems = Array.isArray(config.hiddenItems) ? config.hiddenItems : [];
  if (hiddenItems.length === 0 && !config.hideCollectedIcons) return { ok: true, count: 0 };

  let count = 0;

  for (const record of hiddenItems) {
    const tempPath = record.tempPath;
    const desktopPath = record.path;

    if (!fs.existsSync(tempPath)) {
      appLog('WARN', '备份文件不存在，无法恢复:', tempPath);
      continue;
    }

    try {
      // 如果桌面上已有同名文件，跳过
      if (fs.existsSync(desktopPath)) {
        appLog('WARN', '桌面已存在同名文件，跳过恢复:', desktopPath);
        continue;
      }

      fs.moveSync(tempPath, desktopPath);
      count++;
    } catch (e) {
      appLog('ERROR', '恢复图标失败:', tempPath, e.message);
    }
  }

  config.hiddenItems = [];
  config.hideCollectedIcons = false;
  saveConfig(config);

  addActivity('system', `恢复 ${count} 个桌面图标`);
  // 不通知 box-updated，因为面板和浮动窗口数据不变

  return { ok: true, count };
}

// ============ IPC Handlers ============

// --- 主窗口 ---
ipcMain.handle('get-shortcuts', async () => {
  const shortcuts = readDesktopShortcuts();
  // 图标已在 readDesktopShortcuts 中同步提取，无需异步提取
  return shortcuts;
});
ipcMain.handle('load-config', async () => loadConfig());
ipcMain.handle('save-config', async (_, config) => {
  // 更新最后整理时间
  config.lastOrganizeTime = config.lastOrganizeTime || Date.now();
  saveConfig(config);
  notifyAllDesktopBoxes();
  return true;
});
ipcMain.handle('open-shortcut', async (_, shortcutPath, targetPath, url) => {
  try {
    // 如果快捷方式文件不存在，检查是否在 hiddenItems 中（被隐藏的图标）
    let effectivePath = shortcutPath;
    if (shortcutPath && !fs.existsSync(shortcutPath)) {
      const config = loadConfig();
      const hidden = (config.hiddenItems || []).find(h => h.path === shortcutPath);
      if (hidden && hidden.tempPath && fs.existsSync(hidden.tempPath)) {
        effectivePath = hidden.tempPath;
      }
    }
    // 1. 尝试打开快捷方式文件本身
    if (effectivePath && fs.existsSync(effectivePath)) {
      const ext = path.extname(shortcutPath).toLowerCase();
      if (ext === '.lnk') {
        execFileSync('cmd', ['/c', 'start', '""', effectivePath], { timeout: 5000 });
      } else {
        const errMsg = await shell.openPath(effectivePath);
        if (errMsg) return { ok: false, error: errMsg };
      }
      return { ok: true };
    }
    // 2. 快捷方式文件不存在，尝试直接打开目标程序
    if (targetPath && fs.existsSync(targetPath)) {
      const errMsg = await shell.openPath(targetPath);
      if (errMsg) return { ok: false, error: errMsg };
      return { ok: true };
    }
    // 3. 尝试打开 URL（.url 类型快捷方式）
    if (url) {
      await shell.openExternal(url);
      return { ok: true };
    }
    console.warn('[open-shortcut] 文件不存在:', shortcutPath);
    return { ok: false, error: '文件不存在: ' + shortcutPath };
  } catch (e) {
    console.error('[open-shortcut] 异常:', e.message);
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('open-in-explorer', async (_, shortcutPath, targetPath) => {
  try {
    // 如果快捷方式文件不存在，检查是否在 hiddenItems 中（被隐藏的图标）
    let effectivePath = shortcutPath;
    if (shortcutPath && !fs.existsSync(shortcutPath)) {
      const config = loadConfig();
      const hidden = (config.hiddenItems || []).find(h => h.path === shortcutPath);
      if (hidden && hidden.tempPath && fs.existsSync(hidden.tempPath)) {
        effectivePath = hidden.tempPath;
      }
    }
    // 1. 尝试定位快捷方式文件
    if (effectivePath && fs.existsSync(effectivePath)) {
      shell.showItemInFolder(effectivePath);
      return { ok: true };
    }
    // 2. 快捷方式文件不存在，尝试定位目标文件
    if (targetPath && fs.existsSync(targetPath)) {
      shell.showItemInFolder(targetPath);
      return { ok: true };
    }
    // 3. 尝试打开快捷方式所在目录
    if (effectivePath) {
      const dir = path.dirname(effectivePath);
      if (fs.existsSync(dir)) {
        shell.showItemInFolder(dir);
        return { ok: true };
      }
    }
    console.warn('[open-in-explorer] 文件不存在:', shortcutPath);
    return { ok: false, error: '文件不存在' };
  } catch (e) {
    console.error('[open-in-explorer] 异常:', e.message);
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('get-desktop-path', async () => getDesktopPath());
ipcMain.handle('window-minimize', () => mainWindow.minimize());

// --- P2: 状态栏 - 系统信息 ---
ipcMain.handle('get-system-info', async () => getSystemInfo());

// --- P2: 设置面板 - 文件夹选择器 ---
ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '选择桌面路径'
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// --- P2: 快速整理 ---
ipcMain.handle('quick-organize', async () => {
  const result = quickOrganize();
  notifyMainWindow('box-updated');
  return result;
});

// --- P2: 活动日志 ---
ipcMain.handle('get-activity-log', async () => activityLog);
ipcMain.handle('clear-activity-log', async () => {
  activityLog = [];
  try { fs.writeJsonSync(LOG_FILE, [], { spaces: 0 }); } catch (e) {}
  return true;
});
ipcMain.handle('log-activity', async (_, type, message, detail) => {
  addActivity(type, message, detail);
  return true;
});
ipcMain.handle('window-maximize', () => { mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize(); });
ipcMain.handle('window-close', () => mainWindow.close());

// --- 重置缓存 ---
ipcMain.handle('reset-caches', async () => {
  // 1. 清空内存缓存
  iconCache.clear();
  // 2. 删除磁盘图标缓存目录并重建
  try {
    fs.removeSync(ICON_CACHE_DIR);
    fs.ensureDirSync(ICON_CACHE_DIR);
  } catch (e) {}
  // 3. 清除 config 中所有 item 的 iconData
  const config = loadConfig();
  for (const box of config.boxes) {
    for (const item of box.items) item.iconData = null;
  }
  for (const item of config.unassigned) item.iconData = null;
  saveConfig(config);
  addActivity('system', '已重置所有图标缓存');
  return { ok: true };
});

// --- 缓存路径信息 ---
ipcMain.handle('get-storage-paths', async () => {
  return {
    dataDir: DATA_DIR,
    iconCacheDir: ICON_CACHE_DIR,
    backupDir: BACKUP_DIR,
    appLog: APP_LOG_FILE
  };
});
ipcMain.handle('open-folder', async (_, folderPath) => {
  try {
    if (fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
      return { ok: true };
    }
    return { ok: false, error: '文件夹不存在' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- 隐藏/显示已收纳桌面图标 ---
ipcMain.handle('toggle-hide-icons', async (_, hide) => {
  if (hide) return hideCollectedIconsFn();
  return showCollectedIconsFn();
});
ipcMain.handle('get-hide-status', async () => {
  const config = loadConfig();
  return { hideCollectedIcons: !!config.hideCollectedIcons, hiddenCount: (config.hiddenItems || []).length };
});

// 创建桌面浮动收纳盒
ipcMain.handle('create-desktop-box', async (_, boxId) => {
  createDesktopBox(boxId);
  // 标记 box 为桌面模式
  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (box) {
    box.onDesktop = true;
    saveConfig(config);
  }
  return true;
});

// 关闭桌面浮动收纳盒（窗口关闭，但不删除数据）
ipcMain.handle('close-desktop-box', async (_, boxId) => {
  const win = desktopBoxes.get(boxId);
  if (win && !win.isDestroyed()) {
    win.close();
  }
  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (box) {
    box.onDesktop = false;
    saveConfig(config);
  }
  return true;
});

// --- 桌面浮动窗口 IPC ---
ipcMain.handle('desktop-box:get-data', async (event) => {
  // 从 event.sender 找到 boxId
  const boxId = findBoxIdByWebContents(event.sender);
  if (!boxId) return null;
  return getBoxData(boxId);
});

ipcMain.handle('desktop-box:remove-item', async (event, itemPath) => {
  const boxId = findBoxIdByWebContents(event.sender);
  if (!boxId) return false;
  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (!box) return false;
  const idx = box.items.findIndex(i => i.path === itemPath);
  if (idx >= 0) {
    const [item] = box.items.splice(idx, 1);
    config.unassigned.push(item);
    saveConfig(config);
    notifyDesktopBox(boxId);
    notifyMainWindow('box-updated');
    addActivity('move', `「${item.name}」从「${box.name}」移回未分类`);
  }
  return true;
});

ipcMain.handle('desktop-box:add-item', async (event, data) => {
  const boxId = findBoxIdByWebContents(event.sender);
  if (!boxId) return false;
  const config = loadConfig();

  if (data.type === 'shortcut-item') {
    // 从主窗口拖入的快捷方式
    const itemPath = data.itemPath;
    // 从 unassigned 或其他 box 中找到 item
    let item = null;
    const unIdx = config.unassigned.findIndex(i => i.path === itemPath);
    if (unIdx >= 0) {
      item = config.unassigned.splice(unIdx, 1)[0];
    } else {
      for (const b of config.boxes) {
        if (b.id === boxId) continue;
        const bIdx = b.items.findIndex(i => i.path === itemPath);
        if (bIdx >= 0) {
          item = b.items.splice(bIdx, 1)[0];
          break;
        }
      }
    }
    if (item) {
      const box = config.boxes.find(b => b.id === boxId);
      if (box) {
        box.items.push(item);
        saveConfig(config);
        notifyDesktopBox(boxId);
        notifyMainWindow('box-updated');
        addActivity('move', `「${item.name}」移入「${box.name}」`);
      }
    }
  } else if (data.type === 'box-item') {
    // 从其他桌面收纳盒拖入
    const srcBoxId = data.boxId;
    const itemPath = data.itemPath;
    const srcBox = config.boxes.find(b => b.id === srcBoxId);
    const destBox = config.boxes.find(b => b.id === boxId);
    if (srcBox && destBox) {
      const idx = srcBox.items.findIndex(i => i.path === itemPath);
      if (idx >= 0) {
        const [item] = srcBox.items.splice(idx, 1);
        destBox.items.push(item);
        saveConfig(config);
        notifyDesktopBox(boxId);
        notifyDesktopBox(srcBoxId);
        notifyMainWindow('box-updated');
        addActivity('move', `「${item.name}」从「${srcBox.name}」移到「${destBox.name}」`);
      }
    }
  } else if (data.type === 'file-drop') {
    // 从系统文件拖入
    const destBox = config.boxes.find(b => b.id === boxId);
    if (destBox) {
      let dropCount = 0;
      for (const filePath of data.paths) {
        // 检查是否已在某个 box 中
        let found = false;
        for (const b of config.boxes) {
          if (b.items.find(i => i.path === filePath)) { found = true; break; }
        }
        if (!found) {
          const unIdx = config.unassigned.findIndex(i => i.path === filePath);
          if (unIdx >= 0) {
            destBox.items.push(config.unassigned.splice(unIdx, 1)[0]);
            dropCount++;
          } else {
            // 新文件，创建条目
            const name = path.basename(filePath, path.extname(filePath));
            const newItem = { name, path: filePath, type: filePath.endsWith('.url') ? 'url' : 'lnk', iconData: null };
            // 尝试提取图标
            if (newItem.type === 'lnk') {
              const parsed = parseLnkFile(filePath);
              if (parsed) {
                newItem.targetPath = parsed.targetPath;
                const iconPath = resolveIconPath(parsed.iconLocation, parsed.targetPath);
                if (iconPath) { newItem.iconPath = iconPath; newItem.iconData = extractIconBase64(iconPath); }
              }
            } else {
              try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const urlMatch = content.match(/URL=(.+)/i);
                const iconMatch = content.match(/IconFile=(.+)/i);
                if (urlMatch) newItem.url = urlMatch[1].trim();
                if (iconMatch) {
                  const iconPath = iconMatch[1].trim();
                  if (iconPath) { newItem.iconPath = iconPath; newItem.iconData = extractIconBase64(iconPath); }
                }
              } catch (e) {}
            }
            destBox.items.push(newItem);
            dropCount++;
          }
        }
      }
      saveConfig(config);
      notifyDesktopBox(boxId);
      notifyMainWindow('box-updated');
      if (dropCount > 0) addActivity('move', `拖入 ${dropCount} 个图标到「${destBox.name}」`);
    }
  }
  return true;
});

ipcMain.handle('desktop-box:close', async (event) => {
  const boxId = findBoxIdByWebContents(event.sender);
  if (!boxId) return;
  const win = desktopBoxes.get(boxId);
  if (win && !win.isDestroyed()) win.close();
  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (box) { box.onDesktop = false; saveConfig(config); }
  notifyMainWindow('box-updated');
});

ipcMain.handle('desktop-box:toggle-collapse', async (event) => {
  const boxId = findBoxIdByWebContents(event.sender);
  if (!boxId) return;
  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (box) {
    box.collapsed = !box.collapsed;
    saveConfig(config);
    notifyDesktopBox(boxId);
    // 动态调整窗口高度
    const win = desktopBoxes.get(boxId);
    if (win && !win.isDestroyed()) {
      const [w, h] = win.getSize();
      if (box.collapsed) {
        win.setSize(w, 80);
      } else {
        win.setSize(w, box.desktopSize?.height || 320);
      }
    }
  }
});

ipcMain.handle('desktop-box:move', async (event, dx, dy) => {
  const boxId = findBoxIdByWebContents(event.sender);
  if (!boxId) return;
  const win = desktopBoxes.get(boxId);
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
  }
  return true;
});

function findBoxIdByWebContents(webContents) {
  for (const [boxId, win] of desktopBoxes) {
    if (!win.isDestroyed() && win.webContents === webContents) return boxId;
  }
  return null;
}

// ============ 单实例限制 ============

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 当尝试启动第二个实例时，聚焦现有窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // --- 将 Electron 内部缓存路径重定向到应用安装目录 ---
  // 避免在 C:\Users\<user>\AppData\Roaming 中产生缓存文件，
  // 使卸载应用时能一并清除所有数据。
  const appInstallDir = path.dirname(app.getPath('exe'));
  try {
    const portableDataDir = path.join(appInstallDir, 'datas');
    fs.ensureDirSync(portableDataDir);
    const testFile = path.join(portableDataDir, '.write-test');
    fs.writeFileSync(testFile, '');
    fs.removeSync(testFile);

    // 安装目录可写，将 Electron 所有内部路径重定向到此
    app.setPath('userData', appInstallDir);
    app.setPath('cache', path.join(appInstallDir, 'cache'));
    app.setPath('sessionData', path.join(appInstallDir, 'session-data'));
    app.setPath('crashDumps', path.join(appInstallDir, 'crash-dumps'));
    app.setPath('logs', path.join(appInstallDir, 'logs'));
    app.setPath('temp', path.join(appInstallDir, 'temp'));
  } catch (e) {
    // 安装目录不可写（如 Program Files），回退到默认路径
    console.warn('[Path] 安装目录不可写，使用默认路径:', e.message);
  }

  startApp();
}

function startApp() {

// 格式化相对时间
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

app.whenReady().then(() => {
  // 优先使用安装目录（.exe 所在目录）下的 datas 和 icons 文件夹
  // 注意：app.whenReady() 之前已通过 app.setPath('userData') 将 userData 重定向到安装目录（如可写）。
  let INSTALL_DIR = path.dirname(app.getPath('exe'));
  try {
    fs.ensureDirSync(path.join(INSTALL_DIR, 'datas'));
    fs.ensureDirSync(path.join(INSTALL_DIR, 'icons'));
    // 测试安装目录是否可写
    const testFile = path.join(INSTALL_DIR, 'datas', '.write-test');
    fs.writeFileSync(testFile, '');
    fs.removeSync(testFile);
  } catch (e) {
    // 安装目录不可写（如 Program Files），回退到 userData
    // userData 此时为默认路径 %APPDATA%（因为 path override 已跳过）
    appLog('WARN', '安装目录不可写，回退到 userData:', e.message);
    INSTALL_DIR = app.getPath('userData');
  }

  DATA_DIR = path.join(INSTALL_DIR, 'datas');
  CONFIG_FILE = path.join(DATA_DIR, 'config.json');
  LOG_FILE = path.join(DATA_DIR, 'activity-log.json');
  APP_LOG_FILE = path.join(DATA_DIR, 'app.log');
  ICON_CACHE_DIR = path.join(INSTALL_DIR, 'icons');
  BACKUP_DIR = path.join(ICON_CACHE_DIR, 'shortcuts');
  fs.ensureDirSync(ICON_CACHE_DIR);
  fs.ensureDirSync(BACKUP_DIR);

  appLog('INFO', '应用启动');

  // 加载活动日志
  loadActivityLog();

  createWindow();

  // 系统托盘 (UX-01 + D02)
  tray = new Tray(path.join(__dirname, '..', 'assets', 'icon.ico'));

  function buildTrayMenu() {
    const config = loadConfig();
    const lastTime = config.lastOrganizeTime;
    const lastTimeStr = lastTime ? formatRelativeTime(lastTime) : '从未整理';
    const unassignedCount = config.unassigned ? config.unassigned.length : 0;

    return Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
      { type: 'separator' },
      { label: `快速整理 (${unassignedCount} 个未分类)`, click: () => {
        const result = quickOrganize();
        if (result.moved > 0) {
          notifyMainWindow('box-updated');
          // 刷新托盘菜单
          tray.setContextMenu(buildTrayMenu());
        }
      }},
      { label: `上次整理: ${lastTimeStr}`, enabled: false },
      { type: 'separator' },
      { label: '退出', click: () => {
        app.isQuitting = true;
        // 清理资源
        clearInterval(trayRefreshTimer);
        for (const timer of saveTimers.values()) clearTimeout(timer);
        saveTimers.clear();
        if (tray && !tray.isDestroyed()) tray.destroy();
        app.quit();
      } }
    ]);
  }

  tray.setToolTip('桌面图标收纳盒');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });

  // 定期刷新托盘菜单（每30秒），保存 timer ID 以便退出时清除
  const trayRefreshTimer = setInterval(() => {
    if (tray && !tray.isDestroyed()) {
      tray.setContextMenu(buildTrayMenu());
    }
  }, 30000);

  // 关闭窗口时隐藏到托盘而非退出 (UX-01)
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // 恢复上次的桌面浮动窗口
  const config = loadConfig();

  // 启动时自动隐藏已收纳的桌面图标（如果开关为开启）
  // hideCollectedIconsFn 内部通过 alreadyHidden 集合避免重复移动
  if (config.hideCollectedIcons) {
    appLog('INFO', '启动时检查已收纳桌面图标隐藏状态');
    hideCollectedIconsFn();
  }

  for (const box of config.boxes) {
    if (box.onDesktop) {
      createDesktopBox(box.id);
    }
  }
});

// 保持托盘运行，不因窗口关闭而退出 (UX-01)
app.on('window-all-closed', () => {});

} // end startApp

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
