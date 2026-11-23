// Diseño de las pantallas y dirección de los QR (Centro de control)
module.exports = function tema(ctx) {
  const { app, db, save, requireAdmin, fail } = ctx;
  // Diseño nuevo de las pantallas (pedido de Cote, 22 nov): encendido salvo que se apague en el Centro de control
  app.get('/api/tema', (_req, res) => { res.set('Cache-Control', 'no-store'); res.json({ on: db.tema !== false, pub: db.pubUrl || '' }); });
  app.post('/api/tema', requireAdmin, (req, res) => { db.tema = (req.body || {}).on !== false; save(); res.json({ on: db.tema }); });
  // Dirección de los QR (pedido de Cote, 22 nov: llevar a la gente a krbstage.cl; eligió la opción A, juegos.krbstage.cl):
  // la sala es la misma y las direcciones de siempre siguen funcionando (OBS, pantallas y decodificadores no se tocan);
  // lo único que cambia es a dónde apuntan los QR que ve el público. Se elige en el Centro de control y, antes de
  // aceptarla, el servidor comprueba que esa dirección responde de verdad (así un QR nunca queda apuntando a la nada).
  const PUB_URLS = ['https://saladejuegos.krbstage.cl', 'https://juegos.krbstage.cl']; // saladejuegos: la que Cote quiere para el QR y los participantes (23 nov)
  app.post('/api/pub', requireAdmin, async (req, res) => {
    const url = String((req.body || {}).url || '');
    if (url && !PUB_URLS.includes(url)) return fail(res, 400, 'Dirección no permitida');
    if (url && !process.env.PUB_SIN_PRUEBA) {
      try {
        const r = await fetch(`${url}/api/tema`, { signal: AbortSignal.timeout(8000) });
        const j = await r.json();
        if (!r.ok || typeof j.on !== 'boolean') throw new Error('no es la sala');
      } catch (e) { return fail(res, 409, `${url.replace('https://', '')} todavía no responde (puede faltar el certificado). Los QR siguen como estaban.`); }
    }
    db.pubUrl = url; save(); ctx.aviso();
    return res.json({ pub: url });
  });
};
