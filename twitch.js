// Videos y transmisiones en vivo de Twitch (un canal por local: krbstage = Frida, krbstagekennedy = Kennedy,
// krbstage3 = Tobalaba), para la página web krbstage.cl.
// Necesita una aplicación de Twitch: las claves van SOLO en Render (TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET), nunca aquí.
const CANALES = ['krbstage3', 'krbstage', 'krbstagekennedy'];
const API = process.env.TWITCH_TEST_URL || 'https://api.twitch.tv/helix'; // TWITCH_TEST_URL solo para pruebas locales
const AUTH = process.env.TWITCH_AUTH_TEST_URL || 'https://id.twitch.tv/oauth2/token';
const CACHE_MS = 5 * 60e3; // se revisa cada 5 minutos (para saber si están en vivo)

module.exports = function twitch({ app }) {
  let token = null; // { value, until }
  let cache = { data: null, at: 0, error: '' };
  const ids = {}; // canal -> id de Twitch

  async function appToken() {
    if (token && Date.now() < token.until) return token.value;
    const id = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
    if (!id || !secret) throw new Error('Falta la clave de Twitch');
    const r = await fetch(`${AUTH}?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    if (!j.access_token) throw new Error(String(j.message || 'Twitch no entregó la clave').slice(0, 200));
    token = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
    return token.value;
  }
  async function helix(path) {
    const r = await fetch(`${API}${path}`, { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${await appToken()}` }, signal: AbortSignal.timeout(10000) });
    if (r.status === 401) token = null; // clave vencida: se pide otra la próxima vez
    const j = await r.json();
    if (!r.ok) throw new Error(String(j.message || `Twitch respondió ${r.status}`).slice(0, 200));
    return j;
  }
  const foto = (u, w, h) => String(u || '').replace('%{width}', w).replace('%{height}', h).replace('{width}', w).replace('{height}', h);

  async function leer() {
    if (cache.data && Date.now() - cache.at < CACHE_MS) return cache;
    try {
      const faltan = CANALES.filter((c) => !ids[c]);
      if (faltan.length) {
        const u = await helix(`/users?${faltan.map((c) => `login=${c}`).join('&')}`);
        (u.data || []).forEach((x) => { ids[String(x.login).toLowerCase()] = x.id; });
      }
      const vivos = await helix(`/streams?${CANALES.map((c) => `user_login=${c}`).join('&')}`);
      const canales = await Promise.all(CANALES.map(async (c) => {
        const s = (vivos.data || []).find((x) => String(x.user_login).toLowerCase() === c);
        let videos = [];
        if (ids[c]) {
          const v = await helix(`/videos?user_id=${ids[c]}&first=30`);
          videos = (v.data || []).map((x) => ({ id: x.id, title: String(x.title || '').slice(0, 160), published: x.published_at || x.created_at || '', thumbnail: foto(x.thumbnail_url, 640, 360), duration: x.duration || '' }))
            .filter((x) => x.thumbnail && !/_404\//.test(x.thumbnail)); // los que aún se están procesando no tienen imagen
        }
        return { canal: c, vivo: s ? { title: String(s.title || '').slice(0, 160), thumbnail: foto(s.thumbnail_url, 640, 360), viewers: s.viewer_count || 0 } : null, videos };
      }));
      cache = { data: canales, at: Date.now(), error: '' };
    } catch (e) {
      // Si falla, se sigue mostrando lo último bueno y se reintenta en 1 minuto
      cache = { data: cache.data, at: Date.now() - CACHE_MS + 60e3, error: String(e.message || e).slice(0, 200) };
    }
    return cache;
  }

  // Pública (solo lectura): la usa la página web
  app.get('/api/web/twitch', async (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const c = await leer();
    res.json({ canales: c.data || [], error: c.error || '' });
  });
};
