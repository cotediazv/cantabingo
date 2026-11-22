// Capa gráfica sobre la cámara (pedido de Cote, 21 nov): OBS queda fijo con una sola escena y, desde los botones del
// GC Master, se incrustan piezas en el GC de OBS de cada local (sala light y sala de juegos): cortina, texto en 3D,
// celebración, fuegos artificiales, lluvia de confeti, luces y corazones. Cada toque es un «disparo»: el GC lo lee cada segundo y lo reproduce una vez. No se guarda en los datos
// (es momentáneo); solo queda guardado el último texto.
const VENUES = ['kennedy', 'frida', 'tobalaba'];
const KINDS = ['cortina', 'texto3d', 'celebracion', 'fuegos', 'confeti', 'luces', 'corazones', 'off'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = function capa({ app, requireLocal, fail }) {
  const live = {}; // por local: { id, kind, text, at }
  // Lo lee el GC de OBS (sin clave, como el resto de lo que muestran las pantallas)
  app.get('/api/capa', (req, res) => {
    const v = String(req.query.local || '');
    if (!VENUES.includes(v)) return fail(res, 400, 'Local desconocido');
    res.set('Cache-Control', 'no-store');
    return res.json({ ...(live[v] || { id: 0, kind: 'off', text: '', at: 0 }), now: Date.now() });
  });
  // Lo dispara el moderador (GC Master) o el equipo de ese local
  app.post('/api/capa', requireLocal, (req, res) => {
    const b = req.body || {};
    const v = String(b.local || '');
    const kind = String(b.kind || '');
    if (!VENUES.includes(v)) return fail(res, 400, 'Local desconocido');
    if (!KINDS.includes(kind)) return fail(res, 400, 'Pieza desconocida');
    const text = kind === 'texto3d' ? clean(b.text, 60) : '';
    if (kind === 'texto3d' && !text) return fail(res, 400, 'Escribe el texto');
    const prev = live[v] ? live[v].id : 0;
    live[v] = { id: Math.max(Date.now(), prev + 1), kind, text, at: Date.now() };
    return res.json({ ok: true, ...live[v] });
  });
};
