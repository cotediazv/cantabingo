// Aviso de datos personales en la entrada (decisión de Cote, pregunta 9.2: desde diciembre, Ley 21.719; preparado por
// orden de Code 0, 28 nov): apagado por defecto; solo el moderador lo enciende o apaga, y viaja en /api/tema como «priv».
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });

test('aviso de datos personales: apagado por defecto y solo el moderador lo cambia', async () => {
  const srv = await startServer();
  srvs.push(srv);
  assert.equal((await srv.ok('GET', '/api/tema')).priv, false);
  assert.equal((await srv.call('POST', '/api/privacidad', { on: true })).status, 401);
  assert.equal((await srv.ok('GET', '/api/tema')).priv, false);
  assert.equal((await srv.admin.post('/api/privacidad', { on: true })).on, true);
  assert.equal((await srv.ok('GET', '/api/tema')).priv, true);
  assert.equal((await srv.admin.post('/api/privacidad', { on: false })).on, false);
  assert.equal((await srv.ok('GET', '/api/tema')).priv, false);
});
