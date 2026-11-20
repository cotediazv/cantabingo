const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const PATTERNS = require('./public/patterns.js');

const PORT = process.env.PORT || 3000;
// Si existe un disco permanente montado en /var/data, los datos se guardan ahí y sobreviven a los reinicios
const DISK_DIR = '/var/data';
const hasDisk = (() => { try { fs.accessSync(DISK_DIR, fs.constants.W_OK); return true; } catch { return false; } })();
const DATA_FILE = process.env.DATA_FILE || path.join(hasDisk ? DISK_DIR : __dirname, 'data.json');
const SESSION_HOURS = 8; // cuánto dura una sesión de bingo desde que se activa

// ---------- Almacenamiento (JSON en disco) ----------
let db = { projects: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* primera ejecución */ }
for (const s of Object.values(db.sessions)) s.auto = { on: false, interval: 10, stopOnWin: true };
// Las salas se llaman «Los Juegos de…»; las ya creadas con el nombre anterior se renombran al arrancar
for (const x of [...Object.values(db.sessions || {}), ...Object.values(db.projects || {})]) {
  if (typeof x.name === 'string') x.name = x.name.replace(/^El Bingo de /, 'Los Juegos de ');
}
// Datos anteriores: los nombres ya guardados también pasan a mayúsculas
{
  const up = (n) => String(n || '').toLocaleUpperCase('es');
  for (const s of Object.values(db.sessions)) { for (const pl of Object.values(s.players || {})) pl.name = up(pl.name); for (const r of s.results || []) r.name = up(r.name); if (s.tieWinner) s.tieWinner.name = up(s.tieWinner.name); }
  for (const p of Object.values(db.people || {})) p.name = up(p.name);
  if (db.raffle) { db.raffle.picked = (db.raffle.picked || []).map(up); for (const k of ['roll', 'tie']) if (db.raffle[k]) { db.raffle[k].winner = up(db.raffle[k].winner); db.raffle[k].names = (db.raffle[k].names || []).map(up); } }
  for (const w of Object.values(db.wheels || {})) { for (const c of w.players || []) c.name = up(c.name); if (w.setup && w.setup.players) w.setup.players = w.setup.players.map(up); }
}
let saveTimer = null;
let writing = false;
let dirty = false;
// Escribe primero un archivo temporal y luego lo renombra: si el proceso muere a mitad,
// el archivo anterior queda intacto.
function writeNow() {
  if (writing) { dirty = true; return; }
  writing = true;
  fs.writeFile(`${DATA_FILE}.tmp`, JSON.stringify(db), (err) => {
    const done = () => { writing = false; if (dirty) { dirty = false; writeNow(); } };
    if (err) { console.error('No se pudo guardar:', err.message); return done(); }
    fs.rename(`${DATA_FILE}.tmp`, DATA_FILE, done);
  });
}
// Guarda como mucho una vez por segundo, aunque haya cientos de cambios seguidos
const save = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 1000);
};
// Al apagarse o reiniciarse el servicio, guarda todo antes de salir
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    try { fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(db)); fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE); } catch (err) { console.error('No se pudo guardar al salir:', err.message); }
    process.exit(0);
  });
}
const id = (n = 8) => crypto.randomBytes(n).toString('hex');
const shortId = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out;
  do out = Array.from(crypto.randomBytes(6), (b) => abc[b % abc.length]).join(''); while (db.sessions[out]);
  return out;
};
const clamp = (v, lo, hi, def) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
const str = (v, max, def = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);

