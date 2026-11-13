// Sorteo de concursantes: elige al azar, entre las personas que se han unido al bingo,
// a quienes pasarán a jugar El Rosco. El sorteo se ve en la pantalla de OBS.
const crypto = require('crypto');

const ROLL_MS = 6500; // cuánto dura la animación antes de revelar el nombre
const MAX_PICKS = 4; // un rosco admite hasta 4 concursantes

module.exports = function raffle({ app, db, save, requireAdmin, fail, setStage, refreshAll }) {
  const key = (name) => String(name).trim().toLowerCase().replace(/\s+/g, ' ');
  db.people ||= {}; // clave normalizada -> { name, at }
  db.raffle ||= { picked: [], roll: null };

  const names = () => Object.values(db.people).sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => p.name);
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // Lo que ve la pantalla pública: elegidos, el sorteo en curso y cuántas personas hay en la lista
  app.get('/api/raffle', (_req, res) => {
    res.json({ picked: db.raffle.picked, roll: db.raffle.roll, rollMs: ROLL_MS, now: Date.now(), pool: Object.keys(db.people).length });
  });

  app.get('/api/people', requireAdmin, (_req, res) => res.json({ names: names() }));

  app.delete('/api/people', requireAdmin, (_req, res) => {
    db.people = {};
    db.raffle = { picked: [], roll: null };
    save();
    res.json({ ok: true });
  });

  // Corregir un nombre mal escrito: se cambia en la lista, entre los elegidos del sorteo,
  // en las sesiones de bingo abiertas (ganadores incluidos) y en los roscos ya creados.
  app.post('/api/people/rename', requireAdmin, (req, res) => {
    const from = String((req.body || {}).from || '');
    const to = String((req.body || {}).to || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    if (!to) return fail(res, 400, 'Escribe el nombre corregido');
    if (!db.people[key(from)]) return fail(res, 404, 'Esa persona ya no está en la lista');
    if (key(to) !== key(from) && db.people[key(to)]) return fail(res, 400, 'Ya hay otra persona con ese nombre');
    delete db.people[key(from)];
    db.people[key(to)] = { name: to, at: Date.now() };
    const fix = (n) => (n === from ? to : n);
    db.raffle.picked = db.raffle.picked.map(fix);
    if (db.raffle.roll) { db.raffle.roll.winner = fix(db.raffle.roll.winner); db.raffle.roll.names = db.raffle.roll.names.map(fix); }
    for (const s of Object.values(db.sessions || {})) {
      for (const pl of Object.values(s.players)) pl.name = fix(pl.name);
      for (const r of s.results) r.name = fix(r.name);
    }
    for (const w of Object.values(db.wheels || {})) {
      w.setup.players = w.setup.players.map(fix);
      for (const c of w.players) c.name = fix(c.name);
    }
    save();
    refreshAll();
    res.json({ name: to });
  });

  // Sacar a alguien de la lista (ya no puede salir sorteado)
  app.post('/api/people/remove', requireAdmin, (req, res) => {
    const name = String((req.body || {}).name || '');
    delete db.people[key(name)];
    db.raffle.picked = db.raffle.picked.filter((n) => n !== name);
    if (db.raffle.roll && db.raffle.roll.winner === name) db.raffle.roll = null;
    save();
    res.json({ ok: true });
  });

  app.post('/api/raffle/draw', requireAdmin, (_req, res) => {
    const r = db.raffle;
    if (r.picked.length >= MAX_PICKS) return fail(res, 400, `Ya hay ${MAX_PICKS} concursantes elegidos`);
    if (r.roll && Date.now() - r.roll.at < ROLL_MS) return fail(res, 400, 'Espera a que termine el sorteo en curso');
    const all = names();
    const eligible = all.filter((n) => !r.picked.includes(n));
    if (!eligible.length) return fail(res, 400, all.length ? 'Ya no quedan participantes por sortear' : 'Todavía no hay participantes: se agregan al unirse al bingo');
    const winner = eligible[crypto.randomInt(eligible.length)];
    // Nombres que desfilan durante la animación (el elegido va incluido)
    const parade = shuffle(eligible.filter((n) => n !== winner)).slice(0, 24);
    r.roll = { winner, names: shuffle([...parade, winner]), at: Date.now() };
    r.picked.push(winner);
    setStage('sorteo');
    save();
    res.json({ winner, picked: r.picked });
  });

  app.post('/api/raffle/remove', requireAdmin, (req, res) => {
    const name = String((req.body || {}).name || '');
    db.raffle.picked = db.raffle.picked.filter((n) => n !== name);
    if (db.raffle.roll && db.raffle.roll.winner === name) db.raffle.roll = null;
    save();
    res.json({ picked: db.raffle.picked });
  });

  app.post('/api/raffle/reset', requireAdmin, (_req, res) => {
    db.raffle = { picked: [], roll: null };
    save();
    res.json({ ok: true });
  });
};
