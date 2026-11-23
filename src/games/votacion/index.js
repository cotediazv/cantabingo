// Votación del público: «El objeto más extraño» y «El Festival de <local>» (concurso de karaoke)
module.exports = {
  id: 'votacion',
  name: 'Votación',
  stage: 'voto',
  register(ctx) {
    const { app, db, save, requireAdmin, setStage, findPlayer } = ctx;
    const vote = require('./server')({ app, db, save, requireAdmin, fail: require('../../core/util').fail, setStage, findPlayer,
      venue: () => ctx.salaVenue() || 'frida', notify: () => ctx.broadcastAll(), festejo: () => ctx.festejo() });
    return {
      ...vote,
      phoneFields: () => ({
        voteRev: (db.vote || {}).rev || 0, // los celulares vuelven a leer la votación cuando cambia
        voteGen: (db.vote || {}).gen || 0, // cambia con cada concurso nuevo (El Festival u objeto): los celulares muestran sus instrucciones
      }),
      onReset: () => { vote.clear(); },
    };
  },
};
