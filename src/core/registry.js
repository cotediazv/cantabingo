// Registro de juegos: cada juego (src/games/<id>/index.js) declara quién es y qué le aporta al resto del sistema.
// Así el núcleo no tiene que nombrar a cada juego: el escenario, los avisos a los celulares, la limpieza de la
// jornada y la prioridad en pantalla se arman recorriendo esta lista.
//
// Contrato de un juego:
//   module.exports = {
//     id: 'desafio',                 // nombre interno
//     name: 'El Gran Desafío',       // como se ve en la consola
//     stage: 'desafio',              // escenario que muestra el juego en tablero, OBS y celular (o null)
//     register(ctx) { ...; return {  // rutas del juego; devuelve lo que ofrece (todo opcional):
//       phoneFields() {},            //   campos que van a los celulares en cada aviso (ej. { desafioRev })
//       onReset() {},                //   al cerrar o crear la sala: deja el juego en blanco
//       sweep(before) {},            //   limpieza periódica de lo creado antes de esa fecha; true si borró algo
//       inPlay() {},                 //   true si el juego está en curso y debe quedarse en pantalla (prioridad)
//       refresh() {},                //   volver a enviar su estado a las pantallas (ej. tras corregir un nombre)
//       elegibles: [{ id, icon, name }],  //   lo que se puede elegir como «el juego que sigue» (manual, sorteo y votación),
//                                    //   en este orden; name puede ser una función del local (ej. «El Festival de Frida»)
//       current(sala) {},            //   con su escenario en pantalla: { game, … } si el juego sigue en curso, o null
//       done() {},                   //   con su escenario en pantalla: true si el juego ya terminó (celulares sin instrucciones)
//       ...                          //   otras funciones que usan otros módulos (ctx.games.get(id))
//     }; },
//   };
module.exports = function registry() {
  const list = []; // { meta, api }
  const each = (fn) => list.map(({ meta, api }) => fn(api, meta));
  return {
    register(meta, ctx) {
      const api = meta.register(ctx) || {};
      list.push({ meta, api });
      return api;
    },
    get: (id) => (list.find((g) => g.meta.id === id) || {}).api || null,
    stages: () => list.filter((g) => g.meta.stage).map((g) => g.meta.stage),
    names: () => Object.fromEntries(list.filter((g) => g.meta.stage && g.meta.name).map((g) => [g.meta.stage, g.meta.name])),
    phoneFields: () => Object.assign({}, ...each((api) => (api.phoneFields ? api.phoneFields() : {}))),
    reset: () => { each((api) => api.onReset && api.onReset()); },
    sweep: (before) => each((api) => (api.sweep ? api.sweep(before) : 0)).some(Boolean),
    refresh: () => { each((api) => api.refresh && api.refresh()); },
    // Lo que se puede elegir como juego que sigue, en el orden en que se registraron (el bingo, primero)
    elegibles: () => list.flatMap(({ api }) => api.elegibles || []),
    // Juego en curso según el escenario en pantalla (para «volver al juego» del panel)
    current(stage, sala) {
      const g = list.find(({ meta, api }) => meta.stage === stage && api.current);
      return g ? g.api.current(sala) : null;
    },
    // El juego en pantalla ya terminó
    done(stage) {
      const g = list.find(({ meta, api }) => meta.stage === stage && api.done);
      return g ? !!g.api.done() : false;
    },
    // Escenario de un juego en curso que no debe dejar la pantalla (si se pide otro escenario)
    lockedStage(show) {
      const g = list.find(({ meta, api }) => meta.stage && meta.stage !== show && api.inPlay && api.inPlay());
      return g ? g.meta.stage : null;
    },
  };
};
