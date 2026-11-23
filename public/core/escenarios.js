// Escenarios: qué dibuja cada juego en el tablero (pantalla del local, #/tablero) y en la escena (GC de OBS, #/escena)
// cuando el escenario de la sala (db.stage) es el suyo. Cada juego se registra en su propio archivo:
//
//   KRB.escenario('desafio', {
//     full: () => views.desafioFull(),   // tablero (si falta, el tablero muestra el bingo)
//     gc: () => views.desafioGC(),       // GC de OBS (si falta, el GC queda vacío)
//     qrFull: 'tr', qrGc: 'br',          // esquina del QR para entrar, si la gráfica no trae el suyo (tr, br, bl, above)
//   });
//
// Así, para agregar un juego no hay que tocar el tablero ni la escena.
window.KRB = window.KRB || {};
KRB.escenarios = Object.create(null);
KRB.escenario = function escenario(stage, def) { KRB.escenarios[stage] = def; };

// Sorteo del próximo juego (views/juego-sorteo.js)
KRB.escenario('juego', { full: () => views.juegoDraw('full'), gc: () => views.juegoDraw('gc') });
