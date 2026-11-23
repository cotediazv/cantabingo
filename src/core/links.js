// Enlaces cortos y el QR (svg) que usan las pantallas
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { fail } = require('./util');

module.exports = function links({ app }) {
  // Enlace corto de la pantalla vertical de Kennedy (pedido de Cote: fácil de escribir con el control del decodificador;
  // solo esta, los demás enlaces siguen como están porque los OBS ya están configurados). Lo que vaya después de «?»
  // (por ejemplo ?diag=1) se mantiene.
  // /cc: Centro de control liviano para el iPad viejo (pedido de Cote, 21 nov; public/cc.html)
  const SHORT_LINKS = { vk: '#/vertical/kennedy', cc: '/cc.html' };
  app.get('/:short', (req, res, next) => {
    const to = SHORT_LINKS[String(req.params.short).toLowerCase()];
    if (!to) return next();
    if (to.startsWith('/')) return res.redirect(302, to);
    const i = req.originalUrl.indexOf('?');
    res.redirect(302, `/${i >= 0 ? req.originalUrl.slice(i) : ''}${to}`);
  });

  // Sala de juegos en el teléfono (pedido de Cote, 22 nov): /sala abre la versión móvil del GC Master («Sala KRB») con su
  // propio nombre e inicio, para guardarla en la pantalla de inicio del iPhone aparte del Centro de control («Control KRB»)
  app.get('/sala', (_req, res) => {
    fs.readFile(path.join(__dirname, '..', '..', 'public', 'index.html'), 'utf8', (err, html) => {
      if (err) return res.status(500).send('No se pudo abrir la página');
      return res.set('Cache-Control', 'no-cache').type('html').send(html
        .replace('href="manifest.webmanifest"', 'href="manifest-sala.webmanifest"')
        .replace('content="Control KRB"', 'content="Sala KRB"')
        .replace('<title>KRB Stage · Sala de juegos</title>', '<title>Sala KRB</title>')
        .replace('<body>', '<body>\n  <script>if (!location.hash || location.hash === "#/") location.replace(location.pathname + location.search + "#/master/movil");</script>'));
    });
  });

  app.get('/api/qr', async (req, res) => {
    try {
      res.type('image/svg+xml').send(await QRCode.toString(String(req.query.text || '').slice(0, 500), { type: 'svg', margin: 1 }));
    } catch { fail(res, 400, 'Texto no válido'); }
  });
};
