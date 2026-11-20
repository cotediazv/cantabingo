// Sortear juego: la sala parte con un bingo y después se sortea el siguiente juego de la noche
module.exports = {
  id: 'sortear-juego',
  name: null, // en la consola se ve como «juego»
  stage: 'juego',
  register(ctx) {
    require('./server')(ctx);
    const { db } = ctx;
    return {
      // Sorteo del siguiente juego: parte de cero en cada sala
      onReset: () => { db.gameDraw = { played: [], last: null, rule2: true, total: (db.gameDraw || {}).total || 3, list: [], ready: null }; },
    };
  },
};
