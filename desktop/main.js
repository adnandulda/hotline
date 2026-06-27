// =====================================================================
//  Suicide Hotline - Masaustu (Electron)
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
    backgroundColor: '#0b0b0e', title: 'Suicide Hotline',
    icon: iconImage(),
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0b0b0e', symbolColor: '#ff2e88', height: 34 },
    webPreferences: { contextIsolation: true }
  });
  win.loadURL(APP_URL);
  // Ust bar uygulamaya gomulsun: surukleme alani + pencere kontrollerine yer ac
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(
      '.topbar{-webkit-app-region:drag; padding-right:150px}' +
      '.topbar button,.topbar input,.topbar .title,.topbar [onclick]{-webkit-app-region:no-drag}'
    ).catch(()=>{});
  });
  // disari acilan linkler tarayicida acilsin
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // kapatinca tepsiye in (tepsi varsa)
  win.on('close', (e) => { if (!quitting && tray){ e.preventDefault(); win.hide(); } });
}

function setupTray(){
  try{
    tray = new Tray(iconImage());
    tray.setToolTip('Suicide Hotline');
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
function parseCsvLine(line){
  const m = line.match(/"((?:[^"]|"")*)"/g);
  return m ? m.map(s => s.slice(1, -1).replace(/""/g, '"')) : [];
}
function detectGame(low){
  for (const exe in GAMES){ if (low.includes(exe)) return { type:'playing', name:GAMES[exe] }; }
  return null;
}
// Etkinligi bul: once oyun, yoksa Spotify (pencere basligindan calan sarki)
function getActivity(cb){
  if (process.platform !== 'win32'){
    exec('ps -axco comm', { maxBuffer:1024*1024*8 }, (e,o)=> cb(e?null:detectGame(String(o).toLowerCase())));
    return;
  }
  exec('tasklist /v /fo csv /nh', { maxBuffer:1024*1024*16, windowsHide:true }, (e,o)=>{
    if (e){ cb(null); return; }
    const text = String(o);
    const g = detectGame(text.toLowerCase());
    if (g){ cb(g); return; }
    // Spotify: pencere basligi "Sanatci - Sarki" ise caliyor demektir
    let song = null;
    for (const line of text.split(/\r?\n/)){
      const cols = parseCsvLine(line); if (!cols.length) continue;
      if ((cols[0]||'').toLowerCase() === 'spotify.exe'){
        const title = cols[cols.length-1] || '';
        if (title && title !== 'N/A' && /\s-\s/.test(title) && !/^spotify( |$)/i.test(title)){ song = title; break; }
      }
    }
    cb(song ? { type:'listening', name:song } : null);
  });
}
let lastAct = '';
function startGameDetection(){
  const tick = () => getActivity(act => {
    const k = act ? act.type+'|'+act.name : '';
    if (k !== lastAct){
      lastAct = k;
      const js = act
        ? `window.appAutoActivity&&window.appAutoActivity(${JSON.stringify(act.type)},${JSON.stringify(act.name)})`
        : `window.appAutoActivity&&window.appAutoActivity('','')`;
      if (win && !win.isDestroyed()) win.webContents.executeJavaScript(js).catch(()=>{});
    }
  });
  setTimeout(tick, 4000);
  setInterval(tick, 12000);
}
