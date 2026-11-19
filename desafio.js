// «El Gran Desafío»: un concursante en el escenario sube una escalera de 10 preguntas con 4 alternativas.
// El animador maneja todo desde su panel (#/desafioctl); el público ve la pantalla grande y solo vota
// desde el celular cuando se usa el comodín «Pregunta al público».
// Fases: setup → intro → question → locked → reveal → (question siguiente…) → end (won / retired / lost).
const crypto = require('crypto');
const { BANK } = require('./questions-desafio.js');

const TITLE = 'El Gran Desafío';
const STEPS = 10;
const LETTERS = ['A', 'B', 'C', 'D'];
const AUDIENCE_MS = Number(process.env.DESAFIO_AUDIENCE_MS) || 20000; // votación del público: 20 s
const PHONE_MS = 30000; // llamada a un amigo: 30 s
const GRACE_MS = 1000; // margen para los votos que venían en camino al llegar a cero
const DEFAULT_PRIZES = ['100', '200', '300', '500', '1.000', '2.000', '5.000', '10.000', '25.000', '50.000'].map((x) => `${x} puntos`);
const DEFAULT_SAFE = [5];
// Dificultad según el escalón: 1 a 3 fácil, 4 a 7 medio, 8 a 10 difícil
const levelOf = (step) => (step <= 3 ? 'f' : step <= 7 ? 'm' : 'd');

