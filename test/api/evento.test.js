// Copia de eventos (Cote, 27 nov, respuesta 37.1: «una sala aparte… que le sirva para eventos externos»): con MODO_EVENTO=1
// la sala lleva el nombre del evento y colores de la marca, solo Bingo y ¿Quién quiere ser ganador? (en «Manual»), dura
// hasta 14 horas y no abre ni cierra salas de los locales.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });

test('modo evento: nombre del evento, solo bingo y ¿Quién quiere ser ganador?', async () => {
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
  assert.deepEqual(g.games, ['bingo', 'desafio']); assert.equal(g.how, 'manual'); assert.equal(g.evento, true);
  // juegos que no son del evento no se pueden elegir
  assert.equal((await srv.admin.call('POST', '/api/gamedraw/free', { game: 'rosco' })).status, 400);
  assert.equal((await srv.admin.call('POST', '/api/gamedraw/free', { game: 'desafio' })).status, 200);
});
