// Sortear juego: cómo se elige el juego que sigue (a mano, por sorteo con tómbola o por votación del público)
module.exports = {
  id: 'sortear-juego',
  name: 'Sorteo de juegos',
  stage: 'juego',
  register(ctx) {
    const api = require('./server')(ctx);
    const { db } = ctx;
    return {
      ...api,
      // Sorteo del siguiente juego: parte de cero en cada sala (la forma de elegir y el total quedan para la próxima)
      onReset: () => { const g = db.gameDraw || {}; db.gameDraw = { played: [], last: null, rule2: true, total: g.total || 3, list: [], ready: null, free: !!g.free, how: g.how }; },
    };
  },
};
