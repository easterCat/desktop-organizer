const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boxApi', {
  // 获取本收纳盒信息
  getBoxData: () => ipcRenderer.invoke('desktop-box:get-data'),
  // 打开快捷方式
  openShortcut: (p, targetPath, url) => ipcRenderer.invoke('open-shortcut', p, targetPath, url),
  // 打开文件位置
  openInExplorer: (p, targetPath) => ipcRenderer.invoke('open-in-explorer', p, targetPath),  // 从收纳盒移除快捷方式
  removeItem: (itemPath) => ipcRenderer.invoke('desktop-box:remove-item', itemPath),
  // 添加快捷方式到收纳盒（从拖拽来）
  addItem: (itemData) => ipcRenderer.invoke('desktop-box:add-item', itemData),
  // 关闭桌面收纳盒
  close: () => ipcRenderer.invoke('desktop-box:close'),
  // 切换折叠
  toggleCollapse: () => ipcRenderer.invoke('desktop-box:toggle-collapse'),
  // 监听数据更新（返回清理函数）
  onDataUpdate: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('desktop-box:data-updated', handler);
    return () => ipcRenderer.removeListener('desktop-box:data-updated', handler);
  },
  // 监听拖入的文件路径（从系统拖入，返回清理函数）
  onFileDrop: (cb) => {
    const handler = (_, paths) => cb(paths);
    ipcRenderer.on('desktop-box:file-drop', handler);
    return () => ipcRenderer.removeListener('desktop-box:file-drop', handler);
  },
  // 窗口移动
  windowMove: (dx, dy) => ipcRenderer.invoke('desktop-box:move', dx, dy),
  // F-16b: 重置位置
  resetPosition: () => ipcRenderer.invoke('desktop-box:reset-position'),
});
