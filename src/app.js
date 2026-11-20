// Arma el servidor: núcleo (datos, acceso, escenario, bingo), juegos (src/games) y funciones de los locales (src/features).
// Para agregar un juego: crear src/games/<id>/index.js con su contrato (ver src/core/registry.js) y sumarlo a GAMES.
const express = require('express');
const path = require('path');
const createStore = require('./core/store');
const createRegistry = require('./core/registry');
const { fail } = require('./core/util');

// Juegos, en el orden en que se cargan
const GAMES = [
  require('./games/rosco'),
  require('./games/sorteo'),
  require('./games/votacion'),
  require('./games/desafio'),
  require('./games/sortear-juego'),
];

function createApp() {
  const { db, save, DATA_FILE, hasDisk } = createStore();
  const app = express();
  app.set('trust proxy', 1); // detrás del proxy del hosting, para ver la IP real
  app.use(express.json({ limit: '1mb' }));
  // Sin caché: así cada celular recibe siempre la última versión publicada
  app.use(express.static(path.join(__dirname, '..', 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  require('./core/links')({ app });

  // Contexto común: lo que cada parte ofrece queda aquí para las demás
  const ctx = {
    app, db, save, fail, games: createRegistry(),
    // El local de la sala principal abierta ('' si no hay sala)
    salaVenue: () => (Object.values(db.sessions)[0] || {}).theme || '',
  };
  Object.assign(ctx, require('./core/auth')(ctx)); // validToken, requireAdmin, requireLocal, staffVenue
  const stage = require('./core/stage')(ctx); // setStage, stageLocked, stageNames, resetEvent
  require('./bingo')(ctx); // findPlayer, broadcast, broadcastAll, connectedNames, startSession, closeSession…

  // Juegos y funciones de los locales (el karaoke va antes de la votación como siempre: la sala light lo necesita)
  const [rosco, sorteo, votacion, desafio, sortearJuego] = GAMES;
  ctx.games.register(rosco, ctx);
  ctx.games.register(sorteo, ctx);
  ctx.karaoke = require('./features/karaoke/server')({ app, db, save, requireAdmin: ctx.requireAdmin, requireLocal: ctx.requireLocal, fail,
    salaVenue: ctx.salaVenue,
    findPlayer: (sid, token) => ctx.findPlayer(sid, token) || (ctx.light ? ctx.light.findPlayer(sid, token) : null),
    lightVenue: (sid) => (ctx.light ? ctx.light.venueOf(sid) : ''), extraVenues: () => (ctx.light ? ctx.light.pollVenues() : []) });
  ctx.games.register(votacion, ctx);
  ctx.games.register(desafio, ctx);
  // «Síguenos en Instagram»: la cuenta del local de la sala abierta
  const dayVenue = () => ctx.salaVenue() || (db.karaoke || {}).venue || 'frida';
  ctx.insta = require('./features/insta/server')({ app, db, save, requireAdmin: ctx.requireAdmin, fail, venue: dayVenue });
  // Sala light: karaoke, show y cartelera en otro local, al mismo tiempo que la sala principal
  ctx.light = require('./features/light/server')({ app, db, save, requireAdmin: ctx.requireAdmin, requireLocal: ctx.requireLocal, fail, karaoke: ctx.karaoke, insta: ctx.insta });
  require('./features/vertical/server')({ app, db, save, requireAdmin: ctx.requireAdmin, fail, karaoke: ctx.karaoke, dir: path.dirname(DATA_FILE) }); // pantallas de los locales
  require('./features/web/youtube')({ app }); // últimos videos del canal, para la página web
  require('./features/web/twitch')({ app }); // videos y transmisiones en vivo de Twitch, para la página web
  require('./features/web/instagram-web')({ app, db, save, insta: ctx.insta }); // últimos videos de Instagram de cada local
  require('./features/consola')(ctx); // en qué está cada local
  // Programación del local del día: el de la sala abierta o, si no hay, el elegido en la sección Karaoke
  require('./features/agenda/server')({ app, db, save, requireAdmin: ctx.requireAdmin, fail, currentVenue: dayVenue });
  ctx.games.register(sortearJuego, ctx);
  stage.routes();
  require('./features/horarios')(ctx); // karaoke automático del jueves y salas automáticas

  function listen(port) {
    const httpServer = app.listen(port, () => console.log(`Bingo listo en http://localhost:${port} · datos en ${DATA_FILE}${hasDisk ? ' (disco permanente)' : ' (se pierden al reiniciar)'}`));
    // Conexiones que se reutilizan (keep-alive): el servidor las mantiene abiertas más tiempo que el intermediario de Render
    // y que los celulares que consultan cada 4–6 s. Con el valor por defecto (5 s) a veces el servidor cerraba una conexión
    // justo cuando llegaba una consulta, y esa consulta fallaba (se vio en la prueba de carga de 1 hora).
    httpServer.keepAliveTimeout = 75000;
    httpServer.headersTimeout = 76000;
    return httpServer;
  }
  return { app, ctx, listen };
}

module.exports = { createApp, GAMES };
