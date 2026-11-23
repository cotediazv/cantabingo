const crypto = require('crypto');
const { fail } = require('../../core/util');

module.exports = function sortearJuego(ctx) {
  const { app, db, save, requireAdmin } = ctx;
  const vote = () => ctx.games.get('votacion');
  const gameVote = () => ctx.games.get('votar-juego');

  // Sorteo del siguiente juego (pedido de Cote): la sala parte en Juegos, sin bingo (21 nov), y se sortea entre todos los juegos
  // (Bingo, El Rosko, El Festival y El objeto más extraño; el karaoke no es un juego), el bingo incluido desde el primer
  // sorteo. El juego que sale queda bloqueado solo para el sorteo siguiente y después vuelve a estar disponible.
  // El sorteo se ve en el tablero y en el GC (escenario «juego»).
  // Los juegos que se pueden elegir salen del registro (cada juego declara los suyos en `elegibles`)
  const DRAW_GAMES = ctx.games.elegibles().map((x) => x.id);
  db.gameDraw ||= { played: [], last: null };
  if (!db.gameDraw.rule2) { db.gameDraw.played = db.gameDraw.last ? [db.gameDraw.last.game] : []; db.gameDraw.rule2 = true; }
  // Cómo se elige el juego (pedido de Cote, 21 nov): tres pestañas en el lobby y bajo cada juego: «Manual» (el animador
  // toca el juego), «Por sorteo» (tómbola) y «Por votación» (el público vota desde el celular). La elección queda
  // guardada para las noches siguientes. Al cambiar de pestaña, un sorteo o una votación a medio hacer se cancela.
  const HOWS = ['manual', 'sorteo', 'votacion'];
  const howOf = () => (HOWS.includes(db.gameDraw.how) ? db.gameDraw.how : db.gameDraw.free ? 'manual' : 'sorteo');
  const drawPub = () => ({ ...db.gameDraw, how: howOf(), free: howOf() === 'manual', undo: undefined, undoable: !!(db.gameDraw.undo || []).length, games: DRAW_GAMES, venue: (Object.values(db.sessions)[0] || {}).theme || 'frida', now: Date.now() });
  app.get('/api/gamedraw', (_req, res) => res.json(drawPub()));
  // Cuántos juegos se sortean esa noche (pedido de Cote): 1.º, 2.º, 3.º… sorteados
  db.gameDraw.list ||= [];
  db.gameDraw.total ||= 3;
  app.post('/api/gamedraw/mode', requireAdmin, (req, res) => {
    const b = req.body || {};
    const how = HOWS.includes(b.how) ? b.how : b.free ? 'manual' : 'sorteo';
    db.gameDraw.how = how;
    db.gameDraw.free = how === 'manual';
    if (how !== 'sorteo') {
      db.gameDraw.ready = null; // un sorteo a medio empezar se cancela
      if (db.stage === 'juego' && !ctx.stageLocked('qr')) ctx.setStage('qr'); // y las pantallas quedan con el QR para entrar (no vuelve un bingo viejo)
    }
    if (how !== 'votacion') {
      if (['voting', 'result', 'intro'].includes(db.gameVote.phase)) gameVote().cancel(); // una votación (o su presentación) a medio hacer se cancela
      if (db.stage === 'votojuego' && !ctx.stageLocked('qr')) ctx.setStage('qr');
    }
    save();
    res.json(drawPub());
  });
  // El Festival o El objeto más extraño elegidos (a mano, por sorteo o por votación): si ya hay un concurso de ese tipo sin
  // ganador, sigue el mismo (con sus inscritos, cupos y título); si no, empieza uno nuevo
  const startContest = (game) => {
    const mode = game === 'festival' ? 'karaoke' : 'objeto';
    const v = db.vote || {};
    if (v.winner) { vote().start(mode); return; } // el anterior ya terminó: uno nuevo
    if ((v.mode || 'objeto') === mode) return; // del mismo tipo y sin ganador: sigue el mismo
    if ((v.players || []).length || v.signup) return; // otro concurso en curso: no se borra (el panel ofrece reemplazarlo)
    vote().start(mode);
  };
  // Cada pestaña permite solo su forma de elegir
  const notFree = (res) => {
    const h = howOf();
    if (h === 'sorteo') return true;
    fail(res, 409, h === 'manual' ? 'Está elegida la pestaña «Manual»: no hay sorteo' : 'Está elegida la pestaña «Por votación»: el juego lo elige el público');
    return false;
  };
  // «Manual»: el juego elegido empieza de cero (como uno sorteado) pero sin número de la noche
  app.post('/api/gamedraw/free', requireAdmin, (req, res) => {
    if (howOf() !== 'manual') return fail(res, 409, howOf() === 'sorteo' ? 'Está elegida la pestaña «Por sorteo»: el juego sale en el sorteo' : 'Está elegida la pestaña «Por votación»: el juego lo elige el público');
    const game = String((req.body || {}).game);
    if (!DRAW_GAMES.includes(game)) return fail(res, 400, 'Juego no válido');
    if (game === 'festival' || game === 'objeto') {
      startContest(game); // un concurso del mismo tipo sin ganador no se borra: tocarlo en el menú solo vuelve a su panel
      ctx.setStage('voto'); // las pantallas y los celulares pasan de inmediato al juego elegido
    }
    db.gameDraw.seq = (db.gameDraw.seq || 0) + 1;
    save();
    return res.json(db.gameDraw);
  });
  app.post('/api/gamedraw/total', requireAdmin, (req, res) => {
    const n = Math.round(Number((req.body || {}).total));
    if (!(n >= 1 && n <= 10)) return fail(res, 400, 'Elige entre 1 y 10 juegos');
    if (n < db.gameDraw.list.length) return fail(res, 400, `Ya se sortearon ${db.gameDraw.list.length} juegos`);
    db.gameDraw.total = n;
    save();
    return res.json(db.gameDraw);
  });
  // Sorteo en dos pasos (pedido de Cote, 20 nov): 1) «Iniciar sorteo de juegos»: las pantallas muestran los juegos que
  // pueden salir; 2) «Girar la tómbola». Entre los dos, el animador puede elegir un juego directo, sin tómbola
  // (/api/gamedraw/pick): ese juego queda como el siguiente número de la noche.
  // Deshacer (pedido de Cote, 20 nov): antes de cada paso (iniciar, girar la tómbola, elegir directo) se guarda cómo
  // estaba el sorteo; «Deshacer» vuelve al paso anterior
  const drawSnap = (g) => { g.undo = (g.undo || []).slice(-9); g.undo.push(JSON.stringify({ played: g.played, last: g.last, list: g.list, ready: g.ready || null })); };
  const locked = (res) => fail(res, 409, `${ctx.stageNames()[db.stage] || 'Un juego'} está en juego: el sorteo se verá cuando termine la partida`);
  app.post('/api/gamedraw/undo', requireAdmin, (_req, res) => {
    const g = db.gameDraw;
    if (!g.undo || !g.undo.length) return fail(res, 400, 'No hay nada que deshacer');
    Object.assign(g, JSON.parse(g.undo.pop()));
    if (howOf() !== 'sorteo') g.ready = null; // fuera de «Por sorteo» no vuelve un sorteo a medio empezar
    save();
    return res.json(db.gameDraw);
  });
  app.post('/api/gamedraw/ready', requireAdmin, (_req, res) => {
    if (!notFree(res)) return undefined;
    const g = db.gameDraw;
    if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
    drawSnap(g);
    g.ready = { at: Date.now(), pool: DRAW_GAMES.filter((x) => !(g.last && g.last.game === x)) };
    save();
    if (ctx.setStage('juego') === false) return locked(res);
    return res.json(db.gameDraw);
  });
  app.post('/api/gamedraw/pick', requireAdmin, (req, res) => {
    if (!notFree(res)) return undefined;
    const g = db.gameDraw;
    const game = String((req.body || {}).game);
    if (!DRAW_GAMES.includes(game)) return fail(res, 400, 'Juego no válido');
    if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
    drawSnap(g);
    g.played = [game]; g.list.push(game); g.ready = null; g.seq = (g.seq || 0) + 1;
    g.last = { game, pool: [game], at: Date.now(), direct: true };
    if (game === 'festival' || game === 'objeto') startContest(game);
    save();
    ctx.setStage('juego');
    return res.json(db.gameDraw);
  });
  app.post('/api/gamedraw', requireAdmin, (_req, res) => {
    if (!notFree(res)) return undefined;
    const g = db.gameDraw;
    if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
    const pool = DRAW_GAMES.filter((x) => !(g.last && g.last.game === x)); // el que salió recién queda fuera de este sorteo
    drawSnap(g);
    const game = pool[crypto.randomInt(pool.length)];
    g.played = [game]; // bloqueado solo para el sorteo siguiente
    g.list.push(game); // queda en su número (1.º, 2.º…) en la pantalla
    g.ready = null; g.seq = (g.seq || 0) + 1;
    g.last = { game, pool, at: Date.now() };
    if (game === 'festival' || game === 'objeto') startContest(game); // la votación queda lista con su título
    save();
    if (ctx.setStage('juego') === false) return locked(res);
    return res.json(db.gameDraw);
  });
  return { DRAW_GAMES, howOf, startContest };
};
