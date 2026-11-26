// «El último en pie» — VERSIÓN DE PRUEBA (pedido de Cote, 23 nov: «100 % desde las mesas, con la posibilidad de ir
// revisando el ranking… una versión de prueba para que lo veamos»).
// Estructura (Cote, 23 nov): «los ciclos de preguntas tenemos que definirlos como de 5, donde hay una pausa y se muestra
// cuántas personas en pie hay, cuántas están en la banca… desde la segunda vez que paramos, cuánta gente está en pie,
// cuánta pasó a la banca y cuántos salieron de la banca. Deberíamos hacer 5 rondas de preguntas con repechaje… desde la
// 6.ª ronda no hay más repechaje y… rápidamente vamos tirando preguntas hasta que queden 3 personas. Esas personas pasan
// a la final y la final se hace en el escenario, continuando con las preguntas, pero esta vez habladas… El que se
// equivoca queda eliminado inmediatamente y quien queda en pie es el ganador».
//   1) Rondas 1 a 5 (4 preguntas cada una, desde el celular): cada persona parte con 3 vidas; quien falla o no contesta
//      pierde una; sin vidas pasa a la banca y sigue contestando. Para volver de la banca, en sus 4 preguntas siguientes:
//      3 buenas, vuelve con 1 vida; las 4 buenas, vuelve con 2 vidas (si falla 2, su cuenta parte de nuevo). Al terminar cada
//      ronda hay un «corte»: cuántos en pie, cuántos en la banca y, desde el segundo, cuántos pasaron a la banca y
//      cuántos salieron de ella en esa ronda.
//   2) Recta final (después de la última ronda con repechaje): se cierra la puerta (no vuelve nadie de la banca) y todos
//      los que siguen en pie quedan con una sola vida: el que falla, se va; pregunta tras pregunta, hasta que queden 3. Si una pregunta deja menos de 3, los cupos que faltan los ocupan los que
//      cayeron en esa misma pregunta con más aciertos (y, si empatan, los más rápidos). Si nadie acierta, nadie cae.
//   3) Final en el escenario: los 3 finalistas, preguntas habladas por el animador, por turnos; el que se equivoca
//      queda eliminado de inmediato y el que queda en pie gana.
const crypto = require('crypto');
const { BANK } = require('./questions-bank.js');
const ALTS = require('./questions-alternatives.js');

const LIVES = 3;
const ROUND = 4; // preguntas por ronda (Cote, 23 nov: «hagamos las rondas de 4 preguntas»)
// Para que dure 10 a 15 minutos con el salón lleno (simulación con 150 personas, 23 nov; Cote: «dale, hazlo»): 3 rondas
// con repechaje (eran 5) y, en la recta final, todos con una sola vida (Cote: «se pierden las vidas, solamente tienen
// una vida. Y ahí el que pierde se va»). Las preguntas van de más fáciles a más difíciles (Cote: «escalonadas, cada vez
// un poquito más difícil»): el banco tiene dos niveles, fácil y medio; la ronda 1 es toda fácil, la 2 termina con 1
// media, la 3 con 2 medias, y la recta final y la final son todas de nivel medio.
const ROUNDS = Number(process.env.ENPIE_ROUNDS) || 3; // rondas con repechaje
const OPEN_Q = ROUND * ROUNDS; // hasta esta pregunta se puede volver de la banca
const FINAL = 3; // finalistas
// Para volver de la banca (Cote, 23 nov): se miran las 4 preguntas siguientes a la caída: «3 de 4 vuelves al juego con
// 1 vida; 4 de 4 vuelves al juego con 2 vidas». Con 2 fallos ya no alcanza y la cuenta parte de nuevo.
const BACK_OF = 4; const BACK_NEED = 3;
// Sin reloj (Cote, 23 nov: «el control del juego lo va a llevar el animador… ese tiempo para responder finalmente lo
// maneje él»): la pregunta queda abierta desde «Iniciar pregunta» hasta que el animador la cierra con su botón.
const Q_MS = 10000; // solo para el desempate por rapidez: lo que se le cuenta a quien entra tarde
const JOIN_UNTIL = 2; // quien contesta por primera vez en las 2 primeras preguntas entra con sus 3 vidas; después, a la banca

