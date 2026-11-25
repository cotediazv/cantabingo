// «¿Quién quiere ser billonario?»: un concursante en el escenario sube una escalera de 10 preguntas con 4 alternativas.
// El animador maneja todo desde su panel (#/desafioctl); el público ve la pantalla grande y solo vota
// desde el celular cuando se usa el comodín «Pregunta al público».
// Fases: setup → intro → question → locked → reveal → (question siguiente…) → end (won / retired / lost).
// «La Trivia del Billonario» (pedido de Gabriel, 25 nov, como la Trivia del Rosko): el público responde cada pregunta
// desde el celular hasta la respuesta definitiva del concursante; vale más responder rápido y los puntos se suman al
// revelar. El comodín «Pregunta al público» muestra el porcentaje de esas mismas respuestas y cierra la pregunta a los
// 20 s. Ranking con botón y, al final, el ganador del público con tómbola.
const crypto = require('crypto');
const { BANK } = require('./questions-desafio.js');

const TITLE = '¿Quién quiere ser billonario?';
const STEPS = 10;
const LETTERS = ['A', 'B', 'C', 'D'];
const AUDIENCE_MS = Number(process.env.DESAFIO_AUDIENCE_MS) || 20000; // votación del público: 20 s
const PHONE_MS = 30000; // llamada a un amigo: 30 s
const GRACE_MS = 1000; // margen para los votos que venían en camino al llegar a cero
const DEFAULT_PRIZES = ['100', '200', '300', '500', '1.000', '2.000', '5.000', '10.000', '25.000', '50.000'].map((x) => `${x} puntos`);
const DEFAULT_SAFE = [5];
const CROWD_ROLL_MS = 5500; // la «tómbola» del ganador de la Trivia (igual que en El Rosko)
const points = (ms) => Math.max(40, Math.round(100 - (ms / 1000) * 6)); // 100 al instante, baja 6 por segundo, mínimo 40
// Dificultad según el escalón: 1 a 3 fácil, 4 a 7 medio, 8 a 10 difícil
const levelOf = (step) => (step <= 3 ? 'f' : step <= 7 ? 'm' : 'd');

