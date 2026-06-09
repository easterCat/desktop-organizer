const { app, BrowserWindow, ipcMain, shell, screen, Tray, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, execFile } = require('child_process');

let DATA_DIR, CONFIG_FILE, LOG_FILE, APP_LOG_FILE, BACKUP_DIR;
let mainWindow;

// 生产环境下 PowerShell 可执行文件的完整路径（启动时检测）
let POWERSHELL_PATH = 'powershell';

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

// F-06a: 撤销栈（仅保留最近1条操作快照，30秒有效窗口）
const UNDO_EXPIRY_MS = 30000;
let undoStack = null; // { type, snapshot, timestamp }

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

// 获取系统信息（磁盘使用率、内存、CPU）
let lastCpuInfo = null;
let lastCpuTime = 0;

function getSystemInfo() {
  const info = { diskTotal: 0, diskFree: 0, diskUsed: 0, memTotal: 0, memFree: 0, memUsed: 0, cpuModel: '', cpuCores: 0, cpuUsage: 0 };

  // 内存信息
  info.memTotal = os.totalmem();
  info.memFree = os.freemem();
  info.memUsed = info.memTotal - info.memFree;

  // CPU 信息
  const cpus = os.cpus();
  info.cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';
  info.cpuCores = cpus.length;

  // CPU 使用率（通过两次采样计算）
  const currentIdle = cpus.reduce((sum, c) => sum + c.times.idle, 0);
  const currentTotal = cpus.reduce((sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0), 0);
  const now = Date.now();
  if (lastCpuInfo && (now - lastCpuTime) > 0) {
    const idleDiff = currentIdle - lastCpuInfo.idle;
    const totalDiff = currentTotal - lastCpuInfo.total;
    info.cpuUsage = totalDiff > 0 ? Math.round(((totalDiff - idleDiff) / totalDiff) * 100) : 0;
  }
  lastCpuInfo = { idle: currentIdle, total: currentTotal };
  lastCpuTime = now;

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

// --- F-06a: 撤销操作 ---
function saveUndoSnapshot(config) {
  // 保存当前 unassigned 和 boxes 的深拷贝作为撤销快照
  undoStack = {
    type: 'organize',
    snapshot: JSON.parse(JSON.stringify({
      unassigned: config.unassigned,
      boxes: config.boxes.map(b => ({ id: b.id, items: b.items }))
    })),
    timestamp: Date.now()
  };
}

function undoLastAction() {
  if (!undoStack) return { ok: false, error: '无可撤销操作' };
  if (Date.now() - undoStack.timestamp > UNDO_EXPIRY_MS) {
    undoStack = null;
    return { ok: false, error: '撤销已过期（30秒）' };
  }
  const config = loadConfig();
  // 恢复 unassigned 和各 box 的 items
  config.unassigned = undoStack.snapshot.unassigned;
  for (const snapshotBox of undoStack.snapshot.boxes) {
    const box = config.boxes.find(b => b.id === snapshotBox.id);
    if (box) box.items = snapshotBox.items;
  }
  saveConfig(config);
  undoStack = null;
  addActivity('organize', '撤销上一次操作');
  notifyAllDesktopBoxes();
  return { ok: true };
}

// 计算快捷方式名称与盒子名称的匹配分数（PRD §5.5 四级评分体系）
// 得分 3：精确匹配（名称完全相等，不区分大小写）
// 得分 2：盒子名包含快捷方式名
// 得分 1：快捷方式名包含盒子名
// 得分 0：无匹配
function computeMatchScore(shortcutName, boxName) {
  const sLower = shortcutName.toLowerCase();
  const bLower = boxName.toLowerCase();

  // 精确匹配（名称完全相等）
  if (sLower === bLower) return 3;
  // 盒子名包含快捷方式名（如盒子"浏览器"匹配快捷方式"浏览器收藏"→ 是）
  if (bLower.includes(sLower)) return 2;
  // 快捷方式名包含盒子名（如快捷方式"开发工具箱"匹配盒子"工具"→ 是）
  if (sLower.includes(bLower)) return 1;

  return 0;
}

// 快速整理：基于 PRD §5.5 四级评分体系的自动分类，宁可漏分类不可误分类
// 决策规则：
//   唯一最高分 ≥ 3 → 自动归入（仅精确匹配自动归入）
//   最高分 = 2 且仅一个盒子匹配 → 标记为候选建议
//   最高分 = 1 且仅一个盒子匹配 → 标记为候选建议
//   最高分 ≥ 2 且多个盒子匹配 → 跳过（模糊匹配多义冲突）
//   所有得分 = 0 → 留在未分类区
function quickOrganize() {
  const config = loadConfig();
  if (config.boxes.length === 0 || config.unassigned.length === 0) return { moved: 0, candidates: [] };

  // 保存撤销快照
  saveUndoSnapshot(config);

  let moved = 0;
  const candidates = []; // 候选建议（子串匹配，需用户确认）
  const remaining = [];

  for (const item of config.unassigned) {
    let bestScore = 0;
    let bestBoxIdx = -1;
    let matchCount = 0; // 匹配到的盒子数量（得分 > 0）

    for (let i = 0; i < config.boxes.length; i++) {
      const score = computeMatchScore(item.name, config.boxes[i].name);
      if (score > 0) matchCount++;
      if (score > bestScore) {
        bestScore = score;
        bestBoxIdx = i;
      }
    }

    // 按 PRD §5.5 决策规则处理
    if (bestScore >= 3 && matchCount === 1) {
      // 精确匹配且唯一 → 自动归入
      config.boxes[bestBoxIdx].items.push(item);
      if (config.hideCollectedIcons) hideSingleItem(config, item);
      moved++;
    } else if (bestScore === 2 && matchCount === 1) {
      // 盒子名包含快捷方式名，仅一个盒子匹配 → 候选建议
      candidates.push({ item, score: bestScore, boxName: config.boxes[bestBoxIdx].name, boxIdx: bestBoxIdx });
      remaining.push(item);
    } else if (bestScore === 1 && matchCount === 1) {
      // 快捷方式名包含盒子名，仅一个盒子匹配 → 候选建议
      candidates.push({ item, score: bestScore, boxName: config.boxes[bestBoxIdx].name, boxIdx: bestBoxIdx });
      remaining.push(item);
    } else {
      // 多匹配冲突或无匹配 → 跳过
      remaining.push(item);
    }
  }

  if (moved > 0 || candidates.length > 0) {
    config.unassigned = remaining;
    config.lastOrganizeTime = Date.now();
    saveConfig(config);
    addActivity('organize', `快速整理完成，自动归类 ${moved} 个快捷方式` + (candidates.length > 0 ? `，${candidates.length} 个待确认` : ''));
  }

  return { moved, candidates };
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
    const defaultConfig = { version: 2, boxes: [], unassigned: [], hideCollectedIcons: true, hiddenItems: [] };
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
    if (!config.version) { config.version = 2; dirty = true; }
    for (const box of config.boxes) {
      if (!box.id) {
        box.id = 'box_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        dirty = true;
      }
      // v1.4: 补充 Box 新增字段默认值
      if (!box.displayMode) { box.displayMode = box.onDesktop ? 'desktop' : 'panel'; dirty = true; }
      if (!box.sortMode) { box.sortMode = 'manual'; dirty = true; }
      if (!box.sortOrder) { box.sortOrder = []; dirty = true; }
      if (!box.createdTime) { box.createdTime = Date.now(); dirty = true; }
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
    // 兼容旧数据：hiddenItems 字段名迁移（path → originalPath, tempPath → backupPath）
    for (const h of config.hiddenItems) {
      if (h.path && !h.originalPath) { h.originalPath = h.path; delete h.path; dirty = true; }
      if (h.tempPath && !h.backupPath) { h.backupPath = h.tempPath; delete h.tempPath; dirty = true; }
    }
    if (dirty) saveConfig(config);
    return config;
  } catch (e) {
    console.error('[Config] 配置文件读取失败，已备份并重置:', e.message);
    const backupPath = CONFIG_FILE + '.bak.' + Date.now();
    try { fs.copySync(CONFIG_FILE, backupPath); } catch (_) {}
    const defaultConfig = { version: 2, boxes: [], unassigned: [], hideCollectedIcons: true, hiddenItems: [] };
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
  const resolvedPath = scriptPath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);

  // 检查脚本文件是否存在（生产环境下 asar 解包路径验证）
  if (!fs.existsSync(resolvedPath)) {
    appLog('ERROR', `[PS] 脚本文件不存在: ${resolvedPath}`);
    return '';
  }

  const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolvedPath];
  for (const a of args) psArgs.push('-Arg', a);
  try {
    const result = execFileSync(POWERSHELL_PATH, psArgs, { encoding: 'utf-8', timeout: 15000 });
    return result.trim();
  } catch (e) {
    const errMsg = e.stderr ? e.stderr.toString().trim() : e.message;
    appLog('ERROR', `[PS] ${scriptName} 执行失败:`, errMsg, '| 脚本路径:', resolvedPath);
    return '';
  }
}

