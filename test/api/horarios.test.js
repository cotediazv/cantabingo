// Lo que pasa solo según el día y la hora de Chile. Cada prueba simula un día con KRB_FECHA.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, sleep } = require('../helpers');

const until = async (fn, ms) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(500); } };

test('jueves en Kennedy: la sala se crea sola a las 18:30 y a las 21:45 pasa sola a Karaoke', async () => {
  const srv = await startServer({ env: { KRB_FECHA: '2026-11-26T21:44:50-03:00' } });
  try {
    const cur = await until(async () => (await srv.ok('GET', '/api/current')).sessions[0], 8000);
    assert.equal(cur.name, 'Los Juegos de Kennedy');
    assert.equal(cur.theme, 'kennedy');
    assert.equal((await srv.ok('GET', '/api/stage')).show, 'bingo');
    const show = await until(async () => ((await srv.ok('GET', '/api/stage')).show === 'karaoke' ? 'karaoke' : ''), 25000);
    assert.equal(show, 'karaoke');
  } finally { await srv.stop(); }
});

test('viernes en Tobalaba: a las 22:45 la sala del local se cierra sola', async () => {
  const srv = await startServer({ env: { KRB_FECHA: '2026-11-27T22:44:57-03:00' } });
  try {
    await srv.openRoom({ theme: 'tobalaba' });
    assert.equal((await srv.ok('GET', '/api/current')).sessions.length, 1);
    const closed = await until(async () => (await srv.ok('GET', '/api/current')).sessions.length === 0, 8000);
    assert.equal(closed, true);
  } finally { await srv.stop(); }
});

test('un miércoles no pasa nada automático', async () => {
  const srv = await startServer();
  try {
    await sleep(6000);
    assert.deepEqual((await srv.ok('GET', '/api/current')).sessions, []);
  } finally { await srv.stop(); }
});
