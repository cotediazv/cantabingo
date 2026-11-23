// «El último en pie» — VERSIÓN DE PRUEBA (pedido de Cote, 23 nov). Todo el salón juega desde el celular: 3 vidas,
// preguntas de 3 alternativas, quien se queda sin vidas pasa a la banca y puede volver en las preguntas de repechaje.
// Aquí: el panel del animador (#/enpiectl), el tablero y la pantalla de pie, el GC de OBS y el celular.
(() => {
  const LET = ['A', 'B', 'C'];
  const HOWTO = [
    'Todos juegan desde su celular, en las mesas.',
    'Cada persona parte con <b>3 vidas</b>. Si fallas o no contestas a tiempo, pierdes una.',
    'Sin vidas pasas <b>a la banca</b>, pero sigues contestando.',
    'Cada 5 preguntas hay <b>repechaje</b>: los de la banca que aciertan vuelven al juego con 1 vida.',
    'En las últimas 3 preguntas <b>se cierra la puerta</b>: ya no vuelve nadie. Gana el último en pie.',
  ];
  const hearts = (n, max = 3) => '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, max - n));
  const kindTag = (st) => (st.kind === 'subita' ? 'Muerte súbita' : st.kind === 'repechaje' ? 'Pregunta de repechaje' : st.door ? `Pregunta ${st.n} de ${st.total} · puerta cerrada` : `Pregunta ${st.n} de ${st.total}`);
  const counters = (st) => `<span class="ep-c up"><b>${st.standing}</b> en pie</span><span class="ep-c"><b>${st.bench}</b> en la banca</span>`;
  // Reloj: cuenta local, sincronizada con la hora del servidor
  let end = 0; let endKey = 0;
  const setClock = (st) => { if (st.until !== endKey) { endKey = st.until; end = st.until ? Date.now() + (st.until - st.now) : 0; } };
  const left = () => Math.max(0, Math.ceil((end - Date.now()) / 1000));
  setInterval(() => { if (!endKey) return; const t = String(left()); for (const el of document.querySelectorAll('.ep-clock')) if (el.textContent !== t) el.textContent = t; }, 200);
  const opts = (st, cls = '') => `<div class="ep-opts ${cls}">${st.q.opts.map((o, i) => `<div class="ep-opt ${st.q.correct === i ? 'ok' : st.q.correct != null ? 'no' : ''}"><em>${LET[i]}</em><span>${esc(o)}</span></div>`).join('')}</div>`;
  const rank = (st, n = 8) => (st.top.length ? `<ol class="ep-rank">${st.top.slice(0, n).map((p, i) => `<li class="${p.up ? 'up' : 'out'}"><em>${i + 1}</em><b>${esc(p.name)}</b><span>${p.up ? hearts(p.lives) : 'banca'}</span><i>${p.hits}</i></li>`).join('')}</ol>` : '');
  const lastLine = (st) => { const l = st.last; if (!l) return ''; const a = []; if (l.mercy) a.push('Nadie acertó: nadie cae'); else a.push(l.fell ? `${l.fell === 1 ? 'Cayó 1' : `Cayeron ${l.fell}`} a la banca` : 'Nadie cayó'); if (l.kind === 'repechaje') a.push(l.back ? `${l.back === 1 ? 'Vuelve 1' : `Vuelven ${l.back}`} al juego` : 'No volvió nadie'); return a.join(' · '); };
  const follow = (paint, url = '/api/enpie') => {
    let last = ''; let alive = true;
    const tick = async () => { const st = await api('GET', url).catch(() => null); if (!alive || !st) return; setClock(st); const k = `${st.rev}:${st.phase}`; if (k === last) return; last = k; paint(st); };
    tick(); const t = setInterval(tick, 1500); const off = window.onAviso ? window.onAviso(tick) : () => {};
    return () => { alive = false; clearInterval(t); off(); };
  };

  // ---------- Panel del animador ----------
  views.enpiectl = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = `<p class="back"><a href="#/juegos">← Juegos</a></p><div class="panel"><h1>🧍 El último en pie <small class="ep-test">versión de prueba</small></h1><div id="ep-ctl"></div></div><div id="ep-nav"></div>
      <details class="more"><summary>Más opciones</summary><button type="button" data-ep="new">Empezar un juego nuevo (borra este)</button></details>`;
    const box = $('#ep-ctl'); let shown = '';
    const paint = (st) => {
      let step; let body = '';
      const nextLabel = st.nextKind === 'subita' ? '⚡ Muerte súbita: siguiente pregunta' : st.nextKind === 'repechaje' ? `🔁 Pregunta de repechaje (${st.n + 1} de ${st.total})` : st.doorNext ? `🚪 Se cierra la puerta · pregunta ${st.n + 1} de ${st.total}` : `▶ Siguiente pregunta (${st.n + 1} de ${st.total})`;
      if (st.phase === 'done') {
        step = '';
        body = window.annHtml('El último en pie', st.winner ? [st.winner.name] : ['Nadie quedó en pie'], [st.winner ? `Premio mayor · ${st.winner.hits} aciertos` : '', st.benchWinner ? `El mejor de la banca: ${st.benchWinner.name} (${st.benchWinner.hits} aciertos)` : ''].filter(Boolean));
      } else if (st.phase === 'question') {
        step = `<button class="primary big paso" disabled>⏱ Pregunta en curso · <span class="ep-clock">${left()}</span> s</button>`;
        body = `<div class="ep-now"><small>${esc(kindTag(st))} · ${st.answered} respuestas</small><b>${esc(st.q.text)}</b>${opts(st)}</div><button type="button" data-ep="close">Cerrar la pregunta ahora</button>`;
      } else if (st.phase === 'reveal') {
        step = `<button class="primary big paso" data-ep="next">${nextLabel}</button>`;
        body = `<div class="ep-now"><small>${esc(kindTag(st))} · ${esc(lastLine(st))}</small><b>${esc(st.q.text)}</b>${opts(st)}</div>`;
      } else {
        step = '<button class="primary big paso" data-ep="next">▶ Primera pregunta</button>';
        body = window.readAloud('El último en pie', HOWTO);
      }
      const html = `${step}${body}<p class="ep-counts">${counters(st)}</p>${st.phase !== 'lobby' ? `<h2>Ranking</h2>${rank(st, 10) || '<p class="muted">Todavía no contesta nadie.</p>'}` : ''}`;
      if (html !== shown) { shown = html; box.innerHTML = html; }
      // Con el juego terminado vuelve el menú de juegos
      const nav = $('#ep-nav'); const want = st.phase === 'done' ? '1' : '';
      if (nav && nav.dataset.on !== want) { nav.dataset.on = want; nav.innerHTML = want && typeof activitiesNav === 'function' ? activitiesNav('enpie') : ''; }
    };
    const stop = follow(paint, '/api/enpie/host');
    const first = await api('GET', '/api/enpie/host').catch(() => null);
    // Al entrar: si no hay un juego a medias, parte uno nuevo y la pantalla pasa al juego
    if (first && (first.phase === 'done' || first.phase === 'lobby')) { const st = await api('POST', '/api/enpie/host', { action: 'new' }).catch(fail); if (st) { setClock(st); paint(st); } }
    document.body.addEventListener('click', views.enpiectl.onClick = async (e) => {
      const b = e.target.closest('[data-ep]');
      if (!b || !$('#ep-ctl')) return;
      if (b.dataset.ep === 'new' && !confirm('¿Empezar un juego nuevo? Se borra el que está en curso.')) return;
      b.disabled = true;
      try { const st = await api('POST', '/api/enpie/host', { action: b.dataset.ep }); setClock(st); shown = ''; paint(st); } catch (err) { fail(err); b.disabled = false; }
    });
    return () => { stop(); document.body.removeEventListener('click', views.enpiectl.onClick); };
  };

  // ---------- Tablero del local y pantalla de pie ----------
  const scene = (st) => {
    if (st.phase === 'done') {
      return `<div class="ep-win"><small>${st.winner ? 'El último en pie' : 'Fin del juego'}</small><b>${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}</b>${st.winner ? `<span>${st.winner.hits} aciertos · ¡Felicitaciones!</span>` : ''}${st.benchWinner ? `<i>El mejor de la banca: ${esc(st.benchWinner.name)} · ${st.benchWinner.hits} aciertos</i>` : ''}</div>`;
    }
    if (st.phase === 'lobby') {
      return `<div class="ep-intro"><small>Todos juegan desde su celular</small><b>Tienes 3 vidas</b><ul><li>Si fallas, pierdes una vida</li><li>Sin vidas vas a la banca, pero sigues jugando</li><li>En el repechaje puedes volver al juego</li><li>Gana el último en pie</li></ul></div>`;
    }
    const q = `<div class="ep-q"><small class="ep-tag ${st.kind}">${esc(kindTag(st))}</small><b>${esc(st.q.text)}</b>${opts(st)}</div>`;
    return st.phase === 'question' ? `${q}<div class="ep-side"><small>Contesta en tu celular</small><b class="ep-clock">${left()}</b></div>` : `${q}<div class="ep-side rank"><small>${esc(lastLine(st))}</small>${rank(st, 8)}</div>`;
  };
  views.enpieFull = async () => {
    app.innerHTML = '<div id="ep"></div>';
    const stop = follow((st) => {
      const box = $('#ep'); if (!box) return;
      if (st.phase === 'done' && st.winner && box.dataset.won !== String(st.gen)) { box.dataset.won = String(st.gen); sfx.play('win'); }
      if (st.phase === 'reveal' && box.dataset.rev !== String(st.rev)) sfx.play('chime');
      box.dataset.rev = String(st.rev);
      box.className = `th-${st.venue} ph-${st.phase}`;
      box.innerHTML = `<header class="ep-top"><b>El último en pie</b><p>${counters(st)}</p></header><main class="ep-main">${scene(st)}</main>`;
    });
    return stop;
  };

  // ---------- GC de OBS: franja de abajo ----------
  views.enpieGC = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="epg"></div>';
    const stop = follow((st) => {
      const box = $('#epg'); if (!box) return;
      let main; let side;
      if (st.phase === 'done') { main = `<b>${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}</b>${st.benchWinner ? `<span>El mejor de la banca: ${esc(st.benchWinner.name)}</span>` : ''}`; side = st.winner ? `<small>Ganó</small><b>${st.winner.hits}</b>` : ''; } else if (st.phase === 'lobby') { main = '<b>Todos juegan desde su celular</b><span>3 vidas · sin vidas vas a la banca · en el repechaje puedes volver</span>'; side = '<small>Prepárate</small>'; } else {
        main = `<b>${esc(st.q.text)}</b><span class="epg-opts">${st.q.opts.map((o, i) => `<i class="${st.q.correct === i ? 'ok' : st.q.correct != null ? 'no' : ''}"><em>${LET[i]}</em>${esc(o)}</i>`).join('')}</span>`;
        side = st.phase === 'question' ? `<small>Tiempo</small><b class="ep-clock">${left()}</b>` : `<small>En pie</small><b>${st.standing}</b>`;
      }
      const tag = st.phase === 'done' ? 'El último en pie' : st.phase === 'lobby' ? 'Nuevo juego' : kindTag(st);
      box.className = `th-${st.venue} on`;
      box.innerHTML = `<div class="epg-bar"><div class="epg-tag"><small>El último en pie</small><b>${esc(tag)}</b></div><div class="epg-main">${main}</div><div class="epg-side">${side}</div></div>`;
    });
    return () => { stop(); document.body.classList.remove('obs', 'gc-screen'); };
  };

  // ---------- Celular ----------
  let pShown = ''; let sending = false;
  window.phoneEnpie = {
    reset() { pShown = ''; },
    async draw(sid, token) {
      const box = $('#penpie');
      const st = await api('GET', `/api/enpie?token=${encodeURIComponent(token)}`).catch(() => null);
      if (!st || !box || box.hidden) return;
      setClock(st);
      const me = st.me;
      const status = me ? `<p class="pep-me ${me.up ? 'up' : 'out'}">${me.up ? `${hearts(me.lives)} <b>En pie</b>` : '🪑 <b>En la banca</b>'}<span>Puesto ${me.pos} de ${me.of} · ${me.hits} aciertos</span></p>` : '';
      let body;
      if (st.phase === 'done') {
        body = `<div class="pvote-win">🏆 ${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}<small>${st.winner ? '¡Es el último en pie!' : 'Fin del juego'}</small></div>${st.benchWinner ? `<p class="pvote-wait">El mejor de la banca: <b>${esc(st.benchWinner.name)}</b></p>` : ''}${rank(st, 10)}`;
      } else if (st.phase === 'lobby') {
        body = `<p class="pvote-ask">¡Prepárate!<b>Tienes 3 vidas</b></p><ul class="pep-how">${HOWTO.slice(1).map((l) => `<li>${l}</li>`).join('')}</ul>`;
      } else if (st.phase === 'question') {
        const pick = me ? me.pick : null;
        const hint = st.kind === 'repechaje' && me && !me.up ? '🔁 ¡Repechaje! Si aciertas, vuelves al juego' : st.kind === 'subita' ? '⚡ Muerte súbita: un error y fuera' : !me && st.n > 2 ? 'Entras por la banca: en el repechaje puedes pasar al juego' : '';
        body = `<p class="pvote-ask">${esc(kindTag(st))}<b>${esc(st.q.text)}</b></p>${hint ? `<p class="pep-hint">${hint}</p>` : ''}
          <div class="pep-keys">${st.q.opts.map((o, i) => `<button type="button" data-pick="${i}" class="${pick === i ? 'on' : ''}" ${pick != null ? 'disabled' : ''}><em>${LET[i]}</em>${esc(o)}</button>`).join('')}</div>
          <p class="pvote-clock">${pick != null ? '✔ Respuesta enviada · ' : ''}Quedan <b class="ep-clock">${left()}</b> s</p>`;
      } else {
        const res = !me ? '' : me.back ? '<div class="pvote-win">🎉 ¡Volviste al juego!<small>Tienes 1 vida</small></div>' : me.fell ? '<div class="pep-res no">💔 Te quedaste sin vidas<small>Pasas a la banca: sigue contestando, en el repechaje puedes volver</small></div>' : me.lastOk ? '<div class="pep-res ok">✔ ¡Correcto!</div>' : `<div class="pep-res no">✘ Incorrecto${me.up && !st.last.mercy ? '<small>Pierdes una vida</small>' : ''}</div>`;
        body = `${res}<p class="pvote-wait">La respuesta era <b>${LET[st.q.correct]} · ${esc(st.q.opts[st.q.correct])}</b></p><p class="pep-last">${esc(lastLine(st))}</p><h3 class="pep-h">Ranking</h3>${rank(st, 10)}`;
      }
      const html = `<div class="pvote-head"><b>🧍 El último en pie</b></div><p class="pep-counts">${counters(st)}</p>${status}${body}`;
      if (html !== pShown) { pShown = html; box.innerHTML = html; }
      box.onclick = async (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b || sending) return;
        sending = true; box.querySelectorAll('[data-pick]').forEach((x) => { x.disabled = true; }); b.classList.add('on');
        try { await api('POST', '/api/enpie/answer', { sid, token, pick: Number(b.dataset.pick) }); } catch (err) { fail(err); }
        sending = false; pShown = ''; window.phoneEnpie.draw(sid, token);
      };
    },
  };
})();