// ---------- Generación de cartones ----------
// Los valores van de 1 a N. La columna c usa el rango floor(c*N/5)+1 .. floor((c+1)*N/5).
const columnRange = (c, n) => [Math.floor((c * n) / 5) + 1, Math.floor(((c + 1) * n) / 5)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeCard(n, freeCenter) {
  const card = new Array(25);
  for (let c = 0; c < 5; c++) {
    const [lo, hi] = columnRange(c, n);
    const pool = shuffle(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
    for (let r = 0; r < 5; r++) card[r * 5 + c] = pool[r];
  }
  if (freeCenter) card[12] = 0; // 0 = casilla libre
  return card;
}
function makeCards(count, n, freeCenter) {
  const seen = new Set();
  const cards = [];
  while (cards.length < count) {
    const card = makeCard(n, freeCenter);
    const key = card.join(',');
    if (!seen.has(key)) { seen.add(key); cards.push(card); }
  }
  return cards;
}

// Una vez (20 nov, regla de Cote: junto al QR siempre «Escanea el código QR con tu celular»): las franjas del GC
// guardadas con el texto anterior pasan al nuevo
if (!db.qrPhraseFix) {
  const fix = (g) => { if (g && g.top === 'Escanea el código QR y participa') g.top = 'Escanea el código QR con tu celular y participa'; if (g && g.bottom === 'Pon tu nombre y apellido y participa') g.bottom = 'Pon tu nombre, apellido y participa'; };
  fix(db.gcDefaults);
  for (const s of Object.values(db.sessions || {})) fix(s.gc);
  db.qrPhraseFix = true;
}
const gcDefaults = () => db.gcDefaults || { top: 'Escanea el código QR con tu celular y participa', bottom: 'Pon tu nombre, apellido y participa' };

// ---------- Lógica de sesión ----------
const clients = {}; // sessionId -> Set<res> (SSE)
const timers = {}; // sessionId -> intervalo de modo automático

function cardOf(s, cardNo) { return db.projects[s.projectId].cards[cardNo - 1]; }
function drawnMask(s, cardNo) {
  const drawn = new Set(s.drawn);
  return cardOf(s, cardNo).reduce((m, v, i) => (v === 0 || drawn.has(v) ? m | (1 << i) : m), 0);
}
function markMask(s, cardNo) {
  const marks = s.marks[cardNo] || [];
  const free = cardOf(s, cardNo)[12] === 0 ? 1 << 12 : 0;
  return (marks.reduce((m, i) => m | (1 << i), 0) | free) & drawnMask(s, cardNo);
}
// Detecta patrones completados. Devuelve true si aparece un resultado nuevo.
function evaluate(s) {
  // Con el ganador confirmado la ronda terminó: nadie más puede ganar (aunque se reconecte o marque después)
  if (roundOver(s)) return false;
  const owners = {};
  // Solo puede ganar quien tiene su cartón abierto en este momento (conexión en vivo activa)
  const online = new Set([...(clients[s.id] || [])].map((res) => res.playerToken));
  const spots = {};
  for (const [token, pl] of Object.entries(s.players)) if (online.has(token)) for (const c of pl.cards) { owners[c] = pl.name; spots[c] = pl.place || ''; }
  let added = false;
  for (const cardNo of Object.keys(owners).map(Number)) {
    const dm = drawnMask(s, cardNo);
    for (const pid of s.patterns) {
      if (s.results.some((r) => r.cardNo === cardNo && r.pattern === pid)) continue;
      if (PATTERNS.completed(pid, dm)) {
        // Gana apenas los números sorteados completan la figura, aunque la persona no haya marcado su cartón:
        // se le marcan solas las casillas ya anunciadas y la celebración sale en todas las pantallas.
        const drawnNow = new Set(s.drawn);
        s.marks[cardNo] = cardOf(s, cardNo).reduce((all, v, i) => (v !== 0 && drawnNow.has(v) ? [...all, i] : all), []);
        s.results.push({ cardNo, pattern: pid, name: owners[cardNo], place: spots[cardNo], validated: true, at: s.drawn.length });
        s.hideWin = false;
        s.celebrateAt = Date.now(); // desde cuándo hay celebración: a los 6 s el GC la recoge abajo
        added = true;
      }
    }
  }
  // Un cartón se valida solo cuando el jugador marca la última casilla del patrón.
  for (const r of s.results) {
    if (!r.validated && PATTERNS.completed(r.pattern, markMask(s, r.cardNo))) { r.validated = true; s.hideWin = false; s.celebrateAt = Date.now(); } // cada ganador nuevo vuelve a mostrar la celebración
  }
  return added;
}
// El moderador recibe la lista completa de resultados; los participantes solo los cartones
// ganadores (sin nombres), que es lo único que necesitan y pesa mucho menos.
function publicState(s, full = false) {
  const p = db.projects[s.projectId];
  const results = full ? s.results : s.results.filter((r) => r.validated && !r.dismissed).map((r) => ({ cardNo: r.cardNo, pattern: r.pattern, validated: true, name: r.name }));
  return {
    id: s.id, name: s.name, round: s.round, closed: !!s.closed, expires: s.expires,
    format: p.format, headers: p.headers, values: p.values, items: p.items, showName: s.showName,
    gc: s.gc || gcDefaults(), startNumber: p.startNumber, theme: s.theme || 'frida',
    // Celebración a pantalla completa mientras haya ganadores y el moderador no la haya quitado
    bigQr: !!s.bigQr, tieWinner: s.tieWinner || null, rollMs: 6500,
    celebrate: !s.hideWin && s.results.some((r) => r.validated && !r.dismissed),
    // Durante El Rosco los celulares cambian el cartón por las preguntas del rosco en curso
    stage: db.stage || 'bingo', roscoId: db.stage === 'rueda' ? (Object.values(db.wheels || {}).sort((a, b) => b.created - a.created)[0] || {}).id || null : null,
    celebrateAt: s.celebrateAt || 0,
    voteRev: (db.vote || {}).rev || 0, // los celulares vuelven a leer la votación cuando cambia
    winConfirmed: roundOver(s), winConfirmedAt: s.confirmedAt || 0, now: Date.now(),
    patterns: s.patterns, drawn: s.drawn, results, finalists: s.finalists || null,
    auto: s.auto, cardsPerPlayer: s.cardsPerPlayer, totalCards: p.cards.length,
    players: Object.values(s.players).length,
  };
}
// Los avisos se agrupan: si llegan muchos cambios seguidos (cientos de personas entrando o
// marcando a la vez) se envía un solo estado cada 150 ms en vez de uno por cada cambio.
const pending = {};
function send(s) {
  const all = clients[s.id];
  if (!all || !all.size) return;
  const slim = `data: ${JSON.stringify(publicState(s))}\n\n`;
  let full = null;
  for (const res of all) {
    if (res.isAdmin) res.write(full ||= `data: ${JSON.stringify(publicState(s, true))}\n\n`);
    else res.write(slim);
  }
}
function broadcast(s, now = false) {
  save();
  if (now) { clearTimeout(pending[s.id]); delete pending[s.id]; send(s); return; }
  if (pending[s.id]) return;
  pending[s.id] = setTimeout(() => { delete pending[s.id]; if (db.sessions[s.id]) send(s); }, 150);
}
function stopAuto(s) { clearInterval(timers[s.id]); delete timers[s.id]; s.auto.on = false; }
// Con el ganador confirmado el sorteo terminó: no salen más números hasta la siguiente ronda
const roundOver = (s) => s.results.some((r) => r.confirmed && !r.dismissed);
function draw(s, value) {
  if (roundOver(s)) return false;
  const p = db.projects[s.projectId];
  if (value == null) {
    const drawn = new Set(s.drawn);
    const left = [];
    for (let v = 1; v <= p.values; v++) if (!drawn.has(v)) left.push(v);
    if (!left.length) return false;
    value = left[crypto.randomInt(left.length)];
  } else if (!(value >= 1 && value <= p.values) || s.drawn.includes(value)) return false;
  s.drawn.push(value);
  if (db.stage === 'qr') setStage('bingo');
  s.bigQr = false; // al salir el primer número se retira el QR grande de la pantalla
  const added = evaluate(s);
  if ((added && s.auto.stopOnWin) || s.drawn.length >= p.values) stopAuto(s);
  return true;
}
function closeSession(s) {
  stopAuto(s);
  s.closed = true;
  broadcast(s, true);
  for (const res of clients[s.id] || []) res.end();
  delete clients[s.id];
  const p = db.projects[s.projectId];
  if (p && p.sessionId === s.id) p.sessionId = null;
  delete db.sessions[s.id];
  if (!Object.keys(db.sessions).length) resetEvent(); // terminó la jornada: no queda nada para la siguiente
  save();
}
// Deja en blanco lo que pertenece a una jornada: lista de participantes del sorteo, elegidos y roscos.
// Se hace al cerrarse la sala (a mano o a las 8 horas) y al crear una nueva.
function resetEvent() {
  db.people = {};
  db.gameDraw = { played: [], last: null, rule2: true, total: (db.gameDraw || {}).total || 3, list: [], ready: null }; // sorteo del siguiente juego: parte de cero en cada sala
  db.raffle = { picked: [], roll: null };
  wheel.clear();
  vote.clear();
  db.stage = 'bingo';
}
setInterval(() => {
  for (const s of Object.values(db.sessions)) if (Date.now() > s.expires) closeSession(s);
  // Roscos sueltos (creados sin sala abierta) también vencen a las 8 horas
  if (wheel.clear(Date.now() - SESSION_HOURS * 3600e3)) save();
  // Sin sala abierta no debe quedar gente en la lista del sorteo (por ejemplo, de una jornada anterior)
  if (!Object.keys(db.sessions).length && (Object.keys(db.people || {}).length || ((db.raffle || {}).picked || []).length)) {
    db.people = {};
    db.raffle = { picked: [], roll: null };
    save();
  }
}, 30000).unref();

// ---------- API ----------
const app = express();
app.set('trust proxy', 1); // detrás del proxy del hosting, para ver la IP real
app.use(express.json({ limit: '1mb' }));
// Sin caché: así cada celular recibe siempre la última versión publicada
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
// Enlace corto de la pantalla vertical de Kennedy (pedido de Cote: fácil de escribir con el control del decodificador;
// solo esta, los demás enlaces siguen como están porque los OBS ya están configurados). Lo que vaya después de «?»
// (por ejemplo ?diag=1) se mantiene.
const SHORT_LINKS = { vk: '#/vertical/kennedy' };
app.get('/:short', (req, res, next) => {
  const to = SHORT_LINKS[String(req.params.short).toLowerCase()];
  if (!to) return next();
  const i = req.originalUrl.indexOf('?');
  res.redirect(302, `/${i >= 0 ? req.originalUrl.slice(i) : ''}${to}`);
});

const fail = (res, code, error) => res.status(code).json({ error });
const summary = (p) => ({
  id: p.id, name: p.name, theme: p.theme || 'frida', format: p.format, count: p.cards.length, values: p.values,
  created: p.created, sessionId: p.sessionId || null,
});
function ownProject(req, res) {
  const p = db.projects[req.params.id];
  if (!p) { fail(res, 404, 'Proyecto no encontrado'); return null; }
  return p;
}
function hostSession(req, res) {
  const s = db.sessions[req.params.sid];
  if (!s) { fail(res, 404, 'Sesión no encontrada'); return null; }
  return s;
}

// ---------- Acceso del moderador ----------
// Usuario y contraseña se leen de variables de entorno; nunca se guardan en el código.
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const AUTH_READY = Boolean(ADMIN_USER && ADMIN_PASS);
const AUTH_KEY = crypto.createHash('sha256').update(`cantabingo:${ADMIN_USER}:${ADMIN_PASS}`).digest();
const TOKEN_MS = 7 * 24 * 3600e3;
const sha = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
const sign = (exp) => crypto.createHmac('sha256', AUTH_KEY).update(String(exp)).digest('hex');
function validToken(token) {
  if (!AUTH_READY || typeof token !== 'string') return false;
  const [exp, sig] = token.split('.');
  return Number(exp) > Date.now() && crypto.timingSafeEqual(sha(sig), sha(sign(exp)));
}
const requireAdmin = (req, res, next) => (validToken(req.get('x-admin')) ? next() : fail(res, 401, 'Inicia sesión como moderador'));
const attempts = {}; // ip -> { n, until }: frena los intentos de adivinar la contraseña

// ---------- Acceso del equipo de cada local (sala light) ----------
// Una clave común del equipo, que el moderador pone en el Centro de control (se guarda cifrada, nunca en el código).
// Con ella, cada local entra por su enlace (#/equipo/<local>) y solo maneja SU sala light: no la sala principal ni otros locales.
const STAFF_VENUES = ['frida', 'kennedy', 'tobalaba'];
const STAFF_MS = 16 * 3600e3;
const staffSign = (v, exp) => crypto.createHmac('sha256', AUTH_KEY).update(`staff:${v}:${exp}`).digest('hex');
function staffVenue(token) {
  if (!AUTH_READY || typeof token !== 'string') return '';
  const [v, exp, sig] = token.split('.');
  if (!STAFF_VENUES.includes(v) || !(Number(exp) > Date.now()) || !sig) return '';
  return crypto.timingSafeEqual(sha(sig), sha(staffSign(v, exp))) ? v : '';
}
const reqVenue = (req) => String((req.query || {}).local || (req.body || {}).local || (req.body || {}).venue || '');
// Moderador, o equipo del mismo local que se está manejando
const requireLocal = (req, res, next) => {
  if (validToken(req.get('x-admin'))) return next();
  const v = staffVenue(req.get('x-staff'));
  if (v && v === reqVenue(req)) return next();
  return fail(res, 401, 'Entra con la clave del equipo de este local');
};
const staffHash = (clave, salt) => crypto.scryptSync(String(clave), salt, 32).toString('hex');

app.post('/api/login', (req, res) => {
  if (!AUTH_READY) return fail(res, 503, 'El acceso de moderador aún no está configurado en el servidor (ADMIN_USER y ADMIN_PASS)');
  const a = (attempts[req.ip] ||= { n: 0, until: 0 });
  if (Date.now() < a.until) return fail(res, 429, 'Demasiados intentos. Espera 10 minutos.');
  const b = req.body || {};
  const okUser = crypto.timingSafeEqual(sha(b.user), sha(ADMIN_USER));
  const okPass = crypto.timingSafeEqual(sha(b.pass), sha(ADMIN_PASS));
  if (!(okUser && okPass)) {
    if (++a.n >= 8) { a.n = 0; a.until = Date.now() + 10 * 60e3; }
    return fail(res, 401, 'Usuario o contraseña incorrectos');
  }
  delete attempts[req.ip];
  const exp = Date.now() + TOKEN_MS;
  res.json({ token: `${exp}.${sign(exp)}` });
});
// Una clave por local (decisión de Cote). Si quedó guardada la clave común de antes, sirve para los 3 hasta cambiarla.
db.staff ||= {};
if (db.staff.hash) { const old = { salt: db.staff.salt, hash: db.staff.hash }; db.staff = {}; for (const v of STAFF_VENUES) db.staff[v] = old; }
app.get('/api/staff/clave', requireAdmin, (_req, res) => res.json(Object.fromEntries(STAFF_VENUES.map((v) => [v, Boolean((db.staff[v] || {}).hash)]))));
app.post('/api/staff/clave', requireAdmin, (req, res) => {
  const b = req.body || {};
  const v = String(b.local || '');
  const clave = String(b.clave || '').trim();
  if (!STAFF_VENUES.includes(v)) return fail(res, 400, 'Elige el local');
  if (clave.length < 4) return fail(res, 400, 'La clave debe tener al menos 4 caracteres');
  if (clave.toLowerCase() === 'admin') return fail(res, 400, 'Elige una clave distinta de «admin»');
  const salt = crypto.randomBytes(16).toString('hex');
  db.staff[v] = { salt, hash: staffHash(clave, salt), at: Date.now() };
  save();
  res.json({ ok: true });
});
app.post('/api/staff/login', (req, res) => {
  const b = req.body || {};
  const v = String(b.local || '');
  if (!STAFF_VENUES.includes(v)) return fail(res, 400, 'Local no válido');
  const k = db.staff[v] || {};
  if (!AUTH_READY || !k.hash) return fail(res, 503, 'Todavía no hay clave para este local. Pídesela a Cote.');
  const a = attempts[`staff:${req.ip || 'x'}`] ||= { n: 0, until: 0 };
  if (Date.now() < a.until) return fail(res, 429, 'Demasiados intentos. Espera 10 minutos.');
  const ok = crypto.timingSafeEqual(Buffer.from(staffHash(String(b.clave || ''), k.salt), 'hex'), Buffer.from(k.hash, 'hex'));
  if (!ok) { a.n++; if (a.n >= 8) { a.n = 0; a.until = Date.now() + 10 * 60e3; } return fail(res, 401, 'Clave incorrecta'); }
  a.n = 0;
  const exp = Date.now() + STAFF_MS;
  res.json({ token: `${v}.${exp}.${staffSign(v, exp)}`, venue: v });
});
app.get('/api/staff/me', (req, res) => res.json({ venue: staffVenue(req.get('x-staff')) }));
app.get('/api/me', (req, res) => res.json({ admin: validToken(req.get('x-admin')) }));
app.use('/api/projects', requireAdmin);
app.use('/api/sessions/:sid/host', requireAdmin);

app.get('/api/projects', (req, res) => {
  res.json(Object.values(db.projects).sort((a, b) => b.created - a.created).map(summary));
});

app.post('/api/projects', (req, res) => {
  const b = req.body || {};
  const format = ['numbers', 'words', 'emojis'].includes(b.format) ? b.format : 'numbers';
  let items = null;
  let values = clamp(b.values, 25, 150, 75);
  if (format !== 'numbers') {
    items = [...new Set((Array.isArray(b.items) ? b.items : []).map((x) => str(x, 60)).filter(Boolean))];
    if (items.length < 25) return fail(res, 400, 'Se necesitan al menos 25 palabras o emojis distintos');
    items = items.slice(0, 150);
    values = items.length;
  }
  const headers = [...str(b.headers, 5, 'BINGO').toUpperCase()];
  while (headers.length < 5) headers.push(' ');
  const p = {
    id: id(), created: Date.now(), format, values, items,
    name: str(b.name, 60, 'Proyecto de bingo'),
    theme: ['frida', 'tobalaba', 'kennedy'].includes(b.theme) ? b.theme : 'frida', // colores en pantalla según el local
    headers: headers.slice(0, 5).join(''), freeCenter: b.freeCenter !== false,
    startNumber: clamp(b.startNumber, 1, 999999, 1),
    sessionId: null,
  };
  p.cards = makeCards(clamp(b.count, 25, 3000, 320), values, p.freeCenter);
  db.projects[p.id] = p;
  save();
  res.json(summary(p));
});

app.get('/api/projects/:id', (req, res) => { const p = ownProject(req, res); if (p) res.json(p); });

app.delete('/api/projects/:id', (req, res) => {
  const p = ownProject(req, res);
  if (!p) return;
  if (p.sessionId && db.sessions[p.sessionId]) closeSession(db.sessions[p.sessionId]);
  delete db.projects[p.id];
  save();
  res.json({ ok: true });
});

const cleanPatterns = (list) => {
  const out = [...new Set((Array.isArray(list) ? list : []).filter((x) => PATTERNS.byId[x]))].slice(0, 1); // un patrón por ronda
  return out.length ? out : ['linea'];
};

// Activar el generador de números de un proyecto
app.post('/api/projects/:id/session', (req, res) => {
  const p = ownProject(req, res);
  if (!p) return;
  if (p.sessionId && db.sessions[p.sessionId]) return res.json({ id: p.sessionId });
  // Una sola sala a la vez: mientras haya una abierta no se puede activar otra
  const open = Object.values(db.sessions)[0];
  if (open) return fail(res, 409, `Ya hay una sala abierta (${open.name}). Ciérrala en el Centro de control para crear otra.`);
  res.json({ id: startSession(p, req.body || {}).id });
});
function startSession(p, b) {
  const s = {
    id: shortId(), projectId: p.id, name: str(b.name, 50, p.name), password: str(b.password, 40),
    cardsPerPlayer: clamp(b.cardsPerPlayer, 1, 4, 1),
    showName: b.showName !== false, isPublic: b.isPublic !== false, patterns: cleanPatterns(b.patterns),
    bigQr: true, // la sesión parte mostrando el QR en grande para que la gente entre
    theme: ['frida', 'tobalaba', 'kennedy'].includes(b.theme) ? b.theme : 'frida', // colores de la gráfica según el local
    gc: { ...gcDefaults() }, // textos de la gráfica de OBS: se heredan de la última sesión
    round: 1, drawn: [], results: [], marks: {}, players: {}, finalists: null,
    auto: { on: false, interval: 10, stopOnWin: true },
    created: Date.now(), expires: Date.now() + SESSION_HOURS * 3600e3,
  };
  resetEvent(); // una sala nueva parte limpia: sin participantes ni roscos de jornadas anteriores
  db.sessions[s.id] = s;
  setStage('bingo'); // al activar un bingo, la pantalla de OBS pasa sola a su gráfica
  p.sessionId = s.id;
  evaluate(s);
  save();
  return s;
}

app.post('/api/sessions/:sid/host/:action', (req, res) => {
  const s = hostSession(req, res);
  if (!s) return;
  const b = req.body || {};
  if (db.stage === 'qr') setStage('bingo'); // cualquier acción del bingo retira el QR a pantalla completa
  switch (req.params.action) {
    case 'draw':
      if (roundOver(s)) return fail(res, 400, 'El ganador ya fue confirmado: para seguir hay que iniciar la siguiente ronda');
      if (!draw(s, b.value == null ? null : parseInt(b.value, 10))) return fail(res, 400, 'No se pudo generar ese valor');
      break;
    case 'auto':
      stopAuto(s);
      if (b.on && roundOver(s)) return fail(res, 400, 'El ganador ya fue confirmado: para seguir hay que iniciar la siguiente ronda');
      s.auto.interval = clamp(b.interval, 5, 60, s.auto.interval);
      s.auto.stopOnWin = !!b.stopOnWin;
      if (b.on) {
        s.auto.on = true;
        timers[s.id] = setInterval(() => { draw(s); broadcast(s); }, s.auto.interval * 1000);
      }
      break;
    case 'restart':
      stopAuto(s);
      Object.assign(s, { round: s.round + 1, drawn: [], results: [], marks: {}, finalists: null, tieWinner: null, hideWin: false, confirmedAt: 0, patterns: cleanPatterns(b.patterns) });
      setStage('bingo'); // la ronda nueva devuelve la pantalla a la gráfica del bingo
      evaluate(s);
      break;
    case 'confirmwin': { // el animador da por bueno al ganador que está en pantalla
      const tied = new Set(s.results.filter((r) => r.validated && !r.dismissed).map((r) => r.cardNo)).size > 1;
      if (tied && !s.tieWinner) return fail(res, 400, 'Hay un empate: primero hay que desempatar por sorteo');
      for (const r of s.results) {
        if (!r.validated || r.dismissed) continue;
        // Tras un desempate gana solo el elegido; los demás empatados quedan fuera de la celebración
        if (tied && r.cardNo !== s.tieWinner.cardNo) r.dismissed = true; else r.confirmed = true;
      }
      stopAuto(s);
      s.confirmedAt = Date.now();
      // Quien no fue confirmado queda fuera: el cartel muestra solo al ganador aceptado
      for (const r of s.results) if (!r.confirmed) r.dismissed = true;
      if (tied) { s.hideWin = false; setStage('bingo'); } // vuelve la gráfica del bingo, con la celebración del ganador único
      break;
    }
    case 'keepplaying': // se descartan los ganadores sin confirmar y el juego sigue: esos cartones ya no vuelven a ganar en la ronda
      for (const r of s.results) if (r.validated && !r.confirmed) r.dismissed = true;
      s.tieWinner = null;
      break;
    case 'bigqr': s.bigQr = b.on !== false; break; // cartel con el QR en grande, para antes de empezar
    case 'hidewin': s.hideWin = b.hide !== false; break; // quitar o volver a mostrar la celebración en pantalla
    case 'gc':
      // Textos de las franjas de la gráfica de OBS; quedan como predeterminados para las próximas sesiones
      s.gc = { top: str(b.top, 90), bottom: str(b.bottom, 140) };
      db.gcDefaults = { ...s.gc };
      break;
    case 'final': {
      stopAuto(s);
      const done = [...new Set(s.results.filter((r) => r.validated).map((r) => r.cardNo))];
      s.finalists = shuffle(done).slice(0, clamp(b.keep, 1, 3000, 1));
      break;
    }
    case 'close':
      closeSession(s);
      return res.json({ ok: true });
    default:
      return fail(res, 404, 'Acción desconocida');
  }
  broadcast(s);
  res.json({ ok: true });
});

app.get('/api/sessions/:sid/host', (req, res) => {
  const s = hostSession(req, res);
  if (s) res.json({ password: s.password, isPublic: s.isPublic, round: s.round, patterns: s.patterns, gc: s.gc || gcDefaults(), roundOver: roundOver(s) });
});

// Sesiones activas: a ellas llevan el enlace y el QR fijos
app.get('/api/current', (_req, res) => {
  res.json({ sessions: Object.values(db.sessions).sort((a, b) => b.created - a.created)
    .map((s) => ({ id: s.id, name: s.name, round: s.round, locked: !!s.password, theme: s.theme || 'frida', projectId: s.projectId })) });
});

// Lista pública de sesiones activas
app.get('/api/sessions', (_req, res) => {
  res.json(Object.values(db.sessions).filter((s) => s.isPublic).sort((a, b) => b.created - a.created)
    .map((s) => ({ id: s.id, name: s.name, round: s.round, locked: !!s.password })));
});

app.get('/api/sessions/:sid', (req, res) => {
  const s = db.sessions[req.params.sid];
  if (!s) return fail(res, 404, 'La sesión no existe o ya terminó');
  // Lugares del local (los mismos del formulario de karaoke): se eligen al entrar, para saber dónde está cada persona
  res.json({ id: s.id, name: s.name, locked: !!s.password, cardsPerPlayer: s.cardsPerPlayer, places: karaoke.placesFor(s.theme || 'frida') });
});

// Un participante se une (o recupera sus cartones con su token)
app.post('/api/sessions/:sid/join', (req, res) => {
  const s = db.sessions[req.params.sid];
  if (!s) return fail(res, 404, 'La sesión no existe o ya terminó');
  const b = req.body || {};
  const p = db.projects[s.projectId];
  let token = typeof b.token === 'string' ? b.token : '';
  let pl = s.players[token];
  if (!pl) {
    if (!b.name && !b.password) return fail(res, 401, 'Únete con tu nombre y la contraseña');
    if (s.password && b.password !== s.password) return fail(res, 403, 'Contraseña incorrecta');
    // Nombre y apellido son obligatorios para entrar
    // Los nombres se guardan siempre en mayúsculas, para que se vean parejos en pantalla
    const first = str(b.name, 20).replace(/\s+/g, ' ').toLocaleUpperCase('es');
    const last = str(b.surname, 25).replace(/\s+/g, ' ').toLocaleUpperCase('es');
    if (!first || !last) return fail(res, 400, 'Escribe tu nombre y tu apellido para participar');
    const places = karaoke.placesFor(s.theme || 'frida');
    const place = places.find((x) => x === String(b.place || '').trim()) || '';
    if (places.length && !place) return fail(res, 400, 'Elige el lugar donde estás');
    const taken = new Set(Object.values(s.players).flatMap((x) => x.cards));
    const cards = [];
    for (let c = 1; c <= p.cards.length && cards.length < s.cardsPerPlayer; c++) if (!taken.has(c)) cards.push(c);
    if (!cards.length) return fail(res, 409, 'Ya no quedan cartones disponibles en esta sesión');
    token = id(12);
    pl = s.players[token] = { name: `${first} ${last}`, first, cards, place };
    // Lista de participantes para el sorteo de concursantes del rosco (sin repetir nombres)
    (db.people ||= {})[pl.name.toLowerCase().replace(/\s+/g, ' ')] = { name: pl.name, at: Date.now() };
    evaluate(s);
    broadcast(s);
  }
  res.json({
    token, name: pl.name, place: pl.place || '', startNumber: p.startNumber,
    cards: pl.cards.map((no) => ({ no, cells: p.cards[no - 1], marks: s.marks[no] || [] })),
  });
});

app.post('/api/sessions/:sid/mark', (req, res) => {
  const s = db.sessions[req.params.sid];
  const b = req.body || {};
  const pl = s && s.players[b.token];
  if (!pl || !pl.cards.includes(b.cardNo)) return fail(res, 403, 'Cartón no asignado');
  const cell = clamp(b.cell, 0, 24, -1);
  const value = cardOf(s, b.cardNo)[cell];
  if (cell < 0 || value === 0) return fail(res, 400, 'Casilla no válida');
  const marks = new Set(s.marks[b.cardNo] || []);
  if (b.on) {
    if (!s.drawn.includes(value)) return fail(res, 409, 'Ese valor todavía no ha sido anunciado');
    marks.add(cell);
  } else marks.delete(cell);
  s.marks[b.cardNo] = [...marks];
  const before = s.results.filter((r) => r.validated).length;
  evaluate(s);
  if (s.results.filter((r) => r.validated).length !== before) broadcast(s); else save();
  res.json({ marks: s.marks[b.cardNo] });
});

// Marca por el participante todos los valores ya anunciados que le falten
app.post('/api/sessions/:sid/sync', (req, res) => {
  const s = db.sessions[req.params.sid];
  const pl = s && s.players[(req.body || {}).token];
  if (!pl) return fail(res, 403, 'No estás en esta sesión');
  const drawn = new Set(s.drawn);
  const marks = {};
  for (const cardNo of pl.cards) {
    const all = [];
    cardOf(s, cardNo).forEach((v, i) => { if (v !== 0 && drawn.has(v)) all.push(i); });
    marks[cardNo] = s.marks[cardNo] = all;
  }
  const before = s.results.filter((r) => r.validated).length;
  evaluate(s);
  if (s.results.filter((r) => r.validated).length !== before) broadcast(s); else save();
  res.json({ marks, state: publicState(s) });
});

// Flujo de eventos en tiempo real (anfitrión, participantes y tablero)
app.get('/api/sessions/:sid/events', (req, res) => {
  const s = db.sessions[req.params.sid];
  if (!s) return fail(res, 404, 'La sesión no existe o ya terminó');
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.isAdmin = validToken(req.query.admin);
  res.playerToken = String(req.query.token || ''); // permite saber qué participantes están conectados ahora
  const comesBack = Boolean(s.players[res.playerToken]);
  res.write(`data: ${JSON.stringify(publicState(s, res.isAdmin))}\n\n`);
  (clients[s.id] ||= new Set()).add(res);
  // Si vuelve alguien cuyo cartón ya completaba la figura, gana en ese momento
  if (comesBack && evaluate(s)) broadcast(s);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients[s.id]?.delete(res); });
});

