/* global views, app, $, esc, api, isAdmin, viewLogin, fail, toast */
// GC Master: centro de control de transmisión (pedido de Cote, 21 nov). Una página por local (#/master/<local>) con sus
// 3 pantallas, ordenadas como en el dibujo de Cote: a la izquierda, arriba la 1) video en vivo o GC con un fondo y abajo
// la 2) tablero; a la derecha, a todo el alto, la 3) pantalla vertical; abajo, botones tipo
// TV para cambiar las opciones del GC. Y un cuarto salón (#/master) con los 3 locales juntos, para el control total.
(() => {
  const VENUES = { kennedy: 'Mercado Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const ORDER = ['kennedy', 'frida', 'tobalaba'];
  const TWITCH = { kennedy: 'krbstagekennedy', frida: 'krbstage', tobalaba: 'krbstage3' }; // canal de la transmisión de cada local
  // Transmisión nuestra (señal propia de baja latencia, la misma que usa la página web krbstage.cl) de cada local
  const OWN = {
    kennedy: 'https://customer-3bznxs0ex4mcn0j1.cloudflarestream.com/c24ccde66ad7d935841dd934d9b3e1cf/webRTC/play',
    frida: 'https://customer-3bznxs0ex4mcn0j1.cloudflarestream.com/2c9c627707b0fbc53e20c611f84235a0/webRTC/play',
    tobalaba: 'https://customer-3bznxs0ex4mcn0j1.cloudflarestream.com/9c4d261a1b6c2fb79842b6d3821b9018/webRTC/play',
  };
  const BOARD = { kennedy: 'kennedy-h', frida: 'frida-h', tobalaba: 'tobalaba' }; // pantalla horizontal (tablero) de cada local
  const VERT = { kennedy: 'kennedy', frida: 'frida', tobalaba: 'tobalaba-v' }; // pantalla vertical de cada local
  // Opciones del GC de la sala light (las mismas del panel de la sala light)
  const LIGHT = [['info', '🔄', 'Información'], ['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show'], ['cartelera', '📅', 'Cartelera'], ['qr', '📱', 'QR grande'], ['none', '⛔', 'Nada']];
  // Opciones del GC de la sala de juegos (cuando la sala abierta es la de este local)
  const MAIN = [['bingo', '🎱', 'Bingo'], ['rueda', '🎡', 'El Rosko'], ['sorteo', '🎲', 'Sorteo'], ['voto', '🗳️', 'Votación'], ['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show'], ['insta', '📸', 'Instagram'], ['qr', '📱', 'QR'], ['none', '⛔', 'Nada'], ['per', '✏️', 'GC PER']]; // «GC PER»: el texto escrito, en la franja del GC (no es un escenario: /api/gcper)
  // Capa gráfica sobre la cámara (pedido de Cote, 21 nov): piezas que se disparan sobre el GC de OBS del local y salen solas
  const CAPA = [['cortina', '🎬', 'Cortina', 'Cortina'], ['texto3d', '🧊', 'Texto 3D', 'Texto 3D'], ['celebracion', '🎉', 'Celebración', 'Celebración'], ['fuegos', '🎆', 'Fuegos', 'Fuegos artificiales'],
    ['confeti', '🎊', 'Confeti', 'Lluvia de confeti'], ['luces', '🔦', 'Luces', 'Luces de escenario'], ['corazones', '❤️', 'Corazones', 'Corazones'], ['off', '✖', 'Quitar', 'Quitar lo que está en pantalla']];
  // los monitores van en modo liviano (?mon=1): la misma pantalla, sin fondo animado, para no cargar el computador
  const page = (hash) => `${location.pathname}?mudo=1&mon=1${hash}`;

  const venueHTML = (v) => `<section class="gm-venue th-${v}" data-v="${v}">
      <header class="gm-head"><b>${esc(VENUES[v])}</b><span class="gm-live" data-k="live">Sin transmisión en vivo</span><span class="gm-sala" data-k="sala"></span><button type="button" class="gm-listen" data-audio="${v}">🔇 Escuchar</button></header>
      <div class="gm-screens">
        <div class="gm-left">
          <div class="gm-scr"><small>1 · <span data-k="p1name">Vivo o GC</span></small>
            <div class="gm-box" data-w="1280"><video class="gm-own" data-k="own" muted autoplay playsinline hidden></video><div class="gm-p1in" data-k="p1"></div></div></div>
          <div class="gm-scr"><small>2 · Tablero</small>
            <div class="gm-box" data-w="1280"><iframe title="Tablero de ${esc(VENUES[v])}" tabindex="-1" src="${page(`#/pantalla/${BOARD[v]}`)}"></iframe></div></div>
        </div>
        <div class="gm-scr gm-tall"><small>3 · Vertical</small>
          <div class="gm-box" data-w="720"><iframe title="Pantalla vertical de ${esc(VENUES[v])}" tabindex="-1" src="${page(`#/vertical-in/${VERT[v]}`)}"></iframe></div></div>
      </div>
      <div class="gm-keys" data-k="keys"></div>
      <div class="gm-txtrow">
        <input class="gm-text" data-k="text" type="text" name="text" form="gmf-${v}" maxlength="120" autocomplete="off" placeholder="Texto del GC personalizable o del texto 3D">
        <div class="gm-capa" title="Capa gráfica sobre la cámara">${CAPA.map(([k, i, t, full]) => `<button type="button" class="gm-ckey" data-capa="${k}" title="${full}" aria-label="${full}"><span>${i}</span><b>${t}</b></button>`).join('')}</div>
      </div>
    </section>`;

  // Barra de arriba: los 3 locales, «Los 3 locales» y «Sala de juegos» (pedido de Cote, 22 nov), con la hora y la fecha
  const navHTML = (on) => `<nav class="gm-nav"><a class="gm-back" href="#/control">←<span> Centro de control</span></a><b>🎛️ GC Master</b>
        ${ORDER.map((v) => `<a class="gm-tab ${on === v ? 'on' : ''}" href="#/master/${v}">${esc(VENUES[v])}</a>`).join('')}
        <a class="gm-tab ${on === 'todos' ? 'on' : ''}" href="#/master">Los 3 locales</a>
        <a class="gm-tab ${on === 'juegos' ? 'on' : ''}" href="#/master/juegos">Sala de juegos</a>
        <a class="gm-tab ${on === 'conectados' ? 'on' : ''}" href="#/master/conectados">Conectados</a>
        <span class="gm-clock" data-k="clock"><b></b><i></i></span></nav>`;
  // Arriba, la fecha con el año y la hora local de los locales (hora de Chile), al segundo (pedido de Cote, 22 nov)
  const startClock = (root) => {
    const clockEl = root.querySelector('[data-k="clock"]');
    const fmtDate = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fmtTime = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const tick = () => { const now = new Date(); const d = fmtDate.format(now); clockEl.querySelector('i').textContent = d.charAt(0).toUpperCase() + d.slice(1); clockEl.querySelector('b').textContent = fmtTime.format(now); };
    tick();
    return setInterval(tick, 1000);
  };

  // Señal 1 de la sala de juegos (pedido de Cote, 22 nov: «¿el control por qué no muestra la transmisión?»): el monitor 1
  // muestra, igual que en la página de cada local, 1.º la transmisión nuestra (señal propia), 2.º la de Twitch y 3.º el GC
  // sobre un fondo. Va siempre sin sonido. Con la página oculta la señal nuestra se desconecta (cada minuto visto se paga).
  const signal1 = (box, v, { fit, label }) => {
    box.innerHTML = '<video class="gm-own" muted autoplay playsinline hidden></video><div class="gm-p1in"></div>';
    const vid = box.querySelector('video'); const inner = box.querySelector('.gm-p1in');
    let own = false; let live = false; let pc = null; let timer = null; let dead = false; let src = '';
    const paint = () => {
      if (dead) return;
      const mode = own ? 'own' : live ? 'twitch' : 'gc';
      label(mode === 'own' ? 'Transmisión nuestra' : mode === 'twitch' ? 'Twitch' : 'GC · sin transmisión');
      const next = mode === 'own' ? 'own' : mode === 'twitch' ? `https://player.twitch.tv/?channel=${TWITCH[v]}&parent=${location.hostname}&muted=true&autoplay=true` : '/?mudo=1&mon=1#/escena';
      if (next === src) return;
      src = next;
      vid.hidden = mode !== 'own'; inner.hidden = mode === 'own';
      box.classList.toggle('gm-bg', mode === 'gc'); // el GC es transparente: se ve sobre un fondo con el color del local
      inner.innerHTML = mode === 'own' ? '' : mode === 'twitch' ? `<iframe data-full="1" title="Twitch de ${esc(VENUES[v])}" allow="autoplay; fullscreen" src="${esc(next)}"></iframe>` : `<iframe title="GC de la sala de juegos" tabindex="-1" src="${next}"></iframe>`;
      fit();
    };
    const stopOwn = () => { clearTimeout(timer); if (pc) { try { pc.close(); } catch { /* nada */ } pc = null; } if (own) { own = false; paint(); } };
    const startOwn = () => {
      clearTimeout(timer);
      if (dead || document.hidden || !window.RTCPeerConnection || !OWN[v]) return;
      if (pc) { try { pc.close(); } catch { /* nada */ } }
      const me = pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], bundlePolicy: 'max-bundle' });
      const ms = new MediaStream();
      const again = (wait) => { if (pc !== me) return; try { me.close(); } catch { /* nada */ } pc = null; if (own) { own = false; paint(); } timer = setTimeout(startOwn, wait); };
      me.addTransceiver('video', { direction: 'recvonly' }); me.addTransceiver('audio', { direction: 'recvonly' });
      me.ontrack = (e) => { ms.addTrack(e.track); vid.srcObject = ms; vid.play().catch(() => {}); };
      me.onconnectionstatechange = () => { if (pc === me && ['failed', 'disconnected', 'closed'].includes(me.connectionState)) again(5000); };
      const limit = setTimeout(() => { if (pc === me && !own) again(20000); }, 12000); // sin señal: se reintenta cada tanto
      me.createOffer().then((o) => me.setLocalDescription(o))
        .then(() => new Promise((r) => { if (me.iceGatheringState === 'complete') return r(); const t = setTimeout(r, 1500); me.addEventListener('icegatheringstatechange', () => { if (me.iceGatheringState === 'complete') { clearTimeout(t); r(); } }); return undefined; }))
        .then(() => fetch(OWN[v], { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: me.localDescription.sdp }))
        .then((r) => { if (!r.ok) throw new Error(`WHEP ${r.status}`); return r.text(); })
        .then((sdp) => me.setRemoteDescription({ type: 'answer', sdp }))
        .catch(() => { clearTimeout(limit); again(20000); });
    };
    vid.addEventListener('playing', () => { if (!own && !dead) { own = true; paint(); } });
    const loadLive = async () => {
      const r = await api('GET', '/api/web/twitch').catch(() => null);
      if (dead || !r) return;
      const c = (r.canales || []).find((x) => x.canal === TWITCH[v]);
      const now = !!(c && c.vivo);
      if (now !== live) { live = now; paint(); }
    };
    const onVisible = () => (document.hidden ? stopOwn() : (pc || startOwn()));
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(loadLive, 20000);
    paint(); startOwn(); loadLive();
    return () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', onVisible); clearTimeout(timer); if (pc) { try { pc.close(); } catch { /* nada */ } pc = null; } };
  };

  // El panel de la sala va dentro de un recuadro y se achica solo, lo justo para que todo quepa sin subir ni bajar: parte en
  // «max» y baja hasta «min» según lo que realmente ocupa el contenido. Con «wide», solo se achica desde ese ancho de ventana.
  const panelFit = (pf, { max, min, wide = 0, alive }) => {
    const pbox = pf.parentElement;
    let k = max; let cap = max; let lastHash = ''; let grewAt = 0;
    const on = () => window.innerWidth > wide;
    const applyK = () => { const kk = on() ? k : 1; pf.style.width = `${100 / kk}%`; pf.style.height = `${100 / kk}%`; pf.style.transform = kk === 1 ? '' : `scale(${kk})`; };
    const fitPanel = () => {
      if (!alive()) return;
      if (!on()) { applyK(); return; }
      if (pbox.clientHeight < 60) return; // oculto
      let doc = null; try { doc = pf.contentDocument; } catch { doc = null; }
      const a = doc && doc.getElementById('app');
      if (!a || !a.lastElementChild) return;
      if (!doc.getElementById('gm-in')) { const st = doc.createElement('style'); st.id = 'gm-in'; st.textContent = 'main{padding:10px 14px 8px !important;max-width:none !important}.panel{padding:12px 16px !important;margin-bottom:10px !important}h1{margin-bottom:.15em !important}.cols{gap:10px !important}.back{margin:0 0 6px !important}'; doc.head.appendChild(st); }
      const hash = pf.contentWindow.location.hash;
      if (hash !== lastHash) { lastHash = hash; cap = max; }
      // alto que ocupa el contenido (en píxeles del panel sin achicar) y el tamaño que lo haría caber
      let bottom = 0; for (const c of a.children) { const r = c.getBoundingClientRect(); if (r.height) bottom = Math.max(bottom, r.bottom); }
      const need = bottom + (pf.contentWindow.scrollY || 0) + 14;
      const next = Math.max(min, Math.min(cap, (pbox.clientHeight / need) * 0.985)); // cabe si need <= alto del panel / k
      if (next < k - 0.008) { if (Date.now() - grewAt < 2500) cap = next; k = next; applyK(); } // si al agrandar dejó de caber, no se vuelve a agrandar en esta vista
      else if (next > k * 1.12) { k = next; grewAt = Date.now(); applyK(); }
    };
    return { fitPanel, applyK, reset: () => { k = max; cap = max; applyK(); } };
  };

  // «Sala KRB»: la sala de juegos en el teléfono (pedido de Cote, 22 nov: «una versión móvil… guardarlo en el inicio, que no
  // se vea la barra de direcciones y pueda en una plana operar todos los botones… distribuido para un iPhone»). Se abre
  // en /sala (#/master/movil), a pantalla completa y sin bajar la página: arriba los 3 monitores chicos (GC, tablero y de
  // pie); al medio, lo que se elige con las 2 teclas de abajo: «Juego» (el panel real de la sala, achicado para que quepa)
  // o «GC y efectos» (los 9 botones del GC, el texto y los 8 efectos).
  const movil = async () => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on', 'gmm-on');
    app.innerHTML = `<div id="gm" class="gm-m">
      <header class="gmm-top"><b data-k="mtitle">Sala de juegos</b><span data-k="msala"></span><span class="gm-clock" data-k="clock"><b></b><i></i></span></header>
      <div class="gmm-mon" data-k="mon"></div>
      <div class="gmm-body">
        <div class="gm-panel gmm-pane" data-pane="juego"><iframe title="Panel de la sala de juegos" src="/#/juegos"></iframe></div>
        <div class="gmm-pane gmm-gc" data-pane="gc" hidden></div>
      </div>
      <nav class="gmm-tabs"><button type="button" class="on" data-tab="juego"><span>🎮</span><b>Juego</b></button><button type="button" data-tab="gc"><span>🎛️</span><b>GC y efectos</b></button></nav></div>`;
    const root = $('#gm');
    const mon = root.querySelector('[data-k="mon"]'); const gc = root.querySelector('[data-pane="gc"]');
    let alive = true; let venue = null; let stage = ''; let sigStop = null;
    const fit = () => root.querySelectorAll('.gm-box').forEach((box) => { const f = box.querySelector('iframe:not([data-full])'); if (f) f.style.transform = `scale(${box.clientWidth / Number(box.dataset.w || 1280)})`; });
    const ro = new ResizeObserver(fit);
    const key = (k, icon, text, on) => `<button type="button" class="gm-key ${on ? 'on' : ''}" data-main="${k}"><i></i><span>${icon}</span><b>${text}</b></button>`;
    const paintKeys = () => { const box = gc.querySelector('[data-k="keys"]'); if (box) box.innerHTML = MAIN.map(([k, i, t]) => key(k, i, t, stage === k)).join(''); };
    const paint = () => {
      ro.disconnect();
      root.querySelector('[data-k="mtitle"]').textContent = venue ? VENUES[venue] : 'Sala de juegos';
      if (sigStop) { sigStop(); sigStop = null; }
      mon.innerHTML = venue ? `<div class="gm-scr th-${venue}"><small data-k="p1name">GC</small><div class="gm-box" data-w="1280" data-k="p1box"></div></div>${[['Tablero', '#/tablero', 1280, ''], ['De pie', '#/tablero', 720, 'gm-tall']].map(([t, h, w, tall]) => `<div class="gm-scr ${tall} th-${venue}"><small>${t}</small><div class="gm-box" data-w="${w}"><iframe title="${t}" tabindex="-1" src="/?mudo=1&mon=1${h}"></iframe></div></div>`).join('')}`
        : '<p class="gmm-none">No hay sala de juegos abierta. Créala aquí abajo, con «Crear sala de juegos».</p>';
      if (venue) sigStop = signal1(mon.querySelector('[data-k="p1box"]'), venue, { fit, label: (t) => { const el = mon.querySelector('[data-k="p1name"]'); if (el) el.textContent = t; } });
      gc.innerHTML = venue ? `<div class="gm-venue th-${venue}" data-v="${venue}">
          <div class="gm-row"><small>GC de la sala de juegos</small><div class="gm-keyrow" data-k="keys"></div></div>
          <div class="gm-row"><small>Efectos sobre la cámara</small>
            <input class="gm-text" data-k="text" type="text" maxlength="120" autocomplete="off" placeholder='Texto para el GC PER y el texto 3D · "entre comillas" sale destacado'>
            <div class="gm-capa">${CAPA.map(([k, i, t, full]) => `<button type="button" class="gm-ckey" data-capa="${k}" title="${full}" aria-label="${full}"><span>${i}</span><b>${t}</b></button>`).join('')}</div></div></div>`
        : '<p class="gmm-none">Cuando haya una sala de juegos abierta, aquí aparecen los botones del GC y los efectos.</p>';
      root.querySelectorAll('.gm-box').forEach((b) => ro.observe(b));
      paintKeys(); fit();
    };
    const load = async () => {
      const r = await api('GET', '/api/consola').catch(() => null);
      if (!alive || !r) return;
      const loc = (r.locales || []).find((x) => x.main);
      const v = loc ? loc.venue : null; const st = loc ? loc.main.stage : '';
      if (v !== venue) { venue = v; stage = st; paint(); } else if (st !== stage) { stage = st; paintKeys(); }
      root.querySelector('[data-k="msala"]').textContent = loc ? loc.main.stageName : '';
      const ti = gc.querySelector('[data-k="text"]'); if (ti && loc && loc.main.perText && !ti.value && document.activeElement !== ti) ti.value = loc.main.perText; // el último texto del GC PER queda a mano
    };
    const pf = root.querySelector('.gm-panel iframe');
    const { fitPanel, applyK, reset } = panelFit(pf, { max: 0.85, min: 0.6, alive: () => alive });
    root.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tab) {
        root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('on', x === b));
        root.querySelectorAll('[data-pane]').forEach((x) => { x.hidden = x.dataset.pane !== b.dataset.tab; });
        fitPanel(); return;
      }
      if (!venue) return;
      try {
        if (b.dataset.main === 'per') {
          const ti = gc.querySelector('[data-k="text"]'); const text = ti.value.trim();
          if (!text) { toast('Escribe el texto del GC PER'); ti.focus(); return; }
          ti.blur(); await api('POST', '/api/gcper', { on: true, text }); toast('GC PER en pantalla'); load();
        } else if (b.dataset.main) { await api('POST', '/api/stage', { show: b.dataset.main }); load(); } else if (b.dataset.capa) {
          const ti = gc.querySelector('[data-k="text"]'); const text = ti.value.trim();
          if (b.dataset.capa === 'texto3d' && !text) { toast('Escribe el texto para el 3D'); ti.focus(); return; }
          await api('POST', '/api/capa', { local: venue, kind: b.dataset.capa, text });
          b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 1500);
        }
      } catch (err) { fail(err); }
    };
    applyK();
    pf.addEventListener('load', reset);
    window.addEventListener('resize', fitPanel);
    paint();
    await load();
    const t3 = startClock(root);
    const t1 = setInterval(load, 3000);
    const offAviso = window.onAviso(load); // el botón encendido y los monitores cambian al instante (aviso del servidor)
    const t4 = setInterval(fitPanel, 400);
    return () => { alive = false; offAviso(); if (sigStop) sigStop(); clearInterval(t1); clearInterval(t3); clearInterval(t4); window.removeEventListener('resize', fitPanel); ro.disconnect(); document.body.classList.remove('gm-on', 'gmm-on'); };
  };

  // «Sala de juegos» (pedido de Cote, 22 nov: «que tengamos Mercado Kennedy, Frida, Tobalaba y luego sala de juegos, para
  // poder tener todos los botones y todas las interacciones»): a la izquierda, las 3 pantallas de la sala de juegos abierta
  // (1 GC de OBS, 2 tablero, 3 pantalla de pie), los botones del GC y los de la capa gráfica; a la derecha, el panel real
  // de la sala (crear sala, elegir el juego y manejar cada juego), para hacer todo sin salir de esta página.
  const juegos = async () => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on');
    app.innerHTML = `<div id="gm" class="gm-all gm-jg">${navHTML('juegos')}
      <a class="gm-movil" href="/sala">📱 Abrir la versión para el teléfono</a>
      <div class="gm-grid"><div class="gm-jgleft" data-k="left"></div>
        <div class="gm-panel"><iframe title="Panel de la sala de juegos" src="${location.pathname}#/juegos"></iframe></div></div></div>`;
    const root = $('#gm');
    const left = root.querySelector('[data-k="left"]');
    let alive = true; let venue = null; let stage = ''; let sigStop = null;
    const fit = () => root.querySelectorAll('.gm-box').forEach((box) => { const f = box.querySelector('iframe:not([data-full])'); if (f) f.style.transform = `scale(${box.clientWidth / Number(box.dataset.w || 1280)})`; });
    const ro = new ResizeObserver(fit);
    const key = (k, icon, text, on) => `<button type="button" class="gm-key ${on ? 'on' : ''}" data-main="${k}"><i></i><span>${icon}</span><b>${text}</b></button>`;
    const paintKeys = () => { const box = left.querySelector('[data-k="keys"]'); if (box) box.innerHTML = `<div class="gm-row"><small>GC de la sala de juegos</small><div class="gm-keyrow">${MAIN.map(([k, i, t]) => key(k, i, t, stage === k)).join('')}</div></div>`; };
    const paintLeft = () => {
      ro.disconnect();
      if (sigStop) { sigStop(); sigStop = null; }
      left.innerHTML = venue ? `<section class="gm-venue th-${venue}" data-v="${venue}">
          <header class="gm-head"><b>Sala de juegos · ${esc(VENUES[venue])}</b><span class="gm-sala" data-k="sala"></span></header>
          <div class="gm-screens">
            <div class="gm-left">
              <div class="gm-scr"><small>1 · <span data-k="p1name">GC</span></small><div class="gm-box" data-w="1280" data-k="p1box"></div></div>
              <div class="gm-scr"><small>2 · Tablero</small><div class="gm-box" data-w="1280"><iframe title="Tablero de la sala de juegos" tabindex="-1" src="${page('#/tablero')}"></iframe></div></div>
            </div>
            <div class="gm-scr gm-tall"><small>3 · De pie</small><div class="gm-box" data-w="720"><iframe title="Pantalla de pie de la sala de juegos" tabindex="-1" src="${page('#/tablero')}"></iframe></div></div>
          </div>
          <div class="gm-keys" data-k="keys"></div>
          <div class="gm-txtrow">
            <input class="gm-text" data-k="text" type="text" maxlength="120" autocomplete="off" placeholder='Texto para el GC PER y el texto 3D · "entre comillas" sale destacado'>
            <div class="gm-capa" title="Capa gráfica sobre la cámara">${CAPA.map(([k, i, t, full]) => `<button type="button" class="gm-ckey" data-capa="${k}" title="${full}" aria-label="${full}"><span>${i}</span><b>${t}</b></button>`).join('')}</div>
          </div></section>`
        : `<section class="gm-venue gm-none"><header class="gm-head"><b>Sala de juegos</b></header>
          <p>No hay sala de juegos abierta. Créala en el panel de al lado («Crear sala de juegos»); cuando esté abierta, aquí aparecen sus pantallas y sus botones.</p></section>`;
      if (venue) sigStop = signal1(left.querySelector('[data-k="p1box"]'), venue, { fit, label: (t) => { const el = left.querySelector('[data-k="p1name"]'); if (el) el.textContent = t; } });
      root.querySelectorAll('.gm-box').forEach((b) => ro.observe(b));
      paintKeys(); fit();
    };
    const load = async () => {
      const r = await api('GET', '/api/consola').catch(() => null);
      if (!alive || !r) return;
      const loc = (r.locales || []).find((x) => x.main);
      const v = loc ? loc.venue : null;
      const st = loc ? loc.main.stage : '';
      if (v !== venue) { venue = v; stage = st; paintLeft(); } else if (st !== stage) { stage = st; paintKeys(); }
      const sala = left.querySelector('[data-k="sala"]');
      if (sala && loc) sala.textContent = `En pantalla: ${loc.main.stageName}`;
      const ti = left.querySelector('[data-k="text"]'); if (ti && loc && loc.main.perText && !ti.value && document.activeElement !== ti) ti.value = loc.main.perText; // el último texto del GC PER queda a mano
    };
    root.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b || !venue || !left.contains(b)) return;
      e.preventDefault();
      try {
        if (b.dataset.main === 'per') {
          const ti = left.querySelector('[data-k="text"]'); const text = ti.value.trim();
          if (!text) { toast('Escribe el texto del GC PER'); ti.focus(); return; }
          ti.blur(); await api('POST', '/api/gcper', { on: true, text }); toast('GC PER en pantalla'); load();
        } else if (b.dataset.main) { await api('POST', '/api/stage', { show: b.dataset.main }); load(); } else if (b.dataset.capa) {
          const ti = left.querySelector('[data-k="text"]'); const text = ti.value.trim();
          if (b.dataset.capa === 'texto3d' && !text) { toast('Escribe el texto para el 3D'); ti.focus(); return; }
          await api('POST', '/api/capa', { local: venue, kind: b.dataset.capa, text });
          b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 1500);
          toast(b.dataset.capa === 'off' ? 'Capa quitada' : `${b.title} en la sala de juegos`);
        }
      } catch (err) { fail(err); }
    };
    // El panel de la derecha se achica solo, lo justo para que todo quepa sin subir ni bajar (pedido de Cote, 22 nov:
    // «se ven todo un poco grandes… para poder tener siempre todo en pantalla»). Parte al 80 % y baja hasta el 50 % si lo
    // que hay en el panel es más alto; se mide lo que realmente ocupa el contenido. En el teléfono va a tamaño normal.
    const pf = root.querySelector('.gm-panel iframe');
    const { fitPanel, applyK, reset } = panelFit(pf, { max: 0.8, min: 0.5, wide: 900, alive: () => alive });
    applyK();
    pf.addEventListener('load', reset);
    window.addEventListener('resize', fitPanel);
    paintLeft();
    await load();
    const t3 = startClock(root);
    const t1 = setInterval(load, 3000);
    const offAviso = window.onAviso(load); // el botón encendido y los monitores cambian al instante (aviso del servidor)
    const t4 = setInterval(fitPanel, 400);
    return () => { alive = false; offAviso(); if (sigStop) sigStop(); clearInterval(t1); clearInterval(t3); clearInterval(t4); window.removeEventListener('resize', fitPanel); ro.disconnect(); document.body.classList.remove('gm-on'); };
  };

  // Una página del GC Master: uno o los tres locales
  const master = async (list, single) => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on');
    app.innerHTML = `<div id="gm" class="${single ? 'gm-one' : 'gm-all'}">
      ${navHTML(single ? list[0] : 'todos')}
      <div class="gm-grid">${list.map(venueHTML).join('')}</div>
      ${single ? '' : `<div class="gm-audio"><small>Audio · escuchar la señal 1 de un local (los otros se apagan)</small><div class="gm-audiorow">${list.map((v, i) => `<button type="button" class="gm-key" data-audio="${v}"><i></i><span>🔇</span><b>${i + 1} · ${esc(VENUES[v])}</b></button>`).join('')}</div></div>`}</div>`;
    const root = $('#gm');
    const el = (v, k) => root.querySelector(`.gm-venue[data-v="${v}"] [data-k="${k}"]`);
    const state = {}; // por local: lo que eligió el operador para la pantalla 1 y lo último dibujado
    list.forEach((v) => { state[v] = { p1: 'auto', p1src: '', keys: '', live: false, viewers: 0, own: false, pc: null, ownTimer: null, main: null, light: null }; });
    let alive = true;
    // Audio (pedido de Cote, 22 nov): se escucha la señal 1 de un solo local a la vez; al elegir otro, el anterior se apaga
    let audio = null;

    // Las pantallas son las páginas reales, achicadas al ancho de su cuadro
    const fit = () => root.querySelectorAll('.gm-box').forEach((box) => {
      const f = box.querySelector('iframe[data-scale], iframe:not([data-full])');
      if (f) f.style.transform = `scale(${box.clientWidth / Number(box.dataset.w || 1280)})`;
    });
    const ro = new ResizeObserver(fit);
    root.querySelectorAll('.gm-box').forEach((b) => ro.observe(b));

    // Señal 1, en este orden de prioridad (pedido de Cote, 22 nov): 1.º la transmisión nuestra (señal propia), 2.º la
    // transmisión de Twitch y 3.º el GC con un fondo. «Pantalla 1: vivo» la deja en la transmisión (nuestra o Twitch) y
    // «Pantalla 1: GC» en el GC
    const paintP1 = (v) => {
      const s = state[v];
      const liveMode = s.own ? 'own' : 'twitch';
      const mode = s.p1 === 'gc' ? 'gc' : s.p1 === 'vivo' ? liveMode : (s.own ? 'own' : s.live ? 'twitch' : 'gc');
      const gc = s.main ? '#/escena' : `#/light-gc/${v}`;
      const src = mode === 'own' ? 'own' : mode === 'twitch' ? `https://player.twitch.tv/?channel=${TWITCH[v]}&parent=${location.hostname}&muted=${audio === v ? 'false' : 'true'}&autoplay=true` : page(gc);
      // Etiqueta corta (cabe dentro de la pantalla también en el teléfono)
      el(v, 'p1name').textContent = `${mode === 'own' ? 'Transmisión nuestra' : mode === 'twitch' ? (s.live ? 'Twitch' : 'Twitch · sin transmisión') : (s.p1 === 'auto' ? 'GC · sin transmisión' : 'GC')}${s.p1 === 'auto' ? '' : ' · fijo'}`;
      root.querySelectorAll(`.gm-venue[data-v="${v}"] [data-p1]`).forEach((b) => b.classList.toggle('on', b.dataset.p1 === s.p1));
      const b = el(v, 'live');
      b.classList.toggle('on', s.own || s.live);
      b.textContent = s.own ? '🔴 EN VIVO · transmisión nuestra' : s.live ? `🔴 EN VIVO · Twitch · ${s.viewers} ${s.viewers === 1 ? 'persona' : 'personas'}` : 'Sin transmisión en vivo';
      if (src === s.p1src) return;
      s.p1src = src;
      const box = el(v, 'p1');
      el(v, 'own').hidden = mode !== 'own';
      box.hidden = mode === 'own';
      box.parentElement.classList.toggle('gm-bg', mode === 'gc'); // el GC es transparente: se ve sobre un fondo con el color del local
      box.innerHTML = mode === 'own' ? '' : mode === 'twitch' ? `<iframe data-full="1" title="Twitch de ${esc(VENUES[v])}" allow="autoplay; fullscreen" src="${esc(src)}"></iframe>`
        : `<iframe title="GC de ${esc(VENUES[v])}" tabindex="-1" src="${esc(src)}"></iframe>`;
      fit();
    };

    // Transmisión nuestra: se intenta conectar siempre; si no hay señal (o se corta), se reintenta sola y mientras tanto
    // la pantalla 1 sigue con Twitch o con el GC. Con la pestaña oculta no se conecta (cada minuto visto se paga).
    const ownStop = (v) => { const s = state[v]; clearTimeout(s.ownTimer); if (s.pc) { try { s.pc.close(); } catch { /* nada */ } s.pc = null; } if (s.own) { s.own = false; paintP1(v); } };
    const ownStart = (v) => {
      const s = state[v];
      clearTimeout(s.ownTimer);
      if (!alive || document.hidden || !window.RTCPeerConnection) return;
      if (s.pc) { try { s.pc.close(); } catch { /* nada */ } }
      const pc = s.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], bundlePolicy: 'max-bundle' });
      const ms = new MediaStream();
      const vid = el(v, 'own');
      const again = (ms2) => { if (s.pc !== pc) return; try { pc.close(); } catch { /* nada */ } s.pc = null; if (s.own) { s.own = false; paintP1(v); } s.ownTimer = setTimeout(() => ownStart(v), ms2); };
      pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' });
      pc.ontrack = (e) => { ms.addTrack(e.track); vid.srcObject = ms; vid.play().catch(() => {}); };
      pc.onconnectionstatechange = () => { if (s.pc === pc && ['failed', 'disconnected', 'closed'].includes(pc.connectionState)) again(5000); };
      const limit = setTimeout(() => { if (s.pc === pc && !s.own) again(20000); }, 12000); // sin señal: se reintenta cada tanto
      pc.createOffer().then((o) => pc.setLocalDescription(o))
        .then(() => new Promise((r) => { if (pc.iceGatheringState === 'complete') return r(); const t = setTimeout(r, 1500); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } }); return undefined; }))
        .then(() => fetch(OWN[v], { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: pc.localDescription.sdp }))
        .then((r) => { if (!r.ok) throw new Error(`WHEP ${r.status}`); return r.text(); })
        .then((sdp) => pc.setRemoteDescription({ type: 'answer', sdp }))
        .catch(() => { clearTimeout(limit); again(20000); });
    };
    list.forEach((v) => { el(v, 'own').addEventListener('playing', () => { if (!state[v].own) { state[v].own = true; paintP1(v); } }); });
    // El audio de la transmisión nuestra sube o baja de a poco (el que se deja de escuchar «se va apagando»)
    const fades = {};
    const fade = (v, on) => {
      const vid = el(v, 'own');
      clearInterval(fades[v]);
      if (on) { vid.volume = 0; vid.muted = false; vid.play().catch(() => {}); } else if (vid.muted) return;
      fades[v] = setInterval(() => {
        const next = Math.max(0, Math.min(1, vid.volume + (on ? 0.1 : -0.1)));
        vid.volume = next;
        if (next >= 1 || next <= 0) { clearInterval(fades[v]); if (!on) { vid.muted = true; vid.volume = 1; } }
      }, 40);
    };
    const paintAudio = () => root.querySelectorAll('[data-audio]').forEach((b) => {
      const on = audio === b.dataset.audio;
      b.classList.toggle('on', on);
      if (b.classList.contains('gm-listen')) b.textContent = on ? '🔊 Escuchando' : '🔇 Escuchar';
      else b.querySelector('span').textContent = on ? '🔊' : '🔇';
    });
    const setAudio = (v) => {
      audio = audio === v ? null : v; // tocar de nuevo el que suena lo apaga
      list.forEach((x) => { fade(x, audio === x); paintP1(x); }); // Twitch se vuelve a cargar con o sin sonido
      paintAudio();
    };
    const onVisible = () => list.forEach((v) => (document.hidden ? ownStop(v) : (state[v].pc || ownStart(v))));
    document.addEventListener('visibilitychange', onVisible);

    // Botones tipo TV, cuadrados y en filas de 5 debajo de las pantallas (dibujo de Cote): el que está al aire queda encendido
    const key = (attr, k, icon, text, on) => `<button type="button" class="gm-key ${on ? 'on' : ''}" ${attr}="${k}"><i></i><span>${icon}</span><b>${text}</b></button>`;
    const paintKeys = (v) => {
      const s = state[v];
      const sig = JSON.stringify([s.main && s.main.stage, s.light && [s.light.stage, s.light.text, s.light.video], s.p1]);
      const box = el(v, 'keys');
      // Mientras se escribe el texto del GC personalizable no se redibuja (se perdería lo escrito)
      if (sig === s.keys) return;
      // El texto del GC personalizable va aparte de los botones (no se pierde lo escrito cuando ellos se redibujan)
      const ti = el(v, 'text');
      if (document.activeElement !== ti) ti.value = (s.light && s.light.text) || '';
      s.keys = sig;
      const l = s.light;
      box.innerHTML = `${s.main ? `<div class="gm-row"><small>GC de la sala de juegos</small><div class="gm-keyrow">${MAIN.map(([k, i, t]) => key('data-main', k, i, t, s.main.stage === k)).join('')}</div></div>` : ''}
        ${l ? `<form class="gm-row gm-custom" id="gmf-${v}"><small>GC de la sala light</small><div class="gm-keyrow">${LIGHT.map(([k, i, t]) => key('data-light', k, i, t, l.stage === k)).join('')}
            ${key('data-video', l.video ? '0' : '1', '🎬', 'Video cartelera', !!l.video)}
            <button class="gm-key ${l.stage === 'custom' ? 'on' : ''}"><i></i><span>✏️</span><b>GC PER</b></button>
            ${key('data-p1', 'vivo', '🔴', 'Pantalla 1: vivo', s.p1 === 'vivo')}${key('data-p1', 'gc', '🖼️', 'Pantalla 1: GC', s.p1 === 'gc')}</div></form>` : ''}`;
    };

    const load = async () => {
      const r = await api('GET', '/api/consola').catch(() => null);
      if (!alive || !r) return;
      for (const loc of r.locales) {
        const s = state[loc.venue];
        if (!s) continue;
        s.main = loc.main; s.light = loc.light;
        el(loc.venue, 'sala').textContent = [loc.main && `Sala de juegos: ${loc.main.stageName}`, loc.light && `Sala light: ${loc.light.stageName}`].filter(Boolean).join(' · ');
        paintKeys(loc.venue); paintP1(loc.venue);
      }
    };
    const loadLive = async () => {
      const r = await api('GET', '/api/web/twitch').catch(() => null);
      if (!alive || !r) return;
      for (const v of list) {
        const c = (r.canales || []).find((x) => x.canal === TWITCH[v]);
        const s = state[v];
        s.live = !!(c && c.vivo);
        s.viewers = s.live ? c.vivo.viewers || 0 : 0;
        paintP1(v);
      }
    };

    root.onclick = async (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.audio) { e.preventDefault(); setAudio(b.dataset.audio); return; }
      const box = e.target.closest('.gm-venue');
      if (!b || !box) return;
      const v = box.dataset.v;
      // Pantalla 1: tocar «vivo» o «GC» la deja fija; tocar de nuevo la tecla encendida la devuelve a automático
      if (b.dataset.p1) { e.preventDefault(); state[v].p1 = state[v].p1 === b.dataset.p1 ? 'auto' : b.dataset.p1; paintP1(v); paintKeys(v); return; }
      if (b.type !== 'submit') e.preventDefault();
      if (b.dataset.capa) {
        // Capa gráfica: se dispara sobre el GC de OBS de este local; el texto 3D usa lo escrito en el espacio de texto
        const ti = el(v, 'text'); const text = ti.value.trim();
        if (b.dataset.capa === 'texto3d' && !text) { toast('Escribe el texto para el 3D'); ti.focus(); return; }
        try {
          await api('POST', '/api/capa', { local: v, kind: b.dataset.capa, text: text.slice(0, 60) });
          b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 1500);
          // en el computador los botones van solo con su dibujo: el aviso dice cuál se disparó
          toast(b.dataset.capa === 'off' ? `Capa quitada en ${VENUES[v]}` : `${b.title} en ${VENUES[v]}`);
        } catch (err) { fail(err); }
        return;
      }
      try {
        if (b.dataset.light) await api('POST', '/api/light/stage', { local: v, show: b.dataset.light });
        else if (b.dataset.main === 'per') { // GC PER de la sala de juegos: el texto del mismo espacio de texto del local
          const ti = el(v, 'text'); const text = ti.value.trim();
          if (!text) { toast('Escribe el texto del GC PER'); ti.focus(); return; }
          ti.blur(); await api('POST', '/api/gcper', { on: true, text }); toast(`GC PER en la sala de juegos de ${VENUES[v]}`);
        } else if (b.dataset.main) await api('POST', '/api/stage', { show: b.dataset.main });
        else if (b.dataset.video) await api('POST', '/api/light/video', { local: v, on: b.dataset.video === '1' });
        else return;
        load();
      } catch (err) { fail(err); }
    };
    root.onsubmit = async (e) => {
      const f = e.target.closest('.gm-custom');
      if (!f) return;
      e.preventDefault();
      const v = f.closest('.gm-venue').dataset.v;
      const ti = el(v, 'text');
      const text = ti.value.trim();
      if (!text) { toast('Escribe el texto del GC'); ti.focus(); return; }
      try { ti.blur(); await api('POST', '/api/light/stage', { local: v, show: 'custom', text }); toast(`GC PER en ${VENUES[v]}`); load(); } catch (err) { fail(err); }
    };

    list.forEach(paintP1);
    list.forEach(ownStart);
    await Promise.all([load(), loadLive()]);
    fit();
    const t3 = startClock(root);
    const t1 = setInterval(load, 3000);
    const offAviso = window.onAviso(load); // el botón encendido y los monitores cambian al instante (aviso del servidor)
    const t2 = setInterval(loadLive, 20000);
    return () => { alive = false; offAviso(); clearInterval(t1); clearInterval(t2); clearInterval(t3); ro.disconnect(); document.removeEventListener('visibilitychange', onVisible); list.forEach((v) => { clearInterval(fades[v]); ownStop(v); }); document.body.classList.remove('gm-on'); };
  };

  // #/master: los 3 locales juntos · #/master/<local>: la página de un local · #/master/juegos: la sala de juegos ·
  // #/master/movil: la sala de juegos en el teléfono (se abre con /sala)
  // «Conectados» (pedido de Cote, 22 nov, por el Registro: «ver cuánta gente está conectada, con algún gráfico en vivo…
  // y una pestaña "Registros de conectados"»): por local, cuántas personas hay ahora en la sala de juegos, en la sala
  // light, viendo Twitch y viendo la transmisión nuestra; un gráfico de línea de las últimas 3 horas (un punto por
  // minuto) y, en «Registros de conectados», una fila por jornada (solo en los horarios con actividad real). Servidor:
  // conectados.js (/api/conectados). Colores de las 4 series validados para daltonismo sobre el fondo del GC Master.
  const CON = [['sala', 'Sala de juegos'], ['light', 'Sala light'], ['twitch', 'Twitch'], ['propia', 'Transmisión nuestra']];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const conectados = async () => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on');
    app.innerHTML = `<div id="gm" class="gm-con">${navHTML('conectados')}
      <div class="cx-sub"><button type="button" class="on" data-sub="vivo">En vivo</button><button type="button" data-sub="reg">Registros de conectados</button></div>
      <div class="cx-grid" data-k="vivo"></div><div class="cx-reg" data-k="reg" hidden></div>
      <div class="cx-tip" data-k="tip" hidden></div></div>`;
    const root = $('#gm'); const vivo = root.querySelector('[data-k="vivo"]'); const reg = root.querySelector('[data-k="reg"]'); const tip = root.querySelector('[data-k="tip"]');
    let alive = true; let data = null;
    const hm = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const dia = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const total = (p) => p[1] + p[2] + p[3] + p[4];
    const nice = (m) => { const steps = [4, 8, 12, 20, 40, 80, 120, 200, 400, 800, 1200, 2000, 4000]; return steps.find((x) => x >= m) || Math.ceil(m / 1000) * 1000; };
    // El gráfico: 4 líneas sobre un solo eje que parte en 0; las 3 horas completas siempre a la vista (las líneas crecen hacia la derecha)
    const chart = (box, l) => {
      const W = Math.max(260, box.clientWidth); const H = 190; const L = 30; const R = 10; const T = 8; const B = 20;
      const t1 = data.at; const t0 = t1 - 180 * 60e3; const pts = l.serie.filter((p) => p[0] >= t0);
      const top = nice(Math.max(4, ...pts.map((p) => Math.max(p[1], p[2], p[3], p[4]))));
      const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - R); const y = (v) => T + (1 - v / top) * (H - T - B);
      const grid = [0, 0.5, 1].map((f) => `<line class="cx-g" x1="${L}" x2="${W - R}" y1="${y(top * f)}" y2="${y(top * f)}"/><text class="cx-ax" x="${L - 5}" y="${y(top * f) + 3.5}" text-anchor="end">${Math.round(top * f)}</text>`).join('');
      // marcas de tiempo cada 30 minutos, en punto y a la media
      let ticks = ''; const first = Math.ceil(t0 / 1800e3) * 1800e3;
      for (let t = first; t <= t1; t += 1800e3) ticks += `<line class="cx-g" x1="${x(t)}" x2="${x(t)}" y1="${H - B}" y2="${H - B + 4}"/>${(t / 1800e3) % 2 === 0 ? `<text class="cx-ax" x="${x(t)}" y="${H - 5}" text-anchor="middle">${hm.format(t)}</text>` : ''}`;
      const lines = pts.length ? CON.map(([, name], i) => `<polyline class="cx-l" style="stroke:var(--s${i + 1})" points="${pts.map((p) => `${x(p[0]).toFixed(1)},${y(p[i + 1]).toFixed(1)}`).join(' ')}"><title>${esc(name)}</title></polyline>`).join('') : '';
      box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Conectados en ${esc(l.name)}, últimas 3 horas">${grid}${ticks}${lines}
        <line class="cx-x" data-x y1="${T}" y2="${H - B}" hidden/><g data-dots></g><rect class="cx-hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" tabindex="0"/></svg>
        ${pts.length ? '' : '<p class="cx-empty">El gráfico se va armando solo, con un punto por minuto.</p>'}`;
      const svg = box.querySelector('svg'); const hit = svg.querySelector('.cx-hit'); const xl = svg.querySelector('[data-x]'); const dots = svg.querySelector('[data-dots]');
      const show = (i) => {
        const p = pts[i]; if (!p) return;
        xl.hidden = false; xl.setAttribute('x1', x(p[0])); xl.setAttribute('x2', x(p[0]));
        dots.innerHTML = CON.map((c, k) => `<circle class="cx-d" cx="${x(p[0])}" cy="${y(p[k + 1])}" r="4" style="fill:var(--s${k + 1})"/>`).join('');
        // un solo recuadro con todas las series: el valor manda y el nombre acompaña
        tip.textContent = ''; const h = document.createElement('b'); h.textContent = `${hm.format(p[0])} · ${total(p)} en total`; tip.appendChild(h);
        CON.forEach(([, name], k) => { const row = document.createElement('span'); const key = document.createElement('i'); key.style.background = `var(--s${k + 1})`; const v = document.createElement('strong'); v.textContent = p[k + 1]; const n = document.createElement('em'); n.textContent = name; row.append(key, v, n); tip.appendChild(row); });
        tip.hidden = false; const r = svg.getBoundingClientRect(); const gr = root.getBoundingClientRect(); const px = r.left - gr.left + x(p[0]);
        tip.style.top = `${r.top - gr.top + T}px`; tip.style.left = `${Math.max(4, Math.min(gr.width - tip.offsetWidth - 4, px + (px > gr.width / 2 ? -tip.offsetWidth - 12 : 12)))}px`;
      };
      const hide = () => { xl.hidden = true; dots.innerHTML = ''; tip.hidden = true; };
      let cur = -1;
      const near = (cx) => { if (!pts.length) return -1; const r = svg.getBoundingClientRect(); const t = t0 + ((cx - r.left - L) / (W - L - R)) * (t1 - t0); let best = 0; for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - t) < Math.abs(pts[best][0] - t)) best = i; return best; };
      hit.addEventListener('pointermove', (e) => { cur = near(e.clientX); show(cur); });
      hit.addEventListener('pointerleave', hide); hit.addEventListener('blur', hide);
      hit.addEventListener('focus', () => { cur = pts.length - 1; show(cur); });
      hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); cur = Math.max(0, Math.min(pts.length - 1, cur + (e.key === 'ArrowLeft' ? -1 : 1))); show(cur); } });
    };
    const horario = (l) => (l.jornada ? `En horario · ${l.jornada.from} a ${l.jornada.to} · se está registrando` : `Fuera de horario · no se registra (${l.horarios.map(([d, f, t]) => `${DIAS[d]} ${f} a ${t}`).join(' · ')})`);
    const paintVivo = () => {
      if (!vivo.children.length) vivo.innerHTML = data.locales.map((l) => `<section class="cx-card th-${l.venue}" data-v="${l.venue}">
          <div class="cx-head"><b>${esc(l.name)}</b><small data-k="hor"></small></div>
          <div class="cx-hero"><b data-k="tot">0</b><span>conectados ahora</span></div>
          <ul class="cx-leg">${CON.map(([k, name], i) => `<li><i style="background:var(--s${i + 1})"></i><span>${name}</span><b data-k="n-${k}">0</b><small data-k="x-${k}"></small></li>`).join('')}</ul>
          <div class="cx-chart" data-k="chart"></div>
          <details class="cx-tabla"><summary>Ver como tabla</summary><div data-k="tabla"></div></details></section>`).join('');
      for (const l of data.locales) {
        const c = vivo.querySelector(`[data-v="${l.venue}"]`); const q = (k) => c.querySelector(`[data-k="${k}"]`); const n = l.now;
        q('hor').textContent = horario(l); q('tot').textContent = n.sala + n.light + n.twitch + n.propia;
        for (const [k] of CON) q(`n-${k}`).textContent = n[k];
        q('x-sala').textContent = n.salaTotal ? `de ${n.salaTotal} ${n.salaTotal === 1 ? 'inscrito' : 'inscritos'}` : '';
        if (tip.hidden) chart(q('chart'), l); // con el cursor encima no se redibuja
        const rows = l.serie.filter((p, i, a) => i === a.length - 1 || Math.floor(p[0] / 900e3) !== Math.floor(a[i + 1][0] / 900e3)).slice(-12).reverse(); // un valor cada 15 min
        q('tabla').innerHTML = rows.length ? `<table><thead><tr><th>Hora</th>${CON.map(([, name]) => `<th>${name}</th>`).join('')}<th>Total</th></tr></thead><tbody>${rows.map((p) => `<tr><td>${hm.format(p[0])}</td><td>${p[1]}</td><td>${p[2]}</td><td>${p[3]}</td><td>${p[4]}</td><td>${total(p)}</td></tr>`).join('')}</tbody></table>` : '<p class="cx-empty">Aún no hay datos.</p>';
      }
    };
    const COLS = [['Fecha', (j) => dia.format(j.first)], ['Local', (j) => j.name], ['Desde', (j) => hm.format(j.first)], ['Hasta', (j) => hm.format(j.last)], ['Máximo de conectados', (j) => j.max], ['Hora del máximo', (j) => hm.format(j.maxAt)], ['Promedio', (j) => String(j.avg).replace('.', ',')],
      ['Sala de juegos (máx.)', (j) => j.salaMax], ['Inscritos en la sala', (j) => j.salaTotal], ['Sala light (máx.)', (j) => j.lightMax], ['Twitch (máx.)', (j) => j.twitchMax], ['Transmisión nuestra (máx.)', (j) => j.propiaMax]];
    const paintReg = () => {
      const js = data.jornadas;
      reg.innerHTML = `<div class="cx-reghead"><p>Una fila por jornada. Solo se registra en los horarios con actividad: ${data.locales.map((l) => `<b>${esc(l.name)}</b> ${l.horarios.map(([d, f, t]) => `${DIAS[d]} ${f} a ${t}`).join(', ')}`).join(' · ')}.</p>
          <button type="button" class="btn" data-csv ${js.length ? '' : 'disabled'}>⬇ Bajar a Excel</button></div>
        ${js.length ? `<div class="cx-scroll"><table><thead><tr>${COLS.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${js.map((j) => `<tr class="th-${j.venue}">${COLS.map(([, f]) => `<td>${esc(f(j))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="cx-empty">Todavía no hay jornadas registradas. La primera fila aparece cuando haya gente conectada dentro de un horario con actividad.</p>'}`;
    };
    const load = async () => {
      const r = await api('GET', '/api/conectados').catch(() => null);
      if (!alive || !r) return;
      data = r; paintVivo(); if (!reg.hidden) paintReg();
    };
    root.onclick = (e) => {
      const b = e.target.closest('button'); if (!b || !data) return;
      if (b.dataset.sub) { root.querySelectorAll('[data-sub]').forEach((x) => x.classList.toggle('on', x === b)); vivo.hidden = b.dataset.sub !== 'vivo'; reg.hidden = b.dataset.sub !== 'reg'; tip.hidden = true; if (!reg.hidden) paintReg(); else paintVivo(); }
      if (b.dataset.csv !== undefined) { // punto y coma y marca de inicio: así Excel lo abre con tildes y en columnas
        const csv = [COLS.map(([h]) => h), ...data.jornadas.map((j) => COLS.map(([, f]) => f(j)))].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); a.download = 'registros-de-conectados.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    };
    const onResize = () => { if (data && !vivo.hidden) paintVivo(); };
    window.addEventListener('resize', onResize);
    await load();
    const t3 = startClock(root); const t1 = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t1); clearInterval(t3); window.removeEventListener('resize', onResize); document.body.classList.remove('gm-on'); };
  };

  views.master = (v) => (v === 'movil' ? movil() : v === 'conectados' ? conectados() : v === 'juegos' ? juegos() : VENUES[v] ? master([v], true) : master(ORDER, false));
})();
