// Pestaña «Luces» del karaoke de Kennedy (pedido de Cote, 25 nov, por Code 4): el servidor saca la sesión de las luces
// con LUCES_CLAVE (una vez, y de nuevo con ?nuevo=1) y la entrega solo al moderador o al equipo de Kennedy.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer } = require('../helpers');

let srv; let mock; const logins = []; const momentos = []; let modo = 'bien'; // cómo responde el computador de las luces
before(async () => {
  mock = http.createServer((q, s) => {
    let body = ''; q.on('data', (c) => { body += c; });
    q.on('end', () => {
      if (q.url === '/api/login' && q.method === 'POST' && modo === 'antigua') { s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"ok":true}'); return; } // versión sin sesión
      if (q.url === '/api/login' && q.method === 'POST' && modo === 'cloudflare') { s.writeHead(403, { 'content-type': 'text/html' }); s.end('<html>Just a moment... cloudflare challenge</html>'); return; }
      if (q.url === '/api/login' && q.method === 'POST') { logins.push(body); s.writeHead(body === 'clave-luces' ? 200 : 401, { 'content-type': 'application/json' }); s.end(JSON.stringify(body === 'clave-luces' ? { ok: true, tk: `tk${logins.length}` } : { ok: false })); return; }
      if (q.url.startsWith('/api/momento?')) { momentos.push({ url: q.url, auth: q.headers.authorization }); s.writeHead(200); s.end('{}'); return; }
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

// Luces en tiempo real (pedido de Code 4 y decisión de Cote, 27 nov): el aviso de Render lleva id y t, y el mismo
// momento va a las pantallas por /api/live (evento «momento») con la firma de la Sala, nunca con la clave
test('luces: el momento lleva id y hora, y llega a las pantallas firmado', async () => {
  const crypto = require('crypto');
  const ctrl = new AbortController();
  const r = await fetch(`${srv.url}/api/live`, { signal: ctrl.signal });
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  const { sid } = await srv.openRoom({ theme: 'kennedy' });
  await srv.admin.post('/api/wheels', { players: ['ana', 'beto'], letters: 'ABCDE', seconds: 60 }).then((w) => srv.admin.post(`/api/wheels/${w.id}/act`, { action: 'start' }));
  let ev = null;
  for (let i = 0; i < 40 && !ev; i++) {
    const { value } = await reader.read(); buf += dec.decode(value, { stream: true });
    const m = buf.split('\n\n').map((b) => b.match(/^event: momento\ndata: (.*)$/m)).filter(Boolean).map((x) => JSON.parse(x[1])).find((x) => x.nombre === 'rosko_pregunta');
    if (m) ev = m;
  }
  ctrl.abort();
  assert.ok(ev, 'llega el evento momento');
  assert.equal(ev.firma, crypto.createHmac('sha256', 'clave-luces').update(`${ev.id}|rosko_pregunta`).digest('hex').slice(0, 32));
  assert.ok(!JSON.stringify(ev).includes('clave-luces'));
  assert.match(ev.url, /^http:\/\/localhost:\d+$/);
  for (let i = 0; i < 20 && !momentos.some((m) => m.url.includes('rosko_pregunta')); i++) await new Promise((x) => setTimeout(x, 50));
  const sent = momentos.find((m) => m.url.includes('nombre=rosko_pregunta'));
  assert.match(sent.url, new RegExp(`&id=${ev.id}&t=\\d+$`));
  assert.equal(sent.auth, 'Bearer clave-luces');
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
});
