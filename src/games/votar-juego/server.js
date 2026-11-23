// Elegir el juego por votación del público (pedido de Cote, 21 nov): 30 segundos para votar desde el celular entre
// los juegos (Bingo, El Rosko, El Festival y El objeto más extraño). Gana el que tiene más de la mitad de los votos
// (50 % + 1, mayoría simple); si ninguno lo logra, hay segunda vuelta de 30 segundos entre los 2 primeros. Los empates
// (para pasar a la segunda vuelta o en la segunda vuelta) se deciden por sorteo. Se ve en el tablero y en el GC
// (escenario «votojuego») con un gráfico en círculo por juego, con sus votos y su porcentaje. Un voto por celular en
// cada vuelta (se puede cambiar mientras está abierta). Los celulares no reciben un aviso por cada voto: solo al
// abrir y al cerrar cada vuelta (gameVoteRev); las pantallas y el panel leen los votos cada segundo.
const crypto = require('crypto');
const { fail } = require('../../core/util');

const GV_MS = 30000;
// Presentación antes de votar (pedido de Cote, 21 nov): las reglas para el público y cada juego con su dibujo, una lámina
// cada 10 s (public/gameintro.js); el animador puede adelantar («Siguiente») o iniciar la votación cuando quiera
const INTRO_MS = 10000; const INTRO_LAST = 5;

