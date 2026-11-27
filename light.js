// Sala light: karaoke, show, lo que viene y cartelera de la semana en un local, al mismo tiempo que la
// sala principal y sin tocarla. Tiene su propio QR para entrar, su propio GC para OBS y su propio panel.
// Se guarda aparte (db.light), no junto a las salas del bingo: así nada de la sala principal cambia.
// Show, cartelera y horarios se leen de la GLOSA a través del GC Show de cada local (?modo=json).
const crypto = require('crypto');

const VENUES = { frida: 'Frida Kahlo', kennedy: 'Mercado Kennedy', tobalaba: 'Tobalaba' }; // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)
// GC Show de cada local (Apps Script que lee la GLOSA)
const GLOSA = {
  kennedy: 'https://script.google.com/macros/s/AKfycbzgCkymn_Lu4m3l_kDr68B4fOmyCdIYi4W-vdHP3CrT5f_R7drx-Ryht6E-ltZf9BERNA/exec',
  frida: 'https://script.google.com/macros/s/AKfycby3oCPs4gFVUd3P7csLrQV3XEsefGMpLStZphoa76AnTRVlyExxbEpp2HAEnTbH5zwA/exec',
  tobalaba: 'https://script.google.com/macros/s/AKfycbz1zFsj6YR2i03dlYuLTD0Hj3HRjZ8VlyQU0S9uCp_B6qurdegC0lRlDyfM9AUk7rZ7pQ/exec',
};
const STAGES = ['info', 'karaoke', 'show', 'cartelera', 'qr', 'custom', 'none', 'fondo']; // fondo: el video horizontal del local en el GC (Kennedy, 27 nov) // custom: GC personalizable, con el texto que escribe el equipo (pedido de Cote, 21 nov) // info: la información que va cambiando (por defecto, pedido de Cote)
const TZ = 'America/Santiago';
const NIGHT_STARTS = 6; // la noche cambia a las 6 AM, igual que el karaoke
const DAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const GLOSA_MS = 10 * 60e3; // la GLOSA se relee cada 10 minutos

