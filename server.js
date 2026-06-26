// =====================================================================
//  BIZIM DISCORD - Sunucu (server.js)
//  Sifir bagimlilik: sadece Node.js'in kendi modulleri kullanilir.
//  Calistirmak icin:  node server.js
//  Sonra tarayicidan:  http://localhost:3000
// =====================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// DATA_DIR / UPLOAD_DIR ortam degiskeniyle degistirilebilir.
// Railway/Fly gibi yerlerde kalici diski (volume) buraya baglayinca
// acilan hesaplar ve yuklenen dosyalar yeniden baslatmada KAYBOLMAZ.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Kanallar ---
const TEXT_CHANNELS  = ['genel', 'oyun', 'muzik', 'sohbet'];
const VOICE_CHANNELS = ['Sesli Oda 1', 'Sesli Oda 2', 'Oyun Odasi'];

// --- Kalici kayit (dosyaya yazilir, sunucu kapansa da kalir) ---
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const FRIENDS_FILE  = path.join(DATA_DIR, 'friends.json');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
function loadJSON(f, def){ try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e){ return def; } }
function saveJSON(f, obj){ try { fs.writeFileSync(f, JSON.stringify(obj)); } catch(e){} }
let profiles = loadJSON(PROFILES_FILE, {});   // username -> { avatar, bio }
let friends  = loadJSON(FRIENDS_FILE, {});    // username -> { friends:[], requests:[] }
let users    = loadJSON(USERS_FILE, {});      // email -> { username, salt, hash, created }
let sessions = loadJSON(SESSIONS_FILE, {});   // token -> username

const key = u => (u||'').toLowerCase();

// --- Hesap / oturum yardimcilari ---
function hashPassword(password, salt){
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}
function usernameTaken(username){
  const k = key(username);
  return Object.values(users).some(u => key(u.username) === k);
}
function createSession(username){
  const token = crypto.randomBytes(24).toString('hex');
  sessions[token] = username;
  saveJSON(SESSIONS_FILE, sessions);
  return token;
}
function userFromToken(token){
  return token && sessions[token] ? sessions[token] : null;
}
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e||''));

function getProfile(user){
  const p = profiles[key(user)] || {};
  return { user, avatar: p.avatar || null, bio: p.bio || '' };
}
function getFriendData(user){
  if (!friends[key(user)]) friends[key(user)] = { friends: [], requests: [] };
  return friends[key(user)];
}

// --- Bellekteki durum ---
const clients = new Map();              // clientId -> { res, user }
const history = {};                     // kanal -> son mesajlar
TEXT_CHANNELS.forEach(c => history[c] = []);
const voiceMembers = {};                // sesli oda -> Set(clientId)
VOICE_CHANNELS.forEach(c => voiceMembers[c] = new Set());

function sendTo(clientId, payload){
  const c = clients.get(clientId);
  if (c && c.res) { try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch(e){} }
}
function sendToUser(user, payload){      // ayni kullanici adina sahip tum baglantilar
  for (const [id, c] of clients) if (key(c.user) === key(user)) {
    try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch(e){}
  }
}
function broadcast(payload, exceptId){
  for (const [id, c] of clients){
    if (id === exceptId) continue;
    try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch(e){}
  }
}
function broadcastPresence(){
  const seen = new Set();
  const users = [];
  for (const [id, c] of clients){
    users.push({ id, user: c.user, avatar: getProfile(c.user).avatar });
  }
  const voice = {};
  for (const room of VOICE_CHANNELS){
    voice[room] = [...voiceMembers[room]]
      .filter(id => clients.has(id))
      .map(id => ({ id, user: clients.get(id).user, avatar: getProfile(clients.get(id).user).avatar }));
  }
  broadcast({ type: 'presence', users, voice });
}

