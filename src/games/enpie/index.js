// «El último en pie» (versión de prueba): todos juegan desde el celular, con vidas, banca y repechaje
module.exports = {
  id: 'enpie',
  name: 'El último en pie',
  stage: 'enpie',
  register(ctx) {
    const { app, db, save, requireAdmin, setStage, findPlayer } = ctx;
    require('./server')({ app, db, save, requireAdmin, fail: require('../../core/util').fail, setStage, findPlayer, festejo: () => ctx.festejo(),
      venue: () => ctx.salaVenue() || 'frida', notify: () => { ctx.broadcastAll(); ctx.aviso(); } });
    return {
      phoneFields: () => ({ enpieRev: (db.enpie || {}).rev || 0 }), // los celulares vuelven a leer cuando cambia
      current: () => { const e = db.enpie || {}; return e.phase && e.phase !== 'done' ? { game: 'enpie' } : null; },
      done: () => (db.enpie || {}).phase === 'done',
    };
  },
};
