// Semáforo del Dell de las luces de Kennedy (orden 13 de Code 0, 28 nov; contrato de Code 4): el Dell manda su latido con
// la clave de las luces, el moderador y el equipo de Kennedy ven los colores (panel de la sala light de Kennedy) y, en horario de Kennedy, la Sala avisa por ntfy si el Dell deja de
// responder o algo pasa a rojo (una vez por cosa y por noche). El tema de los avisos nunca se muestra.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer, sleep } = require('../helpers');

const srvs = []; const mocks = [];
after(async () => { for (const s of srvs) await s.stop(); for (const m of mocks) m.close(); });
const CLAVE = 'clave-luces-de-prueba';
const bien = () => ({
  t: Date.now(), version: '2.4', enHorario: true, obsHorario: true, avisoTema: 'tema-secreto-123',
  cable: { ok: true, puerto: 'COM3', error: '', envios: 900, fallas: 0 },
  obs: { estado: 'ok', transmitiendo: true, cuadrosPerdidos: 3, cuadrosTotal: 1000, congestion: 0.1, kbps: 4500 },
  ritmo: { estacion: true, musica: true, bpm: 120 }, tunel: true, momento: 'bingo_numero',
  windows: { cpu: 30, ram: 60, discoGB: 80, arranque: 'x', adaptador: { visto: true, nombre: 'Enttec', estado: 'OK', error: 0, controlador: 'WinUSB' }, reinicioPendiente: false, pausaHasta: null, ultimoReinicio: { hora: 'ayer', programa: '', motivo: '', tipo: '', usuario: '', inesperados7d: 1 } },
});

test('Dell: latido con la clave, colores y avisos por ntfy en horario', async () => {
  const got = [];
  const mock = http.createServer((q, s) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => { got.push({ url: q.url, body: b }); s.end('{}'); }); });
  await new Promise((r) => mock.listen(0, r)); mocks.push(mock);
  // jueves 3 dic, 20:00 en Chile: horario de Kennedy
  const srv = await startServer({ env: { LUCES_CLAVE: CLAVE, NTFY_URL: `http://localhost:${mock.address().port}`, KRB_FECHA: '2026-12-03T20:00:00-03:00', DELL_SIN_MS: '2500', DELL_REVISA_MS: '300' } });
  srvs.push(srv);
  const latido = (b, k = CLAVE) => fetch(`${srv.url}/api/luces/latido`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify(b) });
  assert.equal((await latido(bien(), 'otra-clave-de-prueba')).status, 401);
  assert.equal((await srv.call('GET', '/api/luces/salud')).status, 401); // solo el moderador y el equipo de Kennedy
  await srv.admin.post('/api/staff/clave', { local: 'kennedy', clave: 'equipo-k' });
  await srv.admin.post('/api/staff/clave', { local: 'frida', clave: 'equipo-f' });
  const sk = (await srv.ok('POST', '/api/staff/login', { local: 'kennedy', clave: 'equipo-k' })).token;
  const sf = (await srv.ok('POST', '/api/staff/login', { local: 'frida', clave: 'equipo-f' })).token;
  assert.equal((await srv.call('GET', '/api/luces/salud', undefined, { staff: sk })).status, 200);
  assert.equal((await srv.call('GET', '/api/luces/salud?local=frida', undefined, { staff: sf })).status, 401);
  let s = await srv.admin.get('/api/luces/salud');
  assert.equal(s.recibido, 0); assert.equal(s.luces.latido, 'gris');
  // todo bien: verde
  assert.equal((await latido(bien())).status, 200);
  s = await srv.admin.get('/api/luces/salud');
  assert.deepEqual(Object.values(s.luces), Array(10).fill('verde'));
  assert.equal(JSON.stringify(s).includes('tema-secreto-123'), false); // el tema nunca se muestra
  assert.equal(s.horario, true); assert.equal(s.avisos, true);
  // varias cosas mal
  const mal = bien();
  mal.cable.ok = false; mal.cable.error = 'puerto cerrado';
  mal.windows.adaptador.controlador = 'libusb';
  mal.obs.cuadrosPerdidos = 30; // 3 %
  mal.tunel = null; mal.ritmo.estacion = false;
  Object.assign(mal.windows, { ram: 95, discoGB: 15, cpu: 85, reinicioPendiente: true });
  await latido(mal);
  s = await srv.admin.get('/api/luces/salud');
  assert.deepEqual(s.luces, { latido: 'verde', cable: 'rojo', adaptador: 'rojo', obs: 'amarillo', tunel: 'gris', ritmo: 'amarillo', memoria: 'rojo', disco: 'amarillo', cpu: 'amarillo', windows: 'amarillo' });
  // un reinicio inesperado nuevo esa noche: Windows en rojo
  mal.windows.ultimoReinicio.inesperados7d = 2;
  await latido(mal); await latido(mal);
  s = await srv.admin.get('/api/luces/salud');
  assert.equal(s.luces.windows, 'rojo');
  assert.equal(s.luces.obs, 'amarillo');
  await sleep(300);
  // un aviso por cosa en rojo, una sola vez (aunque lleguen más latidos)
  const rojos = got.map((g) => g.body).filter((b) => /en rojo/.test(b));
  assert.equal(rojos.length, 4, rojos.join(' | '));
  assert.ok(rojos.some((b) => /Cable de las luces en rojo/.test(b)));
  assert.ok(got.every((g) => g.url === '/tema-secreto-123'));
  // sin latido: «no responde» una vez, y «volvió» cuando vuelve
  await sleep(3200);
  s = await srv.admin.get('/api/luces/salud');
  assert.equal(s.luces.latido, 'rojo');
  assert.equal(got.filter((g) => /no responde hace 2 min/.test(g.body)).length, 1);
  await latido(bien());
  await sleep(200);
  assert.equal(got.filter((g) => /volvió a responder/.test(g.body)).length, 1);
});

test('Dell: fuera de horario no se manda ningún aviso', async () => {
  const got = [];
  const mock = http.createServer((q, s) => { got.push(q.url); s.end('{}'); });
  await new Promise((r) => mock.listen(0, r)); mocks.push(mock);
  // miércoles 2 dic, 20:00: no es horario de Kennedy
  const srv = await startServer({ env: { LUCES_CLAVE: CLAVE, NTFY_URL: `http://localhost:${mock.address().port}`, KRB_FECHA: '2026-12-02T20:00:00-03:00', DELL_SIN_MS: '1000', DELL_REVISA_MS: '200' } });
  srvs.push(srv);
  const b = bien(); b.cable.ok = false;
  await fetch(`${srv.url}/api/luces/latido`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${CLAVE}` }, body: JSON.stringify(b) });
  await sleep(1800);
  const s = await srv.admin.get('/api/luces/salud');
  assert.equal(s.luces.cable, 'rojo'); assert.equal(s.luces.latido, 'rojo'); assert.equal(s.horario, false);
  assert.equal(got.length, 0);
});
