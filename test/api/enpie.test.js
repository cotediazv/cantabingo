// «El último en pie» (versión de prueba): preguntas desde el celular, vidas, corte de ronda y respuesta oculta.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('../helpers');

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.stop(); });

test('El último en pie: pregunta, respuestas, vidas y corte de la ronda', async () => {
  const { sid } = await srv.openRoom({ theme: 'frida', count: 20 });
  const a = await srv.join(sid, 'ANA', 'UNO');
  const b = await srv.join(sid, 'BETO', 'DOS');
  const host = (action) => srv.admin.post('/api/enpie/host', { action });
  let st = await host('new');
  assert.equal(st.phase, 'lobby');
  assert.equal((await srv.ok('GET', '/api/stage')).show, 'enpie');
  const rev0 = (await srv.ok('GET', `/api/sessions/${sid}/state`)).enpieRev;
  for (let i = 1; i <= 4; i++) {
    st = await host('next'); // abre la pregunta
    assert.equal(st.phase, 'question');
    const pub = await srv.ok('GET', `/api/enpie?token=${a.token}`);
    assert.equal(pub.q.correct, null); // el público no ve la respuesta antes de cerrar
    assert.equal((await srv.call('POST', '/api/enpie/answer', { sid, token: 'nadie', pick: 0 })).status, 403);
    await srv.ok('POST', '/api/enpie/answer', { sid, token: a.token, pick: st.q.correct }); // Ana acierta
    await srv.ok('POST', '/api/enpie/answer', { sid, token: b.token, pick: (st.q.correct + 1) % 3 }); // Beto falla
    assert.equal((await srv.call('POST', '/api/enpie/answer', { sid, token: a.token, pick: 0 })).status, 409); // una vez por pregunta
    st = await host('next'); // la cierra
    assert.equal(st.phase, 'reveal');
  }
  assert.equal(st.cutDue, true);
  const me = (t) => srv.ok('GET', `/api/enpie?token=${t}`).then((r) => r.me);
  assert.equal((await me(a.token)).lives, 3);
  assert.equal((await me(b.token)).up, false); // 3 fallos: a la banca
  st = await host('next');
  assert.equal(st.phase, 'cut');
  assert.equal(st.cut.standing, 1);
  assert.equal(st.cut.bench, 1);
  assert.ok((await srv.ok('GET', `/api/sessions/${sid}/state`)).enpieRev > rev0); // los celulares se enteran
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
});
