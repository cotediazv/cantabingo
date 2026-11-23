//@ Vistas: proyectos, crear sala, Juegos, figura y panel del bingo. Parte de la aplicación: se carga en orden desde index.html.
views.proyectos = async () => {
  const list = await api('GET', '/api/projects');
  const fmt = { numbers: 'Números', words: 'Palabras', emojis: 'Emojis' };
  app.innerHTML = `
    <p class="back"><a href="#/">← Inicio</a></p><div class="row between" style="margin-bottom:16px"><h1>Bingo · Mis proyectos</h1><a class="btn primary" href="#/nuevo">⊕ Nuevo proyecto de bingo</a></div>
    <div class="panel scroll-x">${list.length ? `<table class="list">
      <tr><th>Proyecto</th><th>Formato</th><th>Cartones</th><th>Estado</th><th></th></tr>
      ${list.map((p) => `<tr>
        <td><b>${esc(p.name)}</b><br><span class="muted small">${new Date(p.created).toLocaleDateString('es')}</span></td>
        <td>${fmt[p.format]}${p.format === 'numbers' ? ` 1–${p.values}` : ''}</td><td>${p.count}</td>
        <td>${p.sessionId ? '<span class="tag live">Generador activo</span>' : '<span class="tag">Listo</span>'}</td>
        <td><div class="row"><a class="btn primary" href="#/anfitrion/${p.id}">${p.sessionId ? 'Abrir' : 'Iniciar'}</a>
          <button class="danger" data-del="${p.id}">Eliminar</button></div></td></tr>`).join('')}
    </table>` : '<p>Aún no tienes proyectos. Crea el primero para generar tus cartones.</p>'}</div>
    <p class="muted small">Tus proyectos quedan asociados a este navegador.</p>`;
  app.onclick = async (e) => {
    const del = e.target.dataset.del;
    if (del && confirm('¿Eliminar este proyecto y sus cartones?')) { await api('DELETE', `/api/projects/${del}`).catch(fail); views.proyectos(); }
  };
};

