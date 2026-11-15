// «Síguenos en Instagram»: cada local tiene su cuenta. Al ponerlo en pantalla, a toda la sala le aparece
// en el celular la cuenta del local con un botón para abrir Instagram y seguirla.
const VENUES = { frida: 'Frida Kahlo', kennedy: 'Kennedy', tobalaba: 'Tobalaba' };

module.exports = function insta({ app, db, save, requireAdmin, fail, venue }) {
  db.insta ||= { handles: {} };
  // Acepta «@cuenta», «cuenta» o el enlace completo del perfil; guarda solo el nombre de la cuenta
  const clean = (v) => {
    const t = String(v == null ? '' : v).trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
    return /^[A-Za-z0-9._]{1,30}$/.test(t) ? t : '';
  };
  const state = () => { const v = venue(); return { venue: v, name: VENUES[v] || v, handle: db.insta.handles[v] || '' }; };

  app.get('/api/insta', (_req, res) => res.json(state()));
  app.get('/api/insta/config', requireAdmin, (_req, res) => res.json({ ...state(), handles: db.insta.handles, venues: VENUES }));
  app.post('/api/insta/config', requireAdmin, (req, res) => {
    const h = (req.body || {}).handles || {};
    for (const v of Object.keys(VENUES)) {
      if (!(v in h)) continue;
      const typed = String(h[v] || '').trim();
      const ok = clean(typed);
      if (typed && !ok) return fail(res, 400, `La cuenta de ${VENUES[v]} no parece una cuenta de Instagram`);
      db.insta.handles[v] = ok;
    }
    save();
    return res.json({ ...state(), handles: db.insta.handles, venues: VENUES });
  });
};
