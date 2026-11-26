// Paneles sincronizados (Cote, 26 nov): dos paneles abiertos, uno supervisa y otro opera
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv;
before(async () => { srv = await startServer(); await srv.openRoom(); });
after(async () => { await srv.stop(); });

test('la vista que abre un panel queda anunciada para los demás (y las rutas del iPad se traducen)', async () => {
  let r = await srv.admin.post('/api/panel/ruta', { hash: '#/votoctl/festival' });
  const seq = r.seq;
  assert.equal(r.hash, '#/votoctl/festival');
  r = await srv.admin.post('/api/panel/ruta', { hash: '#/votoctl/festival' }); // la misma vista no cuenta como cambio
  assert.equal(r.seq, seq);
  r = await srv.admin.post('/api/panel/ruta', { hash: '#/bingo' }); // iPad viejo
  assert.match(r.hash, /^#\/anfitrion\/.+/);
  assert.equal(r.seq, seq + 1);
  assert.equal((await srv.admin.call('POST', '/api/panel/ruta', { hash: 'javascript:alert(1)' })).status, 400);
  assert.equal((await srv.call('GET', '/api/panel/ruta')).status, 401);
});

test('el mismo paso desde dos paneles casi a la vez se hace una sola vez', async () => {
  await srv.admin.post('/api/gamedraw/mode', { how: 'votacion' });
  const a = { admin: true, headers: { 'x-panel': 'AAA' } }; const b = { admin: true, headers: { 'x-panel': 'BBB' } };
  assert.equal((await srv.call('POST', '/api/gamevote/intro', {}, a)).status, 200);
  assert.equal((await srv.call('POST', '/api/gamevote/next', {}, a)).status, 200);
  const dup = await srv.call('POST', '/api/gamevote/next', {}, b); // el otro panel todavía veía la lámina anterior
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /otro panel/);
  assert.equal((await srv.ok('GET', '/api/gamevote')).intro.current, 1);
  assert.equal((await srv.call('POST', '/api/gamevote/next', {}, a)).status, 200); // el mismo panel sí puede seguir
  assert.equal((await srv.ok('GET', '/api/gamevote')).intro.current, 2);
});
