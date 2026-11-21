// «Síguenos en Instagram»: cada local tiene su cuenta. Al ponerlo en pantalla, a toda la sala le aparece
// en el celular la cuenta del local con un botón para abrir Instagram y seguirla.
const VENUES = { frida: 'Frida Kahlo', kennedy: 'Mercado Kennedy', tobalaba: 'Tobalaba' }; // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)

module.exports = function insta({ app, db, save, requireAdmin, fail, venue }) {
  db.insta ||= { handles: {} };
  // Cuentas de cada local; se pueden corregir en el panel de Instagram
  const DEFAULTS = { kennedy: 'krbstage', tobalaba: 'krbstage3', frida: 'krbstage4' };
  for (const [v, h] of Object.entries(DEFAULTS)) db.insta.handles[v] ||= h;
  // Acepta «@cuenta», «cuenta» o el enlace completo del perfil; guarda solo el nombre de la cuenta
  const clean = (v) => {
    const t = String(v == null ? '' : v).trim().replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/^@/, '').split(/[/?#]/)[0];
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
  return { handleOf: (v) => db.insta.handles[v] || '' };
};
