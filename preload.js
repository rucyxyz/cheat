const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  store: {
    get: key => ipcRenderer.sendSync('store:get', key),
    set: (key, value) => ipcRenderer.sendSync('store:set', key, value)
  },
  onStatus: cb => ipcRenderer.on('status', (_, s) => cb(s)),
  onDiag: cb => ipcRenderer.on('diag', (_, d) => cb(d)),
  onFrame: cb => ipcRenderer.on('frame', (_, d) => cb(d)),
  min: () => ipcRenderer.send('win:min'),
  close: () => ipcRenderer.send('win:close')
});
