// ¿Quién quiere ser ganador? entra a los juegos disponibles (Cote, 26 nov, respuesta 34.1): Manual, Por sorteo y Por votación
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv; let sid; let ana;
before(async () => {
  srv = await startServer();
  ({ sid } = await srv.openRoom());
  ana = await srv.join(sid, 'ANA', 'PRUEBA');
});
after(async () => { await srv.stop(); });

test('¿Quién quiere ser ganador? se elige a mano, sale en el sorteo y en la votación', async () => {
  assert.ok((await srv.ok('GET', '/api/gamedraw')).games.includes('desafio'));
  // Manual: tocarlo lo deja elegido; una partida terminada queda en blanco para empezar otra
  await srv.admin.post('/api/gamedraw/mode', { how: 'manual' });
  await srv.admin.post('/api/desafio/host', { action: 'new', player: 'Carla Soto' });
  await srv.admin.post('/api/desafio/host', { action: 'next' });
  await srv.admin.post('/api/desafio/host', { action: 'retire' });
  assert.equal((await srv.admin.get('/api/desafio/host')).phase, 'end');
  await srv.admin.post('/api/gamedraw/free', { game: 'desafio' });
  assert.equal((await srv.admin.get('/api/desafio/host')).phase, 'setup');
  // Una partida en curso no se borra al volver a tocarlo
  await srv.admin.post('/api/desafio/host', { action: 'new', player: 'Carla Soto' });
  await srv.admin.post('/api/gamedraw/free', { game: 'desafio' });
  assert.equal((await srv.admin.get('/api/desafio/host')).phase, 'intro');
  await srv.admin.post('/api/desafio/host', { action: 'reset' });
  // Por sorteo: se puede elegir directo y entra en la tómbola
  await srv.admin.post('/api/gamedraw/mode', { how: 'sorteo' });
  const r = await srv.admin.post('/api/gamedraw/ready');
  assert.ok(r.ready.pool.includes('desafio'));
  const p = await srv.admin.post('/api/gamedraw/pick', { game: 'desafio' });
  assert.equal(p.last.game, 'desafio');
  // Por votación: la presentación tiene 7 láminas (reglas, 5 juegos y «¡A votar!») y se puede votar por él
  await srv.admin.post('/api/gamedraw/mode', { how: 'votacion' });
  let v = await srv.admin.post('/api/gamevote/intro');
  for (let i = 0; i < 8; i++) v = await srv.admin.post('/api/gamevote/next');
  assert.equal(v.intro.current, 6);
  v = await srv.admin.post('/api/gamevote/start');
  assert.ok(v.options.includes('desafio'));
  assert.equal(v.options.length, 5);
  await srv.ok('POST', '/api/gamevote/vote', { sid, token: ana.token, game: 'desafio' });
  assert.equal((await srv.ok('GET', '/api/gamevote')).counts.desafio, 1);
});