module.exports = function desafio({ app, db, save, requireAdmin, fail, setStage, findPlayer, venue, notify }) {
  const blank = () => ({
    rev: ((db.desafio || {}).rev || 0) + 1, phase: 'setup', player: '', prizes: [...DEFAULT_PRIZES], safe: [...DEFAULT_SAFE],
    step: 0, q: null, chosen: null, hidden: [], outcome: null, used: { fifty: false, audience: false, phone: false, swap: false },
    audience: null, phoneUntil: 0, seen: [],
  });
  db.desafio ||= blank();
  db.desafioUsed ||= {}; // cuántas veces ha salido cada pregunta del banco
  const g = () => db.desafio;
  let audienceTimer = null;
  const changed = () => { g().rev++; save(); notify(); };
  const clean = (t, max) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, max);

  // La menos usada de su nivel (como El Rosco), sin repetir dentro de la misma partida
  function deal(step) {
    const s = g();
    const level = levelOf(step);
    const seen = new Set(s.seen);
    let pool = BANK.filter((b) => b.level === level && !seen.has(b.key));
    if (!pool.length) pool = BANK.filter((b) => !seen.has(b.key));
    if (!pool.length) pool = BANK;
    const min = Math.min(...pool.map((b) => db.desafioUsed[b.key] || 0));
    const least = pool.filter((b) => (db.desafioUsed[b.key] || 0) === min);
    const b = least[crypto.randomInt(least.length)];
    db.desafioUsed[b.key] = (db.desafioUsed[b.key] || 0) + 1;
    s.seen.push(b.key);
    const options = [b.a, ...b.wrong];
    for (let i = options.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [options[i], options[j]] = [options[j], options[i]]; }
    s.q = { text: b.q, options, correct: options.indexOf(b.a), level };
    s.chosen = null;
    s.hidden = [];
    s.audience = null;
    s.phoneUntil = 0;
  }

  // Premio que se lleva: al perder, el último escalón seguro ya superado; al retirarse, el último acertado
  const prizeAt = (step) => (step >= 1 ? g().prizes[step - 1] : '');
  const safeBelow = (step) => Math.max(0, ...g().safe.filter((x) => x < step));
  const wonPrize = () => {
    const s = g();
    if (s.outcome === 'won') return prizeAt(STEPS);
    if (s.outcome === 'retired') return prizeAt(s.step - 1);
    if (s.outcome === 'lost') return prizeAt(safeBelow(s.step));
    return '';
  };

  const tally = () => {
    const a = g().audience;
    if (!a) return null;
    const counts = [0, 0, 0, 0];
    for (const v of Object.values(a.votes)) counts[v]++;
    const total = counts.reduce((x, y) => x + y, 0);
    return { counts, total, pct: counts.map((c) => (total ? Math.round((c * 100) / total) : 0)) };
  };

  // Lo que ven las pantallas y los celulares: la respuesta correcta solo después de revelarla
  const pub = () => {
    const s = g();
    const shown = s.phase === 'reveal' || s.phase === 'end';
    const t = tally();
    return {
      rev: s.rev, now: Date.now(), venue: venue(), title: TITLE, phase: s.phase, player: s.player,
      prizes: s.prizes, safe: s.safe, step: s.step, steps: STEPS,
      q: s.q ? { text: s.q.text, options: s.q.options, level: s.q.level } : null,
      hidden: s.hidden, chosen: s.phase === 'locked' || shown ? s.chosen : null,
      correct: shown && s.q ? s.q.correct : null,
      right: shown && s.q && s.chosen != null ? s.chosen === s.q.correct : null,
      outcome: s.outcome, won: wonPrize(), used: s.used,
      audience: s.audience ? { open: !!s.audience.open, until: s.audience.until, ms: AUDIENCE_MS, total: t.total, pct: s.audience.open ? null : t.pct } : null,
      phoneUntil: s.phoneUntil, phoneMs: PHONE_MS,
    };
  };

  app.get('/api/desafio', (req, res) => {
    const out = pub();
    const token = String(req.query.token || '');
    const a = g().audience;
    if (a && token && findPlayer(String(req.query.sid || ''), token)) out.mine = a.votes[token] ?? null;
    res.json(out);
  });

  // Panel del animador: además, la respuesta correcta y los votos del público en vivo
  const hostState = () => {
    const s = g();
    return { ...pub(), answer: s.q ? s.q.correct : null, pick: s.chosen, live: tally(), defaults: { prizes: DEFAULT_PRIZES, safe: DEFAULT_SAFE } };
  };
  app.get('/api/desafio/host', requireAdmin, (_req, res) => res.json(hostState()));

  // Voto del público desde el celular (solo con el comodín abierto; se puede cambiar mientras dure)
  app.post('/api/desafio/vote', (req, res) => {
    const b = req.body || {};
    const token = String(b.token || '');
    if (!findPlayer(String(b.sid || ''), token)) return fail(res, 403, 'Primero únete a la sala con tu nombre');
    const a = g().audience;
    if (!a || !a.open || Date.now() > a.until + GRACE_MS) return fail(res, 400, 'La votación del público está cerrada');
    const choice = Number(b.choice);
    if (![0, 1, 2, 3].includes(choice) || g().hidden.includes(choice)) return fail(res, 400, 'Opción no válida');
    a.votes[token] = choice; // no se avisa a todos en cada voto: las pantallas leen el conteo cada segundo
    save();
    res.json({ mine: choice });
  });

  const closeAudience = () => {
    clearTimeout(audienceTimer);
    const a = g().audience;
    if (a && a.open) { a.open = false; changed(); }
  };
  const armAudience = () => {
    clearTimeout(audienceTimer);
    const a = g().audience;
    if (a && a.open) audienceTimer = setTimeout(closeAudience, Math.max(0, a.until + GRACE_MS - Date.now()));
  };
  armAudience(); // tras un reinicio, la votación que estaba abierta se cierra a su hora

  const actions = {
    // Prepara la partida: concursante, premios y escalones seguros. En pantalla queda la presentación.
    new(s, b) {
      const player = clean(b.player, 40).toLocaleUpperCase('es');
      if (!player) throw new Error('Escribe el nombre del concursante');
      const prizes = Array.isArray(b.prizes) ? b.prizes.slice(0, STEPS).map((p, i) => clean(p, 30) || DEFAULT_PRIZES[i]) : [...DEFAULT_PRIZES];
      while (prizes.length < STEPS) prizes.push(DEFAULT_PRIZES[prizes.length]);
      const safe = Array.isArray(b.safe) ? [...new Set(b.safe.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x < STEPS))].sort((x, y) => x - y) : [...DEFAULT_SAFE];
      clearTimeout(audienceTimer);
      Object.assign(s, blank(), { rev: s.rev, phase: 'intro', player, prizes, safe });
      setStage('desafio');
    },
    // Desde la presentación o tras acertar: la pregunta siguiente
    next(s) {
      if (s.phase === 'intro') { s.step = 1; deal(1); s.phase = 'question'; return; }
      if (s.phase !== 'reveal') throw new Error('Primero revela la respuesta');
      if (s.chosen !== s.q.correct) { s.outcome = 'lost'; s.phase = 'end'; return; }
      if (s.step >= STEPS) { s.outcome = 'won'; s.phase = 'end'; return; }
      s.step++;
      deal(s.step);
      s.phase = 'question';
    },
    // Respuesta definitiva del concursante: queda marcada en pantalla, en suspenso
    lock(s, b) {
      if (s.phase !== 'question') throw new Error('No hay una pregunta en juego');
      const i = Number(b.choice);
      if (![0, 1, 2, 3].includes(i) || s.hidden.includes(i)) throw new Error('Opción no válida');
      if (s.audience && s.audience.open) closeAudience();
      s.chosen = i;
      s.phoneUntil = 0;
      s.phase = 'locked';
    },
    // Se arrepiente antes de revelar
    unlock(s) {
      if (s.phase !== 'locked') throw new Error('No hay una respuesta marcada');
      s.chosen = null;
      s.phase = 'question';
    },
    reveal(s) {
      if (s.phase !== 'locked') throw new Error('Primero marca la respuesta del concursante');
      s.phase = 'reveal';
    },
    // Se planta con lo que lleva; en pantalla se muestra igual cuál era la correcta
    retire(s) {
      if (s.phase !== 'question') throw new Error('Solo puede retirarse antes de responder');
      if (s.audience && s.audience.open) closeAudience();
      s.outcome = 'retired';
      s.phoneUntil = 0;
      s.phase = 'end';
    },
    fifty(s) {
      if (s.phase !== 'question' || s.used.fifty) throw new Error('El 50:50 no está disponible');
      const wrong = [0, 1, 2, 3].filter((i) => i !== s.q.correct && !s.hidden.includes(i));
      for (let i = wrong.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [wrong[i], wrong[j]] = [wrong[j], wrong[i]]; }
      s.hidden = [...s.hidden, ...wrong.slice(0, 2)];
      s.used.fifty = true;
    },
    audience(s) {
      if (s.phase !== 'question' || s.used.audience) throw new Error('La pregunta al público no está disponible');
      s.audience = { open: true, until: Date.now() + AUDIENCE_MS, votes: {} };
      s.used.audience = true;
      armAudience();
    },
    closeaudience() { closeAudience(); },
    phone(s) {
      if (s.phase !== 'question' || s.used.phone) throw new Error('La llamada no está disponible');
      s.phoneUntil = Date.now() + PHONE_MS;
      s.used.phone = true;
    },
    stopphone(s) { s.phoneUntil = 0; },
    // Cambia la pregunta por otra del mismo escalón (se pierden el 50:50 y la votación aplicados a la anterior)
    swap(s) {
      if (s.phase !== 'question' || s.used.swap) throw new Error('El cambio de pregunta no está disponible');
      clearTimeout(audienceTimer);
      deal(s.step);
      s.used.swap = true;
    },
    reset(s) { clearTimeout(audienceTimer); Object.assign(s, blank(), { rev: s.rev }); },
  };

  app.post('/api/desafio/host', requireAdmin, (req, res) => {
    const b = req.body || {};
    const act = actions[String(b.action)];
    if (!act) return fail(res, 400, 'Acción no válida');
    try { act(g(), b); } catch (err) { return fail(res, 400, err.message); }
    changed();
    res.json(hostState());
  });

  return { refresh: () => notify() };
};
