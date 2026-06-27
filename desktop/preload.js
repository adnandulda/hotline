// Cercevesiz pencere icin guvenli kopru: web sayfasina pencere kontrolleri ver.
// (contextIsolation acik oldugundan window.desktopAPI ile erisilir)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  minimize: () => ipcRenderer.send('win-min'),
  maximize: () => ipcRenderer.send('win-max'),
  close:    () => ipcRenderer.send('win-close'),
});
