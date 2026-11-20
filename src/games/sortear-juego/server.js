const crypto = require('crypto');
const { fail } = require('../../core/util');

module.exports = function sortearJuego(ctx) {
  const { app, db, save, requireAdmin } = ctx;

  // Sorteo del siguiente juego (pedido de Cote): la sala parte con un bingo; después se sortea entre todos los juegos
  // (Bingo, El Rosco, El Festival y El objeto más extraño; el karaoke no es un juego), el bingo incluido desde el primer
  // sorteo. El juego que sale queda bloqueado solo para el sorteo siguiente y después vuelve a estar disponible.
  // El sorteo se ve en el tablero y en el GC (escenario «juego»).
  const DRAW_GAMES = ['bingo', 'rosco', 'festival', 'objeto'];
  db.gameDraw ||= { played: [], last: null };
  if (!db.gameDraw.rule2) { db.gameDraw.played = db.gameDraw.last ? [db.gameDraw.last.game] : []; db.gameDraw.rule2 = true; }
  app.get('/api/gamedraw', (_req, res) => res.json({ ...db.gameDraw, undo: undefined, undoable: !!(db.gameDraw.undo || []).length, games: DRAW_GAMES, venue: (Object.values(db.sessions)[0] || {}).theme || 'frida', now: Date.now() }));
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
  // Deshacer (pedido de Cote, 20 nov): antes de cada paso (iniciar, girar la tómbola, elegir directo) se guarda cómo
  // estaba el sorteo; «Deshacer» vuelve al paso anterior
  const drawSnap = (g) => { g.undo = (g.undo || []).slice(-9); g.undo.push(JSON.stringify({ played: g.played, last: g.last, list: g.list, ready: g.ready || null })); };
  app.post('/api/gamedraw/undo', requireAdmin, (_req, res) => {
    const g = db.gameDraw;
    if (!g.undo || !g.undo.length) return fail(res, 400, 'No hay nada que deshacer');
    Object.assign(g, JSON.parse(g.undo.pop()));
    save();
    res.json(db.gameDraw);
  });
  app.post('/api/gamedraw/ready', requireAdmin, (_req, res) => {
    const g = db.gameDraw;
    if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
    drawSnap(g);
    g.ready = { at: Date.now(), pool: DRAW_GAMES.filter((x) => !(g.last && g.last.game === x)) };
    save();
    if (ctx.setStage('juego') === false) return fail(res, 409, 'El Rosco está en juego: el sorteo se verá cuando termine la partida');
    res.json(db.gameDraw);
  });
  app.post('/api/gamedraw/pick', requireAdmin, (req, res) => {
    const g = db.gameDraw;
    const game = String((req.body || {}).game);
    if (!DRAW_GAMES.includes(game)) return fail(res, 400, 'Juego no válido');
    if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
    drawSnap(g);
    g.played = [game]; g.list.push(game); g.ready = null;
    g.last = { game, pool: [game], at: Date.now(), direct: true };
    if (game === 'festival' || game === 'objeto') ctx.games.get('votacion').start(game === 'festival' ? 'karaoke' : 'objeto');
    save();
    ctx.setStage('juego');
    res.json(db.gameDraw);
  });
  app.post('/api/gamedraw', requireAdmin, (_req, res) => {
    const g = db.gameDraw;
    if (g.list.length >= g.total) return fail(res, 409, `Ya se sortearon los ${g.total} juegos de la noche`);
    const pool = DRAW_GAMES.filter((x) => !(g.last && g.last.game === x)); // el que salió recién queda fuera de este sorteo
    drawSnap(g);
    const game = pool[crypto.randomInt(pool.length)];
    g.played = [game]; // bloqueado solo para el sorteo siguiente
    g.list.push(game); // queda en su número (1.º, 2.º…) en la pantalla
    g.ready = null;
    g.last = { game, pool, at: Date.now() };
    if (game === 'festival' || game === 'objeto') ctx.games.get('votacion').start(game === 'festival' ? 'karaoke' : 'objeto'); // la votación queda lista con su título
    save();
    if (ctx.setStage('juego') === false) return fail(res, 409, 'El Rosco está en juego: el sorteo se verá cuando termine la partida');
    res.json(db.gameDraw);
  });
};
