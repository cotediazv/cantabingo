// Video «semilla» de una pantalla (orden de Cote por Code 0, 28 nov, 15:30: la cartelera vertical de Kennedy «ya caducó»,
// que la nueva se vea «desde ya» sin que nadie tenga que subirla): un video que viene en el repositorio se instala UNA vez
// como video de esa pantalla, igual que una subida normal; no cambia el modo; si después se sube otro a mano, manda ese.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { startServer } = require('../helpers');

const srvs = [];
after(async () => { for (const s of srvs) await s.stop(); });

test('video semilla: se instala una vez, el decodificador lo toma y uno subido después manda', async () => {
  const semillas = fs.mkdtempSync(path.join(os.tmpdir(), 'krb-semillas-'));
  const bytes = Buffer.from('video-de-prueba-cartelera-kennedy');
  fs.writeFileSync(path.join(semillas, 'vertical-kennedy-cartelera1.mp4'), bytes);
  fs.writeFileSync(path.join(semillas, 'vertical-no-existe-x.mp4'), 'nada'); // una pantalla que no existe: se ignora
  const data = { projects: {}, sessions: {}, vertical: { kennedy: { video: 111, size: 5, mode: 'video' }, frida: { video: 222, size: 7, mode: 'auto' } } };
  let srv = await startServer({ data, env: { SEMILLAS_DIR: semillas } });
  srvs.push(srv);
  let k = await srv.ok('GET', '/api/vertical/kennedy');
  assert.ok(k.video > 111); assert.equal(k.size, bytes.length); assert.equal(k.mode, 'video'); // versión nueva, modo igual
  const res = await fetch(`${srv.url}/vertical/kennedy.mp4?v=${k.video}`);
  assert.equal(res.status, 200);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
  // Se sube otro video a mano: manda ese y, al reiniciar, la semilla no se vuelve a instalar
  const otro = Buffer.from('otro-video-subido-por-cote');
  const up = await fetch(`${srv.url}/api/vertical/kennedy/video`, { method: 'POST', headers: { 'x-admin': srv.adminToken(), 'content-type': 'video/mp4' }, body: otro });
  assert.equal(up.status, 200);
  const subido = (await srv.ok('GET', '/api/vertical/kennedy')).video;
  const guardado = await srv.stop();
  srvs.pop();
  assert.equal(guardado.vertical.kennedy.semilla, 'kennedy-cartelera1');
  assert.deepEqual(guardado.vertical.frida, { video: 222, size: 7, mode: 'auto' }); // las otras pantallas no se tocan
  srv = await startServer({ data: guardado, env: { SEMILLAS_DIR: semillas } });
  srvs.push(srv);
  // (cada servidor de prueba usa una carpeta de datos nueva: se mira lo guardado)
  const g2 = await srv.stop();
  srvs.pop();
  assert.equal(g2.vertical.kennedy.video, subido); assert.equal(g2.vertical.kennedy.size, otro.length);
  // Una semilla nueva (otra marca) sí se instala
  fs.writeFileSync(path.join(semillas, 'vertical-kennedy-cartelera2.mp4'), Buffer.from('semilla-dos'));
  srv = await startServer({ data: g2, env: { SEMILLAS_DIR: semillas } });
  srvs.push(srv);
  k = await srv.ok('GET', '/api/vertical/kennedy');
  assert.ok(k.video > subido); assert.equal(k.size, 'semilla-dos'.length);
});
