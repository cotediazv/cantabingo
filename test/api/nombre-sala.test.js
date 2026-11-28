// Nombre de la sala de juegos (orden 15 de Code 0, pedido de Cote, 28 nov): «Noche de juegos» en Mercado Kennedy y Tobalaba,
// «Tarde de juegos» en Frida (antes «Los Juegos de <local>»). «El Bingo de <local>» dentro del bingo no cambia. Las salas y
// proyectos guardados con el nombre de antes se renombran al arrancar; un nombre escrito a mano queda igual; la copia de
// eventos sigue con «Los Juegos de <evento>».
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });

test('nombre de la sala: Noche / Tarde de juegos, El Bingo de <local> igual, nombres guardados se renombran', async () => {
  const base = { created: 1, format: 'numbers', values: 75, items: null, cards: [], headers: 'BINGO', freeCenter: false, startNumber: 1, sessionId: null };
  const data = { projects: { p1: { ...base, id: 'p1', name: 'Los Juegos de Mercado Kennedy', theme: 'kennedy' }, p2: { ...base, id: 'p2', name: 'Mi bingo especial', theme: 'frida' } }, sessions: {} };
  const srv = await startServer({ data });
  srvs.push(srv);
  assert.deepEqual((await srv.ok('GET', '/api/tema')).salas, { frida: 'Tarde de juegos', kennedy: 'Noche de juegos', tobalaba: 'Noche de juegos' });
  const ps = await srv.admin.get('/api/projects');
  const byId = Object.fromEntries((ps.projects || ps).map((p) => [p.id, p.name]));
  assert.equal(byId.p1, 'Noche de juegos'); // guardado con el nombre de antes: se renombra
  assert.equal(byId.p2, 'Mi bingo especial'); // escrito a mano: queda igual
  // una sala nueva de Frida con el nombre de antes queda como «Tarde de juegos»; el bingo sigue «El Bingo de Frida»
  const { sid } = await srv.openRoom({ theme: 'frida', name: 'Los Juegos de Frida' });
  const st = await srv.admin.get(`/api/sessions/${sid}/host/state`);
  assert.equal(st.name, 'Tarde de juegos'); assert.equal(st.theme, 'frida');
  await srv.admin.post('/api/stage', { show: 'bingo' });
  assert.equal((await srv.ok('GET', '/api/carton')).title, 'El Bingo de Frida');
});

test('nombre de la sala: la copia de eventos sigue con «Los Juegos de <evento>»', async () => {
  const srv = await startServer({ env: { MODO_EVENTO: '1' } });
  srvs.push(srv);
  const { sid } = await srv.openRoom({ name: 'Los Juegos de Colada Continua' });
  assert.equal((await srv.admin.get(`/api/sessions/${sid}/host/state`)).name, 'Los Juegos de Colada Continua');
  assert.equal('salas' in (await srv.ok('GET', '/api/tema')), false);
});
