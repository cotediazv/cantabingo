// Sesión del animador (pedido de Cote, 25 nov, 26.1): el moderador pone una clave en el Centro de control; con ella el
// animador entra por /animador y maneja los juegos (recibe una sesión que sirve para los paneles).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); });

test('animador: sin clave no entra; con la clave del Centro de control sí, y maneja los paneles', async () => {
  let r = await srv.call('POST', '/api/animador/login', { clave: 'abcd' });
  assert.equal(r.status, 503);
  assert.equal((await srv.admin.get('/api/animador/clave')).hay, false);
  r = await srv.call('POST', '/api/animador/clave', { clave: 'abcd' }); // solo el moderador la pone
  assert.equal(r.status, 401);
  await srv.admin.post('/api/animador/clave', { clave: 'mesa-larga' });
  assert.equal((await srv.admin.get('/api/animador/clave')).hay, true);
  r = await srv.call('POST', '/api/animador/login', { clave: 'otra' });
  assert.equal(r.status, 401);
  const { token } = await srv.ok('POST', '/api/animador/login', { clave: 'mesa-larga' });
  const me = await srv.call('GET', '/api/me', undefined, { headers: { 'x-admin': token } });
  assert.equal(me.body.admin, true);
  const page = await fetch(`${srv.url}/animador`);
  const html = await page.text();
  assert.match(html, /manifest-animador\.webmanifest/);
  assert.match(html, /animador-ui\.js/);
});
