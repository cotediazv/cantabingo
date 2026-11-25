// Sala simulada (pedido de Cote, 23 nov: «crear sala simulada… que hayan 120 personas virtuales jugando de manera como
// lo hacen las personas… para poder probar los juegos de buena manera… responden todos los juegos y participan para
// hacer una simulación completa sin tener que yo loguearme con distintos celulares»).
// Es una sala de juegos normal (las pantallas, el GC y los paneles funcionan igual) con N personas virtuales dentro.
// Cada persona virtual entra con nombre, apellido y lugar, y juega por el mismo camino que un celular: llama a las mismas
// direcciones del servidor que el celular (así se prueba de verdad), con su propio nivel de acierto y su propia rapidez:
//   - Bingo: tienen su cartón abierto (cuentan como conectadas), así que ganan solas como cualquier persona.
//   - Sorteo de concursantes: si salen sorteadas, contestan «Sí, quiero jugar» (a veces «prefiero jugar online»).
//   - El Rosko: contestan la Trivia del Rosko con las 3 alternativas.
//   - El Festival y El objeto más extraño: algunas se inscriben con su canción u objeto, votan del 1 al 10 y en la final.
//   - Votación del juego: votan por un juego.
//   - El último en pie: contestan cada pregunta.
//   - ¿Quién quiere ser ganador?: contestan la Trivia del Ganador (4 alternativas, antes de la respuesta definitiva).
// No piden canciones de karaoke (eso escribiría en la planilla real del local). No quedan en el registro de clientes ni
// en los registros de conectados. Al cerrar la sala, desaparecen.
const crypto = require('crypto');

const FIRST = ['Camila', 'Valentina', 'Javiera', 'Catalina', 'Fernanda', 'Constanza', 'Francisca', 'Daniela', 'Antonia', 'Martina', 'Isidora', 'Sofía', 'Josefa', 'Carolina', 'Paula', 'Macarena', 'Bárbara', 'Gabriela', 'María José', 'Trinidad',
  'Matías', 'Sebastián', 'Benjamín', 'Nicolás', 'Felipe', 'Diego', 'Joaquín', 'Tomás', 'Cristóbal', 'Vicente', 'Martín', 'Ignacio', 'Francisco', 'Rodrigo', 'Gonzalo', 'Pablo', 'Andrés', 'Juan Pablo', 'Agustín', 'Maximiliano'];
const LAST = ['González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández', 'Torres', 'Araya', 'Flores', 'Espinoza', 'Valenzuela',
  'Castillo', 'Tapia', 'Reyes', 'Gutiérrez', 'Castro', 'Pizarro', 'Álvarez', 'Vásquez', 'Sánchez', 'Fernández', 'Ramírez', 'Carrasco', 'Gómez', 'Cortés', 'Herrera', 'Núñez', 'Jara', 'Vergara', 'Rivera', 'Figueroa'];
const SONGS = [['Lamento boliviano', 'Enanitos Verdes'], ['Ella baila sola', 'Peso Pluma'], ['La flaca', 'Jarabe de Palo'], ['De música ligera', 'Soda Stereo'], ['Tren al sur', 'Los Prisioneros'], ['Rayando el sol', 'Maná'],
  ['Mi gran noche', 'Raphael'], ['Hijo de la luna', 'Mecano'], ['Bailando', 'Enrique Iglesias'], ['Corazón espinado', 'Santana'], ['Vivir mi vida', 'Marc Anthony'], ['Despacito', 'Luis Fonsi'], ['La bicicleta', 'Shakira'], ['El aprendiz', 'Malú']];
