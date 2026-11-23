// Registro de clientes (pedido de Cote, 22 nov, por el Registro: «todo lo necesario para tener el registro de la
// información de todos los clientes: sus nombres, cuánto interactuaron, sus respuestas, qué lugares…»; dio el «dale» a
// fichas por persona y pestaña «Clientes», sin dato de contacto por ahora). Antes, al cerrarse la sala se borraba todo.
// Ahora cada jornada deja una ficha por persona: nombre, local, lugar, hora de entrada y lo que hizo (cartones y bingos
// ganados, respuestas de la Trivia del Rosko, sorteo de concursantes, votos y notas, inscripciones al Festival o al
// objeto, canciones de karaoke pedidas y votación del juego).
// Cómo se anota: este módulo mira pasar las respuestas correctas de lo que el público hace desde el celular (no hay que
// tocar cada juego) y lo suma a la ficha. Va en un archivo aparte (clientes.json, junto a los datos), para que los datos
// en vivo de la sala sigan livianos. Cada celular manda una marca al azar («vid», sin datos personales) que permite
// saber cuántas veces vuelve la misma persona.
const fs = require('fs');
const path = require('path');

const VENUES = { kennedy: 'Mercado Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
const str = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const chileDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

module.exports = function clientes({ app, db, requireAdmin, dir, port }) {
  const FILE = path.join(dir, 'clientes.json');
  let data = { jornadas: {} };
  try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j && j.jornadas) data = j; } catch (e) { /* primera vez */ }
  let timer = null; let writing = false; let dirty = false;
  const write = () => {
    if (writing) { dirty = true; return; }
    writing = true;
    fs.writeFile(`${FILE}.tmp`, JSON.stringify(data), (err) => {
      const done = () => { writing = false; if (dirty) { dirty = false; write(); } };
      if (err) { console.error('No se pudo guardar el registro de clientes:', err.message); return done(); }
      fs.rename(`${FILE}.tmp`, FILE, done);
    });
  };
  const save = () => { if (!timer) timer = setTimeout(() => { timer = null; write(); }, 5000); };
  // Al apagarse o reiniciarse el servicio se guarda antes de salir (va primero: el servidor termina el proceso en su propio aviso)
  for (const sig of ['SIGTERM', 'SIGINT']) process.prependListener(sig, () => { try { fs.writeFileSync(FILE, JSON.stringify(data)); } catch (e) { /* nada */ } });

  // ---------- Fichas ----------
  // Jornada de la sala de juegos: una por sala abierta. Jornada de la sala light: una por local y por noche (el día
  // cambia a las 6 de la mañana, para que la madrugada cuente con la noche anterior).
  const jornada = (id, tipo, venue, now) => (data.jornadas[id] ||= { id, tipo, venue, date: chileDate(tipo === 'light' ? now - 6 * 3600e3 : now), first: now, last: now, personas: {} });
  const ficha = (j, token, base, now) => {
    let f = j.personas[token];
    if (!f) f = j.personas[token] = { name: '', place: '', vid: '', at: now, cartones: 0, bingos: 0, trivia: 0, triviaOk: 0, pts: {}, sorteo: '', votos: {}, inscrito: [], canciones: [], juego: '' };
    if (base) { if (base.name) f.name = base.name; if (base.place) f.place = base.place; if (base.vid) f.vid = base.vid; if (base.cartones) f.cartones = base.cartones; }
    f.last = now; j.last = now; save();
    return f;
  };
  const vidOf = (b) => { const v = String((b || {}).vid || ''); return /^[A-Za-z0-9_-]{6,40}$/.test(v) ? v : ''; };
  // La ficha de quien hizo algo: «sid» puede ser la sala de juegos abierta o una sala light
  const who = (sid, token) => {
    const now = Date.now();
    const s = (db.sessions || {})[sid];
    if (s && s.players[token]) { const p = s.players[token]; return ficha(jornada(`J:${s.id}`, 'juegos', s.theme || 'frida', now), token, { name: p.name, place: p.place, cartones: (p.cards || []).length }, now); }
    const l = Object.values(db.lights || {}).find((x) => x.id === sid);
    if (l && l.players[token]) { const p = l.players[token]; return ficha(jornada(`L:${l.venue}:${chileDate(now - 6 * 3600e3)}`, 'light', l.venue, now), token, { name: p.name, place: p.place }, now); }
    return null;
  };
  const wheels = {}; // rosko → sala, para leer el puntaje de la Trivia

  // Lo que el público hace desde el celular, cuando el servidor lo aceptó
  const HOOKS = [
    [/^\/api\/sessions\/([^/]+)\/join$/, (m, b, out) => { const f = who(m[1], out.token); if (f && vidOf(b)) f.vid = vidOf(b); }],
    [/^\/api\/light\/([^/]+)\/join$/, (m, b, out) => { const f = who(m[1], out.token); if (f && vidOf(b)) f.vid = vidOf(b); }],
    [/^\/api\/wheels\/([^/]+)\/crowd$/, (m, b, out) => { const f = who(String(b.sid || ''), String(b.token || '')); if (!f) return; f.trivia++; if (out.correct) f.triviaOk++; wheels[m[1]] = String(b.sid || ''); }],
    [/^\/api\/vote\/cast$/, (m, b) => { const f = who(String(b.sid || ''), String(b.token || '')); if (f) f.votos[str(b.id || 'final', 24)] = 1; }], // una nota por participante y un voto en la final
    [/^\/api\/vote\/join$/, (m, b) => { const f = who(String(b.sid || ''), String(b.token || '')); const t = str([b.thing, b.song, b.artist].filter(Boolean).join(' · '), 90); if (f && f.inscrito.length < 6) f.inscrito.push(t || 'inscrito'); }],
    [/^\/api\/raffle\/answer$/, (m, b) => { const f = who(String(b.sid || ''), String(b.token || '')); if (f) f.sorteo = b.play ? 'aceptó' : 'no quiso'; }],
    [/^\/api\/gamevote\/vote$/, (m, b) => { const f = who(String(b.sid || ''), String(b.token || '')); if (f) f.juego = str(b.game, 20); }],
    [/^\/api\/karaoke\/request$/, (m, b) => { const f = who(String(b.sid || ''), String(b.token || '')); const t = str([b.song, b.artist].filter(Boolean).join(' · '), 90); if (f && t && f.canciones.length < 12) f.canciones.push(t); }],
  ];
  app.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const hook = HOOKS.find(([re]) => re.test(req.path));
    if (!hook) return next();
    const json = res.json.bind(res);
    res.json = (out) => { try { if (res.statusCode < 300 && out && !out.error) hook[1](hook[0].exec(req.path), req.body || {}, out); } catch (e) { /* el registro nunca debe botar una respuesta */ } return json(out); };
    return next();
  });

  // Cada medio minuto: bingos ganados (ganador confirmado por el animador) y puntaje de la Trivia del Rosko
  const seenWins = {};
  const repaso = async () => {
    const now = Date.now();
    for (const s of Object.values(db.sessions || {})) {
      const j = data.jornadas[`J:${s.id}`]; if (!j) continue;
      for (const r of s.results || []) {
        if (!r.confirmed || r.dismissed) continue;
        const k = `${s.id}:${s.round}:${r.cardNo}`; if (seenWins[k]) continue;
        const token = Object.keys(s.players).find((t) => (s.players[t].cards || []).includes(r.cardNo));
        if (!token) continue;
        seenWins[k] = 1; ficha(j, token, { name: s.players[token].name, place: s.players[token].place }, now).bingos++;
      }
    }
    for (const [wid, sid] of Object.entries(wheels)) {
      const j = data.jornadas[`J:${sid}`];
      if (!j || !(db.sessions || {})[sid]) { delete wheels[wid]; continue; }
      try {
        const r = await (await fetch(`http://127.0.0.1:${port}/api/wheels/${wid}/ranking`, { signal: AbortSignal.timeout(5000) })).json();
        const byName = {}; for (const f of Object.values(j.personas)) (byName[f.name] ||= []).push(f);
        for (const t of r.list || []) { const fs2 = byName[t.name]; if (fs2 && fs2.length === 1 && fs2[0].pts[wid] !== t.score) { fs2[0].pts[wid] = t.score; save(); } } // con dos personas del mismo nombre no se puede saber de quién es
      } catch (e) { /* el rosko ya no existe */ delete wheels[wid]; }
    }
  };
  setInterval(() => { repaso().catch(() => {}); }, 30e3).unref();

  // ---------- Lectura (solo moderador) ----------
  const visitas = () => { const n = {}; for (const j of Object.values(data.jornadas)) for (const f of Object.values(j.personas)) if (f.vid) (n[f.vid] ||= new Set()).add(j.id); return n; };
  const row = (j, f, vis) => {
    const votos = Object.keys(f.votos || {}).length; const pts = Object.values(f.pts || {}).reduce((a, x) => a + x, 0);
    return { jornada: j.id, date: j.date, venue: j.venue, local: VENUES[j.venue] || j.venue, tipo: j.tipo, name: f.name, place: f.place, at: f.at, visitas: f.vid && vis[f.vid] ? vis[f.vid].size : 1,
      cartones: f.cartones, bingos: f.bingos, trivia: f.trivia, triviaOk: f.triviaOk, triviaPts: pts, sorteo: f.sorteo, votos, inscrito: f.inscrito.join(' / '), canciones: f.canciones.join(' / '), juego: f.juego,
      interacciones: f.trivia + votos + f.inscrito.length + f.canciones.length + (f.juego ? 1 : 0) + (f.sorteo ? 1 : 0) };
  };
  app.get('/api/clientes', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const vis = visitas();
    const js = Object.values(data.jornadas).sort((a, b) => b.first - a.first);
    const resumen = js.map((j) => { const rs = Object.values(j.personas).map((f) => row(j, f, vis)); return { id: j.id, tipo: j.tipo, venue: j.venue, local: VENUES[j.venue] || j.venue, date: j.date, first: j.first, last: j.last, personas: rs.length, interacciones: rs.reduce((a, r) => a + r.interacciones, 0) }; });
    const q = str(req.query.q, 40).toLocaleUpperCase('es');
    let personas = null;
    if (req.query.todo) personas = js.flatMap((j) => Object.values(j.personas).map((f) => row(j, f, vis)));
    else if (q) personas = js.flatMap((j) => Object.values(j.personas).filter((f) => f.name.includes(q)).map((f) => row(j, f, vis))).slice(0, 300);
    else if (req.query.id && data.jornadas[req.query.id]) { const j = data.jornadas[req.query.id]; personas = Object.values(j.personas).map((f) => row(j, f, vis)); }
    if (personas) personas.sort((a, b) => b.at - a.at);
    res.json({ jornadas: resumen, personas, total: resumen.reduce((a, j) => a + j.personas, 0) });
  });
  return { repaso };
};
