// «El último en pie» — VERSIÓN DE PRUEBA (pedido de Cote, 23 nov: «100 % desde las mesas, con la posibilidad de ir
// revisando el ranking… ¿puedes crear una versión de prueba para que lo veamos?»).
// Cómo se juega: todo el salón juega desde el celular. Cada persona parte con 3 vidas. Preguntas de 3 alternativas con
// 10 segundos; quien falla o no contesta pierde una vida. Quien se queda sin vidas no deja de jugar: pasa «a la banca»
// y sigue contestando. Para volver (regla de Cote, 23 nov: «desde el momento que la persona sale del juego y pasa a la
// banca, por las 5 siguientes preguntas debería contestar por lo menos 4 buenas de 5 para poder subir»): quien junta 4
// buenas en sus 5 preguntas siguientes vuelve al juego con 1 vida (vuelve apenas completa la cuarta); si falla 2, la
// cuenta parte de nuevo con la pregunta siguiente (así siempre hay esperanza). En las últimas 3 preguntas se cierra la
// puerta: ya no vuelve nadie. Gana el último en pie; si al final quedan varios, sigue la «muerte súbita» (un error y fuera) y, si tras 5
// preguntas siguen varios, gana quien tiene más aciertos y, si empatan, quien contestó más rápido. Segundo premio: «el
// mejor de la banca» (más aciertos entre los que no quedaron en pie).
const crypto = require('crypto');
const { BANK } = require('./questions-bank.js');
const ALTS = require('./questions-alternatives.js');

const LIVES = 3;
const TOTAL = 15; // preguntas del juego (después, muerte súbita)
const BACK_OF = 5; const BACK_NEED = 4; // para volver de la banca: 4 buenas de 5
const DOOR = 3; // en las últimas 3 ya no vuelve nadie
const Q_MS = Number(process.env.ENPIE_MS) || 10000;
const GRACE_MS = 700;
const SUDDEN_MAX = 5;
const JOIN_UNTIL = 2; // quien contesta por primera vez en las 2 primeras preguntas entra con sus 3 vidas; después, a la banca