const THINGS = ['Un paraguas sin tela', 'Una cuchara doblada', 'Un calcetín sin par', 'Las llaves de un auto que ya no tengo', 'Un control remoto sin pilas', 'Una foto carnet de 1998', 'Un llavero de Viña del Mar',
  'Una tapa de botella de 1985', 'Un zapato de guagua', 'Un boleto de micro antiguo', 'Un cargador que no sirve para nada', 'Un huevo de chocolate vacío', 'Un peine sin dientes'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

module.exports = function simulador({ app, db, save, requireAdmin, fail, port, placesFor, fakeConnect, wheel }) {
  const base = `http://127.0.0.1:${port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null);
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const sim = () => { const m = db.sim; return m && db.sessions[m.sid] ? m : null; };
  // Lo que ya hizo cada persona virtual en cada juego (en memoria: si el servidor se reinicia, vuelven a jugar desde ahí)
  const done = new Set();
  const once = (k) => (done.has(k) ? false : (done.add(k), true));

  // Crear: una sala ya abierta (la acaba de crear el panel) pasa a ser simulada y se llena de personas virtuales
  app.post('/api/sim/start', requireAdmin, async (req, res) => {
    const sid = String((req.body || {}).sid || '');
    const s = db.sessions[sid];
    if (!s) return fail(res, 404, 'La sala no existe');
    const n = Math.max(5, Math.min(300, Number((req.body || {}).n) || 120));
    const places = placesFor(s.theme || 'frida');
    s.sim = true;
    db.sim = { sid, bots: [], n };
    save();
    const used = new Set();
    const bots = [];
    for (let i = 0; i < n; i++) {
      let first; let last;
      do { first = pick(FIRST); last = `${pick(LAST)} ${pick(LAST)}`; } while (used.has(first + last));
      used.add(first + last);
      const r = await post(`/api/sessions/${sid}/join`, { name: first, surname: last, place: places.length ? pick(places) : '' });
      if (!r || !r.token) continue;
      // nivel de acierto propio (unos saben más que otros) y rapidez propia para contestar
      bots.push({ token: r.token, name: `${first} ${last}`.toLocaleUpperCase('es'), skill: rnd(0.45, 0.92), speed: rnd(0.6, 1.6), active: rnd(0.85, 0.99) });
    }
    db.sim.bots = bots;
    save();
    for (const b of bots) fakeConnect(sid, b.token);
    return res.json({ ok: true, n: bots.length });
  });
  app.get('/api/sim', (_req, res) => { const m = sim(); res.json(m ? { on: true, sid: m.sid, n: m.bots.length, vista: db.demoVista || '' } : { on: false, vista: db.demoVista || '' }); });

  // ---------- Demo del GC Master (pedido de Cote, 23 y 24 nov) ----------
  // Dirección de la vista 3D de Code 4 (la copia que calcula las luces en el navegador, sin tocar las luces reales)
  app.post('/api/sim/vista', requireAdmin, (req, res) => {
    const url = String((req.body || {}).url || '').trim();
    if (url && !/^(https:\/\/|\/)[^\s"'<>]+$/.test(url)) return fail(res, 400, 'La dirección tiene que empezar con https:// o con /');
    db.demoVista = url.slice(0, 400);
    save();
    res.json({ vista: db.demoVista });
  });
  // La persona protagonista: quien está en el escenario según el juego en pantalla (o la que se eligió)
  const byName = (s, name) => { if (!name) return null; const t = Object.keys(s.players).find((k) => s.players[k].name === name); return t || null; };
  function protagonist(s) {
    const st = db.stage;
    if (st === 'rueda') {
      const w = Object.values(db.wheels || {}).sort((a, b) => b.created - a.created)[0];
      const c = w && w.players && w.players[w.turn];
      const t = c && byName(s, c.name); if (t) return { token: t, why: 'su turno en El Rosko' };
    }
    if (st === 'voto' && db.vote) {
      const v = db.vote; const id = v.open || v.onstage || (v.winner && v.winner.id);
      const p = (v.players || []).find((x) => x.id === id);
      if (p && p.by && s.players[p.by]) return { token: p.by, why: v.mode === 'karaoke' ? 'en El Festival' : 'muestra su objeto' };
    }
    if (st === 'enpie' && db.enpie) {
      const e = db.enpie; const f = e.fin;
      if (f && f.players && f.players[f.turn] && s.players[f.players[f.turn].token]) return { token: f.players[f.turn].token, why: 'su turno en la final' };
      const t = byName(s, e.winner && e.winner.name); if (t) return { token: t, why: 'ganó El último en pie' };
    }
    if (st === 'desafio' && db.desafio) { // ¿Quién quiere ser ganador?: quien está jugando (el principal o, si entró, el suplente)
      const d = db.desafio; const t = d.phase === 'swap' ? null : byName(s, d.player);
      if (t) return { token: t, why: (d.team || []).length > 1 ? 'el reemplazo en ¿Quién quiere ser ganador?' : 'en ¿Quién quiere ser ganador?' };
    }
    if (st === 'sorteo') {
      const r = db.raffle || {};
      const t = byName(s, s.tieWinner && s.tieWinner.name) || byName(s, (r.picked || [])[(r.picked || []).length - 1]);
      if (t) return { token: t, why: 'salió en el sorteo' };
    }
    const res = (s.results || []).filter((r) => r.validated && !r.dismissed);
    const w = res[res.length - 1]; const t = w && byName(s, w.name);
    if (t) return { token: t, why: 'ganó el bingo' };
    return null;
  }
  app.get('/api/sim/protagonista', requireAdmin, (req, res) => {
    const s = Object.values(db.sessions)[0];
    if (!s) return res.json({ sid: null, token: null, people: [] });
    const people = Object.entries(s.players).map(([token, p]) => ({ token, name: p.name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const asked = String(req.query.token || '');
    let r = asked && s.players[asked] ? { token: asked, why: 'elegida' } : protagonist(s);
    if (!r && people.length) r = { token: people[0].token, why: 'nadie en el escenario todavía' };
    res.json({ sid: s.id, token: r ? r.token : null, name: r ? s.players[r.token].name : '', why: r ? r.why : '', people });
  });

  // ---------- Cada segundo: las personas virtuales miran lo que está pasando y actúan, cada una a su ritmo ----------
  const delay = (b, lo, hi) => rnd(lo, hi) * 1000 * b.speed;
  const tick = () => {
    const m = sim();
    if (!m) { if (db.sim) { db.sim = null; done.clear(); for (const t of timers) clearTimeout(t); timers.clear(); save(); } return; }
    const sid = m.sid;
    for (const b of m.bots) fakeConnect(sid, b.token); // también después de un reinicio del servidor
    const stage = db.stage || 'bingo';

    // Sorteo de concursantes: quien sale sorteado contesta si quiere jugar
    const r = db.raffle || {};
    for (const name of r.picked || []) {
      const b = m.bots.find((x) => x.name === name);
      if (!b || ((r.confirm || {})[name] === 'ok') || !once(`raffle:${r.roll && r.roll.at}:${name}`)) continue;
      later(6800 + delay(b, 0.5, 2.5), () => post('/api/raffle/answer', { sid, token: b.token, play: chance(0.9) }));
    }

    // El Rosko: la Trivia del Rosko (3 alternativas)
    if (stage === 'rueda' && wheel && wheel.crowdNow) {
      const q = wheel.crowdNow();
      if (q && once(`rosco:${q.id}:${q.key}`)) {
        for (const b of m.bots) {
          if (!chance(b.active)) continue;
          const right = chance(b.skill);
          const wrong = q.options.filter((o) => o !== q.answer);
          later(delay(b, 1.5, 9), () => post(`/api/wheels/${q.id}/crowd`, { sid, token: b.token, key: q.key, choice: right ? q.answer : pick(wrong) }));
        }
      }
    }

    // El Festival y El objeto más extraño
    const v = db.vote;
    if (stage === 'voto' && v) {
      const karaoke = v.mode === 'karaoke';
      if (v.phase === 'voting' && v.signup) {
        // se inscribe más o menos 1 de cada 12 (con 120 personas, unas 10; si son más que los cupos, hay sorteo)
        for (const b of m.bots) {
          if (!once(`join:${v.gen}:${b.token}`) || !chance(0.08)) continue;
          const [song, artist] = pick(SONGS);
          later(delay(b, 3, 30), () => post('/api/vote/join', karaoke ? { sid, token: b.token, song, artist } : { sid, token: b.token, thing: pick(THINGS) }));
        }
      }
      if (v.phase === 'voting' && v.open) {
        const who = (v.players || []).find((p) => p.id === v.open);
        const taste = rnd(-1.5, 1.5); // a unos les gusta más que a otros
        for (const b of m.bots) {
          if (!who || who.by === b.token || !chance(b.active) || !once(`nota:${v.gen}:${v.open}:${b.token}`)) continue;
          const note = Math.max(1, Math.min(10, Math.round(rnd(5, 10) + taste)));
          later(delay(b, 1, karaoke ? 14 : 6), () => post('/api/vote/cast', { sid, token: b.token, value: note, id: v.open }));
        }
      }
      if (v.phase === 'final' && v.final && v.final.open) {
        const ids = v.final.ids || [];
        const fav = chance(0.5) ? 0 : 1;
        for (const b of m.bots) {
          if (!ids.length || !chance(b.active) || !once(`final:${v.gen}:${b.token}`)) continue;
          later(delay(b, 1, 6), () => post('/api/vote/cast', { sid, token: b.token, value: ids[chance(0.62) ? fav : 1 - fav] }));
        }
      }
    }

    // Votación del próximo juego
    const gv = db.gameVote;
    if (stage === 'votojuego' && gv && gv.phase === 'voting' && Date.now() < gv.until) {
      const favs = (gv.options || []).slice().sort(() => Math.random() - 0.5);
      for (const b of m.bots) {
        if (!favs.length || !chance(b.active) || !once(`gv:${gv.id}:${gv.round}:${b.token}`)) continue;
        const choice = chance(0.45) ? favs[0] : pick(favs);
        later(delay(b, 1, 14), () => post('/api/gamevote/vote', { sid, token: b.token, game: choice }));
      }
    }

    // El último en pie
    const e = db.enpie;
    if (stage === 'enpie' && e && e.phase === 'question' && e.q) {
      for (const b of m.bots) {
        if (!once(`enpie:${e.gen}:${e.n}:${b.token}`) || !chance(b.active)) continue;
        const p = Math.max(0.05, b.skill - (e.q.level === 'm' ? 0.2 : 0));
        const right = chance(p);
        const pickNo = right ? e.q.correct : pick([0, 1, 2].filter((x) => x !== e.q.correct));
        later(delay(b, 1.5, 8), () => { const now = db.enpie; if (now && now.phase === 'question' && now.n === e.n && now.gen === e.gen) post('/api/enpie/answer', { sid, token: b.token, pick: pickNo }); });
      }
    }
    // La Trivia del Ganador: responden cada pregunta antes de la respuesta definitiva (4 alternativas)
    const d = db.desafio;
    if (stage === 'desafio' && d && d.phase === 'question' && d.open && d.q) {
      for (const b of m.bots) {
        if (!once(`desafio:${d.gen}:${d.qid}:${b.token}`) || !chance(b.active)) continue;
        const p = Math.max(0.05, b.skill - (d.q.level === 'm' ? 0.15 : d.q.level === 'd' ? 0.3 : 0));
        const ok = [0, 1, 2, 3].filter((x) => !d.hidden.includes(x));
        const choice = chance(p) ? d.q.correct : pick(ok.filter((x) => x !== d.q.correct));
        const qid = d.qid;
        later(delay(b, 1.5, 12), () => { const now = db.desafio; if (now && now.qid === qid && now.open && !now.hidden.includes(choice)) post('/api/desafio/answer', { sid, token: b.token, qid, choice }); });
      }
    }
  };
  setInterval(() => { try { tick(); } catch (err) { console.error('Sala simulada:', err.message); } }, 1000).unref();
  return { isSim: (sid) => !!(db.sim && db.sim.sid === sid) };
};
