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
    return {
      onReset: () => { db.raffle = { picked: [], roll: null }; },
      // En pantalla: el sorteo de concursantes lleva a El Rosko; un desempate, al juego que lo pidió (bingo o El Rosko)
      current: () => {
        const r = db.raffle || {};
        if (r.mode !== 'tie') return { game: 'rosco' };
        if ((r.tie || {}).game !== 'rosco') return { game: 'bingo' };
        const w = Object.values(db.wheels || {}).sort((x, y) => y.created - x.created)[0];
        return w ? { game: 'rosco', wheel: w.id } : { game: 'rosco' }; // vuelve al panel de El Rosko, donde se acepta al ganador
      },
    };
  },
};
