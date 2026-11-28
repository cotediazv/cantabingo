// Respaldo diario de los datos (Code 0, 28 nov): copia comprimida en el disco (14 días), tope de espacio libre, bajar una
// copia desde el Centro de control y, solo si se configura, copia al Drive de Cote. Solo el moderador.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const http = require('http');
const { startServer, sleep } = require('../helpers');

const srvs = []; const mocks = [];
after(async () => { for (const s of srvs) await s.stop(); for (const m of mocks) m.close(); });
const abrir = (buf) => JSON.parse(zlib.gunzipSync(buf).toString('utf8'));

test('respaldo: a pedido, en el disco, con los archivos de los datos, y se quedan 14 días', async () => {
  const srv = await startServer();
  srvs.push(srv);
  await srv.openRoom();
  await sleep(300);
  assert.equal((await srv.call('POST', '/api/respaldo/ahora', {})).status, 401);
  assert.equal((await srv.call('GET', '/api/respaldo')).status, 401);
  assert.equal((await srv.call('GET', '/api/respaldo/bajar')).status, 401);
  const folder = path.join(path.dirname(srv.dataFile), 'respaldos');
  // 15 copias viejas: al respaldar quedan solo las últimas 14 (contando la nueva)
  fs.mkdirSync(folder, { recursive: true });
  for (let d = 1; d <= 15; d++) fs.writeFileSync(path.join(folder, `respaldo-2026-10-${String(d).padStart(2, '0')}.json.gz`), 'x');
  const r = await srv.admin.post('/api/respaldo/ahora', {});
  assert.equal(r.ok, true, r.error);
  assert.ok(r.size > 100);
  const names = fs.readdirSync(folder).sort();
  assert.equal(names.length, 14);
  assert.equal(names[0], 'respaldo-2026-10-03.json.gz');
  const nuevo = names[names.length - 1];
  const b = abrir(fs.readFileSync(path.join(folder, nuevo)));
  assert.equal(b.sala, 'cantabingo');
  assert.ok(JSON.parse(b.archivos['data.json']).sessions); // los datos de la sala, enteros
  const st = await srv.admin.get('/api/respaldo');
  assert.equal(st.ok, true); assert.equal(st.copias.length, 14); assert.equal(st.drive, false);
  // bajar una copia (se arma en el momento)
  const res = await fetch(`${srv.url}/api/respaldo/bajar`, { headers: { 'x-admin': srv.adminToken() } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /respaldo-sala-\d{4}-\d{2}-\d{2}-\d{4}\.json\.gz/);
  assert.ok(abrir(Buffer.from(await res.arrayBuffer())).archivos['data.json']);
});

test('respaldo: si el disco queda con poco espacio libre, no respalda y avisa', async () => {
  const srv = await startServer({ env: { RESPALDO_MIN_LIBRE_MB: '100000000' } });
  srvs.push(srv);
  const r = await srv.admin.post('/api/respaldo/ahora', {});
  assert.equal(r.ok, false);
  assert.match(r.error, /Poco espacio/);
  assert.equal(fs.existsSync(path.join(path.dirname(srv.dataFile), 'respaldos')), false);
});

test('respaldo: automático a las 05:00 (hora de Chile) y copia al Drive solo si está configurado', async () => {
  const got = [];
  const mock = http.createServer((q, s) => { let b = ''; q.on('data', (c) => { b += c; }); q.on('end', () => { got.push(JSON.parse(b)); s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"ok":true}'); }); });
  await new Promise((r) => mock.listen(0, r)); mocks.push(mock);
  const srv = await startServer({ env: { KRB_FECHA: '2026-11-30T05:10:00-03:00', RESPALDO_AUTO: '1', RESPALDO_PRIMERO_MS: '500', RESPALDO_URL: `http://localhost:${mock.address().port}/exec`, RESPALDO_CLAVE: 'clave-de-prueba' } });
  srvs.push(srv);
  await sleep(2500);
  const st = await srv.admin.get('/api/respaldo');
  assert.equal(st.ok, true, st.error);
  assert.equal(st.day, '2026-11-30');
  assert.equal(st.drive, true); assert.equal(st.driveUltimo, 'ok');
  assert.equal(got.length, 1);
  assert.equal(got[0].clave, 'clave-de-prueba');
  assert.equal(got[0].nombre, 'respaldo-2026-11-30.json.gz');
  assert.ok(abrir(Buffer.from(got[0].datos, 'base64')).archivos['data.json']);
});
