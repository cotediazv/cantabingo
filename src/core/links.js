// Enlaces cortos y el QR (svg) que usan las pantallas
const QRCode = require('qrcode');
const { fail } = require('./util');

module.exports = function links({ app }) {
  // Enlace corto de la pantalla vertical de Kennedy (pedido de Cote: fácil de escribir con el control del decodificador;
  // solo esta, los demás enlaces siguen como están porque los OBS ya están configurados). Lo que vaya después de «?»
  // (por ejemplo ?diag=1) se mantiene.
  const SHORT_LINKS = { vk: '#/vertical/kennedy' };
  app.get('/:short', (req, res, next) => {
    const to = SHORT_LINKS[String(req.params.short).toLowerCase()];
    if (!to) return next();
    const i = req.originalUrl.indexOf('?');
    res.redirect(302, `/${i >= 0 ? req.originalUrl.slice(i) : ''}${to}`);
  });

  app.get('/api/qr', async (req, res) => {
    try {
      res.type('image/svg+xml').send(await QRCode.toString(String(req.query.text || '').slice(0, 500), { type: 'svg', margin: 1 }));
    } catch { fail(res, 400, 'Texto no válido'); }
  });
};
