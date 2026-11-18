// Últimos videos (reels) de Instagram de cada local, para la página web krbstage.cl.
// Usa la conexión oficial de Instagram (API con inicio de sesión de Instagram) con una clave por cuenta.
// Las claves NO van en el repositorio: se ponen en Render como IG_TOKEN_KENNEDY, IG_TOKEN_FRIDA, IG_TOKEN_TOBALABA.
// Las claves duran 60 días; el servidor las renueva solo cada ~30 días y guarda la renovada en los datos.
const VENUES = ['kennedy', 'frida', 'tobalaba'];
const API = process.env.IG_TEST_URL || 'https://graph.instagram.com'; // IG_TEST_URL / FB_TEST_URL solo para pruebas locales
const FB = process.env.FB_TEST_URL || 'https://graph.facebook.com/v21.0';
const CACHE_MS = 30 * 60e3;
const REFRESH_MS = 30 * 24 * 3600e3;
const PER_VENUE = 60; // todos los videos (hasta 60 por local, para que la página cargue liviana)
const PAGES = 5; // páginas de 100 publicaciones que se revisan como máximo

module.exports = function instagramWeb({ app, db, save, insta }) {
  db.webIg ||= {}; // local -> { token, at } (clave renovada)
  const cache = {}; // local -> { videos, at }

  const tokenOf = (v) => {
    const saved = db.webIg[v];
    const env = process.env[`IG_TOKEN_${v.toUpperCase()}`] || '';
    // Si cambian la clave en Render, se usa la nueva
    if (env && (!saved || saved.env !== env)) { db.webIg[v] = { token: env, env, at: Date.now() }; save(); }
    return (db.webIg[v] || {}).token || '';
  };

  // Las claves de Instagram («IG…») duran 60 días y se renuevan solas; las de Facebook (usuario del sistema) no caducan
  async function refresh(v) {
    const s = db.webIg[v];
    if (!s || !s.token || !/^IG/.test(s.token) || Date.now() - s.at < REFRESH_MS) return;
    try {
      const r = await fetch(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(s.token)}`, { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (j && j.access_token) { db.webIg[v] = { ...s, token: j.access_token, at: Date.now() }; save(); }
    } catch (_) { /* se reintenta en la próxima lectura */ }
  }

  const getJson = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (!j || j.error) throw new Error(String((j && j.error && j.error.message) || 'Respuesta vacía').slice(0, 200));
    return j;
  };
  const FIELDS = 'id,media_type,media_url,thumbnail_url,permalink,timestamp';
  const igIds = {}; // local -> id de la cuenta de Instagram (camino de Facebook)

  // Camino 1: clave de Instagram (graph.instagram.com/me/media)
  // Sigue las páginas de resultados de Instagram hasta juntar los videos (o revisar PAGES páginas)
  async function todas(primera) {
    const data = [...(primera.data || [])];
    let next = primera.paging && primera.paging.next, n = 1;
    while (next && n < PAGES && data.filter((m) => m.media_type === 'VIDEO').length < PER_VENUE) {
      try { const r = await getJson(next); data.push(...(r.data || [])); next = r.paging && r.paging.next; n++; } catch (_) { break; }
    }
    return { data };
  }
  const mediaInstagram = async (token) => todas(await getJson(`${API}/me/media?fields=${FIELDS}&limit=100&access_token=${encodeURIComponent(token)}`));
  // Camino 2: clave de Facebook (usuario del sistema): se busca la cuenta de Instagram del local y se leen sus publicaciones
  async function mediaFacebook(v, token) {
    const t = encodeURIComponent(token);
    if (!igIds[v]) {
      const handle = String((insta && insta.handleOf && insta.handleOf(v)) || '').toLowerCase();
      const cuentas = [];
      const sumar = (lista) => lista.filter((c) => c && c.id).forEach((c) => cuentas.push(c));
      // a) páginas de Facebook asignadas a la clave, con su cuenta de Instagram
      let motivo = '';
      try { const r = await getJson(`${FB}/me/accounts?fields=instagram_business_account{id,username}&limit=100&access_token=${t}`); sumar((r.data || []).map((p) => p.instagram_business_account)); } catch (e) { motivo = e.message; }
      // b) portafolios (negocios) de la clave: sus cuentas de Instagram y las de sus páginas
      if (!cuentas.length) {
        try {
          const bs = await getJson(`${FB}/me/businesses?fields=id&limit=20&access_token=${t}`);
          for (const bz of bs.data || []) {
            try { const r = await getJson(`${FB}/${bz.id}/instagram_business_accounts?fields=id,username&limit=100&access_token=${t}`); sumar(r.data || []); } catch (_) {}
            try { const r = await getJson(`${FB}/${bz.id}/owned_pages?fields=instagram_business_account{id,username}&limit=100&access_token=${t}`); sumar((r.data || []).map((p) => p.instagram_business_account)); } catch (_) {}
          }
        } catch (_) {}
      }
      const mia = cuentas.find((c) => String(c.username || '').toLowerCase() === handle);
      // Cuenta sin página propia (ej. Frida, Tobalaba): se leen sus publicaciones públicas a través de otra cuenta del portafolio
      if (!mia && cuentas.length) {
        const r = await getJson(`${FB}/${cuentas[0].id}?fields=business_discovery.username(${encodeURIComponent(handle)}){media.limit(100){${FIELDS}}}&access_token=${t}`);
        const media = (r.business_discovery && r.business_discovery.media) || {};
        return { data: media.data || [] };
      }
      if (!mia) {
        let quien = '';
        try { const me = await getJson(`${FB}/me?fields=id,name&access_token=${t}`); if (me.name || me.id) quien = ` (la clave es de «${me.name || me.id}»)`; } catch (e) { quien = ` (Facebook dice: ${e.message})`; }
        if (motivo && !quien.includes(motivo)) quien += ` (páginas: ${motivo})`;
        throw new Error(`No se encontró la cuenta @${handle}: la clave no tiene cuentas de Instagram asignadas${cuentas.length ? ' salvo ' + cuentas.map((c) => '@' + c.username).join(', ') : ''}${quien}`);
      }
      igIds[v] = mia.id;
    }
    return todas(await getJson(`${FB}/${igIds[v]}/media?fields=${FIELDS}&limit=100&access_token=${t}`));
  }

  async function videosOf(v) {
    const c = cache[v];
    if (c && Date.now() - c.at < CACHE_MS) return c;
    const token = tokenOf(v);
    if (!token) return { videos: [], flyers: [], error: 'Falta la clave' };
    await refresh(v);
    const tk = db.webIg[v].token;
    const errores = [];
    let j = null;
    for (const intento of [() => mediaInstagram(tk), () => mediaFacebook(v, tk)]) {
      try { j = await intento(); break; } catch (e) { errores.push(e.message); }
    }
    if (j && Array.isArray(j.data)) {
      const videos = j.data.filter((m) => m.media_type === 'VIDEO' && m.media_url).slice(0, PER_VENUE)
        .map((m) => ({ url: m.media_url, poster: m.thumbnail_url || '', link: m.permalink || '', date: m.timestamp || '' }));
      // Flyers de la cartelera: las 4 publicaciones de imagen más recientes
      const flyers = j.data.filter((m) => (m.media_type === 'IMAGE' || m.media_type === 'CAROUSEL_ALBUM') && m.media_url).slice(0, 4)
        .map((m) => ({ url: m.media_url, link: m.permalink || '', date: m.timestamp || '' }));
      cache[v] = { videos, flyers, error: '', at: Date.now() };
    } else {
      // Si falla, se sigue mostrando lo último bueno y se reintenta en 2 minutos
      cache[v] = { videos: (c || {}).videos || [], flyers: (c || {}).flyers || [], error: errores.join(' | '), at: Date.now() - CACHE_MS + 2 * 60e3 };
    }
    return cache[v];
  }

  // Búsqueda por fechas en las publicaciones antiguas de un local (ej. la fiesta de los 80, noviembre de 2025)
  const busquedas = {}; // clave -> { data, at }
  app.get('/api/web/instagram/buscar', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const v = String(req.query.local || '');
    const desde = String(req.query.desde || ''), hasta = String(req.query.hasta || '');
    if (!VENUES.includes(v) || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return res.status(400).json({ error: 'Usa ?local=kennedy&desde=AAAA-MM-DD&hasta=AAAA-MM-DD' });
    const clave = `${v}|${desde}|${hasta}`;
    const c = busquedas[clave];
    if (c && Date.now() - c.at < CACHE_MS) return res.json(c.data);
    try {
      const token = tokenOf(v);
      if (!token) throw new Error('Falta la clave');
      if (!igIds[v]) await mediaFacebook(v, token);
      if (!igIds[v]) throw new Error('No se encontró la cuenta del local');
      const t = encodeURIComponent(db.webIg[v].token);
      const ini = new Date(`${desde}T00:00:00Z`).getTime(), fin = new Date(`${hasta}T23:59:59Z`).getTime();
      let url = `${FB}/${igIds[v]}/media?fields=${FIELDS}&limit=100&access_token=${t}`;
      const hallados = [];
      for (let n = 0; url && n < 25; n++) {
        const r = await getJson(url);
        const data = r.data || [];
        data.forEach((m) => { const f = new Date(m.timestamp).getTime(); if (f >= ini && f <= fin) hallados.push(m); });
        const ultimo = data.length ? new Date(data[data.length - 1].timestamp).getTime() : 0;
        if (!data.length || ultimo < ini) break; // ya se pasó la fecha buscada
        url = r.paging && r.paging.next;
      }
      const out = {
        local: v, desde, hasta,
        videos: hallados.filter((m) => m.media_type === 'VIDEO' && m.media_url).map((m) => ({ url: m.media_url, poster: m.thumbnail_url || '', link: m.permalink || '', date: m.timestamp || '' })),
        imagenes: hallados.filter((m) => m.media_type !== 'VIDEO' && m.media_url).map((m) => ({ url: m.media_url, link: m.permalink || '', date: m.timestamp || '' })),
      };
      busquedas[clave] = { data: out, at: Date.now() };
      res.json(out);
    } catch (e) {
      res.status(502).json({ error: String(e.message || e).slice(0, 200) });
    }
  });

  // Pública (solo lectura): la usa la página web
  app.get('/api/web/instagram', async (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const out = {};
    await Promise.all(VENUES.map(async (v) => {
      const r = await videosOf(v);
      // «error» ayuda a revisar la conexión; nunca incluye la clave
      out[v] = { handle: (insta && insta.handleOf && insta.handleOf(v)) || '', videos: r.videos, flyers: r.flyers || [], error: r.error || '' };
    }));
    res.json(out);
  });
};
