// Núcleo: acceso del moderador y del equipo, bingo (sala, unirse, sacar, marcar, ganar), escenario y sorteo de juegos.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, sleep } = require('../helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); });

test('login: clave mala da 401, buena da token; rutas de moderador piden token', async () => {
  const bad = await srv.call('POST', '/api/login', { user: 'mod', pass: 'mala' });
  assert.equal(bad.status, 401);
  assert.equal((await srv.call('GET', '/api/projects')).status, 401);
  assert.equal((await srv.call('GET', '/api/me')).body.admin, false);
  assert.equal((await srv.admin.call('GET', '/api/me')).body.admin, true);
});

test('clave del equipo: el moderador la pone y el equipo entra solo a su local', async () => {
  assert.equal((await srv.call('POST', '/api/staff/login', { local: 'kennedy', clave: 'abcd' })).status, 503);
  assert.equal((await srv.admin.call('POST', '/api/staff/clave', { local: 'kennedy', clave: 'ab' })).status, 400);
  await srv.admin.post('/api/staff/clave', { local: 'kennedy', clave: 'equipo-k' });
  assert.equal((await srv.call('POST', '/api/staff/login', { local: 'kennedy', clave: 'mala' })).status, 401);
  const { token, venue } = await srv.ok('POST', '/api/staff/login', { local: 'kennedy', clave: 'equipo-k' });
  assert.equal(venue, 'kennedy');
  assert.equal((await srv.call('GET', '/api/staff/me', undefined, { staff: token })).body.venue, 'kennedy');
  const cfg = await srv.admin.get('/api/staff/clave');
  assert.deepEqual(cfg, { frida: false, kennedy: true, tobalaba: false });
});

test('bingo completo: sala, unirse, sacar, ganar línea, confirmar y nueva ronda', async () => {
  const { project, sid } = await srv.openRoom({ theme: 'kennedy', count: 30 });
  assert.equal(project.theme, 'kennedy');
  // Una sola sala a la vez
  const p2 = await srv.admin.post('/api/projects', { name: 'Otra', count: 25 });
  assert.equal((await srv.admin.call('POST', `/api/projects/${p2.id}/session`, {})).status, 409);

  const cur = await srv.ok('GET', '/api/current');
  assert.equal(cur.sessions[0].id, sid);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'qr'); // al crear la sala: portada con el QR grande (Cote, 25 nov)

  // Nombre y apellido son obligatorios; se guardan en mayúsculas
  assert.equal((await srv.call('POST', `/api/sessions/${sid}/join`, { name: 'ana', surname: '' })).status, 400);
  const ana = await srv.join(sid, 'ana', 'pérez');
  assert.equal(ana.name, 'ANA PÉREZ');
  assert.equal(ana.cards.length, 1);
  assert.equal(ana.cards[0].cells.length, 25);
  // Con su token recupera el mismo cartón
  const again = await srv.ok('POST', `/api/sessions/${sid}/join`, { token: ana.token });
  assert.equal(again.cards[0].no, ana.cards[0].no);
  const luis = await srv.join(sid, 'luis', 'soto');
  assert.notEqual(luis.cards[0].no, ana.cards[0].no);

  // Ana conectada en vivo (solo gana quien tiene el cartón abierto)
  const live = srv.sse(`/api/sessions/${sid}/events?token=${ana.token}`);
  const first = await live.next();
  assert.equal(first.id, sid);
  assert.equal(first.players, 2);
  assert.equal(first.results.length, 0);

  // No se puede marcar un número que no salió
  const row = ana.cards[0].cells.slice(0, 5);
  assert.equal((await srv.call('POST', `/api/sessions/${sid}/mark`, { token: ana.token, cardNo: ana.cards[0].no, cell: 0, on: true })).status, 409);

  // Salen los 5 números de la primera fila de Ana → gana línea
  for (const v of row) await srv.admin.post(`/api/sessions/${sid}/host/draw`, { value: v });
  assert.equal((await srv.admin.call('POST', `/api/sessions/${sid}/host/draw`, { value: row[0] })).status, 400); // repetido
  const win = await live.next((m) => m.celebrate);
  assert.deepEqual(win.drawn, row);
  assert.equal(win.results[0].cardNo, ana.cards[0].no);
  assert.equal(win.results[0].name, 'ANA PÉREZ');
  assert.equal(win.bigQr, false);

  // El moderador ve la lista completa
  const adm = srv.sse(`/api/sessions/${sid}/events?admin=${encodeURIComponent(srv.adminToken())}`);
  const full = await adm.next();
  assert.equal(full.results[0].pattern, 'linea');
  await adm.close();

  await srv.admin.post(`/api/sessions/${sid}/host/confirmwin`);
  const host = await srv.admin.get(`/api/sessions/${sid}/host`);
  assert.equal(host.roundOver, true);
  assert.equal((await srv.admin.call('POST', `/api/sessions/${sid}/host/draw`, {})).status, 400);

  // Sincronizar marca todo lo que salió
  const synced = await srv.ok('POST', `/api/sessions/${sid}/sync`, { token: ana.token });
  assert.equal(synced.marks[ana.cards[0].no].length, 5);

  await srv.admin.post(`/api/sessions/${sid}/host/restart`, { patterns: ['lleno'] });
  const r2 = await live.next((m) => m.round === 2);
  assert.deepEqual(r2.drawn, []);
  assert.deepEqual(r2.patterns, ['lleno']);
  await live.close();

  // Textos del GC quedan como predeterminados
  await srv.admin.post(`/api/sessions/${sid}/host/gc`, { top: 'Arriba', bottom: 'Abajo' });
  assert.deepEqual((await srv.admin.get(`/api/sessions/${sid}/host`)).gc, { top: 'Arriba', bottom: 'Abajo' });

  // Cerrar la sala
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
  assert.equal((await srv.call('GET', `/api/sessions/${sid}`)).status, 404);
  assert.deepEqual((await srv.ok('GET', '/api/current')).sessions, []);
  await srv.admin.del(`/api/projects/${project.id}`);
  await srv.admin.del(`/api/projects/${p2.id}`);
});

