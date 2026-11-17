// Sala light: karaoke, show, lo que viene y cartelera de la semana en un local, al mismo tiempo que la
// sala principal y sin tocarla. Tiene su propio QR para entrar, su propio GC para OBS y su propio panel.
// Se guarda aparte (db.light), no junto a las salas del bingo: así nada de la sala principal cambia.
// Show, cartelera y horarios se leen de la GLOSA a través del GC Show de cada local (?modo=json).
const crypto = require('crypto');

const VENUES = { frida: 'Frida Kahlo', kennedy: 'Kennedy', tobalaba: 'Tobalaba' };
// GC Show de cada local (Apps Script que lee la GLOSA)
const GLOSA = {
  kennedy: 'https://script.google.com/macros/s/AKfycbzgCkymn_Lu4m3l_kDr68B4fOmyCdIYi4W-vdHP3CrT5f_R7drx-Ryht6E-ltZf9BERNA/exec',
  frida: 'https://script.google.com/macros/s/AKfycby3oCPs4gFVUd3P7csLrQV3XEsefGMpLStZphoa76AnTRVlyExxbEpp2HAEnTbH5zwA/exec',
  tobalaba: 'https://script.google.com/macros/s/AKfycbz1zFsj6YR2i03dlYuLTD0Hj3HRjZ8VlyQU0S9uCp_B6qurdegC0lRlDyfM9AUk7rZ7pQ/exec',
};
const STAGES = ['karaoke', 'show', 'cartelera', 'qr', 'none'];
const TZ = 'America/Santiago';
const NIGHT_STARTS = 6; // la noche cambia a las 6 AM, igual que el karaoke
const DAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const GLOSA_MS = 10 * 60e3; // la GLOSA se relee cada 10 minutos

module.exports = function light({ app, db, save, requireAdmin, fail, karaoke, insta }) {
  db.light ||= null;
  const clean = (v, max = 80) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const plain = (t) => clean(t, 40).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const isLight = (sid) => !!db.light && sid === db.light.id;

  // ---------- Fecha de la noche (en Chile, con corte a las 6 AM) ----------
  const parts = (d) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).map((x) => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
  };
  const night = (offsetDays = 0) => {
    const now = parts(new Date());
    const base = new Date(Date.UTC(now.y, now.m - 1, now.d + offsetDays - (now.h < NIGHT_STARTS ? 1 : 0)));
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), dow: base.getUTCDay() };
  };
  const minutesNow = () => { const p = parts(new Date()); return (p.h < NIGHT_STARTS ? p.h + 24 : p.h) * 60 + p.min; };
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
  // Show de una fecha: en la cartelera el día se escribe como «SABADO 7» (vale el número del final)
  const showOf = (data, n) => {
    if (!data || n.m !== monthOf(data)) return '';
    const row = (data.cartelera || []).find((x) => Number((String(x.dia).match(/(\d+)\s*$/) || [])[1]) === n.d);
    return row ? clean(row.show, 120) : '';
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
    return { venue, name: VENUES[venue], show: showOf(data, today), blocks, current, next, week, at: g.at, error: g.error };
  }

  // ---------- Estado ----------
  const pub = () => (db.light ? { open: true, id: db.light.id, venue: db.light.venue, name: VENUES[db.light.venue], title: `Sala light · ${VENUES[db.light.venue]}`, stage: db.light.stage, players: Object.keys(db.light.players).length } : { open: false });
  app.get('/api/light', (_req, res) => res.json(pub()));
  app.get('/api/light/cartelera', async (req, res) => {
    const v = VENUES[req.query.local] ? req.query.local : (db.light || {}).venue;
    if (!v) return fail(res, 404, 'No hay una sala light abierta');
    res.json(await cartelera(v));
  });
  app.post('/api/light', requireAdmin, (req, res) => {
    const venue = String((req.body || {}).venue || '');
    if (!VENUES[venue]) return fail(res, 400, 'Elige el local');
    if (db.light) return fail(res, 409, `Ya hay una sala light abierta (${VENUES[db.light.venue]}). Ciérrala para abrir otra.`);
    db.light = { id: `L${crypto.randomBytes(4).toString('hex')}`, venue, stage: 'karaoke', players: {}, created: Date.now() };
    save();
    karaoke.refreshVenue(venue);
    res.json(pub());
  });
  app.delete('/api/light', requireAdmin, (_req, res) => { db.light = null; save(); res.json(pub()); });
  app.post('/api/light/stage', requireAdmin, (req, res) => {
    const show = String((req.body || {}).show || '');
    if (!db.light) return fail(res, 404, 'No hay una sala light abierta');
    if (!STAGES.includes(show)) return fail(res, 400, 'Opción no válida');
    db.light.stage = show;
    save();
    if (show === 'karaoke' || show === 'qr') karaoke.refreshVenue(db.light.venue);
    res.json(pub());
  });

  // ---------- Público: entrar desde el celular ----------
  app.get('/api/light/:id', (req, res) => {
    if (!isLight(req.params.id)) return fail(res, 404, 'Esta sala ya terminó');
    const v = db.light.venue;
    res.json({ ...pub(), places: karaoke.placesFor(v), insta: insta.handleOf(v) });
  });
  app.post('/api/light/:id/join', (req, res) => {
    if (!isLight(req.params.id)) return fail(res, 404, 'Esta sala ya terminó');
    const b = req.body || {};
    const token = typeof b.token === 'string' ? b.token : '';
    let pl = db.light.players[token];
    if (!pl) {
      const first = clean(b.name, 20).toLocaleUpperCase('es');
      const last = clean(b.surname, 25).toLocaleUpperCase('es');
      if (!first || !last) return fail(res, 400, 'Escribe tu nombre y tu apellido');
      const places = karaoke.placesFor(db.light.venue);
      const place = places.find((x) => x === String(b.place || '').trim()) || '';
      if (places.length && !place) return fail(res, 400, 'Elige el lugar donde estás');
      const t = crypto.randomBytes(9).toString('hex');
      pl = db.light.players[t] = { name: `${first} ${last}`, place };
      save();
      return res.json({ token: t, name: pl.name, place: pl.place });
    }
    res.json({ token, name: pl.name, place: pl.place });
  });

  // Para el karaoke: quién es el participante y de qué local es la sala; qué local consultar en Google
  return {
    findPlayer: (sid, token) => (isLight(sid) ? db.light.players[token] || null : null),
    venueOf: (sid) => (isLight(sid) ? db.light.venue : ''),
    // Mientras el karaoke o el QR con la lista están en pantalla, se lee la lista cada 3 s; si no, cada ~15 s
    pollVenues: (() => { let last = 0; return () => {
      if (!db.light) return [];
      if (db.light.stage === 'karaoke' || db.light.stage === 'qr' || Date.now() - last > 15000) { last = Date.now(); return [db.light.venue]; }
      return [];
    }; })(),
  };
};
