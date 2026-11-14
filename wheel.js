// Juego «Rueda de palabras»: una rueda de letras por concursante, con reloj.
// El moderador marca acierto, fallo o paso desde su panel; el público solo ve la rueda.
const crypto = require('crypto');
const { BANK, CONTAINS } = require('./questions-bank.js');

const LETTERS = 'ABCDEFGHIJLMNÑOPQRSTUVXYZ';
const OPEN = (st) => st === 'pending' || st === 'pass';
const REVEAL_MS = 4000; // tiempo que la respuesta acertada queda en pantalla

module.exports = function wheelGame({ app, db, save, requireAdmin, fail, setStage }) {
  const api = { refresh: () => {} };
  db.wheels ||= {};
  db.bankUsed ||= {}; // cuántas veces se ha usado cada pregunta del banco
  const clients = {}; // id -> Set<res>
  const timers = {}; // id -> temporizador de fin de reloj
  for (const w of Object.values(db.wheels)) { w.runningSince = null; w.history = []; } // tras reiniciar, el reloj queda en pausa

  const str = (v, max, def = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);
  const clamp = (v, lo, hi, def) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  const newId = () => {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    let out;
    do out = Array.from(crypto.randomBytes(6), (b) => abc[b % abc.length]).join(''); while (db.wheels[out]);
    return out;
  };

  // Elige del banco una pregunta por letra y concursante. Prefiere siempre las menos usadas,
  // así las preguntas van rotando solas de una partida a la siguiente.
  function pickQuestions(letters, nPlayers, cats, levels) {
    const taken = new Set();
    return Array.from({ length: nPlayers }, () => letters.map((ch) => {
      const free = BANK.filter((b) => b.letter === ch && !taken.has(b.key));
      const wanted = free.filter((b) => cats.includes(b.cat) && levels.includes(b.level));
      const pool = wanted.length ? wanted : free; // si no hay de esa categoría para la letra, usa otra
      if (!pool.length) return { q: '', a: '' };
      const min = Math.min(...pool.map((b) => db.bankUsed[b.key] || 0));
      const least = pool.filter((b) => (db.bankUsed[b.key] || 0) === min);
      const b = least[crypto.randomInt(least.length)];
      taken.add(b.key);
      db.bankUsed[b.key] = (db.bankUsed[b.key] || 0) + 1;
      return { q: `${CONTAINS.has(ch) ? 'Contiene la' : 'Con la'} ${ch}: ${b.q}`, a: b.a, cat: b.cat, level: b.level };
    }));
  }
  const keep = (list, allowed, def) => { const out = (Array.isArray(list) ? list : []).filter((x) => allowed.includes(x)); return out.length ? out : def; };

  const freshPlayers = (w) => w.setup.players.map((name) => ({
    name, status: Array.from(w.letters, () => 'pending'), current: 0, remainingMs: w.seconds * 1000,
  }));
  const active = (c) => c.remainingMs > 0 && c.status.some(OPEN);
  const liveRemaining = (w, i) => {
    const c = w.players[i];
    return w.runningSince && i === w.turn ? Math.max(0, c.remainingMs - (Date.now() - w.runningSince)) : c.remainingMs;
  };
  // Detiene el reloj y descuenta el tiempo transcurrido
  function settle(w) {
    clearTimeout(timers[w.id]);
    if (w.runningSince) { w.players[w.turn].remainingMs = liveRemaining(w, w.turn); w.runningSince = null; }
  }
  function run(w) {
    const c = w.players[w.turn];
    if (w.runningSince || !active(c)) return;
    w.runningSince = Date.now();
    timers[w.id] = setTimeout(() => { settle(w); passTurn(w); broadcast(w); }, c.remainingMs + 30);
  }
  // Avanza a la siguiente letra abierta del concursante; false si ya no le quedan
  function nextLetter(c) {
    const n = c.status.length;
    for (let k = 1; k <= n; k++) {
      const i = (c.current + k) % n;
      if (OPEN(c.status[i])) { c.current = i; return true; }
    }
    return false;
  }
  const nextTurn = (w) => {
    for (let k = 1; k < w.players.length; k++) {
      const i = (w.turn + k) % w.players.length;
      if (active(w.players[i])) return i;
    }
    return -1;
  };
  // Entrega el turno a otro concursante activo (con el reloj en pausa). Devuelve si lo hubo.
  function passTurn(w) {
    const other = nextTurn(w);
    if (other < 0) return false;
    settle(w);
    w.turn = other;
    return true;
  }
  function remember(w) {
    w.history.push(JSON.stringify({ turn: w.turn, players: w.players.map((c, i) => ({ ...c, remainingMs: liveRemaining(w, i) })) }));
    if (w.history.length > 40) w.history.shift();
  }
  // Gana quien acierta todas las letras de su rosco
  // Si nadie lo completa y todos terminaron, gana quien tiene más aciertos (y, a igualdad, menos fallos).
  // Con dos o más igualados hay empate, que el animador resuelve por sorteo en pantalla.
  const TIE_ROLL_MS = 6500; // lo que dura la tómbola
  const count = (c, what) => c.status.filter((x) => x === what).length;
  const score = (c) => count(c, 'hit') * 1000 - count(c, 'miss');
  const leaders = (w) => {
    if (w.players.length < 2 || w.players.some(active)) return [];
    const best = Math.max(...w.players.map(score));
    return w.players.map((c, i) => (score(c) === best ? i : -1)).filter((i) => i >= 0);
  };
  const tieRolling = (w) => !!w.tieWinner && Date.now() - w.tieWinner.at < TIE_ROLL_MS;
  const winnerOf = (w) => {
    const full = w.players.findIndex((c) => c.status.every((x) => x === 'hit'));
    if (full >= 0) return full;
    const top = leaders(w);
    if (top.length === 1) return top[0];
    if (top.length > 1 && w.tieWinner && top.includes(w.tieWinner.index) && !tieRolling(w)) return w.tieWinner.index;
    return -1;
  };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function act(w, action, b) {
    const c = w.players[w.turn];
    if (winnerOf(w) >= 0 && ['hit', 'miss', 'pass', 'start', 'turn'].includes(action)) return 'La partida terminó: alguien completó el rosco';
    switch (action) {
      case 'hit':
      case 'miss':
      case 'pass': {
        if (!OPEN(c.status[c.current])) return 'Esa letra ya está resuelta';
        remember(w);
        // Al acertar, la respuesta se revela al público durante unos segundos
        const solved = ((w.questions[w.turn] || [])[c.current] || {}).a;
        w.reveal = action === 'hit' && solved ? { letter: w.letters[c.current], answer: solved, at: Date.now() } : null;
        c.status[c.current] = action;
        const more = nextLetter(c);
        if (!more) { settle(w); if (winnerOf(w) < 0) passTurn(w); } // terminó su rosco; si lo completó, la partida se detiene
        else if (action !== 'hit') { settle(w); passTurn(w); } // fallo o paso: el reloj se detiene siempre y sigue otro, si queda alguno
        return null;
      }
      case 'acceptwin': // el animador da por bueno al ganador: la felicitación se recoge abajo al centro
        if (winnerOf(w) < 0) return 'Todavía nadie completó el rosco';
        w.winAccepted = true; w.winAcceptedAt = Date.now();
        if (db.stage === 'sorteo') setStage('rueda'); // tras un desempate, la pantalla vuelve al rosco
        return null;
      case 'start': run(w); return null;
      case 'pause': settle(w); return null;
      case 'turn': remember(w); settle(w); w.turn = (w.turn + 1) % w.players.length; return null;
      case 'select': {
        const i = clamp(b.index, 0, w.letters.length - 1, -1);
        const p = w.players[clamp(b.player, 0, w.players.length - 1, w.turn)];
        if (i < 0) return 'Letra no válida';
        remember(w);
        if (!OPEN(p.status[i])) p.status[i] = 'pending'; // reabrir una letra para corregir
        w.tieWinner = null; w.winAccepted = false;
        p.current = i;
        return null;
      }
      case 'undo': {
        const last = w.history.pop();
        if (!last) return 'No hay nada que deshacer';
        settle(w);
        Object.assign(w, JSON.parse(last));
        w.reveal = null; w.winAccepted = false; w.tieWinner = null;
        return null;
      }
      case 'reset': settle(w); w.winAccepted = false; w.tieWinner = null; w.history = []; w.turn = 0; w.reveal = null; w.players = freshPlayers(w); return null;
      default: return 'Acción desconocida';
    }
  }

  const publicState = (w) => ({
    id: w.id, name: w.name, letters: w.letters, seconds: w.seconds, turn: w.turn, runningSince: w.runningSince, now: Date.now(),
    finished: !w.players.some(active), canUndo: w.history.length > 0,
    winner: winnerOf(w) >= 0 ? { name: w.players[winnerOf(w)].name, full: w.players[winnerOf(w)].status.every((x) => x === 'hit'),
      hits: count(w.players[winnerOf(w)], 'hit'), misses: count(w.players[winnerOf(w)], 'miss'), byDraw: leaders(w).length > 1 } : null,
    // Empate pendiente: nombres de los igualados (mientras no se haya sorteado) y si la tómbola está girando
    tie: winnerOf(w) < 0 && leaders(w).length > 1 ? { names: leaders(w).map((i) => w.players[i].name), rolling: tieRolling(w) } : null,
    winAccepted: winnerOf(w) >= 0 && !!w.winAccepted, winAcceptedAt: w.winAcceptedAt || 0,
    reveal: w.reveal && Date.now() - w.reveal.at < REVEAL_MS ? w.reveal : null,
    // Al público va solo el enunciado de la letra en juego; la respuesta nunca sale del panel del moderador
    // y solo mientras su reloj está corriendo.
    question: w.runningSince && active(w.players[w.turn]) ? ((w.questions[w.turn] || [])[w.players[w.turn].current] || {}).q || '' : '',
    players: w.players.map((c) => ({
      name: c.name, status: c.status, current: c.current, remainingMs: c.remainingMs, active: active(c),
      hits: c.status.filter((x) => x === 'hit').length, misses: c.status.filter((x) => x === 'miss').length,
    })),
  });
  function broadcast(w) {
    save();
    const msg = `data: ${JSON.stringify(publicState(w))}\n\n`;
    for (const res of clients[w.id] || []) res.write(msg);
  }
  const find = (req, res) => { const w = db.wheels[req.params.id]; if (!w) fail(res, 404, 'Ese rosco no existe o fue eliminado'); return w; };

  // ---------- API ----------
  app.use('/api/wheels', (req, res, next) => (req.method === 'GET' && /^\/[^/]+\/events$/.test(req.path) ? next() : requireAdmin(req, res, next)));

  app.get('/api/wheels', (_req, res) => {
    res.json(Object.values(db.wheels).sort((a, b) => b.created - a.created)
      .map((w) => ({ id: w.id, name: w.name, players: w.setup.players, seconds: w.seconds, letters: w.letters.length, created: w.created })));
  });

  app.post('/api/wheels', (req, res) => {
    const b = req.body || {};
    const letters = [...new Set([...str(b.letters, 40, LETTERS).toUpperCase()].filter((ch) => /\p{L}/u.test(ch)))];
    if (letters.length < 5) return fail(res, 400, 'El rosco necesita al menos 5 letras');
    const players = (Array.isArray(b.players) ? b.players : []).map((x) => str(x, 30).toLocaleUpperCase('es')).filter(Boolean).slice(0, 4);
    if (!players.length) players.push('Concursante');
    // Preguntas: del banco (por defecto) o escritas por el moderador, una por letra { q, a }
    const bank = b.source === 'own' ? null : { cats: keep(b.cats, ['g', 'm', 'a'], ['g', 'm', 'a']), levels: keep(b.levels, ['f', 'm'], ['f', 'm']) };
    const questions = bank ? pickQuestions(letters, players.length, bank.cats, bank.levels) : players.map((_, pi) => letters.map((ch) => {
      const item = ((Array.isArray(b.questions) && b.questions[pi]) || {})[ch] || {};
      return { q: str(item.q, 300), a: str(item.a, 80) };
    }));
    const w = {
      id: newId(), name: str(b.name, 50, 'El Rosco'), created: Date.now(), letters, seconds: clamp(b.seconds, 20, 900, 150),
      setup: { players }, bank, questions, turn: 0, runningSince: null, history: [],
    };
    w.players = freshPlayers(w);
    db.wheels[w.id] = w;
    setStage('rueda'); // al crear un rosco, la pantalla de OBS pasa sola a mostrarlo
    save();
    res.json({ id: w.id });
  });

  app.get('/api/wheels/:id', (req, res) => { const w = find(req, res); if (w) res.json({ ...publicState(w), questions: w.questions, fromBank: !!w.bank }); });

  // Cambia todas las preguntas por otras del banco y reinicia la rueda
  app.post('/api/wheels/:id/newquestions', (req, res) => {
    const w = find(req, res);
    if (!w) return;
    if (!w.bank) return fail(res, 400, 'Este rosco usa preguntas escritas a mano');
    w.questions = pickQuestions(w.letters, w.players.length, w.bank.cats, w.bank.levels);
    act(w, 'reset', {});
    broadcast(w);
    res.json({ ok: true });
  });

  app.delete('/api/wheels/:id', (req, res) => {
    const w = find(req, res);
    if (!w) return;
    settle(w);
    for (const c of clients[w.id] || []) { c.write('data: {"closed":true}\n\n'); c.end(); }
    delete clients[w.id];
    delete db.wheels[w.id];
    save();
    res.json({ ok: true });
  });

  app.post('/api/wheels/:id/act', (req, res) => {
    const w = find(req, res);
    if (!w) return;
    if (db.stage === 'qr') setStage('rueda'); // cualquier acción del rosco retira el QR a pantalla completa
    const error = act(w, String((req.body || {}).action), req.body || {});
    if (error) return fail(res, 400, error);
    broadcast(w);
    res.json({ ok: true });
  });

  // Desempate por sorteo: la tómbola de la pantalla elige entre los concursantes igualados
  app.post('/api/wheels/:id/tiebreak', (req, res) => {
    const w = find(req, res);
    if (!w) return;
    if (winnerOf(w) >= 0) return fail(res, 400, 'Ya hay un ganador');
    const top = leaders(w);
    if (top.length < 2) return fail(res, 400, 'No hay un empate que resolver');
    if (tieRolling(w)) return fail(res, 400, 'Espera a que termine el sorteo en curso');
    const index = top[crypto.randomInt(top.length)];
    const names = top.map((i) => w.players[i].name);
    const parade = [];
    while (parade.length < 16) parade.push(...shuffle([...names]));
    const at = Date.now();
    w.tieWinner = { index, at };
    db.raffle ||= { picked: [], roll: null };
    db.raffle.tie = { winner: w.players[index].name, names: parade, at, tied: top.length, game: 'rosco' };
    db.raffle.mode = 'tie';
    setStage('sorteo');
    broadcast(w);
    setTimeout(() => broadcast(w), TIE_ROLL_MS + 200); // al terminar la tómbola, el panel recibe al ganador
    res.json({ ok: true });
  });

  // Ruedas abiertas: a ellas lleva el enlace fijo del público (sin sesión de moderador)
  app.get('/api/wheel-current', (_req, res) => {
    res.json({ wheels: Object.values(db.wheels).sort((a, b) => b.created - a.created).map((w) => ({ id: w.id, name: w.name })) });
  });

  app.get('/api/wheels/:id/events', (req, res) => {
    const w = db.wheels[req.params.id];
    if (!w) return fail(res, 404, 'Ese rosco no existe o fue eliminado');
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(publicState(w))}\n\n`);
    (clients[w.id] ||= new Set()).add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => { clearInterval(ping); clients[w.id]?.delete(res); });
    return undefined;
  });

  api.refresh = () => Object.values(db.wheels).forEach(broadcast);
  return api;
};
