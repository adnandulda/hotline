// =====================================================================
//  Bizim Discord - Masaustu (Electron)
//  Web uygulamasini bir masaustu penceresinde acar + ekstra ozellikler:
//   - sistem tepsisi (kapatinca tepsiye iner)
//   - native masaustu bildirimleri (web app zaten Notification kullaniyor)
//   - OTOMATIK OYUN ALGILAMA: acik oyunu bulur, "Oynuyor X" yapar
//  Calistirmak:  cd desktop && npm install && npm start
// =====================================================================

const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// >>> Sunucu adresi (Railway). Yerelde test icin: APP_URL=http://localhost:3000 npm start <<<
const APP_URL = process.env.APP_URL || 'https://hotline-production-03ae.up.railway.app/';

let win = null, tray = null, quitting = false;

function iconImage(){
  const p = path.join(__dirname, 'icon.png');
  if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  // yedek: kucuk (gorunmez) gecerli ikon — tepsi yine de calisir
  return nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
}

function createWindow(){
  win = new BrowserWindow({
    width: 1200, height: 800, minWidth: 760, minHeight: 480,
    backgroundColor: '#313338', title: 'Bizim Discord',
    icon: iconImage(),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true }
  });
  win.loadURL(APP_URL);
  // disari acilan linkler tarayicida acilsin
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // kapatinca tepsiye in (tepsi varsa)
  win.on('close', (e) => { if (!quitting && tray){ e.preventDefault(); win.hide(); } });
}

function setupTray(){
  try{
    tray = new Tray(iconImage());
    tray.setToolTip('Bizim Discord');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Goster', click: () => { if (win){ win.show(); win.focus(); } } },
      { type: 'separator' },
      { label: 'Cikis', click: () => { quitting = true; app.quit(); } }
    ]));
    tray.on('click', () => { if (win){ win.isVisible() ? win.focus() : win.show(); } });
  }catch(e){ tray = null; }
}

// ---- Tek surum kilidi ----
if (!app.requestSingleInstanceLock()){ app.quit(); }
else {
  app.on('second-instance', () => { if (win){ win.show(); win.focus(); } });
  app.whenReady().then(() => { createWindow(); setupTray(); startGameDetection(); });
  app.on('activate', () => { if (!win) createWindow(); else win.show(); });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin' && !tray) app.quit(); });
}

// ---- Otomatik oyun algilama ----
// process adi (kucuk harf) -> gosterilecek oyun adi. Istersen ekle/cikar.
const GAMES = {
  'valorant.exe':'Valorant', 'valorant-win64-shipping.exe':'Valorant',
  'cs2.exe':'Counter-Strike 2', 'csgo.exe':'CS:GO',
  'leagueclient.exe':'League of Legends', 'league of legends.exe':'League of Legends',
  'gta5.exe':'GTA V', 'rocketleague.exe':'Rocket League',
  'fortniteclient-win64-shipping.exe':'Fortnite',
  'minecraft.exe':'Minecraft', 'javaw.exe':'Minecraft',
  'eldenring.exe':'Elden Ring', 'dota2.exe':'Dota 2',
  'overwatch.exe':'Overwatch 2', 'r5apex.exe':'Apex Legends',
  'wow.exe':'World of Warcraft', 'rainbowsix.exe':'Rainbow Six',
  'pubg.exe':'PUBG', 'tslgame.exe':'PUBG', 'forzahorizon5.exe':'Forza Horizon 5'
};
let lastGame = null;
function listProcs(cb){
  const cmd = process.platform === 'win32' ? 'tasklist /fo csv /nh' : 'ps -axco comm';
  exec(cmd, { maxBuffer: 1024*1024*8, windowsHide: true }, (e, o) => cb(e ? '' : String(o).toLowerCase()));
}
function startGameDetection(){
  const tick = () => listProcs(out => {
    let found = null;
    for (const exe in GAMES){ if (out.includes(exe)){ found = GAMES[exe]; break; } }
    if (found !== lastGame){
      lastGame = found;
      const js = found
        ? `window.appAutoActivity&&window.appAutoActivity('playing',${JSON.stringify(found)})`
        : `window.appAutoActivity&&window.appAutoActivity('','')`;
      if (win && !win.isDestroyed()) win.webContents.executeJavaScript(js).catch(()=>{});
    }
  });
  setTimeout(tick, 5000);
  setInterval(tick, 20000);
}
