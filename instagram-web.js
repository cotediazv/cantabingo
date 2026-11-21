// Últimos videos (reels) de Instagram de cada local, para la página web krbstage.cl.
// Usa la conexión oficial de Instagram (API con inicio de sesión de Instagram) con una clave por cuenta.
// Las claves NO van en el repositorio: se ponen en Render como IG_TOKEN_KENNEDY, IG_TOKEN_FRIDA, IG_TOKEN_TOBALABA.
// Las claves duran 60 días; el servidor las renueva solo cada ~30 días y guarda la renovada en los datos.
const VENUES = ['kennedy', 'frida', 'tobalaba'];
// Lugares que KRB Stage produjo antes: sus videos se muestran solo entre las fechas indicadas (usan la misma clave).
// @krbstage2 tiene dos lugares: Mercado del 14 (julio 2023 a marzo 2024; su último video se subió el 1 de abril de 2024 en hora UTC) y Kairos (de abril a diciembre de 2024).
const HISTORICOS = {
  panoramico: { handle: 'krbstage1', hasta: '2026-10-31' },
  kairos: { handle: 'krbstage2', desde: '2024-04-02', hasta: '2024-12-31' },
  laflorida: { handle: 'krbstage2', desde: '2023-07-01', hasta: '2024-04-01' },
};
const TODOS = [...VENUES, ...Object.keys(HISTORICOS)];
const API = process.env.IG_TEST_URL || 'https://graph.instagram.com'; // IG_TEST_URL / FB_TEST_URL solo para pruebas locales
const FB = process.env.FB_TEST_URL || 'https://graph.facebook.com/v21.0';
const CACHE_MS = 30 * 60e3;
const REFRESH_MS = 30 * 24 * 3600e3;
const PER_VENUE = 200; // hasta 200 videos por lugar, del último hacia atrás (la página los muestra de a 6)
const PAGES = 8; // páginas de 100 publicaciones que se revisan como máximo
const CACHE_HIST_MS = 24 * 3600e3; // los lugares históricos ya no publican: se revisan una vez al día

