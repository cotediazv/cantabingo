// Votación del público: concursos donde la sala pone nota del 1 al 10 desde el celular.
// 1) El animador anota a los participantes y abre la votación de cada uno, por turno; la nota no se muestra.
// 2) Resultados: se revelan los lugares desde el último hasta el tercero.
// 3) Gran final: los dos primeros se definen con una votación nueva, eligiendo a uno de los dos.
// Concurso de karaoke (modo «karaoke», pedido de Cote): la gente se inscribe desde el celular con canción y artista; tras
// cada canción el público pone nota del 1 al 10; al cerrar se muestran 5 notas al azar (sin el promedio); los lugares se
// revelan desde el último y los dos finalistas van con redoble de tambores, sin votación nueva: se muestran el puntaje del
// segundo lugar y el del ganador.
const crypto = require('crypto');

const MAX_PLAYERS = 8;
const TITLE = 'El objeto más extraño';
const TITLES = { objeto: TITLE, karaoke: '' }; // el festival se llama según el local (ver festival())
const SHORT = { frida: 'Frida', kennedy: 'Mercado Kennedy', tobalaba: 'Tobalaba' }; // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)
// El Festival (concurso de karaoke, pedido de Cote): votación de 8 s por canción, inscripción de 1 minuto, 5 notas en
// pantalla durante 8 s
const K_OPEN_MS = 8000;
const K_SIGNUP_MS = 90000; // El Festival: la inscripción dura 90 segundos (pedido de Cote, 20 nov)
const K_MAX = 3; // El Festival parte siempre con 3 participantes (se puede cambiar)
const SAMPLE_MS = 8000;
const OPEN_MS = Number(process.env.VOTE_OPEN_MS) || 8000; // cada participante se evalúa durante 8 segundos (pedido de Cote, 23 nov: «8 segundos, no 18, para que sea más rápido»)
const FINAL_MS = Number(process.env.VOTE_OPEN_MS) || 18000; // la gran final sigue durando 18 segundos
const GRACE_MS = 1000; // margen para los votos que venían en camino al llegar a cero
const SIGNUP_MS = 90000; // El objeto más extraño: la inscripción dura 90 segundos (pedido de Cote, 20 nov)

