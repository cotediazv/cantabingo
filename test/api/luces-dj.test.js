// Pestaña «Luces» del karaoke de Kennedy (pedido de Cote, 25 nov, por Code 4): el servidor saca la sesión de las luces
// con LUCES_CLAVE (una vez, y de nuevo con ?nuevo=1) y la entrega solo al moderador o al equipo de Kennedy.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer } = require('../helpers');

let srv; let mock; const logins = [];
before(async () => {
  mock = http.createServer((q, s) => {
    let body = ''; q.on('data', (c) => { body += c; });
    q.on('end', () => {
      if (q.url === '/api/login' && q.method === 'POST') { logins.push(body); s.writeHead(body === 'clave-luces' ? 200 : 401, { 'content-type': 'application/json' }); s.end(JSON.stringify(body === 'clave-luces' ? { ok: true, tk: `tk${logins.length}` } : { ok: false })); return; }
      s.writeHead(404); s.end();
    });
  });
  await new Promise((r) => mock.listen(0, r));
  srv = await startServer({ env: { LUCES_URL: `http://localhost:${mock.address().port}`, LUCES_CLAVE: 'clave-luces' } });
});
after(async () => { await srv.stop(); mock.close(); });

test('luces: el panel del DJ con la sesión, solo para el moderador', async () => {
  assert.equal((await srv.call('GET', '/api/luces/dj')).status, 401);
  const a = await srv.admin.get('/api/luces/dj');
  assert.match(a.url, /\/dj#tk=tk1$/);
  const b = await srv.admin.get('/api/luces/dj'); // la sesión queda guardada: no se pide otra
  assert.match(b.url, /tk1$/); assert.equal(logins.length, 1);
  const c = await srv.admin.get('/api/luces/dj?nuevo=1');
  assert.match(c.url, /tk2$/); assert.equal(logins[0], 'clave-luces');
});
