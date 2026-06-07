const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  openShortcut: (p, targetPath, url) => ipcRenderer.invoke('open-shortcut', p, targetPath, url),
  openInExplorer: (p, targetPath) => ipcRenderer.invoke('open-in-explorer', p, targetPath),
  getDesktopPath: () => ipcRenderer.invoke('get-desktop-path'),
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),
  // 桌面浮动收纳盒
  createDesktopBox: (boxId) => ipcRenderer.invoke('create-desktop-box', boxId),
  closeDesktopBox: (boxId) => ipcRenderer.invoke('close-desktop-box', boxId),
  // 监听桌面收纳盒数据变化（返回清理函数）
  onBoxUpdated: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('box-updated', handler);
    return () => ipcRenderer.removeListener('box-updated', handler);
  },
  // 监听图标增量更新 (PERF-01 + UX-02)
  onIconUpdated: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('icon-updated', handler);
    return () => ipcRenderer.removeListener('icon-updated', handler);
  },
  // P2: 状态栏 - 系统信息
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  // P2: 设置面板 - 文件夹选择器
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  // P2: 快速整理
  quickOrganize: () => ipcRenderer.invoke('quick-organize'),
  // P2: 活动日志
  getActivityLog: () => ipcRenderer.invoke('get-activity-log'),
  clearActivityLog: () => ipcRenderer.invoke('clear-activity-log'),
  logActivity: (type, message, detail) => ipcRenderer.invoke('log-activity', type, message, detail),
  // P2: 监听活动日志更新
  onActivityUpdated: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('activity-updated', handler);
    return () => ipcRenderer.removeListener('activity-updated', handler);
  },
  // 隐藏/显示已收纳桌面图标
  toggleHideIcons: (hide) => ipcRenderer.invoke('toggle-hide-icons', hide),
  getHideStatus: () => ipcRenderer.invoke('get-hide-status'),
  // 缓存路径信息
  getStoragePaths: () => ipcRenderer.invoke('get-storage-paths'),
  openFolder: (folderPath) => ipcRenderer.invoke('open-folder', folderPath),
  // 重置缓存
  resetCaches: () => ipcRenderer.invoke('reset-caches'),
  // F-06: 删除收纳盒（含隐藏图标恢复）
  deleteBox: (boxIdx) => ipcRenderer.invoke('delete-box', boxIdx),
  // F-06a: 撤销操作
  undo: () => ipcRenderer.invoke('undo'),
  canUndo: () => ipcRenderer.invoke('can-undo'),
  saveUndoSnapshot: (type) => ipcRenderer.invoke('save-undo-snapshot', type),
  // F-19: 以管理员身份重启
  restartAsAdmin: () => ipcRenderer.invoke('restart-as-admin'),
  // PRD §12.2: 从备份恢复配置并重启
  restoreFromBackup: (backupPath) => ipcRenderer.invoke('restore-from-backup', backupPath),
  // 配置损坏通知
  onConfigCorrupted: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('config-corrupted', handler);
    return () => ipcRenderer.removeListener('config-corrupted', handler);
  },
  // PRD §12.2: 配置保存失败通知
  onConfigSaveFailed: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('config-save-failed', handler);
    return () => ipcRenderer.removeListener('config-save-failed', handler);
  },
  // F-29: 配置导入/导出
  exportConfig: () => ipcRenderer.invoke('export-config'),
  importConfig: () => ipcRenderer.invoke('import-config'),
  // F-34: 无效快捷方式检测
  detectInvalidShortcuts: () => ipcRenderer.invoke('detect-invalid-shortcuts'),
  cleanupInvalidShortcuts: () => ipcRenderer.invoke('cleanup-invalid-shortcuts'),
  // PRD §12.3: PowerShell 不可用通知
  onPowershellUnavailable: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('powershell-unavailable', handler);
    return () => ipcRenderer.removeListener('powershell-unavailable', handler);
  },
  // F-21: 活动日志导出
  exportActivityLog: () => ipcRenderer.invoke('export-activity-log'),
  // 应用版本号
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
});