test('escenario: el moderador lo cambia, el QR se retira al sacar un número, y los celulares se enteran', async () => {
  const { project, sid } = await srv.openRoom();
  assert.equal((await srv.admin.call('POST', '/api/stage', { show: 'nada' })).status, 400);
  assert.equal((await srv.call('POST', '/api/stage', { show: 'qr' })).status, 401);
  const live = srv.sse(`/api/sessions/${sid}/events`);
  await live.next();
  await srv.admin.post('/api/stage', { show: 'qr' });
  assert.equal((await live.next((m) => m.stage === 'qr')).stage, 'qr');
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'qr');
  await srv.admin.post(`/api/sessions/${sid}/host/draw`, {});
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'bingo');
  for (const show of ['sorteo', 'karaoke', 'show', 'voto', 'insta', 'juego', 'desafio', 'none', 'bingo']) {
    assert.deepEqual(await srv.admin.post('/api/stage', { show }), { show });
    assert.equal((await srv.ok('GET', '/api/stage')).show, show);
  }
  await live.close();
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
  await srv.admin.del(`/api/projects/${project.id}`);
});

test('sortear juego: total, iniciar, girar, elegir directo, deshacer', async () => {
  const { project, sid } = await srv.openRoom();
  let g = await srv.ok('GET', '/api/gamedraw');
  assert.deepEqual(g.games, ['bingo', 'rosco', 'festival', 'objeto', 'desafio']);
  assert.equal(g.list.length, 0);
  assert.equal((await srv.admin.call('POST', '/api/gamedraw/total', { total: 0 })).status, 400);
  await srv.admin.post('/api/gamedraw/total', { total: 2 });
  g = await srv.admin.post('/api/gamedraw/ready');
  assert.ok(g.ready.pool.length >= 3);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'juego');
  g = await srv.admin.post('/api/gamedraw');
  assert.equal(g.list.length, 1);
  const firstGame = g.list[0];
  assert.ok(!g.ready);
  // El que salió no puede salir en el siguiente sorteo
  g = await srv.admin.post('/api/gamedraw/ready');
  assert.ok(!g.ready.pool.includes(firstGame));
  g = await srv.admin.post('/api/gamedraw/pick', { game: 'festival' });
  assert.deepEqual(g.list, [firstGame, 'festival']);
  assert.equal((await srv.ok('GET', '/api/vote')).mode, 'karaoke'); // el Festival deja lista la votación en modo karaoke
  // El sorteo nunca se bloquea (pedido de Cote, 24 nov): si ya salieron todos, la noche suma un juego más
  g = await srv.admin.post('/api/gamedraw');
  assert.equal(g.list.length, 3);
  assert.ok(g.total > 3);
  g = await srv.admin.post('/api/gamedraw/undo');
  assert.deepEqual(g.list, [firstGame, 'festival']);
  g = await srv.admin.post('/api/gamedraw/undo');
  assert.deepEqual(g.list, [firstGame]);
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
  // Al cerrar la sala, la jornada se reinicia
  g = await srv.ok('GET', '/api/gamedraw');
  assert.deepEqual(g.list, []);
  await srv.admin.del(`/api/projects/${project.id}`);
});

test('el servidor guarda los datos en disco (como mucho 1 vez por segundo)', async () => {
  const fs = require('fs');
  const p = await srv.admin.post('/api/projects', { name: 'Guardado', count: 25 });
  await sleep(1500);
  const saved = JSON.parse(fs.readFileSync(srv.dataFile, 'utf8'));
  assert.ok(saved.projects[p.id]);
  await srv.admin.del(`/api/projects/${p.id}`);
});
