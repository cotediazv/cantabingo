// GC Light: botón «FONDO KENNEDY» (y «FONDO FRIDA», «FONDO TOBALABA») (pedidos de Cote, 27 nov). Muestra el video horizontal del local;
// se aprieta solo una vez al publicar, a la 01:00 y a las 19:00, y queda hasta que se toque otro botón del GC.
// Con la sala de juegos de Kennedy abierta (de 12:00 a 01:00), manda la sala.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, sleep } = require('../helpers');

const base = () => ({ projects: {}, sessions: {}, vertical: { 'kennedy-h': { video: 123, size: 10, mode: 'video' }, tobalaba: { video: 77, size: 10, mode: 'video' } } });
const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });
const at = async (iso, data = base()) => { const s = await startServer({ data, env: { KRB_FECHA: iso } }); srvs.push(s); await sleep(2600); return s; };
const SRC = '/vertical/kennedy-h.mp4?v=123';

test('fondo Kennedy: queda puesto al publicar y se quita con otro botón del GC', async () => {
  const s = await at('2026-11-25T18:00:00Z'); // miércoles 15:00 en Chile
  let st = await s.ok('GET', '/api/light?local=kennedy');
  assert.equal(st.stage, 'fondo'); assert.equal(st.fondo, SRC);
  // Frida y Tobalaba, igual, con su video horizontal (Frida sin video subido: el botón no muestra nada)
  assert.equal((await s.ok('GET', '/api/light?local=frida')).stage, 'fondo');
  assert.equal((await s.ok('GET', '/api/light?local=frida')).fondo, '');
  assert.equal((await s.ok('GET', '/api/light?local=tobalaba')).fondo, '/vertical/tobalaba.mp4?v=77');
  st = await s.admin.post('/api/light/stage', { local: 'kennedy', show: 'cartelera' });
  assert.equal(st.fondo, '');
  // con la cartelera de la semana, el video del local va de fondo (pedido de Cote, 27 nov)
  assert.equal(st.fondoVideo, SRC);
  assert.equal((await s.ok('GET', '/api/light?local=frida')).fondoVideo, '');
  st = await s.admin.post('/api/light/stage', { local: 'kennedy', show: 'fondo' });
  assert.equal(st.fondo, SRC);
  // con la sala de juegos de Kennedy abierta en la tarde, manda la sala
  const { sid } = await s.openRoom({ theme: 'kennedy' });
  st = await s.ok('GET', '/api/light?local=kennedy');
  assert.equal(st.fondo, ''); assert.equal(st.sala, true);
  await s.admin.post(`/api/sessions/${sid}/host/close`);
});

test('fondo Kennedy: a las 19:00 se aprieta solo', async () => {
  const data = base(); data.fondoAuto = { 'kennedy:ini': '2026-11-20' };
  data.lights = { kennedy: { id: 'Lk', venue: 'kennedy', stage: 'cartelera', players: {}, created: 1 } };
  const s = await at('2026-11-25T22:05:00Z', data); // miércoles 19:05
  const st = await s.ok('GET', '/api/light?local=kennedy');
  assert.equal(st.stage, 'fondo'); assert.equal(st.fondo, SRC);
});

test('fondo Kennedy: fuera de las 01:00 y 19:00 no se mete', async () => {
  const data = base(); data.fondoAuto = { 'kennedy:ini': '2026-11-20' };
  data.lights = { kennedy: { id: 'Lk', venue: 'kennedy', stage: 'karaoke', players: {}, created: 1 } };
  const s = await at('2026-11-26T00:30:00Z', data); // miércoles 21:30
  assert.equal((await s.ok('GET', '/api/light?local=kennedy')).fondo, '');
});
