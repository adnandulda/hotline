// =====================================================================
//  BIZIM DISCORD - Sunucu (server.js)  — COKLU SUNUCU (Discord mantigi)
//  Sifir bagimlilik: sadece Node.js'in kendi modulleri kullanilir.
//  Calistirmak icin:  node server.js   ->  http://localhost:3000
// =====================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// --- Kalici kayit dosyalari ---
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const FRIENDS_FILE  = path.join(DATA_DIR, 'friends.json');
const USERS_FILE    = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const DMS_FILE      = path.join(DATA_DIR, 'dms.json');
const SERVERS_FILE  = path.join(DATA_DIR, 'servers.json');
const INVITES_FILE  = path.join(DATA_DIR, 'invites.json');
const HISTORY_FILE  = path.join(DATA_DIR, 'history.json');

function loadJSON(f, def){ try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch(e){ return def; } }
function saveJSON(f, obj){ try { fs.writeFileSync(f, JSON.stringify(obj)); } catch(e){} }

const key = u => (u||'').toLowerCase();

let profiles = loadJSON(PROFILES_FILE, {});   // username -> { avatar, bio, status, customStatus }
let friends  = loadJSON(FRIENDS_FILE, {});    // username -> { friends:[], requests:[] }
let users    = loadJSON(USERS_FILE, {});      // email -> { username, salt, hash, created }
let sessions = loadJSON(SESSIONS_FILE, {});   // token -> username
let dms      = loadJSON(DMS_FILE, {});        // "a|b" -> [ {from,to,text,file,ts} ]
let servers  = loadJSON(SERVERS_FILE, {});    // id -> {id,name,icon,owner,members[],text[],voice[],created}
let invites  = loadJSON(INVITES_FILE, {});    // code -> serverId
let history  = loadJSON(HISTORY_FILE, {});    // serverId -> { channel -> [msgs] }

function saveServers(){ saveJSON(SERVERS_FILE, servers); }
function saveInvites(){ saveJSON(INVITES_FILE, invites); }
function saveHistory(){ saveJSON(HISTORY_FILE, history); }

// --- Hesap / oturum ---
function hashPassword(password, salt){ return crypto.scryptSync(String(password), salt, 64).toString('hex'); }
function usernameTaken(username){ const k=key(username); return Object.values(users).some(u => key(u.username)===k); }
function createSession(username){ const token=crypto.randomBytes(24).toString('hex'); sessions[token]=username; saveJSON(SESSIONS_FILE, sessions); return token; }
function userFromToken(token){ return token && sessions[token] ? sessions[token] : null; }
const isEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e||''));

function getProfile(user){
  const p = profiles[key(user)] || {};
  return { user, avatar: p.avatar || null, bio: p.bio || '', status: p.status || 'online', customStatus: p.customStatus || '' };
}
function getFriendData(user){ if (!friends[key(user)]) friends[key(user)] = { friends: [], requests: [] }; return friends[key(user)]; }
function dmKey(a, b){ return [key(a), key(b)].sort().join('|'); }

// --- Sunucu yardimcilari ---
function newId(){ return crypto.randomBytes(8).toString('hex'); }
function newMsgId(){ return crypto.randomBytes(6).toString('hex'); }
function newInvite(){ let c; do { c = crypto.randomBytes(4).toString('hex'); } while (invites[c]); return c; }
function isMember(sid, user){ const s=servers[sid]; return !!(s && s.members.some(m=>key(m)===key(user))); }
function isServerOwner(sid, user){ const s=servers[sid]; return !!(s && key(s.owner)===key(user)); }
function userServers(user){ return Object.values(servers).filter(s=>s.members.some(m=>key(m)===key(user))); }
function serverSummary(s){ return { id:s.id, name:s.name, icon:s.icon||null, owner:s.owner }; }
function serverFull(s){ return { id:s.id, name:s.name, icon:s.icon||null, owner:s.owner, members:s.members, text:s.text, voice:s.voice }; }
function chHistory(sid, ch){ history[sid]=history[sid]||{}; if(!history[sid][ch]) history[sid][ch]=[]; return history[sid][ch]; }
function findMsg(sid, ch, msgId){ const h=(history[sid]||{})[ch]; return h ? (h.find(m=>m.id===msgId)||null) : null; }
function inviteCodeFor(sid){ let c=Object.keys(invites).find(x=>invites[x]===sid); if(!c){ c=newInvite(); invites[c]=sid; saveInvites(); } return c; }

