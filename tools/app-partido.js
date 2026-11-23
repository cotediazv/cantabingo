// Parte public/app.js (un solo archivo de 170 KB) en partes por tema, y las vuelve a juntar.
//
//   node tools/app-partido.js partir   app.js → public/core/*.js y public/views/*.js (y el orden en index.html)
//   node tools/app-partido.js juntar   lo contrario: vuelve a armar public/app.js tal como era
//
// Para qué sirve: mientras la rama de la reescritura modular no esté publicada, en main se sigue editando app.js
// todos los días. Para traer esos cambios sin perder nada: juntar → unir main (git merge, app.js se une como
// siempre) → partir. Ver «Unir main mientras la rama no esté publicada» en CLAUDE.md.
// Cuando la rama ya esté en main, este archivo se borra: desde ahí se editan directo las partes.
//
// Las partes son trozos seguidos del archivo original, en el mismo orden, y index.html las carga en ese orden; así
// el navegador ejecuta exactamente el mismo código que antes (las variables de arriba de cada archivo se comparten
// entre archivos igual que antes dentro de uno solo). Lo único que cambia además del corte está en PATCHES.
const fs = require('fs');
const path = require('path');

const PUB = path.join(__dirname, '..', 'public');
const APP = path.join(PUB, 'app.js');
const HTML = path.join(PUB, 'index.html');
const HEAD = '//@ '; // primera línea de cada parte (se quita al juntar)

