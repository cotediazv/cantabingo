// Arreglos de la gran simulación del 26 nov (150 personas, todos los juegos)
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv; let sid;
before(async () => {
  srv = await startServer();
  ({ sid } = await srv.openRoom());
  await srv.join(sid, 'ANA', 'PRUEBA');
});
after(async () => { await srv.stop(); });

test('con El Rosko en juego, El último en pie y ¿Quién quiere ser ganador? no parten ni avanzan', async () => {
  const { id } = await srv.admin.post('/api/wheels', { players: ['ana', 'beto'], letters: 'ABCDE', seconds: 60 });
  await srv.admin.post(`/api/wheels/${id}/act`, { action: 'start' }); // El Rosko en juego
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'rueda');
  const ep = await srv.admin.call('POST', '/api/enpie/host', { action: 'new' });
  assert.equal(ep.status, 409);
  assert.match(ep.body.error, /El Rosko está en juego/);
  assert.equal((await srv.admin.call('POST', '/api/enpie/host', { action: 'next' })).status, 409);
  const ds = await srv.admin.call('POST', '/api/desafio/host', { action: 'new', player: 'Carla Soto' });
  assert.equal(ds.status, 409);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'rueda'); // la pantalla sigue en El Rosko
  // Terminado El Rosko (se borra), ya se pueden jugar
  await srv.admin.call('DELETE', `/api/wheels/${id}`);
  assert.equal((await srv.admin.call('POST', '/api/enpie/host', { action: 'new' })).status, 200);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'enpie');
});

test('cualquier paso de El último en pie y de ¿Quién quiere ser ganador? los vuelve a poner en pantalla', async () => {
  await srv.admin.post('/api/enpie/host', { action: 'new' });
  await srv.admin.post('/api/enpie/host', { action: 'next' }); // primera pregunta
  await srv.admin.post('/api/stage', { show: 'qr' });
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'qr');
  await srv.admin.post('/api/enpie/host', { action: 'close' }); // el animador sigue desde su panel
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'enpie');
  await srv.admin.post('/api/desafio/host', { action: 'new', player: 'Carla Soto' });
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'desafio');
  await srv.admin.post('/api/stage', { show: 'qr' });
  await srv.admin.post('/api/desafio/host', { action: 'next' }); // primera pregunta
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'desafio');
});

test('/sala y /animador entran directo a su vista, sin el aviso de cambio de dirección que dibujaba la portada', async () => {
  for (const [path, hash] of [['/sala', '#/master/movil'], ['/animador', '#/animador']]) {
    const html = await (await fetch(srv.url + path)).text();
    assert.ok(html.includes(`history.replaceState(null, "", location.pathname + location.search + "${hash}")`), path);
    assert.ok(!html.includes(`location.replace(location.pathname + location.search + "${hash}")`), path);
  }
});
