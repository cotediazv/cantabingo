// GC Light de Mercado Kennedy fuera del horario del show (pedido de Cote, 27 nov): de 01:00 a 19:00 (hora de Chile)
// muestra el video horizontal del local; de 19:00 a 01:00, el GC. Una tarde con sala de juegos de Kennedy, manda la sala.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

const data = { projects: {}, sessions: {}, vertical: { 'kennedy-h': { video: 123, size: 10, mode: 'video' } } };
const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });
const at = async (iso) => { const s = await startServer({ data, env: { KRB_FECHA: iso } }); srvs.push(s); return s; };

test('fondo del GC Light de Kennedy: de día el video horizontal, en la noche el GC', async () => {
  let s = await at('2026-11-25T18:00:00Z'); // miércoles 15:00 en Chile
  assert.equal((await s.ok('GET', '/api/light?local=kennedy')).fondo, '/vertical/kennedy-h.mp4?v=123');
  assert.equal((await s.ok('GET', '/api/light?local=frida')).fondo, ''); // solo Kennedy
  // con la sala de juegos de Kennedy abierta en la tarde, manda la sala
  const { sid } = await s.openRoom({ theme: 'kennedy' });
  const st = await s.ok('GET', '/api/light?local=kennedy');
  assert.equal(st.fondo, ''); assert.equal(st.sala, true);
  await s.admin.post(`/api/sessions/${sid}/host/close`);
  s = await at('2026-11-25T23:30:00Z'); // miércoles 20:30: horario del show
  assert.equal((await s.ok('GET', '/api/light?local=kennedy')).fondo, '');
  s = await at('2026-11-26T04:30:00Z'); // jueves 01:30: vuelve el fondo
  assert.equal((await s.ok('GET', '/api/light?local=kennedy')).fondo, '/vertical/kennedy-h.mp4?v=123');
});
