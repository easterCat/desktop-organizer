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
});
