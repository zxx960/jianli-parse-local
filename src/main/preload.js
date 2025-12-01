const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectResumeFiles: () => ipcRenderer.invoke('select-resume-files'),
  parseResumePdf: (filePaths) => ipcRenderer.invoke('parse-resume-pdf', filePaths),
  exportResumeExcel: (items) => {
    let safeItems = [];
    try {
      if (Array.isArray(items)) {
        safeItems = JSON.parse(JSON.stringify(items));
      }
    } catch (e) {
      // 如果序列化失败，则退回空数组，主进程会给出友好提示
      safeItems = [];
    }

    return ipcRenderer.invoke('export-resume-excel', safeItems);
  },
  onResumeItemParsed: (callback) => {
    ipcRenderer.on('resume-item-parsed', (event, data) => {
      if (typeof callback === 'function') {
        callback(data);
      }
    });
  },
  removeAllResumeItemParsedListeners: () => {
    ipcRenderer.removeAllListeners('resume-item-parsed');
  },
})
