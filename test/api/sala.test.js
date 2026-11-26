// Sala de juegos: cómo se elige el juego (manual, sorteo o votación del público), figura del bingo antes de empezar,
// GC PER, confeti al haber ganador, diseño y dirección de los QR, y las páginas livianas (/cc, /sala, pv.html).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv;
before(async () => { srv = await startServer({ env: { PUB_SIN_PRUEBA: '1' } }); });
after(async () => { await srv.stop(); });
// Una sola sala a la vez: cada prueba cierra la suya
const close = (sid) => srv.admin.post(`/api/sessions/${sid}/host/close`);

test('la sala parte sin bingo: se elige la figura y recién ahí el bingo empezó', async () => {
  const { sid } = await srv.openRoom({ theme: 'frida', count: 20 });
  let st = await srv.ok('GET', `/api/sessions/${sid}/state`);
  assert.equal(st.started, false);
  assert.equal(st.stageDone, false);
  assert.ok('voteGen' in st && 'gameVoteRev' in st && 'roscoId' in st);
  assert.equal(st.current, undefined); // el juego en curso solo va al moderador
  const consola = await srv.admin.get('/api/consola');
  assert.equal(consola.locales.find((l) => l.venue === 'frida').main.stageName, 'QR grande'); // al crear la sala: portada «KRB Stage · Sala de juegos» con el QR (Cote, 25 nov)
  await srv.admin.post(`/api/sessions/${sid}/host/patterns`, { patterns: ['carton'] });
  st = await srv.admin.get(`/api/sessions/${sid}/host/state`);
  assert.equal(st.started, true);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'bingo'); // al elegir la figura, el QR grande da paso al bingo
  assert.deepEqual(st.current, { game: 'bingo' });
  const host = await srv.admin.get(`/api/sessions/${sid}/host`);
  assert.equal(host.started, true);
  assert.equal(host.drawn, 0);
  // Con números sacados la figura ya no se cambia
  await srv.admin.post(`/api/sessions/${sid}/host/draw`, {});
  assert.equal((await srv.admin.call('POST', `/api/sessions/${sid}/host/patterns`, { patterns: ['linea'] })).status, 400);
  await close(sid);
});

test('ganador del bingo: la cortina y después el confeti en el GC del local', async () => {
  const { sid } = await srv.openRoom({ theme: 'kennedy', count: 1 });
  const p = await srv.join(sid);
  const live = srv.sse(`/api/sessions/${sid}/events?token=${p.token}`);
  await live.next();
  const before0 = (await srv.ok('GET', '/api/capa?local=kennedy')).id;
  // «Anda al público» (pedido de Cote, 24 nov): después de 8 números el panel no saca el noveno hasta que el animador lo acepta
  const cells = p.cards[0].cells.filter((x) => x);
  for (const v of cells.slice(0, 8)) await srv.admin.post(`/api/sessions/${sid}/host/draw`, { value: v });
  const stop = await srv.admin.call('POST', `/api/sessions/${sid}/host/draw`, { value: cells[8] });
  assert.equal(stop.status, 409);
  assert.match(stop.body.error, /Anda al público/);
  await srv.admin.post(`/api/sessions/${sid}/host/publico`);
  for (const v of cells.slice(8)) await srv.admin.post(`/api/sessions/${sid}/host/draw`, { value: v });
  await srv.admin.post(`/api/sessions/${sid}/host/confirmwin`);
  // Pedido de Cote (25 nov): antes del ganador final, la cortina; cuando sale, el confeti
  const capa = await srv.ok('GET', '/api/capa?local=kennedy');
  assert.equal(capa.kind, 'cortina');
  assert.ok(capa.id > before0);
  await new Promise((r) => setTimeout(r, 3700));
  assert.equal((await srv.ok('GET', '/api/capa?local=kennedy')).kind, 'confeti');
  await live.close();
  await close(sid);
});

