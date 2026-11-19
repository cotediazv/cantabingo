// Pantalla vertical de un local (pedido de Cote, para Kennedy): pasa siempre el video de la cartelera del mes
// (lo sube Cote desde el Centro de control) y, cuando empieza una actividad en ese local, cambia sola a ella:
//  - la sala de juegos completa de ese local abierta y con algo en el escenario → el tablero vertical;
//  - si no hay juegos y el local tiene sala light (Kennedy y Frida), el fondo vertical de la sala light (#/light-v/<local>).
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

  // Qué actividad hay ahora en el local: la sala de juegos completa de ese local abierta y con algo en juego
  // (pedido de Cote: si la sala está abierta pero sin bingo, El Rosco ni otro juego en curso, se ve la información
  // del local con los shows que vienen). En el bingo cuenta como «en juego» si ya salieron números, si está el QR
  // grande para entrar o si hay ganador en pantalla.
  const activityOf = (v) => {
    const s = Object.values(db.sessions)[0];
    if (!s || (s.theme || 'frida') !== v || !db.stage || db.stage === 'none') return null;
    if (db.stage === 'bingo') {
      const celebrate = !s.hideWin && (s.results || []).some((r) => r.validated && !r.dismissed);
      return (s.drawn || []).length || s.bigQr || celebrate ? 'sala' : null;
    }
    if (db.stage === 'rueda') return Object.keys(db.wheels || {}).length ? 'sala' : null;
    return 'sala'; // sorteo, votación, karaoke, show, Instagram o QR: el animador lo puso en pantalla
  };
  // Locales con sala light (pedido de Cote): en «Automático», si no hay juegos, la pantalla muestra el fondo vertical de
  // la sala light (QR para entrar, lo que viene esta noche y en la semana, la cartelera del mes, horarios y karaoke).
  // Tobalaba no tiene sala light, pero muestra el mismo fondo con su información (pedido de Cote), con el QR de la sala de juegos.
  // (solo en las pantallas verticales; la horizontal de Tobalaba sigue con su video o el logo)
  const LIGHT_SCREENS = { kennedy: true, frida: true, 'tobalaba-v': true };
  // Horario de la pantalla (pedidos de Cote): en Kennedy y en Frida, jueves, viernes y sábado pasa sola a «Automático» a
  // las 18:30 y vuelve a «Siempre el video» a las 00:30 de esa noche; en Tobalaba (sus dos pantallas), el viernes de 18:00 a 22:30.
  // Una vez por noche; entremedio se puede cambiar a mano.
  // Si el servicio estaba reiniciándose justo a esa hora, se hace apenas vuelve (hasta 15 minutos después).
  const SCHEDULE = { kennedy: { days: ['Thu', 'Fri', 'Sat'], on: 18 * 60 + 30, off: 30 }, frida: { days: ['Thu', 'Fri', 'Sat'], on: 18 * 60 + 30, off: 30 }, tobalaba: { days: ['Fri'], on: 18 * 60, off: 22 * 60 + 30 } };
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
    const venue = SCREENS[v];
    const act = activityOf(venue);
    const rest = LIGHT_SCREENS[v] ? 'light' : null; // sin juegos: el fondo vertical con la información del local
    const hasVideo = !!c.video && fs.existsSync(file(v));
    // Los juegos de la sala completa siempre pasan adelante (salvo «Siempre el video»)
    let show = c.mode === 'video' ? 'video' : c.mode === 'actividad' ? (act || rest || 'sala') : (act || rest || 'video');
    if (show === 'video' && !hasVideo) show = act || 'light'; // sin video subido y sin juegos: la información del local (shows que vienen, horarios, QR)
    // lightStage: lo que el equipo eligió en el panel de la sala light del local; la pantalla lo sigue cuando muestra la información
    return { screen: v, venue: SCREENS[v], name: VENUES[SCREENS[v]], lightStage: ((db.lights || {})[venue] || {}).stage || 'cartelera', karaokeNow: !!karaoke.nowOf(venue).now, mode: c.mode, activity: act, show, video: hasVideo ? c.video : 0, size: hasVideo ? c.size : 0 };
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
