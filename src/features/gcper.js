// «GC PER» de la sala de juegos (pedido de Cote, 22 nov: «que vuelva al panel de control la opción de GC personalizado…
// «GC PER»… puesto en el lugar donde normalmente va el GC»): un texto escrito en el GC Master que sale en la franja de
// abajo del GC de OBS, en lugar del GC, y que en el tablero, la pantalla de pie y las pantallas del local se agrega como
// una franja sin quitar lo que muestran. Lo que va entre comillas sale destacado (las comillas no se ven). No es un
// escenario: `db.stage` no cambia (celulares y juegos siguen igual); se apaga al tocar cualquier botón del GC o cuando
// un juego cambia el escenario. En las salas light es el escenario `custom` de siempre (src/features/light).
module.exports = function gcper(ctx) {
  const { app, db, save, requireAdmin, fail } = ctx;
  const clean = (s) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const main = () => { const g = db.gcper || {}; return { on: !!(g.on && g.text), text: g.text || '' }; };
  // Lo apaga; devuelve true si estaba puesto
  const off = () => { if (db.gcper && db.gcper.on) { db.gcper.on = false; save(); return true; } return false; };
  // El texto que les toca a las pantallas de un local: el de la sala de juegos si la sala abierta es de ese local; si no,
  // el GC PER de su sala light
  const of = (venue) => {
    const m = main(); const s = Object.values(db.sessions)[0];
    if (m.on && s && (s.theme || 'frida') === venue) return { text: m.text, from: 'main' };
    const l = (db.lights || {})[venue];
    return l && l.stage === 'custom' && l.text ? { text: l.text, from: 'light' } : null;
  };
  app.post('/api/gcper', requireAdmin, (req, res) => {
    const b = req.body || {};
    const text = b.text != null ? clean(b.text) : main().text;
    if (b.on !== false && !text) return fail(res, 400, 'Escribe el texto del GC PER');
    db.gcper = { on: b.on !== false, text };
    save(); ctx.aviso();
    res.json(main());
  });
  return { main, off, of };
};
