// Últimos videos (reels) de Instagram de cada local, para la página web krbstage.cl.
// Usa la conexión oficial de Instagram (API con inicio de sesión de Instagram) con una clave por cuenta.
// Las claves NO van en el repositorio: se ponen en Render como IG_TOKEN_KENNEDY, IG_TOKEN_FRIDA, IG_TOKEN_TOBALABA.
// Las claves duran 60 días; el servidor las renueva solo cada ~30 días y guarda la renovada en los datos.
const VENUES = ['kennedy', 'frida', 'tobalaba'];
const API = process.env.IG_TEST_URL || 'https://graph.instagram.com'; // IG_TEST_URL solo para pruebas locales
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

  async function refresh(v) {
    const s = db.webIg[v];
    if (!s || !s.token || Date.now() - s.at < REFRESH_MS) return;
    try {
      const r = await fetch(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(s.token)}`, { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (j && j.access_token) { db.webIg[v] = { ...s, token: j.access_token, at: Date.now() }; save(); }
    } catch (_) { /* se reintenta en la próxima lectura */ }
  }

  async function videosOf(v) {
    const c = cache[v];
    if (c && Date.now() - c.at < CACHE_MS) return c.videos;
    const token = tokenOf(v);
    if (!token) return [];
    await refresh(v);
    try {
      const fields = 'id,media_type,media_url,thumbnail_url,permalink,timestamp';
      const r = await fetch(`${API}/me/media?fields=${fields}&limit=30&access_token=${encodeURIComponent(db.webIg[v].token)}`, { signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      if (!j || !Array.isArray(j.data)) throw new Error((j && j.error && j.error.message) || 'Respuesta vacía');
      const videos = j.data.filter((m) => m.media_type === 'VIDEO' && m.media_url).slice(0, PER_VENUE)
        .map((m) => ({ url: m.media_url, poster: m.thumbnail_url || '', link: m.permalink || '', date: m.timestamp || '' }));
      cache[v] = { videos, at: Date.now() };
      return videos;
    } catch (_) {
      // Si falla, se sigue mostrando lo último bueno y se reintenta en 2 minutos
      cache[v] = { videos: (c || {}).videos || [], at: Date.now() - CACHE_MS + 2 * 60e3 };
      return cache[v].videos;
    }
  }

  // Pública (solo lectura): la usa la página web
  app.get('/api/web/instagram', async (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const out = {};
    await Promise.all(VENUES.map(async (v) => {
      out[v] = { handle: (insta && insta.handleOf && insta.handleOf(v)) || '', videos: await videosOf(v) };
    }));
    res.json(out);
  });
};