// Segundo juego de la plataforma
// Pantalla única de OBS: qué gráfica se muestra ahora. Cambia sola al activar un bingo,
// crear un rosco o lanzar un sorteo; el moderador también puede cambiarla a mano.
const STAGES = ['bingo', 'rueda', 'sorteo', 'qr', 'karaoke', 'show', 'voto', 'insta', 'juego', 'none'];
// Pedido de Cote: el juego que está en actividad tiene prioridad. Mientras haya un rosco en juego, la pantalla queda en
// El Rosco aunque se apriete otra cosa (un botón del bingo, el escenario a mano o el karaoke automático); al terminar
// el rosco (ganador, empate o se acabó), todo vuelve a funcionar como siempre. Devuelve false si no se cambió.
let roscoRef = null; // El Rosco (wheel.js), una vez cargado
const roscoLock = (show) => show !== 'rueda' && !!roscoRef && roscoRef.inPlay();
const setStage = (show) => {
  if (roscoLock(show)) { if (db.stage !== 'rueda') { db.stage = 'rueda'; save(); for (const s of Object.values(db.sessions)) broadcast(s); } return false; }
  const changed = db.stage !== show;
  db.stage = show;
  save();
  if (changed) for (const s of Object.values(db.sessions)) broadcast(s); // los celulares se enteran del cambio de juego
};
const wheel = require('./wheel.js')({ app, db, save, requireAdmin, fail, setStage, findPlayer: (sid, token) => ((db.sessions[sid] || {}).players || {})[token] || null });
roscoRef = wheel;
// Tras corregir un nombre, se vuelve a enviar el estado a todas las pantallas abiertas
const refreshAll = () => { Object.values(db.sessions).forEach((s) => broadcast(s)); wheel.refresh(); };
// Nombres de quienes tienen su cartón abierto en este momento (conexión en vivo activa)
const connectedNames = () => {
  const out = new Set();
  for (const s of Object.values(db.sessions)) {
    for (const res of clients[s.id] || []) {
      const pl = s.players[res.playerToken];
      if (pl) out.add(pl.name);
    }
  }
  return out;
};
require('./raffle.js')({ app, db, save, requireAdmin, fail, setStage, refreshAll, connectedNames });

