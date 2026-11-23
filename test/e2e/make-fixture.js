// Arma los datos fijos de las pruebas de pantalla (test/e2e/fixture.json): una jornada con todo en juego a la vez
// (bingo con números, Rosco terminado, sorteo, votación en resultados, El Gran Desafío con respuesta marcada,
// sorteo de juegos), siempre igual, para que las capturas se puedan comparar de una vez a otra.
// Se corre solo cuando cambia la forma de los datos: `node test/e2e/make-fixture.js`.
const fs = require('fs');
const path = require('path');
const { startServer } = require('../helpers');

const FAR = 4102444800000; // año 2100: nada vence durante las pruebas
const T0 = 1795000000000; // fecha fija para lo que guarda hora

(async () => {
  const srv = await startServer();
  const { project, sid } = await srv.openRoom({ theme: 'kennedy', count: 30 });
  const people = [];
  for (const [n, a] of [['Ana', 'Pérez Soto'], ['Luis', 'González'], ['María José', 'Fernández Allende'], ['Pedro', 'Rojas']]) people.push(await srv.join(sid, n, a));
  const lives = [];
  for (const p of people) { const l = srv.sse(`/api/sessions/${sid}/events?token=${p.token}`); await l.next(); lives.push(l); }

  // Bingo: 8 números de la tarjeta de Ana (sin completar línea) y 4 más
  const cells = people[0].cards[0].cells.filter((v) => v);
  for (const v of [cells[0], cells[1], cells[5], cells[6], cells[10], cells[15], cells[20], cells[22]]) await srv.admin.post(`/api/sessions/${sid}/host/draw`, { value: v });

  // Sorteo de concursantes
  await srv.admin.post('/api/raffle/draw');

  // El Rosco: ANA acierta todo y gana
  const { id: wid } = await srv.admin.post('/api/wheels', { players: ['Ana Pérez', 'Luis González'], letters: 'ABCDEFGHIJ', seconds: 120 });
  for (let i = 0; i < 10; i++) { await srv.admin.post(`/api/wheels/${wid}/act`, { action: 'start' }); await srv.admin.post(`/api/wheels/${wid}/act`, { action: 'hit' }); }

  // Votación: El objeto más extraño con 3 participantes, en resultados con el 3.º revelado
  const vh = (action, b = {}) => srv.admin.post('/api/vote/host', { action, ...b });
  await vh('reset');
  let v;
  for (const [name, thing] of [['Carla', 'Una tetera con forma de gato'], ['Diego', 'Un zapato de payaso'], ['Fernanda', 'Un disco de vinilo partido']]) v = await vh('add', { name, thing });
  const notes = [[9, 8, 10], [5, 6, 4], [7, 7, 8]];
  for (const [i, p] of v.players.entries()) {
    await vh('open', { id: p.id });
    for (const [j, x] of notes[i].entries()) await srv.ok('POST', '/api/vote/cast', { sid, token: people[j].token, value: x, id: p.id });
    await vh('close');
  }
  await vh('results');
  await vh('reveal');

  // El Gran Desafío: pregunta 4 con el 50:50 usado y la respuesta marcada
  const dh = (action, b = {}) => srv.admin.post('/api/desafio/host', { action, ...b });
  await dh('new', { player: 'Camila Rojas Valenzuela', safe: [5] });
  await dh('next');
  for (let i = 0; i < 3; i++) { const st = await srv.admin.get('/api/desafio/host'); await dh('lock', { choice: st.answer }); await dh('reveal'); await dh('next'); }
  let d = await dh('fifty');
  d = await dh('lock', { choice: [0, 1, 2, 3].find((i) => !d.hidden.includes(i) && i !== d.answer) });

  // Sorteo de juegos: uno ya sorteado
  await srv.admin.post('/api/gamedraw/total', { total: 3 });
  await srv.admin.post('/api/gamedraw/pick', { game: 'rosco' });

  await srv.admin.post('/api/insta/config', { handles: { kennedy: 'krbstage', frida: 'krbstage', tobalaba: 'krbstage' } });
  await srv.admin.post('/api/stage', { show: 'bingo' });

  for (const l of lives) await l.close();
  const data = await srv.stop();

  // Fechas fijas
  const s = data.sessions[sid];
  s.created = T0; s.expires = FAR; s.celebrateAt = 0;
  data.projects[project.id].created = T0;
  data.wheels[wid].created = FAR - 1; data.wheels[wid].wonAt = T0; data.wheels[wid].history = [];
  delete data.wheels[wid].reveal; delete data.wheels[wid].flash;
  if (data.raffle.roll) data.raffle.roll.at = T0;
  for (const k of Object.keys(data.people || {})) data.people[k].at = T0;
  if (data.gameDraw.last) data.gameDraw.last.at = T0;
  data.gameDraw.undo = [];
  delete data.staff;
  // Sin planillas ni formularios: las pruebas nunca salen a internet
  data.karaoke.urls = Object.fromEntries(['frida', 'kennedy', 'tobalaba'].map((x) => [x, { exec: '', form: '' }]));
  data.karaoke.tobalabaExec16nov = true;
  data.fixture = { sid, projectId: project.id, wheelId: wid, phone: { token: people[0].token, name: people[0].name } };
  fs.writeFileSync(path.join(__dirname, 'fixture.json'), `${JSON.stringify(data, null, 1)}\n`);
  console.log('Listo: test/e2e/fixture.json', data.fixture);
})().catch((err) => { console.error(err); process.exit(1); });
