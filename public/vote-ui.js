/* global views, app, $, esc, api, qr, joinUrl, isAdmin, viewLogin, fail, sfx */
// Votación del público: panel del animador, teclera del celular, GC de OBS y tablero del DJ.
(() => {
  const n = (t) => `style="--n:${Math.max(6, String(t).length)}"`;
  const note = (x) => Number(x).toFixed(1).replace('.', ',');
  const ord = (p) => `${p}.º lugar`;
  const title = (st) => st.title || 'Votación';
  const versus = (st) => st.final.players.map((p) => esc(p.name)).join(' <em>vs</em> ');
  const CELEBRATE_MS = 6000;

  // ---------- Panel del animador ----------
  views.votoctl = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = `<div class="panel"><h1 style="margin:0">🗳️ Votación</h1>
        <label class="f" style="margin-top:12px">Nombre del concurso<input type="text" id="vc-title" maxlength="50" placeholder="Ej.: El objeto más extraño"></label>
        <div id="vc-body" style="margin-top:14px"></div>
      </div>
      <p style="margin-top:20px"><button class="big" data-back-bingo>← Volver al bingo</button></p>
      <p style="margin-top:14px"><button class="big" id="vc-reset">🗑 Nuevo concurso (borra este)</button></p>`;
    await api('POST', '/api/stage', { show: 'voto' }).catch(fail);
    let st = null;
    let last = '';
    const act = async (action, extra = {}) => { try { st = await api('POST', '/api/vote/host', { action, ...extra }); last = ''; paint(); return true; } catch (err) { fail(err); return false; } };
    const paint = () => {
      const box = $('#vc-body');
      if (!box || !st) return;
      const sig = JSON.stringify([st.phase, st.players, st.open, st.counts, st.places, st.next, st.final, st.tally, st.winner]);
      if (sig === last) return;
      last = sig;
      if (document.activeElement !== $('#vc-title')) $('#vc-title').value = st.title;
      const keep = $('#vc-name') ? $('#vc-name').value : '';
      const focus = document.activeElement === $('#vc-name');
      let html = '';
      if (st.phase === 'voting') {
        const pending = st.players.filter((p) => !p.done).length;
        html = `<h2>Participantes</h2>
          <form id="vc-add" class="row" style="gap:8px"><input type="text" id="vc-name" maxlength="30" placeholder="Nombre del participante" autocomplete="off" style="flex:1;min-width:0"><button class="primary">Agregar</button></form>
          <div class="vc-list">${st.players.map((p) => {
    const on = st.open && st.open.id === p.id;
    return `<div class="vc-row ${on ? 'on' : ''}"><p><b>${esc(p.name)}</b><small>${on ? `Votación abierta · ${st.counts[p.id]} votos` : p.done ? `✔ Votación recibida · ${st.counts[p.id]} votos` : 'Pendiente'}</small></p>
              ${on ? '<button class="primary" data-act="close">Cerrar votación</button>' : `<button data-act="open" data-id="${p.id}">${p.done ? 'Reabrir' : 'Abrir votación'}</button>`}
              ${on ? '' : `<button class="vc-x" data-act="remove" data-id="${p.id}" aria-label="Quitar a ${esc(p.name)}">✕</button>`}</div>`;
  }).join('') || '<p class="muted">Anota a cada participante a medida que le preguntas el nombre.</p>'}</div>
          ${st.players.length >= 2 ? `<button class="primary big" data-act="results" style="margin-top:16px" ${st.open || pending ? 'disabled' : ''}>🏁 Pasar a los resultados</button>
          ${st.open || pending ? `<p class="muted small" style="margin-top:6px">${st.open ? 'Cierra la votación en curso para continuar.' : `Falta votar a ${pending} participante${pending > 1 ? 's' : ''}.`}</p>` : ''}` : ''}`;
      } else if (st.phase === 'results') {
        html = `<h2>Resultados</h2>
          ${st.next ? `<p class="vc-next">Viene: <b>${ord(st.next.place)}</b> · ${esc(st.next.name)} · nota ${note(st.next.score)}<small>Solo lo ves tú, hasta que lo reveles.</small></p>
            <button class="primary big" data-act="reveal">Revelar ${ord(st.next.place)}</button>`
    : `<p class="vc-next">Quedan las dos finalistas: <b>${st.final.players.map((p) => esc(p.name)).join(' y ')}</b></p>
            <button class="primary big" data-act="final">⚔️ Gran final: abrir votación</button>`}
          <div class="vc-list">${[...st.places].reverse().map((p) => `<div class="vc-row"><p><b>${ord(p.place)} · ${esc(p.name)}</b><small>Nota ${note(p.score)}</small></p></div>`).join('')}</div>`;
      } else if (st.phase === 'final') {
        const total = Object.values(st.tally).reduce((a, b) => a + b, 0);
        html = `<h2>Gran final</h2>
          <div class="vc-list">${st.final.players.map((p) => `<div class="vc-row"><p><b>${esc(p.name)}</b><small>${st.final.open ? 'Recibiendo votos' : `${st.tally[p.id]} votos (solo lo ves tú)`}</small></p></div>`).join('')}</div>
          <p class="muted small" style="margin-top:6px">${total} votos en la gran final</p>
          ${st.final.open ? '<button class="primary big" data-act="closefinal" style="margin-top:12px">Cerrar votación</button>'
    : '<button class="primary big" data-act="winner" style="margin-top:12px">🏆 Revelar quién ganó</button><button class="big" data-act="final" style="margin-top:10px">Reabrir votación</button>'}`;
      } else {
        html = `<h2>🏆 Ganó ${esc(st.winner.name)}</h2>
          <div class="vc-list">${st.final.players.map((p) => `<div class="vc-row"><p><b>${esc(p.name)}</b><small>${st.tally[p.id]} votos en la gran final</small></p></div>`).join('')}
          ${[...st.places].reverse().map((p) => `<div class="vc-row"><p><b>${ord(p.place)} · ${esc(p.name)}</b><small>Nota ${note(p.score)}</small></p></div>`).join('')}</div>`;
      }
      box.innerHTML = html;
      if ($('#vc-name')) { $('#vc-name').value = keep; if (focus) $('#vc-name').focus(); }
      if ($('#vc-add')) $('#vc-add').onsubmit = async (e) => { e.preventDefault(); const name = $('#vc-name').value; if (await act('add', { name })) { $('#vc-name').value = ''; $('#vc-name').focus(); } };
    };
    $('#vc-body').onclick = (e) => { const b = e.target.closest('[data-act]'); if (b && !b.disabled) act(b.dataset.act, { id: b.dataset.id }); };
    $('#vc-title').onchange = (e) => act('title', { title: e.target.value });
    $('#vc-reset').onclick = () => { if (window.confirm('¿Borrar este concurso y empezar uno nuevo?')) act('reset'); };
    const tick = async () => { const r = await api('GET', '/api/vote/host').catch(() => null); if (r) { st = r; paint(); } };
    await tick();
    const timer = setInterval(tick, 1500);
    return () => clearInterval(timer);
  };

  // ---------- Celular: teclera del 1 al 10 y, en la gran final, elegir entre dos ----------
  // app.js llama a draw() cuando cambia algo; aquí se dibuja dentro de #pvote.
  let shown = '';
  window.phoneVote = {
    reset() { shown = ''; },
    async draw(sid, token) {
      const box = $('#pvote');
      const st = await api('GET', `/api/vote?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(token)}`).catch(() => null);
      if (!st || !box || box.hidden) return;
      const sig = JSON.stringify([st.rev, st.mine]);
      if (sig === shown) return;
      shown = sig;
      const head = `<div class="pvote-head"><b>🗳️ ${esc(title(st))}</b></div>`;
      let body;
      if (st.phase === 'winner') body = `<div class="pvote-win">🏆 ${esc(st.winner.name)}<small>¡Ganó ${esc(title(st))}!</small></div>`;
      else if (st.phase === 'final' && st.final.open) {
        body = `<p class="pvote-ask">Gran final<b>¿Quién quieres que gane?</b></p>
          <div class="pvote-duel">${st.final.players.map((p) => `<button type="button" data-v="${p.id}" class="${st.mine === p.id ? 'on' : ''}">${esc(p.name)}</button>`).join('')}</div>
          ${st.mine ? '<p class="pvote-ok">✔ Voto recibido. Puedes cambiarlo mientras la votación esté abierta.</p>' : ''}`;
      } else if (st.phase === 'final') body = '<p class="pvote-wait">Votación cerrada.<br>¡Mira la pantalla para conocer el resultado!</p>';
      else if (st.phase === 'results') body = `<p class="pvote-wait">Resultados: ¡mira la pantalla!</p>${[...st.places].reverse().map((p) => `<div class="pvote-place"><b>${ord(p.place)}</b><span>${esc(p.name)}</span><i>${note(p.score)}</i></div>`).join('')}`;
      else if (st.open) {
        body = `<p class="pvote-ask">Pon tu nota a<b>${esc(st.open.name)}</b></p>
          <div class="pvote-keys">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-v="${i + 1}" data-id="${st.open.id}" class="${st.mine === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
          ${st.mine ? `<p class="pvote-ok">✔ Tu nota: ${st.mine}. Puedes cambiarla mientras la votación esté abierta.</p>` : '<p class="muted small" style="text-align:center">1 es la nota más baja y 10 la más alta.</p>'}`;
      } else body = `<p class="pvote-wait">${st.last ? 'Votación recibida. ¡Gracias!<br>' : ''}Cuando se abra la votación, aquí aparecerá la teclera.</p>`;
      box.innerHTML = head + body;
      box.onclick = async (e) => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        const value = b.dataset.id ? Number(b.dataset.v) : b.dataset.v;
        box.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('on', x === b)); // respuesta inmediata al tocar
        try { await api('POST', '/api/vote/cast', { sid, token, value, id: b.dataset.id }); } catch (err) { fail(err); }
        shown = '';
        window.phoneVote.draw(sid, token);
      };
    },
  };

  // ---------- Pantallas ----------
  const follow = (paint) => {
    let last = '';
    let alive = true;
    const tick = async () => {
      const st = await api('GET', '/api/vote').catch(() => null);
      if (!alive || !st) return;
      const celebrating = st.winner && st.now - st.winAt < CELEBRATE_MS;
      const s = JSON.stringify([st.rev, celebrating]);
      if (s === last) return;
      const first = !last;
      last = s;
      paint(st, celebrating, first);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => { alive = false; clearInterval(timer); };
  };
  const confetti = () => {
    const colors = ['#ffc400', '#0a9a94', '#ff7a1a', '#2338a8', '#56b04c', '#e8262e', '#ffffff'];
    return Array.from({ length: 70 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s"></i>`).join('');
  };
  const winHTML = (st) => `<div class="bwin th-${st.venue}"><div class="confetti">${confetti()}</div>
    <div class="bwin-card"><span class="bwin-sub">${esc(title(st))}</span><span class="vwin-cup">🏆</span>
      <div class="bwin-names"><span><b ${n(st.winner.name)}>${esc(st.winner.name)}</b></span></div><span class="bwin-sub">¡Felicitaciones!</span></div></div>`;

  // Qué decir en cada momento: etiqueta, línea principal, línea secundaria y bloque de la derecha
  const scene = (st) => {
    const lastPlace = st.places[st.places.length - 1];
    if (st.phase === 'winner') return { tag: 'Ganó', main: st.winner.name, sub: title(st), side: ['🏆', '¡Felicitaciones!'] };
    if (st.phase === 'final') {
      return st.final.open ? { tag: 'Gran final', duel: true, sub: 'Elige en tu celular a quién quieres que gane', side: ['Vota ahora', 'Solo un voto por persona'], qr: true }
        : { tag: 'Gran final', duel: true, sub: 'Votación cerrada', side: ['✔', 'Ya viene el resultado'] };
    }
    if (st.phase === 'results') {
      return lastPlace ? { tag: 'Resultados', main: lastPlace.name, sub: ord(lastPlace.place), score: lastPlace.score }
        : { tag: 'Resultados', main: title(st), sub: 'Vamos desde el último lugar hasta la gran final', side: ['🏁', `${st.players.length} participantes`] };
    }
    if (st.open) return { tag: 'Votación abierta', main: st.open.name, sub: 'Pon tu nota del 1 al 10 desde tu celular', side: ['Vota ahora', 'Entra con el código QR'], qr: true };
    if (st.last) {
      const next = st.players.find((p) => !p.done);
      return { tag: 'Votación cerrada', main: st.last.name, sub: '✔ Votación recibida', side: next ? ['Sigue', next.name] : ['🏁', 'Ya vienen los resultados'] };
    }
    return { tag: 'Votación del público', main: title(st), sub: 'Prepárate para votar desde tu celular', side: ['Entra ahora', 'Escanea el código QR'], qr: true };
  };

  // GC de OBS: zócalo abajo, para no tapar a quien está en cámara
  views.votoGC = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="vg"></div><div id="vg-win"></div>';
    let swap = null;
    const stop = follow((st, celebrating) => {
      const box = $('#vg');
      if (!box) return;
      $('#vg-win').innerHTML = celebrating ? winHTML(st) : '';
      const s = scene(st);
      const html = celebrating ? '' : `${s.qr ? `<div class="vg-qr">${qr(joinUrl())}<b>¡Entra y vota!</b></div>` : ''}
        <div class="vg-bar">
          <div class="vg-tag"><small>${esc(title(st))}</small><b>🗳️ ${esc(s.tag)}</b></div>
          <div class="vg-main">${s.duel ? `<b class="vg-duel" ${n(st.final.players.map((p) => p.name).join(' vs '))}>${versus(st)}</b>` : `<b ${n(s.main)}>${esc(s.main)}</b>`}<span ${n(s.sub)}>${esc(s.sub)}</span></div>
          ${s.score != null ? `<div class="vg-side score"><small>Nota</small><b>${note(s.score)}</b></div>` : `<div class="vg-side"><small ${n(s.side[0])}>${esc(s.side[0])}</small><b ${n(s.side[1])}>${esc(s.side[1])}</b></div>`}
        </div>`;
      clearTimeout(swap);
      box.className = `th-${st.venue}`;
      swap = setTimeout(() => { if ($('#vg')) { $('#vg').innerHTML = html; $('#vg').className = `th-${st.venue} ${html ? 'on' : ''}`; } }, box.innerHTML ? 650 : 0);
    });
    return () => { stop(); clearTimeout(swap); document.body.classList.remove('obs', 'gc-screen'); };
  };

  // Tablero del DJ: lo mismo a pantalla completa, con la lista de participantes al costado
  views.votoFull = async () => {
    app.innerHTML = '<div id="vf"></div>';
    let heard = '';
    const stop = follow((st, celebrating, first) => {
      const box = $('#vf');
      if (!box) return;
      const s = scene(st);
      // Sonidos: redoble al revelar un lugar y fanfarria al conocerse quién ganó
      const cue = st.phase === 'winner' ? 'win' : st.phase === 'results' && st.places.length ? `place${st.places.length}` : '';
      if (!first && cue && cue !== heard) sfx.play(cue === 'win' ? 'win' : 'hit');
      heard = cue;
      box.className = `th-${st.venue}`;
      const side = st.phase === 'voting' ? st.players.map((p) => `<div class="${st.open && st.open.id === p.id ? 'on' : ''}"><em>${p.done ? '✔' : st.open && st.open.id === p.id ? '🗳️' : '·'}</em><p><b ${n(p.name)}>${esc(p.name)}</b></p></div>`).join('')
        : [...st.places].reverse().map((p) => `<div><em>${p.place}</em><p><b ${n(p.name)}>${esc(p.name)}</b><span>Nota ${note(p.score)}</span></p></div>`).join('');
      box.innerHTML = `${celebrating ? winHTML(st) : ''}
        <header class="vf-top"><b>${esc(title(st))}</b><span>🗳️ ${esc(s.tag)}</span></header>
        <section class="vf-main"><small>${esc(s.sub)}</small>
          ${s.duel ? `<b class="vg-duel" ${n(st.final.players.map((p) => p.name).join(' vs '))}>${versus(st)}</b>` : `<b ${n(s.main)}>${esc(s.main)}</b>`}
          ${s.score != null ? `<i>Nota ${note(s.score)}</i>` : s.side ? `<span ${n(s.side[1])}>${esc(s.side[1])}</span>` : ''}</section>
        <aside class="vf-side">
          <div class="vf-qr">${qr(joinUrl())}<b>¡Entra y vota!</b></div>
          ${side ? `<div class="vf-list"><small>${st.phase === 'voting' ? 'Participantes' : 'Resultados'}</small>${side}</div>` : ''}
        </aside>`;
    });
    return () => stop();
  };
})();
