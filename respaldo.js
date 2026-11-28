// Respaldo diario de los datos (propuesta de Code 1 aprobada por Code 0, 28 nov: capas A y C; la B, Google Drive, queda
// lista pero apagada hasta que Cote ponga RESPALDO_URL y RESPALDO_CLAVE en Render).
// A) Todos los días a las 05:00 (hora de Chile; si el servicio estaba reiniciándose, apenas vuelve, hasta las 11:00) se
//    guarda en el mismo disco, en <carpeta de los datos>/respaldos/, un archivo comprimido con data.json, clientes.json y
//    programacion.json (este último solo se lee: es de Code 3). Quedan los últimos 14 días; los más viejos se borran solos.
//    Si el disco tiene menos de 150 MB libres (o el respaldo no cabe dejando ese margen), no se respalda y se avisa.
// B) Si en Render están RESPALDO_URL y RESPALDO_CLAVE, la misma copia se manda al Apps Script de Cote, que la guarda en su
//    Google Drive (apps-script/Respaldo.gs). Sin esas variables no se manda nada.
// C) Centro de control: estado del último respaldo, «Respaldar ahora» y «⬇ Bajar respaldo ahora» (solo el moderador).
// No hay botón de restaurar (a propósito): se recupera a mano, eligiendo una copia.
// Los videos de las pantallas no van (pesan mucho y Cote tiene los originales).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const gzip = promisify(zlib.gzip);

const KEEP = 14; // días que quedan en el disco
const MIN_FREE = (Number(process.env.RESPALDO_MIN_LIBRE_MB) || 150) * 1024 * 1024; // espacio libre mínimo que se respeta en el disco (la variable es solo para las pruebas)
const HOUR = 5; // 05:00, hora de Chile: no hay eventos a esa hora
const chile = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .formatToParts(d).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]));

module.exports = function respaldo({ app, db, save, requireAdmin, dataFile, reloj = () => new Date() }) {
  const dir = path.dirname(dataFile);
  const folder = path.join(dir, 'respaldos');
  const files = () => [
    ['data.json', dataFile],
    ['clientes.json', path.join(dir, 'clientes.json')],
    ['programacion.json', process.env.PROG_FILE || path.join(dir, 'programacion.json')], // solo lectura (de Code 3)
  ];
  const info = () => (db.respaldo ||= { at: 0, ok: false, size: 0, error: '', drive: '', day: '' });
  let running = false;

  // Arma el respaldo comprimido: un JSON con cada archivo tal como está en el disco
  const bundle = async (when) => {
    const archivos = {};
    for (const [name, file] of files()) {
      if (name === 'data.json') { archivos[name] = JSON.stringify(db, (k, v) => (k === 'lucesTk' ? undefined : v)); continue; } // sin la sesión de las luces (se vuelve a pedir sola) // lo de la memoria: es lo más reciente (el disco se escribe con 1 s de atraso)
      try { archivos[name] = await fs.promises.readFile(file, 'utf8'); } catch (e) { /* ese archivo todavía no existe */ }
    }
    return gzip(Buffer.from(JSON.stringify({ sala: 'cantabingo', fecha: when.toISOString(), archivos })));
  };
  const freeBytes = async () => {
    try { const s = await fs.promises.statfs(dir); return s.bavail * s.bsize; } catch (e) { return null; }
  };
  const list = async () => {
    try {
      const names = (await fs.promises.readdir(folder)).filter((n) => /^respaldo-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(n)).sort();
      return Promise.all(names.map(async (n) => ({ name: n, size: (await fs.promises.stat(path.join(folder, n))).size })));
    } catch (e) { return []; }
  };
  // B) copia fuera de Render (solo con RESPALDO_URL y RESPALDO_CLAVE en Render)
  const toDrive = async (name, buf) => {
    const url = process.env.RESPALDO_URL; const key = process.env.RESPALDO_CLAVE;
    if (!url || !key) return '';
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ clave: key, nombre: name, datos: buf.toString('base64') }), signal: AbortSignal.timeout(60000) });
      const t = await r.text();
      return r.ok && /"ok"\s*:\s*true/.test(t) ? 'ok' : `Drive respondió ${r.status}: ${t.slice(0, 120)}`;
    } catch (e) { return `Drive: ${e.message || e}`; }
  };

  const run = async (porQue) => {
    if (running) throw new Error('Ya se está respaldando');
    running = true;
    const st = info();
    try {
      const now = reloj(); const c = chile(now); const day = `${c.year}-${c.month}-${c.day}`;
      const buf = await bundle(now);
      const free = await freeBytes();
      if (free != null && free - buf.length < MIN_FREE) {
        Object.assign(st, { at: Date.now(), ok: false, size: buf.length, error: `Poco espacio en el disco (${Math.round(free / 1048576)} MB libres): no se respaldó`, day });
        save(); console.log('Respaldo:', st.error);
        return st;
      }
      await fs.promises.mkdir(folder, { recursive: true });
      const name = `respaldo-${day}.json.gz`;
      await fs.promises.writeFile(path.join(folder, `${name}.tmp`), buf);
      await fs.promises.rename(path.join(folder, `${name}.tmp`), path.join(folder, name));
      const all = await list(); // se quedan los últimos 14 días
      for (const f of all.slice(0, Math.max(0, all.length - KEEP))) await fs.promises.unlink(path.join(folder, f.name)).catch(() => {});
      const drive = await toDrive(name, buf);
      Object.assign(st, { at: Date.now(), ok: true, size: buf.length, error: '', drive, day, por: porQue });
      save();
      return st;
    } catch (e) {
      Object.assign(st, { at: Date.now(), ok: false, error: String(e.message || e) }); save(); console.log('Respaldo:', st.error);
      return st;
    } finally { running = false; }
  };

  // Una vez al día, desde las 05:00 (si a esa hora el servicio estaba reiniciándose, apenas vuelve, hasta las 11:00)
  const tick = () => {
    const c = chile(reloj()); const day = `${c.year}-${c.month}-${c.day}`; const h = Number(c.hour);
    if (h < HOUR || h >= 11 || info().day === day || running) return;
    run('automático').catch(() => {});
  };
  if (process.env.RESPALDO_AUTO !== '0') { // (RESPALDO_AUTO=0 solo en las pruebas: así no respaldan solas)
    setInterval(tick, 5 * 60000);
    setTimeout(tick, Number(process.env.RESPALDO_PRIMERO_MS) || 20000); // (la variable es solo para las pruebas)
  }

  app.get('/api/respaldo', requireAdmin, async (_req, res) => {
    res.json({ ...info(), copias: await list(), libre: await freeBytes(), drive: !!(process.env.RESPALDO_URL && process.env.RESPALDO_CLAVE), driveUltimo: info().drive || '' });
  });
  app.post('/api/respaldo/ahora', requireAdmin, async (_req, res) => {
    if (running) return res.status(409).json({ error: 'Ya se está respaldando' });
    res.json(await run('a mano'));
  });
  // C) bajar una copia al computador (se arma en el momento, no se guarda)
  app.get('/api/respaldo/bajar', requireAdmin, async (_req, res) => {
    const now = reloj(); const c = chile(now);
    const buf = await bundle(now);
    res.set('Content-Type', 'application/gzip').set('Content-Disposition', `attachment; filename="respaldo-sala-${c.year}-${c.month}-${c.day}-${c.hour}${c.minute}.json.gz"`).set('Cache-Control', 'no-store').send(buf);
  });
  return { run, list };
};