views.nuevo = async () => {
  if (!(await isAdmin())) return viewLogin();
  // Una sola sala a la vez
  if ((await activeSessions()).length) { toast('Ya hay una sala abierta: ciérrala en el Centro de control para crear otra'); location.hash = '#/'; return undefined; }
  app.innerHTML = `
    ${BACK}<h1>Nuevo proyecto de bingo</h1>
    <form class="panel fields" id="f">
      <div class="wide">
        <span class="f" style="margin-bottom:6px">¿Qué bingo es?</span>
        <div class="seg" id="venues" role="tablist">
          <button type="button" role="tab" data-venue="frida" class="on">Frida</button>
          <button type="button" role="tab" data-venue="tobalaba">Tobalaba</button>
          <button type="button" role="tab" data-venue="kennedy">Mercado Kennedy</button>
          <button type="button" role="tab" data-venue="new">Otro nombre</button>
        </div>
        <p class="muted small" id="venue-note" style="margin-top:8px"></p>
        <input type="hidden" name="theme" value="frida">
      </div>
      <label class="f" id="pname-wrap" hidden>Nombre del bingo<input type="text" name="name" maxlength="60" value="Los Juegos de Frida"></label>
      <label class="f" id="ptheme-wrap" hidden>Colores en pantalla<select id="ptheme">
        <option value="frida">Magenta (como Frida)</option><option value="tobalaba">Rojo (como Tobalaba)</option><option value="kennedy">Celeste azulado (como Mercado Kennedy)</option></select></label>
      <label class="f">Número de cartones <span class="hint">de 25 a 3.000</span><input type="number" name="count" min="25" max="3000" value="320" required></label>
      <div class="wide"><button class="primary big">Crear los cartones</button></div>
    </form>`;
  const f = $('#f');
  // Pestañas de local: cada una fija el nombre y los colores de la pantalla; «Otro nombre» deja elegirlos
  const VENUES = { frida: ['Los Juegos de Frida', 'magenta'], tobalaba: ['Los Juegos de Tobalaba', 'rojo'], kennedy: ['Los Juegos de Mercado Kennedy', 'celeste azulado'] }; // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)
  const pickVenue = (v) => {
    $$('#venues button').forEach((b) => { b.classList.toggle('on', b.dataset.venue === v); b.setAttribute('aria-selected', b.dataset.venue === v); });
    const custom = v === 'new';
    $('#pname-wrap').hidden = !custom;
    $('#ptheme-wrap').hidden = !custom;
    if (custom) { f.name.value = ''; f.theme.value = $('#ptheme').value; $('#venue-note').textContent = 'Escribe el nombre y elige los colores de la pantalla.'; f.name.focus(); }
    else { f.name.value = VENUES[v][0]; f.theme.value = v; $('#venue-note').textContent = `Se llamará «${VENUES[v][0]}» y la pantalla saldrá en ${VENUES[v][1]}.`; }
  };
  $('#venues').onclick = (e) => { const v = e.target.dataset.venue; if (v) pickVenue(v); };
  $('#ptheme').onchange = (e) => { f.theme.value = e.target.value; };
  pickVenue('frida');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    // Bingo clásico fijo: números del 1 al 75, encabezado BINGO, casilla central con valor y cartones desde el n.º 1
    const body = { name: d.name, theme: d.theme, count: d.count, format: 'numbers', values: 75, headers: 'BINGO', freeCenter: false, startNumber: 1 };
    // Pedido de Cote (21 nov): la sala ya no parte con el bingo. Se abre de inmediato y se va a Juegos (sortear o elegir)
    try {
      const p = await api('POST', '/api/projects', body);
      try {
        await api('POST', `/api/projects/${p.id}/session`, { name: p.name, theme: p.theme || 'frida', password: '', cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] });
      } catch (err) { await api('DELETE', `/api/projects/${p.id}`).catch(() => {}); throw err; } // si la sala no se abrió, no queda un proyecto suelto
      store.set('lastBingo', p.id);
      location.hash = '#/juegos';
    } catch (err) { fail(err); if ((await activeSessions()).length) location.hash = '#/juegos'; }
  };
};

// Juegos (pedido de Cote, 21 nov): la sala parte aquí, sin bingo. Arriba la sala y el QR de entrada; abajo el menú de
// juegos con las pestañas «Sortear juegos» / «Elegir libremente»
views.juegos = async () => {
  if (!(await isAdmin())) return viewLogin();
  const open = (await activeSessions())[0];
  if (!open) { location.hash = '#/'; return undefined; }
  store.set('lastBingo', open.projectId);
  // Pedido de Cote (21 nov): al crear la sala, tres botones y nada más (Manual, Por sorteo, Por votación)
  app.innerHTML = `<p class="back"><a href="#/">← Inicio</a></p><div id="jg-cur"></div>${activitiesNav('', { lobby: true })}`;
  const venue = open.theme || 'frida';
  const paint = async () => {
    const st = await api('GET', `/api/sessions/${open.id}/host/state`).catch((err) => (err.status === 404 ? 'cerrada' : null));
    if (st === 'cerrada' && $('#jg-cur')) { location.hash = '#/'; return; } // la sala se cerró (a mano o sola a la hora de término)
    if (!st || !$('#jg-cur')) return;
    // Si hay un juego en curso, se vuelve a él con un botón grande y el menú queda plegado (para no sortear otro por error)
    const cur = st.current;
    const info = cur && GAME_INFO(venue)[cur.game];
    const href = !cur ? '' : cur.game === 'bingo' ? `#/anfitrion/${open.projectId}` : cur.wheel ? `#/ruedactl/${cur.wheel}` : info.href;
    const html = cur ? `<a class="home-create open ctl-go paso" data-paso="8" href="${href}"><span>▶</span>Volver al juego en curso: ${info.icon} ${esc(info.name)}</a>` : '';
    if ($('#jg-cur').innerHTML !== html) $('#jg-cur').innerHTML = html;
    window.setNavFold(!!cur);
  };
  await paint();
  const t = setInterval(() => { paint(); paintGameNav(); }, 4000); // también lo que se haga desde otro equipo (iPad)
  return () => clearInterval(t);
};
// Figura del bingo cuando el bingo sale en el sorteo o se elige (antes del primer número)
views.figura = async (pid) => {
  if (!(await isAdmin())) return viewLogin();
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) { location.hash = '#/'; return undefined; }
  const info = await api('GET', `/api/sessions/${p.sessionId}/host`);
  if (info.roundOver) { location.replace(`#/ronda/${pid}`); return undefined; }
  if (info.started) { location.replace(`#/anfitrion/${pid}`); return undefined; }
  app.innerHTML = `<p class="back"><a href="#/juegos">← Juegos</a></p><h1>${esc(bingoName(p.name))}</h1>
    <form class="panel" id="f"><h2>¿Qué figura se juega?</h2>${patternPicker(info.patterns)}
      <button class="primary big paso">Empezar el bingo</button></form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const patterns = readPatterns(e.target);
    if (!patterns) return;
    try {
      await api('POST', `/api/sessions/${p.sessionId}/host/patterns`, { patterns });
      await api('POST', '/api/stage', { show: 'bingo' }).catch(() => {});
      location.hash = `#/anfitrion/${pid}`;
    } catch (err) {
      fail(err);
      if (/ya empezó/.test(err.message)) location.hash = `#/anfitrion/${pid}`; // otro equipo ya sacó un número: se sigue en el panel
    }
  };
  return undefined;
};
views.anfitrion = async (pid) => {
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) return hostSetup(p);
  // El panel del bingo se abre cuando el bingo empezó (figura elegida); antes se elige la figura
  const info = await api('GET', `/api/sessions/${p.sessionId}/host`).catch(() => null);
  if (info && !info.started && !info.roundOver) { location.replace(`#/figura/${pid}`); return undefined; } // sin quedar en el historial
  return hostConsole(p);
};

