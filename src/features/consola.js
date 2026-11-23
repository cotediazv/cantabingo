module.exports = function consola(ctx) {
  const { app, db, requireAdmin } = ctx;
  // Consola general: en qué está cada local (sala principal o sala light), su bloque del horario y su karaoke
  app.get('/api/consola', requireAdmin, async (_req, res) => {
    const main = Object.values(db.sessions)[0] || null;
    const out = await Promise.all(['kennedy', 'frida', 'tobalaba'].map(async (v) => {
      const light = ctx.light.pubOf(v);
      const isMain = !!main && (main.theme || 'frida') === v;
      const c = await ctx.light.carteleraOf(v).catch(() => null);
      return {
        venue: v,
        main: isMain ? { name: main.name, stage: db.stage || 'bingo', stageName: (db.stage || 'bingo') === 'bingo' && !ctx.bingoStarted(main) ? 'Sala abierta (QR para entrar)' : ctx.stageNames()[db.stage || 'bingo'] || db.stage, players: Object.keys(main.players || {}).length } : null,
        light: light.open ? { ...light, stageName: ctx.stageNames()[light.stage] || light.stage } : null,
        block: c ? { current: c.current, next: c.next, show: c.show } : null,
        karaoke: ctx.karaoke.nowOf(v),
      };
    }));
    // con el GC PER puesto, el botón encendido en el GC Master es ese (el escenario de la sala no cambia)
    for (const o of out) if (o.main) { const m = ctx.gcper.main(); o.main.perText = m.text; if (m.on) { o.main.stage = 'per'; o.main.stageName = 'GC PER'; } }
    res.json({ locales: out, at: Date.now() });
  });
};