let lightApi = null; // sala light (light.js): se conecta más abajo
const karaoke = require('./karaoke.js')({ app, db, save, requireAdmin, requireLocal, fail, salaVenue: () => (Object.values(db.sessions)[0] || {}).theme || '',
  findPlayer: (sid, token) => ((db.sessions[sid] || {}).players || {})[token] || (lightApi ? lightApi.findPlayer(sid, token) : null),
  lightVenue: (sid) => (lightApi ? lightApi.venueOf(sid) : ''), extraVenues: () => (lightApi ? lightApi.pollVenues() : []) });
// Votación del público (nota del 1 al 10 desde el celular)
const vote = require('./vote.js')({ app, db, save, requireAdmin, fail, setStage,
  findPlayer: (sid, token) => ((db.sessions[sid] || {}).players || {})[token] || null,
  venue: () => (Object.values(db.sessions)[0] || {}).theme || 'frida',
  notify: () => Object.values(db.sessions).forEach((s) => broadcast(s)) });
// «Síguenos en Instagram»: la cuenta del local de la sala abierta
const insta = require('./insta.js')({ app, db, save, requireAdmin, fail, venue: () => (Object.values(db.sessions)[0] || {}).theme || (db.karaoke || {}).venue || 'frida' });
// Sala light: karaoke, show y cartelera en otro local, al mismo tiempo que la sala principal
lightApi = require('./light.js')({ app, db, save, requireAdmin, requireLocal, fail, karaoke, insta });
require('./vertical.js')({ app, db, save, requireAdmin, fail, karaoke, dir: path.dirname(DATA_FILE) }); // pantalla vertical: video del mes y actividades
require('./youtube.js')({ app }); // últimos videos del canal, para la página web
require('./twitch.js')({ app }); // videos y transmisiones en vivo de Twitch, para la página web
require('./instagram-web.js')({ app, db, save, insta }); // últimos videos de Instagram de cada local, para la página web