test('elegir el juego: manual, sorteo y votación del público', async () => {
  const { sid } = await srv.openRoom({ theme: 'tobalaba', count: 20 });
  const a = await srv.join(sid, 'ANA', 'UNO');
  // Manual: solo se elige a mano, el sorteo no está permitido
  let g = await srv.admin.post('/api/gamedraw/mode', { how: 'manual' });
  assert.equal(g.how, 'manual');
  assert.equal((await srv.admin.call('POST', '/api/gamedraw', {})).status, 409);
  await srv.admin.post('/api/gamedraw/free', { game: 'objeto' });
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'voto');
  assert.equal((await srv.ok('GET', '/api/vote')).mode, 'objeto');
  // Por votación: presentación, votos desde el celular y cancelar
  await srv.admin.post('/api/gamedraw/mode', { how: 'votacion' });
  assert.equal((await srv.admin.call('POST', '/api/gamedraw/free', { game: 'bingo' })).status, 409);
  let v = await srv.admin.post('/api/gamevote/intro');
  assert.equal(v.phase, 'intro');
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'votojuego');
  v = await srv.admin.post('/api/gamevote/next');
  assert.equal(v.intro.current, 1);
  assert.equal((await srv.call('POST', '/api/gamevote/vote', { sid, token: a.token, game: 'bingo' })).status, 409); // aún cerrada
  v = await srv.admin.post('/api/gamevote/start');
  assert.equal(v.phase, 'voting');
  assert.deepEqual(v.options, ['bingo', 'rosco', 'festival', 'objeto', 'desafio']);
  assert.equal((await srv.call('POST', '/api/gamevote/vote', { sid, token: 'nadie', game: 'bingo' })).status, 403);
  assert.equal((await srv.call('POST', '/api/gamevote/vote', { sid, token: a.token, game: 'karaoke' })).status, 400);
  await srv.ok('POST', '/api/gamevote/vote', { sid, token: a.token, game: 'rosco' });
  v = await srv.ok('GET', `/api/gamevote?sid=${sid}&token=${a.token}`);
  assert.equal(v.mine, 'rosco');
  assert.equal(v.counts.rosco, 1);
  assert.equal((await srv.admin.call('POST', '/api/gamevote/start', {})).status, 409); // ya hay una abierta
  // Cambiar de pestaña cancela la votación y deja el QR en pantalla
  g = await srv.admin.post('/api/gamedraw/mode', { how: 'sorteo' });
  assert.equal(g.how, 'sorteo');
  assert.equal((await srv.ok('GET', '/api/gamevote')).phase, 'idle');
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'qr');
  await close(sid);
});

test('GC PER: sale en las pantallas del local y se apaga al tocar un botón del GC', async () => {
  const { sid } = await srv.openRoom({ theme: 'frida', count: 5 });
  assert.equal((await srv.admin.call('POST', '/api/gcper', { text: '   ' })).status, 400);
  const per = await srv.admin.post('/api/gcper', { text: 'Feliz cumpleaños <b>"Ana"</b>' });
  assert.deepEqual(per, { on: true, text: 'Feliz cumpleaños b "Ana" /b' });
  assert.equal((await srv.ok('GET', '/api/stage')).per.on, true);
  const consola = await srv.admin.get('/api/consola');
  assert.equal(consola.locales.find((l) => l.venue === 'frida').main.stage, 'per');
  await srv.admin.post('/api/stage', { show: 'qr' });
  assert.equal((await srv.ok('GET', '/api/stage')).per.on, false);
  await close(sid);
});

test('diseño de las pantallas y dirección de los QR', async () => {
  assert.deepEqual(await srv.ok('GET', '/api/tema'), { on: true, pub: '' });
  await srv.admin.post('/api/tema', { on: false });
  assert.equal((await srv.ok('GET', '/api/tema')).on, false);
  await srv.admin.post('/api/tema', { on: true });
  assert.equal((await srv.admin.call('POST', '/api/pub', { url: 'https://otro.cl' })).status, 400);
  await srv.admin.post('/api/pub', { url: 'https://saladejuegos.krbstage.cl' });
  assert.equal((await srv.ok('GET', '/api/tema')).pub, 'https://saladejuegos.krbstage.cl');
  await srv.admin.post('/api/pub', { url: '' });
});

test('páginas livianas: /cc, /sala y aviso inmediato', async () => {
  const cc = await fetch(`${srv.url}/cc`, { redirect: 'manual' });
  assert.equal(cc.status, 302);
  assert.equal(cc.headers.get('location'), '/cc.html');
  const sala = await (await fetch(`${srv.url}/sala`)).text();
  assert.ok(sala.includes('manifest-sala.webmanifest'));
  assert.ok(sala.includes('#/master/movil'));
  const live = srv.sse('/api/live');
  await live.next(); // hola
  const next = live.next();
  await srv.admin.post('/api/stage', { show: 'show' });
  assert.equal(await next, 'cambio');
  await live.close();
});
