const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('boxApi', {
  // 获取本收纳盒信息
  getBoxData: () => ipcRenderer.invoke('desktop-box:get-data'),
  // 打开快捷方式
  openShortcut: (p, targetPath, url) => ipcRenderer.invoke('open-shortcut', p, targetPath, url),
  // 打开文件位置
  openInExplorer: (p, targetPath) => ipcRenderer.invoke('open-in-explorer', p, targetPath),  // 从收纳盒移除快捷方式
  removeItem: (itemPath) => ipcRenderer.invoke('desktop-box:remove-item', itemPath),
  // 还原单个图标到桌面
  restoreSingle: (item) => ipcRenderer.invoke('restore-single', item),
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
  // F-16b: 重置位置
  resetPosition: () => ipcRenderer.invoke('desktop-box:reset-position'),
});
