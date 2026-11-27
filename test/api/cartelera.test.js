// Cartelera de la semana con el cambio de mes (pedido de Cote, 27 nov: «la cartelera de la semana de Kennedy no está
// cargando la información del jueves 3 de diciembre»). El GC Show de cada local manda la pestaña del mes y, en `meses`,
// también la del mes siguiente: la semana muestra los shows de los dos meses.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer } = require('../helpers');

let resp = {};
const mock = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(resp)); });
const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); mock.close(); });
const NOV = { pestana: 'NOVIEMBRE26 MASTER TOTAL', cartelera: [{ dia: 'VIERNES 27', show: 'PIANO MAN' }, { dia: 'SABADO 28', show: 'BON JOVI' }] };
const DIC = { pestana: 'DICIEMBRE26 MASTER TOTAL', cartelera: [{ dia: 'JUEVES 3', show: 'QUEEN TRIBUTO' }] };
const horarios = [{ dia: 'JUEVES', hora: '21:45', actividad: 'Karaoke' }, { dia: 'VIERNES', hora: '20:00', actividad: 'Show' }, { dia: 'SABADO', hora: '20:00', actividad: 'Show' }];

test('cartelera de la semana: el jueves 3 de diciembre sale con su show si llega la pestaña del mes siguiente', async () => {
  await new Promise((r) => mock.listen(0, r));
  const srv = await startServer({ env: { GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-27T15:00:00-03:00' } });
  srvs.push(srv);
  // Sin `meses` (como hoy): el jueves 3 sale sin show
  resp = { ...NOV, horarios };
  let c = await srv.ok('GET', '/api/light/cartelera?local=kennedy');
  const jue = (w) => w.week.find((d) => d.date === 3 && d.month === 12);
  assert.equal(c.week[0].date, 27); assert.equal(c.week[0].show, 'PIANO MAN');
  assert.equal(jue(c).show, '');
  // Con `meses` (noviembre y diciembre), sale
  resp = { ...NOV, horarios, meses: [NOV, DIC] };
  const srv2 = await startServer({ env: { GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-27T15:00:00-03:00' } });
  srvs.push(srv2);
  c = await srv2.ok('GET', '/api/light/cartelera?local=kennedy');
  assert.equal(jue(c).show, 'QUEEN TRIBUTO');
  assert.equal(c.week[0].show, 'PIANO MAN');
  assert.deepEqual(c.month.map((m) => m.show), ['PIANO MAN', 'BON JOVI']);
});
