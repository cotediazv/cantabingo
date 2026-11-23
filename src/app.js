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
  require('./games/votar-juego'),
  require('./games/enpie'),
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
  // Registro de clientes (pedido de Cote, 22 nov): va antes de las rutas, porque mira pasar lo que el público hace desde el
  // celular (entrar, responder la Trivia, votar, pedir canciones…) y lo anota en la ficha de cada persona
  require('./features/clientes')({ app, db, requireAdmin: ctx.requireAdmin, dir: path.dirname(DATA_FILE), port: process.env.PORT || 3000 });
  ctx.aviso = require('./core/aviso')(ctx); // aviso inmediato a las pantallas (/api/live)
  ctx.gcper = require('./features/gcper')(ctx); // GC PER de la sala de juegos
  // Confeti en el GC de OBS cada vez que hay un ganador (pedido de Cote, 23 nov): bingo (ganador confirmado), El Rosko y
  // su Trivia, El Festival y El objeto más extraño. Es el efecto «Confeti» de la capa gráfica, en el local de la sala abierta.
  ctx.festejo = () => { const s = Object.values(db.sessions)[0]; if (s && ctx.capa) ctx.capa.fire(s.theme || 'frida', 'confeti'); };
  const stage = require('./core/stage')(ctx); // setStage, stageLocked, stageNames, resetEvent
  require('./bingo')(ctx); // findPlayer, broadcast, broadcastAll, connectedNames, startSession, closeSession…

  // Juegos y funciones de los locales (el karaoke va antes de la votación como siempre: la sala light lo necesita)
  const [rosco, sorteo, votacion, desafio, sortearJuego, votarJuego, enpie] = GAMES;
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
  ctx.games.register(enpie, ctx); // «El último en pie», versión de prueba (pedido de Cote, 23 nov)
  ctx.light = require('./features/light/server')({ app, db, save, requireAdmin: ctx.requireAdmin, requireLocal: ctx.requireLocal, fail, karaoke: ctx.karaoke, insta: ctx.insta, aviso: ctx.aviso });
  ctx.capa = require('./features/capa')({ app, requireLocal: ctx.requireLocal, fail, aviso: ctx.aviso }); // capa gráfica sobre la cámara (botones del GC Master)
  require('./features/vertical/server')({ app, db, save, requireAdmin: ctx.requireAdmin, fail, karaoke: ctx.karaoke, perOf: ctx.gcper.of, dir: path.dirname(DATA_FILE) }); // pantallas de los locales
  // Conectados (pedido de Cote, 22 nov): números en vivo por local, gráfico de las últimas 3 horas y registro por jornada
  require('./features/conectados')({ app, db, save, requireAdmin: ctx.requireAdmin, port: process.env.PORT || 3000, salaOf: ctx.salaOf });
  require('./features/web/youtube')({ app }); // últimos videos del canal, para la página web
  require('./features/web/twitch')({ app }); // videos y transmisiones en vivo de Twitch, para la página web
  require('./features/web/instagram-web')({ app, db, save, insta: ctx.insta }); // últimos videos de Instagram de cada local
  require('./features/consola')(ctx); // en qué está cada local
  // Programación del local del día: el de la sala abierta o, si no hay, el elegido en la sección Karaoke
  require('./features/agenda/server')({ app, db, save, requireAdmin: ctx.requireAdmin, fail, currentVenue: dayVenue });
  ctx.games.register(sortearJuego, ctx);
  ctx.games.register(votarJuego, ctx);
  require('./features/tema')(ctx); // diseño de las pantallas y dirección de los QR
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