// Proyecto sin sala (desde «Mis proyectos»): se abre la sala y se va a Juegos, sin bingo (pedido de Cote, 21 nov)
function hostSetup(p) {
  app.innerHTML = `
    ${BACK}<h1>${esc(p.name)}</h1>
    <form class="panel" id="f">
      <p class="muted small">${p.cards.length} cartones, uno por participante.</p>
      <button class="primary big">🎮 Crear sala de juegos</button>
    </form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', `/api/projects/${p.id}/session`, { name: p.name, theme: p.theme || 'frida', password: '', cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] });
      store.set('lastBingo', p.id);
      location.hash = '#/juegos';
    } catch (err) { fail(err); }
  };
}

// Panel del bingo en curso: solo lo que el animador usa durante el juego.
// Enlaces, QR, textos de la gráfica y cierre de sesión están en «Administración».
// Instrucciones y criterios para el animador, al partir cada juego (pedido de Cote): cortas y precisas, para leer en voz alta
window.readAloud = (game, lines) => `<details class="panel howto" open><summary>📢 Instrucciones · ${esc(game)}</summary><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></details>`;
// Pedido de Cote (20 nov): las instrucciones en pantalla van ordenadas, cada una en su línea, sin pasarse para abajo:
// si no cabe en el ancho de la pantalla, se achica la letra
window.fitOneLine = (el, min = 9) => {
  if (!el || !el.isConnected) return;
  el.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(el).fontSize) || 20;
  while (el.scrollWidth > el.clientWidth + 1 && fs > min) { fs -= 1; el.style.fontSize = `${fs}px`; }
};
// Instrucciones de El Rosko: las usan el panel (wheel-ui.js) y los celulares
window.ROSCO_HOWTO = [
  '3 participantes.',
  'Todos juegan desde las mesas.',
  '<b>Premio mayor</b> para el que gana El Rosko.',
  '<b>Premio especial</b> para el ganador del público que juega la Trivia del Rosko.',
];
const BINGO_HOWTO = [
  'Todos juegan desde las mesas, con su cartón en el celular.',
  'Gana quien complete primero la <b>figura</b>.',
  'Empate: sorteo.',
]
async function hostConsole(p) {
  const sid = p.sessionId;
  store.set('lastBingo', p.id); // para el botón «Volver al bingo» del sorteo y del rosko
  const act = (action, body) => api('POST', `/api/sessions/${sid}/host/${action}`, body || {}).catch(fail);
  let st = null;
  let manual = false;
  let spoken = -1;
  app.innerHTML = `
    <div id="host-bingo"><p class="back"><a href="#/">← Inicio</a></p>
      <div class="panel"><h1 id="title"></h1><div id="meta" class="muted"></div><div id="pats" style="margin-top:10px"></div></div>
      ${window.readAloud('Bingo', BINGO_HOWTO)}
      <div class="cols">
        <div class="panel">
          <div id="draws"></div>
          <div class="win-alert" id="results-panel" hidden>
            <h2 id="results-title"></h2>
            <div id="results"></div>
            <div id="final"></div>
            <div id="tie-result"></div>
            <p class="tie-hint" id="tie-hint" hidden>Hay un empate: primero desempata por sorteo.</p>
            <button class="primary paso" data-paso="1" id="tiebreak" hidden>🎲 Desempatar por sorteo</button>
            <div class="win-actions" id="win-actions" hidden>
              <button id="confirmwin" class="paso" data-paso="2">✔ Confirmar ganador</button>
              <button id="keepplaying">▶ Seguir jugando</button>
            </div>
            <div id="win-confirmed" hidden>${activitiesNav('bingo')}</div>
          </div>
          <div class="row" style="justify-content:center;margin-top:16px"><button id="bigqr"></button></div>
          <div class="row" style="justify-content:center;margin-top:12px"><button class="primary big paso" id="gen">Generar un número</button></div>
          <div class="row" style="justify-content:center;margin-top:14px">
            <label class="small" hidden>Pausa <input type="number" id="interval" min="5" max="60" value="10" style="width:70px"> s</label>
            <label class="check" hidden><input type="checkbox" id="stop" checked> Detener al completarse un cartón</label>
            <button id="auto" hidden>▶ Modo automático</button>
          </div>
          <div class="row" style="justify-content:center;margin-top:10px">
            <button id="manual">Selección manual</button>
            <label class="check" hidden><input type="checkbox" id="voice" ${voiceOn ? 'checked' : ''}> Voz</label>
          </div>
        </div>
        <div class="panel"><h2 id="count"></h2><div id="board"></div><h2 class="ord-title">Orden de salida</h2><div id="history" class="history"></div></div>
      </div>
      <div id="win-ann"></div>
      ${activitiesNav('bingo')}
      <p class="small" style="text-align:center;margin-top:22px"><a href="#/admin/${p.id}">⚙️ Administración</a></p>
    </div>`;
  const render = () => {
    $('#title').textContent = bingoName(st.name);
    const mins = Math.max(0, Math.round((st.expires - Date.now()) / 60000));
    $('#meta').textContent = `Ronda ${st.round} · ${st.players} participantes · ${st.players * st.cardsPerPlayer} de ${st.totalCards} cartones repartidos · quedan ${Math.floor(mins / 60)} h ${mins % 60} min`;
    $('#pats').innerHTML = patternsInline(st.patterns); // figura de la ronda, a la vista del animador
    $('#draws').innerHTML = drawsHTML(st, st.drawn);
    $('#count').textContent = `Tablero · ${st.drawn.length} de ${st.values}`;
    $('#board').innerHTML = boardHTML(st, st.drawn, manual);
    // Pedido de Cote (20 nov): el tablero no va en el panel del animador; aparece solo con «Selección manual», para tocar el número
    $('#count').style.display = manual ? '' : 'none';
    $('#board').style.display = manual ? '' : 'none';
    $('#history').innerHTML = st.drawn.map((v) => `<span>${esc(plain(st, v))}</span>`).join('') || '<span class="muted">Aún no se ha generado ningún valor.</span>';
    $('#gen').disabled = st.drawn.length >= st.values || st.auto.on || st.winConfirmed; // ganador confirmado = sorteo terminado
    $('#auto').disabled = !!st.winConfirmed;
    $('#gen').textContent = st.winConfirmed ? 'Sorteo terminado' : 'Generar un número';
    $('#gen').classList.toggle('paso', !st.winConfirmed); // con el ganador confirmado ya no es el paso que sigue
    $('#auto').textContent = st.auto.on ? '⏸ Detener automático' : '▶ Modo automático';
    $('#auto').classList.toggle('on', st.auto.on);
    $('#manual').classList.toggle('on', manual);
    $('#bigqr').classList.toggle('on', st.bigQr);
    $('#bigqr').textContent = st.bigQr ? '📱 QR grande en pantalla: quitar' : '📱 Mostrar QR grande en pantalla';
    // Los ganadores van arriba de todo; primero los ya validados
    const results = st.results.filter((r) => !r.dismissed).sort((a, b) => Number(b.validated) - Number(a.validated) || a.at - b.at);
    const won = results.filter((r) => r.validated).length;
    $('#results-panel').hidden = !results.length;
    $('#results-panel').classList.toggle('won', won > 0);
    $('#results-title').textContent = won ? (won === 1 ? '🏆 ¡HAY UN GANADOR!' : `🏆 ¡HAY ${won} GANADORES!`) : 'Hay cartones por completar';
    // Ganadores en grande; debajo, quienes ya completaron la figura pero aún no marcan su cartón
    $('#results').innerHTML = `<div class="win-names">${results.filter((r) => r.validated).map((r) => `<span><b>${esc(r.name)}</b><small>Cartón #${p.startNumber + r.cardNo - 1}${r.place ? ` · 📍 ${esc(r.place)}` : ''}</small></span>`).join('')}</div>
      ${results.filter((r) => !r.validated).map((r) => `<p class="win-pending">${esc(r.name)} · cartón #${p.startNumber + r.cardNo - 1} · le falta marcar</p>`).join('')}`;
    // Con dos o más ganadores se puede desempatar con la tómbola en pantalla
    const winners = new Set(results.filter((r) => r.validated).map((r) => r.cardNo)).size;
    $('#tiebreak').hidden = winners < 2;
    const tied = winners >= 2;
    $('#tiebreak').textContent = st.tieWinner ? '🎲 Volver a desempatar' : '🎲 Desempatar por sorteo';
    // El resultado se muestra al animador cuando la tómbola ya terminó en pantalla
    const tieDone = st.tieWinner && Date.now() - st.tieWinner.at >= st.rollMs;
    $('#tie-result').innerHTML = !st.tieWinner ? '' : tieDone ? `<p class="tie-won">Ganador del desempate<b>${esc(st.tieWinner.name)}</b><small>Cartón #${p.startNumber + st.tieWinner.cardNo - 1}</small></p>` : '<p class="tie-won">Sorteando en pantalla…</p>';
    if (st.tieWinner && !tieDone) setTimeout(() => st && render(), st.rollMs - (Date.now() - st.tieWinner.at) + 100);
    // Dos opciones ante un ganador: confirmarlo o seguir jugando
    const pending = results.filter((r) => r.validated && !r.confirmed).length;
    const confirmed = won > 0 && pending === 0;
    // Con empate, primero se desempata: «Confirmar» aparece recién cuando la tómbola ya eligió a uno
    const rolling = st.tieWinner && !tieDone;
    $('#win-actions').hidden = !pending || rolling;
    $('#confirmwin').hidden = tied && !tieDone;
    $('#win-actions').classList.toggle('single', tied && !tieDone);
    $('#confirmwin').textContent = '✔ Confirmar ganador';
    $('#tie-hint').hidden = !(tied && !st.tieWinner);
    $('#win-confirmed').hidden = !confirmed;
    // Pedido de Cote (20 nov): con el ganador aceptado, desaparece todo lo del bingo y queda solo lo que viene (el menú
    // de juegos con el sorteo)
    const done = $('#host-bingo');
    if (done && done.classList.contains('bingo-done') !== confirmed) { done.classList.toggle('bingo-done', confirmed); if (confirmed) window.scrollTo(0, 0); }
    // Las instrucciones se leen al empezar: desaparecen con el primer número (pedido de Cote)
    if (done) done.classList.toggle('bingo-started', st.drawn.length > 0);
    window.setNavFold(st.drawn.length > 0 && !confirmed);
    const confirmedWins = results.filter((r) => r.validated && r.confirmed);
    const annKey = confirmed ? JSON.stringify(confirmedWins.map((r) => [r.name, r.cardNo])) : '';
    if ($('#win-ann').dataset.k !== annKey) {
      $('#win-ann').dataset.k = annKey;
      $('#win-ann').innerHTML = confirmed ? window.annHtml(confirmedWins.length > 1 ? '🏆 ¡Bingo! Ganaron' : '🏆 ¡Bingo! Ganó', confirmedWins.map((r) => r.name || 'Participante'),
        [`Cartón ${confirmedWins.map((r) => `#${p.startNumber + r.cardNo - 1}`).join(' · ')}${confirmedWins.length === 1 && confirmedWins[0].place ? ` · 📍 ${confirmedWins[0].place}` : ''}`, `Figura: ${(PATTERNS.byId[st.patterns[0]] || {}).name || ''}`]) : '';
    }
    $('#final').innerHTML = st.finalists ? `<p><b>Selección final:</b> ${st.finalists.map((c) => '#' + (p.startNumber + c - 1)).join(', ') || 'no hay cartones validados'}</p>` : '';
    if (st.drawn.length !== spoken) { if (spoken >= 0 && st.drawn.length > spoken) speak(speakText(st, st.drawn.at(-1))); spoken = st.drawn.length; }
  };
  $('#gen').onclick = () => act('draw');
  $('#confirmwin').onclick = () => act('confirmwin');
  $('#keepplaying').onclick = () => act('keepplaying');
  $('#tiebreak').onclick = () => api('POST', '/api/raffle/tiebreak', { sid }).catch(fail);
  $('#auto').onclick = () => act('auto', { on: !st.auto.on, interval: Number($('#interval').value), stopOnWin: $('#stop').checked });
  $('#manual').onclick = () => { manual = !manual; render(); };
  $('#bigqr').onclick = () => act('bigqr', { on: !st.bigQr });
  $('#voice').onchange = (e) => { voiceOn = e.target.checked; store.set('voice', voiceOn ? '1' : '0'); };
  $('#board').onclick = (e) => { const v = e.target.dataset.v; if (manual && v && !st.drawn.includes(Number(v))) act('draw', { value: Number(v) }); };
  const off = subscribe(sid, (s) => { st = s; render(); }, () => { location.hash = '#/'; }, true);
  const tick = setInterval(() => st && render(), 60000);
  return () => { off(); clearInterval(tick); };
}

// Siguiente ronda: se vuelve a elegir la figura y el sorteo parte de cero.
// Los participantes conservan su cartón.
views.ronda = async (pid) => {
  if (!(await isAdmin())) return viewLogin();
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) { location.hash = `#/anfitrion/${pid}`; return undefined; }
  const info = await api('GET', `/api/sessions/${p.sessionId}/host`);
  const next = info.round + 1;
  app.innerHTML = `<p class="back"><a href="#/anfitrion/${pid}">← Volver al bingo anterior</a></p><h1>${esc(p.name)}</h1>
    <form class="panel" id="f">
      <h2>Ronda ${next}: ¿qué figura se juega?</h2>
      ${patternPicker(info.patterns)}
      <p class="muted small">Se borran los números sorteados y las marcas de la ronda ${info.round}. Cada participante sigue con su mismo cartón.</p>
      <button class="primary big paso">Iniciar la ronda ${next}</button>
    </form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const patterns = readPatterns(e.target);
    if (!patterns) return;
    try { await api('POST', `/api/sessions/${p.sessionId}/host/restart`, { patterns }); location.hash = `#/anfitrion/${pid}`; } catch (err) { fail(err); }
  };
  return undefined;
};