// 启动时检测 PowerShell 可用性并定位完整路径
function detectPowerShell() {
  try {
    const sysRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    const fullPath = path.join(sysRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    if (fs.existsSync(fullPath)) {
      POWERSHELL_PATH = fullPath;
    }
    execFileSync(POWERSHELL_PATH, ['-NoProfile', '-NonInteractive', '-Command', 'echo ok'], { encoding: 'utf-8', timeout: 5000 });
    appLog('INFO', `[PS] PowerShell 可用: ${POWERSHELL_PATH}`);
    return true;
  } catch (e) {
    appLog('ERROR', '[PS] PowerShell 不可用:', e.message);
    return false;
  }
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

// F-34: 检测无效快捷方式（目标不存在）
function detectInvalidShortcuts() {
  const config = loadConfig();
  let invalidCount = 0;
  const allItems = [...config.unassigned];
  for (const box of config.boxes) allItems.push(...box.items);

  for (const item of allItems) {
    const isInvalid = !item.targetPath || !fs.existsSync(item.targetPath);
    if (item.invalid !== isInvalid) {
      item.invalid = isInvalid;
      invalidCount++;
    }
  }

  if (invalidCount > 0) saveConfig(config);
  return { invalidCount, total: allItems.length };
}

// F-34: 批量清理无效快捷方式
function cleanupInvalidShortcuts() {
  const config = loadConfig();
  let removed = 0;

  // 从 unassigned 中移除无效项
  const before = config.unassigned.length;
  config.unassigned = config.unassigned.filter(item => !item.invalid);
  removed += before - config.unassigned.length;

  // 从各 box 中移除无效项
  for (const box of config.boxes) {
    const beforeBox = box.items.length;
    box.items = box.items.filter(item => !item.invalid);
    removed += beforeBox - box.items.length;
  }

  if (removed > 0) {
    saveConfig(config);
    addActivity('system', `清理 ${removed} 个无效快捷方式`);
  }
  return { removed };
}

// ============ 桌面浮动窗口管理 ============

// F-16b: 检查坐标是否在任一显示器可见区域内
function isPositionVisible(x, y) {
  const displays = screen.getAllDisplays();
  for (const display of displays) {
    const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
    if (x >= dx && x < dx + dw && y >= dy && y < dy + dh) return true;
  }
  return false;
}

// F-16b: 获取主显示器中心位置
function getPrimaryDisplayCenter(width, height) {
  const display = screen.getPrimaryDisplay();
  const { x: dx, y: dy, width: dw, height: dh } = display.bounds;
  return { x: Math.round(dx + (dw - width) / 2), y: Math.round(dy + (dh - height) / 2) };
}

// F-16b: 重置浮窗位置到主显示器中心
function resetDesktopBoxPosition(boxId) {
  const config = loadConfig();
  const box = config.boxes.find(b => b.id === boxId);
  if (!box) return false;
  const size = box.desktopSize || { width: 260, height: 320 };
  const center = getPrimaryDisplayCenter(size.width, size.height);
  box.desktopPos = center;
  saveConfig(config);
  const win = desktopBoxes.get(boxId);
  if (win && !win.isDestroyed()) {
    win.setPosition(center.x, center.y);
  }
  return true;
}

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

  const size = box.desktopSize || { width: 260, height: 320 };
  let pos = box.desktopPos || { x: 100, y: 100 };

  // F-16b: 如果位置不可见（如外接显示器断开），重置到主显示器中心
  if (!isPositionVisible(pos.x, pos.y)) {
    pos = getPrimaryDisplayCenter(size.width, size.height);
    box.desktopPos = pos;
    saveConfig(config);
  }

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

// --- 单项目隐藏/恢复（核心函数） ---

/**
 * 将单个已收纳项目的桌面快捷方式移动到备份目录
 * @param {object} config - 当前配置对象（调用者负责最终 saveConfig）
 * @param {object} item - 要隐藏的项目 { path, ... }
 * @returns {boolean} 是否成功隐藏
 */
function hideSingleItem(config, item) {
  const desktopPath = item.path;
  if (!desktopPath) return false;

  fs.ensureDirSync(BACKUP_DIR);
  const hiddenItems = Array.isArray(config.hiddenItems) ? config.hiddenItems : [];
  const alreadyHidden = new Set(hiddenItems.map(h => h.originalPath || h.path));

  if (alreadyHidden.has(desktopPath)) return false; // 已在 backup 中
  if (!fs.existsSync(desktopPath)) return false;    // 文件不存在（可能已手动删除）

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
    config.hiddenItems = [...hiddenItems, { originalPath: desktopPath, backupPath: finalBackupPath }];
    return true;
  } catch (e) {
    appLog('ERROR', '隐藏单个图标失败:', desktopPath, e.message);
    return false;
  }
}

/**
 * 将单个项目的快捷方式从备份目录恢复到桌面
 * @param {object} config - 当前配置对象（调用者负责最终 saveConfig）
 * @param {object} item - 要恢复的项目 { path, ... }
 * @returns {boolean} 是否成功恢复
 */
function restoreSingleItem(config, item) {
  const desktopPath = item.path;
  if (!desktopPath) return false;

  const hiddenItems = Array.isArray(config.hiddenItems) ? config.hiddenItems : [];
  const idx = hiddenItems.findIndex(h => (h.originalPath || h.path) === desktopPath);
  if (idx < 0) return false; // 不在隐藏列表中

  const record = hiddenItems[idx];
  const backupPath = record.backupPath || record.tempPath;

  if (!backupPath || !fs.existsSync(backupPath)) {
    appLog('WARN', '备份文件不存在，无法恢复:', backupPath);
    config.hiddenItems = hiddenItems.filter((_, i) => i !== idx);
    return false;
  }

  if (fs.existsSync(desktopPath)) {
    appLog('WARN', '桌面已存在同名文件，跳过恢复:', desktopPath);
    return false;
  }

  try {
    fs.moveSync(backupPath, desktopPath);
    config.hiddenItems = hiddenItems.filter((_, i) => i !== idx);
    return true;
  } catch (e) {
    appLog('ERROR', '恢复单个图标失败:', backupPath, e.message);
    return false;
  }
}

// --- 批量隐藏/显示（启动时 & 设置开关） ---

function hideCollectedIconsFn() {
  const config = loadConfig();
  let count = 0;

  // 仅移动已收纳到盒子中的图标（PRD §5.6）
  for (const box of config.boxes) {
    for (const item of box.items) {
      if (hideSingleItem(config, item)) count++;
    }
  }

  config.hideCollectedIcons = true;
  saveConfig(config);

  addActivity('system', `隐藏 ${count} 个已整理的桌面图标`);
  // 通知主窗口重新加载配置（hiddenItems 已变化，否则下次刷新时渲染器用旧的空 hiddenItems 会导致 item 被误删）
  notifyMainWindow('box-updated');

  return { ok: true, count };
}

function showCollectedIconsFn() {
  const config = loadConfig();
  const hiddenItems = Array.isArray(config.hiddenItems) ? config.hiddenItems : [];
  if (hiddenItems.length === 0 && !config.hideCollectedIcons) return { ok: true, count: 0 };

  let count = 0;

  // 优先恢复仍在盒子中的项目（通过 restoreSingleItem 精确匹配）
  const allBoxItems = [];
  for (const box of config.boxes) {
    for (const item of box.items) allBoxItems.push(item);
  }
  for (const item of allBoxItems) {
    if (restoreSingleItem(config, item)) count++;
  }

  // 处理残留的 hiddenItems 记录（项目已被移出所有盒子但仍记录在 hiddenItems 中）
  const remaining = [...(config.hiddenItems || [])];
  for (const record of remaining) {
    const desktopPath = record.originalPath || record.path;
    const backupPath = record.backupPath || record.tempPath;
    if (!backupPath || !fs.existsSync(backupPath)) continue;
    if (fs.existsSync(desktopPath)) continue;
    try {
      fs.moveSync(backupPath, desktopPath);
      count++;
    } catch (e) {
      appLog('ERROR', '恢复图标失败:', backupPath, e.message);
    }
  }
  config.hiddenItems = [];
  config.hideCollectedIcons = false;
  saveConfig(config);

  addActivity('system', `恢复 ${count} 个桌面图标`);
  // 通知主窗口重新加载配置（hiddenItems 已清空，保持渲染器内存与磁盘一致）
  notifyMainWindow('box-updated');

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

  // 检测盒子项目的增删变化，自动处理桌面图标隐藏/恢复
  if (config.hideCollectedIcons) {
    const oldConfig = loadConfig();
    const oldBoxPaths = new Set();
    for (const box of oldConfig.boxes) {
      for (const item of box.items) oldBoxPaths.add(item.path);
    }
    const newBoxPaths = new Set();
    for (const box of config.boxes) {
      for (const item of box.items) newBoxPaths.add(item.path);
    }
    // 新增到盒子中的项目 → 隐藏
    for (const box of config.boxes) {
      for (const item of box.items) {
        if (!oldBoxPaths.has(item.path)) hideSingleItem(config, item);
      }
    }
    // 从盒子中移出的项目 → 恢复
    for (const box of oldConfig.boxes) {
      for (const item of box.items) {
        if (!newBoxPaths.has(item.path)) restoreSingleItem(config, item);
      }
    }
  }

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
      const hidden = (config.hiddenItems || []).find(h => (h.originalPath || h.path) === shortcutPath);
      if (hidden) {
        const backupPath = hidden.backupPath || hidden.tempPath;
        if (backupPath && fs.existsSync(backupPath)) {
          effectivePath = backupPath;
        }
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
      const hidden = (config.hiddenItems || []).find(h => (h.originalPath || h.path) === shortcutPath);
      if (hidden) {
        const backupPath = hidden.backupPath || hidden.tempPath;
        if (backupPath && fs.existsSync(backupPath)) {
          effectivePath = backupPath;
        }
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

// F-06a: 撤销快照
ipcMain.handle('save-undo-snapshot', async () => {
  const config = loadConfig();
  saveUndoSnapshot(config);
  return true;
});

// F-06: 删除收纳盒（含隐藏图标恢复）
ipcMain.handle('delete-box', async (_, boxIdx) => {
  const config = loadConfig();
  const box = config.boxes[boxIdx];
  if (!box) return { ok: false, error: '收纳盒不存在' };

  // 将盒子内的 items 移回未分类，同时恢复被隐藏的图标
  let restored = 0;
  for (const item of box.items) {
    config.unassigned.push(item);
    if (restoreSingleItem(config, item)) restored++;
  }

  // 删除收纳盒
  config.boxes.splice(boxIdx, 1);
  saveConfig(config);
  notifyMainWindow('box-updated');
  notifyAllDesktopBoxes();
  addActivity('delete', `删除收纳盒「${box.name}」，${box.items.length} 个快捷方式回到未分类`);
  return { ok: true, restored };
});

// F-06a: 撤销操作
ipcMain.handle('undo', async () => {
  const result = undoLastAction();
  if (result.ok) notifyMainWindow('box-updated');
  return result;
});

// F-34: 无效快捷方式检测
ipcMain.handle('detect-invalid-shortcuts', async () => detectInvalidShortcuts());
ipcMain.handle('cleanup-invalid-shortcuts', async () => {
  const result = cleanupInvalidShortcuts();
  notifyMainWindow('box-updated');
  return result;
});

ipcMain.handle('can-undo', async () => {
  if (!undoStack) return false;
  return (Date.now() - undoStack.timestamp) <= UNDO_EXPIRY_MS;
});

// F-29: 配置导出
ipcMain.handle('export-config', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出配置',
    defaultPath: 'desktop-organizer-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  try {
    const config = loadConfig();
    // 导出时清除 iconData（太大，不含图标数据）
    const exportData = JSON.parse(JSON.stringify(config));
    for (const box of exportData.boxes) {
      for (const item of box.items) item.iconData = null;
    }
    for (const item of exportData.unassigned) item.iconData = null;
    fs.writeJsonSync(result.filePath, exportData, { spaces: 2 });
    addActivity('system', '配置已导出');
    return { ok: true, path: result.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// F-29: 配置导入
ipcMain.handle('import-config', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入配置',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false };
  try {
    const importData = fs.readJsonSync(result.filePaths[0]);
    if (!importData || !Array.isArray(importData.boxes)) {
      return { ok: false, error: '无效的配置文件' };
    }
    const config = loadConfig();
    // 合并盒子：跳过同名盒子，追加新盒子
    const existingNames = new Set(config.boxes.map(b => b.name));
    let imported = 0;
    for (const box of importData.boxes) {
      if (existingNames.has(box.name)) continue;
      // 为导入的盒子生成新 id
      box.id = 'box_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      box.onDesktop = false; // 导入的盒子不在桌面显示
      if (!box.displayMode) box.displayMode = 'panel';
      if (!box.sortMode) box.sortMode = 'manual';
      if (!box.sortOrder) box.sortOrder = [];
      if (!box.createdTime) box.createdTime = Date.now();
      config.boxes.push(box);
      imported++;
    }
    saveConfig(config);
    addActivity('system', `导入配置：${imported} 个收纳盒`);
    notifyMainWindow('box-updated');
    return { ok: true, imported };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
    if (config.hideCollectedIcons) restoreSingleItem(config, item);
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
        if (config.hideCollectedIcons) hideSingleItem(config, item);
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
            const movedItem = config.unassigned.splice(unIdx, 1)[0];
            destBox.items.push(movedItem);
            if (config.hideCollectedIcons) hideSingleItem(config, movedItem);
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

// F-16b: 重置浮窗位置
ipcMain.handle('desktop-box:reset-position', async (event) => {
  const boxId = findBoxIdByWebContents(event.sender);
  if (!boxId) return false;
  return resetDesktopBoxPosition(boxId);
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

  // --- 路径配置：基于应用安装路径动态确定存储目录 ---
  // PRD F-26 & 8.5: 所有数据存储在应用安装目录下（datas/、icons/ 等），
  // 路径随安装位置动态变化，例如：
  //   - 安装在 C:\Program Files\desktop-organizer\ → 数据在 C:\Program Files\desktop-organizer\datas\
  //   - 安装在 D:\Apps\desktop-organizer\ → 数据在 D:\Apps\desktop-organizer\datas\
  const APP_ROOT = app.isPackaged
    ? path.dirname(app.getPath('exe'))  // 生产环境：使用 .exe 所在目录
    : path.join(__dirname, '..');       // 开发环境：使用项目根目录
  try {
    fs.ensureDirSync(APP_ROOT);
    const testFile = path.join(APP_ROOT, '.write-test');
    fs.writeFileSync(testFile, '');
    fs.removeSync(testFile);

    app.setPath('userData', APP_ROOT);
    app.setPath('cache', path.join(APP_ROOT, 'cache'));
    app.setPath('sessionData', path.join(APP_ROOT, 'session-data'));
    app.setPath('crashDumps', path.join(APP_ROOT, 'crash-dumps'));
    app.setPath('logs', path.join(APP_ROOT, 'logs'));
    app.setPath('temp', path.join(APP_ROOT, 'temp'));

    appLog('INFO', `[Path] 存储路径: ${APP_ROOT} (${app.isPackaged ? '生产环境' : '开发环境'})`);
  } catch (e) {
    // 安装目录不可写（如 Program Files 无管理员权限），回退到系统默认路径
    console.warn('[Path] 安装目录不可写，使用默认 AppData 路径:', e.message);
    appLog('WARN', `[Path] 安装目录不可写 (${APP_ROOT})，回退到 AppData`);
    // Electron 默认 userData 路径为 %APPDATA%\<productName>，此路径始终可写
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
  // 基于 app.getPath('userData') 获取存储根路径（已通过 app.setPath 重定向到安装目录）
  // 数据目录结构：{APP_ROOT}/datas/、{APP_ROOT}/icons/ 等
  const DATA_ROOT = app.getPath('userData');

  DATA_DIR = path.join(DATA_ROOT, 'datas');
  CONFIG_FILE = path.join(DATA_DIR, 'config.json');
  LOG_FILE = path.join(DATA_DIR, 'activity-log.json');
  APP_LOG_FILE = path.join(DATA_DIR, 'app.log');
  ICON_CACHE_DIR = path.join(DATA_ROOT, 'icons');
  BACKUP_DIR = path.join(ICON_CACHE_DIR, 'shortcuts');
  fs.ensureDirSync(DATA_DIR);
  fs.ensureDirSync(ICON_CACHE_DIR);
  fs.ensureDirSync(BACKUP_DIR);

  // 检测 PowerShell 可用性
  const psOk = detectPowerShell();
  if (!psOk && mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('powershell-unavailable');
    });
  }

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
