/* global views, app, $, esc, api, qr, joinUrl, isAdmin, viewLogin, fail, sfx, activitiesNav, toast */
// «El Gran Desafío»: panel del animador, tablero del local, GC de OBS y botones del celular.
(() => {
  const L = ['A', 'B', 'C', 'D'];
  const n = (t) => `style="--n:${Math.max(10, String(t).length)}"`;
  // Relojes (pregunta al público y llamada): cada pantalla los lleva con su propia hora, a partir de lo que dice el servidor
  const clocks = {};
  const setClock = (key, until, now) => { if (!until) { delete clocks[key]; return; } if (!clocks[key] || clocks[key].until !== until) clocks[key] = { until, end: Date.now() + (until - now) }; };
  const left = (key) => (clocks[key] ? Math.max(0, clocks[key].end - Date.now()) : 0);
  const secs = (key) => Math.ceil(left(key) / 1000);
  setInterval(() => { for (const el of document.querySelectorAll('[data-clock]')) el.textContent = secs(el.dataset.clock); }, 200);
  const syncClocks = (st) => {
    setClock('aud', st.audience && st.audience.open ? st.audience.until : 0, st.now);
    setClock('phone', st.phoneUntil && st.phoneUntil > st.now ? st.phoneUntil : 0, st.now);
  };
  const prizeOf = (st, step) => st.prizes[step - 1] || '';
  // ---------- La Trivia del Gran Desafío (el público juega desde el celular; pedido de Gabriel, 25 nov) ----------
  const TRIVIA = 'La Trivia del Gran Desafío';
  const TRIVIA_L = 'la Trivia del Gran Desafío'; // a mitad de frase
  const many = (k, one, more) => `${k} ${k === 1 ? one : more}`;
  const stamp = (st) => { if (st) st.got = Date.now(); return st; };
  // Cuánto le queda a la «tómbola» del ganador de la Trivia (5,5 s), con la hora de esta pantalla
  const rollLeft = (st) => {
    const cw = st && st.crowdWinner;
    if (!cw || cw.none || !cw.roll || !cw.rollMs) return 0;
    return cw.rollMs - (st.now - cw.at) - (Date.now() - (st.got || Date.now()));
  };
  // Hace pasar los nombres de la tómbola por el elemento, cada vez más lento, hasta que se acaba el tiempo
  let spinT = null;
  const spin = (el, names, ms) => {
    clearTimeout(spinT);
    const list = names.length > 1 ? names : [names[0], names[0]];
    let i = 0; let wait = 70; const t0 = Date.now();
    const step = () => {
      if (!el.isConnected) return;
      const nm = list[i++ % list.length]; el.textContent = nm; el.style.setProperty('--n', Math.max(10, nm.length));
      wait = Math.min(420, wait * 1.07);
      if (Date.now() - t0 + wait < ms) spinT = setTimeout(step, wait);
    };
    step();
  };
  window.DESAFIO_HOWTO = [
    'Un concursante sube 10 escalones de preguntas en el escenario.',
    'Tú también juegas: <b>responde cada pregunta desde tu celular</b> antes de la respuesta definitiva del concursante.',
    'Mientras más rápido, más puntos. Se suman al revelar la respuesta.',
    `<b>Premio especial</b> para el ganador de ${TRIVIA_L}.`,
  ];
  const LIFELINES = [['fifty', '50:50', '✂️'], ['audience', 'Pregunta al público', '📱'], ['phone', 'Llamada', '📞'], ['swap', 'Cambiar pregunta', '🔄']];

  // ---------- Panel del animador ----------
  views.desafioctl = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = `<div class="panel dc"><h1 style="margin:0">🏆 El Gran Desafío</h1><div id="dc-body" style="margin-top:14px"></div></div>
      ${activitiesNav('desafio')}
      <p style="margin-top:14px"><button class="big" id="dc-reset">🗑 Terminar partida (vuelve a empezar)</button></p>`;
    let st = null;
    let sig = '';
    let pick = null; // alternativa tocada, antes de confirmarla como respuesta definitiva
    const act = async (action, extra = {}) => { try { st = stamp(await api('POST', '/api/desafio/host', { action, ...extra })); sig = ''; paint(); return true; } catch (err) { fail(err); return false; } };
    const setupForm = () => {
      const prizes = st.prizes && st.prizes.length ? st.prizes : st.defaults.prizes;
      return `<form id="dc-new">
        <label class="f">Nombre del concursante<input type="text" id="dc-player" maxlength="40" required autocomplete="off" placeholder="Ej.: Camila"></label>
        <p class="muted small" style="margin:14px 0 6px">Premio de cada escalón y escalones seguros (si pierde, se lleva el último seguro que superó).</p>
        <div class="dc-prizes">${prizes.map((p, i) => i).reverse().map((i) => `<label><b>${i + 1}</b><input type="text" data-prize="${i}" maxlength="30" value="${esc(prizes[i])}">${i < 9 ? `<span><input type="checkbox" data-safe="${i + 1}" ${st.safe.includes(i + 1) ? 'checked' : ''}> Seguro</span>` : '<span></span>'}</label>`).join('')}</div>
        <button class="primary big" style="margin-top:14px">▶ Presentar en pantalla</button></form>`;
    };
    const lifelines = () => `<div class="dc-life">${LIFELINES.map(([k, name, icon]) => `<button type="button" data-life="${k}" ${st.used[k] ? 'disabled' : ''}><span>${icon}</span>${name}${st.used[k] ? '<small>Ya usado en esta partida</small>' : ''}</button>`).join('')}</div>`;
    const options = (clickable) => `<div class="dc-opts">${st.q.options.map((o, i) => {
      const cls = [i === st.answer ? 'ok' : '', st.hidden.includes(i) ? 'gone' : '', i === (st.pick != null ? st.pick : pick) ? 'on' : ''].join(' ');
      return `<button type="button" class="${cls}" ${clickable && !st.hidden.includes(i) ? `data-pick="${i}"` : 'disabled'}><b>${L[i]}</b><span>${esc(o)}</span>${i === st.answer ? '<i>✔ correcta</i>' : ''}</button>`;
    }).join('')}</div>`;
    const extras = () => {
      let out = '';
      if (st.audience) {
        const t = st.live;
        out += `<div class="dc-aud"><b>📱 Pregunta al público ${st.audience.open ? `· quedan <span data-clock="aud">${secs('aud')}</span> s` : '· cerrada'}</b>
          <div>${L.map((l, i) => `<p><span>${l}</span><i style="--p:${t.pct[i]}%"></i><em>${t.pct[i]}% (${t.counts[i]})</em></p>`).join('')}</div>
          <small>${many(t.total, 'respuesta', 'respuestas')} de la Trivia</small>${st.audience.open ? '<button type="button" data-do="closeaudience">Cerrar votación ya</button>' : ''}</div>`;
      } else if (st.crowd && (st.phase === 'question' || st.phase === 'locked')) {
        out += `<p class="dc-crowd">📱 ${TRIVIA}: <b>${many(st.crowd.answered, 'respuesta', 'respuestas')}</b> ${st.crowd.open ? '· abierta hasta la respuesta definitiva' : '· cerrada'}</p>`;
      }
      if (left('phone') > 0) out += `<div class="dc-aud"><b>📞 Llamada · quedan <span data-clock="phone">${secs('phone')}</span> s</b><button type="button" data-do="stopphone">Terminar llamada</button></div>`;
      return out;
    };
    const paint = () => {
      const box = $('#dc-body');
      if (!box || !st) return;
      syncClocks(st);
      const s = JSON.stringify([st.phase, st.step, st.q && st.q.text, st.hidden, st.pick, st.used, st.audience, st.live, st.phoneUntil > st.now, pick, st.crowd, st.rank, st.rankPlayers, st.crowdWinner, rollLeft(st) > 200]);
      if (s === sig) return;
      if (st.phase === 'setup' && sig && JSON.parse(sig)[0] === 'setup') return; // no se borra lo que se está escribiendo
      sig = s;
      const head = st.step ? `<p class="dc-step">Pregunta <b>${st.step}</b> de ${st.steps} · por <b>${esc(prizeOf(st, st.step))}</b>${st.safe.includes(st.step) ? ' · 🛟 escalón seguro' : ''}</p>` : '';
      const read = st.q ? `<p class="dc-read">${esc(st.q.text)}</p>` : '';
      // Trivia: ranking en pantalla (arriba, grande, como en El Rosko) y su botón
      const rankBox = st.rank ? window.rankAnnHtml(st.rank, st.rankPlayers, !!st.crowdWinner || st.phase === 'end', TRIVIA_L) : '';
      const rankBtn = `<button type="button" class="big dc-rankbtn ${st.rank ? 'on' : ''}" data-rank>${st.rank ? '🏅 Recoger ranking (está en pantalla)' : `🏅 Desplegar ranking de ${TRIVIA_L}`}</button>`;
      if (st.phase === 'setup') box.innerHTML = setupForm();
      else if (st.phase === 'intro') {
        box.innerHTML = `<p class="dc-read">Concursante: ${esc(st.player)}</p><p class="muted">En pantalla se ve la presentación con la escalera de premios.</p>
          <button class="primary big" data-do="next">▶ Primera pregunta</button>`;
      } else if (st.phase === 'question') {
        const chosen = pick != null && !st.hidden.includes(pick) ? pick : null;
        box.innerHTML = `${rankBox}${head}${read}${options(true)}
          <button class="primary big" data-lock ${chosen == null ? 'disabled' : ''}>🔒 Respuesta definitiva${chosen != null ? `: ${L[chosen]}` : ''}</button>
          ${extras()}<h2 style="margin:18px 0 6px">Comodines</h2>${lifelines()}
          <button class="big dc-retire" data-do="retire">🏳 Se retira con ${esc(st.step > 1 ? prizeOf(st, st.step - 1) : 'nada')}</button>${rankBtn}`;
      } else if (st.phase === 'locked') {
        box.innerHTML = `${rankBox}${head}${read}${options(false)}<p class="dc-note">Respuesta definitiva: <b>${L[st.pick]}</b>. En pantalla queda marcada, en suspenso.</p>
          ${extras()}<button class="primary big" data-do="reveal">✨ Revelar</button>
          <button class="big" data-do="unlock" style="margin-top:8px">↩ Cambiar la respuesta</button>`;
      } else if (st.phase === 'reveal') {
        const ok = st.pick === st.answer;
        box.innerHTML = `${rankBox}${head}${read}${options(false)}<p class="dc-result ${ok ? 'ok' : 'bad'}">${ok ? '✔ ¡Correcta!' : `✘ Incorrecta · se lleva ${esc(st.won || prizeOf(st, Math.max(0, ...st.safe.filter((x) => x < st.step))) || 'nada')}`}</p>
          <button class="primary big" data-do="next">${ok && st.step < st.steps ? `▶ Pregunta ${st.step + 1}` : '🏁 Ver resultado'}</button>${rankBtn}`;
      } else if (st.phase === 'end') {
        const txt = { won: '🏆 ¡Ganó El Gran Desafío!', retired: '🏳 Se retiró', lost: '✘ Perdió' }[st.outcome];
        box.innerHTML = `<p class="dc-result ${st.outcome === 'lost' ? 'bad' : 'ok'}">${txt}<br>${esc(st.player)} se lleva: <b>${esc(st.won || 'nada')}</b></p>
          ${st.q ? `<p class="muted">La respuesta correcta era ${L[st.answer]}: ${esc(st.q.options[st.answer])}</p>` : ''}
          ${crowdEnd()}`;
      }
      const form = $('#dc-new');
      if (form) {
        form.onsubmit = async (e) => {
          e.preventDefault();
          const prizes = [...form.querySelectorAll('[data-prize]')].sort((a, b) => a.dataset.prize - b.dataset.prize).map((x) => x.value);
          const safe = [...form.querySelectorAll('[data-safe]:checked')].map((x) => Number(x.dataset.safe));
          pick = null;
          await act('new', { player: $('#dc-player').value, prizes, safe });
        };
      }
    };
    // Al terminar: ranking (opcional), el ganador de la Trivia con su tómbola y, recién después, «Nueva partida»
    const crowdEnd = () => {
      const cw = st.crowdWinner;
      const rankBox = st.rank ? window.rankAnnHtml(st.rank, st.rankPlayers, true, TRIVIA_L) : '';
      const rankBtn = `<button type="button" class="big dc-rankbtn ${st.rank ? 'on' : ''}" data-rank>${st.rank ? '🏅 Recoger ranking (está en pantalla)' : '🏅 Desplegar ranking final'}</button>`;
      if (!cw) return `${rankBox}<button class="primary big" data-do="crowdwin">🏅 Mostrar ganador de ${TRIVIA_L}</button>${rankBtn}`;
      const left = rollLeft(st);
      if (left > 200) { setTimeout(() => { sig = ''; paint(); }, left + 50); return window.annHtml(`🥁 ${TRIVIA}`, ['Sorteando en pantalla…'], ['El nombre sale aquí cuando se detenga la tómbola']); }
      const ann = cw.none ? window.annHtml(`🏅 ${TRIVIA}`, ['Nadie sumó puntos'], [`Jugaron ${many(cw.players, 'persona', 'personas')}`])
        : window.annHtml(`🏅 Premio especial · Ganó ${TRIVIA_L}`, [cw.name], [`${many(cw.score, 'punto', 'puntos')} · ${many(cw.hits, 'acierto', 'aciertos')}`, `Jugaron ${many(cw.players, 'persona', 'personas')}`]);
      return `${ann}${rankBox}${rankBtn}<button class="primary big" data-do="reset" style="margin-top:12px">▶ Nueva partida</button>`;
    };
    $('#dc-body').onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.hasAttribute('data-rank')) { await act('rank', { on: !st.rank }); return; }
      if (b.dataset.pick != null) { pick = Number(b.dataset.pick); paint(); return; }
      if (b.hasAttribute('data-lock')) { if (await act('lock', { choice: pick })) pick = null; return; }
      if (b.dataset.life) {
        const name = LIFELINES.find(([k]) => k === b.dataset.life)[1];
        if (confirm(`¿Usar el comodín «${name}»?`)) await act(b.dataset.life);
        return;
      }
      if (b.dataset.do === 'retire' && !confirm('¿El concursante se retira con lo que lleva?')) return;
      if (b.dataset.do) { if (b.dataset.do === 'next' || b.dataset.do === 'unlock') pick = null; await act(b.dataset.do); }
    };
    $('#dc-reset').onclick = async () => { if (confirm('¿Terminar esta partida y volver a empezar?')) { pick = null; await act('reset'); } };
    const load = async () => { const r = await api('GET', '/api/desafio/host').catch(() => null); if (r) { st = stamp(r); paint(); } };
    await load();
    const timer = setInterval(load, 1000);
    return () => clearInterval(timer);
  };

  // ---------- Celular: la Trivia del Gran Desafío (responde cada pregunta; el comodín usa estas mismas respuestas) ----------
  let shown = '';
  let sending = null; // alternativa tocada mientras se envía (se ve marcada al instante)
  let phoneT = null;
  window.phoneDesafio = {
    reset() { shown = ''; sending = null; clearTimeout(phoneT); },
    async draw(sid, token) {
      const box = $('#pdesafio');
      const st = stamp(await api('GET', `/api/desafio?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(token)}`).catch(() => null));
      if (!st || !box || box.hidden) return;
      syncClocks(st);
      const rolling = rollLeft(st) > 200;
      const s = JSON.stringify([st.rev, st.mine, st.mineResult, st.me, st.top, st.crowd, rolling, sending]);
      if (s === shown) return;
      shown = s;
      const head = '<div class="pvote-head"><b>🏆 El Gran Desafío</b></div>';
      const cw = st.crowdWinner;
      let body = '';
      if (cw && rolling) {
        body = `<div class="prosco-win">🥁 ${TRIVIA}<small>¡Ya viene el ganador! Mira la pantalla</small></div>`;
        clearTimeout(phoneT); phoneT = setTimeout(() => { shown = ''; window.phoneDesafio.draw(sid, token); }, rollLeft(st) + 100);
      } else if (cw) {
        body = cw.none ? `<div class="prosco-win">🏅 ${TRIVIA}<small>Esta vez nadie sumó puntos</small></div>`
          : `<div class="prosco-win">🏅 ${esc(cw.name)}<small>¡Ganó ${TRIVIA_L}! · ${many(cw.score, 'punto', 'puntos')}</small></div>`;
      } else if (st.phase === 'question' && st.q) {
        const mine = st.mine != null ? st.mine : sending;
        const open = st.crowd && st.crowd.open;
        body = `<p class="pvote-ask">${st.audience && st.audience.open ? 'Pregunta al público' : `Pregunta ${st.step} de ${st.steps}`}<b>${esc(st.q.text)}</b></p>
          <div class="pdes-opts">${st.q.options.map((o, i) => (st.hidden.includes(i) ? '' : `<button type="button" data-c="${i}" class="${mine === i ? 'on' : ''}" ${mine != null || !open ? 'disabled' : ''}><b>${L[i]}</b>${esc(o)}</button>`)).join('')}</div>
          ${st.audience && st.audience.open ? `<p class="pvote-clock">Quedan <b data-clock="aud">${secs('aud')}</b> s</p>` : ''}
          ${mine != null ? `<p class="pvote-ok">✔ Respondiste ${L[mine]}. Se sabrá al revelar.</p>`
            : open ? '<p class="muted small" style="text-align:center">Responde antes de la respuesta definitiva del concursante: mientras más rápido, más puntos</p>'
              : '<p class="pvote-wait">Se cerraron las respuestas de esta pregunta</p>'}`;
      } else if (st.phase === 'locked' && st.q) {
        body = `<p class="pvote-wait">${esc(st.player)} dio su respuesta definitiva.<br>${st.mine != null ? `Tu respuesta: <b>${L[st.mine]}</b>. ¡Suspenso!` : 'Esta vez no alcanzaste a responder.'}</p>`;
      } else if (st.phase === 'reveal' && st.q) {
        const r = st.mineResult;
        body = `<p class="pvote-wait">La correcta era <b>${L[st.correct]}: ${esc(st.q.options[st.correct])}</b></p>
          ${r ? `<div class="pcrowd-res ${r.ok ? 'ok' : 'ko'}">${r.ok ? `¡Correcto! +${r.pts} puntos` : 'Esta vez no'}</div>` : '<p class="muted small" style="text-align:center">No respondiste esta pregunta</p>'}`;
      } else if (st.phase === 'end') {
        body = `<p class="pvote-wait">${esc(st.player)} ${st.outcome === 'won' ? '¡ganó El Gran Desafío!' : 'terminó su partida'}${st.won ? `<br>Se lleva: <b>${esc(st.won)}</b>` : ''}<br>Muy pronto, el ganador de ${TRIVIA_L}.</p>`;
      } else if (st.player && st.phase !== 'setup') {
        body = `<p class="pvote-wait">Concursante: <b>${esc(st.player)}</b>.<br>¡Prepárate! Vas a responder cada pregunta desde aquí.</p>`;
      } else body = '<p class="pvote-wait">¡Prepárate! Muy pronto comienza El Gran Desafío.</p>';
      // Ranking desplegado (top 10) o, si no, los 5 primeros; y el puesto de esta persona
      const me = st.me;
      const meRow = (n) => (me && me.score > 0 && me.rank > n ? `<div class="you"><em>${me.rank}.º</em><span>Tú</span><b>${me.score}</b></div>` : '');
      const list = st.rank
        ? `<div class="pcrowd-rank"><small>🏅 ${TRIVIA} · Top 10</small><b>${cw || st.phase === 'end' ? 'Resultados finales' : 'Resultados parciales'}</b>${st.rank.length ? st.rank.map((x, i) => `<div class="${me && me.rank === i + 1 ? 'me' : ''}"><em>${i + 1}.º</em><span>${esc(x.name)}</span><b>${x.score}</b></div>`).join('') : '<p class="muted">Todavía nadie suma puntos</p>'}${meRow(10)}</div>`
        : st.top && st.top.length ? `<div class="pcrowd-top"><small>Top 5 · ${TRIVIA}</small>${st.top.map((x, i) => `<div class="${me && me.rank === i + 1 ? 'me' : ''}"><em>${i + 1}</em><span>${esc(x.name)}</span><b>${x.score}</b></div>`).join('')}${meRow(5)}</div>` : '';
      const score = me ? `<p class="pcrowd-score">Tus puntos: <b>${me.score}</b> · ${many(me.hits, 'acierto', 'aciertos')}${me.score > 0 ? ` · ${me.rank}.º lugar` : ''}</p>` : '';
      box.innerHTML = head + body + score + list;
      box.onclick = async (e) => {
        const b = e.target.closest('[data-c]');
        if (!b || b.disabled) return;
        sending = Number(b.dataset.c);
        box.querySelectorAll('[data-c]').forEach((x) => { x.classList.toggle('on', x === b); x.disabled = true; }); // respuesta inmediata al tocar
        try { await api('POST', '/api/desafio/answer', { sid, token, qid: st.crowd ? st.crowd.qid : null, choice: sending }); } catch (err) { if (!/Ya respondiste/.test(err.message)) fail(err); }
        sending = null;
        shown = '';
        window.phoneDesafio.draw(sid, token);
      };
    },
  };

  // ---------- Pantallas ----------
  // Lee el estado cada segundo y vuelve a dibujar solo si cambió algo que se ve
  const follow = (paint) => {
    let last = '';
    let alive = true;
    const tick = async () => {
      const st = await api('GET', '/api/desafio').catch(() => null);
      if (!alive || !st) return;
      syncClocks(st);
      const { now, ...rest } = st;
      const s = JSON.stringify([rest, st.phoneUntil > now]); // al terminar la llamada se retira su reloj
      if (s === last) return;
      const prev = last ? JSON.parse(last)[0] : null;
      last = s;
      stamp(st);
      paint(st, prev);
      // la tómbola del ganador de la Trivia: al detenerse, se dibuja el ganador
      const left = rollLeft(st);
      if (left > 200) setTimeout(() => { if (alive && last === s) paint(st, st); }, left + 50);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(timer); };
  };
  const confetti = () => {
    const colors = ['#ffc400', '#0a9a94', '#ff7a1a', '#2338a8', '#56b04c', '#e8262e', '#ffffff'];
    return Array.from({ length: 70 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s"></i>`).join('');
  };
  // Escalera: del 10 (arriba) al 1, con el escalón en juego, los ya superados y los seguros
  const ladder = (st) => `<ol class="d-ladder">${Array.from({ length: st.steps }, (_, k) => st.steps - k).map((i) => {
    const cls = [i === st.step && st.phase !== 'end' ? 'cur' : '', i < st.step || (st.outcome === 'won') ? 'done' : '', st.safe.includes(i) || i === st.steps ? 'safe' : ''].join(' ');
    return `<li class="${cls}"><em>${i}</em><b>${esc(prizeOf(st, i))}</b></li>`;
  }).join('')}</ol>`;
  const lifeIcons = (st) => `<div class="d-life">${LIFELINES.map(([k, name, icon]) => `<span class="${st.used[k] ? 'used' : ''}" title="${name}">${icon}<small>${k === 'fifty' ? '50:50' : name}</small></span>`).join('')}</div>`;
  const optionsHTML = (st) => `<div class="d-opts">${st.q.options.map((o, i) => {
    const cls = [st.hidden.includes(i) ? 'gone' : '', st.chosen === i ? 'chosen' : '', st.correct === i ? 'right' : '', st.correct != null && st.chosen === i && st.correct !== i ? 'wrong' : ''].join(' ');
    return `<div class="${cls}"><b>${L[i]}</b><span ${n(o)}>${st.hidden.includes(i) ? '' : esc(o)}</span></div>`;
  }).join('')}</div>`;
  const se = (x) => (window.sinEmoji ? window.sinEmoji(x) : x); // diseño nuevo: las etiquetas de pantalla van sin emojis
  const audienceHTML = (st) => {
    const a = st.audience;
    if (!a) return '';
    if (a.open) return `<div class="d-aud open"><b>${se('📱 Pregunta al público')}</b><span>Vota desde tu celular · quedan <i data-clock="aud">${secs('aud')}</i> s</span><small>${many(a.total, 'respuesta', 'respuestas')}</small></div>`;
    return `<div class="d-aud"><b>${se('📱 El público dice')}</b><div class="d-bars">${L.map((l, i) => `<p class="${st.hidden.includes(i) ? 'gone' : ''}"><i style="--p:${a.pct[i]}%"></i><em>${a.pct[i]}%</em><b>${l}</b></p>`).join('')}</div></div>`;
  };
  // Trivia: aviso mientras el público puede responder, ranking desplegado, tómbola y ganador
  const crowdChip = (st) => (st.crowd && st.crowd.open && !(st.audience && st.audience.open)
    ? `<div class="d-aud d-chip"><b>${se('📱 Juega desde tu celular')}</b><span>Más rápido, más puntos</span><small>${many(st.crowd.answered, 'respuesta', 'respuestas')}</small></div>` : '');
  const rankList = (st) => `<div class="d-rank"><small>${TRIVIA} · Top 10</small><b>${se(`🏅 ${st.crowdWinner || st.phase === 'end' ? 'Resultados finales' : 'Resultados parciales'}`)}</b>
    ${st.rank.length ? `<ol>${st.rank.map((x) => `<li><span>${esc(x.name)}</span><em>${x.score} pts</em></li>`).join('')}</ol>` : '<p>Todavía nadie suma puntos</p>'}
    <span>${many(st.rankPlayers, 'persona jugando', 'personas jugando')}</span></div>`;
  let rolled = '';
  const winnerHTML = (st, full) => {
    const cw = st.crowdWinner;
    const left = rollLeft(st);
    if (left > 200) {
      const key = `${cw.at}`;
      setTimeout(() => { const el = document.querySelector('.d-cw-name'); if (el) spin(el, cw.roll, left); }, 0);
      if (full && rolled !== key) { rolled = key; sfx.roll(true); setTimeout(() => sfx.roll(false), left); }
      return `<div class="d-cw"><span class="d-cup">🥁</span><small>Y el ganador de ${TRIVIA_L} es…</small><b class="d-cw-name"></b></div>`;
    }
    if (full && rolled !== `${cw.at}|win`) { rolled = `${cw.at}|win`; if (!cw.none) sfx.play('win'); }
    return cw.none ? `<div class="d-cw"><span class="d-cup">🏅</span><small>${TRIVIA}</small><b ${n('Nadie sumó puntos')}>Nadie sumó puntos</b><span>¡En la próxima!</span></div>`
      : `<div class="d-cw">${full ? `<div class="confetti">${confetti()}</div>` : ''}<span class="d-cup">🏅</span><small>Premio especial · Ganó ${TRIVIA_L}</small><b ${n(cw.name)}>${esc(cw.name)}</b><span>${many(cw.score, 'punto', 'puntos')} · ${many(cw.hits, 'acierto', 'aciertos')}</span></div>`;
  };
  // QR para entrar a la sala y jugar la Trivia (la frase de siempre)
  const joinHTML = () => `<div class="d-join">${qr(joinUrl())}<p><b>Escanea el código QR con tu celular</b><span>y juega ${TRIVIA_L}</span></p></div>`;
  const phoneHTML = () => (left('phone') > 0 ? `<div class="d-aud open"><b>${se('📞 Llamada')}</b><span>Quedan <i data-clock="phone">${secs('phone')}</i> s</span></div>` : '');
  const endHTML = (st) => {
    const won = st.outcome === 'won';
    const head = { won: '¡Ganó El Gran Desafío!', retired: 'Se retira', lost: 'Fin del juego' }[st.outcome];
    return `<div class="d-end ${st.outcome}">${won ? `<div class="confetti">${confetti()}</div>` : ''}<span class="d-cup">${won ? '🏆' : st.outcome === 'retired' ? '🏳' : '👏'}</span>
      <small>${head}</small><b ${n(st.player)}>${esc(st.player)}</b><span>Se lleva: <b>${esc(st.won || 'el aplauso del público')}</b></span></div>`;
  };
  // Sonidos del tablero: suspenso al marcar, acierto, error, victoria y el tic-tac de los relojes
  const cues = (st, prev) => {
    if (!prev) return;
    if (st.phase === 'locked' && prev.phase !== 'locked') sfx.play('pass');
    if (st.phase === 'reveal' && prev.phase !== 'reveal') sfx.play(st.right ? 'hit' : 'miss');
    if (st.phase === 'end' && prev.phase !== 'end' && st.outcome === 'won') sfx.play('win');
    if (st.phase === 'question' && prev.step !== st.step) sfx.play('chime');
  };
  let tickTimer = null;
  const ticking = () => {
    clearInterval(tickTimer);
    let flip = false;
    let was = false;
    tickTimer = setInterval(() => {
      const on = left('aud') > 0 || left('phone') > 0;
      if (on) { sfx.play(flip ? 'softTock' : 'softTick'); flip = !flip; } else if (was) sfx.play('chime');
      was = on;
    }, 1000);
    return () => clearInterval(tickTimer);
  };

  // Tablero del local: pregunta y alternativas a la izquierda, escalera a la derecha
  views.desafioFull = async () => {
    app.innerHTML = '<div id="df"></div>';
    const stopTick = ticking();
    const stop = follow((st, prev) => {
      const box = $('#df');
      if (!box) return;
      cues(st, prev);
      box.className = `th-${st.venue} ph-${st.phase}`;
      let main;
      if (st.phase === 'setup') main = `<section class="d-cover"><span class="d-cup">🏆</span><b>${esc(st.title)}</b><span>¡Muy pronto!</span></section>`;
      else if (st.phase === 'intro') main = `<section class="d-cover"><small>Concursante</small><b ${n(st.player)}>${esc(st.player)}</b><span>${st.steps} preguntas · 4 comodines · ¡a subir la escalera!</span></section>`;
      else if (st.rank) main = `<section class="d-cover d-wide">${rankList(st)}</section>`; // a todo el ancho, para que quepan los nombres
      else if (st.phase === 'end' && st.crowdWinner) main = `<section class="d-cover">${winnerHTML(st, true)}</section>`;
      else if (st.phase === 'end') main = `<section class="d-cover">${endHTML(st)}</section>`;
      else {
        main = `<section class="d-play">
          <div class="d-q"><small>Pregunta ${st.step} · por ${esc(prizeOf(st, st.step))}</small><b ${n(st.q.text)}>${esc(st.q.text)}</b></div>
          ${optionsHTML(st)}
          <div class="d-foot">${audienceHTML(st)}${phoneHTML()}${crowdChip(st)}</div></section>`;
      }
      box.innerHTML = `<header class="d-top"><b><i class="d-ico">🏆</i> ${esc(st.title)}</b>${st.player ? `<span>${esc(st.player)}</span>` : ''}</header>
        ${main}
        ${st.rank && st.phase !== 'setup' && st.phase !== 'intro' ? '' : `<aside class="d-side">${st.phase === 'setup' ? joinHTML() : `${lifeIcons(st)}${ladder(st)}${joinHTML()}`}</aside>`}`;
    });
    return () => { stop(); stopTick(); };
  };

  // GC de OBS: escalera compacta arriba a la derecha y pregunta con alternativas abajo, sobre fondo transparente
  views.desafioGC = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="dg"></div>';
    const stop = follow((st) => {
      const box = $('#dg');
      if (!box) return;
      box.className = `th-${st.venue} ph-${st.phase}`;
      if (st.phase === 'setup') { box.innerHTML = ''; return; }
      const bottom = st.phase === 'intro' ? `<div class="dg-bar dg-intro"><small>${esc(st.title)} · Concursante</small><b ${n(st.player)}>${esc(st.player)}</b></div>`
        : st.phase === 'end' && st.crowdWinner ? `<div class="dg-bar dg-intro">${winnerHTML(st, false)}</div>`
        : st.phase === 'end' ? `<div class="dg-bar dg-intro"><small>${esc(st.player)} · ${{ won: '¡Ganó!', retired: 'Se retira', lost: 'Fin del juego' }[st.outcome]}</small><b>Se lleva: ${esc(st.won || 'el aplauso del público')}</b></div>`
          : `<div class="dg-bar"><div class="d-q"><small>Pregunta ${st.step} · por ${esc(prizeOf(st, st.step))}</small><b ${n(st.q.text)}>${esc(st.q.text)}</b></div>${optionsHTML(st)}</div>`;
      box.innerHTML = `<aside class="dg-side">${lifeIcons(st)}${ladder(st)}</aside>
        ${st.rank ? `<div class="dg-extra dg-rank">${rankList(st)}</div>` : st.phase === 'question' || st.phase === 'locked' ? `<div class="dg-extra">${audienceHTML(st)}${phoneHTML()}${crowdChip(st)}</div>` : ''}
        ${st.phase === 'end' && st.outcome === 'won' ? `<div class="confetti">${confetti()}</div>` : ''}
        ${bottom}`;
    });
    return () => { stop(); document.body.classList.remove('obs', 'gc-screen'); };
  };
})();