module.exports = function instagramWeb({ app, db, save, insta }) {
  db.webIg ||= {}; // local -> { token, at } (clave renovada)
  const cache = {}; // local -> { videos, at }

  const handleDe = (v) => (HISTORICOS[v] ? HISTORICOS[v].handle : String((insta && insta.handleOf && insta.handleOf(v)) || ''));
  const tokenOf = (v) => {
    const saved = db.webIg[v];
    // los lugares históricos usan la misma clave del portafolio (la de Kennedy) si no tienen una propia
    const env = process.env[`IG_TOKEN_${v.toUpperCase()}`] || (HISTORICOS[v] ? process.env.IG_TOKEN_KENNEDY || '' : '');
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
      const handle = handleDe(v).toLowerCase();
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

  // Videos de un lugar histórico: entre sus fechas, de la más nueva hacia atrás (hasta 60 videos)
  async function historico(v, tk) {
    await mediaFacebook(v, tk); // ubica la cuenta (y confirma que la clave la ve)
    if (!igIds[v]) throw new Error(`@${handleDe(v)} todavía no está conectada a una página de Facebook del portafolio`);
    const lim = new Date(`${HISTORICOS[v].hasta}T23:59:59Z`).getTime();
    const ini = HISTORICOS[v].desde ? new Date(`${HISTORICOS[v].desde}T00:00:00Z`).getTime() : 0;
    let url = `${FB}/${igIds[v]}/media?fields=${FIELDS}&limit=100&access_token=${encodeURIComponent(tk)}`;
    const data = [];
    for (let n = 0; url && n < 25 && data.filter((m) => m.media_type === 'VIDEO').length < PER_VENUE; n++) {
      const r = await getJson(url);
      const lote = r.data || [];
      lote.forEach((m) => { const f = new Date(m.timestamp).getTime(); if (f <= lim && f >= ini) data.push(m); });
      if (!lote.length || new Date(lote[lote.length - 1].timestamp).getTime() < ini) break; // ya pasó la fecha de inicio
      url = r.paging && r.paging.next;
    }
    return { data };
  }

  async function videosOf(v) {
    const c = cache[v];
    const ttl = HISTORICOS[v] ? CACHE_HIST_MS : CACHE_MS;
    if (c && Date.now() - c.at < ttl) return c;
    const token = tokenOf(v);
    if (!token) return { videos: [], flyers: [], error: 'Falta la clave' };
    await refresh(v);
    const tk = db.webIg[v].token;
    const errores = [];
    let j = null;
    const intentos = HISTORICOS[v] ? [() => historico(v, tk)] : [() => mediaInstagram(tk), () => mediaFacebook(v, tk)];
    for (const intento of intentos) {
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
      cache[v] = { videos: (c || {}).videos || [], flyers: (c || {}).flyers || [], error: errores.join(' | '), at: Date.now() - ttl + 2 * 60e3 };
    }
    return cache[v];
  }

  // Búsqueda por fechas en las publicaciones antiguas de un local (ej. la fiesta de los 80, noviembre de 2025)
  const busquedas = {}; // clave -> { data, at }
  app.get('/api/web/instagram/buscar', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const v = String(req.query.local || '');
    const desde = String(req.query.desde || ''), hasta = String(req.query.hasta || '');
    if (!TODOS.includes(v) || !/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return res.status(400).json({ error: 'Usa ?local=kennedy&desde=AAAA-MM-DD&hasta=AAAA-MM-DD' });
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

  // Seguidores de las cuentas de Instagram de KRB Stage (pedido de Cote: bajo «Redes sociales» de la página web).
  // Se leen con la clave del portafolio (la de Kennedy), cada 1 hora y en segundo plano; si una falla, queda el último dato bueno
  const CUENTAS = ['krbstage', 'krbstage1', 'krbstage2', 'krbstage3', 'krbstage4'];
  const SEG_MS = 3600e3;
  const seg = { cuentas: CUENTAS.map((handle) => ({ handle, seguidores: null })), at: 0, cargando: false, error: '' };
  async function calcularSeguidores() {
    const errores = [];
    for (const c of seg.cuentas) {
      // el lugar de esa cuenta (los actuales primero), para usar su propia clave
      const v = TODOS.find((x) => handleDe(x).toLowerCase() === c.handle);
      const tk = v ? (tokenOf(v), (db.webIg[v] || {}).token || '') : '';
      const intentos = [];
      if (tk) {
        // 1) la cuenta tal como la ve el portafolio de Facebook
        intentos.push(async () => {
          if (!igIds[v]) { try { await mediaFacebook(v, tk); } catch (_) {} }
          if (!igIds[v]) throw new Error('sin cuenta en el portafolio');
          return (await getJson(`${FB}/${igIds[v]}?fields=followers_count&access_token=${encodeURIComponent(tk)}`)).followers_count;
        });
        // 2) clave de Instagram de la propia cuenta
        intentos.push(async () => {
          const j = await getJson(`${API}/me?fields=username,followers_count&access_token=${encodeURIComponent(tk)}`);
          if (String(j.username || '').toLowerCase() !== c.handle) throw new Error('la clave es de otra cuenta');
          return j.followers_count;
        });
      }
      const fallos = [];
      for (const intento of intentos) {
        try { const n = await intento(); if (typeof n === 'number') { c.seguidores = n; fallos.length = 0; break; } } catch (e) { fallos.push(e.message); }
      }
      if (!intentos.length) fallos.push('sin clave');
      if (fallos.length && c.seguidores == null) errores.push(`@${c.handle}: ${fallos.join(' / ')}`);
    }
    return errores.join(' | ').slice(0, 400);
  }
  function seguidores() {
    if (!seg.cargando && Date.now() - seg.at > SEG_MS) {
      seg.cargando = true;
      calcularSeguidores()
        .then((error) => { seg.at = Date.now() - (error ? SEG_MS - 10 * 60e3 : 0); seg.error = error; })
        .catch((e) => { seg.at = Date.now() - SEG_MS + 10 * 60e3; seg.error = String(e.message || e).slice(0, 200); }) // reintenta en 10 minutos
        .finally(() => { seg.cargando = false; });
    }
    return seg;
  }
  app.get('/api/web/seguidores', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const s = seguidores();
    res.json({ cuentas: s.cuentas, error: s.error || '' });
  });

  // Pública (solo lectura): la usa la página web
  // ?ligero=1: solo lo que la página muestra primero (los 6 últimos videos de cada lugar);
  // el resto se pide con /api/web/instagram/lugar?local=… cuando alguien pasa de página o abre la pantalla completa
  app.get('/api/web/instagram', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const ligero = !!req.query.ligero;
    const out = {};
    await Promise.all(TODOS.map(async (v) => {
      const r = await videosOf(v);
      // «error» ayuda a revisar la conexión; nunca incluye la clave
      out[v] = { handle: handleDe(v), videos: ligero ? r.videos.slice(0, 6) : r.videos, total: r.videos.length, flyers: r.flyers || [], error: r.error || '' };
    }));
    res.json(out);
  });
  app.get('/api/web/instagram/lugar', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const v = String(req.query.local || '');
    if (!TODOS.includes(v)) return res.status(400).json({ error: 'Lugar no válido' });
    const r = await videosOf(v);
    res.json({ videos: r.videos });
  });
};
