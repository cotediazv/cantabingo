// El Rosco y la Trivia del Rosco (el público responde desde el celular con 3 alternativas)
module.exports = {
  id: 'rosco',
  name: 'El Rosco',
  stage: 'rueda',
  register(ctx) {
    const { app, db, save, requireAdmin, setStage, findPlayer } = ctx;
    const wheel = require('./server')({ app, db, save, requireAdmin, fail: require('../../core/util').fail, setStage, findPlayer });
    return {
      ...wheel,
      // Durante El Rosco los celulares cambian el cartón por las preguntas del rosco en curso
      phoneFields: () => ({ roscoId: db.stage === 'rueda' ? (Object.values(db.wheels || {}).sort((a, b) => b.created - a.created)[0] || {}).id || null : null }),
      onReset: () => { wheel.clear(); },
      sweep: (before) => wheel.clear(before), // roscos sueltos (creados sin sala abierta) vencen a las 8 horas
      inPlay: wheel.inPlay, // un rosco en juego no deja la pantalla
    };
  },
};
