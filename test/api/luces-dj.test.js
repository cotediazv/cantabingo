// Pestaña «Luces» del karaoke de Kennedy (pedido de Cote, 25 nov, por Code 4): el servidor saca la sesión de las luces
// con LUCES_CLAVE (una vez, y de nuevo con ?nuevo=1) y la entrega solo al moderador o al equipo de Kennedy.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer } = require('../helpers');

let srv; let mock; const logins = []; let modo = 'bien'; // cómo responde el computador de las luces
before(async () => {
  mock = http.createServer((q, s) => {
    let body = ''; q.on('data', (c) => { body += c; });
    q.on('end', () => {
      if (q.url === '/api/login' && q.method === 'POST' && modo === 'antigua') { s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"ok":true}'); return; } // versión sin sesión
      if (q.url === '/api/login' && q.method === 'POST' && modo === 'cloudflare') { s.writeHead(403, { 'content-type': 'text/html' }); s.end('<html>Just a moment... cloudflare challenge</html>'); return; }
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

// Cote, 26 nov: «desde el panel del DJ en GC Kennedy Light las luces no funcionan»: sin sesión, el panel se abre igual
// (pide la clave adentro) y dice el motivo
test('luces: si no llega la sesión, el panel del DJ se abre igual con el motivo', async () => {
  modo = 'antigua';
  let r = await srv.admin.get('/api/luces/dj?nuevo=1');
  assert.match(r.url, /\/dj$/); assert.match(r.aviso, /versión anterior/);
  modo = 'cloudflare';
  r = await srv.admin.get('/api/luces/dj?nuevo=1');
  assert.match(r.aviso, /Cloudflare/);
  modo = 'bien';
  r = await srv.admin.get('/api/luces/dj?nuevo=1');
  assert.match(r.url, /#tk=tk\d+$/); assert.equal(r.aviso, undefined);
});
