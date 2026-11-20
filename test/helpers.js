// Ayudas para las pruebas: levanta el servidor real (node server.js) en un puerto libre, con datos
// temporales y claves de prueba, y ofrece atajos para llamar a la API como moderador, participante o equipo.
// Las pruebas miran el sistema desde afuera, así siguen sirviendo aunque se reordene el código por dentro.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const ROOT = path.join(__dirname, '..');
const ADMIN = { user: 'mod', pass: 'clave-prueba' };

const freePort = () => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  srv.on('error', reject);
});

// Arranca un servidor. `data` permite partir con datos guardados (como si ya hubiera una jornada).
async function startServer({ env = {}, data, port: fixedPort } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krb-prueba-'));
  const dataFile = path.join(dir, 'data.json');
  if (data) fs.writeFileSync(dataFile, JSON.stringify(data));
  const port = fixedPort || await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, ADMIN_USER: ADMIN.user, ADMIN_PASS: ADMIN.pass, KARAOKE_CLAVE: '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`El servidor no arrancó:\n${log}`)), 15000);
    const check = () => { if (log.includes('listo en')) { clearTimeout(t); resolve(); } };
    child.stdout.on('data', check);
    child.on('exit', (code) => { clearTimeout(t); reject(new Error(`El servidor se cerró (${code}):\n${log}`)); });
  });
  const url = `http://localhost:${port}`;
  let adminToken = '';

  // Llamada a la API. Devuelve { status, body }; no lanza error con respuestas 4xx.
  async function call(method, p, body, { admin = false, staff = '', headers = {} } = {}) {
    const h = { 'content-type': 'application/json', ...headers };
    if (admin) h['x-admin'] = adminToken;
    if (staff) h['x-staff'] = staff;
    const r = await fetch(url + p, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: r.status, body: json };
  }
  // Atajo: falla si la respuesta no es 2xx
  async function ok(method, p, body, opts) {
    const r = await call(method, p, body, opts);
    if (r.status >= 300) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  }
  const admin = {
    get: (p) => ok('GET', p, undefined, { admin: true }),
    post: (p, b = {}) => ok('POST', p, b, { admin: true }),
    del: (p) => ok('DELETE', p, undefined, { admin: true }),
    call: (m, p, b) => call(m, p, b, { admin: true }),
  };
  adminToken = (await ok('POST', '/api/login', ADMIN)).token;

  // Lee los mensajes de un flujo SSE. Devuelve { messages, next(pred, ms), close() }.
  function sse(p) {
    const ctrl = new AbortController();
    const messages = [];
    const waiters = [];
    const done = (async () => {
      try {
        const r = await fetch(url + p, { signal: ctrl.signal });
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done: end } = await reader.read();
          if (end) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const data = chunk.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
            if (!data) continue;
            const msg = JSON.parse(data);
            messages.push(msg);
            for (const w of [...waiters]) if (w.pred(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
          }
        }
      } catch { /* cerrado */ }
    })();
    return {
      messages,
      next(pred = () => true, ms = 4000) {
        return new Promise((resolve, reject) => {
          const w = { pred, resolve: (m) => { clearTimeout(t); resolve(m); } };
          const t = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`Sin mensaje SSE esperado en ${p}`)); }, ms);
          waiters.push(w);
        });
      },
      close: () => { ctrl.abort(); return done; },
    };
  }

  // Crea un bingo de prueba con su sala y devuelve { project, sid }
  async function openRoom({ theme = 'kennedy', count = 50, ...rest } = {}) {
    const project = await admin.post('/api/projects', { name: 'Prueba', theme, count, ...rest });
    const { id: sid } = await admin.post(`/api/projects/${project.id}/session`, { theme });
    return { project, sid };
  }
  // Un participante entra a la sala; devuelve la respuesta de /join (token, cartones…)
  const join = (sid, name = 'ANA', surname = 'PRUEBA', extra = {}) => ok('POST', `/api/sessions/${sid}/join`, { name, surname, ...extra });

  // Detiene el servidor (que guarda todo al salir). Devuelve los datos con que quedó.
  async function stop() {
    if (child.exitCode == null) {
      const exited = new Promise((r) => child.once('exit', r));
      child.kill('SIGTERM');
      await exited;
    }
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(dataFile, 'utf8')); } catch { /* sin datos */ }
    fs.rmSync(dir, { recursive: true, force: true });
    return saved;
  }
  return { url, port, dataFile, call, ok, admin, sse, openRoom, join, stop, log: () => log, adminToken: () => adminToken };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { startServer, sleep, ADMIN, ROOT };
