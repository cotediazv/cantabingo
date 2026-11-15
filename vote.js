// Votación del público: concursos donde la sala pone nota del 1 al 10 desde el celular.
// 1) El animador anota a los participantes y abre la votación de cada uno, por turno; la nota no se muestra.
// 2) Resultados: se revelan los lugares desde el último hasta el tercero.
// 3) Gran final: los dos primeros se definen con una votación nueva, eligiendo a uno de los dos.
const crypto = require('crypto');

const MAX_PLAYERS = 8;
const OPEN_MS = Number(process.env.VOTE_OPEN_MS) || 10000; // cada participante se evalúa durante 10 segundos
const GRACE_MS = 1000; // margen para los votos que venían en camino al llegar a cero
const SIGNUP_MS = Number(process.env.VOTE_SIGNUP_MS) || 120000; // el llamado a participar dura 2 minutos

module.exports = function vote({ app, db, save, requireAdmin, fail, setStage, findPlayer, venue, notify }) {
  const blank = () => ({ title: '', players: [], open: null, last: null, phase: 'voting', rank: [], revealed: 0, final: null, winner: null, winAt: 0, rev: ((db.vote || {}).rev || 0) + 1 });
  db.vote ||= blank();
  const v = () => db.vote;
  const clean = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);
  const changed = () => { v().rev++; save(); notify(); };
  const by = (id) => v().players.find((p) => p.id === id);
  const count = (p) => Object.keys(p.votes).length;
  const avg = (p) => { const n = Object.values(p.votes); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0; };
  const no = (p) => v().players.indexOf(p) + 1; // número del participante: el orden en que se anotó
  const round1 = (x) => Math.round(x * 10) / 10;

  // Lugares ya revelados, del último hacia arriba (nunca los dos primeros: esos van a la gran final)
  const places = () => {
    const s = v();
    const n = s.rank.length;
    return Array.from({ length: s.revealed }, (_, i) => { const p = by(s.rank[n - 1 - i]); return { place: n - i, no: no(p), name: p.name, thing: p.thing || '', score: round1(avg(p)) }; });
  };
  const finalists = () => (v().final ? v().players.filter((p) => v().final.ids.includes(p.id)).map((p) => ({ id: p.id, no: no(p), name: p.name, thing: p.thing || '' })) : []);

  const pub = () => {
    const s = v();
    const open = by(s.open);
    const last = by(s.last);
    return {
      rev: s.rev, venue: venue(), title: s.title, phase: s.phase, now: Date.now(),
      signup: s.phase === 'voting' && !!s.signup, clockUntil: s.signup ? s.signupUntil || 0 : s.phase === 'voting' && s.open ? s.openUntil || 0 : 0, clockMs: s.signup ? SIGNUP_MS : OPEN_MS, max: MAX_PLAYERS, room: Math.max(0, MAX_PLAYERS - s.players.length),
      players: s.players.map((p) => ({ id: p.id, no: no(p), name: p.name, thing: p.thing || '', done: !!p.done })),
      open: open ? { id: open.id, no: no(open), name: open.name, thing: open.thing || '' } : null,
      last: last ? { id: last.id, no: no(last), name: last.name, thing: last.thing || '' } : null,
      places: s.phase === 'voting' ? [] : places(),
      toReveal: s.phase === 'results' ? Math.max(0, s.rank.length - 2 - s.revealed) : 0,
      final: s.final ? { players: finalists(), open: !!s.final.open, closed: !!s.final.closed } : null,
      winner: s.phase === 'winner' && s.winner ? { no: no(by(s.winner)), name: by(s.winner).name, thing: by(s.winner).thing || '' } : null, winAt: s.winAt || 0,
    };
  };

  // Lo que ven las pantallas y los celulares. Con sid y token, incluye el voto de esa persona.
  app.get('/api/vote', (req, res) => {
    const s = v();
    const out = pub();
    const token = String(req.query.token || '');
    if (token && findPlayer(String(req.query.sid || ''), token)) {
      out.mine = s.final && (s.final.open || s.final.closed) ? s.final.votes[token] || null : s.open ? (by(s.open).votes[token] || null) : null;
      const own = s.players.find((p) => p.by === token); // si esta persona se inscribió para participar
      out.me = own ? { no: no(own), thing: own.thing || '' } : null;
    }
    res.json(out);
  });

  // Panel del animador: además, cuántos votos van y lo que viene
  const hostState = () => {
    const s = v();
    const n = s.rank.length;
    const next = s.phase === 'results' && s.revealed < n - 2 ? by(s.rank[n - 1 - s.revealed]) : null;
    const tally = s.final ? Object.fromEntries(s.final.ids.map((id) => [id, Object.values(s.final.votes).filter((x) => x === id).length])) : null;
    return { ...pub(), counts: Object.fromEntries(s.players.map((p) => [p.id, count(p)])),
      next: next ? { place: n - s.revealed, no: no(next), name: next.name, thing: next.thing || '', score: round1(avg(next)) } : null, tally };
  };
  app.get('/api/vote/host', requireAdmin, (_req, res) => res.json(hostState()));

  // Voto desde el celular: nota del 1 al 10 al participante en turno o, en la gran final, uno de los dos
  app.post('/api/vote/cast', (req, res) => {
    const b = req.body || {};
    const token = String(b.token || '');
    if (!findPlayer(String(b.sid || ''), token)) return fail(res, 403, 'Primero únete a la sala con tu nombre');
    const s = v();
    if (s.phase === 'final' && s.final && s.final.open) {
      if (!s.final.ids.includes(b.value)) return fail(res, 400, 'Elige a uno de los dos finalistas');
      s.final.votes[token] = b.value;
    } else if (s.phase === 'voting' && s.open && by(s.open)) {
      const n = Number(b.value);
      if (!Number.isInteger(n) || n < 1 || n > 10) return fail(res, 400, 'La nota va del 1 al 10');
      if (b.id && b.id !== s.open) return fail(res, 409, 'Esa votación ya se cerró');
      by(s.open).votes[token] = n;
    } else return fail(res, 409, 'La votación está cerrada en este momento');
    save();
    return res.json({ ok: true, mine: b.value });
  });

  // Inscripción desde el celular: la persona escribe con qué participa y queda en la lista del animador,
  // con el nombre con que entró a la sala. Una inscripción por celular.
  app.post('/api/vote/join', (req, res) => {
    const b = req.body || {};
    const token = String(b.token || '');
    const pl = findPlayer(String(b.sid || ''), token);
    if (!pl) return fail(res, 403, 'Primero únete a la sala con tu nombre');
    const s = v();
    if (s.phase !== 'voting' || !s.signup) return fail(res, 409, 'Las inscripciones están cerradas en este momento');
    if (s.players.some((p) => p.by === token)) return fail(res, 409, 'Ya estás en la lista');
    const what = clean(b.thing, 40);
    if (what.length < 2) return fail(res, 400, 'Escribe con qué vas a participar');
    if (s.players.length >= MAX_PLAYERS) return fail(res, 409, 'Ya se completaron los cupos');
    s.players.push({ id: crypto.randomBytes(4).toString('hex'), name: pl.name, thing: what, by: token, votes: {}, done: false });
    if (s.players.length >= MAX_PLAYERS) s.signup = false; // se completaron los cupos: el llamado termina sin esperar al reloj
    changed();
    return res.json({ ok: true, no: s.players.length });
  });

  // Al agotarse el reloj, las inscripciones se cierran solas
  setInterval(() => {
    const s = v();
    if (s.signup && s.signupUntil && Date.now() >= s.signupUntil) { s.signup = false; changed(); }
    // La votación de cada participante se cierra sola al agotarse sus 10 segundos
    if (s.phase === 'voting' && s.open && s.openUntil && Date.now() >= s.openUntil + GRACE_MS) { actions.close(s); changed(); }
  }, 250).unref();

  const actions = {
    signup: (s, b) => {
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      s.signup = !!b.on;
      s.signupUntil = s.signup ? Date.now() + SIGNUP_MS : 0; // reloj en cuenta regresiva
      return null;
    },
    title: (s, b) => { s.title = clean(b.title, 50); },
    add: (s, b) => {
      const name = clean(b.name, 30).toLocaleUpperCase('es');
      if (!name) return 'Escribe el nombre del participante';
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      if (s.players.some((p) => p.name === name)) return 'Ya hay un participante con ese nombre';
      if (s.players.length >= MAX_PLAYERS) return `Máximo ${MAX_PLAYERS} participantes`;
      // El objeto (o lo que presenta) es opcional: dos o tres palabras para reconocerlo
      s.players.push({ id: crypto.randomBytes(4).toString('hex'), name, thing: clean(b.thing, 40), votes: {}, done: false });
      return null;
    },
    remove: (s, b) => {
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      if (s.open === b.id) s.open = null;
      if (s.last === b.id) s.last = null;
      s.players = s.players.filter((p) => p.id !== b.id);
      return null;
    },
    open: (s, b) => {
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      if (!by(b.id)) return 'Ese participante ya no está';
      if (s.open && s.open !== b.id) { by(s.open).done = true; s.last = s.open; }
      s.open = b.id;
      s.openUntil = Date.now() + OPEN_MS;
      s.signup = false; // al empezar a votar se cierran las inscripciones
      return null;
    },
    close: (s) => {
      if (!s.open) return null;
      by(s.open).done = true;
      s.last = s.open;
      s.open = null;
      return null;
    },
    results: (s) => {
      if (s.phase !== 'voting') return null;
      if (s.open) return 'Primero cierra la votación en curso';
      if (s.players.length < 2) return 'Se necesitan al menos 2 participantes';
      const pending = s.players.filter((p) => !p.done);
      if (pending.length) return `Falta la votación de ${pending.map((p) => p.name).join(', ')}`;
      // Orden: mejor promedio; si empatan, quien recibió más votos; si siguen iguales, al azar
      const luck = Object.fromEntries(s.players.map((p) => [p.id, crypto.randomInt(1e9)]));
      s.rank = [...s.players].sort((a, b) => avg(b) - avg(a) || count(b) - count(a) || luck[a.id] - luck[b.id]).map((p) => p.id);
      s.revealed = 0;
      s.phase = 'results';
      s.final = { ids: s.rank.slice(0, 2), votes: {}, open: false, closed: false };
      return null;
    },
    reveal: (s) => {
      if (s.phase !== 'results') return 'Primero pasa a los resultados';
      if (s.revealed >= s.rank.length - 2) return 'Solo quedan los dos finalistas';
      s.revealed++;
      return null;
    },
    final: (s) => {
      if (s.phase !== 'results' && s.phase !== 'final') return 'Primero pasa a los resultados';
      if (s.revealed < s.rank.length - 2) return 'Primero revela los lugares anteriores';
      s.phase = 'final';
      s.final.open = true;
      s.final.closed = false;
      return null;
    },
    closefinal: (s) => {
      if (s.phase !== 'final' || !s.final.open) return null;
      s.final.open = false;
      s.final.closed = true;
      return null;
    },
    winner: (s) => {
      if (s.phase !== 'final' || !s.final.closed) return 'Primero cierra la votación de la gran final';
      const [a, b] = s.final.ids;
      const got = (id) => Object.values(s.final.votes).filter((x) => x === id).length;
      // Gana quien reciba más votos; si empatan, quien tuvo mejor nota en la primera votación (el orden de s.rank)
      s.winner = got(b) > got(a) ? b : a;
      s.phase = 'winner';
      s.winAt = Date.now();
      return null;
    },
    reset: () => { db.vote = blank(); return null; },
  };

  app.post('/api/vote/host', requireAdmin, (req, res) => {
    const b = req.body || {};
    const run = actions[String(b.action)];
    if (!run) return fail(res, 400, 'Acción no válida');
    const error = run(v(), b);
    if (error) return fail(res, 400, error);
    if (b.action !== 'title' && b.action !== 'add' && b.action !== 'remove') setStage('voto'); // cualquier paso del concurso lo pone en pantalla
    changed();
    return res.json(hostState());
  });

  return { rev: () => v().rev, clear: () => { db.vote = blank(); } };
};
