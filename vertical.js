// Pantalla vertical de un local (pedido de Cote, para Kennedy): pasa siempre el video de la cartelera del mes
// (lo sube Cote desde el Centro de control) y, cuando empieza una actividad en ese local, cambia sola a ella:
//  - la sala de juegos completa de ese local abierta y con algo en el escenario → el tablero vertical;
//  - el karaoke de la sala light de ese local con alguien cantando → el karaoke a pantalla completa.
// Un botón permite forzar «Video» o «Actividad» a mano.
const fs = require('fs');
const path = require('path');

const VENUES = { frida: 'Frida Kahlo', kennedy: 'Kennedy', tobalaba: 'Tobalaba' };
// Pantallas: cada una con su video y su modo; la actividad es la de su local. Pantallas verticales en los tres
// locales (pedido de Cote) y, además, una horizontal en Tobalaba. La clave es también el nombre del archivo del video.
const SCREENS = { kennedy: 'kennedy', frida: 'frida', 'tobalaba-v': 'tobalaba', tobalaba: 'tobalaba' }; // pantalla -> local
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
    if (lightOn(v)) return 'light';
    return null;
  };
  // Sala light de Kennedy y de Frida siempre en pantalla (pedido de Cote), salvo el día de la sala de juegos completa
  // de ese local (jueves en Kennedy, domingo en Frida; la noche sigue hasta las 6:00 del día siguiente)
  const FULL_DAY = { kennedy: 'Thu', frida: 'Sun' };
  const PREV = { Mon: 'Sun', Tue: 'Mon', Wed: 'Tue', Thu: 'Wed', Fri: 'Thu', Sat: 'Fri', Sun: 'Sat' };
  const lightOn = (v) => {
    if (!FULL_DAY[v]) return false;
    const l = (db.lights || {})[v];
    if (!l || l.stage === 'none') return false;
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const day = +p.hour < 6 ? PREV[p.weekday] : p.weekday;
    return day !== FULL_DAY[v];
  };
  // Horario de la pantalla (pedidos de Cote): en Kennedy, jueves, viernes y sábado pasa sola a «Automático» a las 20:00
  // y vuelve a «Siempre el video» a las 00:30 de esa noche; en Tobalaba (sus dos pantallas), el viernes de 18:00 a 22:30.
  // Una vez por noche; entremedio se puede cambiar a mano.
  // Si el servicio estaba reiniciándose justo a esa hora, se hace apenas vuelve (hasta 15 minutos después).
  const SCHEDULE = { kennedy: { days: ['Thu', 'Fri', 'Sat'], on: 20 * 60, off: 30 }, tobalaba: { days: ['Fri'], on: 18 * 60, off: 22 * 60 + 30 } };
  SCHEDULE['tobalaba-v'] = SCHEDULE.tobalaba;
  const NEXT = { Thu: 'Fri', Fri: 'Sat', Sat: 'Sun' };
  setInterval(() => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date()).map((x) => [x.type, x.value]));
    const min = +p.hour * 60 + +p.minute;
    const day = `${p.year}-${p.month}-${p.day}`;
    for (const [v, s] of Object.entries(SCHEDULE)) {
      const c = conf(v);
      c.sched ||= {};
      if (s.days.includes(p.weekday) && min >= s.on && min < s.on + 15 && c.sched.on !== day) { c.sched.on = day; c.mode = 'auto'; save(); }
      const offDay = s.off > s.on ? s.days.includes(p.weekday) : s.days.some((d) => NEXT[d] === p.weekday); // 00:30 es ya el día siguiente
      if (offDay && min >= s.off && min < s.off + 15 && c.sched.off !== day) { c.sched.off = day; c.mode = 'video'; save(); }
    }
  }, 20e3);

  const stateOf = (v) => {
    const c = conf(v);
    const act = activityOf(SCREENS[v]);
    const hasVideo = !!c.video && fs.existsSync(file(v));
    let show = c.mode === 'video' ? 'video' : c.mode === 'actividad' ? (act || 'sala') : (act || 'video');
    if (show === 'video' && !hasVideo) show = act || 'sala'; // sin video subido, queda la actividad o la portada
    return { screen: v, venue: SCREENS[v], name: VENUES[SCREENS[v]], mode: c.mode, activity: act, light: lightOn(SCREENS[v]), show, video: hasVideo ? c.video : 0, size: hasVideo ? c.size : 0 };
  };

  app.get('/api/vertical/:local', (req, res) => {
    const v = req.params.local;
    if (!SCREENS[v]) return fail(res, 404, 'Pantalla no válida');
    res.json(stateOf(v));
  });
  app.post('/api/vertical/:local/mode', requireAdmin, (req, res) => {
    const v = req.params.local;
    const mode = String((req.body || {}).mode || '');
    if (!SCREENS[v]) return fail(res, 404, 'Pantalla no válida');
    if (!MODES.includes(mode)) return fail(res, 400, 'Opción no válida');
    conf(v).mode = mode;
    save();
    res.json(stateOf(v));
  });
  // Subir el video del mes: el archivo va tal cual en el cuerpo de la petición (se guarda en el disco, por partes)
  app.post('/api/vertical/:local/video', requireAdmin, (req, res) => {
    const v = req.params.local;
    if (!SCREENS[v]) return fail(res, 404, 'Pantalla no válida');
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
    if (!SCREENS[v]) return fail(res, 404, 'Pantalla no válida');
    fs.rm(file(v), { force: true }, () => {});
    Object.assign(conf(v), { video: 0, size: 0 });
    save();
    res.json(stateOf(v));
  });
  // El video en sí (con avance por partes, para que el navegador lo reproduzca sin bajarlo entero)
  app.get('/vertical/:local.mp4', (req, res) => {
    const v = req.params.local;
    if (!SCREENS[v] || !fs.existsSync(file(v))) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // cada video nuevo lleva otra versión en la dirección
    res.sendFile(file(v));
  });
};
