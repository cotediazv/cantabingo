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
  // hoy y los próximos 6 días con actividades (jue, vie y sáb): 27, 28, 3, 4, 5, 10 y 11 (Cote, 27 nov)
  assert.deepEqual(c.week.map((d) => d.date), [27, 28, 3, 4, 5, 10, 11]);
  assert.equal(jue(c).show, '');
  // Con `meses` (noviembre y diciembre), sale
  resp = { ...NOV, horarios, meses: [NOV, DIC] };
  const srv2 = await startServer({ env: { GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-27T15:00:00-03:00' } });
  srvs.push(srv2);
  c = await srv2.ok('GET', '/api/light/cartelera?local=kennedy');
  assert.equal(jue(c).show, 'QUEEN TRIBUTO');
  assert.deepEqual(jue(c).hours.map((h) => h.label), ['Karaoke']); // sin horarios propios de diciembre: los de noviembre
  // Con los horarios de diciembre en su pestaña, el jueves 3 usa los suyos (hoy y los próximos 6 días, Cote 27 nov)
  resp = { ...NOV, horarios, meses: [{ ...NOV, horarios }, { ...DIC, horarios: [{ dia: 'JUEVES', hora: '20:00', actividad: 'Show navideño' }] }] };
  const srv3 = await startServer({ env: { GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-27T15:00:00-03:00' } });
  srvs.push(srv3);
  c = await srv3.ok('GET', '/api/light/cartelera?local=kennedy');
  assert.deepEqual(jue(c).hours.map((h) => h.label), ['Show navideño']);
  assert.deepEqual(c.week[0].hours.map((h) => h.label), ['Show']);
  assert.equal(c.week[0].show, 'PIANO MAN');
  assert.deepEqual(c.month.map((m) => m.show), ['PIANO MAN', 'BON JOVI']);
});

// Cote, 27 nov: entre paréntesis va a quién se le transfiere (no se muestra); entre comillas, quien hace el tributo
test('nombre del show: sin lo de los paréntesis y con el artista de las comillas', async () => {
  resp = { pestana: 'NOVIEMBRE26 MASTER TOTAL', horarios, cartelera: [
    { dia: 'VIERNES 27', show: 'PIANO MAN (X PROJECTS)' },
    { dia: 'SABADO 28', show: 'GEORGE MICHAEL "RAFA DAMIÁN" (RAFAEL PÉREZ)' },
    { dia: 'DOMINGO 29', show: 'ESPECIAL MÉXICO “LOS CHARROS”' },
    { dia: 'LUNES 30', show: 'ESPECIAL BALADA ITALIANA MATIAS FAJARDO "MATIAS FAJARDO"' },
  ] };
  const srv = await startServer({ env: { GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-27T15:00:00-03:00' } });
  srvs.push(srv);
  const c = await srv.ok('GET', '/api/light/cartelera?local=kennedy');
  assert.equal(c.show, 'PIANO MAN');
  assert.deepEqual(c.month.map((m) => m.show), ['PIANO MAN', 'GEORGE MICHAEL (RAFA DAMIÁN)', 'ESPECIAL MÉXICO (LOS CHARROS)', 'ESPECIAL BALADA ITALIANA (MATIAS FAJARDO)']);
  assert.equal(c.week[1].show, 'GEORGE MICHAEL (RAFA DAMIÁN)');
});