// Consola general: en qué está cada local (sala principal o sala light), su bloque del horario y su karaoke
const STAGE_NAMES = { bingo: 'Bingo', rueda: 'El Rosco', sorteo: 'Sorteo', qr: 'QR grande', karaoke: 'Karaoke', show: 'Show', voto: 'Votación', insta: 'Instagram', none: 'Nada', cartelera: 'Cartelera de la semana' };
app.get('/api/consola', requireAdmin, async (_req, res) => {
  const main = Object.values(db.sessions)[0] || null;
  const out = await Promise.all(['kennedy', 'frida', 'tobalaba'].map(async (v) => {
    const light = lightApi.pubOf(v);
    const isMain = !!main && (main.theme || 'frida') === v;
    const c = await lightApi.carteleraOf(v).catch(() => null);
    return {
      venue: v,
      main: isMain ? { name: main.name, stage: db.stage || 'bingo', stageName: STAGE_NAMES[db.stage || 'bingo'] || db.stage, players: Object.keys(main.players || {}).length } : null,
      light: light.open ? { ...light, stageName: STAGE_NAMES[light.stage] || light.stage } : null,
      block: c ? { current: c.current, next: c.next, show: c.show } : null,
      karaoke: karaoke.nowOf(v),
    };
  }));
  res.json({ locales: out, at: Date.now() });
});
// Programación del local del día: el de la sala abierta o, si no hay, el elegido en la sección Karaoke
require('./agenda.js')({ app, db, save, requireAdmin, fail, currentVenue: () => (Object.values(db.sessions)[0] || {}).theme || (db.karaoke || {}).venue || 'frida' });

