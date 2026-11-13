/* global views, app, $, esc, api, fail, toast, isAdmin, viewLogin, BACK_BINGO */
// Sorteo de concursantes para El Rosco: panel del moderador y animación para la pantalla de OBS.
(() => {
  // ---------- Moderador ----------
  views.sorteoctl = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = `<h1>Sorteo de concursantes</h1>
      <div class="cols">
        <div class="panel">
          <p class="muted">Elige al azar, entre quienes se unieron al bingo, a las personas que jugarán El Rosco. Cada sorteo se ve en la pantalla de OBS.</p>
          <p style="margin:14px 0"><button class="primary big" id="rf-draw">🎲 Sortear un concursante</button></p>
          <h2>Concursantes elegidos</h2>
          <div id="rf-picked" style="margin:10px 0"></div>
          <div class="row">
            <button class="primary" id="rf-create">✔ Aceptar y cargar El Rosco</button>
            <button id="rf-reset">Empezar de nuevo</button>
          </div>
        </div>
        <div class="panel">
          <div class="row between"><h2 id="rf-count"></h2><button class="danger" id="rf-clear">Vaciar la lista</button></div>
          <p class="muted small">Solo entran al sorteo quienes tienen su cartón abierto en este momento (🟢). Los demás (⚪) vuelven a entrar si abren de nuevo la página.</p>
          <div id="rf-people" style="margin-top:10px;max-height:420px;overflow:auto"></div>
        </div>
      </div>${BACK_BINGO}`;
    let picked = [];
    api('POST', '/api/stage', { show: 'sorteo' }).catch(() => {});
    const load = async () => {
      const [r, p] = await Promise.all([api('GET', '/api/raffle'), api('GET', '/api/people')]);
      picked = r.picked;
      const online = new Set(p.connected);
      $('#rf-count').textContent = `${p.connected.length} conectados ahora · ${p.names.length} en la lista`;
      $('#rf-people').innerHTML = p.names.map((n) => `<div class="row between rf-row ${online.has(n) ? 'on' : 'off'}"><span>${online.has(n) ? '🟢' : '⚪'} ${esc(n)}</span><span class="row" style="gap:6px"><button data-edit="${esc(n)}">✏️ Editar</button><button class="danger" data-drop="${esc(n)}">Quitar</button></span></div>`).join('')
        || '<p class="muted">Aún no hay nadie. Aparecerán al unirse al bingo.</p>';
      $('#rf-picked').innerHTML = picked.length ? picked.map((n, i) => `<div class="row between" style="padding:8px 0;border-bottom:1px solid var(--line)"><b>${i + 1}. ${esc(n)}</b><span class="row" style="gap:6px"><button data-edit="${esc(n)}">✏️ Editar</button><button data-remove="${esc(n)}">Quitar</button></span></div>`).join('')
        : '<p class="muted">Todavía no has sorteado a nadie.</p>';
      $('#rf-draw').disabled = picked.length >= 4 || p.connected.filter((n) => !picked.includes(n)).length === 0;
      $('#rf-create').disabled = !picked.length;
    };
    $('#rf-draw').onclick = async () => {
      try { await api('POST', '/api/raffle/draw'); toast('Sorteando en pantalla…'); await load(); } catch (err) { fail(err); }
    };
    // Corregir un nombre mal escrito o inapropiado; el cambio llega también al bingo y al rosco
    const edit = async (from) => {
      const to = prompt('Corrige el nombre:', from);
      if (to === null || to.trim() === from) return;
      try { await api('POST', '/api/people/rename', { from, to }); toast('Nombre corregido'); } catch (err) { fail(err); }
      await load();
    };
    $('#rf-picked').onclick = async (e) => {
      const d = e.target.dataset;
      if (d.edit) return void edit(d.edit);
      if (d.remove) { await api('POST', '/api/raffle/remove', { name: d.remove }).catch(fail); await load(); }
    };
    $('#rf-people').onclick = async (e) => {
      const d = e.target.dataset;
      if (d.edit) return void edit(d.edit);
      if (d.drop && confirm(`¿Quitar a ${d.drop} de la lista? Ya no podrá salir sorteado.`)) { await api('POST', '/api/people/remove', { name: d.drop }).catch(fail); await load(); }
    };
    $('#rf-reset').onclick = async () => { await api('POST', '/api/raffle/reset').catch(fail); await load(); };
    $('#rf-clear').onclick = async () => {
      if (!confirm('¿Vaciar la lista de participantes? Se borran también los concursantes elegidos.')) return;
      await api('DELETE', '/api/people').catch(fail);
      await load();
    };
    $('#rf-create').onclick = async () => {
      try {
        const w = await api('POST', '/api/wheels', { name: 'El Rosco', players: picked });
        location.hash = `#/ruedactl/${w.id}`;
      } catch (err) { fail(err); }
    };
    await load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  };

  // ---------- Pantalla de OBS ----------
  views.sorteo = async () => {
    document.body.classList.add('obs', 'raffle-screen');
    app.innerHTML = `<div id="rf"><div class="rf-title">Sorteo de concursantes</div>
      <div class="rf-stage" id="rf-stage"></div><div class="rf-picked" id="rf-list"></div></div>`;
    let shownRoll = 0; // sorteo cuya animación ya se inició
    let spin = null;
    const confetti = () => {
      const colors = ['#ff4fa3', '#ff9a3d', '#ffe14d', '#3fe08f', '#35c6ff', '#9b5cff'];
      return `<div class="confetti">${Array.from({ length: 50 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 2).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s"></i>`).join('')}</div>`;
    };
    const list = (names) => { $('#rf-list').innerHTML = names.map((n, i) => `<span><b>${i + 1}</b>${esc(n)}</span>`).join(''); };
    const reveal = (st, celebrate) => {
      $('#rf-stage').innerHTML = `${celebrate ? confetti() : ''}<div class="rf-card win ${celebrate ? 'pop' : ''}"><span class="rf-kicker">🎉 ¡A jugar El Rosco!</span><span class="rf-name">${esc(st.roll.winner)}</span></div>`;
      list(st.picked);
    };
    const poll = async () => {
      const st = await api('GET', '/api/raffle').catch(() => null);
      if (!st) return;
      if (!st.roll) {
        clearTimeout(spin); spin = null; shownRoll = 0;
        $('#rf-stage').innerHTML = `<div class="rf-card"><span class="rf-kicker">${st.pool} participantes</span><span class="rf-name small">¿Quién jugará El Rosco?</span></div>`;
        list(st.picked);
        return;
      }
      if (st.roll.at === shownRoll) { if (!spin) list(st.picked); return; }
      shownRoll = st.roll.at;
      clearTimeout(spin); spin = null;
      const left = st.rollMs - (st.now - st.roll.at);
      if (left <= 200) { reveal(st, false); return; } // ya había terminado: se muestra el resultado sin animar
      // Mientras gira no se muestra todavía al elegido en la lista de abajo
      list(st.picked.filter((n) => n !== st.roll.winner));
      $('#rf-stage').innerHTML = '<div class="rf-card rolling"><span class="rf-kicker">Sorteando…</span><span class="rf-name" id="rf-roll"></span></div>';
      let i = 0;
      const end = Date.now() + left;
      const tick = () => {
        const remaining = end - Date.now();
        if (remaining <= 0) { spin = null; reveal(st, true); return; }
        const el = $('#rf-roll');
        if (el) el.textContent = st.roll.names[i++ % st.roll.names.length];
        // rápido al comienzo (70 ms por nombre) y cada vez más lento en el último segundo y medio
        spin = setTimeout(tick, remaining > 1500 ? 70 : 70 + (1500 - remaining) / 4);
      };
      tick();
    };
    await poll();
    const timer = setInterval(poll, 700);
    return () => { clearInterval(timer); clearTimeout(spin); document.body.classList.remove('obs', 'raffle-screen'); };
  };
})();
