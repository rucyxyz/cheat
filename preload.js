const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  store: {
    get: key => ipcRenderer.sendSync('store:get', key),
    set: (key, value) => ipcRenderer.sendSync('store:set', key, value)
  },
  min: () => ipcRenderer.send('win:min'),
  close: () => ipcRenderer.send('win:close'),
  dragStart: () => ipcRenderer.send('win:dragstart'),
  dragEnd: () => ipcRenderer.send('win:dragend'),
  onFrame: cb => ipcRenderer.on('frame', (e, d) => cb(d)),
  onStatus: cb => ipcRenderer.on('status', (e, s) => cb(s))
});
