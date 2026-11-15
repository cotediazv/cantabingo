// Karaoke: muestra en la pantalla única de OBS y en el tablero del DJ la cola de pedidos que ya
// maneja el sistema de Google (Forms + planilla + AppSheet). Aquí no se guarda ni se modifica
// ningún pedido: solo se lee la lista que entrega la web app de Apps Script de cada local
// (.../exec?modo=json) y se reparte a las pantallas.
const VENUES = {
  frida: 'Frida Kahlo',
  kennedy: 'Kennedy',
  tobalaba: 'Tobalaba',
};
// Valores iniciales conocidos; el resto se completa desde el Centro de control
const DEFAULTS = {
  frida: {
    exec: 'https://script.google.com/macros/s/AKfycbzOKC65Sd4B6duYag_CGwMAOsSylk4TcJ8VgoWy-i6DN1Aq2uZUT36I_5p2FcUpqiQO/exec',
    form: 'https://forms.gle/t1scSNST6LEbSEgK9',
  },
  kennedy: { exec: '', form: 'https://docs.google.com/forms/d/e/1FAIpQLSd98_5VYafBCp0BoMKwbMRqloo7rGkz6WYIH5RTCbMmJy5uNg/viewform' },
  tobalaba: { exec: '', form: '' },
};
const POLL_MS = 3000; // cada cuánto se consulta a Google mientras el karaoke está en pantalla
const TIMEOUT_MS = 10000; // Apps Script puede tardar en un arranque en frío
const SEPARATORS = [' – ', ' • ', ' - ']; // "Canción – Artista": se corta por la última aparición

module.exports = function karaoke({ app, db, save, requireAdmin, fail }) {
  db.karaoke ||= {};
  db.karaoke.venue ||= 'frida';
  db.karaoke.urls ||= {};
  for (const v of Object.keys(VENUES)) db.karaoke.urls[v] = { ...DEFAULTS[v], ...(db.karaoke.urls[v] || {}) };

  // Lo último que se leyó bien de cada local. Si una consulta falla, se sigue mostrando esto.
  const cache = {}; // local -> { list, at, error }
  let busy = false;

  const clean = (v, max = 80) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  const split = (text) => {
    const t = clean(text, 160);
    for (const sep of SEPARATORS) {
      const i = t.lastIndexOf(sep);
      if (i > 0) return [t.slice(0, i).trim(), t.slice(i + sep.length).trim()];
    }
    return [t, ''];
  };
  // Acepta el formato de Kennedy y Frida ({hora, nombre, cancion, lugar}) y tolera variantes
  const normalize = (raw) => (Array.isArray(raw) ? raw : []).map((p) => {
    const [song, artistFromSong] = split(p.cancion || p.cancionFinal || p.song || '');
    return { name: clean(p.nombre || p.name, 60), song, artist: clean(p.artista || artistFromSong, 80), place: clean(p.lugar, 60) };
  }).filter((p) => p.name && p.song);

  const validUrl = (u, hosts) => {
    try { const x = new URL(u); return x.protocol === 'https:' && hosts.some((h) => x.hostname === h || x.hostname.endsWith(`.${h}`)); } catch { return false; }
  };

  async function refresh(venue) {
    const exec = (db.karaoke.urls[venue] || {}).exec;
    if (!exec) { cache[venue] = { list: [], at: 0, error: 'Falta la dirección de la web app de este local' }; return; }
    const url = `${exec}${exec.includes('?') ? '&' : '?'}modo=json`;
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) }); // /exec responde con una redirección
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(res.ok ? 'La web app no devolvió la lista (¿falta publicar la versión con ?modo=json o el acceso «Cualquier usuario»?)' : `Google respondió ${res.status}`); }
      if (!Array.isArray(data)) throw new Error(clean(data && data.error, 200) || 'Respuesta inesperada de la web app');
      cache[venue] = { list: normalize(data), at: Date.now(), error: '' };
    } catch (err) {
      // Se conserva la última lista buena para que la pantalla no quede vacía por un fallo pasajero
      cache[venue] = { list: (cache[venue] || {}).list || [], at: (cache[venue] || {}).at || 0, error: clean(err && err.message, 200) || 'No se pudo leer la lista' };
    }
  }

  // Solo se consulta a Google mientras el karaoke está en pantalla, para cuidar la cuota de Apps Script
  setInterval(async () => {
    if (db.stage !== 'karaoke' || busy) return;
    busy = true;
    try { await refresh(db.karaoke.venue); } finally { busy = false; }
  }, POLL_MS).unref();

  // Lo que ven las pantallas (público, sin iniciar sesión, igual que el resto de las gráficas)
  app.get('/api/karaoke', (_req, res) => {
    const venue = db.karaoke.venue;
    const c = cache[venue] || { list: [], at: 0, error: '' };
    res.json({ venue, name: VENUES[venue], form: (db.karaoke.urls[venue] || {}).form || '', list: c.list.slice(0, 8), total: c.list.length, at: c.at, stale: !!c.error });
  });

  // Configuración y diagnóstico para el Centro de control
  app.get('/api/karaoke/config', requireAdmin, (_req, res) => {
    const venue = db.karaoke.venue;
    res.json({ venue, venues: VENUES, urls: db.karaoke.urls, status: cache[venue] ? { at: cache[venue].at, error: cache[venue].error, total: cache[venue].list.length } : null });
  });
  app.post('/api/karaoke/config', requireAdmin, async (req, res) => {
    const b = req.body || {};
    if (b.venue != null) {
      if (!VENUES[b.venue]) return fail(res, 400, 'Local no válido');
      db.karaoke.venue = b.venue;
    }
    for (const v of Object.keys(VENUES)) {
      const u = (b.urls || {})[v];
      if (!u) continue;
      const exec = clean(u.exec, 300);
      const form = clean(u.form, 300);
      if (exec && !validUrl(exec, ['script.google.com'])) return fail(res, 400, `La web app de ${VENUES[v]} debe ser una dirección de script.google.com terminada en /exec`);
      if (form && !validUrl(form, ['google.com', 'forms.gle'])) return fail(res, 400, `El formulario de ${VENUES[v]} debe ser una dirección de Google Forms`);
      db.karaoke.urls[v] = { exec, form };
    }
    save();
    await refresh(db.karaoke.venue); // se prueba de inmediato, para avisar si algo quedó mal
    const c = cache[db.karaoke.venue];
    res.json({ venue: db.karaoke.venue, urls: db.karaoke.urls, status: { at: c.at, error: c.error, total: c.list.length } });
  });

  return { refresh: () => refresh(db.karaoke.venue), venues: VENUES };
};
