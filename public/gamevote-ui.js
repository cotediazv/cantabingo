// Elegir el juego por votación del público (pedido de Cote, 21 nov): pestaña «Por votación» del lobby y del menú de
// juegos. 30 segundos para votar desde el celular; gana el juego con más de la mitad de los votos (50 % + 1) y, si
// ninguno lo logra, hay segunda vuelta entre los 2 primeros. En el tablero y en el GC: un gráfico en círculo por juego,
// con su porcentaje y sus votos. Servidor: /api/gamevote en server.js (escenario «votojuego»).
(() => {
  const COLORS = { bingo: '#ff2e93', rosco: '#9b6bff', festival: '#ffc400', objeto: '#19d6b0' };
  const C = 2 * Math.PI * 42; // largo del anillo (radio 42 en un cuadro de 100)
  const pctOf = (n, total) => (total ? (n * 100) / total : 0);
  // Porcentaje entero; justo en torno al 50 % va con un decimal, para que se vea si pasó la mitad o no
  const fmtPct = (p) => { const r = Math.round(p); return `${r === 50 && p !== 50 ? p.toFixed(1).replace('.', ',') : r}%`; };
  const votos = (n) => `${n} ${n === 1 ? 'voto' : 'votos'}`;
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const nameOf = (info, k) => `${info[k].icon} ${esc(info[k].name)}`;
  // Gráfico en círculo de un juego: el anillo se llena según su porcentaje; al centro, el porcentaje y los votos
  const ring = (k, info, cls) => `<div class="gv-opt ${cls}" data-k="${k}" style="--c:${COLORS[k] || '#ffc400'}">
      <div class="gv-ring"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="gv-track" cx="50" cy="50" r="42"/><circle class="gv-arc" cx="50" cy="50" r="42" stroke-dasharray="0 ${C.toFixed(2)}"/></svg>
      <span class="gv-in"><b>0%</b><small>0 votos</small></span></div><span class="gv-name">${nameOf(info, k)}</span></div>`;
  const setRings = (root, g) => {
    root.querySelectorAll('.gv-opt').forEach((o) => {
      const n = (g.counts || {})[o.dataset.k] || 0;
      const p = pctOf(n, g.total);
      o.querySelector('.gv-arc').setAttribute('stroke-dasharray', `${((p * C) / 100).toFixed(2)} ${C.toFixed(2)}`);
      o.querySelector('.gv-in b').textContent = fmtPct(p);
      o.querySelector('.gv-in small').textContent = votos(n);
    });
  };
  // Clase de cada juego según el momento: el ganador destacado; en el resultado sin mayoría, los 2 de la segunda vuelta
  const clsOf = (g, k) => (g.phase === 'done' ? (k === g.winner ? 'win' : 'dim') : g.phase === 'result' && g.runoff ? (g.runoff.includes(k) ? 'sel' : 'dim') : '');
  // Textos de cada momento (sin repetir lo que ya dice otra parte de la pantalla)
  const textsOf = (g, info) => {
    if (g.phase === 'voting') return { top: g.round === 2 ? '🗳️ Segunda vuelta' : '🗳️ Votación', big: '¿Qué juego quieren jugar?', line: 'Quedan <b class="gv-clock">0:30</b>' };
    if (g.phase === 'result' && g.empty) return { top: '🗳️ Votación', big: 'Nadie votó', line: '' };
    if (g.phase === 'result' && g.runoff) {
      return { top: '🗳️ Resultado de la votación', big: 'Nadie superó el 50%',
        line: `Segunda vuelta: ${nameOf(info, g.runoff[0])} y ${nameOf(info, g.runoff[1])}${g.tie2 ? ' · empate en el 2.º lugar: se sorteó' : ''}` };
    }
    if (g.phase === 'done' && g.winner) {
      return { top: g.round === 2 ? '🗳️ Resultado de la segunda vuelta' : '🗳️ Resultado de la votación', big: `🏆 ¡Ganó ${nameOf(info, g.winner)}!`,
        line: g.tie ? 'Empate en la segunda vuelta: se decidió por sorteo' : '' };
    }
    return { top: '🗳️ Votación', big: '¿Qué juego quieren jugar?', line: '' };
  };
  const optionsOf = (g) => (g.options && g.options.length ? g.options : ['bingo', 'rosco', 'festival', 'objeto']);
  // Achica un texto de una línea hasta que quepa en su cuadro (nunca se corta)
  const fitText = (el) => {
    if (!el) return;
    el.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(el).fontSize) || 20;
    while (el.scrollWidth > el.clientWidth + 1 && fs > 8) { fs -= 1; el.style.fontSize = `${fs}px`; }
  };

  // ---------- Pantallas: tablero del local ('full') y GC de OBS ('gc') ----------
  views.gameVote = async (kind) => {
    app.innerHTML = `<div id="gv" class="gv-${kind}"></div>`;
    let alive = true; let g = null; let off = 0; let sig = ''; let pollT = null; let tickT = null; let played = 0;
    // Todo dentro del cuadro y de la pantalla: los textos largos se achican (los nombres de los juegos pasan a dos líneas)
    // y, si el cuadro igual no cabe en el alto, se achica entero
    const fit = () => {
      const box = $('#gv'); const card = box && box.querySelector('.gv-card');
      if (!card) return;
      card.querySelectorAll('.gv-big, .gv-line').forEach(fitText);
      card.style.transform = '';
      const cs = getComputedStyle(box);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (card.offsetHeight > avail && avail > 0) card.style.transform = `scale(${(avail / card.offsetHeight).toFixed(3)})`;
    };
    const paint = () => {
      const box = $('#gv');
      if (!box || !g) return;
      const info = GAME_INFO(g.venue);
      const s = JSON.stringify([g.id, g.round, g.phase, g.options, g.runoff, g.winner, g.empty, g.tie, g.tie2]);
      if (s !== sig) {
        sig = s;
        const t = textsOf(g, info);
        const qrBox = kind === 'full' ? `<div class="gv-qr">${qr(joinUrl())}<b>Escanea el código QR con tu celular</b></div>` : '';
        box.innerHTML = `<div class="gv-card"><div class="gv-main"><small class="gv-top">${t.top}</small><b class="gv-big">${t.big}</b>${t.line ? `<p class="gv-line">${t.line}</p>` : ''}
          <div class="gv-rings n${optionsOf(g).length}">${optionsOf(g).map((k) => ring(k, info, clsOf(g, k))).join('')}</div><small class="gv-total"></small></div>${qrBox}</div>`;
        setRings(box, { ...g, counts: Object.fromEntries(optionsOf(g).map((k) => [k, 0])), total: 0 }); // parte en cero y se llena con animación
        fit();
        if (g.phase === 'done' && Date.now() + off - g.decidedAt < 15000 && played !== g.id) { played = g.id; sfx.play('win'); }
        const now = g;
        requestAnimationFrame(() => requestAnimationFrame(() => { if (alive && g === now) setRings(box, g); }));
      } else setRings(box, g);
      const tot = box.querySelector('.gv-total');
      if (tot) tot.textContent = g.total ? `${votos(g.total)} en total` : '';
    };
    const tick = () => {
      const el = $('#gv .gv-clock');
      if (el && g && g.phase === 'voting') { const left = g.until - (Date.now() + off); el.textContent = left > 0 ? clock(left) : 'contando votos…'; }
    };
    const load = async () => {
      const r = await api('GET', '/api/gamevote').catch(() => null);
      if (!alive) return;
      if (r) { g = r; off = r.now - Date.now(); paint(); tick(); }
      pollT = setTimeout(load, g && g.phase === 'voting' ? 1000 : 2000); // durante la votación, los votos se ven llegar
    };
    await load();
    tickT = setInterval(tick, 250);
    addEventListener('resize', fit);
    return () => { alive = false; clearTimeout(pollT); clearInterval(tickT); removeEventListener('resize', fit); };
  };

  // ---------- Celular del público ----------
  let shown = ''; let cur = null; let phoneTick = null; let closingFor = '';
  const stopPhoneTick = () => { clearInterval(phoneTick); phoneTick = null; };
  window.phoneGvote = {
    reset() { shown = ''; },
    stop() { stopPhoneTick(); shown = ''; },
    async draw(sid, token) {
      const box = $('#pgvote');
      const g = await api('GET', `/api/gamevote?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(token)}`).catch(() => null);
      if (!g || !box || box.hidden) return;
      cur = { sid, token, g, off: g.now - Date.now() };
      const s = JSON.stringify([g.id, g.round, g.phase, g.mine, g.winner, g.runoff, g.empty, g.phase === 'voting' ? 0 : g.counts]);
      if (s === shown) return;
      shown = s;
      const info = GAME_INFO(g.venue);
      const rows = () => `<div class="pgv-rows">${optionsOf(g).map((k) => { const p = pctOf((g.counts || {})[k] || 0, g.total); return `<div class="pgv-row ${clsOf(g, k)}" style="--c:${COLORS[k]};--p:${p.toFixed(1)}%"><span>${nameOf(info, k)}</span><b>${fmtPct(p)}</b></div>`; }).join('')}</div>`;
      let body;
      if (g.phase === 'voting') {
        body = `<p class="pvote-ask">${g.round === 2 ? 'Segunda vuelta' : 'Votación'}<b>¿Qué juego quieres jugar?</b></p>
          <div class="pvote-duel pgv-opts">${optionsOf(g).map((k) => `<button type="button" data-gv="${k}" class="${g.mine === k ? 'on' : ''}" style="--c:${COLORS[k]}">${nameOf(info, k)}</button>`).join('')}</div>
          <p class="pvote-clock">Quedan <b class="gv-pclock">${clock(g.until - (Date.now() + cur.off))}</b></p>
          ${g.mine ? '<p class="pvote-ok">✔ Voto recibido. Puedes cambiarlo mientras la votación esté abierta.</p>' : '<p class="muted small" style="text-align:center">Toca el juego que quieres jugar.</p>'}`;
      } else if (g.phase === 'result' && g.empty) body = '<p class="pvote-wait">Nadie votó.</p>';
      else if (g.phase === 'result' && g.runoff) body = `<p class="pvote-wait">Nadie superó el 50%.<br>¡Se viene la segunda vuelta entre <b>${nameOf(info, g.runoff[0])}</b> y <b>${nameOf(info, g.runoff[1])}</b>!</p>${rows()}`;
      else if (g.phase === 'done' && g.winner) body = `<div class="pvote-win">🏆 ${nameOf(info, g.winner)}<small>¡Ganó la votación!</small></div>${rows()}`;
      else body = '<p class="pvote-wait">Cuando se abra la votación, aquí aparecerán los juegos.</p>';
      box.innerHTML = `<div class="pvote-head"><b>🗳️ Elige el próximo juego</b></div>${body}`;
      stopPhoneTick();
      if (g.phase === 'voting') {
        phoneTick = setInterval(() => {
          const el = box.querySelector('.gv-pclock');
          if (!el || !cur || cur.g.phase !== 'voting') { stopPhoneTick(); return; }
          const left = cur.g.until - (Date.now() + cur.off);
          el.textContent = left > 0 ? clock(left) : 'contando votos…';
          const key = `${cur.g.id}:${cur.g.round}`;
          if (left < -1500 && closingFor !== key) { closingFor = key; shown = ''; window.phoneGvote.draw(cur.sid, cur.token); } // al cerrar, se lee el resultado
        }, 250);
      }
      box.onclick = async (e) => {
        const b = e.target.closest('[data-gv]');
        if (!b || !cur) return;
        box.querySelectorAll('[data-gv]').forEach((x) => x.classList.toggle('on', x === b)); // respuesta inmediata al tocar
        try { await api('POST', '/api/gamevote/vote', { sid: cur.sid, token: cur.token, game: b.dataset.gv }); } catch (err) { fail(err); }
        shown = '';
        window.phoneGvote.draw(cur.sid, cur.token);
      };
    },
  };

  // ---------- Panel del animador: recuadro de la pestaña «Por votación» en el menú de juegos ----------
  let panelT = null; let lastSeen = null;
  const goGame = (k, info) => { if (k === 'bingo') backToBingo(); else location.hash = info[k].href; };
  window.paintGvote = async (how) => {
    clearTimeout(panelT); panelT = null;
    const boxes = document.querySelectorAll('.g-vote');
    if (!boxes.length || how !== 'votacion') return;
    const g = await api('GET', '/api/gamevote').catch(() => null);
    if (!g) return;
    if (g.phase === 'voting' || (g.phase === 'result' && g.runoff)) window.openNavMode('votacion'); // a medio hacer: se despliega sola
    const info = GAME_INFO(g.venue);
    const off = g.now - Date.now();
    const rows = `<div class="gvp-rows">${optionsOf(g).map((k) => { const n = (g.counts || {})[k] || 0; const p = pctOf(n, g.total); return `<div class="gvp-row ${clsOf(g, k)}" style="--c:${COLORS[k]};--p:${p.toFixed(1)}%"><span>${nameOf(info, k)}</span><b>${fmtPct(p)} · ${votos(n)}</b></div>`; }).join('')}</div>`;
    const cancel = '<button type="button" class="g-undo" data-gv-reset>✖ Cancelar votación</button>';
    let html;
    if (g.phase === 'voting') {
      html = `<p class="gvp-now">🗳️ ${g.round === 2 ? 'Segunda vuelta' : 'Votación abierta'} · quedan <b>${clock(g.until - (Date.now() + off))}</b> · ${votos(g.total)}</p>${rows}
        <button type="button" class="primary big g-draw" disabled>🗳️ Votando…</button>${cancel}`;
    } else if (g.phase === 'result' && g.empty) {
      html = `<p class="gvp-now">Nadie votó.</p><button type="button" class="primary big g-draw" data-gv-start>🗳️ Repetir votación (30 s)</button>${cancel}`;
    } else if (g.phase === 'result' && g.runoff) {
      html = `<p class="gvp-now">Nadie superó el 50%. Segunda vuelta: ${nameOf(info, g.runoff[0])} y ${nameOf(info, g.runoff[1])}${g.tie2 ? ' (empate en el 2.º lugar: se sorteó)' : ''}.</p>${rows}
        <button type="button" class="primary big g-draw" data-gv-start>🗳️ Iniciar segunda vuelta (30 s)</button>${cancel}`;
    } else if (g.phase === 'done' && g.winner) {
      html = `<p class="gvp-win">🏆 Ganó ${nameOf(info, g.winner)}${g.tie ? ' (empate: se decidió por sorteo)' : ''}</p>${rows}
        <button type="button" class="primary big g-draw" data-gv-go="${g.winner}">▶ Ir a ${nameOf(info, g.winner)}</button>
        <button type="button" class="g-undo" data-gv-start>🗳️ Nueva votación (30 s)</button>`;
    } else {
      html = `<p class="gvp-help">El público elige el próximo juego desde su celular, en 30 segundos. Gana el juego con más de la mitad de los votos; si ninguno lo logra, hay segunda vuelta entre los 2 primeros.</p>
        <button type="button" class="primary big g-draw" data-gv-start>🗳️ Iniciar votación (30 s)</button>`;
    }
    boxes.forEach((b) => { if (b.innerHTML !== html) b.innerHTML = html; });
    // Cuando se decide el ganador mientras el panel mira la votación, el panel pasa solo a ese juego (como el sorteo)
    if (lastSeen && lastSeen.id === g.id && lastSeen.phase === 'voting' && g.phase === 'done' && g.winner) {
      toast(`🗳️ Ganó ${info[g.winner].icon} ${info[g.winner].name}. En unos segundos pasamos al juego…`);
      clearTimeout(window.gameDrawGo);
      window.gameDrawGo = setTimeout(() => goGame(g.winner, info), 8000);
    }
    lastSeen = { id: g.id, phase: g.phase };
    // Reloj y votos en vivo cada segundo; fuera de la votación, cada 3 s (por si otro equipo la abre, p. ej. el iPad)
    panelT = setTimeout(() => window.paintGvote(how), g.phase === 'voting' ? 1000 : 3000);
  };
  document.addEventListener('click', async (e) => {
    const start = e.target.closest('[data-gv-start]');
    const reset = e.target.closest('[data-gv-reset]');
    const go = e.target.closest('[data-gv-go]');
    if (!start && !reset && !go) return;
    if (go) { clearTimeout(window.gameDrawGo); const g = await api('GET', '/api/gamevote').catch(() => null); goGame(go.dataset.gvGo, GAME_INFO((g || {}).venue)); return; }
    const b = start || reset;
    if (b.disabled) return;
    b.disabled = true;
    clearTimeout(window.gameDrawGo);
    try {
      if (start) { await api('POST', '/api/gamevote/start'); toast('🗳️ Votación abierta: 30 segundos para votar desde el celular'); } else { await api('POST', '/api/gamevote/reset'); toast('Votación cancelada'); }
    } catch (err) { fail(err); }
    b.disabled = false;
    window.paintGvote('votacion');
  });
})();
