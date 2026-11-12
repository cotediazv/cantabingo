const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const PATTERNS = require('./public/patterns.js');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const SESSION_HOURS = 3;

// ---------- Almacenamiento (JSON en disco) ----------
let db = { projects: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* primera ejecución */ }
for (const s of Object.values(db.sessions)) s.auto = { on: false, interval: 10, stopOnWin: true };
let saveTimer = null;
const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(db), () => {}), 400);
};
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
  for (const pl of Object.values(s.players)) for (const c of pl.cards) owners[c] = pl.name;
  let added = false;
  for (const cardNo of Object.keys(owners).map(Number)) {
    const dm = drawnMask(s, cardNo);
    for (const pid of s.patterns) {
      if (s.results.some((r) => r.cardNo === cardNo && r.pattern === pid)) continue;
      if (PATTERNS.completed(pid, dm)) {
        s.results.push({ cardNo, pattern: pid, name: owners[cardNo], validated: false, at: s.drawn.length });
        added = true;
      }
    }
  }
  // Un cartón se valida solo cuando el jugador marca la última casilla del patrón.
  for (const r of s.results) {
    if (!r.validated && PATTERNS.completed(r.pattern, markMask(s, r.cardNo))) r.validated = true;
  }
  return added;
}
function publicState(s) {
  const p = db.projects[s.projectId];
  return {
    id: s.id, name: s.name, round: s.round, closed: !!s.closed, expires: s.expires,
    format: p.format, headers: p.headers, values: p.values, items: p.items, showName: s.showName,
    patterns: s.patterns, drawn: s.drawn, results: s.results, finalists: s.finalists || null,
    auto: s.auto, cardsPerPlayer: s.cardsPerPlayer, totalCards: p.cards.length,
    players: Object.values(s.players).length,
  };
}
function broadcast(s) {
  save();
  const msg = `data: ${JSON.stringify(publicState(s))}\n\n`;
  for (const res of clients[s.id] || []) res.write(msg);
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
  const added = evaluate(s);
  if ((added && s.auto.stopOnWin) || s.drawn.length >= p.values) stopAuto(s);
  return true;
}
function closeSession(s) {
  stopAuto(s);
  s.closed = true;
  broadcast(s);
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
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const fail = (res, code, error) => res.status(code).json({ error });
const summary = (p) => ({
  id: p.id, name: p.name, format: p.format, count: p.cards.length, values: p.values,
  created: p.created, sessionId: p.sessionId || null,
});
function ownProject(req, res) {
  const p = db.projects[req.params.id];
  if (!p || p.owner !== req.get('x-host')) { fail(res, 404, 'Proyecto no encontrado'); return null; }
  return p;
}
function hostSession(req, res) {
  const s = db.sessions[req.params.sid];
  if (!s || db.projects[s.projectId].owner !== req.get('x-host')) { fail(res, 404, 'Sesión no encontrada'); return null; }
  return s;
}

app.get('/api/projects', (req, res) => {
  const host = req.get('x-host');
  res.json(Object.values(db.projects).filter((p) => p.owner === host).sort((a, b) => b.created - a.created).map(summary));
});

app.post('/api/projects', (req, res) => {
  const host = req.get('x-host');
  if (!host || host.length < 16) return fail(res, 400, 'Falta el identificador del anfitrión');
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
    id: id(), owner: host, created: Date.now(), format, values, items,
    name: str(b.name, 60, 'Proyecto de bingo'),
    headers: headers.slice(0, 5).join(''), freeCenter: b.freeCenter !== false,
    startNumber: clamp(b.startNumber, 1, 999999, 1),
    sessionId: null,
  };
  p.cards = makeCards(clamp(b.count, 25, 3000, 25), values, p.freeCenter);
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
    round: 1, drawn: [], results: [], marks: {}, players: {}, finalists: null,
    auto: { on: false, interval: 10, stopOnWin: true },
    created: Date.now(), expires: Date.now() + SESSION_HOURS * 3600e3,
  };
  db.sessions[s.id] = s;
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
      Object.assign(s, { round: s.round + 1, drawn: [], results: [], marks: {}, finalists: null, patterns: cleanPatterns(b.patterns) });
      evaluate(s);
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
  if (s) res.json({ password: s.password, isPublic: s.isPublic });
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
    const taken = new Set(Object.values(s.players).flatMap((x) => x.cards));
    const cards = [];
    for (let c = 1; c <= p.cards.length && cards.length < s.cardsPerPlayer; c++) if (!taken.has(c)) cards.push(c);
    if (!cards.length) return fail(res, 409, 'Ya no quedan cartones disponibles en esta sesión');
    token = id(12);
    pl = s.players[token] = { name: str(b.name, 30, 'Participante'), cards };
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
  evaluate(s);
  broadcast(s);
  res.json({ marks, state: publicState(s) });
});

// Flujo de eventos en tiempo real (anfitrión, participantes y tablero)
app.get('/api/sessions/:sid/events', (req, res) => {
  const s = db.sessions[req.params.sid];
  if (!s) return fail(res, 404, 'La sesión no existe o ya terminó');
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(publicState(s))}\n\n`);
  (clients[s.id] ||= new Set()).add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); clients[s.id]?.delete(res); });
});

app.get('/api/qr', async (req, res) => {
  try {
    res.type('image/svg+xml').send(await QRCode.toString(String(req.query.text || '').slice(0, 500), { type: 'svg', margin: 1 }));
  } catch { fail(res, 400, 'Texto no válido'); }
});

app.listen(PORT, () => console.log(`Bingo listo en http://localhost:${PORT}`));
