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

const gcDefaults = () => db.gcDefaults || { top: 'Escanea el código QR y participa', bottom: 'Pon tu nombre y apellido y participa' };

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
  const owners = {};
  // Solo puede ganar quien tiene su cartón abierto en este momento (conexión en vivo activa)
  const online = new Set([...(clients[s.id] || [])].map((res) => res.playerToken));
  for (const [token, pl] of Object.entries(s.players)) if (online.has(token)) for (const c of pl.cards) owners[c] = pl.name;
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
        s.results.push({ cardNo, pattern: pid, name: owners[cardNo], validated: true, at: s.drawn.length });
        s.hideWin = false;
        added = true;
      }
    }
  }
  // Un cartón se valida solo cuando el jugador marca la última casilla del patrón.
  for (const r of s.results) {
    if (!r.validated && PATTERNS.completed(r.pattern, markMask(s, r.cardNo))) { r.validated = true; s.hideWin = false; } // cada ganador nuevo vuelve a mostrar la celebración
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
function draw(s, value) {
  const p = db.projects[s.projectId];
  if (value == null) {
    const drawn = new Set(s.drawn);
    const left = [];
    for (let v = 1; v <= p.values; v++) if (!drawn.has(v)) left.push(v);
    if (!left.length) return false;
    value = left[crypto.randomInt(left.length)];
  } else if (!(value >= 1 && value <= p.values) || s.drawn.includes(value)) return false;
  s.drawn.push(value);
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
  save();
}
setInterval(() => {
  for (const s of Object.values(db.sessions)) if (Date.now() > s.expires) closeSession(s);
}, 30000).unref();

// ---------- API ----------
const app = express();
app.set('trust proxy', 1); // detrás del proxy del hosting, para ver la IP real
app.use(express.json({ limit: '1mb' }));
// Sin caché: así cada celular recibe siempre la última versión publicada
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

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
  p.cards = makeCards(clamp(b.count, 25, 3000, 280), values, p.freeCenter);
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
  const b = req.body || {};
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
  db.sessions[s.id] = s;
  setStage('bingo'); // al activar un bingo, la pantalla de OBS pasa sola a su gráfica
  p.sessionId = s.id;
  evaluate(s);
  save();
  res.json({ id: s.id });
});

app.post('/api/sessions/:sid/host/:action', (req, res) => {
  const s = hostSession(req, res);
  if (!s) return;
  const b = req.body || {};
  switch (req.params.action) {
    case 'draw':
      if (!draw(s, b.value == null ? null : parseInt(b.value, 10))) return fail(res, 400, 'No se pudo generar ese valor');
      break;
    case 'auto':
      stopAuto(s);
      s.auto.interval = clamp(b.interval, 5, 60, s.auto.interval);
      s.auto.stopOnWin = !!b.stopOnWin;
      if (b.on) {
        s.auto.on = true;
        timers[s.id] = setInterval(() => { draw(s); broadcast(s); }, s.auto.interval * 1000);
      }
      break;
    case 'restart':
      stopAuto(s);
      Object.assign(s, { round: s.round + 1, drawn: [], results: [], marks: {}, finalists: null, tieWinner: null, hideWin: false, patterns: cleanPatterns(b.patterns) });
      setStage('bingo'); // la ronda nueva devuelve la pantalla a la gráfica del bingo
      evaluate(s);
      break;
    case 'confirmwin': // el animador da por buenos a los ganadores que están en pantalla
      for (const r of s.results) if (r.validated && !r.dismissed) r.confirmed = true;
      break;
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
  if (s) res.json({ password: s.password, isPublic: s.isPublic, round: s.round, patterns: s.patterns, gc: s.gc || gcDefaults() });
});

// Sesiones activas: a ellas llevan el enlace y el QR fijos
app.get('/api/current', (_req, res) => {
  res.json({ sessions: Object.values(db.sessions).sort((a, b) => b.created - a.created)
    .map((s) => ({ id: s.id, name: s.name, round: s.round, locked: !!s.password })) });
});

// Lista pública de sesiones activas
app.get('/api/sessions', (_req, res) => {
  res.json(Object.values(db.sessions).filter((s) => s.isPublic).sort((a, b) => b.created - a.created)
    .map((s) => ({ id: s.id, name: s.name, round: s.round, locked: !!s.password })));
});

app.get('/api/sessions/:sid', (req, res) => {
  const s = db.sessions[req.params.sid];
  if (!s) return fail(res, 404, 'La sesión no existe o ya terminó');
  res.json({ id: s.id, name: s.name, locked: !!s.password, cardsPerPlayer: s.cardsPerPlayer });
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
    const first = str(b.name, 20).replace(/\s+/g, ' ');
    const last = str(b.surname, 25).replace(/\s+/g, ' ');
    if (!first || !last) return fail(res, 400, 'Escribe tu nombre y tu apellido para participar');
    const taken = new Set(Object.values(s.players).flatMap((x) => x.cards));
    const cards = [];
    for (let c = 1; c <= p.cards.length && cards.length < s.cardsPerPlayer; c++) if (!taken.has(c)) cards.push(c);
    if (!cards.length) return fail(res, 409, 'Ya no quedan cartones disponibles en esta sesión');
    token = id(12);
    pl = s.players[token] = { name: `${first} ${last}`, cards };
    // Lista de participantes para el sorteo de concursantes del rosco (sin repetir nombres)
    (db.people ||= {})[pl.name.toLowerCase().replace(/\s+/g, ' ')] = { name: pl.name, at: Date.now() };
    evaluate(s);
    broadcast(s);
  }
  res.json({
    token, name: pl.name, startNumber: p.startNumber,
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
const STAGES = ['bingo', 'rueda', 'sorteo', 'none'];
const setStage = (show) => { db.stage = show; save(); };
const wheel = require('./wheel.js')({ app, db, save, requireAdmin, fail, setStage });
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

// Leer la pantalla actual es público, para que la fuente de OBS no necesite iniciar sesión; cambiarla es del moderador.
app.get('/api/stage', (_req, res) => res.json({ show: STAGES.includes(db.stage) ? db.stage : 'bingo' }));
app.post('/api/stage', requireAdmin, (req, res) => {
  const show = String((req.body || {}).show);
  if (!STAGES.includes(show)) return fail(res, 400, 'Opción no válida');
  setStage(show);
  res.json({ show });
});

app.get('/api/qr', async (req, res) => {
  try {
    res.type('image/svg+xml').send(await QRCode.toString(String(req.query.text || '').slice(0, 500), { type: 'svg', margin: 1 }));
  } catch { fail(res, 400, 'Texto no válido'); }
});

app.listen(PORT, () => console.log(`Bingo listo en http://localhost:${PORT} · datos en ${DATA_FILE}${hasDisk ? ' (disco permanente)' : ' (se pierden al reiniciar)'}`));
