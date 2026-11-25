// ¿Quién quiere ser ganador? (antes «billonario»): escalera de 12 preguntas, comodines, voto del público desde el celular,
// premios y el suplente (pedido de Cote, 25 nov).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, sleep } = require('../helpers');

let srv; let sid; let people;
before(async () => {
  srv = await startServer({ env: { DESAFIO_AUDIENCE_MS: '1200' } });
  ({ sid } = await srv.openRoom());
  people = [];
  for (const n of ['ANA', 'LUIS', 'PEDRO']) people.push(await srv.join(sid, n, 'PRUEBA'));
});
after(async () => { await srv.stop(); });

const h = (action, b = {}) => srv.admin.post('/api/desafio/host', { action, ...b });
const hErr = async (action, b = {}) => (await srv.admin.call('POST', '/api/desafio/host', { action, ...b })).body.error;
const pub = () => srv.ok('GET', '/api/desafio');
// Responde bien la pregunta en juego y pasa a la siguiente
const answerRight = async () => { const st = await srv.admin.get('/api/desafio/host'); await h('lock', { choice: st.answer }); await h('reveal'); return h('next'); };

test('partida con comodines: la respuesta nunca se filtra antes de revelar', async () => {
  assert.equal(await hErr('new', { player: '  ' }), 'Escribe el nombre del participante principal');
  let st = await h('new', { player: 'Camila Rojas', safe: [3, 6] });
  assert.equal(st.phase, 'intro');
  assert.equal(st.player, 'CAMILA ROJAS');
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'desafio');
  st = await h('next');
  assert.equal(st.step, 1);
  assert.equal(st.q.level, 'f');
  assert.equal(st.q.options.length, 4);
  let p = await pub();
  assert.equal(p.correct, null);
  assert.equal(p.answer, undefined);
  assert.equal(await hErr('reveal'), 'Primero marca la respuesta del concursante');

  // 50:50 quita dos incorrectas, una sola vez
  st = await h('fifty');
  assert.equal(st.hidden.length, 2);
  assert.ok(!st.hidden.includes(st.answer));
  assert.equal(await hErr('fifty'), 'El 50:50 no está disponible');

  // Pregunta al público: votan los de la sala, no los extraños ni por opciones ocultas (son las respuestas de la Trivia)
  st = await h('audience');
  const vote = (tok, choice) => srv.call('POST', '/api/desafio/vote', { sid, token: tok, choice });
  for (const x of people) assert.equal((await vote(x.token, st.answer)).status, 200);
  assert.equal((await vote(people[0].token, st.hidden[0])).status, 400);
  assert.equal((await vote('extraño', 0)).status, 403);
  assert.equal((await srv.ok('GET', `/api/desafio?sid=${sid}&token=${people[1].token}`)).mine, st.answer);
  p = await pub();
  assert.equal(p.audience.pct, null); // mientras está abierta no se muestran porcentajes
  await sleep(1200 + 1000 + 500);
  st = await srv.admin.get('/api/desafio/host');
  assert.equal(st.audience.open, false);
  assert.equal(st.audience.pct[st.answer], 100);
  assert.equal((await vote(people[0].token, st.answer)).status, 409); // ya cerró (con el comodín, la pregunta se cierra para el público)

  st = await h('lock', { choice: st.answer });
  assert.equal((await pub()).chosen, st.answer);
  assert.equal((await pub()).correct, null);
  st = await h('reveal');
  p = await pub();
  assert.equal(p.right, true);
  assert.equal(p.correct, st.answer);

  st = await h('next');
  assert.equal(st.step, 2);
  assert.equal(st.audience, null);
  st = await h('phone');
  assert.ok(st.phoneUntil > Date.now());
  const before = st.q.text;
  st = await h('swap');
  assert.notEqual(st.q.text, before);
  assert.equal(st.phoneUntil, 0);
  assert.deepEqual(st.used, { fifty: true, audience: true, phone: true, swap: true });
});