module.exports = function light({ app, db, save, requireAdmin, requireLocal = requireAdmin, fail, karaoke, insta, aviso = () => {}, salaDe = () => false, fondoDe = () => '', reloj = () => new Date() }) {
  // Una sala light por local (Kennedy, Frida y Tobalaba pueden estar abiertas a la vez)
  db.lights ||= {};
  if (db.light) { db.lights[db.light.venue] = db.light; db.light = null; } // salas guardadas antes de este cambio
  // Siempre activas (decisión de Cote): cada local tiene su sala light, con su QR fijo; no se crea ni se cierra
  for (const v of Object.keys(VENUES)) {
    if (!db.lights[v]) db.lights[v] = { id: `L${crypto.randomBytes(4).toString('hex')}`, venue: v, stage: 'info', players: {}, created: Date.now() };
  }
  // Una sola vez (19 nov, pedido de Cote): el GC que estaba en «Nada» pasa a la información que va cambiando, que es lo
  // que se ve por defecto; después «Nada» deja el GC vacío como siempre
  if (!db.lightInfoDefault) {
    for (const l of Object.values(db.lights)) if (l && l.stage === 'none') l.stage = 'info';
    db.lightInfoDefault = true;
  }
  // Una sola vez (19 nov, pedido de Cote): los tres locales parten con la información que va cambiando en el GC
  if (!db.lightInfoAll) {
    for (const l of Object.values(db.lights)) if (l) l.stage = 'info';
    db.lightInfoAll = true;
  }
  save();
  const clean = (v, max = 80) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const plain = (t) => clean(t, 40).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const byId = (sid) => Object.values(db.lights).find((l) => l && l.id === sid) || null;

  // ---------- Fecha de la noche (en Chile, con corte a las 6 AM) ----------
  const parts = (d) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
  };
  const night = (offsetDays = 0) => {
    const now = parts(reloj());
    const base = new Date(Date.UTC(now.y, now.m - 1, now.d + offsetDays - (now.h < NIGHT_STARTS ? 1 : 0)));
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), dow: base.getUTCDay() };
  };
  const minutesNow = () => { const p = parts(reloj()); return (p.h < NIGHT_STARTS ? p.h + 24 : p.h) * 60 + p.min; };
  const toMin = (hora) => { const m = String(hora).match(/(\d{1,2})[:.](\d{2})/); if (!m) return null; const h = +m[1]; return (h < NIGHT_STARTS ? h + 24 : h) * 60 + +m[2]; };

  // ---------- GLOSA ----------
  const glosa = {}; // local -> { data, at, error }
  async function readGlosa(venue) {
    const c = glosa[venue];
    if (c && Date.now() - c.at < GLOSA_MS) return c;
    try {
      // GLOSA_TEST_URL solo se usa en pruebas locales (sin acceso a Google)
      const r = await fetch(`${process.env.GLOSA_TEST_URL || GLOSA[venue]}?modo=json`, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      const data = JSON.parse(await r.text());
      if (!data || data.error) throw new Error(clean(data && data.error, 200) || 'Respuesta vacía');
      glosa[venue] = { data, at: Date.now(), error: '' };
    } catch (err) {
      // Si falla, se sigue usando lo último bueno y se reintenta en un minuto
      glosa[venue] = { data: (c || {}).data || null, at: Date.now() - GLOSA_MS + 60e3, error: clean(err && err.message, 200) || 'No se pudo leer la GLOSA' };
    }
    return glosa[venue];
  }
  // Pestañas de la GLOSA que llegan: la del mes (pestana + cartelera) y, si el GC Show las manda, las de `meses`
  // ([{ pestana, cartelera }], la de este mes y la del siguiente). Sin `meses`, la cartelera de la semana no puede mostrar
  // los shows de los primeros días del mes siguiente (pedido de Cote, 27 nov: «la cartelera de la semana de Kennedy no
  // está cargando la información del jueves 3 de diciembre»)
  const tabsOf = (data) => (data ? [{ pestana: data.pestana, cartelera: data.cartelera }, ...(Array.isArray(data.meses) ? data.meses : [])] : []);
  const tabFor = (data, m) => tabsOf(data).find((t) => t && monthOf(t) === m) || null;
  // Nombre del show como se escribe ahora en la GLOSA (pedido de Cote, 27 nov): entre paréntesis va a quién se le transfiere
  // (no se muestra) y entre comillas, la persona o el grupo que hace el tributo. Ej.: «GEORGE MICHAEL "RAFA DAMIÁN" (X)»
  // → «GEORGE MICHAEL (RAFA DAMIÁN)»; «PIANO MAN (X PROJECTS)» → «PIANO MAN». Se entrega con el artista entre paréntesis
  // porque así lo leen todas las pantallas y la página krbstage.cl (título arriba y «por <artista>»).
  const showName = (t) => {
    const raw = clean(t, 160).replace(/\([^()]*\)/g, ' ');
    const q = raw.match(/["“”«»]\s*([^"“”«»]+?)\s*["“”«»]/);
    const by = q ? clean(q[1], 60) : '';
    let title = clean((q ? raw.replace(q[0], ' ') : raw).replace(/["“”«»]/g, ' ').replace(/^[\s\-–—,:·]+|[\s\-–—,:·]+$/g, ''), 100);
    // si el artista ya va escrito al final del título, no se repite (ej. «ESPECIAL BALADA ITALIANA MATIAS FAJARDO "MATIAS FAJARDO"»)
    const up = (x) => clean(x, 160).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    if (by && up(title).endsWith(` ${up(by)}`)) title = clean(title.slice(0, title.length - by.length).replace(/[\s\-–—,:·]+$/, ''), 100);
    return clean(title && by ? `${title} (${by})` : title || by, 120);
  };
  // Show de una fecha: en la cartelera el día se escribe como «SABADO 7» (vale el número del final)
  const showOf = (data, n) => {
    const t = tabFor(data, n.m);
    const row = t ? (t.cartelera || []).find((x) => Number((String(x.dia).match(/(\d+)\s*$/) || [])[1]) === n.d) : null;
    return row ? showName(row.show) : '';
  };
  // Mes de la pestaña leída, ej. «NOVIEMBRE26 MASTER TOTAL» → 11
  const MONTHS = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const monthOf = (data) => { const t = plain(data.pestana || ''); const i = MONTHS.findIndex((m) => t.startsWith(m)); return i + 1; };
  const hoursOf = (data, dow) => (data && Array.isArray(data.horarios) ? data.horarios : [])
    .filter((x) => plain(x.dia).replace(/S$/, '') === DAYS[dow].replace(/S$/, ''))
    .map((x) => ({ time: clean(x.hora, 10), label: clean(x.actividad, 60) }))
    .filter((x) => x.time && x.label);
  // Lo que ven pantallas y celulares: show de hoy, lo que viene esta noche y la semana
  async function cartelera(venue) {
    const g = await readGlosa(venue);
    const data = g.data;
    const today = night(0);
    const blocks = hoursOf(data, today.dow);
    const nowMin = minutesNow();
    const next = blocks.find((b) => { const t = toMin(b.time); return t != null && t > nowMin; }) || null;
    const current = [...blocks].reverse().find((b) => { const t = toMin(b.time); return t != null && t <= nowMin; }) || null;
    const week = [];
    for (let i = 0; i < 7; i++) {
      const n = night(i);
      const hours = hoursOf(data, n.dow);
      const show = showOf(data, n);
      if (hours.length || show) week.push({ day: DAYS[n.dow], date: n.d, month: n.m, today: i === 0, show, hours });
    }
    // Cartelera del mes (lo que queda desde hoy), para la pantalla vertical de la sala light
    const tm = tabFor(data, today.m);
    const month = tm ? (tm.cartelera || []).map((r) => ({ day: clean(r.dia, 20), date: Number((String(r.dia).match(/(\d+)\s*$/) || [])[1]) || 0, show: showName(r.show) }))
      .filter((r) => r.date >= today.d && r.show).sort((a, b) => a.date - b.date) : [];
    return { venue, name: VENUES[venue], show: showOf(data, today), blocks, current, next, week, month, at: g.at, error: g.error };
  }

  // ---------- Estado ----------
  const pub = (v) => {
    const l = db.lights[v];
    // fondo: con el botón «FONDO KENNEDY», el video horizontal del local en lugar del GC (pedido de Cote, 27 nov)
    // sala: hoy hay sala de juegos (no simulada) de este local; el GC Light muestra el GC de la sala de juegos toda la
    // noche, enganchado a su QR (pedido de Cote, 27 nov: «tener que cambiarlo en OBS es una lata»)
    return l ? { open: true, id: l.id, venue: v, name: VENUES[v], title: `Sala light · ${VENUES[v]}`, stage: l.stage, text: l.text || '', video: !!l.video, players: Object.keys(l.players).length, sala: !!salaDe(v), fondo: fondoDe(v) } : { open: false, venue: v, name: VENUES[v], sala: !!salaDe(v), fondo: fondoDe(v) };
  };
  // Sin ?local= devuelve la lista de las salas light abiertas (y, por compatibilidad, la primera)
  app.get('/api/light', (req, res) => {
    if (VENUES[req.query.local]) return res.json(pub(req.query.local));
    const open = Object.keys(db.lights).filter((v) => db.lights[v]).map(pub);
    res.json({ ...(open[0] || { open: false }), lights: open });
  });
  app.get('/api/light/cartelera', async (req, res) => {
    // Pública (solo lectura): la página web krbstage.cl la usa para mostrar la cartelera de cada local
    res.set('Access-Control-Allow-Origin', '*');
    const v = VENUES[req.query.local] ? req.query.local : (Object.keys(db.lights).find((k) => db.lights[k]) || '');
    if (!v) return fail(res, 404, 'No hay una sala light abierta');
    res.json(await cartelera(v));
  });
  app.post('/api/light', requireLocal, (req, res) => {
    const venue = String((req.body || {}).venue || (req.body || {}).local || '');
    if (!VENUES[venue]) return fail(res, 400, 'Elige el local');
    if (db.lights[venue]) return res.json(pub(venue)); // ya estaba abierta: se entra a la misma
    db.lights[venue] = { id: `L${crypto.randomBytes(4).toString('hex')}`, venue, stage: 'info', players: {}, created: Date.now() };
    save();
    karaoke.refreshVenue(venue);
    res.json(pub(venue));
  });
  app.post('/api/light/stage', requireLocal, (req, res) => {
    const b = req.body || {};
    const v = String(b.local || '');
    const show = String(b.show || '');
    if (!db.lights[v]) return fail(res, 404, 'No hay una sala light abierta en este local');
    if (!STAGES.includes(show)) return fail(res, 400, 'Opción no válida');
    // GC personalizable: el texto que se escribe en el panel (queda guardado para volver a usarlo)
    if (b.text != null) db.lights[v].text = clean(b.text, 120);
    if (show === 'custom' && !db.lights[v].text) return fail(res, 400, 'Escribe el texto del GC personalizable');
    db.lights[v].stage = show;
    db.lights[v].video = false; // cambiar el GC apaga el switch «Video cartelera» (pedido de Cote, 21 nov)
    save();
    if (show === 'karaoke' || show === 'qr') karaoke.refreshVenue(v);
    aviso(); // las pantallas cambian al instante
    res.json(pub(v));
  });
  // Switch «Video cartelera» (pedido de Cote, 21 nov): deja puesto en la pantalla vertical del local (versión completa y
  // liviana) el video de la cartelera que está subido, hasta que alguien cambie el GC desde la sala light
  app.post('/api/light/video', requireLocal, (req, res) => {
    const b = req.body || {};
    const v = String(b.local || '');
    if (!db.lights[v]) return fail(res, 404, 'No hay una sala light abierta en este local');
    db.lights[v].video = !!b.on;
    save();
    aviso();
    res.json(pub(v));
  });

  // ---------- Público: entrar desde el celular ----------
  app.get('/api/light/:id', (req, res) => {
    const l = byId(req.params.id);
    if (!l) return fail(res, 404, 'Esta sala ya terminó');
    res.json({ ...pub(l.venue), places: karaoke.placesFor(l.venue), insta: insta.handleOf(l.venue) });
  });
  app.post('/api/light/:id/join', (req, res) => {
    const l = byId(req.params.id);
    if (!l) return fail(res, 404, 'Esta sala ya terminó');
    const b = req.body || {};
    const token = typeof b.token === 'string' ? b.token : '';
    let pl = l.players[token];
    if (!pl) {
      const first = clean(b.name, 20).toLocaleUpperCase('es');
      const last = clean(b.surname, 25).toLocaleUpperCase('es');
      if (!first || !last) return fail(res, 400, 'Escribe tu nombre y tu apellido');
      const places = karaoke.placesFor(l.venue);
      const place = places.find((x) => x === String(b.place || '').trim()) || '';
      if (places.length && !place) return fail(res, 400, 'Elige el lugar donde estás');
      const t = crypto.randomBytes(9).toString('hex');
      pl = l.players[t] = { name: `${first} ${last}`, place };
      save();
      return res.json({ token: t, name: pl.name, place: pl.place });
    }
    res.json({ token, name: pl.name, place: pl.place });
  });

  // Para el karaoke: quién es el participante y de qué local es la sala; qué locales consultar en Google
  const last = {};
  return {
    pubOf: pub, // para la consola general
    carteleraOf: cartelera,
    findPlayer: (sid, token) => { const l = byId(sid); return l ? l.players[token] || null : null; },
    venueOf: (sid) => { const l = byId(sid); return l ? l.venue : ''; },
    // Mientras el karaoke o el QR con la lista están en pantalla, se lee la lista cada 3 s; si no, cada ~15 s
    pollVenues: () => Object.keys(db.lights).filter((v) => {
      const l = db.lights[v];
      if (!l) return false;
      if (l.stage === 'karaoke' || l.stage === 'qr' || Date.now() - (last[v] || 0) > 15000) { last[v] = Date.now(); return true; }
      return false;
    }),
  };
};
