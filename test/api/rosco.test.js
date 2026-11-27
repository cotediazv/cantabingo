// El Rosco y la Trivia del Rosco (el público responde desde el celular con 3 alternativas).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv; let sid; let ana; let luis;
before(async () => {
  srv = await startServer();
  ({ sid } = await srv.openRoom());
  ana = await srv.join(sid, 'ANA', 'PRUEBA');
  luis = await srv.join(sid, 'LUIS', 'PRUEBA');
});
after(async () => { await srv.stop(); });

const act = (id, action, b = {}) => srv.admin.post(`/api/wheels/${id}/act`, { action, ...b });

test('rosco: preguntas del banco, la respuesta no sale al público, prioridad en pantalla y ganador', async () => {
  assert.equal((await srv.admin.call('POST', '/api/wheels', { letters: 'ABC' })).status, 400);
  const { id } = await srv.admin.post('/api/wheels', { players: ['ana', 'beto'], letters: 'ABCDE', seconds: 60 });
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'rueda');
  assert.equal((await srv.call('GET', `/api/wheels/${id}`)).status, 401);
  const full = await srv.admin.get(`/api/wheels/${id}`);
  assert.equal(full.questions.length, 2);
  assert.deepEqual(full.letters, ['A', 'B', 'C', 'D', 'E']);
  assert.ok(full.questions[0].every((x) => x.q && x.a));
  assert.deepEqual((await srv.ok('GET', '/api/wheel-current')).wheels.map((w) => w.id), [id]);

  const live = srv.sse(`/api/wheels/${id}/events`);
  const first = await live.next();
  assert.equal(first.question, '');
  assert.equal(first.players[0].name, 'ANA');

  // El público responde la pregunta en juego
  await act(id, 'start');
  const st = await live.next((m) => m.question);
  assert.equal(st.crowdSolved['0:0'], undefined); // la respuesta solo se conoce al resolverse la letra
  assert.equal(st.crowd.options.length, 3);
  assert.ok(st.crowd.options.includes(full.questions[0][0].a));
  const answer = { sid, token: ana.token, key: st.crowd.key, choice: full.questions[0][0].a };
  assert.deepEqual(await srv.ok('POST', `/api/wheels/${id}/crowd`, answer), { ok: true, correct: true });
  assert.equal((await srv.call('POST', `/api/wheels/${id}/crowd`, answer)).status, 409);
  assert.equal((await srv.call('POST', `/api/wheels/${id}/crowd`, { ...answer, token: 'extraño' })).status, 403);
  const wrong = st.crowd.options.find((o) => o !== full.questions[0][0].a);
  assert.deepEqual(await srv.ok('POST', `/api/wheels/${id}/crowd`, { ...answer, token: luis.token, choice: wrong }), { ok: true, correct: false });

  // Con el rosco en juego, la pantalla no se puede cambiar
  assert.equal((await srv.admin.call('POST', '/api/stage', { show: 'bingo' })).status, 409);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'rueda');

  // ANA acierta las 5 letras → gana con rosco completo. Ya no hay «Aceptar ganador» (Cote, 27 nov): queda
  // aceptado solo y parte la celebración (momento de las luces al tiro)
  const { seq } = await srv.ok('GET', '/api/momentos');
  for (let i = 0; i < 5; i++) await act(id, 'hit');
  const won = await live.next((m) => m.winner);
  assert.equal(won.winner.name, 'ANA');
  assert.equal(won.winner.full, true);
  assert.equal(won.winAccepted, true);
  const moms = (await srv.ok('GET', `/api/momentos?desde=${seq}`)).momentos.map((x) => x.nombre || x.name);
  assert.equal(moms.filter((x) => x === 'rosko_ganador').length, 1);
  assert.equal(won.crowdSolved['0:0'], full.questions[0][0].a);
  await live.close();

  // Trivia: puntaje y ranking
  const me = await srv.ok('GET', `/api/wheels/${id}/crowd?sid=${sid}&token=${ana.token}`);
  assert.equal(me.me.rank, 1);
  assert.ok(me.me.score >= 40);
  assert.equal(me.mine[st.crowd.key].ok, true);
  const rk = await srv.ok('GET', `/api/wheels/${id}/ranking`);
  assert.equal(rk.players, 2);
  assert.equal(rk.list[0].name, 'ANA PRUEBA');
  assert.deepEqual(rk.people.sort(), ['ANA PRUEBA', 'LUIS PRUEBA']);
  await act(id, 'rank');
  assert.equal((await srv.admin.get(`/api/wheels/${id}`)).rank[0].name, 'ANA PRUEBA');
  // Ganador de la Trivia: el ranking se recoge para que se vea la tómbola, y el ganador queda 6 s después de detenerse
  await act(id, 'crowdwin');
  const cw = await srv.admin.get(`/api/wheels/${id}`);
  assert.equal(cw.rank, null);
  assert.equal(cw.crowdWinner.name, 'ANA PRUEBA');
  assert.equal(cw.crowdWinner.holdMs, 6000);

  // Terminó la partida: la pantalla vuelve a obedecer
  assert.deepEqual(await srv.admin.post('/api/stage', { show: 'bingo' }), { show: 'bingo' });
  await srv.admin.del(`/api/wheels/${id}`);
});

