// Karaoke (lista de la planilla), sala light, Instagram, programación y pantallas de los locales.
// La planilla (Apps Script) y la GLOSA se simulan con un servidor local: las pruebas nunca salen a internet.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { startServer, sleep } = require('../helpers');

const SHEET = [
  { hora: '21:50', nombre: 'Ana Pérez', cancion: 'Gracias a la vida (Remastered) - Violeta Parra', lugar: 'Mesa 4', id: 'P1' },
  { hora: '21:55', nombre: 'Luis Soto', cancion: 'No me ames (Versión Salsa) – Marc Anthony', lugar: 'Barra', id: 'P2' },
  { hora: '22:00', nombre: '', cancion: 'Sin nombre - Nadie', id: 'P3' },
];
let mock; let mockUrl; let srv; let staff;
before(async () => {
  mock = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/sheet')) return res.end(JSON.stringify(SHEET));
    if (req.url.startsWith('/glosa')) return res.end(JSON.stringify({}));
    res.statusCode = 404; res.end('{}');
  });
  await new Promise((r) => mock.listen(0, r));
  mockUrl = `http://localhost:${mock.address().port}`;
  // Datos de partida: la planilla de Kennedy apunta al simulador y sin formularios (para no salir a Google)
  const urls = Object.fromEntries(['frida', 'kennedy', 'tobalaba'].map((v) => [v, { exec: v === 'kennedy' ? `${mockUrl}/sheet` : '', form: '' }]));
  srv = await startServer({
    env: { GLOSA_TEST_URL: `${mockUrl}/glosa` },
    data: { projects: {}, sessions: {}, karaoke: { venue: 'kennedy', urls, tobalabaExec16nov: true, phoneDefault: true } },
  });
  await srv.admin.post('/api/staff/clave', { local: 'kennedy', clave: 'equipo-k' });
  staff = (await srv.ok('POST', '/api/staff/login', { local: 'kennedy', clave: 'equipo-k' })).token;
});
after(async () => { await srv.stop(); await new Promise((r) => mock.close(r)); });

test('karaoke: lee la planilla del local y separa canción y artista', async () => {
  const { sid } = await srv.openRoom({ theme: 'kennedy' });
  const ana = await srv.join(sid, 'Ana', 'Pérez');
  await srv.admin.post('/api/stage', { show: 'karaoke' });
  let k;
  for (let i = 0; i < 20; i++) { k = await srv.ok('GET', `/api/karaoke?sid=${sid}&token=${ana.token}`); if (k.total) break; await sleep(250); }
  assert.equal(k.venue, 'kennedy');
  assert.equal(k.total, 2); // la fila sin nombre no cuenta
  assert.deepEqual(k.list.map((x) => [x.name, x.song, x.artist, x.place]), [
    ['Ana Pérez', 'Gracias a la vida (Remastered)', 'Violeta Parra', 'Mesa 4'],
    ['Luis Soto', 'No me ames (Versión Salsa)', 'Marc Anthony', 'Barra'],
  ]);
  assert.equal(k.list[0].id, undefined); // las pantallas no reciben el ID de la planilla
  assert.deepEqual(k.me, { count: 1, first: 0, max: k.me.max });

  // Lista del equipo: el de Kennedy entra a Kennedy, no a Frida
  const cola = await srv.ok('GET', '/api/karaoke/cola?local=kennedy', undefined, { staff });
  assert.equal(cola.total, 2);
  assert.equal((await srv.call('GET', '/api/karaoke/cola?local=frida', undefined, { staff })).status, 401);

  const cfg = await srv.admin.get('/api/karaoke/config');
  assert.equal(cfg.venue, 'kennedy');
  assert.equal(cfg.status.total, 2);
  // Solo se aceptan direcciones de Google
  assert.equal((await srv.admin.call('POST', '/api/karaoke/config', { urls: { frida: { exec: 'https://malo.com/exec' } } })).status, 400);
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
});

test('sala light: el equipo la abre, cambia su GC y el público entra con nombre y apellido', async () => {
  const opened = await srv.ok('POST', '/api/light', { local: 'kennedy' }, { staff });
  assert.equal(opened.open, true);
  assert.equal(opened.venue, 'kennedy');
  assert.equal((await srv.call('POST', '/api/light', { local: 'frida' }, { staff })).status, 401);
  const st = await srv.ok('POST', '/api/light/stage', { local: 'kennedy', show: 'karaoke' }, { staff });
  assert.equal(st.stage, 'karaoke');
  assert.equal((await srv.call('POST', '/api/light/stage', { local: 'kennedy', show: 'nada' }, { staff })).status, 400);
  const room = await srv.ok('GET', `/api/light/${opened.id}`);
  assert.equal(room.venue, 'kennedy');
  assert.equal((await srv.call('POST', `/api/light/${opened.id}/join`, { name: 'ana' })).status, 400);
  const me = await srv.ok('POST', `/api/light/${opened.id}/join`, { name: 'ana', surname: 'pérez' });
  assert.equal(me.name, 'ANA PÉREZ');
  assert.equal((await srv.ok('GET', '/api/light?local=kennedy')).players, 1);
  const cart = await srv.ok('GET', '/api/light/cartelera?local=kennedy');
  assert.equal(cart.venue, 'kennedy');
  const consola = await srv.admin.get('/api/consola');
  assert.ok(Array.isArray(consola.locales));
});

test('Instagram, programación y pantallas de los locales responden', async () => {
  assert.equal((await srv.admin.call('POST', '/api/insta/config', { handles: { kennedy: 'no es una cuenta!!' } })).status, 400);
  const ig = await srv.admin.post('/api/insta/config', { handles: { kennedy: '@krbstage' } });
  assert.equal(ig.handles.kennedy, 'krbstage');
  assert.ok(await srv.ok('GET', '/api/insta'));
  assert.ok(await srv.ok('GET', '/api/agenda'));
  assert.ok(await srv.admin.get('/api/agenda/config'));
  for (const screen of ['kennedy', 'frida', 'tobalaba-v', 'kennedy-h', 'frida-h', 'tobalaba']) {
    const v = await srv.ok('GET', `/api/vertical/${screen}`);
    assert.equal(v.screen, screen);
  }
  assert.equal((await srv.call('GET', '/api/vertical/otra')).status, 404);
  const mode = await srv.admin.post('/api/vertical/kennedy/mode', { mode: (await srv.ok('GET', '/api/vertical/kennedy')).mode });
  assert.equal(mode.screen, 'kennedy');
});

test('enlaces cortos y QR', async () => {
  const r = await fetch(`${srv.url}/vk?diag=1`, { redirect: 'manual' });
  assert.ok([301, 302, 307, 308].includes(r.status));
  assert.match(r.headers.get('location'), /vertical\/kennedy.*diag=1|diag=1.*vertical\/kennedy/);
  const qr = await fetch(`${srv.url}/api/qr?text=${encodeURIComponent('https://ejemplo.cl/#/jugar')}`);
  assert.equal(qr.status, 200);
  const page = await fetch(`${srv.url}/`);
  assert.match(await page.text(), /<script src="core\/router.js/);
});