module.exports = function desafio({ app, db, save, requireAdmin, fail, setStage, findPlayer, venue, notify, festejo = () => {} }) {
  const blank = () => ({
    rev: ((db.desafio || {}).rev || 0) + 1, phase: 'setup', player: '', prizes: [...DEFAULT_PRIZES], safe: [...DEFAULT_SAFE],
    step: 0, q: null, chosen: null, hidden: [], outcome: null, used: { fifty: false, audience: false, phone: false, swap: false },
    audience: null, phoneUntil: 0, seen: [],
    // Trivia del público: pregunta en juego (qid), desde cuándo se ve, si se puede responder, respuestas por pregunta,
    // preguntas ya resueltas (qid → correcta), ranking en pantalla y ganador
    qid: 0, shownAt: 0, open: false, crowd: { ans: {}, solved: {}, winner: null }, rankShow: false, gen: 0,
  });
  db.desafio ||= blank();
  if (!db.desafio.crowd) Object.assign(db.desafio, { qid: 0, shownAt: 0, open: false, crowd: { ans: {}, solved: {}, winner: null }, rankShow: false }); // partidas guardadas antes de la Trivia
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
    s.qid = (s.qid || 0) + 1; // otra pregunta (también al cambiarla): el público responde de nuevo
    s.shownAt = Date.now();
    s.open = true;
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

  // Respuestas del público a la pregunta en juego: el comodín «Pregunta al público» muestra su porcentaje
  const tally = () => {
    const s = g();
    const counts = [0, 0, 0, 0];
    for (const r of Object.values(s.crowd.ans[s.qid] || {})) counts[r.choice]++;
    const total = counts.reduce((x, y) => x + y, 0);
    return { counts, total, pct: counts.map((c) => (total ? Math.round((c * 100) / total) : 0)) };
  };

  // Tabla de la Trivia: solo suman las preguntas ya resueltas (reveladas). Se calcula una vez por cada novedad y se
  // comparte con todos los celulares (con 150 personas leyendo a la vez).
  let cache = null;
  const standings = () => {
    const s = g();
    const key = `${s.rev}:${Object.values(s.crowd.ans).reduce((n, by) => n + Object.keys(by).length, 0)}`;
    if (cache && cache.key === key) return cache;
    const tot = {};
    for (const [qid, by] of Object.entries(s.crowd.ans)) {
      const done = qid in s.crowd.solved;
      for (const [token, r] of Object.entries(by)) {
        const t = (tot[token] ||= { token, name: r.name, score: 0, hits: 0, answered: 0 });
        t.answered++;
        if (done && r.ok) { t.score += points(r.ms); t.hits++; }
      }
    }
    const table = Object.values(tot).sort((a, b) => b.score - a.score || b.hits - a.hits);
    cache = { key, table, place: new Map(table.map((t, i) => [t.token, i])) };
    return cache;
  };
  const topOf = (n) => standings().table.filter((t) => t.score > 0).slice(0, n).map((t) => ({ name: t.name, score: t.score, hits: t.hits }));
  // Se resuelve la pregunta en juego: desde ahora sus respuestas suman
  const solve = (s) => { if (s.q && s.qid) s.crowd.solved[s.qid] = s.q.correct; s.open = false; };

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
      // La Trivia del Billonario
      crowd: { qid: s.qid, open: !!s.open && s.phase === 'question', answered: t.total, players: standings().table.length },
      rank: s.rankShow ? topOf(10) : null, rankPlayers: s.rankShow ? standings().table.length : 0,
      crowdWinner: s.crowd.winner,
    };
  };

  app.get('/api/desafio', (req, res) => {
    const out = pub();
    const token = String(req.query.token || '');
    if (token && findPlayer(String(req.query.sid || ''), token)) {
      const s = g();
      const r = (s.crowd.ans[s.qid] || {})[token];
      out.mine = r ? r.choice : null; // lo que eligió en la pregunta en juego
      const solved = r && s.qid in s.crowd.solved;
      out.mineResult = solved ? { ok: r.ok, pts: r.ok ? points(r.ms) : 0 } : null; // recién al revelar
      const { table, place } = standings();
      const i = place.has(token) ? place.get(token) : -1;
      out.me = i >= 0 ? { score: table[i].score, hits: table[i].hits, answered: table[i].answered, rank: i + 1 } : null;
      out.top = topOf(5);
    }
    res.json(out);
  });

  // Panel del animador: además, la respuesta correcta y los votos del público en vivo
  const hostState = () => {
    const s = g();
    return { ...pub(), answer: s.q ? s.q.correct : null, pick: s.chosen, live: tally(), defaults: { prizes: DEFAULT_PRIZES, safe: DEFAULT_SAFE } };
  };
  app.get('/api/desafio/host', requireAdmin, (_req, res) => res.json(hostState()));

  // Respuesta del público desde el celular: una por pregunta, mientras la pregunta está abierta (hasta la respuesta
  // definitiva del concursante o el fin del comodín). No se dice si acertó: se sabe al revelar.
  // /api/desafio/vote es el nombre antiguo (celulares que ya tenían la página abierta).
  const answer = (req, res) => {
    const b = req.body || {};
    const token = String(b.token || '');
    const pl = findPlayer(String(b.sid || ''), token);
    if (!pl) return fail(res, 403, 'Primero únete a la sala con tu nombre');
    const s = g();
    const a = s.audience;
    const late = a && !a.open && a.until && Date.now() > a.until + GRACE_MS;
    if (s.phase !== 'question' || !s.open || late || (b.qid != null && Number(b.qid) !== s.qid)) return fail(res, 409, 'Esa pregunta ya se cerró');
    const choice = Number(b.choice);
    if (![0, 1, 2, 3].includes(choice) || s.hidden.includes(choice)) return fail(res, 400, 'Opción no válida');
    const by = (s.crowd.ans[s.qid] ||= {});
    if (by[token]) return fail(res, 409, 'Ya respondiste esta pregunta');
    by[token] = { choice, name: pl.name, ok: choice === s.q.correct, ms: Math.max(0, Date.now() - (s.shownAt || Date.now())) };
    save(); // no se avisa a todos en cada respuesta: las pantallas leen el conteo cada segundo
    res.json({ ok: true, mine: choice });
  };
  app.post('/api/desafio/answer', answer);
  app.post('/api/desafio/vote', answer);

  const closeAudience = () => {
    clearTimeout(audienceTimer);
    const a = g().audience;
    if (a && a.open) { a.open = false; g().open = false; changed(); } // con el comodín, la pregunta se cierra para el público
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
      Object.assign(s, blank(), { rev: s.rev, phase: 'intro', player, prizes, safe, gen: Date.now() }); // gen: cada partida (instrucciones en el celular)
      setStage('desafio');
    },
    // Desde la presentación o tras acertar: la pregunta siguiente
    next(s) {
      s.rankShow = false; // «Iniciar pregunta» recoge el ranking (como en El Rosko)
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
      s.open = false; // con la respuesta definitiva a la vista, el público ya no responde
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
      solve(s);
      s.phase = 'reveal';
    },
    // Se planta con lo que lleva; en pantalla se muestra igual cuál era la correcta
    retire(s) {
      if (s.phase !== 'question') throw new Error('Solo puede retirarse antes de responder');
      if (s.audience && s.audience.open) closeAudience();
      solve(s); // en pantalla se muestra igual cuál era la correcta
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
      if (!s.open) throw new Error('La pregunta ya está cerrada para el público');
      s.audience = { open: true, until: Date.now() + AUDIENCE_MS }; // cuenta las respuestas de la Trivia a esta pregunta
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
    // Ranking de la Trivia en pantalla (botón libre); se recoge con el mismo botón o con la pregunta siguiente
    rank(s, b) { s.rankShow = b.on !== false; },
    // Ganador del público, al terminar la partida: entre los empatados arriba, al azar, con una tómbola en pantalla
    crowdwin(s) {
      if (s.phase !== 'end') throw new Error('El ganador de la Trivia se muestra al terminar la partida');
      if (s.crowd.winner) throw new Error('El ganador de la Trivia ya está en pantalla');
      const table = standings().table.filter((t) => t.score > 0);
      if (!table.length) { s.crowd.winner = { none: true, name: '', score: 0, hits: 0, players: standings().table.length, at: Date.now() }; return; }
      const top = table.filter((t) => t.score === table[0].score && t.hits === table[0].hits);
      const pick = top[crypto.randomInt(top.length)];
      s.crowd.winner = { name: pick.name, score: pick.score, hits: pick.hits, players: standings().table.length, at: Date.now(), roll: table.slice(0, 8).map((t) => t.name), rollMs: CROWD_ROLL_MS };
      s.rankShow = false;
    },
    reset(s) { clearTimeout(audienceTimer); Object.assign(s, blank(), { rev: s.rev }); },
  };

  app.post('/api/desafio/host', requireAdmin, (req, res) => {
    const b = req.body || {};
    const act = actions[String(b.action)];
    if (!act) return fail(res, 400, 'Acción no válida');
    const before = g().phase;
    try { act(g(), b); } catch (err) { return fail(res, 400, err.message); }
    changed();
    const s = g();
    const m = require('./momentos.js');
    // Luces (como en El Rosko): un momento por cada paso del juego. Los nombres «desafio_*» son nuevos: falta que Code 4
    // les asigne luces en su suite (mientras tanto las luces no hacen nada con ellos)
    const name = b.action === 'next' && s.phase === 'question' ? 'desafio_pregunta' : b.action === 'swap' ? 'desafio_pregunta'
      : b.action === 'lock' ? 'desafio_definitiva' : b.action === 'reveal' ? (s.chosen === s.q.correct ? 'desafio_correcta' : 'desafio_incorrecta')
        : b.action === 'audience' ? 'desafio_publico' : b.action === 'phone' ? 'desafio_llamada'
          : b.action === 'rank' ? (s.rankShow ? 'desafio_ranking' : 'desafio_ranking_fin') : '';
    if (name) m.emit(name);
    if (before !== 'end' && s.phase === 'end' && s.outcome === 'won') { m.emit('desafio_ganador'); m.emitLater('premio_entrega', 9000); festejo(); }
    // Luces y confeti con el ganador de la Trivia (como en El Rosko): la tómbola gira y, al detenerse, el ganador
    const cw = s.crowd.winner;
    if (b.action === 'crowdwin' && cw && !cw.none) {
      m.emit('tombola_gira');
      setTimeout(() => { m.emit('trivia_ganador'); m.emitLater('premio_entrega', 9000); festejo(); }, CROWD_ROLL_MS);
    }
    res.json(hostState());
  });

  // Al cerrar la sala (fin de la jornada) o abrir una nueva: la partida y la Trivia quedan en blanco, como los otros juegos.
  // El conteo de preguntas ya usadas (db.desafioUsed) se mantiene, para que no se repitan en las noches siguientes.
  const clear = () => { clearTimeout(audienceTimer); Object.assign(g(), blank(), { rev: (g().rev || 0) + 1 }); save(); };
  return { refresh: () => notify(), clear };
};
