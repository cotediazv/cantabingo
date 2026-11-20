// Escenario: qué se ve ahora en el tablero, en el OBS y en los celulares de la sala principal. Cambia solo al activar
// un bingo, crear un rosco, lanzar un sorteo o empezar un juego; el moderador también puede cambiarlo a mano.
// Los escenarios de los juegos salen del registro (src/core/registry.js); aquí están solo los que no son juegos.
const { fail } = require('./util');

const BASE_STAGES = ['bingo', 'qr', 'karaoke', 'show', 'insta', 'none'];
const BASE_NAMES = { bingo: 'Bingo', qr: 'QR grande', karaoke: 'Karaoke', show: 'Show', insta: 'Instagram', none: 'Nada', cartelera: 'Cartelera de la semana' };

module.exports = function stage(ctx) {
  const { db, save, games } = ctx;
  const stages = () => [...BASE_STAGES, ...games.stages()];
  // Pedido de Cote: el juego que está en actividad tiene prioridad. Mientras haya, por ejemplo, un rosco en juego, la
  // pantalla queda en El Rosco aunque se apriete otra cosa (un botón del bingo, el escenario a mano o el karaoke
  // automático); al terminar, todo vuelve a funcionar como siempre. setStage devuelve false si no se cambió.
  const stageLocked = (show) => games.lockedStage(show);
  const setStage = (show) => {
    const lock = stageLocked(show);
    if (lock) { if (db.stage !== lock) { db.stage = lock; save(); ctx.broadcastAll(); } return false; }
    const changed = db.stage !== show;
    db.stage = show;
    save();
    if (changed) ctx.broadcastAll(); // los celulares se enteran del cambio de juego
    return undefined;
  };
  const stageNames = () => ({ ...BASE_NAMES, ...games.names() });
  // Deja en blanco lo que pertenece a una jornada: lista de participantes y lo de cada juego (sorteos, roscos,
  // votación). Se hace al cerrarse la sala (a mano o a las 8 horas) y al crear una nueva.
  const resetEvent = () => {
    db.people = {};
    games.reset();
    db.stage = 'bingo';
  };
  Object.assign(ctx, { setStage, stageLocked, stageNames, stages, resetEvent });

  // Rutas: se registran al final (routes), cuando ya están todos los juegos
  return {
    routes() {
      const { app, requireAdmin } = ctx;
      // Leer la pantalla actual es público, para que la fuente de OBS no necesite iniciar sesión; cambiarla es del moderador.
      app.get('/api/stage', (_req, res) => res.json({ show: stageLocked(db.stage) || (stages().includes(db.stage) ? db.stage : 'bingo') }));
      app.post('/api/stage', requireAdmin, (req, res) => {
        const show = String((req.body || {}).show);
        if (!stages().includes(show)) return fail(res, 400, 'Opción no válida');
        if (setStage(show) === false) {
          const name = stageNames()[db.stage] || 'Un juego';
          return fail(res, 409, `${name} está en juego: la pantalla sigue en ${name} hasta que termine la partida`);
        }
        if (show === 'karaoke') ctx.karaoke.refresh(); // primera lectura inmediata, sin esperar al siguiente ciclo
        return res.json({ show });
      });
    },
  };
};
