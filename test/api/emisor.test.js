// Emisor de la pantalla vertical de Mercado Kennedy (pedido de Cote, 25 nov: «que el emisor parta solo cuando empieza un
// juego en Kennedy, sin Trigger Run ni horario»): con un juego en pantalla en la sala de Kennedy, el servidor le pide a
// Render que arranque el Cron Job, una sola vez; si el emisor avisa que está corriendo, no lo vuelve a pedir.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer, sleep } = require('../helpers');

let srv; let mock; const runs = [];
before(async () => {
  mock = http.createServer((q, s) => { runs.push({ url: q.url, auth: q.headers.authorization }); s.writeHead(202, { 'content-type': 'application/json' }); s.end('{}'); });
  await new Promise((r) => mock.listen(0, r));
  srv = await startServer({ env: { RENDER_API_URL: `http://localhost:${mock.address().port}`, RENDER_API_KEY: 'clave-de-prueba', EMISOR_CRON: 'crn-prueba' } });
});
after(async () => { await srv.stop(); mock.close(); });

test('emisor: arranca solo con un juego en Kennedy, una vez, y no si ya está corriendo', async () => {
  const { sid } = await srv.openRoom({ theme: 'kennedy', count: 1 });
  await sleep(300);
  assert.equal(runs.length, 0); // solo la sala abierta (el QR): todavía no hay juego
  await srv.admin.post(`/api/sessions/${sid}/host/patterns`, { patterns: ['piramide'] }); // empieza el bingo
  await sleep(500);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].url, '/v1/cron-jobs/crn-prueba/runs');
  assert.equal(runs[0].auth, 'Bearer clave-de-prueba');
  await srv.admin.post('/api/stage', { show: 'voto' }); // otro juego: ya se pidió hace poco, no se repite
  await sleep(300);
  assert.equal(runs.length, 1);
  await srv.ok('POST', '/api/emisor/latido', { pantalla: 'kennedy' });
  const st = await srv.admin.get('/api/emisor');
  assert.equal(st.corriendo, true); assert.equal(st.configurado, true);
});

// Modo prueba (Cote, 25 nov: «hoy necesita que se quede en prueba y prendido todo el tiempo»): el emisor arranca aunque no
// haya sala ni juego, y la página de la emisión lo sabe
test('emisor: el modo prueba lo arranca sin juego', async () => {
  const runs2 = [];
  const mock2 = http.createServer((q, s) => { runs2.push(q.url); s.writeHead(202); s.end('{}'); });
  await new Promise((r) => mock2.listen(0, r));
  const srv2 = await startServer({ env: { RENDER_API_URL: `http://localhost:${mock2.address().port}`, RENDER_API_KEY: 'k', EMISOR_CRON: 'crn-2' } });
  try {
    assert.equal((await srv2.ok('GET', '/api/emisor/estado')).prueba, false);
    const r = await srv2.call('POST', '/api/emisor/prueba', { on: true });
    assert.equal(r.status, 401); // solo el moderador
    await srv2.admin.post('/api/emisor/prueba', { on: true });
    await sleep(400);
    assert.equal(runs2.length, 1);
    assert.equal((await srv2.ok('GET', '/api/emisor/estado')).prueba, true);
    const page = await fetch(`${srv2.url}/emision`, { redirect: 'manual' });
    assert.equal(page.headers.get('location'), '/emision.html?p=kennedy');
  } finally { await srv2.stop(); mock2.close(); }
});

// Diagnóstico desde la casa (26 nov): quién lee la pantalla vertical, recargarla a distancia y la foto del emisor
test('deco: lectores, recargar a distancia y foto del emisor', async () => {
  const srv3 = await startServer();
  try {
    await fetch(`${srv3.url}/api/vertical/kennedy`, { headers: { referer: `${srv3.url}/pv.html?p=kennedy&girar=1`, 'user-agent': 'Deco de prueba Chrome/72.0' } });
    const lec = await srv3.admin.get('/api/deco/lectores?p=kennedy');
    assert.equal(lec[0].ref, '/pv.html?p=kennedy&girar=1');
    assert.match(lec[0].ua, /Chrome\/72/);
    assert.equal((await srv3.ok('GET', '/api/vertical/kennedy')).recargar, 0);
    assert.equal((await srv3.call('POST', '/api/deco/recargar', { p: 'kennedy' })).status, 401);
    await srv3.admin.post('/api/deco/recargar', { p: 'kennedy' });
    assert.ok((await srv3.ok('GET', '/api/vertical/kennedy')).recargar > 0);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(300, 1)]);
    const r = await fetch(`${srv3.url}/api/emisor/foto`, { method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-luz': '42', 'x-cap': '1080x1920' }, body: jpg });
    assert.equal(r.status, 200);
    const info = await srv3.admin.get('/api/emisor/foto/info');
    assert.equal(info.luz, 42); assert.equal(info.cap, '1080x1920');
    assert.equal((await srv3.call('GET', '/api/emisor/foto')).status, 401);
  } finally { await srv3.stop(); }
});

// PLAN B (Cote, 26 nov): imagen cuadro a cuadro para el deco sin WebRTC; solo la acepta del emisor (marca del turno)
test('plan B: el emisor manda imágenes con su marca y la pantalla vertical lo sabe', async () => {
  const { startServer } = require('../helpers');
  const s = await startServer();
  try {
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(300, 1)]);
    const post = (k) => fetch(`${s.url}/api/emisor/cuadro`, { method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-emisor': k, 'x-pantalla': 'kennedy' }, body: jpg });
    assert.equal((await post('cualquiera')).status, 403);
    const lat = await (await fetch(`${s.url}/api/emisor/latido`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pantalla: 'kennedy', run: 'turno1' }) })).json();
    assert.ok(lat.marca);
    const otra = await (await fetch(`${s.url}/api/emisor/latido`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pantalla: 'kennedy', run: 'turno1' }) })).json();
    assert.equal(otra.marca, undefined); // se entrega una sola vez por turno
    assert.equal((await post(lat.marca)).status, 200);
    assert.equal((await fetch(`${s.url}/api/emisor/cuadro.jpg`)).status, 200);
    let v = await s.ok('GET', '/api/vertical/kennedy');
    assert.ok(v.cuadro > 0); assert.equal(v.planB, false);
    await s.admin.post('/api/emisor/planb', { on: true });
    v = await s.ok('GET', '/api/vertical/kennedy');
    assert.equal(v.planB, true);
    // «Solo plan A» (26 nov): el deco no usa nunca el plan B
    await s.admin.post('/api/emisor/modo', { modo: 'a' });
    v = await s.ok('GET', '/api/vertical/kennedy');
    assert.equal(v.planB, false); assert.equal(v.soloA, true);
    assert.equal((await s.admin.get('/api/emisor')).modo, 'a');
    await s.admin.post('/api/emisor/modo', { modo: 'auto' });
    v = await s.ok('GET', '/api/vertical/kennedy');
    assert.equal(v.planB, false); assert.equal(v.soloA, false);
    // el deco cuenta por qué no le llega la transmisión
    await s.ok('POST', '/api/deco', { p: 'kennedy', vista: 'sala', rtc: true, fallos: 2, err: 'en 25 s no llegó imagen', ice: 'checking' });
    const d = (await s.admin.get('/api/deco')).kennedy;
    assert.equal(d.fallos, 2); assert.equal(d.err, 'en 25 s no llegó imagen'); assert.equal(d.ice, 'checking');
  } finally { await s.stop(); }
});