// Sorteo del siguiente juego (pedido de Cote): la sala parte con un bingo; después se sortea entre todos los juegos
// (Bingo, El Rosco, El Festival y El objeto más extraño; el karaoke no es un juego), el bingo incluido desde el primer
// sorteo. El juego que sale queda bloqueado solo para el sorteo siguiente y después vuelve a estar disponible.
// El sorteo se ve en el tablero y en el GC (escenario «juego»).
const DRAW_GAMES = ['bingo', 'rosco', 'festival', 'objeto'];
db.gameDraw ||= { played: [], last: null };
if (!db.gameDraw.rule2) { db.gameDraw.played = db.gameDraw.last ? [db.gameDraw.last.game] : []; db.gameDraw.rule2 = true; }
app.get('/api/gamedraw', (_req, res) => res.json({ ...db.gameDraw, games: DRAW_GAMES, venue: (Object.values(db.sessions)[0] || {}).theme || 'frida', now: Date.now() }));
// Cuántos juegos se sortean esa noche (pedido de Cote): juego inicial (bingo) + 1.º, 2.º, 3.º… sorteados
db.gameDraw.list ||= [];
db.gameDraw.total ||= 3;
app.post('/api/gamedraw/total', requireAdmin, (req, res) => {
  const n = Math.round(Number((req.body || {}).total));
  if (!(n >= 1 && n <= 10)) return fail(res, 400, 'Elige entre 1 y 10 juegos');
  if (n < db.gameDraw.list.length) return fail(res, 400, `Ya se sortearon ${db.gameDraw.list.length} juegos`);
  db.gameDraw.total = n;
  save();
  res.json(db.gameDraw);
});
// Sorteo en dos pasos (pedido de Cote, 20 nov): 1) «Iniciar sorteo de juegos»: las pantallas muestran los juegos que
// pueden salir; 2) «Girar la tómbola». Entre los dos, el animador puede elegir un juego directo, sin tómbola
// (/api/gamedraw/pick): ese juego queda como el siguiente número de la noche.
app.post('/api/gamedraw/ready', requireAdmin, (_req, res) => {
  const g = db.gameDraw;
  if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
  g.ready = { at: Date.now(), pool: DRAW_GAMES.filter((x) => !(g.last && g.last.game === x)) };
  save();
  if (setStage('juego') === false) return fail(res, 409, 'El Rosco está en juego: el sorteo se verá cuando termine la partida');
  res.json(db.gameDraw);
});
app.post('/api/gamedraw/pick', requireAdmin, (req, res) => {
  const g = db.gameDraw;
  const game = String((req.body || {}).game);
  if (!DRAW_GAMES.includes(game)) return fail(res, 400, 'Juego no válido');
  if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
  g.played = [game]; g.list.push(game); g.ready = null;
  g.last = { game, pool: [game], at: Date.now(), direct: true };
  if (game === 'festival' || game === 'objeto') vote.start(game === 'festival' ? 'karaoke' : 'objeto');
  save();
  setStage('juego');
  res.json(db.gameDraw);
});
app.post('/api/gamedraw', requireAdmin, (_req, res) => {
  const g = db.gameDraw;
  if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
  const pool = DRAW_GAMES.filter((x) => !(g.last && g.last.game === x)); // el que salió recién queda fuera de este sorteo
  const game = pool[crypto.randomInt(pool.length)];
  g.played = [game]; // bloqueado solo para el sorteo siguiente
  g.list.push(game); // queda en su número (1.º, 2.º…) en la pantalla
  g.ready = null;
  g.last = { game, pool, at: Date.now() };
  if (game === 'festival' || game === 'objeto') vote.start(game === 'festival' ? 'karaoke' : 'objeto'); // la votación queda lista con su título
  save();
  if (setStage('juego') === false) return fail(res, 409, 'El Rosco está en juego: el sorteo se verá cuando termine la partida');
  res.json(db.gameDraw);
});

