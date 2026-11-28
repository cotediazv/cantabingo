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

// Cote, 27 nov: «Si sale, hay que decirlo»: si el show es un tributo o un doble, la cartelera dice «Tributo a…» o
// «Doble de…». La GLOSA guarda solo el nombre; el tipo lo sabe Programación.
test('cartelera: «Tributo a» y «Doble de» desde Programación', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'prog-')), 'programacion.json');
  fs.writeFileSync(file, JSON.stringify({ dias: {
    '2026-11-28': { MK: { show: { tipo: 'tributo', nombre: 'Bon Jovi' } } },
    '2026-12-03': { MK: { show: { tipo: 'otro', nombre: 'BINGO + DOBLE DE GEORGE MICHAEL' } } },
    '2026-12-04': { MK: { show: { tipo: 'tributo', nombre: 'Queen' } } }, // la GLOSA dice otro show: no se toca
    '2026-12-05': { MK: { show: { tipo: 'tributo', nombre: 'INXS', banda: true } } },
    '2026-11-27': { FRIDA: { show: { tipo: 'doble', nombre: 'Luis Miguel' } } },
  } }));
  const DIC2 = { pestana: 'DICIEMBRE26 MASTER TOTAL', cartelera: [{ dia: 'JUEVES 3', show: 'BINGO + DOBLE DE GEORGE MICHAEL' }, { dia: 'VIERNES 4', show: 'PIANO MAN' }, { dia: 'SABADO 5', show: 'INXS (X)' }] };
  const NOV2 = { pestana: 'NOVIEMBRE26 MASTER TOTAL', cartelera: [{ dia: 'VIERNES 27', show: 'LUIS MIGUEL "PEDRO" (P)' }, { dia: 'SABADO 28', show: 'BON JOVI (JUAN)' }] };
  resp = { ...NOV2, horarios, meses: [NOV2, DIC2] };
  const srv = await startServer({ env: { PROG_FILE: file, GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-27T15:00:00-03:00' } });
  srvs.push(srv);
  const k = await srv.ok('GET', '/api/light/cartelera?local=kennedy');
  const de = (c, d) => c.week.find((x) => x.date === d).show;
  assert.equal(de(k, 28), 'TRIBUTO A BON JOVI');
  assert.equal(de(k, 3), 'NOCHE DE JUEGOS + DOBLE DE GEORGE MICHAEL'); // ya lo dice: no se repite; «BINGO» se muestra como «Noche de juegos» (Cote, 28 nov)
  assert.equal(de(k, 4), 'PIANO MAN');
  assert.equal(de(k, 5), 'BANDA TRIBUTO A INXS');
  assert.deepEqual(k.month.map((m) => m.show), ['LUIS MIGUEL (PEDRO)', 'TRIBUTO A BON JOVI']); // el 27 es de Frida, no de Kennedy
  const f = await srv.ok('GET', '/api/light/cartelera?local=frida');
  assert.equal(f.show, 'DOBLE DE LUIS MIGUEL (PEDRO)');
});

// Horas del mes anterior (orden 9 de Code 0, pedido de Cote, 28 nov: Frida y Tobalaba quedaron sin horarios en la GLOSA;
// «Usar las mismas horas del mes anterior»): si el GC Show entrega los horarios totalmente vacíos, la Sala usa los de la
// cartelera pegada de ese local (sin el «Cierre»); el panel lo sabe; apenas la GLOSA trae horarios, mandan esos.
test('sin horarios en la GLOSA: se usan las horas del mes anterior y vuelven las de la GLOSA apenas llegan', async () => {
  if (!mock.listening) await new Promise((r) => mock.listen(0, r));
  const VACIO = { pestana: 'NOVIEMBRE26 MASTER TOTAL', cartelera: [{ dia: 'SABADO 28', show: 'DOBLE DE RICKY MARTIN' }, { dia: 'DOMINGO 29', show: 'LOS JUEGOS DE FRIDA' }], horarios: [] };
  resp = { ...VACIO, meses: [VACIO, { pestana: 'DICIEMBRE26 MASTER TOTAL', cartelera: [{ dia: 'VIERNES 4', show: 'DOBLE DE KAROL G' }], horarios: [] }] };
  // sábado 28 a las 20:10: en la cartelera de noviembre de Frida, 19:00 Música, 19:30 Previa, 21:00 Dobles, 22:00 Karaoke y Fiesta
  const srv = await startServer({ env: { GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-28T20:10:00-03:00' } });
  srvs.push(srv);
  let c = await srv.ok('GET', '/api/light/cartelera?local=frida');
  assert.deepEqual(c.blocks.map((b) => `${b.time} ${b.label}`), ['19:00 MÚSICA', '19:30 PREVIA EN VIVO + KARAOKE', '21:00 DOBLES', '22:00 KARAOKE Y FIESTA']);
  assert.equal(c.current.label, 'PREVIA EN VIVO + KARAOKE');
  assert.equal(c.next.time, '21:00');
  assert.equal(c.horasRespaldo, true);
  assert.ok(!c.blocks.some((b) => /CIERRE/.test(b.label))); // el cierre no se muestra al público
  assert.deepEqual(c.week.find((d) => d.date === 29).hours.map((h) => h.time), ['13:30', '14:00']); // domingo
  assert.deepEqual(c.week.find((d) => d.date === 4 && d.month === 12).hours.map((h) => h.time), ['19:00', '19:30', '21:00', '22:00']);
  assert.equal((await srv.ok('GET', '/api/light?local=frida')).horasRespaldo, true); // el panel del local lo avisa
  // Tobalaba (viernes): las suyas
  c = await srv.ok('GET', '/api/light/cartelera?local=tobalaba');
  assert.deepEqual(c.week.find((d) => d.date === 4 && d.month === 12).hours.map((h) => `${h.time} ${h.label}`), ['18:30 MÚSICA', '19:00 PREVIA', '19:30 NOCHE DE JUEGOS', '20:15 SHOW', '21:15 KARAOKE']);
  // «Noche de juegos» / «Tarde de juegos» (pedido de Cote, 28 nov, por Code 0): el domingo de Frida, el bingo del respaldo y
  // el show «LOS JUEGOS DE FRIDA» de la GLOSA se muestran como TARDE DE JUEGOS
  c = await srv.ok('GET', '/api/light/cartelera?local=frida');
  const dom = c.week.find((d) => d.date === 29);
  assert.deepEqual(dom.hours.map((h) => `${h.time} ${h.label}`), ['13:30 MÚSICA', '14:00 TARDE DE JUEGOS']);
  assert.equal(dom.show, 'TARDE DE JUEGOS');
  assert.deepEqual(c.month.map((m) => m.show), ['DOBLE DE RICKY MARTIN', 'TARDE DE JUEGOS']);
  // La GLOSA vuelve a traer horarios: mandan esos (otro servidor, porque la GLOSA se relee cada 10 minutos)
  resp = { ...VACIO, horarios: [{ dia: 'SABADO', hora: '20:00', actividad: 'PREVIA' }] };
  const srv2 = await startServer({ env: { GLOSA_TEST_URL: `http://localhost:${mock.address().port}/glosa`, KRB_FECHA: '2026-11-28T20:10:00-03:00' } });
  srvs.push(srv2);
  c = await srv2.ok('GET', '/api/light/cartelera?local=frida');
  assert.deepEqual(c.blocks.map((b) => `${b.time} ${b.label}`), ['20:00 PREVIA']);
  assert.equal(c.horasRespaldo, false);
  assert.equal((await srv2.ok('GET', '/api/light?local=frida')).horasRespaldo, false);
});
