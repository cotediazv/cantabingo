/* global views, app, $, esc, api, qr, joinUrl, isAdmin, viewLogin, fail, sfx, activitiesNav */
// Votación del público: panel del animador, teclera del celular, GC de OBS y tablero del DJ.
(() => {
  const n = (t) => `style="--n:${Math.max(6, String(t).length)}"`;
  // Nota promedio con un decimal; con dos si empata con otro (el servidor dice cuántos: dec)
  const note = (x, d) => Number(x).toFixed(d === 2 ? 2 : 1).replace('.', ',');
  const ord = (p) => `${p}.º lugar`;
  const title = (st) => st.title || 'Votación';
  // Número del participante (orden en que se anotó), para que el animador pueda decir «la número 3»
  const badge = (x) => (x ? `<u class="v-no">${x}</u>` : '');
  const nm = (p) => `${badge(p.no)}${esc(p.name)}`;
  const versus = (st) => st.final.players.map((p) => esc(p.name)).join(' <em>vs</em> ');
  const CELEBRATE_MS = 6000;
  // Reloj del llamado a participar: cada pantalla lo lleva con su propia hora, a partir de lo que dice el servidor
  let clockEnd = 0;
  let clockKey = 0;
  const setClock = (st) => { if (st.clockUntil !== clockKey) { clockKey = st.clockUntil; if (st.clockUntil) clockEnd = Date.now() + (st.clockUntil - st.now); } }; // al cerrarse se conserva la hora de término, para saber si fue antes de tiempo
  const clockLeft = () => Math.max(0, clockEnd - Date.now());
  const clockText = () => { const s = Math.ceil(clockLeft() / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  setInterval(() => { if (clockKey) for (const el of document.querySelectorAll('.v-clock')) el.textContent = clockText(); }, 200);
  const thing = (p) => (p.thing ? `<i class="v-thing">${esc(p.thing)}</i>` : '');
  const withThing = (p) => (p.thing ? `${p.name} · ${p.thing}` : p.name);
  const isK = (st) => st.mode === 'karaoke';
  const fest = (st) => `El Festival de ${{ frida: 'Frida', kennedy: 'Kennedy', tobalaba: 'Tobalaba' }[st.venue] || 'Frida'}`;
  // Para leer al partir cada juego (pedido de Cote)
  const howtoLines = (st) => (isK(st) ? [
    `${st.max} participantes cantan. Si se inscriben más, sorteo.`,
    'Canciones cortas.',
    'Todos votan desde las mesas: nota del 1 al 10.',
    'Al terminar la votación, se muestran en pantalla <b>5 notas del público al azar</b>, que no determinan el promedio. El promedio se conoce al final del concurso.',
    'Gana el mejor <b>promedio</b>.',
  ] : [
    'Cada participante presenta su objeto.',
    'Todos votan desde las mesas: nota del 1 al 10.',
    'Gran final entre los dos primeros.',
  ]);
  const howtoTitle = (st) => (isK(st) ? fest(st) : st.title || 'El objeto más extraño');
  const howto = (st) => window.readAloud(howtoTitle(st), howtoLines(st));
  window.voteHowto = (st) => ({ title: howtoTitle(st), lines: howtoLines(st) }); // para los celulares (app.js)
  const icon = (st) => (isK(st) ? '🎤' : '🗳️');
  // 5 notas al azar del público tras cada canción (concurso de karaoke)
  const notesHTML = (st, cls) => (st.sample && st.sample.length ? `<div class="${cls}">${st.sample.map((x) => `<span><i>${x.note}</i><small>${esc(x.name || '')}</small></span>`).join('')}</div>` : '');

  // ---------- Panel del animador ----------
  views.votoctl = async (which) => {
    if (!(await isAdmin())) return viewLogin();
    // El Festival y El objeto más extraño son juegos separados (pedido de Cote): #/votoctl/festival o #/votoctl/objeto
    const want = which === 'festival' ? 'karaoke' : which === 'objeto' ? 'objeto' : '';
    app.innerHTML = `<div id="vc-howto"></div><div class="panel" id="vc-panel"><h1 style="margin:0" id="vc-h1">${want === 'karaoke' ? '🎤 El Festival' : '🗳️ El objeto más extraño'}</h1>
        <label class="f" id="vc-title-wrap" style="margin-top:12px" hidden>Nombre del concurso<input type="text" id="vc-title" maxlength="50" placeholder="Ej.: El objeto más extraño"></label>
        <div id="vc-body" style="margin-top:14px"></div>
      </div>
      <div id="vc-win" hidden></div>
      ${activitiesNav(want === 'karaoke' ? 'festival' : 'objeto')}
      <details class="vc-more" id="vc-more"><summary>Más opciones</summary><button class="big" id="vc-reset">🗑 Nuevo concurso (borra este)</button></details>`;
    await api('POST', '/api/stage', { show: 'voto' }).catch(fail);
    let st = null;
    let last = '';
    const act = async (action, extra = {}) => { try { st = await api('POST', '/api/vote/host', { action, ...extra }); last = ''; paint(); return true; } catch (err) { fail(err); return false; } };
    const paint = () => {
      const box = $('#vc-body');
      if (!box || !st) return;
      setClock(st);
      const sig = JSON.stringify([st.mode, st.title, st.max, st.phase, st.signup, st.players, st.open, st.onstage, st.counts, st.places, st.next, st.final, st.tally, st.winner, st.sample, st.overflow]);
      if (sig === last) return;
      last = sig;
      if (document.activeElement !== $('#vc-title')) $('#vc-title').value = st.title;
      // El objeto más extraño y El Festival (pedido de Cote, 20 nov: «los dos igual de limpios»): el título ya está
      // definido y la gente se inscribe sola desde su celular: sin campo para el nombre del concurso, sin explicación de
      // las inscripciones y sin anotar a mano
      const obj = true;
      $('#vc-title-wrap').hidden = obj;
      const keep = $('#vc-name') ? $('#vc-name').value : '';
      const keepThing = $('#vc-thing') ? $('#vc-thing').value : '';
      const focus = document.activeElement === $('#vc-name') ? '#vc-name' : document.activeElement === $('#vc-thing') ? '#vc-thing' : '';
      let html = '';
      if (st.phase === 'voting') {
        // Pedido de Cote (20 nov): un solo botón que va avanzando: Abrir inscripciones → Iniciar participante →
        // Iniciar votación → Iniciar participante (el siguiente)… → Pasar a los resultados. La información del principio
        // (instrucciones y cupos) se ve solo antes de abrir las inscripciones.
        const next = st.players.find((p) => !p.done);
        const voted = st.players.some((p) => p.done) || st.onstage || st.open;
        const who = (p, label) => `<div class="vc-now"><small>${label}</small><b>${nm(p)}</b>${p.thing ? `<span>${esc(p.thing)}</span>` : ''}</div>`;
        let step;
        if (st.open) step = `${who(st.open, `🗳️ Votación abierta · <span class="v-clock">${clockText()}</span> · ${st.counts[st.open.id] || 0} votos`)}<button class="primary big" data-act="close">Cerrar votación</button>`;
        else if (st.signup) step = `<div class="vc-signup on"><p><b>📲 Inscripciones abiertas · <span class="v-clock">${clockText()}</span></b></p><button data-act="signup">Cerrar</button></div>`;
        else if (!st.players.length) step = '<button class="primary big" data-act="signup" data-on="1">📲 Abrir inscripciones</button>';
        else if (st.overflow) step = `<button class="primary big" data-act="draw">🎲 Sortear los ${st.max} que cantan (se inscribieron ${st.players.length})</button>`;
        else if (next && st.onstage && st.onstage.id === next.id) step = `${who(next, isK(st) ? '🎤 En el escenario' : '🗳️ Presentando su objeto')}<button class="primary big" data-act="open" data-id="${next.id}">🗳️ Iniciar votación</button>`;
        else if (next) step = `${who(next, voted ? 'Ya viene el siguiente participante' : 'Primer participante')}<button class="primary big" data-act="present" data-id="${next.id}">🎤 Iniciar participante</button>`;
        else if (st.players.length >= 2) step = '<button class="primary big" data-act="results">🏁 Pasar a los resultados</button>';
        else step = '<p class="muted">Se necesitan al menos 2 participantes.</p><button class="big" data-act="signup" data-on="1">📲 Abrir inscripciones otra vez</button>';
        html = `${want && st.mode !== want ? `<div class="vc-read"><small>Hay un concurso de «${esc(st.title)}» en curso</small><button class="primary big" data-act="reset">Empezar ${want === 'karaoke' ? esc(fest(st)) : 'El objeto más extraño'} (borra el anterior)</button></div>` : ''}
          ${!st.signup && !st.players.length ? `<label class="f vc-max ${isK(st) ? 'ask' : ''}">${isK(st) ? '¿Cuántos participantes van a cantar?' : 'Cupos (máximo de participantes)'}<input type="number" id="vc-max" min="2" max="30" value="${st.max}"></label>` : ''}
          ${st.sample ? `<div class="vc-read"><small>Notas al azar en pantalla (sin el promedio)</small>${notesHTML(st, 'vc-notes')}</div>` : ''}
          <div class="vc-step">${step}</div>
          ${st.players.length && !voted && !st.signup ? '<button class="vc-again" data-act="signup" data-on="1">Abrir inscripciones otra vez</button>' : ''}
          ${st.players.length ? `<div class="vc-list vc-mini">${st.players.map((p) => {
    const on = st.open && st.open.id === p.id;
    const up = st.onstage && st.onstage.id === p.id;
    return `<div class="vc-row ${on || up ? 'on' : ''}"><p><b>${nm(p)}</b>${thing(p)}</p><em>${on ? '🗳️' : up ? '🎤' : p.done ? `✔ ${st.counts[p.id]} votos` : ''}</em>${!p.done && !on && !up ? `<button class="vc-x" data-act="remove" data-id="${p.id}" aria-label="Quitar a ${esc(p.name)}">✕</button>` : ''}</div>`;
  }).join('')}</div>` : ''}`;
      } else if (st.phase === 'results') {
        html = `<h2>Resultados</h2>
          ${st.next ? `<div class="vc-read"><small>Viene · solo lo ves tú, hasta que lo reveles</small><em>${ord(st.next.place)}</em><b>${esc(st.next.name)}</b>${st.next.thing ? `<span>${esc(st.next.thing)}</span>` : ''}<i>Nota ${note(st.next.score, st.next.dec)}</i></div>
            <button class="primary big" data-act="reveal">Revelar ${ord(st.next.place)}</button>`
    : `<div class="vc-read"><small>Quedan las dos finalistas</small>${st.final.players.map((p) => `<b>${esc(p.name)}</b>${p.thing ? `<span>${esc(p.thing)}</span>` : ''}`).join('<em class="vs">y</em>')}</div>
            <button class="primary big" data-act="final">${isK(st) ? '🥁 Redoble de tambores: los dos finalistas' : '⚔️ Gran final: abrir votación'}</button>`}
          <div class="vc-list">${[...st.places].reverse().map((p) => `<div class="vc-row"><p><b>${ord(p.place)} · ${esc(p.name)}</b>${thing(p)}<small>Nota ${note(p.score, p.dec)}</small></p></div>`).join('')}</div>`;
      } else if (st.phase === 'final' && isK(st)) {
        html = `<h2>🥁 Redoble de tambores</h2>
          <div class="vc-read"><small>Los dos finalistas están en pantalla</small>${st.final.players.map((p) => `<b>${esc(p.name)}</b>${p.thing ? `<span>${esc(p.thing)}</span>` : ''}`).join('<em class="vs">y</em>')}</div>
          <button class="primary big" data-act="winner" style="margin-top:12px">🏆 Revelar al gran ganador</button>`;
      } else if (st.phase === 'final') {
        const total = Object.values(st.tally).reduce((a, b) => a + b, 0);
        html = `<h2>Gran final</h2>
          <div class="vc-list">${st.final.players.map((p) => `<div class="vc-row"><p><b>${esc(p.name)}</b>${thing(p)}<small>${st.final.open ? `Recibiendo votos · <span class="v-clock">${clockText()}</span>` : `${st.tally[p.id]} votos (solo lo ves tú)`}</small></p></div>`).join('')}</div>
          <p class="muted small" style="margin-top:6px">${total} votos en la gran final</p>
          ${st.final.open ? '<button class="primary big" data-act="closefinal" style="margin-top:12px">Cerrar votación</button>'
    : '<button class="primary big" data-act="winner" style="margin-top:12px">🏆 Revelar quién ganó</button><button class="big" data-act="final" style="margin-top:10px">Reabrir votación</button>'}`;
      } else if (isK(st)) {
        html = `<h2>🏆 Ganó ${esc(st.winner.name)} · ${note(st.winner.score, st.winner.dec)}</h2>
          <div class="vc-list">${st.second ? `<div class="vc-row"><p><b>2.º lugar · ${esc(st.second.name)}</b>${thing(st.second)}<small>Nota ${note(st.second.score, st.second.dec)}</small></p></div>` : ''}
          ${[...st.places].reverse().map((p) => `<div class="vc-row"><p><b>${ord(p.place)} · ${esc(p.name)}</b>${thing(p)}<small>Nota ${note(p.score, p.dec)}</small></p></div>`).join('')}</div>`;
      } else {
        html = `<h2>🏆 Ganó ${esc(st.winner.name)}</h2>
          <div class="vc-list">${st.final.players.map((p) => `<div class="vc-row"><p><b>${esc(p.name)}</b><small>${st.tally[p.id]} votos en la gran final</small></p></div>`).join('')}
          ${[...st.places].reverse().map((p) => `<div class="vc-row"><p><b>${ord(p.place)} · ${esc(p.name)}</b><small>Nota ${note(p.score, p.dec)}</small></p></div>`).join('')}</div>`;
      }
      box.innerHTML = html;
      const ht = $('#vc-howto');
      const htKey = `${st.mode}|${st.max}|${st.venue}`;
      if (ht && ht.dataset.k !== htKey) { const wasOpen = !ht.firstElementChild || ht.firstElementChild.open; ht.dataset.k = htKey; ht.innerHTML = howto(st); ht.firstElementChild.open = wasOpen; }
      if (ht) ht.hidden = st.phase !== 'voting' || st.signup || st.players.length > 0; // las instrucciones, solo al principio
      // Pedido de Cote (20 nov): con el ganador anunciado desaparece el juego y queda solo lo que viene (el menú)
      $('#vc-panel').hidden = st.phase === 'winner';
      // Pedido de Cote (21 nov): con el ganador anunciado, su nombre y su nota grandes para anunciarlo
      const vw = $('#vc-win');
      const vwKey = st.phase === 'winner' && st.winner ? JSON.stringify([st.winner, st.second]) : '';
      if (vw && vw.dataset.k !== vwKey) {
        vw.dataset.k = vwKey;
        vw.hidden = !vwKey;
        vw.innerHTML = vwKey ? window.annHtml(`🏆 Ganó ${title(st)}`, [st.winner.name], [st.winner.thing || '', isK(st) && st.winner.score != null ? `Nota ${note(st.winner.score, st.winner.dec)}` : '',
          st.second ? `2.º lugar: ${st.second.name} · nota ${note(st.second.score, st.second.dec)}` : '']) : '';
      }
      window.setNavFold((st.signup || st.players.length > 0) && st.phase !== 'winner');
      if ($('#vc-name')) { $('#vc-name').value = keep; $('#vc-thing').value = keepThing; if (focus) $(focus).focus(); }
      if ($('#vc-add')) $('#vc-add').onsubmit = async (e) => { e.preventDefault(); const name = $('#vc-name').value; const what = $('#vc-thing').value; if (await act('add', { name, thing: what })) { $('#vc-name').value = ''; $('#vc-thing').value = ''; $('#vc-name').focus(); } };
    };
    $('#vc-body').onclick = async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'reset') { if (await act('reset')) await ensureMode(); return; }
      act(b.dataset.act, { id: b.dataset.id, on: !!b.dataset.on, mode: b.dataset.mode });
    };
    $('#vc-body').onchange = (e) => { if (e.target.id === 'vc-max') act('max', { max: e.target.value }); };
    $('#vc-title').onchange = (e) => act('title', { title: e.target.value });
    $('#vc-reset').onclick = () => { if (window.confirm('¿Borrar este concurso y empezar uno nuevo?')) act('reset'); };
    // Al entrar por el menú, el concurso queda del tipo elegido (si no tiene participantes; si tiene, se ofrece empezar uno nuevo)
    const ensureMode = async () => { if (want && st && st.mode !== want && !st.players.length) { await act('mode', { mode: want }); } };
    const tick = async () => { const r = await api('GET', '/api/vote/host').catch(() => null); if (r) { st = r; paint(); } };
    await tick();
    await ensureMode();
    $('#vc-h1').textContent = (want || st.mode) === 'karaoke' ? `🎤 ${fest(st)}` : '🗳️ El objeto más extraño';
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
      setClock(st);
      const sig = JSON.stringify([st.rev, st.mine, st.me]);
      if (sig === shown) return;
      shown = sig;
      const head = `<div class="pvote-head"><b>${icon(st)} ${esc(title(st))}</b></div>`;
      let body;
      if (st.phase === 'winner') body = `<div class="pvote-win">🏆 ${badge('1.º')}${esc(st.winner.name)}${thing(st.winner)}<small>¡Ganó ${esc(title(st))}!</small></div>`;
      else if (st.phase === 'final' && st.final.drum) body = '<p class="pvote-wait">🥁 ¡Redoble de tambores!<br>Mira la pantalla para conocer al ganador.</p>';
      else if (st.phase === 'final' && st.final.open) {
        body = `<p class="pvote-ask">Gran final<b>¿Quién quieres que gane?</b></p>
          <div class="pvote-duel">${st.final.players.map((p) => `<button type="button" data-v="${p.id}" class="${st.mine === p.id ? 'on' : ''}">${esc(p.name)}${thing(p)}</button>`).join('')}</div>
          <p class="pvote-clock">Quedan <b class="v-clock">${clockText()}</b></p>
          ${st.mine ? '<p class="pvote-ok">✔ Voto recibido. Puedes cambiarlo mientras la votación esté abierta.</p>' : ''}`;
      } else if (st.phase === 'final') body = '<p class="pvote-wait">Votación cerrada.<br>¡Mira la pantalla para conocer el resultado!</p>';
      else if (st.phase === 'results') body = `<p class="pvote-wait">Resultados: ¡mira la pantalla!</p>${[...st.places].reverse().map((p) => `<div class="pvote-place"><b>${ord(p.place)}</b><span>${esc(p.name)}${thing(p)}</span><i>${note(p.score, p.dec)}</i></div>`).join('')}`;
      else if (st.open) {
        body = `<p class="pvote-ask">Pon tu nota a<b>${nm(st.open)}</b>${thing(st.open)}</p>
          <div class="pvote-keys">${Array.from({ length: 10 }, (_, i) => `<button type="button" data-v="${i + 1}" data-id="${st.open.id}" class="${st.mine === i + 1 ? 'on' : ''}">${i + 1}</button>`).join('')}</div>
          <p class="pvote-clock">Quedan <b class="v-clock">${clockText()}</b></p>
          ${st.mine ? `<p class="pvote-ok">✔ Tu nota: ${st.mine}. Puedes cambiarla mientras la votación esté abierta.</p>` : '<p class="muted small" style="text-align:center">1 es la nota más baja y 10 la más alta.</p>'}`;
      } else if (st.me && isK(st) && st.overflow) body = `<div class="pvote-in">✔ Estás inscrito<b>${esc(st.me.thing)}</b><small>Se inscribieron más personas que los cupos: haremos un sorteo. ¡Mira la pantalla!</small></div>`;
      else if (st.me) body = `<div class="pvote-in">✔ Estás en la lista<b>${badge(st.me.no)}${esc(st.me.thing)}</b><small>Atento al llamado del animador para subir al escenario.</small></div>`;
      else if (st.signup && st.room) {
        body = `<form id="pv-join"><p class="pvote-ask">${isK(st) ? '¿Quieres cantar?<b>¡Inscríbete con tu canción!</b>' : '¿Quieres participar?<b>¡Sube a nuestro escenario!</b>'}</p>
          ${isK(st) ? `<label class="f">Canción<input type="text" id="pv-song" name="song" maxlength="50" required minlength="2" autocomplete="off" placeholder="Nombre de la canción"></label>
          <div class="sug" data-sug="song"></div>
          <label class="f">Artista<input type="text" id="pv-artist" name="artist" maxlength="40" required minlength="2" autocomplete="off" placeholder="Quién la canta"></label>`
    : '<label class="f">¿Con qué participas?<input type="text" id="pv-thing" maxlength="40" required minlength="2" autocomplete="off" placeholder="Descripción de tu objeto"></label>'}
          <button class="primary big" style="margin-top:10px">Inscribirme</button>
          <p class="pvote-clock">Quedan <b class="v-clock">${clockText()}</b></p>
          <p class="muted small" style="text-align:center;margin-top:8px">Te inscribes con el nombre con que entraste a la sala.</p></form>`;
      } else if (st.signup) body = '<p class="pvote-wait">Ya se completaron los cupos para participar.<br>¡Prepárate para votar!</p>';
      else body = `<p class="pvote-wait">${st.last ? 'Votación recibida. ¡Gracias!<br>' : ''}Cuando se abra la votación, aquí aparecerá la teclera.</p>`;
      // Si la pantalla se vuelve a dibujar mientras la persona escribe (llegó otra inscripción), no pierde lo escrito
      const keepIds = ['pv-thing', 'pv-song', 'pv-artist'];
      const drafts = Object.fromEntries(keepIds.map((id) => [id, $(`#${id}`) ? $(`#${id}`).value : '']));
      const typing = keepIds.find((id) => document.activeElement === $(`#${id}`));
      box.innerHTML = head + body;
      keepIds.forEach((id) => { if ($(`#${id}`)) $(`#${id}`).value = drafts[id]; });
      if (typing && $(`#${typing}`)) $(`#${typing}`).focus();
      if ($('#pv-join')) {
        if (isK(st) && typeof wireSongSearch === 'function') wireSongSearch($('#pv-join')); // ayuda de iTunes (pedido de Cote)
        $('#pv-join').onsubmit = async (e) => {
          e.preventDefault();
          const val = (id) => ($(`#${id}`) ? $(`#${id}`).value : '');
          try { await api('POST', '/api/vote/join', { sid, token, thing: val('pv-thing'), song: val('pv-song'), artist: val('pv-artist') }); } catch (err) { fail(err); }
          shown = '';
          window.phoneVote.draw(sid, token);
        };
      }
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
      setClock(st);
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
      <div class="bwin-names"><span><b ${n(`${st.winner.name}...`)}>${badge('1.º')}${esc(st.winner.name)}</b>${st.winner.thing ? `<small>${esc(st.winner.thing)}</small>` : ''}</span></div>
      ${isK(st) && st.winner.score != null ? `<span class="vk-score">Puntaje <b>${note(st.winner.score, st.winner.dec)}</b></span>` : ''}
      <span class="bwin-sub">¡Felicitaciones!</span></div></div>`;

  // Qué decir en cada momento: etiqueta, línea principal, línea secundaria y bloque de la derecha
  // Pedido de Cote (20 nov): en la final, después del redoble, primero se revela solo al gran ganador; el 2.º lugar
  // aparece después, cuando termina la celebración
  const scene = (st, celebrating = false) => {
    const lastPlace = st.places[st.places.length - 1];
    if (st.phase === 'winner' && isK(st)) return { tag: 'Ganó', no: '1.º', main: st.winner.name, sub: st.second && !celebrating ? `2.º lugar: ${st.second.name} · ${note(st.second.score, st.second.dec)}` : (st.winner.thing || title(st)), score: st.winner.score, dec: st.winner.dec };
    if (st.phase === 'winner') return { tag: 'Ganó', no: '1.º', main: st.winner.name, sub: st.winner.thing || '', side: ['🏆', '¡Felicitaciones!'] };
    if (st.phase === 'final' && st.final.drum) return { tag: 'Los finalistas', duel: true, drum: true, sub: '🥁 ¡Redoble de tambores!', side: ['🥁', '¿Quién ganará?'] };
    if (st.phase === 'final') {
      return st.final.open ? { tag: 'Gran final', duel: true, sub: 'Elige en tu celular a quién quieres que gane', clock: 'Vota ahora', qr: true }
        : { tag: 'Gran final', duel: true, sub: 'Votación cerrada', side: ['✔', 'Ya viene el resultado'] };
    }
    if (st.phase === 'results') {
      return lastPlace ? { tag: 'Resultados', no: `${lastPlace.place}.º`, main: lastPlace.name, sub: lastPlace.thing || '', score: lastPlace.score, dec: lastPlace.dec }
        : { tag: 'Resultados', main: 'Vamos desde el último lugar', sub: 'hasta la gran final', side: ['🏁', `${st.players.length} participantes`] };
    }
    if (st.onstage) return { tag: isK(st) ? 'En el escenario' : 'Presenta su objeto', no: st.onstage.no, main: st.onstage.name, featured: !!st.onstage.thing, sub: st.onstage.thing || '', side: isK(st) ? ['🎤', '¡Aplausos!'] : ['🗳️', 'Atentos'] };
    if (st.open) return { tag: 'Votación abierta', no: st.open.no, main: st.open.name, featured: !!st.open.thing, sub: st.open.thing || 'Pon tu nota del 1 al 10 desde tu celular', clock: 'Vota del 1 al 10', qr: true };
    if (st.drawn) return { tag: 'Sorteo de participantes', main: '🎲 ¡Ellos cantan!', sub: 'Prepárense para subir al escenario', list: st.drawn, side: ['🎤', `${st.drawn.length} cantan`] };
    if (st.last && st.sample && st.sample.length) return { tag: 'Notas del público', no: st.last.no, main: st.last.name, sub: st.last.thing || '', notes: true };
    if (st.last) {
      const next = st.players.find((p) => !p.done);
      return next ? { tag: 'Votación cerrada', main: 'Ya viene el siguiente participante', sub: '¡Gracias por votar!', side: ['🎤', 'Atentos'] }
        : { tag: 'Votación cerrada', no: st.last.no, main: st.last.name, sub: st.last.thing || '¡Gracias por votar!', side: ['🏁', 'Ya vienen los resultados'] };
    }
    if (st.signup) return { tag: 'Inscripciones abiertas', main: isK(st) ? '¿Quieres cantar?' : '¿Quieres participar?', sub: isK(st) ? 'Inscríbete desde tu celular con tu canción y el artista' : 'Inscríbete desde tu celular', clock: 'Tiempo', qr: true };
    // Instrucciones del festival (pedido de Cote)
    if (isK(st)) return { tag: 'Cómo se juega', main: `Elegimos ${st.max} personas para cantar`, sub: 'Las canciones serán cortas en pro del tiempo', side: ['🎤', 'Nota del 1 al 10'], qr: true };
    return { tag: 'Votación del público', main: 'Prepárate para votar', sub: 'Pon tu nota del 1 al 10 desde tu celular', side: ['🗳️', '1 al 10'], qr: true };
  };

  // GC de OBS: zócalo abajo, para no tapar a quien está en cámara
  views.votoGC = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="vg"></div><div id="vg-win"></div>';
    let swap = null;
    let sceneKey = '';
    let drumHeard = null;
    const stop = follow((st, celebrating) => {
      const box = $('#vg');
      if (!box) return;
      $('#vg-win').innerHTML = celebrating ? winHTML(st) : '';
      const s = scene(st, celebrating);
      // Lista de inscritos: se ve durante el llamado y hasta que empieza la primera votación
      const roster = st.phase === 'voting' && !st.open && !st.onstage && !st.last && !st.drawn && st.players.length
        ? `<div class="vg-list"><small>Inscritos <b>${st.players.length}/${st.max}</b></small>${st.players.map((p) => `<div><p><b>${nm(p)}</b>${p.thing ? `<span>${esc(p.thing)}</span>` : ''}</p></div>`).join('')}</div>` : '';
      const html = celebrating ? '' : `${s.notes ? `<div class="vk-card">${notesHTML(st, 'vk-notes')}</div>` : ''}${s.list ? `<div class="vk-card"><ol class="vk-list">${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></div>` : ''}${roster}${s.qr || true ? `<div class="vg-qr">${qr(joinUrl())}<b>Si no has participado, escanea el código QR con tu celular y únete a la sesión</b></div>` : ''}
        <div class="vg-bar">
          <div class="vg-tag"><small>${esc(title(st))}</small><b>${icon(st)} ${esc(s.tag)}</b></div>
          <div class="vg-main ${s.featured ? 'featured' : ''}">${s.duel ? `<b class="vg-duel" ${n(st.final.players.map((p) => `${p.name}...`).join(' vs '))}>${versus(st)}</b>` : `<b ${n(s.no ? `${s.main}...` : s.main)}>${badge(s.no)}${esc(s.main)}</b>`}${s.sub ? `<span ${n(s.sub)}>${esc(s.sub)}</span>` : ''}</div>
          ${s.notes ? '<div class="vg-side"><small>Notas</small><b>8 s</b></div>' : s.clock ? `<div class="vg-side score"><small>${esc(s.clock)}</small><b class="v-clock">${clockText()}</b></div>` : s.score != null ? `<div class="vg-side score"><small>Nota</small><b>${note(s.score, s.dec)}</b></div>` : `<div class="vg-side"><small ${n(s.side[0])}>${esc(s.side[0])}</small><b ${n(s.side[1])}>${esc(s.side[1])}</b></div>`}
        </div>`;
      clearTimeout(swap);
      // Si solo cambió un detalle (llegó otro inscrito), se actualiza en el lugar, sin sacar y volver a entrar el zócalo
      const key = celebrating ? '' : JSON.stringify([s.tag, s.main, s.sub, !!s.qr, !!s.notes]);
      // Redoble de tambores (concurso de karaoke) también en el GC, para la transmisión
      if (s.drum && drumHeard !== st.rev) { drumHeard = st.rev; sfx.unlock(); sfx.play('drum'); }
      if (key && key === sceneKey && box.classList.contains('on')) { box.innerHTML = html; return; }
      sceneKey = key;
      box.className = `th-${st.venue}`;
      swap = setTimeout(() => { if ($('#vg')) { $('#vg').innerHTML = html; $('#vg').className = `th-${st.venue} ${html ? 'on' : ''}`; } }, box.innerHTML ? 650 : 0);
    });
    return () => { stop(); clearTimeout(swap); document.body.classList.remove('obs', 'gc-screen'); };
  };

  // Tablero del DJ: lo mismo a pantalla completa, con la lista de participantes al costado
  views.votoFull = async () => {
    app.innerHTML = '<div id="vf"></div>';
    let heard = '';
    // Reloj sonoro: tic-tac suave, cada vez más rápido (de 1 a 5 por segundo)
    let tickTimer = null;
    let flip = false;
    let ticking = 0;
    let total = 90000;
    const tickLoop = () => {
      clearTimeout(tickTimer);
      tickTimer = null;
      if (!ticking || !$('#vf')) return;
      const left = clockLeft();
      if (left <= 0) { ticking = 0; const end = total > 30000 ? 'alarm' : 'chime'; sfx.played.push(end); sfx.play(end); return; } // bocinas solo al cerrar el llamado; campanita al terminar cada evaluación
      sfx.ticks++;
      sfx.play(flip ? 'softTock' : 'softTick');
      flip = !flip;
      const rate = left <= 5000 ? 5 : 1 + 4 * Math.min(1, Math.max(0, (total - left) / (total - 5000)));
      tickTimer = setTimeout(tickLoop, Math.min(1000 / rate, left + 30));
    };
    const stop = follow((st, celebrating, first) => {
      total = Math.max(5500, st.clockMs || 90000);
      if (st.clockUntil && st.clockUntil !== ticking) { ticking = st.clockUntil; tickLoop(); }
      if (!st.clockUntil && ticking && clockLeft() > 700) { ticking = 0; clearTimeout(tickTimer); } // el animador las cerró antes de tiempo: sin bocinas
      const box = $('#vf');
      if (!box) return;
      const s = scene(st, celebrating);
      // Sonidos: redoble al revelar un lugar y fanfarria al conocerse quién ganó
      const cue = st.phase === 'winner' ? 'win' : st.phase === 'final' && st.final && st.final.drum ? 'drum' : st.phase === 'results' && st.places.length ? `place${st.places.length}` : '';
      if (!first && cue && cue !== heard) sfx.play(cue === 'win' ? 'win' : cue === 'drum' ? 'drum' : 'hit');
      heard = cue;
      box.className = `th-${st.venue}`;
      const side = st.phase === 'voting' ? st.players.map((p) => `<div class="${(st.open && st.open.id === p.id) || (st.onstage && st.onstage.id === p.id) ? 'on' : ''}"><em>${p.done ? '✔' : st.open && st.open.id === p.id ? '🗳️' : st.onstage && st.onstage.id === p.id ? '🎤' : '·'}</em><p><b ${n(p.name)}>${nm(p)}</b>${p.thing ? `<span>${esc(p.thing)}</span>` : ''}</p></div>`).join('')
        : [...st.places].reverse().map((p) => `<div><em>${p.place}</em><p><b ${n(p.name)}>${esc(p.name)}</b><span>Nota ${note(p.score, p.dec)}${p.thing ? ` · ${esc(p.thing)}` : ''}</span></p></div>`).join('');
      box.innerHTML = `${celebrating ? winHTML(st) : ''}
        <header class="vf-top"><b>${esc(title(st))}</b><span>${icon(st)} ${esc(s.tag)}</span></header>
        <section class="vf-main ${s.featured ? 'featured' : ''}">${st.signup ? `<small>¿Quieres participar?</small><b class="v-clock vf-clock">${clockText()}</b><span style="--n:28">Inscríbete desde tu celular</span>`
    : `${s.sub ? `<small ${n(s.sub)}>${esc(s.sub)}</small>` : ''}
          ${s.duel ? `<b class="vg-duel" ${n(st.final.players.map((p) => `${p.name}...`).join(' vs '))}>${versus(st)}</b>` : `<b ${n(s.no ? `${s.main}...` : s.main)}>${badge(s.no)}${esc(s.main)}</b>`}
          ${s.list ? `<ol class="vk-list">${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : s.notes ? notesHTML(st, 'vk-notes big') : s.clock ? `<i class="v-clock">${clockText()}</i>` : s.score != null ? `<i>${s.tag === 'Ganó' ? 'Puntaje' : 'Nota'} ${note(s.score, s.dec)}</i>` : s.side ? `<span ${n(s.side[1])}>${esc(s.side[1])}</span>` : ''}`}</section>
        <aside class="vf-side">
          <div class="vf-qr">${qr(joinUrl())}<b>Si no has participado, escanea el código QR con tu celular y únete a la sesión</b></div>
          ${side ? `<div class="vf-list"><small>${st.phase === 'voting' ? 'Participantes' : 'Resultados'}</small>${side}</div>` : ''}
        </aside>`;
      box.querySelectorAll('.vf-main > small, .vf-main > b, .vf-main > span, .vf-main > i').forEach((el) => window.fitOneLine(el)); // cada línea en su línea
    });
    return () => { stop(); ticking = 0; clearTimeout(tickTimer); };
  };
})();
