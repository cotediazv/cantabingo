// Últimos videos (reels) de Instagram de cada local, para la página web krbstage.cl.
// Usa la conexión oficial de Instagram (API con inicio de sesión de Instagram) con una clave por cuenta.
// Las claves NO van en el repositorio: se ponen en Render como IG_TOKEN_KENNEDY, IG_TOKEN_FRIDA, IG_TOKEN_TOBALABA.
// Las claves duran 60 días; el servidor las renueva solo cada ~30 días y guarda la renovada en los datos.
const VENUES = ['kennedy', 'frida', 'tobalaba'];
const API = process.env.IG_TEST_URL || 'https://graph.instagram.com'; // IG_TEST_URL / FB_TEST_URL solo para pruebas locales
const FB = process.env.FB_TEST_URL || 'https://graph.facebook.com/v21.0';
const CACHE_MS = 30 * 60e3;
const REFRESH_MS = 30 * 24 * 3600e3;
const PER_VENUE = 3;

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
  const mediaInstagram = (token) => getJson(`${API}/me/media?fields=${FIELDS}&limit=30&access_token=${encodeURIComponent(token)}`);
  // Camino 2: clave de Facebook (usuario del sistema): se busca la cuenta de Instagram del local y se leen sus publicaciones
  async function mediaFacebook(v, token) {
    const t = encodeURIComponent(token);
    if (!igIds[v]) {
      const handle = String((insta && insta.handleOf && insta.handleOf(v)) || '').toLowerCase();
      const pages = await getJson(`${FB}/me/accounts?fields=instagram_business_account{id,username}&limit=100&access_token=${t}`);
      const cuentas = (pages.data || []).map((p) => p.instagram_business_account).filter(Boolean);
      const mia = cuentas.find((c) => String(c.username || '').toLowerCase() === handle) || (cuentas.length === 1 ? cuentas[0] : null);
      if (!mia) throw new Error(`No se encontró la cuenta @${handle} entre las páginas de la clave (${cuentas.map((c) => '@' + c.username).join(', ') || 'ninguna'})`);
      igIds[v] = mia.id;
    }
    return getJson(`${FB}/${igIds[v]}/media?fields=${FIELDS}&limit=30&access_token=${t}`);
  }

  async function videosOf(v) {
    const c = cache[v];
    if (c && Date.now() - c.at < CACHE_MS) return c;
    const token = tokenOf(v);
    if (!token) return { videos: [], error: 'Falta la clave' };
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
      cache[v] = { videos, error: '', at: Date.now() };
    } else {
      // Si falla, se sigue mostrando lo último bueno y se reintenta en 2 minutos
      cache[v] = { videos: (c || {}).videos || [], error: errores.join(' | '), at: Date.now() - CACHE_MS + 2 * 60e3 };
    }
    return cache[v];
  }

  // Pública (solo lectura): la usa la página web
  app.get('/api/web/instagram', async (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const out = {};
    await Promise.all(VENUES.map(async (v) => {
      const r = await videosOf(v);
      // «error» ayuda a revisar la conexión; nunca incluye la clave
      out[v] = { handle: (insta && insta.handleOf && insta.handleOf(v)) || '', videos: r.videos, error: r.error || '' };
    }));
    res.json(out);
  });
};