// --- Bellekteki durum ---
const clients = new Map();              // clientId -> { res, user }
const voiceMembers = {};                // serverId -> { room -> Set(clientId) }
function vmRoom(sid, room){ voiceMembers[sid]=voiceMembers[sid]||{}; if(!voiceMembers[sid][room]) voiceMembers[sid][room]=new Set(); return voiceMembers[sid][room]; }

function sendTo(clientId, payload){
  const c = clients.get(clientId);
  if (c && c.res) { try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch(e){} }
}
function sendToUser(user, payload){
  for (const [id, c] of clients) if (key(c.user) === key(user)) { try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch(e){} }
}
function broadcast(payload, exceptId){   // TUM bagli istemciler (profil/durum/arkadas)
  for (const [id, c] of clients){ if (id===exceptId) continue; try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch(e){} }
}
function broadcastToServer(sid, payload, exceptId){   // sadece o sunucunun uyeleri
  const s=servers[sid]; if(!s) return;
  for (const [id, c] of clients){ if (id===exceptId) continue; if (s.members.some(m=>key(m)===key(c.user))){ try { c.res.write(`data: ${JSON.stringify(payload)}\n\n`); } catch(e){} } }
}

function onlineUsers(){   // gorunmez olanlar haric, tekil
  const seen=new Set(), arr=[];
  for (const [id,c] of clients){
    if (seen.has(key(c.user))) continue; seen.add(key(c.user));
    const pr=getProfile(c.user);
    if (pr.status==='invisible') continue;
    arr.push({ user:c.user, avatar:pr.avatar, status:pr.status, customStatus:pr.customStatus });
  }
  return arr;
}
function broadcastPresence(){
  const users = onlineUsers();
  for (const [id, c] of clients){
    const voice={};
    for (const s of userServers(c.user)){
      const vm=voiceMembers[s.id]||{};
      for (const room in vm){
        const a=[...vm[room]].filter(x=>clients.has(x)).map(x=>({ id:x, user:clients.get(x).user, avatar:getProfile(clients.get(x).user).avatar }));
        if (a.length){ voice[s.id]=voice[s.id]||{}; voice[s.id][room]=a; }
      }
    }
    sendTo(id, { type:'presence', users, voice });
  }
}

