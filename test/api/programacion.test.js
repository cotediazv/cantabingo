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
  assert.match(txt, /Vier 04 - Noche de juegos \+ Especial 80s \(Marcelo Durán\)/);
  assert.doesNotMatch(txt, /bingo/i);
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

test('turnos extra entre paréntesis: el monto va a mano y sin él no se envía', async () => {
  const srv = await startServer({ env: { PROG_GLOSA_TEST_URL: 'http://127.0.0.1:9/no-hay' } });
  srvs.push(srv);
  const j = (m, p, b, t) => fetch(srv.url + p, { method: m, headers: { 'Content-Type': 'application/json', 'x-prog': t || '' }, body: b ? JSON.stringify(b) : undefined });
  const tok = (await (await j('POST', '/api/prog/login', ADMIN)).json()).token;
  // «Caro (Guille)» en la cámara en vivo y «Priss (Kony)» de cantante: los dos entre paréntesis quedan como turno extra
  const c = (await (await j('POST', '/api/prog/celda', { fecha: '2026-12-04', local: 'TOB', celda: { show: { tipo: 'otro', nombre: 'Especial' }, camH: 'Caro (Guille)', cantante: 'Priss (Kony)' } }, tok)).json()).celda;
  assert.equal(c.camHx, 'Guille'); assert.equal(c.cantantex, 'Kony');
  // una tarifa general de cámara no se usa para el turno extra
  await j('POST', '/api/prog/tarifas', { tarifas: [{ persona: '*', rol: 'cam', local: '*', dia: '*', monto: 1000 }] }, tok);
  const r = await (await j('GET', '/api/prog/revisar?m=2026-12', null, tok)).json();
  assert.ok(r.avisos.some((a) => /Falta el monto de Guille \(turno extra/.test(a.texto)), JSON.stringify(r.avisos));
  assert.ok(r.avisos.some((a) => /Falta el monto de Kony/.test(a.texto)));
  const e = await j('POST', '/api/prog/glosa/enviar', { mes: '2026-12' }, tok);
  assert.equal(e.status, 409);
  const ej = await e.json();
  assert.deepEqual(ej.faltanExtras.map((x) => [x.fecha, x.local, x.rol, x.nombre]).sort(), [['2026-12-04', 'TOB', 'camHx', 'Guille'], ['2026-12-04', 'TOB', 'cantantex', 'Kony']]);
  // con los montos a mano ya no se detiene
  await j('POST', '/api/prog/celda', { fecha: '2026-12-04', local: 'TOB', celda: { ...c, montos: { camHx: 1, cantantex: 2 } } }, tok);
  const r2 = await (await j('GET', '/api/prog/revisar?m=2026-12', null, tok)).json();
  assert.ok(!r2.avisos.some((a) => /turno extra/.test(a.texto)));
  assert.notEqual((await j('POST', '/api/prog/glosa/enviar', { mes: '2026-12' }, tok)).status, 409);
});

test('Noche de juegos en Tobalaba y Tarde de juegos en Frida (Cote, 28 nov): nada escribe «Bingo» solo', async () => {
  const srv = await startServer();
  srvs.push(srv);
  const j = (m, p, b, t) => fetch(srv.url + p, { method: m, headers: { 'Content-Type': 'application/json', 'x-prog': t || '' }, body: b ? JSON.stringify(b) : undefined });
  const tok = (await (await j('POST', '/api/prog/login', ADMIN)).json()).token;
  await j('POST', '/api/prog/celda', { fecha: '2026-12-04', local: 'TOB', celda: { show: { tipo: 'otro', nombre: 'Especial Rock' }, editor: 'Vero' } }, tok);
  await j('POST', '/api/prog/celda', { fecha: '2026-12-06', local: 'FRIDA', celda: { show: { tipo: 'bingo' }, editor: 'Meni' } }, tok);
  await j('POST', '/api/prog/celda', { fecha: '2026-12-03', local: 'MK', celda: { show: { tipo: 'bingo' } } }, tok);
  const c = await (await j('GET', '/api/prog/cartelera?m=2026-12')).json();
  assert.equal(c.locales.find((l) => l.local === 'TOB').dias[0].cartelera, 'Noche de juegos + Especial Rock');
  assert.equal(c.locales.find((l) => l.local === 'MK').dias[0].cartelera, 'Noche de juegos');
  assert.equal(c.locales.find((l) => l.local === 'FRIDA').dias[0].cartelera, 'Tarde de juegos');
  const a = await (await j('GET', '/api/prog/archivos?m=2026-12', null, tok)).json();
  assert.match(a.cartelera, /Dom 6 - Tarde de juegos/);
  assert.match(a.camaras, /Frida Tarde de juegos: Meni/);
  assert.ok(a.filas.some((f) => f[1] === 'FRIDA' && f[2] === 'SHOW' && f[3] === 'Tarde de juegos'));
  assert.ok(a.filas.some((f) => f[1] === 'MK' && f[2] === 'SHOW' && f[3] === 'Noche de juegos'));
  assert.doesNotMatch(JSON.stringify(a.filas), /los juegos de/i);
  assert.doesNotMatch(a.cartelera + a.camaras + a.entretencion + a.turnos, /bingo/i);
});
