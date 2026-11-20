// Sorteo de concursantes (entre los conectados) y desempates por tómbola
module.exports = {
  id: 'sorteo',
  name: 'Sorteo',
  stage: 'sorteo',
  register(ctx) {
    const { app, db, save, requireAdmin, setStage, connectedNames } = ctx;
    // Tras corregir un nombre, se vuelve a enviar el estado a todas las pantallas abiertas
    const refreshAll = () => { ctx.broadcastAll(); ctx.games.refresh(); };
    require('./server')({ app, db, save, requireAdmin, fail: require('../../core/util').fail, setStage, refreshAll, connectedNames });
    return { onReset: () => { db.raffle = { picked: [], roll: null }; } };
  },
};