test('premios: pierde bajo el escalón seguro, se retira, gana todo, pierde en la primera', async () => {
  // Pierde en la 5 con seguros en 3 y 6 → se lleva el premio del 3
  await h('new', { player: 'Pierde', safe: [3, 6] });
  await h('next');
  for (let i = 1; i < 5; i++) await answerRight();
  let st = await srv.admin.get('/api/desafio/host');
  assert.equal(st.step, 5);
  await h('lock', { choice: (st.answer + 1) % 4 });
  await h('reveal');
  st = await h('next');
  assert.equal(st.outcome, 'lost');
  assert.equal(st.won, '300 puntos');
  assert.equal(st.correct, st.answer); // al terminar se muestra cuál era

  // Se retira en la 4 → se lleva el de la 3
  await h('new', { player: 'Retira' });
  await h('next');
  for (let i = 1; i < 4; i++) await answerRight();
  st = await h('retire');
  assert.equal(st.outcome, 'retired');
  assert.equal(st.won, '300 puntos');

  // Gana las 12 sin repetir preguntas; la dificultad sube (1 a 4 fácil, 5 a 8 medio, 9 a 12 difícil)
  await h('new', { player: 'Gana', prizes: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', 'Un auto'] });
  await h('next');
  const seen = new Set();
  const levels = [];
  for (let i = 0; i < 12; i++) {
    st = await srv.admin.get('/api/desafio/host');
    seen.add(st.q.text); levels.push(st.q.level);
    st = await answerRight();
  }
  assert.equal(seen.size, 12);
  assert.deepEqual(levels, ['f', 'f', 'f', 'f', 'm', 'm', 'm', 'm', 'd', 'd', 'd', 'd']);
  assert.equal(st.outcome, 'won');
  assert.equal(st.won, 'Un auto');

  // Pierde en la primera → nada
  await h('new', { player: 'Nada' });
  st = await h('next');
  await h('lock', { choice: (st.answer + 1) % 4 });
  await h('unlock');
  await h('lock', { choice: (st.answer + 1) % 4 });
  await h('reveal');
  st = await h('next');
  assert.equal(st.won, '');

  st = await h('reset');
  assert.equal(st.phase, 'setup');
});

// Suplente (pedido de Cote, 25 nov): si el principal pierde, entra el suplente y sigue desde ese escalón con lo ganado
test('suplente: entra cuando pierde el principal, sigue en el mismo escalón y se lleva los premios', async () => {
  assert.equal(await hErr('new', { player: 'Ana', sub: 'ana' }), 'El suplente tiene que ser otra persona');
  let st = await h('new', { player: 'Ana', sub: 'Luis' });
  assert.equal(st.player, 'ANA'); assert.equal(st.sub, 'LUIS'); assert.equal(st.steps, 12);
  await h('next');
  for (let i = 1; i < 4; i++) await answerRight();
  st = await srv.admin.get('/api/desafio/host');
  assert.equal(st.step, 4);
  await h('lock', { choice: (st.answer + 1) % 4 });
  await h('reveal');
  st = await h('next');
  assert.equal(st.phase, 'swap'); // no termina: entra el suplente
  assert.equal(st.outcome, null);
  assert.equal(st.first, 'ANA');
  st = await h('next');
  assert.equal(st.phase, 'question'); assert.equal(st.step, 4); // misma pregunta del escalón, otra pregunta
  assert.equal(st.player, 'LUIS'); assert.equal(st.subIn, true);
  for (let i = 4; i < 6; i++) await answerRight();
  st = await h('retire'); // se retira en la 6: se lleva el premio de la 5, como si él hubiera llegado
  assert.equal(st.outcome, 'retired'); assert.equal(st.won, '1.000 puntos'); assert.equal(st.player, 'LUIS');
  // Si el suplente también pierde, termina
  await h('new', { player: 'Ana', sub: 'Luis' });
  st = await h('next');
  await h('lock', { choice: (st.answer + 1) % 4 }); await h('reveal');
  st = await h('next'); assert.equal(st.phase, 'swap');
  st = await h('next');
  await h('lock', { choice: (st.answer + 1) % 4 }); await h('reveal');
  st = await h('next');
  assert.equal(st.phase, 'end'); assert.equal(st.outcome, 'lost'); assert.equal(st.won, '');
  await h('reset');
});

// La Trivia del Billonario (pedido de Gabriel, 25 nov): el público responde cada pregunta desde el celular
test('Trivia del Billonario: puntos por rapidez al revelar, cierre, 50:50, cambio de pregunta, ranking y ganador', async () => {
  const [ana, luis, pedro] = people;
  const answer = (x, choice, qid) => srv.call('POST', '/api/desafio/answer', { sid, token: x.token, choice, qid });
  const mine = async (x) => srv.ok('GET', `/api/desafio?sid=${sid}&token=${x.token}`);
  let st = await h('new', { player: 'Trivia' });
  assert.equal((await answer(ana, 0)).status, 409); // en la presentación todavía no hay pregunta
  st = await h('next');
  assert.equal(st.crowd.open, true);
  const qid = st.crowd.qid;
  // ANA responde al tiro y bien; LUIS bien pero 2 s después; PEDRO mal
  assert.equal((await answer(ana, st.answer, qid)).status, 200);
  assert.equal((await answer(ana, (st.answer + 1) % 4, qid)).status, 409); // una sola respuesta por pregunta
  await sleep(2000);
  assert.equal((await answer(luis, st.answer, qid)).status, 200);
  assert.equal((await answer(pedro, (st.answer + 1) % 4, qid)).status, 200);
  assert.equal((await answer({ token: 'extraño' }, 0, qid)).status, 403);
  let m = await mine(ana);
  assert.equal(m.mine, st.answer);
  assert.equal(m.mineResult, null); // no se sabe si acertó hasta revelar
  assert.equal(m.me.score, 0);
  assert.equal((await pub()).crowd.answered, 3);
  // Con la respuesta definitiva se cierra
  await h('lock', { choice: st.answer });
  assert.equal((await pub()).crowd.open, false);
  assert.equal((await answer(ana, st.answer, qid)).status, 409);
  await h('reveal');
  m = await mine(ana);
  assert.equal(m.mineResult.ok, true);
  assert.ok(m.mineResult.pts >= 95);
  const luisM = await mine(luis);
  assert.ok(luisM.me.score < m.me.score && luisM.me.score >= 40); // más rápido, más puntos
  assert.equal(m.me.rank, 1);
  assert.equal((await mine(pedro)).mineResult.ok, false);
  assert.deepEqual(m.top.map((x) => x.name), [ana.name, luis.name]);

  // Pregunta 2: con 50:50 la oculta no se puede elegir; al cambiarla, las respuestas a la anterior no suman
  st = await h('next');
  const q2 = st.crowd.qid;
  assert.notEqual(q2, qid);
  st = await h('fifty');
  assert.equal((await answer(luis, st.hidden[0], q2)).status, 400);
  assert.equal((await answer(luis, st.answer, q2)).status, 200);
  st = await h('swap');
  assert.notEqual(st.crowd.qid, q2);
  assert.equal((await answer(luis, st.answer, q2)).status, 409); // era la pregunta anterior
  // Ranking en pantalla
  st = await h('rank', { on: true });
  assert.equal(st.rank.length, 2);
  assert.equal(st.rank[0].name, ana.name);
  assert.equal((await pub()).rankPlayers, 3);
  st = await h('lock', { choice: st.answer });
  await h('reveal');
  st = await h('next'); // la siguiente pregunta recoge el ranking
  assert.equal(st.rank, null);
  assert.equal((await mine(luis)).me.hits, 1); // la respuesta de la pregunta cambiada no sumó

  // El ganador se muestra solo al terminar, con la tómbola
  assert.match(await hErr('crowdwin'), /al terminar/);
  st = await h('retire');
  st = await h('crowdwin');
  assert.equal(st.crowdWinner.name, ana.name);
  assert.ok(st.crowdWinner.roll.includes(luis.name));
  assert.equal(st.crowdWinner.rollMs, 5500);
  assert.match(await hErr('crowdwin'), /ya está en pantalla/);
  // Partida nueva: la Trivia parte de cero; sin puntos no hay ganador
  await h('new', { player: 'Otra' });
  st = await h('next');
  assert.equal((await mine(ana)).me, null);
  await h('retire');
  st = await h('crowdwin');
  assert.equal(st.crowdWinner.none, true);
  await h('reset');
});

// Como los otros juegos: al cerrar la sala (fin de la jornada) la partida queda en blanco, y la pantalla lo sabe
// (stageDone) cuando ya se mostró el ganador de la Trivia
test('¿Quién quiere ser billonario?: al cerrar la sala la partida queda en blanco; con el ganador de la Trivia el juego cuenta como terminado', async () => {
  await h('new', { player: 'Marta' });
  await h('next');
  await h('retire');
  await h('crowdwin');
  assert.equal((await srv.admin.get(`/api/sessions/${sid}/host/state`)).stageDone, true);
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
  const st = await pub();
  assert.equal(st.phase, 'setup');
  assert.equal(st.player, '');
  assert.equal(st.crowdWinner, null);
});
