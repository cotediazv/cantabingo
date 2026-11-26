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
