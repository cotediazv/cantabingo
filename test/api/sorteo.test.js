// Sorteo de concursantes (para El Rosco) y desempate del bingo.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv; let sid; let ana; let luis; let pedro; const lives = [];
before(async () => {
  srv = await startServer();
  ({ sid } = await srv.openRoom({ count: 30 }));
  ana = await srv.join(sid, 'ANA', 'PRUEBA');
  luis = await srv.join(sid, 'LUIS', 'PRUEBA');
  pedro = await srv.join(sid, 'PEDRO', 'PRUEBA');
  // Solo entran al sorteo los conectados: ANA y LUIS tienen el celular abierto, PEDRO no
  for (const p of [ana, luis]) { const l = srv.sse(`/api/sessions/${sid}/events?token=${p.token}`); await l.next(); lives.push(l); }
});
after(async () => { for (const l of lives) await l.close(); await srv.stop(); });

test('sorteo de concursantes: solo conectados, corregir nombre, quitar y reiniciar', async () => {
  const people = await srv.admin.get('/api/people');
  assert.deepEqual(people.names, ['ANA PRUEBA', 'LUIS PRUEBA', 'PEDRO PRUEBA']);
  assert.deepEqual(people.connected, ['ANA PRUEBA', 'LUIS PRUEBA']);
  assert.equal((await srv.ok('GET', '/api/raffle')).pool, 2);

  const { winner, picked } = await srv.admin.post('/api/raffle/draw');
  assert.ok(['ANA PRUEBA', 'LUIS PRUEBA'].includes(winner));
  assert.deepEqual(picked, [winner]);
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'sorteo');
  const pub = await srv.ok('GET', '/api/raffle');
  assert.equal(pub.roll.winner, winner);
  assert.ok(pub.roll.names.includes(winner));
  assert.equal((await srv.admin.call('POST', '/api/raffle/draw')).status, 400); // la tómbola sigue girando

  await srv.admin.post('/api/people/rename', { from: winner, to: 'nombre corregido' });
  assert.deepEqual((await srv.ok('GET', '/api/raffle')).picked, ['NOMBRE CORREGIDO']);
  assert.deepEqual(await srv.admin.post('/api/raffle/remove', { name: 'NOMBRE CORREGIDO' }), { picked: [] });
  await srv.admin.post('/api/people/remove', { name: 'PEDRO PRUEBA' });
  assert.equal((await srv.admin.get('/api/people')).names.length, 2);
  await srv.admin.post('/api/raffle/reset');
  assert.deepEqual((await srv.ok('GET', '/api/raffle')).picked, []);
});

test('desempate del bingo: con dos ganadores, la tómbola elige uno y solo ese queda confirmado', async () => {
  await srv.admin.post('/api/stage', { show: 'bingo' });
  for (let i = 0; i < 75; i++) {
    if (i === 8) await srv.admin.post(`/api/sessions/${sid}/host/publico`); // «Anda al público» después de 8 números
    await srv.admin.post(`/api/sessions/${sid}/host/draw`, {});
  }
  const st = await lives[0].next((m) => m.results.length >= 2);
  assert.ok(st.celebrate);
  assert.equal((await srv.admin.call('POST', `/api/sessions/${sid}/host/confirmwin`)).status, 400); // empate sin desempatar
  const { winner } = await srv.admin.post('/api/raffle/tiebreak', { sid });
  assert.ok(['ANA PRUEBA', 'NOMBRE CORREGIDO', 'LUIS PRUEBA'].includes(winner));
  assert.equal((await srv.ok('GET', '/api/raffle')).mode, 'tie');
  await srv.admin.post(`/api/sessions/${sid}/host/confirmwin`);
  const final = await lives[0].next((m) => m.winConfirmed);
  assert.equal(final.results.length, 1);
  assert.equal(final.results[0].name, winner);
});
