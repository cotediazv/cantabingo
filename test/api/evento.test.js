// Copia de eventos (Cote, 27 nov, respuesta 37.1: «una sala aparte… que le sirva para eventos externos»): con MODO_EVENTO=1
// la sala lleva el nombre del evento y colores de la marca, todos los juegos (en «Manual»; orden 12 de Code 0, 28 nov), dura
// hasta 14 horas y no abre ni cierra salas de los locales.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });

test('modo evento: nombre del evento y todos los juegos', async () => {
  // domingo 29 nov 13:05 en Chile: en la Sala principal se abriría sola la de Frida; aquí no
  const srv = await startServer({ env: { MODO_EVENTO: '1', KRB_FECHA: '2026-11-29T13:05:00-03:00' } });
  srvs.push(srv);
  assert.equal((await srv.ok('GET', '/api/tema')).evento, true);
  await new Promise((r) => setTimeout(r, 5600)); // la revisión de las salas automáticas corre a los 5 s
  assert.equal((await srv.ok('GET', '/api/current')).sessions.length, 0);
  const { project, sid } = await srv.openRoom({ theme: 'frida', name: 'Los Juegos de Colada Continua' });
  assert.equal(project.theme, 'evento');
  const st = await srv.admin.get(`/api/sessions/${sid}/host/state`);
  assert.equal(st.theme, 'evento');
  assert.ok(st.expires - Date.now() > 13 * 3600e3); // de 9:00 a 18:00 alcanza
  const g = await srv.ok('GET', '/api/gamedraw');
  // todos los juegos, como en los locales (orden 12 de Code 0, pedido de Cote, 28 nov: «Quisiera que estuvieran todos los juegos»)
  assert.deepEqual(g.games, ['bingo', 'rosco', 'festival', 'objeto', 'desafio']); assert.equal(g.evento, true);
  await srv.admin.post('/api/gamedraw/mode', { how: 'manual' });
  assert.equal(g.eventoNombre, 'Colada Continua');
  assert.equal((await srv.ok('GET', '/api/tema')).eventoNombre, 'Colada Continua');
  const free = (game) => srv.admin.call('POST', '/api/gamedraw/free', { game });
  // El Festival lleva el nombre del evento, no el de un local; se inscribe gente desde el celular y se vota
  assert.equal((await free('festival')).status, 200);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'voto');
  let v = await srv.ok('GET', '/api/vote');
  assert.equal(v.mode, 'karaoke'); assert.equal(v.title, 'El Festival de Colada Continua'); assert.equal(v.venue, 'evento');
  await srv.admin.post('/api/vote/host', { action: 'signup', on: true });
  const ana = await srv.join(sid, 'ANA', 'PRUEBA');
  assert.equal((await srv.call('POST', '/api/vote/join', { sid, token: ana.token, song: 'Gracias a la vida', artist: 'Violeta Parra' })).status, 200);
  const host = await srv.admin.get('/api/vote/host');
  assert.equal(host.players.length, 1);
  await srv.admin.post('/api/vote/host', { action: 'signup', on: false });
  await srv.admin.post('/api/vote/host', { action: 'present', id: host.players[0].id });
  assert.equal((await srv.ok('GET', '/api/carton')).title, 'El Festival de Colada Continua');
  // El objeto más extraño (como en los locales, con un Festival en curso hay que reemplazarlo: «Empezar… (borra el anterior)»)
  await srv.admin.post('/api/vote/host', { action: 'reset' });
  await srv.admin.post('/api/vote/host', { action: 'mode', mode: 'objeto' });
  assert.equal((await free('objeto')).status, 200);
  v = await srv.ok('GET', '/api/vote');
  assert.equal(v.mode, 'objeto'); assert.equal(v.title, 'El objeto más extraño');
  // El Rosko
  assert.equal((await free('rosco')).status, 200);
  const w = await srv.admin.post('/api/wheels', { players: ['ana', 'beto'], letters: 'ABCDE', seconds: 60 });
  await srv.admin.post(`/api/wheels/${w.id}/act`, { action: 'start' });
  await srv.admin.post(`/api/wheels/${w.id}/act`, { action: 'hit' });
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'rueda');
  assert.equal((await srv.admin.get(`/api/wheels/${w.id}`)).players[0].status[0], 'hit');
  await srv.admin.del(`/api/wheels/${w.id}`);
  // ¿Quién quiere ser ganador? y Bingo
  assert.equal((await free('desafio')).status, 200);
  const d = await srv.admin.post('/api/desafio/host', { action: 'new', player: 'Camila Rojas' });
  assert.equal(d.phase, 'intro');
  assert.equal((await free('bingo')).status, 200);
  assert.equal((await free('enpie')).status, 400); // lo que no es un juego del menú sigue sin poder elegirse
});

