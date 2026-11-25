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