// Administración del bingo en curso: lo que no se usa durante el juego
views.admin = async (pid) => {
  if (!(await isAdmin())) return viewLogin();
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) { location.hash = `#/anfitrion/${pid}`; return undefined; }
  const sid = p.sessionId;
  const info = await api('GET', `/api/sessions/${sid}/host`);
  const act = (action, body) => api('POST', `/api/sessions/${sid}/host/${action}`, body || {});
  app.innerHTML = `<p class="back"><a href="#/anfitrion/${pid}">← Volver al bingo</a></p><h1>Administración</h1>
    <div class="panel"><h2>Enlaces y código QR</h2>
      <div class="row between"><div class="small">
        <b>Participantes:</b> <a class="link" href="${joinUrl()}" target="_blank">${esc(joinUrl())}</a><br>
        <b>Pantalla de OBS:</b> <a class="link" href="${stageUrl()}" target="_blank">${esc(stageUrl())}</a><br>
        <b>Tablero para el DJ:</b> <a class="link" href="${boardUrl()}" target="_blank">${esc(boardUrl())}</a><br>
        <b>Contraseña:</b> ${info.password ? esc(info.password) : '<i>sin contraseña</i>'}</div>${qr(joinUrl())}</div></div>
    <div class="panel"><h2>Textos de la gráfica de OBS</h2>
      <div class="fields" style="margin-top:10px">
        <label class="f">Franja superior<input type="text" id="gc-top" maxlength="90" value="${esc(info.gc.top)}" placeholder="Escanea el código QR con tu celular y participa"></label>
        <label class="f">Franja inferior<input type="text" id="gc-bottom" maxlength="140" value="${esc(info.gc.bottom)}" placeholder="Pon tu nombre, apellido y participa"></label>
      </div>
      <p class="muted small" style="margin-top:8px">En la franja inferior, lo que escribas entre asteriscos sale resaltado en amarillo: <b>*CONTRASEÑA: 1234*</b></p>
      <p style="margin-top:10px"><button id="gc-save">Guardar textos</button></p></div>
    <div class="panel"><h2>Selección final</h2>
      <p class="muted small">Si hay varios ganadores, elige al azar cuántos cartones conservar. El resultado aparece en el panel del bingo.</p>
      <div class="row"><label class="small">Conservar <input type="number" id="keep" min="1" value="1" style="width:80px"> cartones</label><button id="finalbtn">Elegir al azar</button></div></div>
    <div class="panel"><h2>Cerrar la sesión</h2>
      <p class="muted small">Termina el bingo para todos: se pierden los cartones repartidos y los participantes tendrán que volver a entrar.</p>
      <button class="danger" id="close">Cerrar la sesión</button></div>`;
  $('#gc-save').onclick = async () => { try { await act('gc', { top: $('#gc-top').value, bottom: $('#gc-bottom').value }); toast('Textos de la gráfica guardados'); } catch (err) { fail(err); } };
  $('#finalbtn').onclick = async () => { try { await act('final', { keep: Number($('#keep').value) || 1 }); toast('Selección hecha: mírala en el panel del bingo'); } catch (err) { fail(err); } };
  $('#close').onclick = async () => { if (confirm('¿Cerrar la sesión para todos?')) { await act('close').catch(fail); store.del('lastBingo'); location.hash = '#/'; } };
  return undefined;
};

views.sesiones = async () => {
  const list = await api('GET', '/api/sessions');
  app.innerHTML = `${BACK}<h1>Sesiones activas</h1>
    <div class="panel scroll-x">${list.length ? `<table class="list"><tr><th>Sesión</th><th>Ronda</th><th></th></tr>
      ${list.map((s) => `<tr><td><b>${esc(s.name)}</b> ${s.locked ? '🔒' : ''}</td><td>${s.round}</td>
        <td><div class="row"><a class="btn primary" href="#/jugar/${s.id}">Unirse</a><a class="btn" href="#/tablero/${s.id}">Tablero</a></div></td></tr>`).join('')}</table>`
    : '<p>No hay sesiones públicas activas en este momento. Si tu anfitrión te dio un enlace o un código QR, úsalo para entrar.</p>'}</div>`;
};