// Dónde empieza cada parte: la primera línea que calza después de la parte anterior (más los comentarios pegados
// justo encima). La primera parte empieza en la línea 1.
const PARTS = [
  { file: 'core/base.js', about: 'Base: $, esc, store, api, toast, aviso inmediato y GC PER', start: null },
  { file: 'core/dominio.js', about: 'Bingo en HTML (bolas, cartones, figuras), enlaces, QR y conexión en vivo', start: /^\/\/ ---------- Ayudas de dominio/ },
  { file: 'views/inicio.js', about: 'Vistas: ingreso del moderador, portada y Centro de control', start: /^\/\/ ---------- Vistas ----------/ },
  { file: 'views/sala.js', about: 'Vistas: proyectos, crear sala, Juegos, figura y panel del bingo', start: /^views\.proyectos = / },
  { file: 'views/celular.js', about: 'Vista: celular del público (#/jugar), con lo que muestra en cada juego', start: /^views\.jugar = / },
  { file: 'core/sonidos.js', about: 'Efectos de sonido (sin archivos de audio)', start: /^\/\/ ---------- Efectos de sonido/ },
  { file: 'views/tablero.js', about: 'Vista: tablero (pantalla del local), que sigue el escenario', start: /^views\.tablero = / },
  { file: 'views/karaoke.js', about: 'Karaoke: buscador de canciones y panel del animador', start: /^\/\/ ---------- Karaoke: buscador/ },
  { file: 'core/nav.js', about: 'Menú de juegos y actividades de los paneles (GAME_INFO, activitiesNav)', start: /^const GAME_INFO = / },
  { file: 'views/juego-sorteo.js', about: 'Vista: sorteo del próximo juego (tómbola) en tablero y GC', start: /^views\.juegoDraw = / },
  { file: 'views/escena.js', about: 'Vista: escena (GC de OBS), que sigue el escenario; QR para entrar y nombres que caben', start: /^function joinQr\(/ },
  { file: 'core/router.js', about: 'Enrutador: #/<vista>/<dato> → views[vista]', start: /^\/\/ ---------- Enrutador/ },
  { file: 'core/pantallas.js', about: 'Pantallas: logo y color del local, fondo de neuronas, aviso de KRB Kids, botón refrescar', start: /^const VENUE_LOGOS = / },
  { file: 'core/siguiente.js', about: 'El botón que sigue: siempre verde y en el mismo lugar', start: /^\/\/ ---------- El botón que sigue/ },
];

// Cambios además del corte (se aplican al partir y se deshacen al juntar). Tablero y escena dibujan lo que cada
// juego registró con KRB.escenario (public/core/escenarios.js) en vez de una cadena de «if» por juego.
const PATCHES = [
  {
    file: 'views/tablero.js',
    from: `        if (show === 'sorteo') stop = await views.sorteo();
        else if (show === 'rueda') stop = await views.rueda();
        else if (show === 'qr') stop = await views.qrFull();
        else if (show === 'karaoke') stop = await views.karaokeFull();
        else if (show === 'voto') stop = await views.votoFull();
        else if (show === 'juego') stop = await views.juegoDraw('full');
        else if (show === 'votojuego') stop = await views.gameVote('full'); // el QR va dentro del cuadro
        else if (show === 'insta') stop = await views.instaFull();
        else if (show === 'show') stop = await views.showFull();
        else if (show === 'desafio') stop = await views.desafioFull();
        else stop = await views.bingoFull(); // bingo, o la portada si no hay nada en juego
        joinQr({ sorteo: 'tr', rueda: 'tr', show: 'br' }[show]);`,
    to: `        // Lo que el juego registró para el tablero (KRB.escenario); el bingo, o la portada si no hay nada en juego
        const def = KRB.escenarios[show] && KRB.escenarios[show].full ? KRB.escenarios[show] : KRB.escenarios.bingo;
        stop = await def.full();
        joinQr(def.qrFull);`,
  },
  {
    file: 'views/escena.js',
    from: `        } else if (show === 'bingo') stop = await views.gc();
        else if (show === 'rueda') stop = await views.obs();
        else if (show === 'sorteo') stop = await views.sorteo();
        else if (show === 'qr') stop = await views.qrBig();
        else if (show === 'karaoke') stop = await views.karaokeGC();
        else if (show === 'voto') stop = await views.votoGC();
        else if (show === 'juego') stop = await views.juegoDraw('gc');
        else if (show === 'votojuego') stop = await views.gameVote('gc');
        else if (show === 'insta') stop = await views.instaGC();
        else if (show === 'show') stop = await views.showGC();
        else if (show === 'desafio') stop = await views.desafioGC();
        joinQr({ sorteo: 'br', rueda: 'bl', show: 'above', votojuego: 'br' }[show]);`,
    to: `        } else if (KRB.escenarios[show] && KRB.escenarios[show].gc) stop = await KRB.escenarios[show].gc(); // lo que el juego registró para el GC
        joinQr(KRB.escenarios[show] ? KRB.escenarios[show].qrGc : undefined);`,
  },
];

const TAG = (f) => `  <script src="${f}"></script>`;
const OPEN = '  <!-- app: partes en orden (tools/app-partido.js) -->';
const CLOSE = '  <!-- /app -->';

function once(text, a, b, where) {
  const n = text.split(a).length - 1;
  if (n !== 1) throw new Error(`${where}: el texto a reemplazar aparece ${n} veces (debe ser 1). Revisa PATCHES en tools/app-partido.js.\n`
    + 'Si en main se agregó un escenario a la cadena de «if» del tablero o de la escena: quita esa línea de public/app.js y registra la\n'
    + "pantalla en el ui.js del juego con KRB.escenario('<escenario>', { full, gc, qrFull, qrGc }); después vuelve a partir.\n"
    + `${a.slice(0, 200)}`);
  return text.replace(a, () => b);
}

function partir() {
  const lines = fs.readFileSync(APP, 'utf8').split('\n');
  const starts = [0];
  for (const p of PARTS.slice(1)) {
    let i = lines.findIndex((l, k) => k > starts[starts.length - 1] && p.start.test(l));
    if (i < 0) throw new Error(`No se encontró dónde empieza ${p.file} (${p.start})`);
    while (i > 0 && /^\/\/ /.test(lines[i - 1]) && !/^\/\/ ----------/.test(lines[i - 1])) i--; // sus comentarios
    starts.push(i);
  }
  const out = {};
  PARTS.forEach((p, k) => {
    const chunk = lines.slice(starts[k], k + 1 < PARTS.length ? starts[k + 1] : lines.length).join('\n');
    out[p.file] = `${HEAD}${p.about}. Parte de la aplicación: se carga en orden desde index.html.\n${chunk}${k + 1 < PARTS.length ? '\n' : ''}`;
  });
  for (const x of PATCHES) out[x.file] = once(out[x.file], x.from, x.to, x.file);
  for (const [f, text] of Object.entries(out)) { fs.mkdirSync(path.dirname(path.join(PUB, f)), { recursive: true }); fs.writeFileSync(path.join(PUB, f), text); }
  fs.unlinkSync(APP);
  const html = fs.readFileSync(HTML, 'utf8');
  fs.writeFileSync(HTML, once(html, TAG('app.js'), [OPEN, ...PARTS.map((p) => TAG(p.file)), CLOSE].join('\n'), 'index.html'));
  console.log(`app.js partido en ${PARTS.length} partes`);
}

function juntar() {
  const parts = PARTS.map((p) => {
    let text = fs.readFileSync(path.join(PUB, p.file), 'utf8');
    for (const x of PATCHES.filter((y) => y.file === p.file)) text = once(text, x.to, x.from, p.file);
    if (!text.startsWith(HEAD)) throw new Error(`${p.file} no empieza con «${HEAD}»`);
    return text.slice(text.indexOf('\n') + 1);
  });
  fs.writeFileSync(APP, parts.join(''));
  for (const p of PARTS) fs.unlinkSync(path.join(PUB, p.file));
  const html = fs.readFileSync(HTML, 'utf8');
  const a = html.indexOf(OPEN); const b = html.indexOf(CLOSE);
  if (a < 0 || b < 0) throw new Error('index.html no tiene la lista de partes');
  fs.writeFileSync(HTML, html.slice(0, a) + TAG('app.js') + html.slice(b + CLOSE.length));
  console.log('app.js armado de nuevo');
}

const cmd = process.argv[2];
if (cmd === 'partir') partir();
else if (cmd === 'juntar') juntar();
else { console.error('Uso: node tools/app-partido.js partir|juntar'); process.exit(1); }
