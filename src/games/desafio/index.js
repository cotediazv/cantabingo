// «El Gran Desafío»: trivia de 10 escalones con un concursante en el escenario
module.exports = {
  id: 'desafio',
  name: 'El Gran Desafío',
  stage: 'desafio',
  register(ctx) {
    const { app, db, save, requireAdmin, setStage, findPlayer } = ctx;
    const desafio = require('./server')({ app, db, save, requireAdmin, fail: require('../../core/util').fail, setStage, findPlayer,
      venue: () => ctx.salaVenue() || 'frida', notify: () => ctx.broadcastAll() });
    void desafio; // devuelve { refresh }, que no se usa: sus pantallas leen /api/desafio
    return {
      phoneFields: () => ({ desafioRev: (db.desafio || {}).rev || 0 }), // ídem para la pregunta al público
    };
  },
};