module.exports = function enpie({ app, db, save, requireAdmin, fail, setStage, findPlayer, notify = () => {}, festejo = () => {}, venue = () => 'frida' }) {
  const POOL = BANK.filter((q) => (ALTS[q.a] || []).length >= 2);
  const blank = () => ({ rev: 1, gen: Date.now(), phase: 'lobby', n: 0, q: null, until: 0, used: [], players: {}, ans: {}, last: null, winner: null, bench: null, door: false, sudden: 0 });
  const g = () => (db.enpie ||= blank());
  const changed = () => { const s = g(); s.rev = (s.rev || 0) + 1; save(); notify(); };

  const kindOf = (n) => (n > TOTAL ? 'subita' : 'normal');
  const order = (s) => Object.entries(s.players).map(([token, p]) => ({ token, ...p })).sort((a, b) => (b.up - a.up) || (b.up ? b.lives - a.lives : 0) || (b.hits - a.hits) || (a.time - b.time));
  const counts = (s) => { let up = 0; let all = 0; for (const p of Object.values(s.players)) { all++; if (p.up) up++; } return { up, bench: all - up }; };

  const pub = (token, host) => {
    const s = g();
    const list = order(s);
    const c = counts(s);
    const me = token && s.players[token] ? s.players[token] : null;
    const reveal = s.phase !== 'question';
    return {
      test: true, rev: s.rev, gen: s.gen, venue: venue(), phase: s.phase, n: s.n, total: TOTAL, kind: s.n ? kindOf(s.n) : 'normal', lives: LIVES, backOf: BACK_OF, backNeed: BACK_NEED,
      now: Date.now(), until: s.phase === 'question' ? s.until : 0, ms: Q_MS,
      q: s.q ? { text: s.q.text, opts: s.q.opts, correct: reveal || host ? s.q.correct : null } : null,
      standing: c.up, bench: c.bench, door: s.n >= TOTAL - DOOR + 1 && s.n <= TOTAL, nextKind: s.phase === 'done' ? '' : kindOf(s.n + 1), doorNext: s.n + 1 === TOTAL - DOOR + 1,
      last: s.last, answered: Object.keys(s.ans).length,
      top: list.slice(0, 10).map((p) => ({ name: p.name, lives: p.lives, hits: p.hits, up: p.up })),
      winner: s.winner, benchWinner: s.bench,
      me: me ? { name: me.name, lives: me.lives, up: me.up, hits: me.hits, pos: list.findIndex((p) => p.token === token) + 1, of: list.length, pick: (s.ans[token] || {}).pick ?? null, lastOk: me.lastOk ?? null, w: me.w || 0, h: me.h || 0, back: me.backAt === s.n && s.phase !== 'question', fell: me.fellAt === s.n && s.phase !== 'question' } : null,
    };
  };

  const ask = (s) => {
    const free = POOL.filter((q) => !s.used.includes(q.key));
    const q = (free.length ? free : POOL)[crypto.randomInt((free.length ? free : POOL).length)];
    s.used.push(q.key);
    const opts = [q.a, ...ALTS[q.a].slice(0, 2)];
    for (let i = opts.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    s.n++;
    s.q = { text: q.q, opts, correct: opts.indexOf(q.a) };
    s.ans = {};
    s.until = Date.now() + Q_MS;
    s.at = Date.now();
    s.phase = 'question';
    s.last = null;
  };

  const finish = (s, w) => {
    s.phase = 'done';
    s.winner = w ? { name: w.name, hits: w.hits, lives: w.lives } : null;
    const rest = order(s).filter((p) => !w || p.token !== w.token).sort((a, b) => (b.hits - a.hits) || (a.time - b.time));
    s.bench = rest.length && rest[0].hits > 0 ? { name: rest[0].name, hits: rest[0].hits } : null;
    if (w) festejo();
  };

  const close = (s) => {
    if (s.phase !== 'question') return;
    const kind = kindOf(s.n);
    const ok = (t) => (s.ans[t] || {}).pick === s.q.correct;
    const ups = Object.keys(s.players).filter((t) => s.players[t].up);
    const upsOk = ups.filter(ok);
    // Si ninguno de los que están en pie acierta, nadie cae por esa pregunta (el juego no se puede quedar sin gente en pie)
    const mercy = ups.length > 0 && upsOk.length === 0 && (kind === 'subita' || ups.every((t) => s.players[t].lives <= 1));
    let fell = 0; let back = 0;
    for (const [t, p] of Object.entries(s.players)) {
      const a = s.ans[t];
      p.time += a ? a.ms : Q_MS;
      p.lastOk = ok(t);
      if (p.lastOk) p.hits++;
      if (p.up) {
        if (!p.lastOk && !mercy) { p.lives = kind === 'subita' ? 0 : p.lives - 1; if (p.lives <= 0) { p.lives = 0; p.up = false; p.fellAt = s.n; p.w = 0; p.h = 0; fell++; } }
      } else if (kind === 'normal' && s.n <= TOTAL - DOOR) { // en la banca: 4 buenas de 5 y vuelve; con 2 fallos la cuenta parte de nuevo
        p.w = (p.w || 0) + 1; if (p.lastOk) p.h = (p.h || 0) + 1;
        if ((p.h || 0) >= BACK_NEED) { p.up = true; p.lives = 1; p.backAt = s.n; p.w = 0; p.h = 0; back++; } else if (p.w - (p.h || 0) > BACK_OF - BACK_NEED) { p.w = 0; p.h = 0; }
      }
    }
    const c = counts(s);
    s.last = { n: s.n, kind, fell, back, mercy, okCount: Object.keys(s.players).filter(ok).length };
    s.phase = 'reveal';
    if (kind === 'subita') s.sudden++;
    const doorClosed = s.n >= TOTAL - DOOR + 1;
    const list = order(s);
    if (doorClosed && c.up === 1) finish(s, list[0]);
    else if (kind === 'subita' && s.sudden >= SUDDEN_MAX && c.up > 1) finish(s, list[0]); // más aciertos y, si empatan, el más rápido
    else if (s.n >= TOTAL && c.up === 0) finish(s, null); // nadie jugó
  };

  // La pregunta se cierra sola al agotarse el reloj
  setInterval(() => { const s = db.enpie; if (s && s.phase === 'question' && Date.now() >= s.until + GRACE_MS) { close(s); changed(); } }, 300).unref();

  app.get('/api/enpie', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(pub(String(req.query.token || ''), false)); });
  app.get('/api/enpie/host', requireAdmin, (_req, res) => res.json(pub('', true)));

  app.post('/api/enpie/answer', (req, res) => {
    const b = req.body || {}; const s = g();
    const token = String(b.token || ''); const pick = Number(b.pick);
    const pl = findPlayer(String(b.sid || ''), token);
    if (!pl) return fail(res, 403, 'Entra primero a la sala');
    if (s.phase !== 'question' || Date.now() > s.until + GRACE_MS) return fail(res, 409, 'Se acabó el tiempo de esta pregunta');
    if (![0, 1, 2].includes(pick)) return fail(res, 400, 'Elige una alternativa');
    if (s.ans[token]) return fail(res, 409, 'Ya contestaste esta pregunta');
    if (!s.players[token]) { const full = s.n <= JOIN_UNTIL; s.players[token] = { name: pl.name, lives: full ? LIVES : 0, up: full, hits: 0, time: full ? 0 : Q_MS * (s.n - 1), fellAt: 0, backAt: 0, w: 0, h: 0 }; }
    s.ans[token] = { pick, ms: Math.max(0, Date.now() - s.at) };
    return res.json({ ok: true, pick }); // no se avisa a todos con cada respuesta: el resultado llega al cerrarse la pregunta
  });

  app.post('/api/enpie/host', requireAdmin, (req, res) => {
    const action = String((req.body || {}).action || ''); let s = g();
    if (action === 'new') { db.enpie = blank(); s = db.enpie; setStage('enpie'); } else if (action === 'next') {
      if (s.phase === 'done') return fail(res, 409, 'El juego ya terminó: empieza uno nuevo');
      if (s.phase === 'question') return fail(res, 409, 'Espera a que termine la pregunta en curso');
      if (!POOL.length) return fail(res, 500, 'No hay preguntas en el banco');
      if (s.n >= TOTAL && counts(s).up <= 1) { finish(s, order(s)[0] && order(s)[0].up ? order(s)[0] : null); } else { ask(s); setStage('enpie'); }
    } else if (action === 'close') close(s);
    else return fail(res, 400, 'Acción desconocida');
    changed();
    return res.json(pub('', true));
  });

  return { inGame: () => { const s = db.enpie; return !!s && s.phase !== 'done' && s.phase !== 'lobby'; }, done: () => !!(db.enpie && db.enpie.phase === 'done') };
};
