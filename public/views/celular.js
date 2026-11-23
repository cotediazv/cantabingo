//@ Vista: celular del público (#/jugar), con lo que muestra en cada juego. Parte de la aplicación: se carga en orden desde index.html.
views.jugar = async (sid) => {
  if (!sid) { const r = await pickSession('jugar'); if (!r.sid) return r.cleanup; sid = r.sid; }
  const backToStart = () => { if (location.hash === '#/jugar') route(); else location.hash = '#/jugar'; };
  const key = `tok_${sid}`;
  let me = null;
  const token = store.get(key);
  if (token) me = await api('POST', `/api/sessions/${sid}/join`, { token, vid: window.vid() }).catch(() => null);
  if (!me) {
    let info;
    try { info = await api('GET', `/api/sessions/${sid}`); } catch { backToStart(); return undefined; }
    app.innerHTML = `<form class="panel" id="f" style="max-width:460px;margin:0 auto">
      <h1>${esc(info.name)}</h1><p class="muted">Recibirás ${info.cardsPerPlayer} ${info.cardsPerPlayer > 1 ? 'cartones' : 'cartón'} en este dispositivo. No necesitas cuenta.</p>
      <div class="fields" style="grid-template-columns:1fr">
        <label class="f">Nombre<input type="text" name="name" maxlength="20" autocomplete="given-name" autocapitalize="words" value="${esc(store.get('playerFirst') || '')}" required autofocus></label>
        <label class="f">Apellido<input type="text" name="surname" maxlength="25" autocomplete="family-name" autocapitalize="words" value="${esc(store.get('playerLast') || '')}" required></label>
        ${info.places && info.places.length ? `<label class="f">¿Dónde estás?<select name="place" required><option value="">Elige tu lugar</option>${info.places.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>` : ''}
        ${info.locked ? '<label class="f">Contraseña de la sesión<input type="text" name="password" required></label>' : ''}
        <button class="primary big">Unirse</button>
      </div></form>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', `/api/sessions/${sid}/join`, { ...Object.fromEntries(new FormData(e.target)), vid: window.vid() });
        store.set(key, r.token);
        store.set('playerFirst', e.target.name.value.trim());
        store.set('playerLast', e.target.surname.value.trim());
        route();
      } catch (err) { if (err.status === 404) backToStart(); else fail(err); }
    };
    // Si el moderador cierra este bingo mientras la persona escribe su nombre, se la lleva al bingo vigente
    refreshOnShow = true;
    const gone = setInterval(async () => { const r = await fetch(`/api/sessions/${sid}`).catch(() => null); if (r && r.status === 404) backToStart(); }, 5000);
    return () => { clearInterval(gone); refreshOnShow = false; };
  }
  let st = null;
  let round = null;
  const marks = Object.fromEntries(me.cards.map((c) => [c.no, new Set(c.marks)]));
  const maskOf = (c) => [...marks[c.no]].reduce((m, i) => m | (1 << i), c.cells[12] === 0 ? 1 << 12 : 0);
  app.innerHTML = `<div id="bingo-top"><div class="now" id="now"></div>
    <div id="banner"></div>
    <div class="cards" id="cards"></div></div>
    <div class="prosco" id="prosco" hidden></div>
    <div class="pkar" id="pkar" hidden></div>
    ${KRB.cajasCelular()}
    <div class="pvote pact" id="pact" hidden></div>
    <div id="bingo-bottom"><button class="primary big" id="sync" style="margin-top:16px">↻ Actualizar y marcar lo que falta</button>
    <p class="muted small" style="margin-top:8px">Marca por ti los valores ya anunciados que se te pasaron.</p>
    <div class="panel" style="margin-top:20px"><h2 id="title" style="margin:0"></h2><span class="muted small" id="meta"></span><div id="pats" style="margin-top:8px"></div></div></div>
    <div class="live" id="live"><div id="live-player"></div>
      <div class="live-bar"><button type="button" id="live-audio">🔇 Activar audio</button><button type="button" id="live-full">⛶ Pantalla completa</button><button type="button" id="live-sync" class="wide">↻ Poner al día el video</button></div></div>
    <div id="kids-slot">${window.krbKidsButton ? window.krbKidsButton() : '<a class="btn kids-entry" href="#/kids">🧸 <b>KRB Kids</b><span>Zona de niños</span></a>'}</div>`;
  // Durante El Rosko: se guarda el cartón y quedan el video y, debajo, la pregunta en juego
  let roscoEs = null;
  let roscoId = null;
  let rosco = null;
  let roscoTick = null;
  const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const roscoLeft = () => {
    const c = rosco.players[rosco.turn];
    return rosco.runningSince ? c.remainingMs - (Date.now() - rosco.gotAt + rosco.now - rosco.runningSince) : c.remainingMs;
  };
  // Rosko en línea: lo que esta persona respondió (pregunta → alternativa), en orden, y su puntaje
  let crowdMine = {};
  let crowdOrder = [];
  let crowdInfo = null;
  let crowdTimer = null;
  const loadCrowd = async () => {
    if (!roscoId) return;
    const r = await api('GET', `/api/wheels/${roscoId}/crowd?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(me.token)}`).catch(() => null);
    if (!r || !rosco) return;
    crowdInfo = r;
    for (const [k, t] of Object.entries(r.mine)) { if (!(k in crowdMine)) crowdOrder.push(k); crowdMine[k] = t; }
    drawRosco();
  };
  // Tras cada novedad del escenario se vuelve a pedir el puntaje, con una pequeña espera distinta en cada celular
  const crowdSoon = () => { clearTimeout(crowdTimer); crowdTimer = setTimeout(loadCrowd, 500 + Math.random() * 1500); };
  const crowdHTML = () => {
    if (rosco.crowdWinner) return ''; // el ganador de la Trivia ya sale arriba (crowdWin), una sola vez
    const cq = rosco.winner || rosco.finished ? null : rosco.crowd;
    const sent = cq && crowdMine[cq.key];
    // Al tocar, la alternativa elegida se pone verde con ✔ si es correcta o roja con ✘ si no lo es
    const mark = (o) => (!sent || o !== sent.text ? '' : sent.ok === true ? 'ok' : sent.ok === false ? 'ko' : 'wait');
    const sign = (o) => (mark(o) === 'ok' ? '✔ ' : mark(o) === 'ko' ? '✘ ' : '');
    const play = !cq ? '' : `<div class="pcrowd ${sent ? 'done' : ''}"><small>${sent ? (sent.ok === true ? '¡Correcto!' : sent.ok === false ? 'Esta vez no' : 'Enviando…') : 'Juega tú también: mientras más rápido, más puntos'}</small>
      ${cq.options.map((o) => `<button type="button" class="${mark(o)}" data-crowd="${esc(o)}" data-key="${cq.key}" ${sent ? 'disabled' : ''}>${sign(o)}${esc(o)}</button>`).join('')}</div>`;
    return play;
  };
  const drawRosco = () => {
    if (!rosco) { $('#prosco').innerHTML = '<p class="muted">Cargando El Rosko…</p>'; return; }
    const c = rosco.players[rosco.turn];
    const reveal = ''; // en el celular no se muestra la respuesta correcta: solo si la propia alternativa fue verde o roja
    // Pedido de Cote (21 nov): el ganador de la Trivia del Rosko también en los celulares (y si es esta persona, ¡ganaste!)
    const cw = rosco.crowdWinner;
    const crowdWin = cw ? (cw.none ? '<div class="prosco-win">🏅 Trivia del Rosko<small>Esta vez nadie sumó puntos</small></div>'
      : `<div class="prosco-win">🏅 ${esc(cw.name)}<small>${String(cw.name).toLowerCase() === String(me.name || '').toLowerCase() ? '¡Ganaste la Trivia del Rosko!' : '¡Ganó la Trivia del Rosko!'} ${cw.score} puntos</small></div>`) : '';
    const body = crowdWin + (rosco.winner ? `<div class="prosco-win">🏆 ${esc(rosco.winner.name)}<small>${rosco.winner.full ? '¡Completó el rosko!' : '¡Ganó El Rosko!'}</small></div>`
      : rosco.tie ? `<div class="prosco-wait">Empate entre ${rosco.tie.names.map(esc).join(' y ')}. Se define por sorteo.</div>`
      : rosco.finished ? '<div class="prosco-wait">Juego terminado</div>'
      : `<div class="prosco-q"><span class="prosco-letter">${esc(rosco.letters[c.current])}</span>
          <p>${rosco.question ? esc(rosco.question) : '<span class="muted">Esperando la siguiente pregunta…</span>'}</p></div>`);
    // Los 5 primeros del público con su puntaje y, en la sexta fila y con otro color, el puesto de esta persona
    const mine = crowdInfo && crowdInfo.me;
    const inTop = mine && mine.rank <= 5 && mine.score > 0;
    const top = !rosco.rank && crowdInfo && ((crowdInfo.top && crowdInfo.top.length) || mine) ? `<div class="pcrowd-top"><small>Top 5</small>${(crowdInfo.top || []).map((t, i) => `<div class="${inTop && i === mine.rank - 1 ? 'me' : ''}"><em>${i + 1}</em><span>${esc(t.name)}</span><b>${t.score}</b></div>`).join('')}
      ${mine && !inTop ? `<div class="you"><em>${mine.rank}.º</em><span>${esc(me.name)}</span><b>${mine.score}</b></div>` : ''}</div>` : '';
    // Pedido de Cote (21 nov): al desplegar el ranking de la Trivia (botón del animador), también sale en todos los celulares
    const meName = String(me.name || '').toLowerCase();
    const rankBox = rosco.rank ? `<div class="pcrowd-rank"><small>🏅 Trivia del Rosko · Top 10</small><b>${rosco.crowdWinner || rosco.winner ? 'Resultados finales' : 'Resultados parciales'}</b>
      ${rosco.rank.length ? rosco.rank.map((t, i) => `<div class="${String(t.name).toLowerCase() === meName ? 'me' : ''}"><em>${i + 1}.º</em><span>${esc(t.name)}</span><b>${t.score}</b></div>`).join('') : '<p class="muted">Todavía nadie suma puntos</p>'}
      ${mine && mine.rank > 10 && mine.score > 0 ? `<div class="you"><em>${mine.rank}.º</em><span>${esc(me.name)}</span><b>${mine.score}</b></div>` : ''}</div>` : '';
    $('#prosco').innerHTML = `<div class="prosco-head big"><b>Trivia del Rosko</b><span></span><span class="prosco-clock" id="prosco-clock">${rosco.winner || rosco.finished ? '' : fmtClock(roscoLeft())}</span></div>
      ${rankBox}${body}${reveal}${crowdHTML()}
      ${top}`;
  };
  const stopRosco = () => { if (roscoEs) roscoEs.close(); clearInterval(roscoTick); clearTimeout(crowdTimer); roscoEs = null; roscoId = null; rosco = null; crowdMine = {}; crowdOrder = []; crowdInfo = null; };
  // Durante el karaoke: se guarda el cartón y aparece el formulario para pedir canción.
  // El nombre no se pregunta: es el mismo con que la persona entró a la sala.
  let karTimer = null;
  let karShown = '';
  let karSent = false;
  const drawKar = async () => {
    const k = await api('GET', `/api/karaoke?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(me.token)}`).catch(() => null);
    if (!k || $('#pkar').hidden) return;
    const mine = k.me ? k.me.first : -1;
    const count = k.me ? k.me.count : 0;
    const max = k.me ? k.me.max : 2;
    // Tras enviar, se espera a que el pedido aparezca en la lista (o 25 s) antes de ofrecer el formulario otra vez
    if (karSent && (count >= karSent.until || Date.now() - karSent.at > 25000)) karSent = false;
    const now = k.list[0];
    const sig = JSON.stringify([k.venue, now, mine, count, !!karSent, k.total, k.phone, k.ask]);
    if (sig === karShown) return;
    karShown = sig;
    const full = count >= max;
    const turn = `${mine === 0 ? '<div class="pkar-turn now">🎤 ¡Es tu turno! Te toca cantar</div>'
      : mine > 0 ? `<div class="pkar-turn">Estás en la lista: ${mine === 1 ? 'eres el siguiente' : `tienes ${mine} personas antes`}</div>` : ''}
      ${karSent ? '<div class="pkar-turn">✔ Pedido enviado. Aparecerá en la lista en unos segundos.</div>' : ''}
      ${full ? `<p class="pkar-limit">Ya tienes ${max} canciones en la lista.<br><b>Priorizamos a quienes no han cantado:</b> cuando cantes una, podrás pedir otra.</p>` : ''}`;
    const draft = $('#pkar form') ? Object.fromEntries(new FormData($('#pkar form'))) : {};
    $('#pkar').innerHTML = `<div class="pkar-head"><b>🎤 Karaoke ${esc(k.name)}</b><span>${k.total ? `${k.total} en la lista` : 'Lista abierta'}</span></div>
      ${now ? `<div class="pkar-now"><small>Ahora canta</small><b>${esc(now.name)}</b><span>${esc(now.song)}${now.artist ? ` · ${esc(now.artist)}` : ''}</span></div>` : ''}
      ${turn}
      ${full || karSent ? '' : !k.phone ? '<p class="pkar-qr">🎤 En este momento no se están recibiendo pedidos de karaoke.</p>' : `<form>
        <h3>${count ? 'Pide otra canción' : 'Inscribe tu canción y participa'}</h3>
        ${count ? `<p class="muted small">Puedes tener hasta ${max} canciones en la lista. Priorizamos a quienes no han cantado.</p>` : ''}
        <p class="muted small">Canta: <b>${esc(me.name)}</b></p>
        <label class="f">Canción<input type="text" name="song" maxlength="80" required autocomplete="off" placeholder="Escribe y elige de la lista" value="${esc(draft.song || '')}"></label>
        <div class="sug" data-sug="song"></div>
        <label class="f">Artista<input type="text" name="artist" maxlength="60" required value="${esc(draft.artist || '')}"></label>
        <p class="muted small" style="margin:6px 0 0">Si alguien ya pidió tu canción, cantarás esta otra:</p>
        <label class="f">Canción de reemplazo<input type="text" name="altSong" maxlength="80" required autocomplete="off" placeholder="Escribe y elige de la lista" value="${esc(draft.altSong || '')}"></label>
        <div class="sug" data-sug="altSong"></div>
        <label class="f">Artista de reemplazo<input type="text" name="altArtist" maxlength="60" required value="${esc(draft.altArtist || '')}"></label>
        ${k.ask.places.length && !me.place ? `<label class="f">¿Dónde estás?<select name="ans-place" required><option value="">Elige tu lugar</option>${k.ask.places.map((x) => `<option ${draft['ans-place'] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}
        ${k.ask.choices.map((c) => `<label class="f">${esc(c.title)}<select name="ans-${c.id}" ${c.required ? 'required' : ''}><option value="">Elige una opción</option>${c.options.map((x) => `<option ${draft[`ans-${c.id}`] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`).join('')}
        <button class="primary big">🎤 Enviar mi pedido</button></form>`}`;
    if ($('#pkar form')) wireSongSearch($('#pkar form'));
    if ($('#pkar form')) $('#pkar form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      const data = Object.fromEntries(new FormData(e.target));
      const answers = Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('ans-')).map(([key, v]) => [key.slice(4), v]));
      try { await api('POST', '/api/karaoke/request', { sid, token: me.token, song: data.song, artist: data.artist, altSong: data.altSong, altArtist: data.altArtist, answers }); karSent = { at: Date.now(), until: count + 1 }; karShown = ''; toast('¡Pedido enviado!'); drawKar(); } catch (err) { fail(err); btn.disabled = false; }
    };
  };
  const syncKar = () => {
    const on = st.stage === 'karaoke';
    $('#pkar').hidden = !on;
    if (on && !karTimer) { karShown = ''; drawKar(); karTimer = setInterval(drawKar, 5000); }
    if (!on && karTimer) { clearInterval(karTimer); karTimer = null; karSent = false; }
    return on;
  };
  // Pedido de Cote (21 nov): en todo momento el celular muestra el nombre de la actividad y lo que viene; el cartón del
  // bingo solo mientras se juega el bingo. Sorteo de concursantes, sorteo del próximo juego, QR, show o espera entre juegos
  let actTimer = null; let actKey = ''; let actShown = ''; let actSoon = null;
  // Juegos con su caja en el celular (KRB.escenario(…, { celular }), en el ui.js de cada juego): la caja aparece con su
  // escenario y se guarda el cartón; al entrar se reinicia, se vuelve a dibujar cuando cambia su aviso (rev) y cada
  // cierto tiempo, y al salir se detiene
  const boxes = Object.keys(KRB.escenarios).filter((k) => KRB.escenarios[k].celular).map((k) => ({ stage: k, ...KRB.escenarios[k].celular, timer: null, last: null }));
  const syncBoxes = () => {
    let any = false;
    for (const b of boxes) {
      const on = st.stage === b.stage;
      $(`#${b.id}`).hidden = !on;
      if (on && !b.timer) { b.reset(); b.last = null; if (!b.rev) b.draw(sid, me.token); b.timer = setInterval(() => b.draw(sid, me.token), b.every); }
      if (on && b.rev && b.last !== st[b.rev]) { b.last = st[b.rev]; b.draw(sid, me.token); }
      if (!on && b.timer) { clearInterval(b.timer); b.timer = null; if (b.stop) b.stop(); }
      any = any || on;
    }
    return any;
  };
  const actOf = () => {
    const s = st.stage || 'bingo';
    if (['sorteo', 'juego', 'qr', 'show', 'none'].includes(s)) return s;
    if (s === 'rueda' && !st.roscoId) return 'rueda';
    if (s === 'bingo' && !st.started && !st.winConfirmed && !(st.drawn || []).length) return 'espera'; // sala abierta, aún sin juego
    if (s === 'bingo' && st.winConfirmed) return 'bingofin'; // bingo con ganador confirmado: el resultado y lo que viene
    return '';
  };
  const venueShort = () => (({ frida: 'Frida', kennedy: 'Mercado Kennedy', tobalaba: 'Tobalaba' })[st.theme] || 'Frida');
  const drawAct = async () => {
    const box = $('#pact');
    if (!box || box.hidden) return;
    const k = actKey;
    let head = ''; let body = '';
    if (k === 'sorteo') {
      const r = await api('GET', '/api/raffle').catch(() => null);
      if (!r || actKey !== k) return;
      const rolling = r.roll && (r.now || Date.now()) < r.roll.at + (r.rollMs || 6000) + 500; // con la hora del servidor
      // Al terminar la tómbola se vuelve a leer enseguida (con una pequeña espera distinta en cada celular), sin esperar la próxima vuelta
      clearTimeout(actSoon);
      if (rolling) actSoon = setTimeout(drawAct, Math.max(0, r.roll.at + (r.rollMs || 6000) + 500 - (r.now || Date.now())) + 100 + Math.random() * 900);
      if (r.mode === 'tie') {
        const isRosco = r.roll && r.roll.game === 'rosco'; // El Rosko usa el mismo sorteo para su desempate
        head = isRosco ? '🎡 El Rosko · Desempate' : '🎲 Desempate del bingo';
        body = `<p class="pvote-wait">${rolling ? '🎲 Sorteando en pantalla…' : r.roll && r.roll.winner ? `${isRosco ? 'Ganó El Rosko' : 'Ganó el desempate'}:<br><b>${esc(r.roll.winner)}</b>` : isRosco ? 'Se sortea el ganador entre los concursantes empatados.' : 'Se sortea el ganador entre los cartones empatados.'}</p>`;
      } else {
        const picked = r.picked || [];
        const same = (n) => String(n).toLowerCase() === String(me.name || '').toLowerCase();
        const myName = rolling ? null : picked.find(same);
        const seen = rolling ? picked.filter((n) => n !== r.roll.winner) : picked; // mientras gira la tómbola no se adelanta el nombre
        const myState = myName ? (r.confirm || {})[myName] : null;
        const iDeclined = (r.declined || []).some(same);
        head = '🎲 Sorteo de concursantes · El Rosko';
        // Pedido de Cote (21 nov): quien sale sorteado confirma si quiere jugar en el escenario o prefiere jugar online
        body = (myName && myState !== 'ok' ? `<div class="pvote-win">🎉 ¡Saliste sorteado!<small>Para jugar El Rosko en nuestro escenario</small></div>
            <p class="pvote-ask">¿Quieres jugar?</p><div class="pact-yesno"><button type="button" class="primary big" data-raffle="1">✅ Sí, quiero jugar</button><button type="button" class="big" data-raffle="0">🙅 No, gracias, prefiero jugar online</button></div>`
          : myName ? '<div class="pvote-win">✅ ¡Confirmado!<small>Acércate a nuestro escenario para jugar El Rosko</small></div>'
            : iDeclined ? '<p class="pvote-ask">👍 Elegiste jugar online<b>Juega la Trivia del Rosko desde tu celular</b></p>'
              : '<p class="pvote-ask">¡Prepárate!<b>Puedes salir elegido para participar en nuestro escenario</b></p>') +
          (rolling ? '<p class="pvote-wait">🎲 Sorteando en pantalla…</p>' : '') +
          (seen.length ? `<div class="pact-list"><small>Ya salieron</small>${seen.map((n, i) => `<p><em>${i + 1}.º</em><span>${esc(n)}</span><i>${(r.confirm || {})[n] === 'ok' ? '✅' : '⏳'}</i></p>`).join('')}</div>` : '') +
          '<p class="pact-next">Después: <b>🎡 El Rosko</b> · y tú juegas la Trivia del Rosko desde el celular</p>';
      }
    } else if (k === 'juego') {
      const g = await api('GET', '/api/gamedraw').catch(() => null);
      if (!g || actKey !== k) return;
      const info = GAME_INFO(g.venue);
      const ready = g.ready && (!g.last || g.ready.at > g.last.at);
      const rolling = !ready && g.last && !g.last.direct && (g.now || Date.now()) < g.last.at + 4800;
      head = '🎲 Sorteo del próximo juego';
      body = ready || rolling ? '<p class="pvote-wait">Mira la pantalla: la tómbola elige el próximo juego…</p>'
        : g.last ? `<p class="pvote-ask">El próximo juego es<b>${info[g.last.game].icon} ${esc(info[g.last.game].name)}</b></p><p class="pact-next">¡Prepárate!</p>` : '<p class="pvote-wait">Mira la pantalla: ya viene el sorteo del próximo juego.</p>';
    } else if (k === 'qr') {
      head = '📱 Invita a tus amigos';
      body = '<p class="pvote-wait">Que escaneen el código QR de la pantalla para entrar a la sala.</p><p class="pact-next">Ya viene el próximo juego</p>';
    } else if (k === 'show') {
      head = '⭐ Show en vivo';
      body = '<p class="pvote-wait">¡Disfruta el show!</p><p class="pact-next">Después siguen los juegos</p>';
    } else if (k === 'bingofin') {
      const wins = (st.results || []).filter((x) => x.validated && !x.dismissed);
      const names = [...new Set(wins.map((x) => x.name).filter(Boolean))];
      head = `🎱 ${bingoName(st.name)}`;
      body = (wins.some((x) => marks[x.cardNo]) ? '<div class="pvote-win">🎉 ¡BINGO!<small>¡Ganaste el bingo!</small></div>'
        : `<p class="pvote-ask">¡Tenemos ganador!${names.map((n) => `<b>${esc(n)}</b>`).join('')}</p>`) +
        '<p class="pact-next">Ya viene el próximo juego</p>';
    } else if (k === 'rueda') {
      head = '🎡 El Rosko';
      body = '<p class="pvote-wait">Ya viene el sorteo de concursantes: ¡puedes salir elegido para participar en nuestro escenario!</p>';
    } else {
      head = `🎮 Los Juegos de ${venueShort()}`;
      body = '<p class="pvote-ask">¡Ya estás en la sala!<b>Mira la pantalla: ya viene el próximo juego</b></p><p class="pact-next">Bingo, El Rosko, El Festival o El objeto más extraño</p>';
    }
    const html = `<div class="pvote-head"><b>${esc(head)}</b></div>${body}`;
    if (html !== actShown) { actShown = html; box.innerHTML = html; }
    box.onclick = async (e) => {
      const b = e.target.closest('[data-raffle]');
      if (!b) return;
      box.querySelectorAll('[data-raffle]').forEach((x) => { x.disabled = true; });
      try { await api('POST', '/api/raffle/answer', { sid, token: me.token, play: b.dataset.raffle === '1' }); } catch (err) { fail(err); }
      actShown = ''; drawAct();
    };
  };
  const syncAct = () => {
    const k = actOf();
    $('#pact').hidden = !k;
    if (k !== actKey) { actKey = k; actShown = ''; clearInterval(actTimer); actTimer = null; if (k) { drawAct(); if (k === 'sorteo' || k === 'juego') actTimer = setInterval(drawAct, 3000); } } else if (k === 'bingofin') drawAct(); // por si se confirma otro ganador
    return !!k;
  };
  // Instrucciones en el celular (pedido de Cote, 20 nov): al empezar cada juego (y al entrar a la sala) aparecen
  // 2 segundos las instrucciones del juego en curso: Bingo (cada ronda), El Rosko, El Festival o El objeto más extraño
  // Cada juego tiene su propia clave: bingo por ronda (desde que se elige la figura), El Rosko por rosco cargado y la votación
  // por concurso (voteGen); cada clave se muestra una sola vez (volver a un juego que sigue no las repite)
  let howtoKey = null;
  const howtoShown = new Set();
  const phoneHowto = (title, lines) => {
    let el = document.getElementById('phone-howto');
    if (el) el.remove();
    el = document.createElement('div'); el.id = 'phone-howto';
    el.innerHTML = `<div class="ph-card"><small>📢 Instrucciones</small><b>${esc(title)}</b><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><i class="ph-bar"></i></div>`;
    document.body.appendChild(el);
    // Pedido de Cote (21 nov): desaparece a los 2 segundos, o antes si la persona toca el mensaje o cualquier parte de la
    // pantalla (el aviso cubre toda la pantalla: ese toque solo lo cierra, no aprieta lo que está debajo)
    const close = () => { if (el.isConnected) el.remove(); };
    // Con el dedo se cierra apenas toca (también al empezar a deslizar), y se anula el clic: así, aunque el dedo se levante
    // justo cuando el aviso ya se fue, el toque no cae en la casilla, la votación o la Trivia de abajo
    el.addEventListener('touchstart', (e) => { e.preventDefault(); close(); }, { passive: false });
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); });
    setTimeout(close, 2000);
  };
  const syncHowto = async () => {
    const s = st.stage || 'bingo';
    const key = st.stageDone ? null : s === 'rueda' && st.roscoId ? `rosco:${st.roscoId}` : s === 'voto' ? `voto:${st.voteGen}` : s === 'bingo' && st.started && !st.winConfirmed ? `bingo:${st.round}` : null;
    if (!key || howtoShown.has(key)) return;
    howtoShown.add(key); howtoKey = key;
    if (key.startsWith('voto')) {
      const v = await api('GET', '/api/vote').catch(() => null);
      if (!v || !window.voteHowto || howtoKey !== key) return;
      const h = window.voteHowto(v); phoneHowto(h.title, h.lines);
    } else if (key.startsWith('rosco')) phoneHowto('El Rosko', window.ROSCO_HOWTO);
    else phoneHowto(bingoName(st.name), BINGO_HOWTO);
  };
  // Pedido de Cote (21 nov): el botón de KRB Kids no aparece durante los juegos, solo en los intermedios (sala abierta
  // esperando, QR, show, karaoke, sorteo o votación del próximo juego, y cuando un juego ya terminó)
  const syncKids = () => {
    const s = st.stage || 'bingo';
    const inGame = (s === 'bingo' && st.started && !st.winConfirmed) || s === 'sorteo' || (s === 'rueda' && !!st.roscoId && !st.stageDone) || (s === 'voto' && !st.stageDone) || (s === 'enpie' && !st.stageDone);
    const slot = $('#kids-slot');
    if (slot) slot.hidden = inGame;
  };
  const syncStage = () => {
    syncHowto();
    syncKids();
    const kar = syncKar() | syncBoxes() | syncAct();
    const on = (st.stage === 'rueda' && !!st.roscoId) || kar;
    $('#bingo-top').hidden = on;
    $('#bingo-bottom').hidden = on;
    if (kar) { $('#prosco').hidden = true; stopRosco(); return; }
    $('#prosco').hidden = !on;
    if (!on) { stopRosco(); return; }
    if (roscoId === st.roscoId) return;
    stopRosco();
    roscoId = st.roscoId;
    drawRosco();
    roscoEs = new EventSource(`/api/wheels/${roscoId}/events`);
    roscoEs.onmessage = (e) => { rosco = { ...JSON.parse(e.data), gotAt: Date.now() }; drawRosco(); crowdSoon(); };
    // Tocar una alternativa: queda marcada al instante y se envía; solo se puede responder una vez por pregunta
    $('#prosco').onclick = async (e) => {
      const b = e.target.closest('[data-crowd]');
      if (!b || !roscoId) return;
      const key = b.dataset.key;
      const choice = b.dataset.crowd;
      if (crowdMine[key]) return;
      crowdMine[key] = { text: choice }; crowdOrder.push(key); drawRosco();
      try { const r = await api('POST', `/api/wheels/${roscoId}/crowd`, { sid, token: me.token, key, choice }); crowdMine[key] = { text: choice, ok: !!r.correct }; if (rosco) drawRosco(); crowdSoon(); } catch (err) {
        if (!/Ya respondiste/.test(err.message)) { delete crowdMine[key]; crowdOrder = crowdOrder.filter((k) => k !== key); fail(err); if (rosco) drawRosco(); }
      }
    };
    roscoTick = setInterval(() => { const el = $('#prosco-clock'); if (el && rosco && rosco.runningSince && !rosco.winner) el.textContent = fmtClock(roscoLeft()); }, 250);
  };
  const render = () => {
    syncStage();
    if (round !== null && st.round !== round) me.cards.forEach((c) => marks[c.no].clear());
    round = st.round;
    $('#title').textContent = bingoName(st.name);
    $('#meta').textContent = `${me.name} · Ronda ${st.round} · ${st.drawn.length} valores anunciados`;
    $('#pats').innerHTML = st.started ? patternsInline(st.patterns) : ''; // la figura se ve cuando el bingo empieza
    $('#now').innerHTML = `${ballHTML(st, st.drawn.at(-1), 'mid')}<div><div class="small"><b>Valor actual</b> · anteriores:</div>
      <div class="history">${st.drawn.slice(-7, -1).reverse().map((v) => `<span>${esc(plain(st, v))}</span>`).join('') || '<span>—</span>'}</div></div>`;
    const mine = st.results.filter((r) => r.validated && marks[r.cardNo]);
    // Si este cartón ganó, se marcan solas todas las casillas ya anunciadas (aunque no las haya tocado)
    for (const r of mine) {
      const c = me.cards.find((x) => x.no === r.cardNo);
      c.cells.forEach((v, i) => { if (v !== 0 && st.drawn.includes(v)) marks[c.no].add(i); });
    }
    // Sombra de la figura. Si el patrón admite varias formas (cualquier línea, dos líneas…),
    // se sombrea la que este cartón lleva más avanzada.
    const bits = (x) => { let n = 0; for (; x; x &= x - 1) n++; return n; };
    const bestFor = (m) => PATTERNS.byId[st.patterns[0]].variants.reduce((p, v) => (bits(v & m) / bits(v) > bits(p & m) / bits(p) ? v : p));
    // Cuántas casillas de la figura le quedan por marcar a este cartón
    const noteFor = (m) => {
      const left = bits(bestFor(m) & ~m);
      return left === 0 ? '¡Figura completa!' : left === 1 ? 'Te falta 1 número' : `Te faltan ${left} números`;
    };
    $('#banner').innerHTML = mine.length ? '<div class="bingo-banner">¡BINGO!</div>' : '';
    $('#cards').innerHTML = me.cards.map((c) => {
      const m = maskOf(c);
      const green = mine.filter((r) => r.cardNo === c.no).reduce((g, r) => g | PATTERNS.completed(r.pattern, m), 0);
      return cardHTML(st, c.cells, { no: me.startNumber + c.no - 1, marks: m, green, hint: st.started ? bestFor(m) : 0, note: st.started ? noteFor(m) : '' });
    }).join('');
  };
  $('#cards').onclick = async (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !st) return;
    const c = me.cards.find((x) => String(me.startNumber + x.no - 1) === cell.closest('.card').dataset.no);
    const i = Number(cell.dataset.i);
    const v = c.cells[i];
    if (v === 0) return;
    const on = !marks[c.no].has(i);
    if (on && !st.drawn.includes(v)) {
      cell.classList.remove('nope');
      void cell.offsetWidth; // reinicia la animación
      cell.classList.add('nope');
      cell.blur();
      setTimeout(() => cell.classList.remove('nope'), 350);
      return toast('Ese valor todavía no ha salido: no se puede marcar');
    }
    on ? marks[c.no].add(i) : marks[c.no].delete(i);
    render();
    try { await api('POST', `/api/sessions/${sid}/mark`, { token: me.token, cardNo: c.no, cell: i, on }); } catch (err) { on ? marks[c.no].delete(i) : marks[c.no].add(i); render(); fail(err); }
  };
  $('#sync').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('POST', `/api/sessions/${sid}/sync`, { token: me.token });
      let added = 0;
      me.cards.forEach((c) => { const next = new Set(r.marks[c.no] || []); added += Math.max(0, next.size - marks[c.no].size); marks[c.no] = next; });
      st = r.state;
      round = st.round;
      render();
      toast(added ? `Se ${added === 1 ? 'marcó 1 casilla' : `marcaron ${added} casillas`} que faltaban` : 'Todo al día: no te falta marcar nada');
    } catch (err) { fail(err); }
    e.target.disabled = false;
  };
  // Transmisión en vivo del local bajo el cartón: silenciada, sin controles, y solo si el canal está en vivo
  let player = null;
  let liveFor = null;
  const startLive = () => {
    const channel = LIVE_CHANNELS[st.theme] || LIVE_CHANNELS.frida;
    if (liveFor === channel) return;
    liveFor = channel;
    loadTwitch().then(() => {
      if (!$('#live-player') || liveFor !== channel) return;
      $('#live-player').innerHTML = '';
      $('#live').classList.remove('on');
      player = new window.Twitch.Player('live-player', { channel, parent: [location.hostname], muted: true, controls: false, autoplay: true, width: '100%', height: '100%' });
      const show = (on) => { const box = $('#live'); if (box) box.classList.toggle('on', on); };
      player.addEventListener(window.Twitch.Player.ONLINE, () => { show(true); try { player.setMuted(true); player.play(); } catch { /* el reproductor decide */ } });
      player.addEventListener(window.Twitch.Player.PLAYING, () => show(true));
      player.addEventListener(window.Twitch.Player.OFFLINE, () => { show(false); setFull(false); });
      player.addEventListener(window.Twitch.Player.ENDED, () => { show(false); setFull(false); });
    }).catch(() => { liveFor = null; }); // sin acceso a Twitch: simplemente no se muestra
  };
  // Audio y pantalla completa, a elección de cada persona (parte siempre silenciado)
  let muted = true;
  $('#live-audio').onclick = () => {
    if (!player) return;
    muted = !muted;
    try { player.setMuted(muted); if (!muted) { player.setVolume(1); player.play(); } } catch { /* el reproductor decide */ }
    $('#live-audio').textContent = muted ? '🔇 Activar audio' : '🔊 Silenciar';
  };
  const setFull = (on) => {
    $('#live').classList.toggle('full', on);
    document.body.classList.toggle('live-open', on);
    $('#live-full').textContent = on ? '✕ Cerrar' : '⛶ Pantalla completa';
    // Donde el navegador lo permite, además se oculta su barra; en iPhone basta con la vista ampliada
    try {
      if (on && $('#live').requestFullscreen) $('#live').requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* sin pantalla completa nativa */ }
  };
  $('#live-full').onclick = () => setFull(!$('#live').classList.contains('full'));
  // Poner el video al día: al pausar y reanudar, el reproductor salta al punto más reciente del vivo.
  // Se hace solo cuando la persona vuelve a la página (el video se atrasa mientras el teléfono está en otra cosa).
  const resync = () => { if (!player) return; try { player.pause(); setTimeout(() => { try { player.play(); } catch { /* el reproductor decide */ } }, 250); } catch { /* el reproductor decide */ } };
  $('#live-sync').onclick = () => { resync(); toast('Video al día'); };
  const onBack = () => { if (!document.hidden && $('#live') && $('#live').classList.contains('on')) resync(); };
  document.addEventListener('visibilitychange', onBack);
  const onFs = () => { if (!document.fullscreenElement && $('#live') && $('#live').classList.contains('full') && $('#live').requestFullscreen) setFull(false); };
  document.addEventListener('fullscreenchange', onFs);
  const off = subscribe(sid, (s) => { st = s; render(); startLive(); }, () => { store.del(key); backToStart(); }, false, me.token);
  return () => { off(); stopRosco(); clearInterval(karTimer); boxes.forEach((b) => { clearInterval(b.timer); if (b.stop) b.stop(); }); clearInterval(actTimer); liveFor = null; player = null; document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('visibilitychange', onBack); document.body.classList.remove('live-open'); };
};
// Canal de Twitch de cada local (uno por local: KRB Stage en Frida, KRB Stage Kennedy en Kennedy, KRB Stage 3 en Tobalaba)
const LIVE_CHANNELS = { frida: 'krbstage', kennedy: 'krbstagekennedy', tobalaba: 'krbstage3' };
let twitchLoading = null;
const loadTwitch = () => {
  if (window.Twitch && window.Twitch.Player) return Promise.resolve();
  twitchLoading = twitchLoading || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://player.twitch.tv/js/embed/v1.js';
    s.onload = resolve;
    s.onerror = () => { twitchLoading = null; s.remove(); reject(new Error('twitch')); };
    document.head.appendChild(s);
  });
  return twitchLoading;
};

