// El lugar del concursante bajo su nombre (pedido de Cote, 26 nov: «mostrar bajo el nombre del concursante en Kennedy en
// qué lugar está»): sale del lugar que eligió al entrar y viaja en El Rosko, el sorteo y ¿Quién quiere ser ganador?
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv;
before(async () => { srv = await startServer({ data: { projects: {}, sessions: {}, karaoke: { ask: { kennedy: { places: ['La Picada de Don Pepe', 'Sushi Mercado'], choices: [] } } } } }); });
after(async () => { await srv.stop(); });

test('lugar del concursante en El Rosko, el sorteo y ¿Quién quiere ser ganador?', async () => {
  const { sid } = await srv.openRoom({ theme: 'kennedy', count: 5 });
  await srv.join(sid, 'ISIDORA', 'ROJAS', { place: 'Sushi Mercado' });
  const w = await srv.admin.post('/api/wheels', { players: ['ISIDORA ROJAS', 'OTRA PERSONA'] });
  const st = await srv.admin.get(`/api/wheels/${w.id}`);
  assert.equal(st.players[0].place, 'Sushi Mercado');
  assert.equal(st.players[1].place, '');
  await srv.admin.post('/api/desafio/host', { action: 'new', player: 'Isidora Rojas', prizes: ['a', 'b', 'c'] });
  assert.equal((await srv.ok('GET', '/api/desafio')).place, 'Sushi Mercado');
  assert.deepEqual((await srv.ok('GET', '/api/raffle')).places, {});
  // El objeto más extraño / El Festival: el que se anota a mano con el nombre de una persona de la sala
  await srv.admin.post('/api/vote/host', { action: 'add', name: 'Isidora Rojas', thing: 'Un reloj de arena' });
  const vt = await srv.ok('GET', '/api/vote');
  assert.equal(vt.players.find((p) => p.name === 'ISIDORA ROJAS').place, 'Sushi Mercado');
});
