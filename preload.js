const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  store: {
    get: key => ipcRenderer.sendSync('store:get', key),
    set: (key, value) => ipcRenderer.sendSync('store:set', key, value)
  },
  min: () => ipcRenderer.send('win:min'),
  close: () => ipcRenderer.send('win:close')
});