// Leer la pantalla actual es público, para que la fuente de OBS no necesite iniciar sesión; cambiarla es del moderador.
app.get('/api/stage', (_req, res) => res.json({ show: roscoLock(db.stage) ? 'rueda' : STAGES.includes(db.stage) ? db.stage : 'bingo' }));
app.post('/api/stage', requireAdmin, (req, res) => {
  const show = String((req.body || {}).show);
  if (!STAGES.includes(show)) return fail(res, 400, 'Opción no válida');
  if (setStage(show) === false) return fail(res, 409, 'El Rosco está en juego: la pantalla sigue en El Rosco hasta que termine la partida');
  if (show === 'karaoke') karaoke.refresh(); // primera lectura inmediata, sin esperar al siguiente ciclo
  res.json({ show });
});

// Pedido de Cote: todos los jueves a las 21:45 (hora de Chile), si la sala abierta es la de Kennedy, el escenario
// pasa solo a Karaoke, para que el público siga pidiendo canciones desde su celular. Una vez por jueves; después
// se puede cambiar a mano. Si el servicio estaba reiniciándose justo a esa hora, se hace apenas vuelve (hasta las 22:00).
const AUTO_KARAOKE = { venue: 'kennedy', dow: 'Thu', from: 21 * 60 + 45, until: 22 * 60 };
setInterval(() => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const min = +p.hour * 60 + +p.minute;
  const day = `${p.year}-${p.month}-${p.day}`;
  if (p.weekday !== AUTO_KARAOKE.dow || min < AUTO_KARAOKE.from || min >= AUTO_KARAOKE.until || db.autoKaraoke === day) return;
  const s = Object.values(db.sessions)[0];
  if (!s || s.theme !== AUTO_KARAOKE.venue) return;
  if (roscoLock('karaoke')) return; // con El Rosco en juego se espera a que termine (hasta las 22:00)
  db.autoKaraoke = day;
  if (db.stage !== 'karaoke') { setStage('karaoke'); karaoke.refresh(); console.log('Escenario a Karaoke automático (jueves 21:45, Kennedy)'); }
  save();
}, 20e3);

