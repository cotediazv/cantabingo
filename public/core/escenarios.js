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

// Juegos y actividades de los paneles del animador: ícono, nombre, panel y en qué menú aparecen.
//
//   KRB.juego({ id: 'rosco', icon: '🎡', name: 'El Rosko', href: '#/sorteoctl',
//     menu: 'juego',        // 'juego': se puede elegir como el que sigue (manual, sorteo, votación); 'otros': otras
//                           // actividades del menú; sin menu: solo se usa su ícono, nombre y panel
//     orden: 2,             // lugar en su menú
//     label: '…',           // texto del botón, si no es el nombre (opcional)
//     boton: 'data-x',      // en vez de enlace, un botón con ese atributo (opcional)
//   });
//
// name puede ser una función del local: (venue) => `El Festival de ${…}`.
KRB.juegos = Object.create(null);
KRB.juego = function juego(def) { KRB.juegos[def.id] = def; };
KRB.nameOf = function nameOf(j, venue) { return typeof j.name === 'function' ? j.name(venue) : j.name; };
// { id: { icon, name, href } } con los nombres de ese local
KRB.gameInfo = function gameInfo(venue) {
  var out = {};
  Object.keys(KRB.juegos).forEach(function (id) { var j = KRB.juegos[id]; out[id] = { icon: j.icon, name: KRB.nameOf(j, venue), href: j.href || '' }; });
  return out;
};
// Los de un menú, en orden, con el texto de su botón
KRB.menu = function menu(which) {
  return Object.keys(KRB.juegos).map(function (id) { return KRB.juegos[id]; }).filter(function (j) { return j.menu === which; })
    .sort(function (a, b) { return (a.orden || 99) - (b.orden || 99); })
    .map(function (j) { return { id: j.id, icon: j.icon, href: j.href || '', boton: j.boton || '', label: j.label || KRB.nameOf(j, '') }; });
};

// Cajas de los juegos en el celular (views.jugar): una por escenario que declara `celular`
KRB.cajasCelular = function cajasCelular() {
  return Object.keys(KRB.escenarios).filter(function (k) { return KRB.escenarios[k].celular; })
    .map(function (k) { var c = KRB.escenarios[k].celular; return '<div class="' + c.cls + '" id="' + c.id + '" hidden></div>'; }).join('\n    ');
};

// Sorteo del próximo juego (views/juego-sorteo.js)
KRB.escenario('juego', { full: () => views.juegoDraw('full'), gc: () => views.juegoDraw('gc') });