test('modo evento: también Por sorteo y Por votación, de principio a fin', async () => {
  // orden 13 de Code 0, pedido de Cote (28 nov): «tiene que tener la opción manual, sorteo y votación del público. Al igual
  // que la sala de juegos normal»
  const srv = await startServer({ env: { MODO_EVENTO: '1' } });
  srvs.push(srv);
  const { sid } = await srv.openRoom({ name: 'Los Juegos de Colada Continua' });
  // Por sorteo: iniciar el sorteo, girar la tómbola y sale un juego del evento
  let g = await srv.admin.post('/api/gamedraw/mode', { how: 'sorteo' });
  assert.equal(g.how, 'sorteo');
  assert.equal((await srv.admin.call('POST', '/api/gamedraw/free', { game: 'bingo' })).status, 409); // cada pestaña solo lo suyo
  g = await srv.admin.post('/api/gamedraw/ready');
  assert.deepEqual(g.ready.pool, ['bingo', 'rosco', 'festival', 'objeto', 'desafio']);
  g = await srv.admin.post('/api/gamedraw');
  assert.ok(['bingo', 'rosco', 'festival', 'objeto', 'desafio'].includes(g.last.game));
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'juego');
  // Por votación: la presentación lleva el nombre del evento y el público elige; gana El Festival con 2 de 3 votos
  await srv.admin.post('/api/gamedraw/mode', { how: 'votacion' });
  let v = await srv.admin.post('/api/gamevote/intro');
  for (let i = 0; i < 8; i++) v = await srv.admin.post('/api/gamevote/next');
  v = await srv.admin.post('/api/gamevote/start');
  assert.deepEqual(v.options, ['bingo', 'rosco', 'festival', 'objeto', 'desafio']);
  assert.equal(v.venue, 'evento');
  const tok = [];
  for (const n of ['ANA', 'LUIS', 'ROSA']) tok.push((await srv.join(sid, n, 'PRUEBA')).token);
  await srv.ok('POST', '/api/gamevote/vote', { sid, token: tok[0], game: 'festival' });
  await srv.ok('POST', '/api/gamevote/vote', { sid, token: tok[1], game: 'festival' });
  await srv.ok('POST', '/api/gamevote/vote', { sid, token: tok[2], game: 'bingo' });
  await new Promise((r) => setTimeout(r, 31000)); // la votación dura 30 s
  v = await srv.ok('GET', '/api/gamevote');
  assert.equal(v.winner, 'festival');
  assert.equal((await srv.ok('GET', '/api/vote')).title, 'El Festival de Colada Continua');
});

test('sin modo evento: la Sala de los locales queda igual', async () => {
  const srv = await startServer();
  srvs.push(srv);
  const t = await srv.ok('GET', '/api/tema');
  assert.equal(t.evento, false); assert.equal('eventoNombre' in t, false);
  await srv.openRoom({ theme: 'frida' });
  const g = await srv.ok('GET', '/api/gamedraw');
  assert.deepEqual(g.games, ['bingo', 'rosco', 'festival', 'objeto', 'desafio']); assert.equal(g.evento, false); assert.equal('eventoNombre' in g, false);
  await srv.admin.post('/api/gamedraw/mode', { how: 'manual' });
  await srv.admin.post('/api/gamedraw/free', { game: 'festival' });
  assert.equal((await srv.ok('GET', '/api/vote')).title, 'El Festival de Frida');
});