// Salas de juegos automáticas (pedido de Cote, 20 nov): a la hora de cada local la sala de juegos queda creada sola
// (hora de Chile): jueves desde las 18:30 Kennedy, viernes desde las 18:00 Tobalaba y domingo desde las 13:00 Frida.
// Una vez por día: si después se cierra a mano, no se vuelve a crear. Si ya hay una sala abierta de ese local, se deja;
// si la abierta es de otro local, se cierra y se crea la que toca. Usa los cartones del último bingo de ese local (si no
// hay, crea 320) y dura hasta las 4 de la mañana siguiente (para que no se cierre en medio de los juegos).
const AUTO_SALAS = [
  { dow: 'Thu', from: 18 * 60 + 30, venue: 'kennedy', name: 'Los Juegos de Kennedy' },
  { dow: 'Fri', from: 18 * 60, venue: 'tobalaba', name: 'Los Juegos de Tobalaba' },
  { dow: 'Sun', from: 13 * 60, venue: 'frida', name: 'Los Juegos de Frida' },
];
function autoSala() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  const min = +p.hour * 60 + +p.minute;
  const a = AUTO_SALAS.find((x) => x.dow === p.weekday && min >= x.from);
  if (!a) return;
  const key = `${p.year}-${p.month}-${p.day} ${a.venue}`;
  if (db.autoSala === key) return;
  db.autoSala = key;
  const open = Object.values(db.sessions)[0];
  if (open && (open.theme || 'frida') === a.venue) { save(); return; } // ya estaba creada (a mano): se deja
  if (open) closeSession(open);
  let proj = Object.values(db.projects).filter((x) => x.theme === a.venue && x.format === 'numbers').sort((x, y) => y.created - x.created)[0];
  if (!proj) {
    proj = { id: id(), created: Date.now(), format: 'numbers', values: 75, items: null, name: a.name, theme: a.venue, headers: 'BINGO', freeCenter: false, startNumber: 1, sessionId: null };
    proj.cards = makeCards(320, 75, false);
    db.projects[proj.id] = proj;
  }
  const s = startSession(proj, { name: a.name, theme: a.venue, cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] });
  s.expires = Date.now() + ((24 * 60 - min) + 4 * 60) * 60e3; // hasta las 4 de la mañana
  save();
  console.log(`Sala de juegos automática: ${a.name}`);
}
setInterval(autoSala, 30e3);
setTimeout(autoSala, 5e3);

app.get('/api/qr', async (req, res) => {
  try {
    res.type('image/svg+xml').send(await QRCode.toString(String(req.query.text || '').slice(0, 500), { type: 'svg', margin: 1 }));
  } catch { fail(res, 400, 'Texto no válido'); }
});

const httpServer = app.listen(PORT, () => console.log(`Bingo listo en http://localhost:${PORT} · datos en ${DATA_FILE}${hasDisk ? ' (disco permanente)' : ' (se pierden al reiniciar)'}`));
// Conexiones que se reutilizan (keep-alive): el servidor las mantiene abiertas más tiempo que el intermediario de Render
// y que los celulares que consultan cada 4–6 s. Con el valor por defecto (5 s) a veces el servidor cerraba una conexión
// justo cuando llegaba una consulta, y esa consulta fallaba (se vio en la prueba de carga de 1 hora).
httpServer.keepAliveTimeout = 75000;
httpServer.headersTimeout = 76000;
