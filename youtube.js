// Últimos videos del canal de YouTube de KRB Stage (@krbstage), para la página web krbstage.cl.
// Se leen del listado público del canal (sin clave) y se guardan 30 minutos.
const CHANNEL = 'UCQ3XRqX3fdN5JOpzkLNVfdQ';
const FEED = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL}`;
const CACHE_MS = 30 * 60e3;

module.exports = function youtube({ app }) {
  let cache = { videos: [], at: 0 };
  const unescape = (t) => String(t || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`)); return m ? unescape(m[1]).trim() : ''; };

  async function videos() {
    if (Date.now() - cache.at < CACHE_MS && cache.videos.length) return cache.videos;
    try {
      const r = await fetch(FEED, { signal: AbortSignal.timeout(10000) });
      const xml = await r.text();
      const list = (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => ({
        id: tag(e, 'yt:videoId'),
        title: tag(e, 'title').slice(0, 160),
        published: tag(e, 'published'),
      })).filter((v) => /^[\w-]{6,20}$/.test(v.id));
      if (!list.length) throw new Error('Sin videos');
      cache = { videos: list, at: Date.now() };
    } catch (_) {
      // Si falla, se sigue mostrando lo último bueno y se reintenta en 2 minutos
      cache.at = Date.now() - CACHE_MS + 2 * 60e3;
    }
    return cache.videos;
  }

  // Pública (solo lectura): la usa la página web
  app.get('/api/web/youtube', async (_req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ channel: 'https://www.youtube.com/@krbstage', videos: await videos() });
  });
};
