// «El último en pie» — VERSIÓN DE PRUEBA (pedido de Cote, 23 nov). Todo el salón juega desde el celular: 5 rondas de 5
// preguntas con 3 vidas, banca y repechaje (4 buenas de 5), un corte al final de cada ronda; después, eliminación
// directa hasta que queden 3, y la final en el escenario con preguntas habladas (ver enpie.js).
// Aquí: el panel del animador (#/enpiectl), el tablero y la pantalla de pie, el GC de OBS y el celular.
(() => {
  const LET = ['A', 'B', 'C'];
  const HOWTO = [
    'Todos juegan desde su celular, en las mesas.',
    'Cada persona parte con <b>3 vidas</b>. Si fallas o no contestas a tiempo, pierdes una.',
    'Sin vidas pasas <b>a la banca</b>, pero sigues contestando: con <b>4 buenas de 5</b> vuelves al juego.',
    'Son <b>5 rondas de 5 preguntas</b>. Al final de cada ronda vemos cuántos quedan en pie.',
    'Desde la 6.ª ronda <b>no vuelve nadie</b>: un error y fuera, hasta que queden 3.',
    'Los 3 pasan a <b>la final en el escenario</b>: el que se equivoca queda eliminado. Gana el último en pie.',
  ];
  const hearts = (n, max = 3) => '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, max - n));
  const qTag = (st) => (st.direct ? `Eliminación directa · pregunta ${st.n}` : `Ronda ${st.round} de ${st.rounds} · pregunta ${st.inRound} de ${st.perRound}`);
  const counters = (st) => `<span class="ep-c up"><b>${st.standing}</b> en pie</span><span class="ep-c"><b>${st.bench}</b> ${st.direct || st.phase === 'final' || st.phase === 'done' ? 'fuera' : 'en la banca'}</span>`;
  // Reloj: cuenta local, sincronizada con la hora del servidor
  let end = 0; let endKey = 0;
  const setClock = (st) => { if (st.until !== endKey) { endKey = st.until; end = st.until ? Date.now() + (st.until - st.now) : 0; } };
  const left = () => Math.max(0, Math.ceil((end - Date.now()) / 1000));
  setInterval(() => { if (!endKey) return; const t = String(left()); for (const el of document.querySelectorAll('.ep-clock')) if (el.textContent !== t) el.textContent = t; }, 200);
  const opts = (st, cls = '') => `<div class="ep-opts ${cls}">${st.q.opts.map((o, i) => `<div class="ep-opt ${st.q.correct === i ? 'ok' : st.q.correct != null ? 'no' : ''}"><em>${LET[i]}</em><span>${esc(o)}</span></div>`).join('')}</div>`;
  const rank = (st, n = 8) => (st.top.length ? `<ol class="ep-rank">${st.top.slice(0, n).map((p, i) => `<li class="${p.up ? 'up' : 'out'}"><em>${i + 1}</em><b>${esc(p.name)}</b><span>${p.up ? (st.direct ? 'en pie' : hearts(p.lives)) : st.direct ? 'fuera' : 'banca'}</span><i>${p.hits}</i></li>`).join('')}</ol>` : '');
  const lastLine = (st) => {
    const l = st.last; if (!l) return '';
    const a = [];
    if (l.mercy) a.push('Nadie acertó: nadie cae'); else a.push(l.fell ? (l.direct ? `${l.fell === 1 ? 'Queda 1 fuera' : `Quedan ${l.fell} fuera`}` : `${l.fell === 1 ? 'Cayó 1' : `Cayeron ${l.fell}`} a la banca`) : 'Nadie cayó');
    if (l.back) a.push(`${l.back === 1 ? 'Vuelve 1' : `Vuelven ${l.back}`} al juego`);
    if (l.toFinal) a.push('¡Tenemos finalistas!');
    return a.join(' · ');
  };
  // El corte de la ronda: en pie y en la banca; desde el segundo, también cuántos pasaron a la banca y cuántos salieron
  const cutHTML = (st) => {
    const c = st.cut;
    const box = (n, t, cls = '') => `<div class="ep-n ${cls}"><b>${n}</b><span>${t}</span></div>`;
    return `<div class="ep-cut"><small>Fin de la ronda ${c.round}${c.last ? ' · se cierra la puerta' : ''}</small><div class="ep-ns">${box(c.standing, 'en pie', 'up')}${box(c.bench, 'en la banca')}${c.round > 1 ? box(c.fell, 'pasaron a la banca', 'sm') + box(c.back, 'salieron de la banca', 'sm') : ''}</div>${c.last ? '<i>Desde ahora no vuelve nadie: un error y fuera, hasta que queden 3</i>' : ''}</div>`;
  };
  const finHTML = (st) => `<div class="ep-fin"><small>La final · en el escenario</small><div class="ep-fs">${st.fin.players.map((p, i) => `<div class="ep-f ${p.out ? 'out' : ''} ${!p.out && st.phase === 'final' && st.fin.turn === i ? 'turn' : ''}"><b>${esc(p.name)}</b><span>${p.out ? 'Eliminado' : st.phase === 'final' && st.fin.turn === i ? 'Su turno' : 'En pie'}</span></div>`).join('')}</div></div>`;
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
      let step = ''; let body = '';
      if (st.phase === 'done') {
        body = window.annHtml('El último en pie', st.winner ? [st.winner.name] : ['Nadie quedó en pie'], st.winner ? ['Premio mayor'] : []);
      } else if (st.phase === 'final') {
        // La final: como en El Rosko, aquí son dos botones (no hay un solo paso): el animador hace la pregunta en voz alta
        const p = st.fin.players[st.fin.turn];
        body = `<div class="ep-turn"><small>La final · es el turno de</small><b>${esc(p.name)}</b></div>
          <div class="ep-now"><small>Pregunta ${st.fin.asked} · léela en voz alta</small><b>${esc(st.fin.q.text)}</b><p class="ep-ans">Respuesta: <b>${esc(st.fin.q.answer)}</b></p></div>
          <div class="ep-yn"><button type="button" class="ep-yes" data-ep="right">✔ Correcta</button><button type="button" class="ep-no" data-ep="wrong">✘ Incorrecta · queda eliminado</button></div>
          <div class="ep-flist">${st.fin.players.map((x, i) => `<p class="${x.out ? 'out' : ''}"><b>${esc(x.name)}</b><span>${x.out ? 'Eliminado' : i === st.fin.turn ? 'Su turno' : 'En pie'}</span></p>`).join('')}</div>`;
      } else if (st.phase === 'question') {
        step = `<button class="primary big paso" disabled>⏱ Pregunta en curso · <span class="ep-clock">${left()}</span> s</button>`;
        body = `<div class="ep-now"><small>${esc(qTag(st))} · ${st.answered} respuestas</small><b>${esc(st.q.text)}</b>${opts(st)}</div><button type="button" data-ep="close">Cerrar la pregunta ahora</button>`;
      } else if (st.phase === 'cut') {
        const c = st.cut;
        step = `<button class="primary big paso" data-ep="next">${c.last ? (st.standing <= st.finalists ? '🏁 Pasar a la final' : '⚡ Eliminación directa: siguiente pregunta') : `▶ Ronda ${c.round + 1}: siguiente pregunta`}</button>`;
        body = window.annHtml(`Fin de la ronda ${c.round}`, [`${c.standing} en pie · ${c.bench} en la banca`], [c.round > 1 ? `En esta ronda: ${c.fell} pasaron a la banca y ${c.back} salieron de la banca` : '', c.last ? 'Se cierra la puerta: desde ahora no vuelve nadie. Un error y fuera, hasta que queden 3.' : ''].filter(Boolean));
      } else if (st.phase === 'reveal') {
        const label = st.last && st.last.toFinal ? '🏁 Pasar a la final en el escenario' : st.cutDue ? `📊 Mostrar el corte de la ronda ${st.round}` : st.nextDirect ? '⚡ Siguiente pregunta (eliminación directa)' : `▶ Siguiente pregunta (ronda ${st.round} · ${st.inRound + 1} de ${st.perRound})`;
        step = `<button class="primary big paso" data-ep="next">${label}</button>`;
        body = `<div class="ep-now"><small>${esc(qTag(st))} · ${esc(lastLine(st))}</small><b>${esc(st.q.text)}</b>${opts(st)}</div>`;
      } else {
        step = '<button class="primary big paso" data-ep="next">▶ Primera pregunta</button>';
        body = window.readAloud('El último en pie', HOWTO);
      }
      const html = `${step}${body}<p class="ep-counts">${counters(st)}</p>${st.phase !== 'lobby' && st.phase !== 'final' ? `<h2>Ranking</h2>${rank(st, 10) || '<p class="muted">Todavía no contesta nadie.</p>'}` : ''}`;
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
    if (st.phase === 'done') return `<div class="ep-win"><small>${st.winner ? 'El último en pie' : 'Fin del juego'}</small><b>${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}</b>${st.winner ? '<span>¡Felicitaciones!</span>' : ''}</div>`;
    if (st.phase === 'final') return finHTML(st);
    if (st.phase === 'cut') return cutHTML(st);
    if (st.phase === 'lobby') return '<div class="ep-intro"><small>Todos juegan desde su celular</small><b>Tienes 3 vidas</b><ul><li>Si fallas, pierdes una vida</li><li>Sin vidas vas a la banca, pero sigues jugando</li><li>Con 4 buenas de 5 vuelves al juego</li><li>Los 3 últimos van a la final en el escenario</li></ul></div>';
    const q = `<div class="ep-q"><small class="ep-tag ${st.direct ? 'subita' : ''}">${esc(qTag(st))}</small><b>${esc(st.q.text)}</b>${opts(st)}</div>`;
    return st.phase === 'question' ? `${q}<div class="ep-side"><small>Contesta en tu celular</small><b class="ep-clock">${left()}</b></div>` : `${q}<div class="ep-side rank"><small>${esc(lastLine(st))}</small>${rank(st, 8)}</div>`;
  };
  views.enpieFull = async () => {
    app.innerHTML = '<div id="ep"></div>';
    const stop = follow((st) => {
      const box = $('#ep'); if (!box) return;
      if (st.phase === 'done' && st.winner && box.dataset.won !== String(st.gen)) { box.dataset.won = String(st.gen); sfx.play('win'); } else if ((st.phase === 'reveal' || st.phase === 'cut') && box.dataset.rev !== String(st.rev)) sfx.play('chime');
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
      let main; let side; let tag;
      if (st.phase === 'done') { tag = 'Ganó'; main = `<b>${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}</b><span>¡El último en pie!</span>`; side = ''; } else if (st.phase === 'final') {
        tag = 'La final'; main = `<span class="epg-opts">${st.fin.players.map((p, i) => `<i class="${p.out ? 'no' : i === st.fin.turn ? 'ok' : ''}">${esc(p.name)}</i>`).join('')}</span><span>El que se equivoca queda eliminado</span>`; side = `<small>En pie</small><b>${st.fin.players.filter((p) => !p.out).length}</b>`;
      } else if (st.phase === 'cut') {
        const c = st.cut; tag = `Fin de la ronda ${c.round}`; main = `<b>${c.standing} en pie · ${c.bench} en la banca</b>${c.round > 1 ? `<span>${c.fell} pasaron a la banca · ${c.back} salieron de la banca</span>` : ''}`; side = `<small>En pie</small><b>${c.standing}</b>`;
      } else if (st.phase === 'lobby') { tag = 'Nuevo juego'; main = '<b>Todos juegan desde su celular</b><span>3 vidas · sin vidas vas a la banca · con 4 buenas de 5 vuelves</span>'; side = '<small>Prepárate</small>'; } else {
        tag = qTag(st);
        main = `<b>${esc(st.q.text)}</b><span class="epg-opts">${st.q.opts.map((o, i) => `<i class="${st.q.correct === i ? 'ok' : st.q.correct != null ? 'no' : ''}"><em>${LET[i]}</em>${esc(o)}</i>`).join('')}</span>`;
        side = st.phase === 'question' ? `<small>Tiempo</small><b class="ep-clock">${left()}</b>` : `<small>En pie</small><b>${st.standing}</b>`;
      }
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
      const over = st.phase === 'final' || st.phase === 'done';
      const closed = st.direct || over || (st.phase === 'cut' && st.cut.last);
      const way = !me || me.up ? '' : closed ? '<i>Quedaste fuera: ya no hay repechaje</i>' : `<i>Para volver: ${st.backNeed} buenas de ${st.backOf} · llevas <b>${me.h}</b> de ${st.backNeed}${me.w - me.h ? ' · ya no puedes fallar' : ' · puedes fallar 1'}</i>`;
      const status = !me ? '' : me.finalist ? '<p class="pep-me up">🏁 <b>¡Eres finalista!</b><span>Acércate a nuestro escenario</span></p>'
        : `<p class="pep-me ${me.up ? 'up' : 'out'}">${me.up ? `${st.direct ? '⚡' : hearts(me.lives)} <b>En pie</b>` : closed ? '👋 <b>Fuera del juego</b>' : '🪑 <b>En la banca</b>'}<span>Puesto ${me.pos} de ${me.of} · ${me.hits} aciertos</span>${way}</p>`;
      let body;
      if (st.phase === 'done') {
        body = `<div class="pvote-win">🏆 ${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}<small>${st.winner ? '¡Es el último en pie!' : 'Fin del juego'}</small></div>`;
      } else if (st.phase === 'final') {
        body = `<p class="pvote-ask">La final<b>Mira el escenario</b></p><div class="pep-fin">${st.fin.players.map((p, i) => `<p class="${p.out ? 'out' : ''}"><b>${esc(p.name)}</b><span>${p.out ? 'Eliminado' : i === st.fin.turn ? 'Su turno' : 'En pie'}</span></p>`).join('')}</div><p class="pvote-wait">El que se equivoca queda eliminado.</p>`;
      } else if (st.phase === 'cut') {
        const c = st.cut;
        body = `<p class="pvote-ask">Fin de la ronda ${c.round}<b>${c.standing} en pie · ${c.bench} en la banca</b></p>${c.round > 1 ? `<p class="pep-last">${c.fell} pasaron a la banca · ${c.back} salieron de la banca</p>` : ''}${c.last ? '<p class="pep-hint">Se cierra la puerta: desde ahora, un error y fuera</p>' : ''}<h3 class="pep-h">Ranking</h3>${rank(st, 10)}`;
      } else if (st.phase === 'lobby') {
        body = `<p class="pvote-ask">¡Prepárate!<b>Tienes 3 vidas</b></p><ul class="pep-how">${HOWTO.slice(1).map((l) => `<li>${l}</li>`).join('')}</ul>`;
      } else if (st.phase === 'question') {
        const pick = me ? me.pick : null;
        const can = st.direct ? !!(me && me.up) : true; // en la eliminación directa solo contestan los que siguen en pie
        const hint = st.direct ? (can ? '⚡ Un error y quedas fuera' : '') : me && !me.up && me.h === st.backNeed - 1 ? '🔁 ¡Si aciertas esta, vuelves al juego!' : !me && st.n > 2 ? `Entras por la banca: con ${st.backNeed} buenas de ${st.backOf} pasas al juego` : '';
        body = `<p class="pvote-ask">${esc(qTag(st))}<b>${esc(st.q.text)}</b></p>${hint ? `<p class="pep-hint">${hint}</p>` : ''}
          ${can ? `<div class="pep-keys">${st.q.opts.map((o, i) => `<button type="button" data-pick="${i}" class="${pick === i ? 'on' : ''}" ${pick != null ? 'disabled' : ''}><em>${LET[i]}</em>${esc(o)}</button>`).join('')}</div>` : '<p class="pvote-wait">Mira la pantalla: quedan pocos en pie.</p>'}
          <p class="pvote-clock">${pick != null ? '✔ Respuesta enviada · ' : ''}Quedan <b class="ep-clock">${left()}</b> s</p>`;
      } else {
        const played = me && me.lastOk != null && (!st.direct || me.up || me.fell);
        const res = !played ? '' : me.back ? '<div class="pvote-win">🎉 ¡Volviste al juego!<small>Tienes 1 vida</small></div>' : me.fell ? `<div class="pep-res no">${st.direct ? '💔 Quedaste fuera' : '💔 Te quedaste sin vidas<small>Pasas a la banca: sigue contestando, con 4 buenas de 5 vuelves</small>'}</div>` : me.lastOk ? '<div class="pep-res ok">✔ ¡Correcto!</div>' : `<div class="pep-res no">✘ Incorrecto${me.up && !st.last.mercy ? '<small>Pierdes una vida</small>' : ''}</div>`;
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
