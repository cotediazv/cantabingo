// Votación del juego: el público elige desde el celular el próximo juego (pestaña «Por votación» de Juegos)
module.exports = {
  id: 'votar-juego',
  name: 'Votación del juego',
  stage: 'votojuego',
  register(ctx) {
    const api = require('./server')(ctx);
    return {
      ...api,
      // Cambia al abrir o cerrar cada vuelta (no con cada voto): los celulares vuelven a leer la votación
      phoneFields: () => ({ gameVoteRev: (ctx.db.gameVote || {}).rev || 0 }),
      onReset: () => { api.stopTimer(); ctx.db.gameVote = api.blank(); },
    };
  },
};
