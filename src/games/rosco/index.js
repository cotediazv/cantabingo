// El Rosko y la Trivia del Rosko (el público responde desde el celular con 3 alternativas)
module.exports = {
  id: 'rosco',
  name: 'El Rosko',
  stage: 'rueda',
  register(ctx) {
    const { app, db, save, requireAdmin, setStage, findPlayer } = ctx;
    const wheel = require('./server')({ app, db, save, requireAdmin, fail: require('../../core/util').fail, setStage, findPlayer, festejo: () => ctx.festejo() });
    const last = () => Object.values(db.wheels || {}).sort((a, b) => b.created - a.created)[0];
    return {
      ...wheel,
      // Durante El Rosko los celulares cambian el cartón por las preguntas del rosko en curso
      phoneFields: () => ({ roscoId: db.stage === 'rueda' ? (Object.values(db.wheels || {}).sort((a, b) => b.created - a.created)[0] || {}).id || null : null }),
      onReset: () => { wheel.clear(); },
      sweep: (before) => wheel.clear(before), // roscos sueltos (creados sin sala abierta) vencen a las 8 horas
      inPlay: wheel.inPlay, // un rosco en juego no deja la pantalla
      elegibles: [{ id: 'rosco', icon: '🎡', name: 'El Rosko' }],
      // Termina con el ganador aceptado y el de la Trivia ya mostrado (pedido de Cote: el ganador de la Trivia sale sí o sí)
      current: () => { const w = last(); return w && !(w.winAccepted && (w.crowd || {}).winner) ? { game: 'rosco', wheel: w.id } : null; },
      done: () => !!(last() || {}).winAccepted,
    };
  },
};
