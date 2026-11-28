// Programación KRB (Code 3): la cartelera de solo lectura para Code 2 (orden de Code 0, 28 nov) y el respaldo
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, ADMIN } = require('../helpers');

const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });

test('cartelera de solo lectura: show y artista, nunca personas ni a quién se paga', async () => {
  const srv = await startServer();
  srvs.push(srv);
  const j = (m, p, b, t) => fetch(srv.url + p, { method: m, headers: { 'Content-Type': 'application/json', 'x-prog': t || '' }, body: b ? JSON.stringify(b) : undefined });
  const tok = (await (await j('POST', '/api/prog/login', ADMIN)).json()).token;
  assert.ok(tok);
  await j('POST', '/api/prog/celda', { fecha: '2026-12-04', local: 'TOB', celda: { show: { tipo: 'otro', nombre: 'Especial 80s', artista: 'Marcelo Durán', persona: 'Productora XYZ' }, dj: 'Oscar' } }, tok);
  const r = await j('GET', '/api/prog/cartelera?m=2026-12');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const c = await r.json();
  const tob = c.locales.find((l) => l.local === 'TOB');
  assert.deepEqual(tob.dias.map((d) => [d.fecha, d.show, d.artista]), [['2026-12-04', 'Especial 80s', 'Marcelo Durán']]);
  const txt = await (await j('GET', '/api/prog/cartelera?m=2026-12&formato=texto')).text();
  assert.match(txt, /Vier 04 - BINGO \+ Especial 80s \(Marcelo Durán\)/);
  assert.doesNotMatch(JSON.stringify(c) + txt, /XYZ|Oscar|monto/i);
  // el respaldo sí pide la clave
  assert.equal((await j('GET', '/api/prog/respaldo')).status, 401);
  assert.equal((await j('GET', '/api/prog/respaldo', null, tok)).status, 200);
});

test('revisar turnos: avisos y cambios sin montos, y pide la clave', async () => {
  const srv = await startServer();
  srvs.push(srv);
  const j = (m, p, b, t) => fetch(srv.url + p, { method: m, headers: { 'Content-Type': 'application/json', 'x-prog': t || '' }, body: b ? JSON.stringify(b) : undefined });
  const tok = (await (await j('POST', '/api/prog/login', ADMIN)).json()).token;
  assert.equal((await j('GET', '/api/prog/revisar?m=2026-12')).status, 401);
  // viernes 4 en Tobalaba: show, sin DJ (la semana tipo tiene a Oscar)
  await j('POST', '/api/prog/celda', { fecha: '2026-12-04', local: 'TOB', celda: { show: { tipo: 'otro', nombre: 'Especial 80s' }, cantante: 'Andrés' } }, tok);
  const r = await (await j('GET', '/api/prog/revisar?m=2026-12', null, tok)).json();
  assert.ok(r.avisos.some((a) => a.fecha === '2026-12-04' && a.local === 'TOB' && /Falta DJ/.test(a.texto)));
  assert.ok(r.avisos.some((a) => a.fecha === '2026-12-05' && a.local === 'MK' && /Falta el show/.test(a.texto)));
  assert.equal(r.sinFoto, true);
  // con punto de partida, un cambio sale en palabras
  await j('POST', '/api/prog/glosa/base', { mes: '2026-12' }, tok);
  await j('POST', '/api/prog/celda', { fecha: '2026-12-04', local: 'TOB', celda: { show: { tipo: 'otro', nombre: 'Especial 80s' }, cantante: 'Priss' } }, tok);
  const r2 = await (await j('GET', '/api/prog/revisar?m=2026-12', null, tok)).json();
  assert.ok(r2.cambios.some((c) => /Andr.s → Priss/i.test(c.texto)), JSON.stringify(r2.cambios));
  assert.doesNotMatch(JSON.stringify([r2.avisos, r2.cambios, r2.personas]).replace(/\d{4}-\d{2}-\d{2}/g, ''), /\$|\d{4,}/);
});