function readJSON(req, cb){
  let body = '';
  req.on('data', d => { body += d; if (body.length > 5e6) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch(e){ cb({}); } });
}
function saveBinary(req, res, onDone){
  const fname = decodeURIComponent(req.headers['x-filename'] || 'dosya');
  const mime = req.headers['content-type'] || 'application/octet-stream';
  const safe = fname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const stored = crypto.randomBytes(6).toString('hex') + '_' + safe;
  const dest = path.join(UPLOAD_DIR, stored);
  const out = fs.createWriteStream(dest);
  let size = 0;
  req.on('data', d => { size += d.length; if (size > 60e6){ req.destroy(); out.destroy(); } });
  req.pipe(out);
  out.on('finish', () => onDone({ name: fname, url: '/uploads/' + stored, mime, size }));
  out.on('error', () => { res.writeHead(500); res.end('hata'); });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  // ---------- Kayit ol ----------
  if (p === '/api/register' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const username = String(data.username || '').trim().slice(0, 32);
      const email = String(data.email || '').trim().toLowerCase();
      const password = String(data.password || '');
      const fail = (msg) => { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: msg })); };
      if (!username) return fail('Kullanici adi gerekli');
      if (!isEmail(email)) return fail('Gecerli bir e-posta gir');
      if (password.length < 6) return fail('Sifre en az 6 karakter olmali');
      if (users[email]) return fail('Bu e-posta zaten kayitli');
      if (usernameTaken(username)) return fail('Bu kullanici adi alinmis');
      const salt = crypto.randomBytes(16).toString('hex');
      users[email] = { username, salt, hash: hashPassword(password, salt), created: Date.now() };
      saveJSON(USERS_FILE, users);
      getFriendData(username);
      const token = createSession(username);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token, username }));
    });
  }

  // ---------- Giris yap ----------
  if (p === '/api/login' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const email = String(data.email || '').trim().toLowerCase();
      const password = String(data.password || '');
      const fail = () => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'E-posta veya sifre hatali' })); };
      const u = users[email];
      if (!u) return fail();
      const hash = hashPassword(password, u.salt);
      const ok = hash.length === u.hash.length &&
                 crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(u.hash));
      if (!ok) return fail();
      const token = createSession(u.username);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token, username: u.username }));
    });
  }

  // ---------- Cikis yap ----------
  if (p === '/api/logout' && req.method === 'POST'){
    return readJSON(req, (data) => {
      if (data.token && sessions[data.token]){ delete sessions[data.token]; saveJSON(SESSIONS_FILE, sessions); }
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Oturum dogrula (token -> kullanici) ----------
  if (p === '/api/session'){
    const user = userFromToken(url.searchParams.get('token'));
    if (!user){ res.writeHead(401); return res.end('gecersiz'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ username: user }));
  }

  // ---------- SSE ----------
  if (p === '/events'){
    const clientId = url.searchParams.get('id');
    const user = userFromToken(url.searchParams.get('token'));
    if (!clientId){ res.writeHead(400); return res.end('id gerekli'); }
    if (!user){ res.writeHead(401); return res.end('once giris yap'); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients.set(clientId, { res, user });
    getFriendData(user); // kayit olustur

    sendTo(clientId, { type: 'init', textChannels: TEXT_CHANNELS, voiceChannels: VOICE_CHANNELS,
      history, me: getProfile(user), friends: getFriendData(user) });
    broadcastPresence();

    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch(e){} }, 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(clientId);
      for (const room of VOICE_CHANNELS)
        if (voiceMembers[room].delete(clientId)) broadcast({ type: 'voice-leave', room, id: clientId });
      broadcastPresence();
    });
    return;
  }

  // ---------- Mesaj gonder ----------
  if (p === '/api/message' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const { id, channel, text } = data;
      const c = clients.get(id);
      if (!c || !text || !TEXT_CHANNELS.includes(channel)){ res.writeHead(400); return res.end(); }
      const msg = { type:'message', channel, user:c.user, avatar:getProfile(c.user).avatar,
        text:String(text).slice(0,2000), ts:Date.now() };
      history[channel].push(msg); if (history[channel].length > 100) history[channel].shift();
      broadcast(msg); res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Kanal gecmisi ----------
  if (p === '/api/history'){
    const channel = url.searchParams.get('channel');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(history[channel] || []));
  }

  // ---------- Dosya yukle ----------
  if (p === '/api/upload' && req.method === 'POST'){
    const c = clients.get(req.headers['x-client-id']);
    const channel = decodeURIComponent(req.headers['x-channel'] || 'genel');
    if (!c || !TEXT_CHANNELS.includes(channel)){ res.writeHead(400); return res.end(); }
    return saveBinary(req, res, (file) => {
      const msg = { type:'message', channel, user:c.user, avatar:getProfile(c.user).avatar, ts:Date.now(), file };
      history[channel].push(msg); if (history[channel].length > 100) history[channel].shift();
      broadcast(msg); res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Profil fotografi yukle ----------
  if (p === '/api/avatar' && req.method === 'POST'){
    const c = clients.get(req.headers['x-client-id']);
    if (!c){ res.writeHead(400); return res.end(); }
    return saveBinary(req, res, (file) => {
      const k = key(c.user);
      profiles[k] = profiles[k] || {};
      profiles[k].avatar = file.url;
      saveJSON(PROFILES_FILE, profiles);
      broadcast({ type:'profile-update', user:c.user, profile:getProfile(c.user) });
      broadcastPresence();
      res.writeHead(200); res.end(JSON.stringify({ url: file.url }));
    });
  }

  // ---------- Profil bilgisi (bio) guncelle ----------
  if (p === '/api/profile' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id);
      if (!c){ res.writeHead(400); return res.end(); }
      const k = key(c.user);
      profiles[k] = profiles[k] || {};
      if (typeof data.bio === 'string') profiles[k].bio = data.bio.slice(0, 300);
      saveJSON(PROFILES_FILE, profiles);
      broadcast({ type:'profile-update', user:c.user, profile:getProfile(c.user) });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Bir kullanicinin profilini getir ----------
  if (p === '/api/get-profile'){
    const user = url.searchParams.get('user') || '';
    const online = [...clients.values()].some(c => key(c.user) === key(user));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ...getProfile(user), online }));
  }

  // ---------- Arkadas islemleri ----------
  if (p === '/api/friend' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id);
      if (!c){ res.writeHead(400); return res.end(); }
      const me = c.user, target = (data.target || '').trim();
      if (!target || key(target) === key(me)){ res.writeHead(400); return res.end('gecersiz'); }
      const myF = getFriendData(me), tgF = getFriendData(target);

      if (data.action === 'add'){
        if (myF.friends.some(f => key(f)===key(target))){ res.writeHead(200); return res.end('zaten arkadas'); }
        if (!tgF.requests.some(r => key(r)===key(me))) tgF.requests.push(me);
        sendToUser(target, { type:'friend-request', from: me });
      } else if (data.action === 'accept'){
        myF.requests = myF.requests.filter(r => key(r)!==key(target));
        if (!myF.friends.some(f => key(f)===key(target))) myF.friends.push(target);
        if (!tgF.friends.some(f => key(f)===key(me))) tgF.friends.push(me);
        sendToUser(target, { type:'friend-accepted', by: me });
      } else if (data.action === 'reject'){
        myF.requests = myF.requests.filter(r => key(r)!==key(target));
      } else if (data.action === 'remove'){
        myF.friends = myF.friends.filter(f => key(f)!==key(target));
        tgF.friends = tgF.friends.filter(f => key(f)!==key(me));
      }
      saveJSON(FRIENDS_FILE, friends);
      sendToUser(me, { type:'friend-update', friends: getFriendData(me) });
      sendToUser(target, { type:'friend-update', friends: getFriendData(target) });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Yuklenen dosyalar ----------
  if (p.startsWith('/uploads/')){
    const file = path.join(UPLOAD_DIR, path.basename(p));
    if (fs.existsSync(file)){ res.writeHead(200); return fs.createReadStream(file).pipe(res); }
    res.writeHead(404); return res.end();
  }

  // ---------- Sesli oda ----------
  if (p === '/api/voice' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const { id, action, room } = data;
      if (!clients.has(id) || !VOICE_CHANNELS.includes(room)){ res.writeHead(400); return res.end(); }
      if (action === 'join'){
        const existing = [...voiceMembers[room]].filter(x => clients.has(x));
        voiceMembers[room].add(id);
        sendTo(id, { type:'voice-peers', room, peers: existing });
        broadcast({ type:'voice-join', room, id, user: clients.get(id).user }, id);
      } else if (action === 'leave'){
        voiceMembers[room].delete(id);
        broadcast({ type:'voice-leave', room, id });
      }
      broadcastPresence(); res.writeHead(200); res.end('ok');
    });
  }

  // ---------- WebRTC signaling ----------
  if (p === '/api/signal' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const { to, from, signal, room } = data;
      if (clients.has(to)) sendTo(to, { type:'signal', from, signal, room });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Statik dosyalar ----------
  let file = p === '/' ? '/index.html' : p;
  const full = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (full.startsWith(PUBLIC_DIR) && fs.existsSync(full) && fs.statSync(full).isFile()){
    const ext = path.extname(full).toLowerCase();
    const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    return fs.createReadStream(full).pipe(res);
  }
  res.writeHead(404); res.end('Bulunamadi');
});

// 0.0.0.0 -> ayni agdaki telefon/bilgisayarlar da baglanabilir
server.listen(PORT, '0.0.0.0', () => {
  console.log('===================================================');
  console.log('  BIZIM DISCORD calisiyor! 🎉');
  console.log('  Bu bilgisayardan:   http://localhost:' + PORT);
  console.log('  Ayni wifi-deki telefon/PC:  http://<BU-BILGISAYARIN-IP>:' + PORT);
  console.log('  (IP ogrenmek icin Windows-ta cmd-ye: ipconfig)');
  console.log('  Durdurmak icin:  Ctrl + C');
  console.log('===================================================');
});
