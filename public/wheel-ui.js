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
  // Top 10 de la Trivia del Rosco (lo usan el panel, la pantalla del local y el GC)
  // «Resultados finales» cuando ya se mostró al ganador (pedido de Cote); antes, «Resultados parciales»
  const rankHTML = (st, cls) => `<div class="${cls}"><div class="${cls}-head"><small>Trivia del Rosco · Top 10</small><b>🏅 ${st.crowdWinner || st.winner ? 'Resultados finales' : 'Resultados parciales'}</b><span>${st.rankPlayers} ${st.rankPlayers === 1 ? 'persona jugando' : 'personas jugando'}</span></div>
    ${st.rank.length ? `<ol>${st.rank.map((t) => `<li><b>${esc(t.name)}</b><em>${t.score} pts</em></li>`).join('')}</ol>` : '<p>Todavía nadie suma puntos</p>'}</div>`;
  // En qué paso de la pregunta está el panel: 0 sin juego, 1 poner rosco, 2 iniciar pregunta, 3 responder
  const stepOf = (st) => { const c = st.players[st.turn]; return !c.active || st.winner || st.tie ? 0 : st.runningSince ? 3 : st.onScreen ? 2 : 1; };
  views.ruedactl = async (id) => {
    if (!(await isAdmin())) return viewLogin();
    const first = await api('GET', `/api/wheels/${id}`);
    const { questions, fromBank } = first;
    const TAGS = { g: 'Cultura general', m: 'Música', a: 'Arte', f: 'Fácil' };
    let st = null;
    const act = (action, extra) => api('POST', `/api/wheels/${id}/act`, { action, ...extra }).catch(fail);
    // Para leer al partir (pedido de Cote)
    const HOWTO = [
      '3 participantes.',
      'Todos juegan desde las mesas.',
      '<b>Premio mayor</b> para el que gana El Rosco.',
      '<b>Premio especial</b> para el ganador del público que juega la Trivia del Rosco.',
    ];
    app.innerHTML = `${window.readAloud ? window.readAloud('El Rosco', HOWTO) : ''}<div class="cols">
        <div class="panel">
          <div class="row between"><div><h1 id="w-name" style="margin:0"></h1><span class="muted" id="w-turn"></span></div><div class="w-letter" id="w-letter"></div></div>
          <div class="w-question" id="w-question"></div>
          <button class="primary big w-accept" id="w-tie" hidden>🎲 Desempatar por sorteo</button>
          <button class="primary big w-accept" id="w-accept" data-do="acceptwin" hidden>✔ Aceptar ganador</button>
          <div id="w-accepted" hidden><p class="w-accepted">✔ Ganador aceptado</p>
            <button class="primary big w-accept" id="w-crowd" data-do="crowdwin">🏅 Mostrar ganador de la Trivia del Rosco</button>
            <div class="vc-read" id="w-crowd-res" hidden></div>${BACK_BINGO}</div>
          <div class="w-flow">
            <button class="w-show" id="w-show"></button>
            <button class="w-go" id="w-clock"></button>
          </div>
          <div class="w-keys">
            <button class="w-hit" data-do="hit">✔ Correcta <kbd>A</kbd></button>
            <button class="w-miss" data-do="miss">✘ Incorrecta <kbd>F</kbd></button>
            <button class="w-pass" data-do="pass">↷ Pasa <kbd>P</kbd></button>
          </div>
          <div class="row" style="margin-top:14px">
            <button data-do="undo" id="w-undo">↶ Deshacer</button>
            <button data-do="turn" id="w-swap">Cambiar turno</button>
            <button class="danger" id="w-reset">Reiniciar</button>
            ${fromBank ? '<button id="w-newq">↻ Preguntas nuevas</button>' : ''}
          </div>
          <p class="muted small" style="margin-top:12px">Paso a paso: 1) Poner rosco en pantalla, 2) Iniciar pregunta, 3) Correcta, Incorrecta o Pasa. Solo se puede apretar el botón del paso que toca. Teclado: Espacio inicia la pregunta; A correcta, F incorrecta, P pasa. Con «Incorrecta» o «Pasa» el rosco sale del GC (queda el marcador). Toca una letra del rosco para saltar a ella o reabrirla.</p>
          <button class="w-rankbtn" id="w-rank"></button>
          <div class="w-ranklist" id="w-ranklist" hidden></div>
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
        : !st.runningSince ? '<span class="muted">Pulsa «Iniciar pregunta» para ver la pregunta de esta letra.</span>'
        : q.q ? `${q.cat ? `<div class="small muted" style="margin-bottom:6px">${TAGS[q.cat]} · ${q.level === 'f' ? 'Fácil' : 'Medio'}</div>` : ''}<div class="w-qtext">${esc(q.q)}</div>${q.a ? `<div class="w-answer"><small>Respuesta</small><b>${esc(q.a)}</b></div>` : ''}` : '<span class="muted">Sin pregunta cargada para esta letra: léela de tu guion.</span>';
      $('#w-accept').hidden = !st.winner || st.winAccepted;
      $('#w-tie').hidden = !st.tie || st.tie.rolling;
      $('#w-accepted').hidden = !st.winAccepted;
      $('#w-crowd').hidden = !!st.crowdWinner;
      $('#w-crowd-res').hidden = !st.crowdWinner;
      if (st.crowdWinner) $('#w-crowd-res').innerHTML = `<small>Ganó la Trivia del Rosco</small><b>${esc(st.crowdWinner.name)}</b><i>${st.crowdWinner.score} puntos · ${st.crowdWinner.hits} aciertos</i><small>Jugaron ${st.crowdWinner.players} personas</small>`;
      // Pregunta paso a paso (pedido de Cote): solo se puede apretar el botón del paso que toca; los demás quedan
      // bloqueados en blanco y negro. 1) Poner rosco en pantalla → 2) Iniciar pregunta → 3) Correcta / Incorrecta / Pasa
      // (con Correcta se sigue en el paso 3; con Incorrecta o Pasa el rosco sale y se vuelve al paso 1)
      const step = stepOf(st);
      $$('.w-keys button').forEach((b) => { b.disabled = step !== 3; });
      $('#w-clock').textContent = st.runningSince ? '⏱ Pregunta en curso' : '▶ Iniciar pregunta';
      $('#w-clock').classList.toggle('on', !!st.runningSince);
      $('#w-show').textContent = st.onScreen ? '📺 Rosco en pantalla ✓' : '📺 Poner rosco en pantalla';
      $('#w-show').classList.toggle('on', !!st.onScreen);
      $('#w-show').disabled = step !== 1;
      // Ranking de la Trivia del Rosco (pedido de Cote): se despliega en la pantalla del local y a un costado del GC
      $('#w-rank').textContent = st.rank ? '🏅 Recoger ranking (está en pantalla)' : '🏅 Desplegar ranking de la Trivia (top 10)';
      $('#w-rank').classList.toggle('on', !!st.rank);
      $('#w-ranklist').hidden = !st.rank;
      if (st.rank) $('#w-ranklist').innerHTML = rankHTML(st, 'w-rk');
      $('#w-clock').disabled = step !== 2;
      $('#w-undo').disabled = !st.canUndo;
      $('#w-swap').hidden = st.players.length < 2;
      $('#w-wheels').innerHTML = st.players.map((_, i) => `<div class="wheel-box ${i === st.turn ? 'on' : 'off'}">${wheelSVG(st, i, true)}</div>`).join('');
    };
    const toggleClock = () => { if (stepOf(st) === 2) act('start'); };
    app.onclick = (e) => {
      const btn = e.target.closest('[data-do]');
      if (btn && !btn.disabled) return void act(btn.dataset.do);
      const g = e.target.closest('g.pick');
      if (g) act('select', { index: Number(g.dataset.letter), player: Number(g.dataset.player) });
    };
    $('#w-clock').onclick = toggleClock;
    $('#w-show').onclick = () => { if (stepOf(st) === 1) act('show', { on: true }); };
    $('#w-rank').onclick = () => act('rank', { on: !st.rank });
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
      if (k === ' ') { e.preventDefault(); toggleClock(); } else if (map[k] && stepOf(st) === 3) act(map[k]);
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
    // Aviso en el centro del GC al apretar «Incorrecta» o «Pasa» (pedido de Cote): dura 1,5 s y suena
    let lastFlash = 0;
    let flashTimer = null;
    const flashLeft = (state) => (state.flash ? 1500 - (Date.now() + state.offset - state.flash.at) : 0);
    const flashCard = (state) => {
      if (flashLeft(state) <= 0) return '';
      const f = state.flash;
      return f.kind === 'miss'
        ? `<div class="obs-flash miss" data-flash><b>✘ Incorrecto</b>${f.answer ? `<span>La respuesta correcta era</span><em>${esc(f.answer)}</em>` : ''}</div>`
        : `<div class="obs-flash pass" data-flash><b>↷ ${esc(f.name)} pasa</b></div>`;
    };
    const scheduleFlash = (state) => {
      if (!state.flash || flashLeft(state) <= 0) return;
      if (state.flash.at !== lastFlash) {
        lastFlash = state.flash.at;
        const name = state.flash.kind === 'miss' ? 'miss' : 'pass';
        sfx.played.push(name);
        const c = sfx.unlock(); // en OBS el audio queda activo sin tocar la pantalla
        if (c && c.state !== 'running') Promise.resolve(c.resume()).then(() => sfx.play(name)).catch(() => {}); else sfx.play(name);
      }
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => $$('[data-flash]').forEach((el) => el.remove()), Math.max(0, flashLeft(state)));
    };
    const scheduleRevealEnd = (state) => {
      clearTimeout(revealTimer);
      if (!state.reveal) return;
      lastReveal = state.reveal.at;
      revealTimer = setTimeout(() => { hideReveal(); if (!state.question && $('#pw') && $('.pw-title')) $('#pw').classList.add('pw-idle'); }, Math.max(0, revealLeft(state)));
    };
    document.body.classList.add('wheel-screen');
    if (kind === 'obs') document.body.classList.add('obs');
    app.innerHTML = '<div id="pw"></div>';
    const stopClocks = startClocks(() => st);
    const WIN_HOLD_MS = 15000;
    let winTimer = null;
    const leave = () => { const pw = $('#pw'); if (pw) pw.classList.remove('pw-idle'); rankV.hide(); clearTimeout(shrinkTimer); clearTimeout(tickTimer); clearTimeout(winTimer); document.body.classList.remove('wheel-screen', 'obs'); };
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
    let shrinkTimer = null;
    // Ranking vertical: 5 primeros en grande y el resto en columnas, por páginas que cambian solas; se actualiza cada 5 s
    const rankV = (() => {
      let id = null; let data = null; let page = 0; let tPoll = null; let tPage = null; let cap = 60; let capFor = '';
      const PAGE_MS = 8000;
      const cols = () => (innerWidth >= 700 ? 3 : 2);
      const load = async () => { if (!id) return; const d = await api('GET', `/api/wheels/${id}/ranking`).catch(() => null); if (d && id) { data = d; paint(); } };
      // Cada columna en su propio recuadro (pedido de Cote): 6, 7, 8… hacia abajo y luego la columna siguiente
      const colsOf = (chunk, from) => {
        const n = cols(); const rows = Math.max(1, Math.ceil(chunk.length / n)); let out = '';
        for (let c = 0; c < n; c++) {
          const part = chunk.slice(c * rows, c * rows + rows);
          out += `<ol class="rv-col">${part.map((t, i) => `<li><em>${from + 6 + c * rows + i}</em><b>${esc(t.name)}</b><i>${t.score}</i></li>`).join('')}</ol>`;
        }
        return out;
      };
      // Antes de empezar: «¡Pronto! Ya comenzamos» y la lista de todos los que están en la sala, en muchas columnas, de a
      // 80 por página (pedido de Cote: que se vea la cantidad de gente que participa)
      // Todos los participantes caben siempre en la pantalla (pedido de Cote): con pocos, grandes; con muchos, más columnas
      // y letra más chica. Se actualiza cada 5 s a medida que entra gente (sin páginas).
      const peopleHTML = () => {
        const all = data.people || [];
        return `<div class="rv-soon small"><b>¡Pronto!</b><span>Ya comenzamos</span><small class="rv-howto">Elegimos 3 participantes al azar entre todos los conectados</small></div>
          <div class="rv-people"><small>${all.length} ${all.length === 1 ? 'persona participando' : 'personas participando'}</small>
            <ul>${all.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>`;
      };
      const layoutPeople = () => {
        const ul = $('.rv-people ul');
        if (!ul) return;
        const items = Array.from(ul.children);
        const n = items.length;
        if (!n) return;
        const W = ul.clientWidth; const H = ul.clientHeight;
        const font = getComputedStyle(items[0]);
        if (!layoutPeople.c) layoutPeople.c = document.createElement("canvas").getContext("2d");
        const ctx = layoutPeople.c;
        ctx.font = `${font.fontWeight} 100px ${font.fontFamily}`;
        const longest = Math.max(...items.map((li) => ctx.measureText(li.textContent.toUpperCase()).width)) / 100; // ancho por cada px de letra
        const GAP = 0.03 * W; const LH = 1.3;
        let best = { size: 0, cols: 1 };
        for (let cols = 1; cols <= 10; cols++) {
          const rows = Math.ceil(n / cols);
          const colW = (W - GAP * (cols - 1)) / cols;
          const size = Math.min(H / (rows * LH), colW / longest, innerHeight * 0.06);
          if (size > best.size) best = { size, cols };
        }
        ul.style.setProperty('--cols', best.cols);
        ul.style.setProperty('--rows', Math.ceil(n / best.cols));
        ul.style.fontSize = `${Math.max(5, best.size * 0.97).toFixed(1)}px`;
      };
      const html = (from, chunk, pages) => {
        const top = data.list.slice(0, 5);
        // Sin QR en la pantalla vertical (pedido de Cote). Si todavía nadie juega: «¡Pronto! Ya comenzamos»
        return `<div class="rv-rank"><header class="rv-head"><div class="rv-title"><b>Resultados</b><span>La Trivia del Rosco</span>${top.length ? `<small>${data.players} ${data.players === 1 ? 'persona jugando' : 'personas jugando'}</small>` : ''}</div></header>
          ${top.length ? `<ol class="rv-top">${top.map((t, i) => `<li><em>${i + 1}</em><b>${esc(t.name)}</b><i>${t.score} pts</i></li>`).join('')}</ol>
          <div class="rv-rest" style="--cols:${cols()}">${colsOf(chunk, from)}</div>
          <footer class="rv-pages">${pages > 1 ? `Puestos ${from + 6} al ${from + 5 + chunk.length} · página ${page + 1} de ${pages}` : ''}</footer>`
    : peopleHTML()}</div>`;
      };
      const fitNames = () => {
        layoutPeople();
        $$('.rv-top b, .rv-col b').forEach((b) => {
          b.style.fontSize = '';
          let f = parseFloat(getComputedStyle(b).fontSize);
          const min = f * 0.45;
          for (let i = 0; i < 30 && b.scrollWidth > b.clientWidth + 1 && f > min; i++) { f *= 0.94; b.style.fontSize = `${f.toFixed(1)}px`; }
        });
      };
      const paint = () => {
        if (!id || !data) return;
        const rest = data.list.slice(5);
        // Cuántos caben en una página: se prueba y se ajusta a lo que de verdad cabe en la pantalla
        const key = `${innerWidth}x${innerHeight}`;
        if (capFor !== key) { capFor = key; cap = 90; }
        for (let tries = 0; tries < 40; tries++) {
          const pages = Math.max(1, Math.ceil(rest.length / cap));
          page %= pages;
          const from = page * cap;
          $('#pw').innerHTML = html(from, rest.slice(from, from + cap), pages);
          // Nombres en una sola línea (pedido de Cote): cada nombre largo se achica hasta caber en su columna
          fitNames();
          const box = $('.rv-rest');
          if (!box || box.scrollHeight <= box.clientHeight + 1 || cap <= cols()) break;
          cap = Math.max(cols(), cap - cols());
        }
      };
      return {
        show(wid) {
          document.body.classList.add('rv-on');
          if (id === wid) return;
          id = wid; page = 0; data = null;
          load(); clearInterval(tPoll); clearInterval(tPage);
          tPoll = setInterval(load, 5000);
          tPage = setInterval(() => { page++; paint(); }, PAGE_MS);
        },
        hide() { document.body.classList.remove('rv-on'); if (!id) return; id = null; clearInterval(tPoll); clearInterval(tPage); },
      };
    })();
    const onWheel = (s) => {
      st = s;
      if (st.winner || st.crowdWinner) rankV.hide();
      soundFor(s);
      clockSound(s);
      // Ranking desplegado con el ganador ya en pantalla: los resultados finales encima (al recogerlo vuelve la felicitación)
      if (st.rank && (st.winner || st.crowdWinner)) {
        wonBy = null; clearTimeout(winTimer); clearTimeout(shrinkTimer);
        $('#pw').innerHTML = kind === 'obs' && !document.body.classList.contains('full')
          ? `<div class="obs-side obs-rankside wide">${rankHTML(st, 'obs-rank')}</div>`
          : `<div class="pw-rankwrap">${rankHTML(st, 'pw-rank')}</div>`;
        return;
      }
      // Ganador del Rosco en línea (el público): 15 segundos en pantalla y después se retira
      if (st.crowdWinner) {
        const full = document.body.classList.contains('full');
        const cw = st.crowdWinner;
        const key = `crowd|${cw.at}`;
        const left = WIN_HOLD_MS - (st.now - cw.at);
        clearTimeout(winTimer); clearTimeout(shrinkTimer);
        const gone = () => {
          wonBy = `${key}|gone`;
          $('#pw').innerHTML = full ? `<div id="fb"><div class="fb-idle"><b><i>KRB Stage</i> Sala de juegos</b><div class="fb-idle-qr">${qr(joinUrl())}</div>
            <small>Escanea el código QR con tu celular y prepárate</small></div></div>` : '';
        };
        if (left <= 0) { if (wonBy !== `${key}|gone`) gone(); return; }
        winTimer = setTimeout(gone, left);
        if (wonBy === key) return;
        wonBy = key;
        if (full) sfx.play('win');
        $('#pw').innerHTML = full ? `<div class="win-screen"><div class="win-card"><span class="win-trophy">🏅</span><span class="win-name" style="--n:${cw.name.length}">${esc(cw.name)}</span>
              <span class="win-text">¡Ganó la Trivia del Rosco! ${cw.score} puntos</span><span class="win-sub">¡Felicitaciones!</span></div></div>`
          : `<div class="rosco-winlow"><span class="rosco-winlow-tag">🏅 Ganó la Trivia del Rosco</span><b style="--n:${cw.name.length}">${esc(cw.name)}</b><small>${cw.score} puntos · ¡Felicitaciones!</small></div>`;
        return;
      }
      if (st.winner) {
        // Rosco completo: se retira todo y queda solo la felicitación, en grande
        // Ganador aceptado, en OBS: la felicitación baja a un cartel al centro para dejar ver a la persona
        const full = document.body.classList.contains('full');
        // En OBS la pantalla completa dura 6 s; después baja sola al cartel, aunque el animador no haya aceptado aún
        const sinceWin = st.now - (st.wonAt || st.now);
        const low = kind === 'obs' && !full && (st.winAccepted || sinceWin >= 6000);
        clearTimeout(shrinkTimer);
        if (kind === 'obs' && !full && !low) shrinkTimer = setTimeout(() => onWheel({ ...st, now: st.now + (6000 - sinceWin) + 50 }), 6000 - sinceWin + 50);
        // A los 15 s de aceptar al ganador se retira todo: OBS queda limpio y el tablero del DJ pasa al QR
        const left = st.winAccepted ? WIN_HOLD_MS - (st.now - st.winAcceptedAt) : Infinity;
        const cleared = () => {
          wonBy = st.winner.name + '|gone';
          $('#pw').innerHTML = full ? `<div id="fb"><div class="fb-idle"><b><i>KRB Stage</i> Sala de juegos</b><div class="fb-idle-qr">${qr(joinUrl())}</div>
            <small>Escanea el código QR con tu celular y prepárate</small></div></div>` : '';
        };
        clearTimeout(winTimer);
        if (left <= 0) { if (wonBy !== st.winner.name + '|gone') cleared(); return; }
        if (st.winAccepted) winTimer = setTimeout(cleared, left);
        const key = st.winner.name + (low ? (st.winAccepted ? '|ok' : '|low') : '');
        if (low && wonBy !== key) {
          wonBy = key;
          $('#pw').innerHTML = `<div class="rosco-winlow ${st.winAccepted ? '' : 'hold'}"><span class="rosco-winlow-tag">🏆 ${st.winner.full ? 'Completó el rosco' : 'Ganó El Rosco'}</span><b style="--n:${st.winner.name.length}">${esc(st.winner.name)}</b><small>¡Felicitaciones!</small></div>`;
        } else if (wonBy !== key) {
          wonBy = key;
          const colors = ['#ff4fa3', '#ff9a3d', '#ffe14d', '#3fe08f', '#35c6ff', '#9b5cff'];
          const confetti = Array.from({ length: 60 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s"></i>`).join('');
          $('#pw').innerHTML = `<div class="win-screen"><div class="confetti">${confetti}</div>
            <div class="win-card"><span class="win-trophy">🏆</span><span class="win-name" style="--n:${st.winner.name.length}">${esc(st.winner.name)}</span>
              <span class="win-text">${st.winner.full ? '¡Completaste el rosco!' : `¡Ganaste El Rosco! ${st.winner.hits} aciertos`}</span><span class="win-sub">¡Felicitaciones!</span></div></div>`;
        }
        return;
      }
      wonBy = null; clearTimeout(winTimer); clearTimeout(shrinkTimer);
      if (kind === 'obs') {
        // En OBS: solo la rueda del concursante en turno, con el centro libre para su cámara,
        // y el reloj con el marcador en una esquina. Pedido de Cote: el rosco y la pregunta se ven desde «Iniciar pregunta»
        // (o con el botón «Rosco en pantalla»); con un fallo o un paso salen al instante y queda solo el marcador.
        $('#pw').innerHTML = `<div class="obs-corner">${st.players.map((c, i) => `<div class="obs-player ${i === st.turn && !st.finished ? 'on' : ''}">
            <span class="obs-clock" data-timer="${i}">${clock(c.remainingMs)}</span>
            <span class="obs-name">${esc(c.name)}</span>
            <span class="obs-score"><b class="ok">✔ ${c.hits}</b> <b class="ko">✘ ${c.misses}</b></span></div>`).join('')}</div>
          ${st.onScreen ? `<div class="obs-wheel">${wheelSVG(st, st.turn, false, true)}</div>` : ''}
          ${st.rank ? `<div class="obs-side obs-rankside ${st.onScreen ? '' : 'wide'}">${rankHTML(st, 'obs-rank')}</div>` : st.onScreen ? `<div class="obs-side">${questionCard(st)}${revealCard(st, 'obs-reveal')}</div>` : ''}
          ${flashCard(st)}`;
        lastQuestion = st.question;
        scheduleRevealEnd(st);
        scheduleFlash(st);
        return;
      }
      // Pantalla vertical (pedido de Cote): en vez de los roscos, el ranking completo de la Trivia del Rosco
      if (kind === 'rueda' && document.body.classList.contains('full') && innerHeight > innerWidth) { rankV.show(st.id); return; }
      rankV.hide();
      // Sin pregunta ni respuesta en pantalla (pedido de Cote): el título crece y ocupa el espacio de arriba, con letras de
      // colores que se mueven; al iniciar la pregunta vuelve a su tamaño
      const idle = !st.question && revealLeft(st) <= 0;
      const fun = [...String(st.name)].map((ch, i) => (ch === ' ' ? '<i class="sp"> </i>' : `<i style="--i:${i}">${esc(ch)}</i>`)).join('');
      $('#pw').classList.toggle('pw-idle', idle);
      // Instrucciones antes de empezar (pedido de Cote)
      const started = !!st.runningSince || st.players.some((c) => c.status.some((x) => x !== 'pending'));
      $('#pw').classList.toggle('pw-howto-on', idle && !started);
      $('#pw').innerHTML = `<h1 class="pw-title"><span class="pw-plain">${esc(st.name)}</span><span class="pw-fun" aria-hidden="true">${fun}</span>${started ? '' : '<small class="pw-howto">Elegimos 3 participantes al azar entre todos los conectados</small>'}</h1>
        <div class="pw-text">${revealCard(st, 'pw-reveal')}${st.question ? `<div class="pw-question">${esc(st.question)}</div>` : ''}</div>
        <div class="wheels n${st.players.length}">${st.players.map((_, i) => `<div class="wheel-box ${i === st.turn && !st.finished ? 'on' : 'off'}">${wheelSVG(st, i)}</div>`).join('')}</div>
        ${st.rank ? `<div class="pw-rankwrap">${rankHTML(st, 'pw-rank')}</div>` : ''}`;
      scheduleRevealEnd(st);
    };
    const off = watch(id, onWheel, () => { leave(); if (['#/escena', '#/gc', '#/obs', '#/tablero', `#/${kind}`].includes(location.hash)) route(); else location.hash = `#/${kind}`; });
    return () => { off(); stopClocks(); leave(); };
  }
  views.rueda = (id) => publicView('rueda', id);
  views.obs = (id) => publicView('obs', id);
})();
