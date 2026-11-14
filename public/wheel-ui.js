/* global views, app, $, $$, esc, api, fail, toast, qr, waiting, route, viewLogin, isAdmin, BACK_BINGO */
// Interfaz del juego «Rueda de palabras»: lista y creación, panel del moderador y pantalla pública.
(() => {
  const DEFAULT_LETTERS = 'ABCDEFGHIJLMNÑOPQRSTUVXYZ';
  const COLORS = { pending: '#2f55d4', hit: '#22a862', miss: '#d64545', pass: '#e0a019' };
  const publicUrl = () => `${location.origin}${location.pathname}#/rueda`;
  const obsUrl = () => `${location.origin}${location.pathname}#/obs`;
  const clock = (ms) => { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : String(s); };

  // La rueda se dibuja en SVG para que escale igual en un celular, una TV o una fuente de OBS.
  // bare: sin nada en el centro, para dejar ver la cámara del concursante.
  const DEFS = `<defs>
    <linearGradient id="wg-ring" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4fa3"/><stop offset=".22" stop-color="#ff9a3d"/><stop offset=".42" stop-color="#ffe14d"/>
      <stop offset=".62" stop-color="#3fe08f"/><stop offset=".82" stop-color="#35c6ff"/><stop offset="1" stop-color="#9b5cff"/>
    </linearGradient>
    <radialGradient id="wg-pending" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#7f9dff"/><stop offset="1" stop-color="#2f2bd0"/></radialGradient>
    <radialGradient id="wg-hit" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#7dffb5"/><stop offset="1" stop-color="#0f9d58"/></radialGradient>
    <radialGradient id="wg-miss" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ff9c9c"/><stop offset="1" stop-color="#d01f3c"/></radialGradient>
    <radialGradient id="wg-pass" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff3a6"/><stop offset="1" stop-color="#f59e0b"/></radialGradient>
    <filter id="wg-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy=".5" stdDeviation=".7" flood-color="#000" flood-opacity=".45"/></filter>
    <filter id="wg-glow" x="-80%" y="-80%" width="260%" height="260%"><feDropShadow dx="0" dy="0" stdDeviation="1.6" flood-color="#ffe14d" flood-opacity=".95"/></filter>
  </defs>`;
  function wheelSVG(st, pi, pick = false, bare = false) {
    const c = st.players[pi];
    const n = st.letters.length;
    const R = 42.5;
    const r = Math.min(6.4, ((2 * Math.PI * R) / n) * 0.46);
    const mine = st.turn === pi;
    const dots = st.letters.map((ch, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const x = (50 + R * Math.cos(a)).toFixed(2);
      const y = (50 + R * Math.sin(a)).toFixed(2);
      const status = c.status[i];
      const cur = mine && c.active && i === c.current;
      return `<g class="${cur ? 'cur' : ''} ${pick ? 'pick' : ''}" data-letter="${i}" data-player="${pi}" filter="url(#${cur ? 'wg-glow' : 'wg-shadow'})">
        <circle cx="${x}" cy="${y}" r="${cur ? r * 1.22 : r}" fill="url(#wg-${status})" stroke="${cur ? '#ffe14d' : '#fff'}" stroke-width="${cur ? 1.3 : 0.55}"/>
        <text x="${x}" y="${y}" font-size="${(r * (cur ? 1.4 : 1.15)).toFixed(2)}" text-anchor="middle" dominant-baseline="central" fill="${status === 'pass' ? '#4a2c00' : '#fff'}" font-weight="700">${esc(ch)}</text></g>`;
    }).join('');
    const center = bare ? '' : `
      <text x="50" y="44" font-size="17" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-weight="700" data-timer="${pi}">${clock(c.remainingMs)}</text>
      <text x="50" y="58" font-size="5" text-anchor="middle" fill="currentColor" font-weight="600">${esc(c.name.slice(0, 18))}</text>
      <text x="50" y="66" font-size="4.6" text-anchor="middle" fill="currentColor"><tspan fill="#35c97a">✔ ${c.hits}</tspan>  <tspan fill="#f07a7a">✘ ${c.misses}</tspan></text>`;
    return `<svg viewBox="0 0 100 100" class="wheel ${mine ? 'turn' : ''}" role="img" aria-label="Rosco de ${esc(c.name)}">${DEFS}
      <circle cx="50" cy="50" r="${R}" fill="none" stroke="url(#wg-ring)" stroke-width="${(r * 1.5).toFixed(2)}" opacity=".9"/>
      <circle cx="50" cy="50" r="${(R + r * 0.75).toFixed(2)}" fill="none" stroke="#fff" stroke-width=".35" opacity=".8"/>
      <circle cx="50" cy="50" r="${(R - r * 0.75).toFixed(2)}" fill="none" stroke="#fff" stroke-width=".35" opacity=".8"/>
      ${dots}${center}
    </svg>`;
  }
  // Mantiene los relojes al día entre un aviso del servidor y el siguiente
  function startClocks(getState) {
    const timer = setInterval(() => {
      const st = getState();
      if (!st) return;
      $$('[data-timer]').forEach((el) => {
        const i = Number(el.dataset.timer);
        const c = st.players[i];
        const live = st.runningSince && i === st.turn ? Math.max(0, c.remainingMs - (Date.now() + st.offset - st.runningSince)) : c.remainingMs;
        el.textContent = clock(live);
      });
    }, 200);
    return () => clearInterval(timer);
  }
  function watch(id, onState, onGone) {
    const es = new EventSource(`/api/wheels/${id}/events`);
    es.onmessage = (e) => {
      const st = JSON.parse(e.data);
      if (st.closed) { es.close(); onGone(); return; }
      st.offset = st.now - Date.now(); // diferencia entre el reloj del servidor y el de este dispositivo
      onState(st);
    };
    es.onerror = () => { fetch('/api/wheel-current').then((r) => r.json()).then((d) => { if (!d.wheels.some((w) => w.id === id)) { es.close(); onGone(); } }).catch(() => {}); };
    return () => es.close();
  }
  const openWheels = async () => (await api('GET', '/api/wheel-current').catch(() => ({}))).wheels || [];

  // ---------- Moderador: lista de ruedas ----------
  views.ruedas = async () => {
    if (!(await isAdmin())) return viewLogin();
    const list = await api('GET', '/api/wheels');
    app.innerHTML = `<p class="back"><a href="#/">← Inicio</a></p>
      <div class="row between" style="margin-bottom:16px"><h1>El Rosco</h1><a class="btn primary" href="#/ruedanueva">⊕ Nuevo rosco</a></div>
      <div class="panel scroll-x">${list.length ? `<table class="list"><tr><th>Rosco</th><th>Concursantes</th><th>Reloj</th><th></th></tr>
        ${list.map((w) => `<tr><td><b>${esc(w.name)}</b><br><span class="muted small">${w.letters} letras</span></td><td>${w.players.map(esc).join(', ')}</td><td>${w.seconds} s</td>
          <td><div class="row"><a class="btn primary" href="#/ruedactl/${w.id}">Dirigir</a><button class="danger" data-del="${w.id}">Eliminar</button></div></td></tr>`).join('')}</table>`
    : '<p>Aún no hay roscos. Crea el primero.</p>'}</div>`;
    app.onclick = async (e) => {
      const del = e.target.dataset.del;
      if (del && confirm('¿Eliminar este rosco?')) { await api('DELETE', `/api/wheels/${del}`).catch(fail); views.ruedas(); }
    };
    return undefined;
  };

  views.ruedanueva = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = `<p class="back"><a href="#/ruedas">← Roscos</a></p><h1>Nuevo rosco</h1>
      <form class="panel fields" id="wf">
        <label class="f">Nombre<input type="text" name="name" maxlength="50" placeholder="Rosco del viernes"></label>
        <label class="f">Segundos por concursante <span class="hint">20 a 900</span><input type="number" name="seconds" min="20" max="900" value="150"></label>
        <label class="f wide">Letras del rosco <span class="hint">en el orden en que giran</span><input type="text" name="letters" maxlength="40" value="${DEFAULT_LETTERS}"></label>
        <label class="f wide">Concursantes <span class="hint">uno por línea, de 1 a 4; cada uno tiene su rosco y su reloj</span><textarea name="players" style="min-height:90px">Concursante 1</textarea></label>
        <label class="f">Preguntas<select name="source"><option value="bank">Automáticas, del banco de preguntas</option><option value="own">Las escribo yo</option></select></label>
        <div class="wide" id="bank-opts">
          <div class="row"><b class="small">Temas:</b>
            <label class="check"><input type="checkbox" name="cat" value="g" checked> Cultura general</label>
            <label class="check"><input type="checkbox" name="cat" value="m" checked> Música</label>
            <label class="check"><input type="checkbox" name="cat" value="a" checked> Arte</label></div>
          <div class="row" style="margin-top:8px"><b class="small">Nivel:</b>
            <label class="check"><input type="checkbox" name="level" value="f" checked> Fácil</label>
            <label class="check"><input type="checkbox" name="level" value="m" checked> Medio</label></div>
          <p class="muted small" style="margin-top:8px">Cada rosco nuevo toma las preguntas que menos se han usado, así van rotando solas. Solo las ves tú.</p>
        </div>
        <label class="f wide" id="own-opts" hidden>Tus preguntas <span class="hint">una por línea: <b>Letra; definición; respuesta</b>. Separa las de cada concursante con una línea <b>---</b></span>
          <textarea name="questions" placeholder="A; Con la A: fruto del manzano; manzana\nB; Con la B: embarcación pequeña; bote"></textarea></label>
        <div class="wide"><button class="primary big">Crear el rosco</button></div>
      </form>`;
    $('#wf').source.onchange = (e) => { $('#bank-opts').hidden = e.target.value !== 'bank'; $('#own-opts').hidden = e.target.value !== 'own'; };
    $('#wf').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const d = Object.fromEntries(fd);
      const questions = d.questions.split(/^\s*-{3,}\s*$/m).map((block) => {
        const map = {};
        block.split(/\r?\n/).forEach((line) => {
          const [letter, q, a] = line.split(';').map((x) => (x || '').trim());
          if (letter && q) map[letter.toUpperCase().slice(0, 1)] = { q, a: a || '' };
        });
        return map;
      });
      try {
        const w = await api('POST', '/api/wheels', { name: d.name, seconds: d.seconds, letters: d.letters, players: d.players.split(/\r?\n/), source: d.source, cats: fd.getAll('cat'), levels: fd.getAll('level'), questions });
        location.hash = `#/ruedactl/${w.id}`;
      } catch (err) { fail(err); }
    };
    return undefined;
  };

  // ---------- Moderador: panel de control ----------
  views.ruedactl = async (id) => {
    if (!(await isAdmin())) return viewLogin();
    const first = await api('GET', `/api/wheels/${id}`);
    const { questions, fromBank } = first;
    const TAGS = { g: 'Cultura general', m: 'Música', a: 'Arte', f: 'Fácil' };
    let st = null;
    const act = (action, extra) => api('POST', `/api/wheels/${id}/act`, { action, ...extra }).catch(fail);
    app.innerHTML = `<div class="cols">
        <div class="panel">
          <div class="row between"><div><h1 id="w-name" style="margin:0"></h1><span class="muted" id="w-turn"></span></div><div class="w-letter" id="w-letter"></div></div>
          <div class="w-question" id="w-question"></div>
          <button class="primary big w-accept" id="w-tie" hidden>🎲 Desempatar por sorteo</button>
          <button class="primary big w-accept" id="w-accept" data-do="acceptwin" hidden>✔ Aceptar ganador</button>
          <div id="w-accepted" hidden><p class="w-accepted">✔ Ganador aceptado</p><button class="primary big w-back" data-back-bingo>← Volver al bingo</button></div>
          <div class="w-keys">
            <button class="w-hit" data-do="hit">✔ Acierto <kbd>A</kbd></button>
            <button class="w-miss" data-do="miss">✘ Fallo <kbd>F</kbd></button>
            <button class="w-pass" data-do="pass">↷ Paso <kbd>P</kbd></button>
          </div>
          <div class="row" style="margin-top:14px">
            <button class="primary" id="w-clock"></button>
            <button data-do="undo" id="w-undo">↶ Deshacer</button>
            <button data-do="turn" id="w-swap">Cambiar turno</button>
            <button class="danger" id="w-reset">Reiniciar</button>
            ${fromBank ? '<button id="w-newq">↻ Preguntas nuevas</button>' : ''}
          </div>
          <p class="muted small" style="margin-top:12px">Teclado: A acierto, F fallo, P paso, Espacio inicia o pausa las preguntas y el reloj. Toca una letra del rosco para saltar a ella o reabrirla.</p>
        </div>
        <div class="panel"><div class="wheels" id="w-wheels"></div></div>
      </div>
      <div class="panel"><h2>Pantalla del público</h2>
        <div class="row between"><div class="small"><b>Enlace para celulares o TV:</b> <a class="link" href="${publicUrl()}" target="_blank">${esc(publicUrl())}</a><br>
          <b>Fuente de navegador para OBS</b> (fondo transparente): <a class="link" href="${obsUrl()}" target="_blank">${esc(obsUrl())}</a><br>
          <span class="muted">El público ve el rosco, el reloj y el marcador. La pregunta aparece solo mientras el reloj corre; la respuesta, nunca.</span></div>${qr(publicUrl())}</div></div>${BACK_BINGO}<p class="small" style="margin-top:12px"><a href="#/ruedas">Ver todos los roscos</a></p>`;
    const render = () => {
      const c = st.players[st.turn];
      $('#w-name').textContent = st.name;
      $('#w-turn').textContent = st.winner ? (st.winner.full ? `🏆 ${st.winner.name} completó el rosco` : `🏆 Gana ${st.winner.name} (${st.winner.hits} ✔ · ${st.winner.misses} ✘)${st.winner.byDraw ? ', por sorteo' : ''}`) : st.tie ? `Empate: ${st.tie.names.join(' y ')}` : st.finished ? 'Juego terminado' : `Turno de ${c.name}`;
      $('#w-letter').textContent = c.active ? st.letters[c.current] : '—';
      const q = (questions[st.turn] || [])[c.current] || {};
      // La pregunta y su respuesta se muestran al moderador solo con el reloj en marcha
      $('#w-question').innerHTML = !c.active ? (st.tie ? (st.tie.rolling ? '<b>Sorteando el desempate…</b> Mira la pantalla.' : `<b>Hay un empate</b> entre ${st.tie.names.map(esc).join(' y ')}: mismos aciertos y fallos. Primero desempata por sorteo.`) : st.winner ? (st.winAccepted ? `<b>${st.winner.full ? '¡Rosco completo!' : '¡Tenemos ganador!'}</b> El nombre del ganador queda abajo al centro de la pantalla.` : `<b>${st.winner.full ? '¡Rosco completo!' : `¡Gana ${esc(st.winner.name)}!`}</b> ${st.winner.byDraw ? 'Salió elegido en el desempate.' : 'La partida se detuvo y en pantalla se muestra la felicitación.'} Pulsa «Aceptar ganador», o Deshacer si fue un error.`) : '<span class="muted">Este concursante ya terminó su rosco.</span>')
        : !st.runningSince ? '<span class="muted">Pulsa «Iniciar preguntas» para ver la pregunta de esta letra.</span>'
        : q.q ? `${q.cat ? `<div class="small muted" style="margin-bottom:6px">${TAGS[q.cat]} · ${q.level === 'f' ? 'Fácil' : 'Medio'}</div>` : ''}<div>${esc(q.q)}</div>${q.a ? `<div class="w-answer">Respuesta: <b>${esc(q.a)}</b></div>` : ''}` : '<span class="muted">Sin pregunta cargada para esta letra: léela de tu guion.</span>';
      $('#w-accept').hidden = !st.winner || st.winAccepted;
      $('#w-tie').hidden = !st.tie || st.tie.rolling;
      $('#w-accepted').hidden = !st.winAccepted;
      $$('.w-keys button').forEach((b) => { b.disabled = !c.active; });
      $('#w-clock').textContent = st.runningSince ? '⏸ Pausar' : '▶ Iniciar preguntas';
      $('#w-clock').disabled = !c.active;
      $('#w-undo').disabled = !st.canUndo;
      $('#w-swap').hidden = st.players.length < 2;
      $('#w-wheels').innerHTML = st.players.map((_, i) => `<div class="wheel-box ${i === st.turn ? 'on' : 'off'}">${wheelSVG(st, i, true)}</div>`).join('');
    };
    const toggleClock = () => act(st.runningSince ? 'pause' : 'start');
    app.onclick = (e) => {
      const btn = e.target.closest('[data-do]');
      if (btn && !btn.disabled) return void act(btn.dataset.do);
      const g = e.target.closest('g.pick');
      if (g) act('select', { index: Number(g.dataset.letter), player: Number(g.dataset.player) });
    };
    $('#w-clock').onclick = toggleClock;
    $('#w-tie').onclick = async () => { try { await api('POST', `/api/wheels/${id}/tiebreak`); } catch (err) { fail(err); } };
    $('#w-reset').onclick = () => { if (confirm('¿Reiniciar el rosco? Se borran aciertos, fallos y relojes.')) act('reset'); };
    if (fromBank) $('#w-newq').onclick = async () => {
      if (!confirm('¿Cambiar todas las preguntas por otras del banco? El rosco se reinicia.')) return;
      try { await api('POST', `/api/wheels/${id}/newquestions`); route(); } catch (err) { fail(err); }
    };
    const onKey = (e) => {
      if (!st || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      const map = { a: 'hit', f: 'miss', p: 'pass' };
      if (k === ' ') { e.preventDefault(); toggleClock(); } else if (map[k] && st.players[st.turn].active) act(map[k]);
    };
    document.addEventListener('keydown', onKey);
    const stopClocks = startClocks(() => st);
    const off = watch(id, (s) => { st = s; render(); }, () => { location.hash = '#/ruedas'; });
    return () => { off(); stopClocks(); document.removeEventListener('keydown', onKey); };
  };

  // ---------- Público: solo la rueda ----------
  async function publicView(kind, id) {
    if (!id) {
      const list = await openWheels();
      const quiet = kind === 'obs' || document.body.classList.contains('full');
      if (!list.length && quiet) {
        // En OBS no se muestra ningún cartel de espera: queda transparente hasta que exista un rosco
        if (kind === 'obs') document.body.classList.add('obs');
        app.innerHTML = '';
        const timer = setInterval(async () => { if ((await openWheels()).length) route(); }, 4000);
        return () => { clearInterval(timer); document.body.classList.remove('obs'); };
      }
      if (!list.length) return waiting(openWheels);
      if (list.length > 1 && !quiet) {
        app.innerHTML = `<div class="panel" style="max-width:520px;margin:6vh auto 0"><h1>Elige el juego</h1>
          <div style="display:grid;gap:10px;margin-top:14px">${list.map((w) => `<a class="btn primary" style="text-align:center;padding:14px;font-size:1.1rem;border-radius:14px" href="#/${kind}/${w.id}">${esc(w.name)}</a>`).join('')}</div></div>`;
        return undefined;
      }
      id = list[0].id;
    }
    let st = null;
    let lastQuestion = null;
    let wonBy = null;
    // Tarjeta de la pregunta: insignia con la letra, encabezado («Con la A») y el enunciado
    const questionCard = (state) => {
      if (!state.question) return '';
      const cut = state.question.indexOf(': ');
      const head = cut > 0 ? state.question.slice(0, cut) : '';
      const body = cut > 0 ? state.question.slice(cut + 2) : state.question;
      const c = state.players[state.turn];
      return `<aside class="obs-question ${state.question !== lastQuestion ? 'pop' : ''}"><span class="obs-badge">${esc(state.letters[c.current])}</span>
        ${head ? `<span class="obs-head">${esc(head)}</span>` : ''}<span class="obs-text">${esc(body)}</span></aside>`;
    };
    // Respuesta acertada: se muestra unos segundos y se retira sola
    let lastReveal = 0;
    let revealTimer = null;
    const revealLeft = (state) => (state.reveal ? 4000 - (Date.now() + state.offset - state.reveal.at) : 0);
    const revealCard = (state, cls) => {
      if (revealLeft(state) <= 0) return '';
      const fresh = state.reveal.at !== lastReveal;
      return `<aside class="${cls} ${fresh ? 'pop' : ''}" data-reveal><span class="rv-head">✔ Letra ${esc(state.reveal.letter)}</span><span class="rv-answer">${esc(state.reveal.answer)}</span></aside>`;
    };
    const hideReveal = () => $$('[data-reveal]').forEach((el) => { el.hidden = true; });
    const scheduleRevealEnd = (state) => {
      clearTimeout(revealTimer);
      if (!state.reveal) return;
      lastReveal = state.reveal.at;
      revealTimer = setTimeout(hideReveal, Math.max(0, revealLeft(state)));
    };
    document.body.classList.add('wheel-screen');
    if (kind === 'obs') document.body.classList.add('obs');
    app.innerHTML = '<div id="pw"></div>';
    const stopClocks = startClocks(() => st);
    const WIN_HOLD_MS = 15000;
    let winTimer = null;
    const leave = () => { clearTimeout(tickTimer); clearTimeout(winTimer); document.body.classList.remove('wheel-screen', 'obs'); };
    // Efectos de sonido del tablero del DJ: acierto, fallo, paso y ganador
    let heard = null;
    const soundFor = (s) => {
      const sum = (what) => s.players.reduce((n, c) => n + c.status.filter((x) => x === what).length, 0);
      const now = { hit: sum('hit'), miss: sum('miss'), pass: sum('pass'), win: !!s.winner };
      const was = heard;
      heard = now;
      if (!was || !document.body.classList.contains('full')) return; // el primer estado no suena
      const name = now.win && !was.win ? 'win' : now.hit > was.hit ? 'hit' : now.miss > was.miss ? 'miss' : now.pass > was.pass ? 'pass' : '';
      if (name) { sfx.played.push(name); sfx.play(name); }
    };
    // Reloj sonoro del tablero del DJ: tic-tac mientras corre el tiempo, cada vez más rápido,
    // y una alarma cuando se agota.
    let tickTimer = null;
    let flip = false;
    let alarmed = null;
    let running = null; // { turn, key } del reloj que venía corriendo
    const alarm = (key) => { if (alarmed === key) return; alarmed = key; sfx.played.push('alarm'); sfx.play('alarm'); };
    const tickLoop = () => {
      clearTimeout(tickTimer);
      tickTimer = null;
      if (!st || !st.runningSince || st.winner || !document.body.classList.contains('full')) return;
      const left = st.players[st.turn].remainingMs - (Date.now() + st.offset - st.runningSince);
      if (left <= 0) { alarm(`${st.turn}:${st.runningSince}`); return; }
      sfx.ticks++;
      sfx.play(flip ? 'tock' : 'tick');
      flip = !flip;
      // El ritmo sube de forma pareja: 1 tic por segundo con el tiempo completo, hasta 5 por segundo
      // cuando quedan 5 segundos, y así se mantiene hasta el final.
      const total = Math.max(6, st.seconds || 150) * 1000;
      const rate = left <= 5000 ? 5 : 1 + 4 * Math.min(1, Math.max(0, (total - left) / (total - 5000)));
      const gap = 1000 / rate;
      tickTimer = setTimeout(tickLoop, Math.min(gap, left + 30));
    };
    const clockSound = (s) => {
      // Si el reloj que corría llegó a cero (el servidor ya pasó el turno), suena la alarma
      if (running && s.players[running.turn] && s.players[running.turn].remainingMs <= 0 && document.body.classList.contains('full')) alarm(running.key);
      running = s.runningSince && !s.winner ? { turn: s.turn, key: `${s.turn}:${s.runningSince}` } : null;
      if (!running) { clearTimeout(tickTimer); tickTimer = null; } else if (!tickTimer) tickLoop();
    };
    const off = watch(id, (s) => {
      st = s;
      soundFor(s);
      clockSound(s);
      if (st.winner) {
        // Rosco completo: se retira todo y queda solo la felicitación, en grande
        // Ganador aceptado, en OBS: la felicitación baja a un cartel al centro para dejar ver a la persona
        const full = document.body.classList.contains('full');
        const low = st.winAccepted && kind === 'obs' && !full;
        // A los 15 s de aceptar al ganador se retira todo: OBS queda limpio y el tablero del DJ pasa al QR
        const left = st.winAccepted ? WIN_HOLD_MS - (st.now - st.winAcceptedAt) : Infinity;
        const cleared = () => {
          wonBy = st.winner.name + '|gone';
          $('#pw').innerHTML = full ? `<div id="fb"><div class="fb-idle"><b><i>KRB Stage</i> Sala de juegos</b><div class="fb-idle-qr">${qr(joinUrl())}</div>
            <small>Escanea el código QR y prepárate</small></div></div>` : '';
        };
        clearTimeout(winTimer);
        if (left <= 0) { if (wonBy !== st.winner.name + '|gone') cleared(); return; }
        if (st.winAccepted) winTimer = setTimeout(cleared, left);
        const key = st.winner.name + (low ? '|low' : '');
        if (low && wonBy !== key) {
          wonBy = key;
          $('#pw').innerHTML = `<div class="rosco-winlow"><span class="rosco-winlow-tag">🏆 ${st.winner.full ? 'Completó el rosco' : 'Ganó El Rosco'}</span><b>${esc(st.winner.name)}</b><small>¡Felicitaciones!</small></div>`;
        } else if (wonBy !== key) {
          wonBy = key;
          const colors = ['#ff4fa3', '#ff9a3d', '#ffe14d', '#3fe08f', '#35c6ff', '#9b5cff'];
          const confetti = Array.from({ length: 60 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s"></i>`).join('');
          $('#pw').innerHTML = `<div class="win-screen"><div class="confetti">${confetti}</div>
            <div class="win-card"><span class="win-trophy">🏆</span><span class="win-name">${esc(st.winner.name)}</span>
              <span class="win-text">${st.winner.full ? '¡Completaste el rosco!' : `¡Ganaste El Rosco! ${st.winner.hits} aciertos`}</span><span class="win-sub">¡Felicitaciones!</span></div></div>`;
        }
        return;
      }
      wonBy = null; clearTimeout(winTimer);
      if (kind === 'obs') {
        // En OBS: solo la rueda del concursante en turno, con el centro libre para su cámara,
        // y el reloj con el marcador en una esquina.
        $('#pw').innerHTML = `<div class="obs-corner">${st.players.map((c, i) => `<div class="obs-player ${i === st.turn && !st.finished ? 'on' : ''}">
            <span class="obs-clock" data-timer="${i}">${clock(c.remainingMs)}</span>
            <span class="obs-name">${esc(c.name)}</span>
            <span class="obs-score"><b class="ok">✔ ${c.hits}</b> <b class="ko">✘ ${c.misses}</b></span></div>`).join('')}</div>
          <div class="obs-wheel">${wheelSVG(st, st.turn, false, true)}</div>
          <div class="obs-side">${questionCard(st)}${revealCard(st, 'obs-reveal')}</div>`;
        lastQuestion = st.question;
        scheduleRevealEnd(st);
        return;
      }
      $('#pw').innerHTML = `<h1 class="pw-title">${esc(st.name)}</h1>
        <div class="pw-text">${revealCard(st, 'pw-reveal')}${st.question ? `<div class="pw-question">${esc(st.question)}</div>` : ''}</div>
        <div class="wheels n${st.players.length}">${st.players.map((_, i) => `<div class="wheel-box ${i === st.turn && !st.finished ? 'on' : 'off'}">${wheelSVG(st, i)}</div>`).join('')}</div>`;
      scheduleRevealEnd(st);
    }, () => { leave(); if (['#/escena', '#/gc', '#/obs', '#/tablero', `#/${kind}`].includes(location.hash)) route(); else location.hash = `#/${kind}`; });
    return () => { off(); stopClocks(); leave(); };
  }
  views.rueda = (id) => publicView('rueda', id);
  views.obs = (id) => publicView('obs', id);
})();