module.exports = function vote({ app, db, save, requireAdmin, fail, setStage, findPlayer, venue, notify }) {
  const blank = (mode = 'objeto') => ({ mode, title: mode === 'karaoke' ? '' : TITLES[mode] || TITLE, max: mode === 'karaoke' ? K_MAX : MAX_PLAYERS, players: [], open: null, last: null, sample: null, phase: 'voting', rank: [], revealed: 0, final: null, winner: null, winAt: 0, rev: ((db.vote || {}).rev || 0) + 1, gen: ((db.vote || {}).gen || 0) + 1 });
  db.vote ||= blank();
  // Arreglo (20 nov): un Festival empezado de nuevo quedaba con el título «El objeto más extraño»
  if (db.vote.mode === 'karaoke' && db.vote.title === TITLE) db.vote.title = '';
  const v = () => db.vote;
  const clean = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);
  const changed = () => { v().rev++; save(); notify(); };
  const by = (id) => v().players.find((p) => p.id === id);
  const count = (p) => Object.keys(p.votes).length;
  const avg = (p) => { const n = Object.values(p.votes); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : 0; };
  const no = (p) => v().players.indexOf(p) + 1; // número del participante: el orden en que se anotó
  const round1 = (x) => Math.round(x * 10) / 10;
  const round2 = (x) => Math.round(x * 100) / 100;
  // Pedido de Cote: el resultado es la nota promedio con un decimal; si dos empatan con un decimal, se muestra el segundo
  const decOf = (p) => (v().players.some((q) => q !== p && q.done && round1(avg(q)) === round1(avg(p))) ? 2 : 1);
  const scoreOf = (p) => ({ score: decOf(p) === 2 ? round2(avg(p)) : round1(avg(p)), dec: decOf(p) });
  const cap = () => v().max || MAX_PLAYERS;
  const karaoke = () => v().mode === 'karaoke';
  const festival = () => `El Festival de ${SHORT[venue()] || 'Frida'}`;
  const titleOf = (s) => s.title || (s.mode === 'karaoke' ? festival() : TITLE);
  const openMs = () => (karaoke() ? K_OPEN_MS : OPEN_MS);
  const signupMs = () => (karaoke() ? K_SIGNUP_MS : SIGNUP_MS);
  const sampleOn = (s) => s.mode === 'karaoke' && s.sample && !s.sample.gone && s.last === s.sample.id && !s.open && !s.onstage;

  // Lugares ya revelados, del último hacia arriba (nunca los dos primeros: esos van a la gran final)
  const places = () => {
    const s = v();
    const n = s.rank.length;
    return Array.from({ length: s.revealed }, (_, i) => { const p = by(s.rank[n - 1 - i]); return { place: n - i, no: no(p), name: p.name, thing: p.thing || '', ...scoreOf(p) }; });
  };
  const finalists = () => (v().final ? v().players.filter((p) => v().final.ids.includes(p.id)).map((p) => ({ id: p.id, no: no(p), name: p.name, thing: p.thing || '' })) : []);

  const pub = () => {
    const s = v();
    const open = by(s.open);
    const last = by(s.last);
    return {
      rev: s.rev, venue: venue(), title: titleOf(s), mode: s.mode || 'objeto', phase: s.phase, now: Date.now(),
      signup: s.phase === 'voting' && !!s.signup, clockUntil: s.signup ? s.signupUntil || 0 : s.phase === 'voting' && s.open ? s.openUntil || 0 : s.phase === 'final' && s.final && s.final.open ? s.final.until || 0 : 0, clockMs: s.signup ? signupMs() : openMs(), max: cap(), room: karaoke() ? 1 : Math.max(0, cap() - s.players.length),
      // El Festival: 5 notas al azar del último que cantó, con el nombre de quien la puso (sin el promedio), durante 8 s
      sample: sampleOn(s) ? s.sample.notes : null,
      // El Festival: si se inscribieron más que los cupos, hay que sortear; drawn = los elegidos por sorteo
      overflow: karaoke() && s.phase === 'voting' && s.players.length > cap(),
      drawn: karaoke() && s.drawnAt && !s.players.some((p) => p.done) && !s.open ? s.players.map((p) => p.name) : null,
      players: s.players.map((p) => ({ id: p.id, no: no(p), name: p.name, thing: p.thing || '', done: !!p.done })),
      open: open ? { id: open.id, no: no(open), name: open.name, thing: open.thing || '' } : null,
      // «Iniciar participante» (pedido de Cote): quien está en el escenario antes de abrir su votación
      onstage: s.phase === 'voting' && !s.open && by(s.onstage) ? { id: s.onstage, no: no(by(s.onstage)), name: by(s.onstage).name, thing: by(s.onstage).thing || '' } : null,
      last: last ? { id: last.id, no: no(last), name: last.name, thing: last.thing || '' } : null,
      places: s.phase === 'voting' ? [] : places(),
      toReveal: s.phase === 'results' ? Math.max(0, s.rank.length - 2 - s.revealed) : 0,
      final: s.final ? { players: finalists(), open: !!s.final.open, closed: !!s.final.closed, drum: !!s.final.drum } : null,
      tie: s.phase === 'winner' && s.tie ? s.tie : null, // empate en la gran final: por qué ganó
      winner: s.phase === 'winner' && s.winner ? { no: no(by(s.winner)), name: by(s.winner).name, thing: by(s.winner).thing || '', ...(karaoke() ? scoreOf(by(s.winner)) : { score: null }) } : null, winAt: s.winAt || 0,
      second: s.phase === 'winner' && karaoke() && s.rank[1] && by(s.rank[1]) ? { no: no(by(s.rank[1])), name: by(s.rank[1]).name, thing: by(s.rank[1]).thing || '', ...scoreOf(by(s.rank[1])) } : null,
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
      next: next ? { place: n - s.revealed, no: no(next), name: next.name, thing: next.thing || '', ...scoreOf(next) } : null, tally };
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
      const who = findPlayer(String(b.sid || ''), token) || {};
      (by(s.open).voters ||= {})[token] = who.first || String(who.name || '').split(' ')[0] || ''; // solo el nombre (pedido de Cote)
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
    let what = clean(b.thing, 40);
    if (karaoke()) { // canción y artista (sin canción de reemplazo)
      const song = clean(b.song, 50); const artist = clean(b.artist, 40);
      if (song.length < 2 || artist.length < 2) return fail(res, 400, 'Escribe la canción y el artista');
      what = `${song} · ${artist}`;
    } else if (what.length < 2) return fail(res, 400, 'Escribe con qué vas a participar');
    if (!karaoke() && s.players.length >= cap()) return fail(res, 409, 'Ya se completaron los cupos');
    if (s.players.length >= 200) return fail(res, 409, 'Ya se completaron las inscripciones');
    s.players.push({ id: crypto.randomBytes(4).toString('hex'), name: pl.name, thing: what, by: token, votes: {}, done: false });
    if (!karaoke() && s.players.length >= cap()) s.signup = false; // se completaron los cupos: el llamado termina sin esperar al reloj
    changed();
    return res.json({ ok: true, no: s.players.length });
  });

  // Al agotarse el reloj, las inscripciones se cierran solas
  setInterval(() => {
    const s = v();
    if (s.signup && s.signupUntil && Date.now() >= s.signupUntil) { s.signup = false; changed(); }
    if (s.sample && !s.sample.gone && Date.now() - s.sample.at >= SAMPLE_MS) { s.sample.gone = true; changed(); }
    // La votación de cada participante se cierra sola al agotarse sus 10 segundos
    if (s.phase === 'voting' && s.open && s.openUntil && Date.now() >= s.openUntil + GRACE_MS) { actions.close(s); changed(); }
    // La gran final también dura 18 segundos y se cierra sola
    if (s.phase === 'final' && s.final && s.final.open && s.final.until && Date.now() >= s.final.until + GRACE_MS) { actions.closefinal(s); changed(); }
  }, 250).unref();

  const actions = {
    signup: (s, b) => {
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      s.signup = !!b.on;
      s.signupUntil = s.signup ? Date.now() + signupMs() : 0; // reloj en cuenta regresiva
      return null;
    },
    title: (s, b) => { const t = clean(b.title, 50); s.title = t && t !== festival() && !(s.mode === 'karaoke' && t === TITLE) ? t : ''; },
    // Tipo de concurso: solo al empezar, sin participantes
    mode: (s, b) => {
      if (s.phase !== 'voting' || s.players.length) return 'El tipo de concurso se elige antes de anotar participantes';
      const m = b.mode === 'karaoke' ? 'karaoke' : 'objeto';
      s.mode = m; s.title = ''; s.max = m === 'karaoke' ? K_MAX : MAX_PLAYERS;
      s.gen = (s.gen || 0) + 1; // otro tipo de concurso: los celulares muestran sus instrucciones
      return null;
    },
    // Cupos: cuántos participantes como máximo
    max: (s, b) => {
      const n = Math.round(Number(b.max));
      if (!(n >= 2 && n <= 30)) return 'Los cupos van de 2 a 30';
      if (n < s.players.length) return `Ya hay ${s.players.length} participantes anotados`;
      s.max = n;
      return null;
    },
    add: (s, b) => {
      const name = clean(b.name, 30).toLocaleUpperCase('es');
      if (!name) return 'Escribe el nombre del participante';
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      if (s.players.some((p) => p.name === name)) return 'Ya hay un participante con ese nombre';
      if (s.players.length >= cap()) return `Máximo ${cap()} participantes`;
      // El objeto (o lo que presenta) es opcional: dos o tres palabras para reconocerlo
      s.players.push({ id: crypto.randomBytes(4).toString('hex'), name, thing: clean(b.thing, 60), votes: {}, done: false });
      return null;
    },
    // El Festival: si se inscribieron más que los cupos, se sortean los que cantan (los demás salen de la lista)
    draw: (s) => {
      if (s.mode !== 'karaoke' || s.phase !== 'voting') return null;
      if (s.players.length <= cap()) return 'No hace falta sortear: caben todos';
      if (s.players.some((p) => p.done) || s.open) return 'Ya empezó la votación';
      const pool = [...s.players];
      for (let i = pool.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const keep = new Set(pool.slice(0, cap()).map((p) => p.id));
      s.players = s.players.filter((p) => keep.has(p.id));
      s.signup = false;
      s.drawnAt = Date.now();
      return null;
    },
    remove: (s, b) => {
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      if (s.open === b.id) s.open = null;
      if (s.last === b.id) s.last = null;
      if (s.onstage === b.id) s.onstage = null;
      s.players = s.players.filter((p) => p.id !== b.id);
      return null;
    },
    // «Iniciar participante» (pedido de Cote, 20 nov): en pantalla aparecen su nombre y su canción (o su objeto);
    // después, el mismo botón del panel dice «Iniciar votación»
    present: (s, b) => {
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      if (s.open) return 'Primero cierra la votación en curso';
      if (s.mode === 'karaoke' && s.players.length > cap()) return `Se inscribieron ${s.players.length}: primero sortea a los ${cap()} que cantan`;
      const p = by(b.id) || s.players.find((x) => !x.done);
      if (!p) return 'Ya participaron todos';
      s.onstage = p.id;
      s.signup = false;
      return null;
    },
    open: (s, b) => {
      if (s.phase !== 'voting') return 'El concurso ya pasó a los resultados';
      if (!by(b.id)) return 'Ese participante ya no está';
      s.onstage = null;
      if (s.mode === 'karaoke' && s.players.length > cap()) return `Se inscribieron ${s.players.length}: primero sortea a los ${cap()} que cantan`;
      if (s.open && s.open !== b.id) { by(s.open).done = true; s.last = s.open; }
      s.open = b.id;
      s.openUntil = Date.now() + openMs();
      s.signup = false; // al empezar a votar se cierran las inscripciones
      return null;
    },
    close: (s) => {
      if (!s.open) return null;
      // Concurso de karaoke: 5 notas al azar de las que puso el público, para dar ambiente sin revelar el promedio
      if (s.mode === 'karaoke') {
        const p = by(s.open);
        const all = Object.entries(p.votes).map(([t, x]) => ({ note: x, name: (p.voters || {})[t] || '' }));
        for (let i = all.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
        s.sample = { id: s.open, notes: all.slice(0, 5), at: Date.now() };
      }
      by(s.open).done = true;
      s.last = s.open;
      s.open = null;
      // El objeto más extraño (pedido de Cote, 23 nov: «desde el momento que se termina la votación, pasa automáticamente
      // a la siguiente persona para que muestre su objeto»): al cerrarse la votación sube solo el siguiente participante;
      // el animador solo toca «Iniciar votación». Con todos listos, queda «Pasar a los resultados».
      if (s.mode !== 'karaoke') { const nx = s.players.find((p) => !p.done); s.onstage = nx ? nx.id : null; }
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
      // Concurso de karaoke: sin votación nueva; redoble de tambores con los dos finalistas
      if (s.mode === 'karaoke') { s.phase = 'final'; Object.assign(s.final, { drum: true, open: false, closed: true, at: Date.now() }); return null; }
      s.phase = 'final';
      s.final.open = true;
      s.final.until = Date.now() + FINAL_MS;
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
      // (concurso de karaoke: gana el mejor promedio)
      s.winner = s.mode === 'karaoke' ? a : got(b) > got(a) ? b : a;
      // Pedido de Cote (22 nov): si hay empate en la gran final, se transparenta en pantalla por qué ganó («gana porque
      // sacó 7,8 contra 6,7 del otro participante»). El criterio es el orden de la primera votación: mejor nota promedio;
      // si la nota es la misma, quien recibió más notas del público; si siguen iguales, sorteo.
      s.tie = null;
      if (s.mode !== 'karaoke' && got(a) === got(b) && by(a) && by(b)) {
        const A = by(a); const B = by(b); const n = got(a);
        const title = `Empate en la gran final: ${n} ${n === 1 ? 'voto' : 'votos'} cada uno`;
        let dec = 1; while (dec < 3 && avg(A).toFixed(dec) === avg(B).toFixed(dec)) dec++;
        const nota = (p) => avg(p).toFixed(dec).replace('.', ',');
        const why = avg(A) > avg(B) && nota(A) !== nota(B) ? `Gana por su nota de la primera votación: ${nota(A)} contra ${nota(B)} de ${B.name}`
          : count(A) > count(B) ? `Tuvieron la misma nota (${avg(A).toFixed(1).replace('.', ',')}). Gana porque recibió más notas del público: ${count(A)} contra ${count(B)} de ${B.name}`
            : `También empataron en la primera votación (nota ${avg(A).toFixed(1).replace('.', ',')}). El ganador se definió por sorteo`;
        s.tie = { title, why };
      }
      s.phase = 'winner';
      s.winAt = Date.now();
      return null;
    },
    reset: (s) => { db.vote = blank(s.mode); return null; }, // el concurso nuevo es del mismo tipo
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

  // Sorteo de juegos: cuando sale El Festival o El objeto más extraño, la votación parte de cero con ese juego
  const start = (mode) => { db.vote = blank(mode === 'karaoke' ? 'karaoke' : 'objeto'); changed(); };
  return { rev: () => v().rev, clear: () => { db.vote = blank(); }, start };
};