function readJSON(req, cb){
  let body=''; req.on('data', d=>{ body+=d; if(body.length>5e6) req.destroy(); });
  req.on('end', ()=>{ try{ cb(JSON.parse(body||'{}')); }catch(e){ cb({}); } });
}
function saveBinary(req, res, onDone){
  const fname = decodeURIComponent(req.headers['x-filename'] || 'dosya');
  const mime = req.headers['content-type'] || 'application/octet-stream';
  const safe = fname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const stored = crypto.randomBytes(6).toString('hex') + '_' + safe;
  const dest = path.join(UPLOAD_DIR, stored);
  const out = fs.createWriteStream(dest);
  let size=0;
  req.on('data', d=>{ size+=d.length; if(size>60e6){ req.destroy(); out.destroy(); } });
  req.pipe(out);
  out.on('finish', ()=> onDone({ name:fname, url:'/uploads/'+stored, mime, size }));
  out.on('error', ()=>{ res.writeHead(500); res.end('hata'); });
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
      const ok = hash.length === u.hash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(u.hash));
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

  // ---------- Oturum dogrula ----------
  if (p === '/api/session'){
    const user = userFromToken(url.searchParams.get('token'));
    if (!user){ res.writeHead(401); return res.end('gecersiz'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ username: user }));
  }

  // ---------- Hesap bilgisi ----------
  if (p === '/api/me'){
    const user = userFromToken(url.searchParams.get('token'));
    if (!user){ res.writeHead(401); return res.end('gecersiz'); }
    let email = '';
    for (const [e, u] of Object.entries(users)){ if (key(u.username) === key(user)){ email = e; break; } }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ username: user, email, profile: getProfile(user) }));
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
    getFriendData(user);

    sendTo(clientId, { type: 'init', me: getProfile(user), friends: getFriendData(user),
      servers: userServers(user).map(serverSummary) });
    broadcastPresence();

    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch(e){} }, 25000);
    req.on('close', () => {
      clearInterval(ping); clients.delete(clientId);
      for (const sid in voiceMembers){ for (const room in voiceMembers[sid]){
        if (voiceMembers[sid][room].delete(clientId)) broadcastToServer(sid, { type:'voice-leave', server:sid, room, id:clientId });
      } }
      broadcastPresence();
    });
    return;
  }

  // ---------- Sunucu olustur ----------
  if (p === '/api/server-create' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      const name = String(data.name||'').trim().slice(0,40);
      if (!name){ res.writeHead(400, { 'Content-Type':'application/json' }); return res.end(JSON.stringify({ error:'Sunucu adi gerekli' })); }
      const sid = newId();
      const s = { id:sid, name, icon:null, owner:c.user, members:[c.user], text:['genel'], voice:['Genel Ses'], created:Date.now() };
      servers[sid] = s; saveServers();
      history[sid] = { genel: [] }; saveHistory();
      const code = inviteCodeFor(sid);
      sendToUser(c.user, { type:'servers', servers: userServers(c.user).map(serverSummary) });
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ server: serverFull(s), invite: code }));
    });
  }

  // ---------- Davet kodu ile sunucuya katil ----------
  if (p === '/api/server-join' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      let code = String(data.code||'').trim();
      if (code.includes('/')) code = code.split('/').pop();   // tam link yapistirilirsa kodu al
      code = code.replace(/[^a-f0-9]/gi,'').toLowerCase();
      const sid = invites[code];
      const fail = (m) => { res.writeHead(400, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:m })); };
      if (!sid || !servers[sid]) return fail('Gecersiz davet kodu');
      const s = servers[sid];
      if (!s.members.some(m=>key(m)===key(c.user))){
        s.members.push(c.user); saveServers();
        broadcastToServer(sid, { type:'server-members', server:sid, members:s.members });
        broadcastPresence();
      }
      sendToUser(c.user, { type:'servers', servers: userServers(c.user).map(serverSummary) });
      res.writeHead(200, { 'Content-Type':'application/json' });
      res.end(JSON.stringify({ server: serverFull(s) }));
    });
  }

  // ---------- Sunucu verisi (kanallar + uyeler) ----------
  if (p === '/api/server-data'){
    const user = userFromToken(url.searchParams.get('token'));
    const sid = url.searchParams.get('server');
    if (!user){ res.writeHead(401); return res.end('gecersiz'); }
    const s = servers[sid];
    if (!s || !isMember(sid, user)){ res.writeHead(403); return res.end('uye degilsin'); }
    res.writeHead(200, { 'Content-Type':'application/json' });
    return res.end(JSON.stringify({ ...serverFull(s), invite: isMember(sid,user) ? inviteCodeFor(sid) : null }));
  }

  // ---------- Davet kodunu getir ----------
  if (p === '/api/invite'){
    const user = userFromToken(url.searchParams.get('token'));
    const sid = url.searchParams.get('server');
    if (!user || !isMember(sid, user)){ res.writeHead(403); return res.end('yetkisiz'); }
    res.writeHead(200, { 'Content-Type':'application/json' });
    return res.end(JSON.stringify({ code: inviteCodeFor(sid) }));
  }

  // ---------- Sunucudan ayril ----------
  if (p === '/api/server-leave' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      const s = servers[data.server]; if (!s){ res.writeHead(400); return res.end(); }
      if (key(s.owner)===key(c.user)){ res.writeHead(400, { 'Content-Type':'application/json' }); return res.end(JSON.stringify({ error:'Sahip ayrilamaz; sunucuyu silebilirsin' })); }
      s.members = s.members.filter(m=>key(m)!==key(c.user)); saveServers();
      sendToUser(c.user, { type:'servers', servers: userServers(c.user).map(serverSummary) });
      broadcastToServer(data.server, { type:'server-members', server:data.server, members:s.members });
      broadcastPresence();
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Sunucuyu sil (sahip) ----------
  if (p === '/api/server-delete' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      const s = servers[data.server]; if (!s || key(s.owner)!==key(c.user)){ res.writeHead(403); return res.end(); }
      const members = s.members.slice();
      delete servers[data.server]; delete history[data.server]; delete voiceMembers[data.server];
      for (const code in invites){ if (invites[code]===data.server) delete invites[code]; }
      saveServers(); saveHistory(); saveInvites();
      for (const u of members){ sendToUser(u, { type:'server-deleted', server:data.server }); sendToUser(u, { type:'servers', servers: userServers(u).map(serverSummary) }); }
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Mesaj gonder ----------
  if (p === '/api/message' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); const sid = data.server; const channel = data.channel; const text = data.text;
      const s = servers[sid];
      if (!c || !text || !s || !isMember(sid, c.user) || !s.text.includes(channel)){ res.writeHead(400); return res.end(); }
      let replyTo = null;
      if (data.replyTo){ const o = findMsg(sid, channel, data.replyTo); if (o) replyTo = { id:o.id, user:o.user, text:(o.text || (o.file ? '📎 '+o.file.name : '')).slice(0,120) }; }
      const msg = { type:'message', server:sid, id:newMsgId(), channel, user:c.user, avatar:getProfile(c.user).avatar,
        text:String(text).slice(0,2000), ts:Date.now(), reactions:{}, replyTo };
      const h = chHistory(sid, channel); h.push(msg); if (h.length>100) h.shift(); saveHistory();
      broadcastToServer(sid, msg); res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Mesaj duzenle ----------
  if (p === '/api/message-edit' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      const msg = findMsg(data.server, data.channel, data.msgId);
      if (!msg || key(msg.user)!==key(c.user) || msg.file){ res.writeHead(400); return res.end(); }
      msg.text = String(data.text||'').slice(0,2000); msg.edited = true; saveHistory();
      broadcastToServer(data.server, { type:'message-edit', server:data.server, channel:data.channel, msgId:msg.id, text:msg.text });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Mesaj sil ----------
  if (p === '/api/message-delete' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      const h = (history[data.server]||{})[data.channel]; if (!h){ res.writeHead(400); return res.end(); }
      const i = h.findIndex(m=>m.id===data.msgId);
      if (i<0 || key(h[i].user)!==key(c.user)){ res.writeHead(400); return res.end(); }
      h.splice(i,1); saveHistory();
      broadcastToServer(data.server, { type:'message-delete', server:data.server, channel:data.channel, msgId:data.msgId });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Emoji tepki ----------
  if (p === '/api/react' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); const emoji = String(data.emoji||'').slice(0,8);
      if (!c || !emoji){ res.writeHead(400); return res.end(); }
      const msg = findMsg(data.server, data.channel, data.msgId);
      if (!msg || !isMember(data.server, c.user)){ res.writeHead(400); return res.end(); }
      if (!msg.reactions) msg.reactions = {};
      const arr = msg.reactions[emoji] || [];
      const idx = arr.findIndex(u=>key(u)===key(c.user));
      if (idx>=0) arr.splice(idx,1); else arr.push(c.user);
      if (arr.length) msg.reactions[emoji]=arr; else delete msg.reactions[emoji];
      saveHistory();
      broadcastToServer(data.server, { type:'reaction', server:data.server, channel:data.channel, msgId:msg.id, reactions:msg.reactions });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Yaziyor... ----------
  if (p === '/api/typing' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); const s = servers[data.server];
      if (!c || !s || !isMember(data.server, c.user) || !s.text.includes(data.channel)){ res.writeHead(400); return res.end(); }
      broadcastToServer(data.server, { type:'typing', server:data.server, channel:data.channel, user:c.user }, data.id);
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Kanal gecmisi ----------
  if (p === '/api/history'){
    const user = userFromToken(url.searchParams.get('token'));
    const sid = url.searchParams.get('server'); const channel = url.searchParams.get('channel');
    if (!user || !isMember(sid, user)){ res.writeHead(403, { 'Content-Type':'application/json' }); return res.end('[]'); }
    res.writeHead(200, { 'Content-Type':'application/json' });
    return res.end(JSON.stringify((history[sid]||{})[channel] || []));
  }

  // ---------- Kanal yonetimi (sahip) ----------
  if (p === '/api/channel' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      const s = servers[data.server];
      const fail = (m) => { res.writeHead(400, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error:m })); };
      if (!s) return fail('Sunucu yok');
      if (key(s.owner)!==key(c.user)){ res.writeHead(403, { 'Content-Type':'application/json' }); return res.end(JSON.stringify({ error:'Sadece sunucu sahibi kanallari duzenleyebilir' })); }
      const kind = data.kind==='voice' ? 'voice' : 'text';
      const list = kind==='voice' ? s.voice : s.text;
      const norm = x => String(x||'').trim().slice(0,40);
      if (data.action==='add'){
        const name = norm(data.name);
        if (!name) return fail('Kanal adi gerekli');
        if (list.some(x=>key(x)===key(name))) return fail('Bu kanal zaten var');
        list.push(name);
        if (kind==='text') chHistory(s.id, name);
      } else if (data.action==='rename'){
        const name=norm(data.name), newName=norm(data.newName);
        const i=list.findIndex(x=>key(x)===key(name));
        if (i<0) return fail('Kanal bulunamadi');
        if (!newName) return fail('Yeni ad gerekli');
        if (list.some(x=>key(x)===key(newName) && key(x)!==key(name))) return fail('Bu ad zaten var');
        list[i]=newName;
        if (kind==='text'){ history[s.id]=history[s.id]||{}; history[s.id][newName]=history[s.id][name]||[]; if(name!==newName) delete history[s.id][name]; }
      } else if (data.action==='delete'){
        const name=norm(data.name);
        const i=list.findIndex(x=>key(x)===key(name));
        if (i<0) return fail('Kanal bulunamadi');
        if (kind==='text' && list.length<=1) return fail('En az bir yazi kanali kalmali');
        list.splice(i,1);
        if (kind==='text' && history[s.id]) delete history[s.id][name];
        if (kind==='voice' && voiceMembers[s.id]) delete voiceMembers[s.id][name];
      } else return fail('Gecersiz islem');
      saveServers(); saveHistory();
      broadcastToServer(s.id, { type:'channels', server:s.id, text:s.text, voice:s.voice });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Sunucu adi (sahip) ----------
  if (p === '/api/server' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); const s = servers[data.server];
      if (!c){ res.writeHead(401); return res.end(); }
      if (!s || key(s.owner)!==key(c.user)){ res.writeHead(403, { 'Content-Type':'application/json' }); return res.end(JSON.stringify({ error:'Sadece sunucu sahibi' })); }
      const name = String(data.name||'').trim().slice(0,40);
      if (name) s.name = name; saveServers();
      broadcastToServer(s.id, { type:'server-update', server: serverSummary(s) });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Sunucu ikonu (sahip) ----------
  if (p === '/api/server-icon' && req.method === 'POST'){
    const c = clients.get(req.headers['x-client-id']); const sid = req.headers['x-server']; const s = servers[sid];
    if (!c || !s || key(s.owner)!==key(c.user)){ res.writeHead(403); return res.end(); }
    return saveBinary(req, res, (file) => {
      s.icon = file.url; saveServers();
      broadcastToServer(sid, { type:'server-update', server: serverSummary(s) });
      res.writeHead(200); res.end(JSON.stringify({ url: file.url }));
    });
  }

  // ---------- DM ----------
  if (p === '/api/dm'){
    if (req.method === 'GET'){
      const me = userFromToken(url.searchParams.get('token'));
      const other = url.searchParams.get('with') || '';
      if (!me){ res.writeHead(401); return res.end('giris yap'); }
      res.writeHead(200, { 'Content-Type':'application/json' });
      return res.end(JSON.stringify(dms[dmKey(me, other)] || []));
    }
    if (req.method === 'POST'){
      return readJSON(req, (data) => {
        const c = clients.get(data.id); const to = String(data.to||'').trim(); const text = String(data.text||'').slice(0,2000);
        if (!c || !to || !text){ res.writeHead(400); return res.end(); }
        const msg = { from:c.user, to, text, ts:Date.now(), avatar:getProfile(c.user).avatar };
        const k = dmKey(c.user, to);
        if (!dms[k]) dms[k]=[]; dms[k].push(msg); if (dms[k].length>200) dms[k].shift();
        saveJSON(DMS_FILE, dms);
        sendToUser(to, { type:'dm', ...msg }); sendToUser(c.user, { type:'dm', ...msg });
        res.writeHead(200); res.end('ok');
      });
    }
  }

  // ---------- Dosya yukle ----------
  if (p === '/api/upload' && req.method === 'POST'){
    const c = clients.get(req.headers['x-client-id']);
    const sid = req.headers['x-server'];
    const channel = decodeURIComponent(req.headers['x-channel'] || '');
    const s = servers[sid];
    if (!c || !s || !isMember(sid, c.user) || !s.text.includes(channel)){ res.writeHead(400); return res.end(); }
    return saveBinary(req, res, (file) => {
      const msg = { type:'message', server:sid, id:newMsgId(), channel, user:c.user, avatar:getProfile(c.user).avatar, ts:Date.now(), file, reactions:{} };
      const h = chHistory(sid, channel); h.push(msg); if (h.length>100) h.shift(); saveHistory();
      broadcastToServer(sid, msg); res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Profil fotografi ----------
  if (p === '/api/avatar' && req.method === 'POST'){
    const c = clients.get(req.headers['x-client-id']);
    if (!c){ res.writeHead(400); return res.end(); }
    return saveBinary(req, res, (file) => {
      const k = key(c.user); profiles[k] = profiles[k] || {}; profiles[k].avatar = file.url;
      saveJSON(PROFILES_FILE, profiles);
      broadcast({ type:'profile-update', user:c.user, profile:getProfile(c.user) });
      broadcastPresence();
      res.writeHead(200); res.end(JSON.stringify({ url: file.url }));
    });
  }

  // ---------- Profil (bio) ----------
  if (p === '/api/profile' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(400); return res.end(); }
      const k = key(c.user); profiles[k] = profiles[k] || {};
      if (typeof data.bio === 'string') profiles[k].bio = data.bio.slice(0, 300);
      saveJSON(PROFILES_FILE, profiles);
      broadcast({ type:'profile-update', user:c.user, profile:getProfile(c.user) });
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Durum ----------
  if (p === '/api/status' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(401); return res.end(); }
      const k = key(c.user); profiles[k] = profiles[k] || {};
      if (['online','idle','dnd','invisible'].includes(data.status)) profiles[k].status = data.status;
      if (typeof data.customStatus === 'string') profiles[k].customStatus = data.customStatus.slice(0, 80);
      saveJSON(PROFILES_FILE, profiles);
      broadcast({ type:'profile-update', user:c.user, profile:getProfile(c.user) });
      broadcastPresence();
      res.writeHead(200); res.end('ok');
    });
  }

  // ---------- Profil getir ----------
  if (p === '/api/get-profile'){
    const user = url.searchParams.get('user') || '';
    const online = [...clients.values()].some(c => key(c.user) === key(user));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ...getProfile(user), online }));
  }

  // ---------- Arkadas islemleri ----------
  if (p === '/api/friend' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const c = clients.get(data.id); if (!c){ res.writeHead(400); return res.end(); }
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
      const { id, action, room } = data; const sid = data.server; const s = servers[sid];
      if (!clients.has(id) || !s || !isMember(sid, clients.get(id).user) || !s.voice.includes(room)){ res.writeHead(400); return res.end(); }
      const set = vmRoom(sid, room);
      if (action === 'join'){
        const existing = [...set].filter(x => clients.has(x));
        set.add(id);
        sendTo(id, { type:'voice-peers', server:sid, room, peers: existing });
        broadcastToServer(sid, { type:'voice-join', server:sid, room, id, user: clients.get(id).user }, id);
      } else if (action === 'leave'){
        set.delete(id);
        broadcastToServer(sid, { type:'voice-leave', server:sid, room, id });
      }
      broadcastPresence(); res.writeHead(200); res.end('ok');
    });
  }

  // ---------- WebRTC signaling ----------
  if (p === '/api/signal' && req.method === 'POST'){
    return readJSON(req, (data) => {
      const { to, from, signal, room, server: sid } = data;
      if (clients.has(to)) sendTo(to, { type:'signal', from, signal, room, server:sid });
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

server.listen(PORT, '0.0.0.0', () => {
  console.log('===================================================');
  console.log('  BIZIM DISCORD calisiyor! 🎉  (coklu sunucu)');
  console.log('  Bu bilgisayardan:   http://localhost:' + PORT);
  console.log('  Ayni wifi-deki telefon/PC:  http://<BU-BILGISAYARIN-IP>:' + PORT);
  console.log('  Durdurmak icin:  Ctrl + C');
  console.log('===================================================');
});