test('rosco: fallo pasa el turno, deshacer, empate y desempate por sorteo', async () => {
  const { id } = await srv.admin.post('/api/wheels', { players: ['ana', 'beto'], letters: 'ABCDE', seconds: 60 });
  await act(id, 'start');
  await act(id, 'miss');
  let w = await srv.admin.get(`/api/wheels/${id}`);
  assert.equal(w.turn, 1);
  assert.equal(w.players[0].status[0], 'miss');
  assert.equal(w.canUndo, true);
  await act(id, 'undo');
  w = await srv.admin.get(`/api/wheels/${id}`);
  assert.equal(w.turn, 0);
  assert.equal(w.players[0].status[0], 'pending');
  // «Un paso atrás» tras una Correcta por error (Cote, 27 nov): vuelve a la letra con el tiempo pausado
  await act(id, 'start');
  await act(id, 'hit');
  assert.ok((await srv.admin.get(`/api/wheels/${id}`)).runningSince); // con Correcta el reloj sigue
  await act(id, 'undo');
  w = await srv.admin.get(`/api/wheels/${id}`);
  assert.equal(w.runningSince, null);
  assert.equal(w.players[0].status[0], 'pending');
  assert.equal(w.players[0].current, 0);
  // Los dos fallan todo → empate. Cada 2 rondas hay que desplegar el ranking de la Trivia antes de seguir
  let rankings = 0;
  for (let i = 0; i < 10; i++) {
    if ((await srv.admin.get(`/api/wheels/${id}`)).rankDue) {
      const r = await srv.admin.call('POST', `/api/wheels/${id}/act`, { action: 'start' });
      assert.equal(r.status, 400); // sin ranking no se puede iniciar la pregunta
      await act(id, 'rank'); rankings++;
    }
    await act(id, 'start'); await act(id, 'miss'); // el turno se alterna solo
  }
  assert.ok(rankings >= 1);
  w = await srv.admin.get(`/api/wheels/${id}`);
  assert.equal(w.finished, true);
  assert.deepEqual(w.tie && w.tie.names, ['ANA', 'BETO']);
  await srv.admin.post(`/api/wheels/${id}/tiebreak`);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'sorteo');
  assert.equal((await srv.admin.get(`/api/wheels/${id}`)).winAccepted, false); // mientras gira la tómbola, todavía no
  const r = await srv.ok('GET', '/api/raffle');
  assert.equal(r.mode, 'tie');
  assert.ok(['ANA', 'BETO'].includes(r.roll.winner));
  await srv.admin.post(`/api/wheels/${id}/newquestions`);
  w = await srv.admin.get(`/api/wheels/${id}`);
  assert.ok(w.players.every((c) => c.status.every((x) => x === 'pending')));
  await srv.admin.del(`/api/wheels/${id}`);
});
