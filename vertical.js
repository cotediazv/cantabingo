// Pantalla vertical de un local (pedido de Cote, para Kennedy): pasa siempre el video de la cartelera del mes
// (lo sube Cote desde el Centro de control) y, cuando empieza una actividad en ese local, cambia sola a ella:
//  - la sala de juegos completa de ese local abierta y con algo en el escenario → el tablero vertical;
//  - el karaoke de la sala light de ese local con alguien cantando → el karaoke a pantalla completa.
// Un botón permite forzar «Video» o «Actividad» a mano.
const fs = require('fs');
const path = require('path');

const VENUES = { frida: 'Frida Kahlo', kennedy: 'Kennedy', tobalaba: 'Tobalaba' };
const MODES = ['auto', 'video', 'actividad'];
const MAX_BYTES = 300 * 1024 * 1024; // 300 MB por video

module.exports = function vertical({ app, db, save, requireAdmin, fail, dir, karaoke }) {
  db.vertical ||= {}; // local -> { video: número de versión (fecha de subida), size, mode }
  const file = (v) => path.join(dir, `vertical-${v}.mp4`);
  const conf = (v) => (db.vertical[v] ||= { video: 0, size: 0, mode: 'auto' });

  // Qué actividad hay ahora en el local (null si ninguna)
  const activityOf = (v) => {
    const s = Object.values(db.sessions)[0];
    if (s && (s.theme || 'frida') === v && db.stage && db.stage !== 'none') return 'sala';
    const l = (db.lights || {})[v];
    if (l && l.stage !== 'none' && karaoke.nowOf(v).now) return 'karaoke';
    return null;
  };
  const stateOf = (v) => {
    const c = conf(v);
    const act = activityOf(v);
    const hasVideo = !!c.video && fs.existsSync(file(v));
    let show = c.mode === 'video' ? 'video' : c.mode === 'actividad' ? (act || 'sala') : (act || 'video');
    if (show === 'video' && !hasVideo) show = act || 'sala'; // sin video subido, queda la actividad o la portada
    return { venue: v, name: VENUES[v], mode: c.mode, activity: act, show, video: hasVideo ? c.video : 0, size: hasVideo ? c.size : 0 };
  };

  app.get('/api/vertical/:local', (req, res) => {
    const v = req.params.local;
    if (!VENUES[v]) return fail(res, 404, 'Local no válido');
    res.json(stateOf(v));
  });
  app.post('/api/vertical/:local/mode', requireAdmin, (req, res) => {
    const v = req.params.local;
    const mode = String((req.body || {}).mode || '');
    if (!VENUES[v]) return fail(res, 404, 'Local no válido');
    if (!MODES.includes(mode)) return fail(res, 400, 'Opción no válida');
    conf(v).mode = mode;
    save();
    res.json(stateOf(v));
  });
  // Subir el video del mes: el archivo va tal cual en el cuerpo de la petición (se guarda en el disco, por partes)
  app.post('/api/vertical/:local/video', requireAdmin, (req, res) => {
    const v = req.params.local;
    if (!VENUES[v]) return fail(res, 404, 'Local no válido');
    const len = Number(req.get('content-length') || 0);
    if (!len) return fail(res, 400, 'Elige un video');
    if (len > MAX_BYTES) return fail(res, 413, 'El video pesa más de 300 MB');
    const tmp = `${file(v)}.subiendo`;
    const out = fs.createWriteStream(tmp);
    let got = 0;
    let done = false;
    const stop = (status, msg) => { if (done) return; done = true; out.destroy(); fs.rm(tmp, { force: true }, () => {}); fail(res, status, msg); };
    req.on('data', (chunk) => { got += chunk.length; if (got > MAX_BYTES) { stop(413, 'El video pesa más de 300 MB'); req.destroy(); } });
    req.on('aborted', () => stop(400, 'Se cortó la subida'));
    out.on('error', () => stop(500, 'No se pudo guardar el video'));
    out.on('finish', () => {
      if (done) return;
      done = true;
      fs.rename(tmp, file(v), (err) => {
        if (err) return fail(res, 500, 'No se pudo guardar el video');
        const c = conf(v);
        c.video = Date.now();
        c.size = got;
        save();
        res.json(stateOf(v));
      });
    });
    req.pipe(out);
  });
  app.delete('/api/vertical/:local/video', requireAdmin, (req, res) => {
    const v = req.params.local;
    if (!VENUES[v]) return fail(res, 404, 'Local no válido');
    fs.rm(file(v), { force: true }, () => {});
    Object.assign(conf(v), { video: 0, size: 0 });
    save();
    res.json(stateOf(v));
  });
  // El video en sí (con avance por partes, para que el navegador lo reproduzca sin bajarlo entero)
  app.get('/vertical/:local.mp4', (req, res) => {
    const v = req.params.local;
    if (!VENUES[v] || !fs.existsSync(file(v))) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // cada video nuevo lleva otra versión en la dirección
    res.sendFile(file(v));
  });
};
