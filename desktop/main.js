// =====================================================================
//  Suicide Hotline - Masaustu (Electron)
//  Web uygulamasini bir masaustu penceresinde acar + ekstra ozellikler:
//   - sistem tepsisi (kapatinca tepsiye iner)
//   - native masaustu bildirimleri (web app zaten Notification kullaniyor)
//   - OTOMATIK OYUN ALGILAMA: acik oyunu bulur, "Oynuyor X" yapar
//  Calistirmak:  cd desktop && npm install && npm start
// =====================================================================

const { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } = require('electron');
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
    frame: false,                       // Windows cercevesi tamamen kalksin
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, 'preload.js') }
  });
  win.loadURL(APP_URL);
  // Ust kisim uygulamanin devami olsun: surukleme alani + kendi pencere dugmelerimiz
  win.webContents.on('did-finish-load', () => { injectChrome(); });
  // buyut/eski-haline durumu degisince dugme ikonu guncellensin
  win.on('maximize',   () => win.webContents.executeJavaScript("window.__setMax&&window.__setMax(true)").catch(()=>{}));
  win.on('unmaximize', () => win.webContents.executeJavaScript("window.__setMax&&window.__setMax(false)").catch(()=>{}));
  // disari acilan linkler tarayicida acilsin
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // kapatinca tepsiye in (tepsi varsa)
  win.on('close', (e) => { if (!quitting && tray){ e.preventDefault(); win.hide(); } });
}

// Cercevesiz pencerede ust kismi uygulamaya gom: surukleme alani + kendi pencere dugmeleri
function injectChrome(){
  if (!win || win.isDestroyed()) return;
  const H = 34;   // ust serit yuksekligi (px)
  const css = `
    /* tum uygulamayi seridin altina it (cakisma biter) */
    body{padding-top:${H}px !important; box-sizing:border-box !important}
    #wintop{position:fixed; top:0; left:0; right:0; height:${H}px; -webkit-app-region:drag;
      background:#0b0b0e; border-bottom:1px solid rgba(255,255,255,.06); display:flex; align-items:center;
      z-index:2147483647; font-family:Segoe UI,system-ui,sans-serif; user-select:none}
    #wintop .wt-title{padding-left:14px; font-size:12.5px; font-weight:600; color:#9aa0aa; letter-spacing:.3px; flex:1}
    #wintop .wt-btns{display:flex; -webkit-app-region:no-drag}
    #wintop .wt-btns button{width:46px; height:${H}px; border:0; background:transparent; color:#cfd2da; cursor:pointer;
      display:flex; align-items:center; justify-content:center; transition:background .12s, color .12s}
    #wintop .wt-btns button:hover{background:rgba(255,255,255,.10)}
    #wintop .wt-btns button.wc-close:hover{background:#e81123; color:#fff}
    #wintop svg{width:11px; height:11px; fill:none; stroke:currentColor; stroke-width:1.2}
  `;
  win.webContents.insertCSS(css).catch(()=>{});
  const js = `(function(){
    if(document.getElementById('wintop')) return;
    var bar=document.createElement('div'); bar.id='wintop';
    bar.innerHTML =
      '<div class="wt-title">Suicide Hotline</div>'+
      '<div class="wt-btns">'+
        '<button class="wc-min" title="Kucult"><svg viewBox="0 0 12 12"><line x1="2" y1="6" x2="10" y2="6"/></svg></button>'+
        '<button class="wc-max" title="Buyut"><svg viewBox="0 0 12 12"><rect x="2.2" y="2.2" width="7.6" height="7.6"/></svg></button>'+
        '<button class="wc-close" title="Kapat"><svg viewBox="0 0 12 12"><line x1="2.5" y1="2.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="2.5" x2="2.5" y2="9.5"/></svg></button>'+
      '</div>';
    document.body.appendChild(bar);
    var api=window.desktopAPI||{};
    bar.querySelector('.wc-min').onclick=function(){ api.minimize&&api.minimize(); };
    bar.querySelector('.wc-max').onclick=function(){ api.maximize&&api.maximize(); };
    bar.querySelector('.wc-close').onclick=function(){ api.close&&api.close(); };
    window.__setMax=function(m){ var b=bar.querySelector('.wc-max'); if(b) b.title=m?'Eski boyut':'Buyut'; };
  })();`;
  win.webContents.executeJavaScript(js).catch(()=>{});
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

// ---- Pencere kontrolleri (preload -> ipc) ----
ipcMain.on('win-min',   () => { if (win) win.minimize(); });
ipcMain.on('win-max',   () => { if (win){ win.isMaximized() ? win.unmaximize() : win.maximize(); } });
ipcMain.on('win-close', () => { if (win) win.close(); });

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
