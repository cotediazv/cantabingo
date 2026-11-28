// GC Show (Apps Script de cada local, apps-script/GCShow-*.gs): lectura de los horarios de la GLOSA (mejora del 28 nov,
// pedido de Code 0, cuando Frida y Tobalaba dejaron de mostrar horarios sin ningún aviso). Se prueba el mismo código que se
// pega en Google, con una hoja simulada: título «DIA» corrido, fila vacía entremedio, día escrito solo en la primera fila,
// sin horarios (aviso) y el formato de siempre de Kennedy, que no debe cambiar.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LOCALES = { Kennedy: 2, Frida: 41, Tobalaba: 31 }; // columna de los horarios (B, AO, AE)

// Hoja simulada: celdas por [fila, columna]; getRange(fila, col, filas, cols).getDisplayValues() como en Google
const hoja = (celdas, nombre = 'NOVIEMBRE26 MASTER TOTAL') => ({
  getName: () => nombre,
  getRange: (r, c, nr, nc) => ({ getDisplayValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (__, j) => (celdas[`${r + i},${c + j}`] || ''))) }),
});
// Escribe filas [día, hora, actividad] desde una fila, en la columna del local
const escribir = (col, desde, filas) => {
  const celdas = {};
  filas.forEach((f, i) => f.forEach((v, j) => { if (v) celdas[`${desde + i},${col + j}`] = v; }));
  return celdas;
};
const cargar = (local) => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(path.join(__dirname, '..', 'apps-script', `GCShow-${local}.gs`), 'utf8')}\nthis.leer = leerHorarios_;`, ctx);
  return ctx.leer;
};
const KENNEDY = [['DIA', 'HORA', 'ACTIVIDAD'], ['JUEVES', '19:00', 'MÚSICA Y VIDEOS'], ['JUEVES', '20:00', 'PREVIA'], ['VIERNES', '19:00', 'MÚSICA Y VIDEOS'], ['SÁBADO', '21:00', 'SHOW']];
const plano = (h) => JSON.parse(JSON.stringify(h));

for (const [local, col] of Object.entries(LOCALES)) {
  const leer = cargar(local);
  test(`GC Show ${local}: formato de siempre (títulos en la 857, un día por fila) da lo mismo que antes`, () => {
    const h = plano(leer(hoja(escribir(col, 857, KENNEDY))));
    assert.equal(h.aviso, '');
    assert.deepEqual(h.lista, [
      { dia: 'JUEVES', hora: '19:00', actividad: 'MÚSICA Y VIDEOS' }, { dia: 'JUEVES', hora: '20:00', actividad: 'PREVIA' },
      { dia: 'VIERNES', hora: '19:00', actividad: 'MÚSICA Y VIDEOS' }, { dia: 'SÁBADO', hora: '21:00', actividad: 'SHOW' }]);
  });
  test(`GC Show ${local}: título corrido de fila, fila vacía entremedio y día solo en la primera fila`, () => {
    const filas = [['Día', 'Hora', 'Actividad'], [''], ['VIERNES', '18:30', 'MÚSICA'], ['', '19:00', 'PREVIA'], [''], ['', '20:15', 'SHOW'], ['SABADO', '21:15', 'KARAOKE']];
    const h = plano(leer(hoja(escribir(col, 855, filas))));
    assert.equal(h.aviso, '');
    assert.deepEqual(h.lista.map((x) => `${x.dia} ${x.hora} ${x.actividad}`), ['VIERNES 18:30 MÚSICA', 'VIERNES 19:00 PREVIA', 'VIERNES 20:15 SHOW', 'SABADO 21:15 KARAOKE']);
  });
  test(`GC Show ${local}: corta después de 3 filas vacías seguidas`, () => {
    const filas = [['DIA', 'HORA', 'ACTIVIDAD'], ['VIERNES', '19:00', 'PREVIA'], [''], [''], [''], ['VIERNES', '23:00', 'NO DEBE LEERSE']];
    assert.deepEqual(plano(leer(hoja(escribir(col, 857, filas)))).lista.map((x) => x.hora), ['19:00']);
  });
  test(`GC Show ${local}: sin título o sin horarios, devuelve un aviso claro`, () => {
    let h = leer(hoja({}));
    assert.equal(h.lista.length, 0);
    assert.match(h.aviso, /No encontré el título DIA entre las filas 850 y 870/);
    assert.match(h.aviso, new RegExp(`columna ${{ 2: 'B', 41: 'AO', 31: 'AE' }[col]} de la pestaña NOVIEMBRE26`));
    h = leer(hoja(escribir(col, 857, [['DIA', 'HORA', 'ACTIVIDAD']])));
    assert.equal(h.lista.length, 0);
    assert.match(h.aviso, /No hay horarios debajo del título DIA \(fila 857/);
  });
}

test('los tres GC Show leen los horarios con el mismo código (solo cambia la columna)', () => {
  const cuerpo = (local) => fs.readFileSync(path.join(__dirname, '..', 'apps-script', `GCShow-${local}.gs`), 'utf8')
    .split('// Horarios de una pestaña')[1].split('// Para probar')[0];
  assert.equal(cuerpo('Frida'), cuerpo('Kennedy'));
  assert.equal(cuerpo('Tobalaba'), cuerpo('Kennedy'));
});
