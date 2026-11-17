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
const TOBALABA_EXEC = 'https://script.google.com/macros/s/AKfycbx7ZEyg6MmDsxtV9Bfl3fRLFKD__V15ew-qwZ0woYotwpXnOd19odhPyd9QWDJBP8Rm/exec';
DEFAULTS.tobalaba.exec = TOBALABA_EXEC;
const POLL_MS = 3000; // cada cuánto se consulta a Google mientras el karaoke está en pantalla
const TIMEOUT_MS = 10000; // Apps Script puede tardar en un arranque en frío
const MAX_ACTIVE = 2; // pedidos sin cantar que puede tener una persona a la vez
const SEPARATORS = [' – ', ' • ', ' - ']; // "Canción – Artista": se corta por la última aparición

module.exports = function karaoke({ app, db, save, requireAdmin, requireLocal = requireAdmin, fail, findPlayer, salaVenue, lightVenue = () => '', extraVenues = () => [] }) {
  db.karaoke ||= {};
  db.karaoke.venue ||= 'frida';
  // Los pedidos se hacen desde la Sala de juegos: quedan activados (el interruptor del Centro de control los puede apagar)
  if (!db.karaoke.phoneDefault) { db.karaoke.phone = true; db.karaoke.phoneDefault = true; }
  // Local en uso: el de la sala de juegos abierta (se eligió al crearla); si no hay sala, el elegido en el Centro de control
  const venueNow = () => { const v = salaVenue(); return VENUES[v] ? v : db.karaoke.venue; };
  db.karaoke.urls ||= {};
  for (const v of Object.keys(VENUES)) db.karaoke.urls[v] = { ...DEFAULTS[v], ...(db.karaoke.urls[v] || {}) };
  // Tobalaba: la web app correcta es la implementación que tiene Sala.gs (16 nov, decisión de Cote).
  // Se pone una sola vez; si después se cambia en el Centro de control, se respeta.
  if (!db.karaoke.tobalabaExec16nov) {
    db.karaoke.urls.tobalaba.exec = TOBALABA_EXEC;
    db.karaoke.tobalabaExec16nov = true;
    save();
  }

  // Lo último que se leyó bien de cada local. Si una consulta falla, se sigue mostrando esto.
  const cache = {}; // local -> { list, at, error }
  let busy = false;

  const clean = (v, max = 80) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
  // Título sin lo que venga entre paréntesis: «Como la Flor (Live)» → «Como la Flor». Si no queda nada, se deja como estaba.
  // Excepción (decisión de Cote): se conservan los paréntesis que indican una versión especial, para que el DJ
  // ponga la correcta (ej. «No me ames (Versión Salsa)»). Los demás se quitan («Remastered», «feat.»…).
  const VERSION_RE = /versi[oó]n|tropical|salsa|ac[uú]stic|en vivo|\blive\b|remix|balada|cumbia|bachata|merengue|unplugged|mariachi/i;
  const bare = (v) => {
    const t = clean(v, 200);
    const keep = (m, inner) => (inner && VERSION_RE.test(inner) && !/remaster|feat\.?|ft\./i.test(inner) ? ` (${inner.trim()})` : ' ');
    return clean(t.replace(/\s*[(（]([^)）]*)[)）]?/g, keep), 80) || clean(t, 80);
  };
  const split = (text) => {
    const t = clean(text, 160);
    for (const sep of SEPARATORS) {
      const i = t.lastIndexOf(sep);
      if (i > 0) return [t.slice(0, i).trim(), t.slice(i + sep.length).trim()];
    }
    return [t, ''];
  };
  // Acepta el formato de Kennedy y Frida ({hora, nombre, cancion, lugar, id}) y tolera variantes.
  // Se guardan también el ID y los textos tal como vienen de la planilla: «Ya cantó», Subir y Bajar los necesitan.
  const normalize = (raw) => (Array.isArray(raw) ? raw : []).map((p) => {
    const [song, artistFromSong] = split(p.cancion || p.cancionFinal || p.song || '');
    return {
      name: clean(p.nombre || p.name, 60), song, artist: clean(p.artista || artistFromSong, 80), place: clean(p.lugar, 60),
      id: /^P\d{1,20}$/.test(String(p.id || '').trim()) ? String(p.id).trim() : '',
      raw: { nombre: String(p.nombre == null ? '' : p.nombre).slice(0, 200), cancion: String(p.cancion == null ? '' : p.cancion).slice(0, 300) },
    };
  }).filter((p) => p.name && p.song);
  const pub = ({ raw, id, ...p }) => p; // las pantallas no necesitan el ID ni los textos originales

  const validUrl = (u, hosts) => {
    try { const x = new URL(u); return x.protocol === 'https:' && hosts.some((h) => x.hostname === h || x.hostname.endsWith(`.${h}`)); } catch { return false; }
  };

  // Cada cambio guardado desde el panel sube este número. Una lectura que empezó ANTES de un cambio
  // trae la lista vieja: se descarta, para que la lista no salte hacia atrás.
  let writes = 0;
  async function refresh(venue) {
    const startedAt = writes;
    const exec = (db.karaoke.urls[venue] || {}).exec;
    if (!exec) { cache[venue] = { list: [], at: 0, error: 'Falta la dirección de la web app de este local' }; return; }
    const url = `${exec}${exec.includes('?') ? '&' : '?'}modo=json`;
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) }); // /exec responde con una redirección
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(res.ok ? 'La web app no devolvió la lista (¿falta publicar la versión con ?modo=json o el acceso «Cualquier usuario»?)' : `Google respondió ${res.status}`); }
      if (!Array.isArray(data)) throw new Error(clean(data && data.error, 200) || 'Respuesta inesperada de la web app');
      if (startedAt !== writes) return;
      cache[venue] = { list: normalize(data), at: Date.now(), error: '' };
    } catch (err) {
      // Se conserva la última lista buena para que la pantalla no quede vacía por un fallo pasajero
      cache[venue] = { list: (cache[venue] || {}).list || [], at: (cache[venue] || {}).at || 0, error: clean(err && err.message, 200) || 'No se pudo leer la lista' };
    }
  }

  // Solo se consulta a Google mientras el karaoke está en pantalla, para cuidar la cuota de Apps Script.
  // La sala light pide además el local que ella usa (extraVenues).
  setInterval(async () => {
    if (busy) return;
    const venues = [...new Set([...(db.stage === 'karaoke' ? [venueNow()] : []), ...extraVenues().filter((v) => VENUES[v])])];
    if (!venues.length) return;
    busy = true;
    try { for (const v of venues) await refresh(v); } finally { busy = false; }
  }, POLL_MS).unref();
  // Local de una consulta: el que se pide (sala light, ?local=), o el de la sala principal
  const pickVenue = (req) => {
    const l = String((req.query || {}).local || (req.body || {}).local || '');
    return VENUES[l] ? l : (lightVenue(String((req.query || {}).sid || (req.body || {}).sid || '')) || venueNow());
  };

  // Lo que ven las pantallas (público, sin iniciar sesión, igual que el resto de las gráficas)
  // Cuántos pedidos sin cantar tiene una persona en la cola, y en qué puesto está el primero
  const same = (a, b) => clean(a).toLocaleUpperCase('es') === clean(b).toLocaleUpperCase('es');
  const standing = (venue, name) => {
    const list = (cache[venue] || {}).list || [];
    return { count: list.filter((p) => same(p.name, name)).length, first: list.findIndex((p) => same(p.name, name)), max: MAX_ACTIVE };
  };
  app.get('/api/karaoke', (req, res) => {
    const venue = pickVenue(req);
    const c = cache[venue] || { list: [], at: 0, error: '' };
    const pl = req.query.token ? findPlayer(String(req.query.sid || ''), String(req.query.token)) : null;
    res.json({ me: pl ? standing(venue, pl.name) : null, venue, name: VENUES[venue], phone: !!db.karaoke.phone, ask: askFor(venue), form: (db.karaoke.urls[venue] || {}).form || '', list: c.list.slice(0, 8).map(pub), total: c.list.length, at: c.at, stale: !!c.error });
  });

  // Configuración y diagnóstico para el Centro de control
  app.get('/api/karaoke/config', requireAdmin, async (_req, res) => {
    const venue = venueNow();
    // El Centro de control muestra siempre una lectura del momento, no una guardada
    if (!cache[venue] || Date.now() - (cache[venue].checked || 0) > 5000) { await refresh(venue); cache[venue].checked = Date.now(); }
    res.json({ venue, fromSala: !!VENUES[salaVenue()], venues: VENUES, phone: !!db.karaoke.phone, urls: db.karaoke.urls, status: cache[venue] ? { at: cache[venue].at, error: cache[venue].error, total: cache[venue].list.length } : null });
  });
  app.post('/api/karaoke/config', requireAdmin, async (req, res) => {
    const b = req.body || {};
    if (b.phone != null) db.karaoke.phone = !!b.phone; // pedidos desde el celular: activados o no
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
    await refresh(venueNow()); // se prueba de inmediato, para avisar si algo quedó mal
    const c = cache[venueNow()];
    res.json({ venue: venueNow(), fromSala: !!VENUES[salaVenue()], phone: !!db.karaoke.phone, urls: db.karaoke.urls, status: { at: c.at, error: c.error, total: c.list.length } });
  });

  // ---------- «Ya cantó», Subir y Bajar desde el panel del animador ----------
  // Hace lo mismo que los botones de AppSheet, a través de la función Sala.gs del Apps Script del local
  // (doPost): solo agrega una fila en «Cantados» o en «Orden». La clave va en la variable KARAOKE_CLAVE
  // de Render y en la propiedad SALA_CLAVE del script; nunca en el repositorio.
  // Los botones aparecen solo cuando hay clave y la lista del local ya trae el ID de cada pedido.
  const KEY = String(process.env.KARAOKE_CLAVE || '');
  // Un local queda «con botones» cuando su lista trae el ID; se recuerda, para que no desaparezcan
  // cuando la lista queda vacía (por ejemplo, al marcar «Ya cantó» al último pedido).
  db.karaoke.withIds ||= {};
  const editable = (venue) => {
    const list = (cache[venue] || {}).list || [];
    if (list.length) {
      const has = list.some((p) => p.id);
      if (has !== !!db.karaoke.withIds[venue]) { db.karaoke.withIds[venue] = has; save(); }
    }
    return !!KEY && !!db.karaoke.withIds[venue];
  };
  app.get('/api/karaoke/cola', requireLocal, (req, res) => {
    const venue = pickVenue(req);
    const c = cache[venue] || { list: [], at: 0, error: '' };
    res.json({ venue, name: VENUES[venue], phone: !!db.karaoke.phone, edit: editable(venue), list: c.list.map(({ raw, ...p }) => p), total: c.list.length, at: c.at, stale: !!c.error });
  });
  // Llama a Sala.gs del local con la clave. /exec responde con una redirección; fetch la sigue con GET y ahí viene la respuesta.
  async function callScript(venue, body) {
    if (!KEY) throw new Error('Falta configurar la clave del karaoke en el servidor (KARAOKE_CLAVE)');
    const exec = (db.karaoke.urls[venue] || {}).exec;
    if (!exec) throw new Error('Falta la dirección de la web app de este local');
    const r = await fetch(exec, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ clave: KEY, ...body }), redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { throw new Error(r.ok ? 'La web app no respondió como se esperaba (¿falta instalar Sala.gs y publicar con Nueva versión?)' : `Google respondió ${r.status}`); }
    if (!data || data.error || !data.ok) throw new Error(clean(data && data.error, 200) || 'La planilla no confirmó el cambio');
    return data;
  }
  let acting = false;
  app.post('/api/karaoke/accion', requireLocal, async (req, res) => {
    const b = req.body || {};
    const venue = pickVenue(req);
    if (!['cantado', 'subir', 'bajar'].includes(b.accion)) return fail(res, 400, 'Acción no válida');
    const p = ((cache[venue] || {}).list || []).find((x) => x.id && x.id === String(b.id || ''));
    if (!p) return fail(res, 409, 'Ese pedido ya no está en la lista. Revisa la lista actualizada.');
    if (acting) return fail(res, 429, 'Se está guardando el cambio anterior. Intenta de nuevo en un segundo.');
    acting = true;
    try {
      await callScript(venue, { accion: b.accion, id: p.id, nombre: p.raw.nombre, cancion: p.raw.cancion });
      // Se responde de inmediato con el cambio ya hecho en la lista; la lectura de Google se hace después
      writes++;
      const list = [...((cache[venue] || {}).list || [])];
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) {
        if (b.accion === 'cantado') list.splice(i, 1);
        else { const j = b.accion === 'subir' ? i - 1 : i + 1; if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; }
        cache[venue] = { ...cache[venue], list };
      }
      refresh(venue);
      res.json({ ok: true });
    } catch (err) {
      fail(res, 502, `No se pudo guardar: ${clean(err && err.message, 200)}`);
    } finally { acting = false; }
  });
  // «Ya cantaron»: marcas de esta noche en «Cantados», para revisar y deshacer un error
  const timeRe = /^(\d{1,2}\/\d{1,2}\/\d{4} )?(\d{1,2}:\d{2})(:\d{2})? /;
  app.get('/api/karaoke/cantados', requireLocal, async (req, res) => {
    try {
      const data = await callScript(pickVenue(req), { accion: 'cantados' });
      const list = (Array.isArray(data.lista) ? data.lista : []).map((x) => {
        const key = String(x.clave || '').slice(0, 400);
        const m = key.match(timeRe);
        return { fila: Number(x.fila) || 0, key, hora: m ? m[2] : '', text: clean(m ? key.slice(m[0].length) : key, 200), at: Number(x.at) || 0 };
      }).filter((x) => x.fila >= 2);
      res.json({ list });
    } catch (err) { fail(res, 502, `No se pudo leer «Ya cantaron»: ${clean(err && err.message, 200)}`); }
  });
  app.post('/api/karaoke/volver', requireLocal, async (req, res) => {
    const b = req.body || {};
    const fila = Number(b.fila);
    if (!(fila >= 2)) return fail(res, 400, 'Marca no válida');
    if (acting) return fail(res, 429, 'Se está guardando el cambio anterior. Intenta de nuevo en un segundo.');
    acting = true;
    try {
      await callScript(pickVenue(req), { accion: 'volver', fila, claveFila: String(b.key || '').slice(0, 400) });
      writes++;
      refresh(pickVenue(req)); // el pedido vuelve a la lista cuando Google lo confirma
      res.json({ ok: true });
    } catch (err) {
      fail(res, 502, `No se pudo deshacer: ${clean(err && err.message, 200)}`);
    } finally { acting = false; }
  });

  // ---------- Pedidos desde el celular ----------
  // La persona ya está inscrita en la sala con su nombre: solo escribe la canción y la de reemplazo.
  // El pedido se envía al MISMO formulario de Google del local, como si lo hubiera llenado a mano,
  // así el detector de repetidas, la planilla y la app del equipo siguen funcionando igual.
  const forms = {}; // local -> { action, fields: [{ id, title, required, options }] } (estructura leída del formulario)
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  async function loadForm(venue) {
    if (forms[venue] && Date.now() - forms[venue].at < 6 * 3600e3) return forms[venue];
    const url = (db.karaoke.urls[venue] || {}).form;
    if (!url) throw new Error('Falta el formulario de pedidos de este local');
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
    const html = await res.text();
    const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);\s*<\/script>/);
    if (!m) throw new Error('No se pudo leer la estructura del formulario');
    const data = JSON.parse(m[1]);
    const fields = (data[1][1] || []).filter((q) => Array.isArray(q[4]) && q[4][0]).map((q) => ({
      id: q[4][0][0], title: String(q[1] || ''), required: !!q[4][0][2], options: (q[4][0][1] || []).map((o) => o[0]).filter(Boolean),
    }));
    forms[venue] = { action: res.url.replace(/\/viewform.*$/, '/formResponse'), fields, at: Date.now() };
    remember(venue, forms[venue]);
    return forms[venue];
  }
  // A qué pregunta del formulario corresponde cada dato, según su título
  const pick = (fields, test) => fields.find((f) => test(norm(f.title)));
  function mapFields(fields) {
    const alt = (t) => /re+mplazo|alternativ|segunda|opcion 2|respaldo/.test(t);
    return {
      name: pick(fields, (t) => /nombre/.test(t) && !alt(t)),
      song: pick(fields, (t) => /cancion|tema/.test(t) && !alt(t) && !/artista/.test(t)),
      artist: pick(fields, (t) => /artista|interprete|banda/.test(t) && !alt(t)),
      altSong: pick(fields, (t) => /cancion|tema/.test(t) && alt(t) && !/artista/.test(t)),
      altArtist: pick(fields, (t) => /artista|interprete|banda/.test(t) && alt(t)),
    };
  }
  // Preguntas de opción del formulario: el lugar donde está la persona, y las demás (dónde canta, adulto o niño…)
  const isPlace = (f) => /lugar/.test(norm(f.title)) && f.options.length > 0;
  const placeField = (fields) => fields.find(isPlace) || null;
  function choiceFields(fields) {
    const text = new Set(Object.values(mapFields(fields)).filter(Boolean).map((f) => f.id));
    return fields.filter((f) => f.options.length && !text.has(f.id) && !isPlace(f));
  }
  // Lo que cada local pregunta queda guardado, para que la inscripción y el celular lo tengan sin consultar a Google cada vez
  db.karaoke.ask ||= {};
  function remember(venue, form) {
    const place = placeField(form.fields);
    db.karaoke.ask[venue] = {
      places: place ? place.options.map((o) => o.trim()).filter(Boolean) : [],
      choices: choiceFields(form.fields).map((f) => ({ id: String(f.id), title: f.title.trim(), required: f.required, options: f.options.map((o) => o.trim()).filter(Boolean) })),
      at: Date.now(),
    };
    save();
  }
  const askFor = (venue) => db.karaoke.ask[venue] || { places: [], choices: [] };
  // Al arrancar y cada 6 horas se releen los formularios, por si cambian sus opciones
  const learnForms = async () => { for (const v of Object.keys(VENUES)) { try { delete forms[v]; await loadForm(v); } catch { /* se reintenta en la próxima vuelta */ } } };
  setTimeout(learnForms, 4000).unref();
  setInterval(learnForms, 6 * 3600e3).unref();
  // Buscador de canciones de respaldo: consulta el catálogo de iTunes desde el servidor y recuerda cada
  // búsqueda 12 horas, para no gastar el cupo de iTunes cuando muchas personas escriben lo mismo.
  const songCache = new Map();
  const tidySongs = (results) => {
    const seen = new Set();
    return (Array.isArray(results) ? results : []).map((x) => ({ song: bare(x.trackName), artist: clean(x.artistName, 60) }))
      .filter((x) => x.song && x.artist && !seen.has(`${x.song}|${x.artist}`.toLowerCase()) && seen.add(`${x.song}|${x.artist}`.toLowerCase())).slice(0, 5);
  };
  app.get('/api/songs', async (req, res) => {
    const q = norm(clean(req.query.q, 60));
    if (q.length < 3) return res.json({ list: [] });
    const hit = songCache.get(q);
    if (hit && Date.now() - hit.at < 12 * 3600e3) return res.json({ list: hit.list });
    try {
      const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=10&country=CL&term=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`iTunes respondió ${r.status}`);
      const list = tidySongs((await r.json()).results);
      if (songCache.size > 3000) songCache.clear();
      songCache.set(q, { list, at: Date.now() });
      res.json({ list });
    } catch (err) { res.json({ list: [], error: clean(err && err.message, 120) }); }
  });
  // Revisión sin envío: muestra qué preguntas tiene el formulario del local y a cuál iría cada dato
  app.get('/api/karaoke/form-check', requireAdmin, async (req, res) => {
    const venue = VENUES[req.query.venue] ? req.query.venue : venueNow();
    try {
      delete forms[venue];
      const form = await loadForm(venue);
      const map = mapFields(form.fields);
      res.json({ venue, action: form.action, fields: form.fields, map: Object.fromEntries(Object.entries(map).map(([k, f]) => [k, f ? f.title : null])), ask: askFor(venue) });
    } catch (err) { fail(res, 502, clean(err && err.message, 200)); }
  });
  const recent = {}; // nombre -> último envío, para que nadie mande pedidos en ráfaga

  app.post('/api/karaoke/request', async (req, res) => {
    const b = req.body || {};
    const pl = findPlayer(String(b.sid || ''), String(b.token || ''));
    if (!pl) return fail(res, 403, 'Primero únete a la sala con tu nombre');
    // En la sala light el karaoke está siempre abierto; en la principal, solo cuando está en pantalla
    const light = lightVenue(String(b.sid || ''));
    const venue = light || venueNow();
    if (!light && db.stage !== 'karaoke') return fail(res, 400, 'El karaoke no está abierto en este momento');
    if (!db.karaoke.phone) return fail(res, 400, 'Por ahora no se están recibiendo pedidos desde el celular');
    const song = bare(b.song);
    const artist = clean(b.artist, 60);
    const altSong = bare(b.altSong);
    const altArtist = clean(b.altArtist, 60);
    if (!song || !artist) return fail(res, 400, 'Escribe la canción y su artista');
    if (!altSong || !altArtist) return fail(res, 400, 'Escribe también una canción de reemplazo y su artista');
    // Máximo 2 pedidos sin cantar por persona: al cantar uno, puede pedir otro
    if (standing(venue, pl.name).count >= MAX_ACTIVE) return fail(res, 409, `Ya tienes ${MAX_ACTIVE} canciones en la lista. Priorizamos a quienes no han cantado: cuando cantes una, podrás pedir otra.`);
    if (recent[pl.name] && Date.now() - recent[pl.name] < 20000) return fail(res, 429, 'Tu pedido anterior se está registrando. Espera unos segundos para enviar otro.');
    try {
      const form = await loadForm(venue);
      const map = mapFields(form.fields);
      const missing = ['name', 'song', 'artist', 'altSong', 'altArtist'].filter((k) => !map[k]);
      if (missing.length) throw new Error(`El formulario no tiene preguntas reconocibles para: ${missing.join(', ')}`);
      const values = { name: pl.name, song, artist, altSong, altArtist };
      const body = new URLSearchParams();
      const used = new Set();
      for (const [k, f] of Object.entries(map)) { body.append(`entry.${f.id}`, values[k]); used.add(f.id); }
      // Se envía siempre la opción tal como está escrita en el formulario (algunas terminan en espacio)
      const exact = (f, v) => f.options.find((o) => o.trim() === String(v || '').trim());
      const answers = b.answers && typeof b.answers === 'object' ? b.answers : {};
      // Lugar: el que la persona eligió al entrar a la sala; si entró sin él, el que elige al pedir
      const place = placeField(form.fields);
      if (place) {
        const v = exact(place, pl.place) || exact(place, answers.place);
        if (!v) return fail(res, 400, 'Elige el lugar donde estás');
        body.append(`entry.${place.id}`, v);
        used.add(place.id);
      }
      // Las demás preguntas de opción (dónde quiere cantar, adulto o niño…) las responde la persona
      for (const f of choiceFields(form.fields)) {
        const v = exact(f, answers[String(f.id)]);
        if (!v && f.required) return fail(res, 400, `Falta responder: ${f.title.trim()}`);
        if (v) body.append(`entry.${f.id}`, v);
        used.add(f.id);
      }
      for (const f of form.fields) if (!used.has(f.id) && f.required) throw new Error(`El formulario exige «${f.title.trim()}», que no se puede responder desde el celular`);
      const out = await fetch(form.action, { method: 'POST', body, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!out.ok) throw new Error(`Google no aceptó el pedido (${out.status})`);
      recent[pl.name] = Date.now();
      refresh(venue);
      res.json({ ok: true });
    } catch (err) {
      fail(res, 502, `No se pudo enviar el pedido: ${clean(err && err.message, 160)}. Puedes pedirlo con el código QR de la pantalla.`);
    }
  });

  return { refresh: () => refresh(venueNow()), refreshVenue: (v) => (VENUES[v] ? refresh(v) : null), venues: VENUES, placesFor: (venue) => askFor(venue).places };
};
