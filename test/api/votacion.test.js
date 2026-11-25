// Votación: «El objeto más extraño» (nota del 1 al 10 + gran final) y «El Festival» (concurso de karaoke).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, sleep } = require('../helpers');

let srv; let sid; let people;
before(async () => {
  srv = await startServer({ env: { VOTE_OPEN_MS: '1500' } });
  ({ sid } = await srv.openRoom({ theme: 'tobalaba' }));
  people = [];
  for (const n of ['ANA', 'LUIS', 'PEDRO', 'SOFÍA']) people.push(await srv.join(sid, n, 'PRUEBA'));
});
after(async () => { await srv.stop(); });

const host = (action, b = {}) => srv.admin.post('/api/vote/host', { action, ...b });
const cast = (p, value, id) => srv.call('POST', '/api/vote/cast', { sid, token: p.token, value, id });

test('El objeto más extraño: inscripción, notas, lugares, gran final y ganador', async () => {
  let st = await host('reset');
  assert.equal(st.mode, 'objeto');
  assert.equal(st.title, 'El objeto más extraño');
  // Inscripción desde el celular, solo con la inscripción abierta
  assert.equal((await srv.call('POST', '/api/vote/join', { sid, token: people[0].token, thing: 'Un zapato' })).status, 409);
  await host('signup', { on: true });
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'voto');
  assert.equal((await srv.call('POST', '/api/vote/join', { sid, token: 'nadie', thing: 'X' })).status, 403);
  await srv.ok('POST', '/api/vote/join', { sid, token: people[0].token, thing: 'Un zapato' });
  assert.equal((await srv.call('POST', '/api/vote/join', { sid, token: people[0].token, thing: 'Otro' })).status, 409);
  st = await host('add', { name: 'carla', thing: 'Una tetera' });
  st = await host('add', { name: 'diego' });
  assert.deepEqual(st.players.map((p) => p.name), ['ANA PRUEBA', 'CARLA', 'DIEGO']);
  const [a, c, d] = st.players;
  const mine = await srv.ok('GET', `/api/vote?sid=${sid}&token=${people[0].token}`);
  assert.deepEqual(mine.me, { no: 1, thing: 'Un zapato' });

  // Notas: ANA 9, CARLA 5, DIEGO 7
  assert.equal((await cast(people[1], 5)).status, 409); // nada abierto
  for (const [p, notes] of [[a, [9, 9, 9]], [c, [5, 5, 5]], [d, [7, 7, 7]]]) {
    await host('present', { id: p.id });
    st = await host('open', { id: p.id });
    assert.equal(st.open.id, p.id);
    assert.equal((await cast(people[1], 11)).status, 400);
    for (let i = 0; i < 3; i++) assert.equal((await cast(people[i + 1], notes[i], p.id)).status, 200);
    st = await host('close');
  }
  assert.equal(st.counts[a.id], 3);
  st = await host('results');
  assert.equal(st.phase, 'results');
  assert.equal(st.toReveal, 1);
  assert.equal(st.next.name, 'CARLA');
  st = await host('reveal');
  assert.deepEqual(st.places.map((x) => [x.place, x.name, x.score]), [[3, 'CARLA', 5]]);
  assert.equal((await host('reveal').catch((e) => e.message)).includes('400'), true);

  // Gran final entre ANA y DIEGO: DIEGO recibe más votos
  st = await host('final');
  assert.equal(st.final.open, true);
  assert.equal((await cast(people[0], 'otro')).status, 400);
  await cast(people[0], d.id); await cast(people[1], d.id); await cast(people[2], a.id);
  st = await host('closefinal');
  assert.deepEqual(st.tally, { [a.id]: 1, [d.id]: 2 });
  st = await host('winner');
  assert.equal(st.phase, 'winner');
  assert.equal(st.winner.name, 'DIEGO');
});

test('la votación de cada participante se cierra sola al terminar el tiempo', async () => {
  await host('reset');
  let st = await host('add', { name: 'uno' });
  st = await host('open', { id: st.players[0].id });
  await sleep(1500 + 1000 + 600);
  st = await srv.admin.get('/api/vote/host');
  assert.equal(st.open, null);
  assert.equal(st.players[0].done, true);
});

test('El Festival: inscripción con canción, sorteo de cupos, 5 notas y redoble final', async () => {
  let st = await host('reset');
  st = await host('mode', { mode: 'karaoke' });
  assert.equal(st.mode, 'karaoke');
  assert.equal(st.title, 'El Festival de Tobalaba');
  await host('max', { max: 2 });
  await host('signup', { on: true });
  assert.equal((await srv.call('POST', '/api/vote/join', { sid, token: people[0].token, song: 'x' })).status, 400);
  for (const [i, song] of [[0, 'Gracias a la vida'], [1, 'Te recuerdo Amanda'], [2, 'El baile de los que sobran']]) {
    await srv.ok('POST', '/api/vote/join', { sid, token: people[i].token, song, artist: 'Artista' });
  }
  st = await srv.admin.get('/api/vote/host');
  assert.equal(st.overflow, true);
  assert.match(await host('present').then(() => '', (e) => e.message), /sortea/);
  st = await host('draw');
  assert.equal(st.players.length, 2);
  assert.equal(st.drawn.length, 2);
  for (const p of st.players) {
    await host('open', { id: p.id });
    for (const [i, x] of [[0, 8], [1, 6], [3, 10]]) await cast(people[i], x, p.id);
    st = await host('close');
    assert.equal(st.sample.length, 3);
    assert.ok(st.sample.every((n) => typeof n.name === 'string' && n.note >= 6));
  }
  st = await host('results');
  st = await host('final');
  assert.equal(st.final.drum, true);
  st = await host('winner');
  assert.ok(st.winner.score > 0);
  assert.equal(st.second.dec >= 1, true);
});