module.exports = function enpie({ placeOf = () => '', roscoBusy = () => false, app, db, save, requireAdmin, fail, setStage, findPlayer, notify = () => {}, festejo = () => {}, venue = () => 'frida' }) {
  const POOL = BANK.filter((q) => (ALTS[q.a] || []).length >= 2);
  const blank = () => ({ rev: 1, gen: Date.now(), phase: 'lobby', n: 0, q: null, until: 0, used: [], players: {}, ans: {}, last: null, winner: null, cut: null, stat: { fell: 0, back: 0 }, fin: null });
  if (db.enpie && !db.enpie.stat) db.enpie = blank(); // un juego guardado con las reglas anteriores
  const g = () => (db.enpie ||= blank());
  const changed = () => { const s = g(); s.rev = (s.rev || 0) + 1; save(); notify(); };

  const roundOf = (n) => Math.ceil(n / ROUND);
  const direct = (n) => n > OPEN_Q; // eliminación directa, sin repechaje
  const better = (a, b) => (b.hits - a.hits) || (a.time - b.time);
  const order = (s) => Object.entries(s.players).map(([token, p]) => ({ token, ...p })).sort((a, b) => (b.up - a.up) || (b.up ? b.lives - a.lives : 0) || better(a, b));
  const counts = (s) => { let up = 0; let all = 0; for (const p of Object.values(s.players)) { all++; if (p.up) up++; } return { up, bench: all - up }; };
  // Nivel de la pregunta que viene: en las rondas, las últimas de cada ronda son de nivel medio (ronda 1: ninguna; ronda
  // 2: una; ronda 3: dos…); en la recta final y en la final, todas de nivel medio
  const levelFor = (n) => (n > OPEN_Q ? 'm' : ((n - 1) % ROUND) >= ROUND - Math.min(ROUND, roundOf(n) - 1) ? 'm' : 'f');
  const pick = (s, level) => {
    const pool = POOL.filter((q) => q.level === level);
    const base = pool.length ? pool : POOL;
    const free = base.filter((q) => !s.used.includes(q.key));
    const q = (free.length ? free : base)[crypto.randomInt((free.length ? free : base).length)];
    s.used.push(q.key);
    return q;
  };

  const pub = (token, host) => {
    const s = g();
    const list = order(s);
    const c = counts(s);
    const me = token && s.players[token] ? s.players[token] : null;
    const reveal = s.phase !== 'question';
    const f = s.fin;
    return {
      test: true, rev: s.rev, gen: s.gen, venue: venue(), phase: s.phase, n: s.n, round: s.n ? roundOf(s.n) : 1, inRound: s.n ? ((s.n - 1) % ROUND) + 1 : 0, perRound: ROUND, rounds: ROUNDS, direct: direct(s.n), nextDirect: direct(s.n + 1),
      lives: LIVES, backOf: BACK_OF, backNeed: BACK_NEED, finalists: FINAL, now: Date.now(), until: 0,
      q: s.q && s.phase !== 'cut' && s.phase !== 'final' && s.phase !== 'lobby' ? { text: s.q.text, opts: s.q.opts, correct: reveal || host ? s.q.correct : null, level: host ? s.q.level : undefined } : null,
      standing: c.up, bench: c.bench, cutDue: s.phase === 'reveal' && s.n % ROUND === 0 && s.n <= OPEN_Q, cut: s.cut,
      last: s.last, answered: Object.keys(s.ans).length,
      top: list.slice(0, 10).map((p) => ({ name: p.name, lives: p.lives, hits: p.hits, up: p.up })),
      // Final en el escenario: los finalistas, de quién es el turno y, solo para el animador, la pregunta y su respuesta
      fin: f ? { players: f.players.map((p) => ({ name: p.name, place: placeOf(p.name), out: !!p.out })), turn: f.turn, asked: f.asked, q: host && f.q ? { text: f.q.text, answer: f.q.answer } : null } : null,
      winner: s.winner ? { ...s.winner, place: placeOf(s.winner.name) } : null,
      me: me ? { name: me.name, lives: me.lives, up: me.up, hits: me.hits, pos: list.findIndex((p) => p.token === token) + 1, of: list.length, pick: (s.ans[token] || {}).pick ?? null, lastOk: me.lastOk ?? null, w: me.w || 0, h: me.h || 0, back: me.backAt === s.n && s.phase !== 'question', fell: me.fellAt === s.n && s.phase !== 'question', finalist: !!(f && f.players.some((p) => p.token === token)) } : null,
    };
  };

  const ask = (s) => {
    const q = pick(s, levelFor(s.n + 1));
    const opts = [q.a, ...ALTS[q.a].slice(0, 2)];
    for (let i = opts.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    s.n++;
    s.q = { text: q.q, opts, correct: opts.indexOf(q.a), level: q.level };
    s.ans = {};
    s.until = 0;
    s.at = Date.now();
    s.phase = 'question';
    s.last = null;
  };

  // La final: los finalistas pasan al escenario; las preguntas las hace el animador en voz alta, por turnos
  const finQuestion = (s) => { const q = pick(s, 'm'); s.fin.q = { text: q.q, answer: q.a }; s.fin.asked++; };
  const startFinal = (s, tokens) => {
    s.fin = { players: tokens.map((t) => ({ token: t, name: s.players[t].name, out: false })), turn: 0, asked: 0, q: null };
    for (const [t, p] of Object.entries(s.players)) if (!tokens.includes(t)) p.up = false;
    s.phase = 'final';
    if (s.fin.players.length <= 1) { win(s, s.fin.players[0] || null); return; }
    finQuestion(s);
  };
  const win = (s, p) => { s.phase = 'done'; s.winner = p ? { name: p.name } : null; if (s.fin) s.fin.q = null; if (p) festejo('final'); };
  // Los que pasan a la final: los que siguen en pie y, si faltan cupos, los mejores de «extra» (más aciertos, más rápidos)
  const toFinal = (s, extra) => {
    const ups = order(s).filter((p) => p.up).map((p) => p.token);
    const more = extra.map((t) => ({ token: t, ...s.players[t] })).sort(better).map((p) => p.token);
    startFinal(s, [...ups, ...more].slice(0, FINAL));
  };

  const close = (s) => {
    if (s.phase !== 'question') return;
    const dir = direct(s.n);
    const ok = (t) => (s.ans[t] || {}).pick === s.q.correct;
    const ups = Object.keys(s.players).filter((t) => s.players[t].up);
    const upsOk = ups.filter(ok);
    // Si ninguno de los que están en pie acierta, nadie cae por esa pregunta (el juego no se puede quedar sin gente en pie)
    const mercy = ups.length > 0 && upsOk.length === 0 && ups.every((t) => s.players[t].lives <= 1);
    let fell = 0; let back = 0; const fallen = [];
    for (const [t, p] of Object.entries(s.players)) {
      const a = s.ans[t];
      if (p.up || !dir) { p.time += a ? a.ms : Date.now() - s.at; p.lastOk = ok(t); if (p.lastOk) p.hits++; }
      if (p.up) {
        if (!p.lastOk && !mercy) { p.lives -= 1; if (p.lives <= 0) { p.lives = 0; p.up = false; p.fellAt = s.n; p.w = 0; p.h = 0; fell++; fallen.push(t); } }
      } else if (!dir) { // en la banca: se cuentan sus 4 preguntas siguientes; con 2 fallos la cuenta parte de nuevo
        p.w = (p.w || 0) + 1; if (p.lastOk) p.h = (p.h || 0) + 1;
        if (p.w >= BACK_OF && p.h >= BACK_NEED) { p.up = true; p.lives = p.h >= BACK_OF ? 2 : 1; p.backAt = s.n; p.w = 0; p.h = 0; back++; } // se decide al completar las 4: 3 buenas, 1 vida; las 4, 2 vidas
        else if (p.w - (p.h || 0) > BACK_OF - BACK_NEED) { p.w = 0; p.h = 0; }
      }
    }
    s.stat.fell += fell; s.stat.back += back;
    s.last = { n: s.n, direct: dir, fell, back, mercy };
    s.phase = 'reveal';
    // En la eliminación directa: con 3 o menos en pie se pasa a la final
    if (dir && counts(s).up <= FINAL) { s.last.toFinal = true; s.fallen = fallen; }
  };

  app.get('/api/enpie', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(pub(String(req.query.token || ''), false)); });
  app.get('/api/enpie/host', requireAdmin, (_req, res) => res.json(pub('', true)));

  app.post('/api/enpie/answer', (req, res) => {
    const b = req.body || {}; const s = g();
    const token = String(b.token || ''); const pk = Number(b.pick);
    const pl = findPlayer(String(b.sid || ''), token);
    if (!pl) return fail(res, 403, 'Entra primero a la sala');
    if (s.phase !== 'question') return fail(res, 409, 'Esta pregunta ya se cerró');
    if (![0, 1, 2].includes(pk)) return fail(res, 400, 'Elige una alternativa');
    if (s.ans[token]) return fail(res, 409, 'Ya contestaste esta pregunta');
    const dir = direct(s.n);
    if (!s.players[token]) {
      if (dir) return fail(res, 409, 'El juego ya va en la recta final: ya no se puede entrar');
      const full = s.n <= JOIN_UNTIL;
      s.players[token] = { name: pl.name, lives: full ? LIVES : 0, up: full, hits: 0, time: full ? 0 : Q_MS * (s.n - 1), fellAt: 0, backAt: 0, w: 0, h: 0 };
    } else if (dir && !s.players[token].up) return fail(res, 409, 'Ya estás fuera del juego');
    s.ans[token] = { pick: pk, ms: Math.max(0, Date.now() - s.at) };
    return res.json({ ok: true, pick: pk }); // no se avisa a todos con cada respuesta: el resultado llega al cerrarse la pregunta
  });

  app.post('/api/enpie/host', requireAdmin, (req, res) => {
    const b = req.body || {}; const action = String(b.action || ''); let s = g();
    // Con El Rosko en juego la pantalla no puede cambiar: el juego no parte ni avanza (simulación del 26 nov: se jugaba sin que nadie lo viera)
    if (roscoBusy()) return fail(res, 409, 'El Rosko está en juego: este juego se juega cuando termine la partida');
    if (action === 'new') { db.enpie = blank(); s = db.enpie; setStage('enpie'); } else if (action === 'next') {
      if (s.phase === 'done') return fail(res, 409, 'El juego ya terminó: empieza uno nuevo');
      if (s.phase === 'final') return fail(res, 409, 'La final se maneja con «Correcta» e «Incorrecta»');
      if (s.phase === 'question') close(s); // un solo botón: con la pregunta abierta, la cierra y muestra la respuesta
      else {
        if (!POOL.length) return fail(res, 500, 'No hay preguntas en el banco');
        const c = counts(s);
        if (s.phase === 'reveal' && s.n % ROUND === 0 && s.n <= OPEN_Q) {
          // Corte de la ronda: cuántos en pie, cuántos en la banca y, desde el segundo, cuántos cayeron y cuántos volvieron
          s.cut = { round: roundOf(s.n), standing: c.up, bench: c.bench, fell: s.stat.fell, back: s.stat.back, last: s.n === OPEN_Q };
          s.stat = { fell: 0, back: 0 };
          s.phase = 'cut';
          if (s.cut.last) for (const p of Object.values(s.players)) if (p.up) p.lives = 1; // recta final: todos con una sola vida
        } else if (s.phase === 'reveal' && s.last && s.last.toFinal) toFinal(s, s.fallen || []);
        else if (s.phase === 'cut' && s.cut.last && c.up <= FINAL) toFinal(s, Object.keys(s.players).filter((t) => !s.players[t].up)); // tras las rondas quedan 3 o menos: los cupos que faltan, los mejores de la banca
        else { ask(s); setStage('enpie'); }
      }
    } else if (action === 'close') close(s);
    else if (action === 'right' || action === 'wrong') { // la final: el animador marca la respuesta de quien tiene el turno
      const f = s.fin;
      if (s.phase !== 'final' || !f) return fail(res, 409, 'La final todavía no empieza');
      if (action === 'wrong') f.players[f.turn].out = true;
      const alive = f.players.filter((p) => !p.out);
      if (alive.length <= 1) win(s, alive[0] || null);
      else { do { f.turn = (f.turn + 1) % f.players.length; } while (f.players[f.turn].out); finQuestion(s); }
    } else return fail(res, 400, 'Acción desconocida');
    // Cualquier paso del juego lo pone en pantalla, como en El Festival (simulación del 26 nov: la final se jugó desde el panel
    // con la pantalla todavía en el juego anterior y nadie la vio)
    if (db.stage !== 'enpie') setStage('enpie');
    changed();
    return res.json(pub('', true));
  });

  return {};
};