module.exports = function votarJuego(ctx) {
  const { app, db, save, requireAdmin } = ctx;
  const draw = () => ctx.games.get('sortear-juego'); // DRAW_GAMES, howOf, startContest
  const introStep = (g) => (g.intro ? Math.min(INTRO_LAST, (g.intro.step || 0) + Math.floor(Math.max(0, Date.now() - g.intro.at) / INTRO_MS)) : 0);
  function blank() {
    const old = db.gameVote || {};
    return { id: old.id || 0, rev: (old.rev || 0) + 1, phase: 'idle', round: 0, options: [], votes: {}, until: 0, counts: null, total: 0, runoff: null, tie2: false, winner: null, tie: false, empty: false, decidedAt: 0 };
  }
  db.gameVote ||= blank();
  let timer = null;
  function stopTimer() { clearTimeout(timer); timer = null; }
  const all = () => ctx.broadcastAll();
  const countsOf = (g) => {
    const c = Object.fromEntries(g.options.map((k) => [k, 0]));
    for (const k of Object.values(g.votes || {})) if (k in c) c[k]++;
    return c;
  };
  // Orden por votos, de más a menos; entre los que empatan, el orden sale de un sorteo
  const order = (g, counts) => {
    const a = [...g.options];
    for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a.sort((x, y) => counts[y] - counts[x]);
  };
  function close() {
    const g = db.gameVote;
    if (g.phase !== 'voting') return;
    stopTimer();
    const counts = countsOf(g);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    Object.assign(g, { counts, total, empty: !total });
    if (!total) g.phase = 'result'; // nadie votó: se puede repetir la vuelta
    else {
      const [a, b, c] = order(g, counts);
      if (g.round === 1 && counts[a] * 2 <= total) {
        // nadie pasó la mitad: segunda vuelta con los 2 primeros (si el 2.º lugar estaba empatado, se sorteó)
        g.phase = 'result'; g.runoff = [a, b]; g.tie2 = c !== undefined && counts[b] === counts[c];
      } else {
        g.phase = 'done'; g.winner = a; g.tie = g.round === 2 && counts[a] === counts[b]; g.decidedAt = Date.now();
        if (a === 'festival' || a === 'objeto') draw().startContest(a); // el concurso queda listo
      }
    }
    g.rev++;
    save();
    all();
  }
  function cancel() {
    stopTimer();
    db.gameVote = blank();
    all();
  }
  // Si el servicio se reinició en medio de una vuelta, se cierra a su hora
  if (db.gameVote.phase === 'voting') timer = setTimeout(close, Math.max(0, db.gameVote.until - Date.now()) + 250);
  const pub = () => {
    const g = db.gameVote;
    if (g.phase === 'voting' && Date.now() >= g.until + 250) close();
    const counts = g.phase === 'voting' ? countsOf(g) : g.counts || Object.fromEntries(g.options.map((k) => [k, 0]));
    return { id: g.id, rev: g.rev, phase: g.phase, round: g.round, options: g.options, until: g.until, ms: GV_MS, now: Date.now(),
      intro: g.phase === 'intro' && g.intro ? { at: g.intro.at, step: g.intro.step || 0, ms: INTRO_MS, current: introStep(g) } : null,
      counts, total: Object.values(counts).reduce((a, b) => a + b, 0), runoff: g.runoff, tie2: !!g.tie2, winner: g.winner, tie: !!g.tie,
      empty: !!g.empty, decidedAt: g.decidedAt || 0, how: draw().howOf(), venue: (Object.values(db.sessions)[0] || {}).theme || 'frida' };
  };
  const lockedMsg = (what) => `${ctx.stageNames()[ctx.stageLocked('votojuego')] || 'Un juego'} está en juego: ${what} se hace cuando termine la partida`;
  app.get('/api/gamevote', (req, res) => {
    const out = pub();
    const sid = String(req.query.sid || ''); const token = String(req.query.token || '');
    if (token && ctx.findPlayer(sid, token)) out.mine = (db.gameVote.votes || {})[token] || null;
    res.json(out);
  });
  // «Iniciar votación»: abre la 1.ª vuelta con todos los juegos; si la anterior terminó sin mayoría, abre la segunda
  // vuelta con los 2 primeros; si nadie votó, repite la misma vuelta
  app.post('/api/gamevote/start', requireAdmin, (_req, res) => {
    if (draw().howOf() !== 'votacion') return fail(res, 409, 'Elige primero la pestaña «Por votación»');
    if (!Object.keys(db.sessions).length) return fail(res, 409, 'Primero crea la sala de juegos');
    const g = db.gameVote;
    if (g.phase === 'voting' && Date.now() >= g.until) close(); // la vuelta ya terminó: primero se cuentan sus votos
    if (g.phase === 'voting' && Date.now() < g.until) return fail(res, 409, 'Ya hay una votación abierta');
    if (ctx.stageLocked('votojuego')) return fail(res, 409, lockedMsg('la votación'));
    const second = g.phase === 'result' && Array.isArray(g.runoff) && g.runoff.length === 2;
    Object.assign(g, { phase: 'voting', round: second ? 2 : 1, options: second ? g.runoff.slice() : draw().DRAW_GAMES.slice(), votes: {}, until: Date.now() + GV_MS,
      counts: null, total: 0, winner: null, tie: false, empty: false, decidedAt: 0 });
    if (!second) { g.id = (g.id || 0) + 1; g.runoff = null; g.tie2 = false; }
    g.rev++;
    stopTimer();
    timer = setTimeout(close, GV_MS + 250);
    save();
    if (db.stage === 'votojuego') all(); else ctx.setStage('votojuego'); // las pantallas y los celulares pasan a la votación
    return res.json(pub());
  });
  // Presentar los juegos en pantalla (al entrar en «Por votación» o con el botón): reglas y juego por juego
  app.post('/api/gamevote/intro', requireAdmin, (_req, res) => {
    if (draw().howOf() !== 'votacion') return fail(res, 409, 'Elige primero «Por votación»');
    if (!Object.keys(db.sessions).length) return fail(res, 409, 'Primero crea la sala de juegos');
    const g = db.gameVote;
    if (g.phase === 'voting' && Date.now() < g.until) return fail(res, 409, 'Hay una votación abierta');
    if (ctx.stageLocked('votojuego')) return fail(res, 409, lockedMsg('la presentación'));
    stopTimer();
    Object.assign(g, { phase: 'intro', intro: { at: Date.now(), step: 0 }, round: 0, options: draw().DRAW_GAMES.slice(), votes: {}, until: 0, counts: null, total: 0, runoff: null, tie2: false, winner: null, tie: false, empty: false, decidedAt: 0 });
    g.rev++;
    save();
    if (db.stage === 'votojuego') all(); else ctx.setStage('votojuego');
    return res.json(pub());
  });
  // «Siguiente»: adelanta a la lámina que sigue
  app.post('/api/gamevote/next', requireAdmin, (_req, res) => {
    const g = db.gameVote;
    if (g.phase !== 'intro' || !g.intro) return fail(res, 409, 'No hay una presentación en pantalla');
    g.intro = { at: Date.now(), step: Math.min(INTRO_LAST, introStep(g) + 1) };
    g.rev++;
    save();
    all();
    return res.json(pub());
  });
  // Voto desde el celular de quien está en la sala; mientras la vuelta está abierta, se puede cambiar
  app.post('/api/gamevote/vote', (req, res) => {
    const b = req.body || {};
    const sid = String(b.sid || ''); const token = String(b.token || '');
    if (!ctx.findPlayer(sid, token)) return fail(res, 403, 'Primero únete a la sala con tu nombre');
    const g = db.gameVote;
    if (g.phase !== 'voting' || Date.now() > g.until + 250) return fail(res, 409, 'La votación está cerrada');
    const game = String(b.game || '');
    if (!g.options.includes(game)) return fail(res, 400, 'Elige uno de los juegos de la votación');
    g.votes[token] = game;
    save();
    return res.json({ ok: true, mine: game });
  });
  // Cancelar la votación (vuelve a cero); si estaba en pantalla, las pantallas vuelven a la sala
  app.post('/api/gamevote/reset', requireAdmin, (_req, res) => {
    cancel();
    save();
    if (db.stage === 'votojuego' && !ctx.stageLocked('qr')) ctx.setStage('qr'); // las pantallas quedan con el QR para entrar
    res.json(pub());
  });
  return { blank, stopTimer, cancel };
};
