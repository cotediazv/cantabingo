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
  const MAIN = [['bingo', '🎱', 'Bingo'], ['rueda', '🎡', 'El Rosko'], ['sorteo', '🎲', 'Sorteo'], ['voto', '🗳️', 'Votación'], ['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show'], ['insta', '📸', 'Instagram'], ['desafio', '🏆', '¿Ganador?'], ['qr', '📱', 'QR'], ['none', '⛔', 'Nada'], ['per', '✏️', 'GC PER']]; // «GC PER»: el texto escrito, en la franja del GC (no es un escenario: /api/gcper)
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
        <!-- Mercado Kennedy: la pantalla 3 es la versión liviana (pv.html), la que de verdad se ve en el salón: su decodificador usa esa (pedido de Cote, 23 nov, por el documento de la web) -->
        <div class="gm-scr gm-tall"><small>3 · Vertical</small>
          <div class="gm-box" data-w="720"><iframe title="Pantalla vertical de ${esc(VENUES[v])}" tabindex="-1" src="${v === 'kennedy' ? '/pv.html?p=kennedy' : page(`#/vertical-in/${VERT[v]}`)}"></iframe></div></div>
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
        <a class="gm-tab ${on === 'demo' ? 'on' : ''}" href="#/master/demo">Demo</a>
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
    let own = false; let live = false; let pc = null; let timer = null; let dead = false; let src = ''; let sound = false;
    const paint = () => {
      if (dead) return;
      const mode = own ? 'own' : live ? 'twitch' : 'gc';
      label(mode === 'own' ? 'Transmisión nuestra' : mode === 'twitch' ? 'Twitch' : 'GC · sin transmisión');
      const next = mode === 'own' ? 'own' : mode === 'twitch' ? `https://player.twitch.tv/?channel=${TWITCH[v]}&parent=${location.hostname}&muted=${sound ? 'false' : 'true'}&autoplay=true` : '/?mudo=1&mon=1#/escena';
      vid.muted = !(sound && mode === 'own');
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
    const stop = () => { dead = true; clearInterval(t); document.removeEventListener('visibilitychange', onVisible); clearTimeout(timer); if (pc) { try { pc.close(); } catch { /* nada */ } pc = null; } };
    // Sonido de la señal 1: la transmisión nuestra se abre o se cierra al instante; Twitch se vuelve a cargar con o sin sonido
    stop.sound = (on) => { sound = !!on; paint(); if (sound && own) vid.play().catch(() => {}); };
    return stop;
  };

  // Sonido y pantalla grande de los monitores de la sala de juegos (pedido de Cote, 23 nov: «habilitar sonido para pantalla
  // 1 y 2, yo elijo cuál suena, también la opción de pantalla completa dentro de la zona delimitada para pantalla»). Todo
  // parte en silencio; suena una sola a la vez (tocar la que suena la apaga). La 1 es la señal (transmisión nuestra o
  // Twitch; el GC solo no tiene sonido) y la 2 el tablero con los sonidos de los juegos. «⛶» agranda esa pantalla dentro
  // de la zona de las pantallas, por encima de las otras y sin tapar los botones; «✕» la devuelve a su lugar.
  const TOOLS = (n, snd) => `<div class="gm-tools">${snd ? `<button type="button" class="gm-tool" data-snd="${n}" aria-pressed="false"><span>🔇</span><b>Sonido</b></button>` : ''}<button type="button" class="gm-tool" data-big="${n}" aria-pressed="false"><span>⛶</span><b>Grande</b></button></div>`;
  const tabSrc = (mute) => `/?${mute ? 'mudo=1&' : ''}mon=1#/tablero`;
  // El demo de luces de Code 4 (copia en /demo-luces/): la vista 3D del salón con las pantallas del local en vivo
  // (fondo del escenario = pantalla 2, columnas = pantalla 3, las de 42" = la transmisión con el GC). Las páginas van
  // en su versión liviana y sin sonido, como los monitores del GC Master
  // El mapa del salón bajo las pantallas del Demo (pedido de Cote, 24 nov: «para poder seguir al animador con el dedo o
  // con el mouse… como lo va a hacer el DJ»): el iPad de luces de Code 4 en modo control, que maneja el demo de este
  // navegador; `?demo=mapa` es su página de solo el mapa y los botones de las cabezas (las cabezas ya no siguen solas)
  const MAPA = '<div class="dm-map"><small>Mapa del salón · sigue al animador con el dedo o el mouse</small><iframe title="Mapa del salón para seguir al animador" src="/demo-luces/ipad.html?demo=mapa"></iframe></div>';
  const DEMO3D = () => `/demo-luces/ipad.html?demo=tv&p2=${encodeURIComponent(page('#/tablero'))}&p3=${encodeURIComponent(page('#/tablero'))}&gc=${encodeURIComponent(page('#/escena'))}`;
  const monCtl = (fit) => {
    let snd = null; let big = null; let zone = null; let sig = null;
    const paint = () => {
      if (!zone) return;
      zone.querySelectorAll('[data-snd]').forEach((b) => { const on = snd === b.dataset.snd; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.title = on ? `Silenciar la pantalla ${b.dataset.snd}` : `Escuchar la pantalla ${b.dataset.snd}`; b.querySelector('span').textContent = on ? '🔊' : '🔇'; b.querySelector('b').textContent = on ? 'Sonando' : 'Sonido'; });
      zone.querySelectorAll('.gm-scr[data-n]').forEach((x) => x.classList.toggle('gm-big', big === x.dataset.n));
      zone.querySelectorAll('[data-big]').forEach((b) => { const on = big === b.dataset.big; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.title = on ? 'Volver al tamaño normal' : `Agrandar la pantalla ${b.dataset.big}`; b.querySelector('span').textContent = on ? '✕' : '⛶'; b.querySelector('b').textContent = on ? 'Cerrar' : 'Grande'; });
      zone.classList.toggle('gm-hasbig', !!big);
      fit();
    };
    const apply = () => {
      if (!zone) return;
      if (sig && sig.sound) sig.sound(snd === '1');
      const f = zone.querySelector('iframe[data-tab]'); const want = tabSrc(snd !== '2');
      if (f && f.getAttribute('src') !== want) f.setAttribute('src', want);
    };
    return {
      attach(z, s2) { zone = z; sig = s2; if (!z) return; apply(); paint(); },
      click(b) {
        if (b.dataset.snd) { snd = snd === b.dataset.snd ? null : b.dataset.snd; apply(); paint(); toast(snd ? `Suena la pantalla ${snd}` : 'Todo en silencio'); return true; }
        if (b.dataset.big) { big = big === b.dataset.big ? null : b.dataset.big; paint(); return true; }
        return false;
      },
    };
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

  // Todo a la vista sin bajar la página (pedido de Cote, 25 nov: «en GC Master, que todas las herramientas entren en
  // pantalla, tanto en computador como en iPad o iPhone»). Si lo que hay en la página es más alto o más ancho que la
  // ventana, la página entera se achica lo justo (zoom) para que quepa; si después sobra espacio, vuelve a crecer (hasta
  // su tamaño normal). No baja de «min»: más chico no se podría usar (ahí se baja la página, como antes).
  const encaja = (root, { min = 0.5 } = {}) => {
    let z = 1;
    const main = root.parentElement;
    const apply = (nz) => {
      z = nz;
      root.style.zoom = z === 1 ? '' : String(z);
      // las pantallas se miden por el ancho: al achicar, la página conserva su ancho (así también baja su alto) y queda centrada
      const cs = main ? getComputedStyle(main) : null;
      const mw = main ? main.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) : 0;
      root.style.width = z === 1 || !mw ? '' : `${mw}px`;
      root.style.marginLeft = z === 1 || !mw ? '' : `${((mw / z) - mw) / 2}px`;
    };
    const run = () => {
      if (!root.isConnected) return;
      const H = window.innerHeight; const W = window.innerWidth;
      const pad = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const bottom = Math.max(root.getBoundingClientRect().bottom + window.scrollY + 10, document.documentElement.scrollHeight - pad); // también lo que sobresale
      const wide = document.documentElement.scrollWidth;
      if (bottom <= H + 2 && wide <= W + 2) { if (z < 1 && bottom < H * 0.9 && !rt) reset(); return; } // sobra mucho: se vuelve a medir desde el tamaño normal
      const nz = Math.max(min, Math.floor(z * Math.min(1, (H - 6) / bottom, W / wide) * 200) / 200);
      if (nz < z - 0.004) apply(nz);
    };
    // al abrir y al cambiar el tamaño de la ventana (o girar el iPad/teléfono) se parte del tamaño normal y se achica lo
    // justo; mientras tanto solo se achica más si algo nuevo no cabe
    let rt = null;
    const reset = () => { clearTimeout(rt); rt = setTimeout(() => { apply(1); rt = setTimeout(() => { rt = null; run(); }, 400); }, 250); };
    const t = setInterval(run, 700);
    window.addEventListener('resize', reset);
    setTimeout(run, 1200);
    return { stop: () => { clearInterval(t); clearTimeout(rt); window.removeEventListener('resize', reset); apply(1); }, z: () => z };
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
    const ctl = monCtl(fit);
    const key = (k, icon, text, on) => `<button type="button" class="gm-key ${on ? 'on' : ''}" data-main="${k}"><i></i><span>${icon}</span><b>${text}</b></button>`;
    const paintKeys = () => { const box = gc.querySelector('[data-k="keys"]'); if (box) box.innerHTML = MAIN.map(([k, i, t]) => key(k, i, t, stage === k)).join(''); };
    const paint = () => {
      ro.disconnect();
      root.querySelector('[data-k="mtitle"]').textContent = venue ? VENUES[venue] : 'Sala de juegos';
      if (sigStop) { sigStop(); sigStop = null; }
      mon.innerHTML = venue ? `<div class="gm-scr th-${venue}" data-n="1"><small>1 · <span data-k="p1name">GC</span></small>${TOOLS(1, true)}<div class="gm-box" data-w="1280" data-k="p1box"></div></div>${[['2 · Tablero', 1280, '', 2], ['3 · De pie', 720, 'gm-tall', 3]].map(([t, w, tall, n]) => `<div class="gm-scr ${tall} th-${venue}" data-n="${n}"><small>${t}</small>${TOOLS(n, n === 2)}<div class="gm-box" data-w="${w}"><iframe title="${t}" tabindex="-1" ${n === 2 ? 'data-tab="1" ' : ''}src="${tabSrc(true)}"></iframe></div></div>`).join('')}`
        : '<p class="gmm-none">No hay sala de juegos abierta. Créala aquí abajo, con «Crear sala de juegos».</p>';
      if (venue) sigStop = signal1(mon.querySelector('[data-k="p1box"]'), venue, { fit, label: (t) => { const el = mon.querySelector('[data-k="p1name"]'); if (el) el.textContent = t; } });
      gc.innerHTML = venue ? `<div class="gm-venue th-${venue}" data-v="${venue}">
          <div class="gm-row"><small>GC de la sala de juegos</small><div class="gm-keyrow" data-k="keys"></div></div>
          <div class="gm-row"><small>Efectos sobre la cámara</small>
            <input class="gm-text" data-k="text" type="text" maxlength="120" autocomplete="off" placeholder='Texto para el GC PER y el texto 3D · "entre comillas" sale destacado'>
            <div class="gm-capa">${CAPA.map(([k, i, t, full]) => `<button type="button" class="gm-ckey" data-capa="${k}" title="${full}" aria-label="${full}"><span>${i}</span><b>${t}</b></button>`).join('')}</div></div></div>`
        : '<p class="gmm-none">Cuando haya una sala de juegos abierta, aquí aparecen los botones del GC y los efectos.</p>';
      root.querySelectorAll('.gm-box').forEach((b) => ro.observe(b));
      ctl.attach(venue ? mon : null, sigStop);
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
      if (ctl.click(b)) return;
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
  // Demo (pedido de Cote, 23 y 24 nov): la misma pestaña «Sala de juegos», pero con la sala simulada (personas virtuales),
  // una «cámara» simulada en la pantalla 1 (la vista 3D de Code 4, que calcula las luces en el navegador sin tocar las
  // luces reales y muestra al animador virtual, con el GC real de la sala encima) y la vista previa del celular de la
  // persona protagonista: automático (quien está en el escenario) o la que se elija.
  const juegos = async (demo = false) => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on');
    const sim0 = demo ? await api('GET', '/api/sim').catch(() => null) : null;
    const open0 = demo ? ((await api('GET', '/api/current').catch(() => ({}))).sessions || [])[0] : null;
    if (demo && !location.hash.startsWith('#/master/demo')) return undefined; // ya se cambió de pestaña mientras se esperaba
    app.innerHTML = `<div id="gm" class="gm-all gm-jg ${demo ? 'gm-demo' : ''}" data-pane="juego">${navHTML(demo ? 'demo' : 'juegos')}
      <div class="gm-btnrow"><a class="gm-movil" href="/sala">📱 Abrir la versión para el teléfono</a>
      <button type="button" class="gm-fuerabtn" data-k="fuera">🖥️ Pantallas en otra ventana</button>
      ${demo ? '<button type="button" class="gm-fuerabtn" data-k="luces" title="El iPad de las luces de Code 4, manejando el demo de este navegador: con «Anda al público» se abre el mapa para seguir al animador a mano">💡 Luces del demo</button>' : ''}</div>
      <div class="gm-grid"><div class="gm-jgleft" data-k="left"></div>
        <div class="gm-jgright"><div class="gm-panel"><iframe title="Panel de la sala de juegos" src="${location.pathname}${demo && !open0 ? '#/simulada' : '#/juegos'}"></iframe></div><div class="gm-jgctl" data-k="ctl"></div></div></div>
      <div class="gm-panes" data-k="panes"><button type="button" data-pane="juego" class="on">🎮 Juego</button><button type="button" data-pane="gc">🎛️ GC y efectos</button>${demo ? '<button type="button" data-pane="mapa">🗺️ Mapa</button>' : ''}</div></div>`;
    const root = $('#gm');
    // En el iPad de pie y en el teléfono (pedido de Cote, 25 nov: todo a la vista): versión compacta, como «Sala KRB»:
    // arriba las pantallas y, al medio, lo que eligen las teclas de abajo: el panel del juego, los botones del GC y los
    // efectos, o el mapa del salón (en el demo)
    const compact = () => { const c = window.innerWidth < 900 || window.innerHeight > window.innerWidth * 1.15; root.classList.toggle('gm-compact', c); document.body.classList.toggle('gm-compactpage', c); };
    compact();
    root.querySelector('[data-k="panes"]').onclick = (e) => {
      const b = e.target.closest('[data-pane]'); if (!b) return;
      root.dataset.pane = b.dataset.pane;
      root.querySelectorAll('.gm-panes [data-pane]').forEach((x) => x.classList.toggle('on', x === b));
      setTimeout(() => { fit(); fitPanel(); }, 50);
    };
    // Computador e iPad acostado: el panel de la derecha mide lo que queda bajo los botones del GC, y el mapa del demo,
    // lo que queda abajo (con un mínimo); si aun así no cabe, la página se achica sola (encaja)
    const fitMap = () => {
      const ctlEl = root.querySelector('[data-k="ctl"]');
      root.style.setProperty('--ctlh', `${ctlEl && !ctlEl.hidden ? ctlEl.offsetHeight + 10 : 0}px`);
      const m = root.querySelector('.dm-map iframe');
      if (!m || root.classList.contains('gm-compact')) { if (m) m.style.height = ''; return; }
      if (fitter.z() < 1) return; // ya achicada: el mapa queda como está
      const h = Math.max(180, Math.floor(window.innerHeight - m.getBoundingClientRect().top - 20));
      if (Math.abs(h - m.offsetHeight) > 3) m.style.height = `${h}px`;
    };
    const fitter = encaja(root);
    const tFitMap = setInterval(() => { compact(); fitMap(); }, 500);
    const left = root.querySelector('[data-k="left"]');
    const ctlBox = root.querySelector('[data-k="ctl"]'); // los botones del GC y de los efectos van a la derecha, debajo del panel de los juegos (pedido de Cote, 23 nov), para que las pantallas queden más grandes
    let alive = true; let venue = null; let stage = ''; let sigStop = null;
    // Pantallas en otra ventana (pedido de Cote, 24 nov): mientras esté abierta, aquí no se repiten las pantallas
    // (en el demo queda el celular) y el panel tiene más espacio; al cerrarla vuelven solas
    let away = null;
    const fueraBtn = root.querySelector('[data-k="fuera"]');
    fueraBtn.onclick = () => {
      if (away && !away.closed) { away.close(); away = null; root.classList.remove('gm-fuera'); paintLeft(); return; } // traerlas de vuelta
      away = window.open(`${location.pathname}#/master/pantallas${demo ? '-demo' : ''}`, 'gmPantallas', 'popup,width=1600,height=900');
      if (away) { root.classList.add('gm-fuera'); paintLeft(); }
    };
    // Luces del demo (Code 4, 24 nov): su iPad de las luces en modo «control», que maneja el demo abierto en este mismo
    // navegador (la pantalla 1); en otro equipo no funciona, porque se hablan dentro del navegador
    const lucesBtn = root.querySelector('[data-k="luces"]');
    if (lucesBtn) lucesBtn.onclick = () => { const w = window.open('/demo-luces/ipad.html?demo=control', 'gmLuces', 'popup,width=1100,height=820'); if (w) w.focus(); };
    const tAway = setInterval(() => { if (away && away.closed) { away = null; root.classList.remove('gm-fuera'); paintLeft(); } }, 1000);
    const fit = () => root.querySelectorAll('.gm-box').forEach((box) => { const k = `scale(${box.clientWidth / Number(box.dataset.w || 1280)})`; if (box.classList.contains('dm-cam')) box.querySelectorAll('iframe').forEach((f) => { f.style.transform = k; }); else { const f = box.querySelector('iframe:not([data-full])'); if (f) f.style.transform = k; } });
    const ro = new ResizeObserver(fit);
    const ctl = monCtl(fit);
    const key = (k, icon, text, on) => `<button type="button" class="gm-key ${on ? 'on' : ''}" data-main="${k}"><i></i><span>${icon}</span><b>${text}</b></button>`;
    const paintKeys = () => { const box = ctlBox.querySelector('[data-k="keys"]'); if (box) box.innerHTML = `<div class="gm-row"><small>GC de la sala de juegos</small><div class="gm-keyrow">${MAIN.map(([k, i, t]) => key(k, i, t, stage === k)).join('')}</div></div>`; };
    const paintLeft = () => {
      ro.disconnect();
      if (sigStop) { sigStop(); sigStop = null; }
      fueraBtn.textContent = away ? '🖥️ Las pantallas están en la otra ventana · traerlas aquí' : '🖥️ Pantallas en otra ventana';
      left.innerHTML = venue && away ? `<section class="gm-venue th-${venue}" data-v="${venue}">
          <header class="gm-head"><b>Sala de juegos · ${esc(VENUES[venue])}</b><span class="gm-sala" data-k="sala"></span></header>
          <p class="gm-fueranote">Las pantallas se ven en la otra ventana.</p>
          ${demo ? `<div class="gm-screens dm-solo"><div class="gm-scr gm-tall dm-phone" data-n="4"><small>Celular</small><div class="gm-box" data-w="390"><iframe title="Celular de la persona protagonista" tabindex="-1"></iframe></div></div></div>
          <div class="dm-ctl"><label>Celular de <select data-k="who"><option value="">Automático: quien está en el escenario</option></select></label><span class="dm-who" data-k="whoName"></span></div>${MAPA}` : ''}
          </section>`
        : venue ? `<section class="gm-venue th-${venue}" data-v="${venue}">
          <header class="gm-head"><b>Sala de juegos · ${esc(VENUES[venue])}</b><span class="gm-sala" data-k="sala"></span></header>
          <div class="gm-screens">
            <div class="gm-left">
              <div class="gm-scr" data-n="1"><small>1 · <span data-k="p1name">${demo ? 'Cámara · demo' : 'GC'}</span></small>${TOOLS(1, !demo)}<div class="gm-box ${demo ? 'dm-cam' : ''}" data-w="1280" data-k="p1box"></div></div>
              <div class="gm-scr" data-n="2"><small>2 · Tablero</small>${TOOLS(2, true)}<div class="gm-box" data-w="1280"><iframe title="Tablero de la sala de juegos" tabindex="-1" data-tab="1" src="${tabSrc(true)}"></iframe></div></div>
            </div>
            <div class="gm-scr gm-tall" data-n="3"><small>3 · De pie</small>${TOOLS(3, false)}<div class="gm-box" data-w="720"><iframe title="Pantalla de pie de la sala de juegos" tabindex="-1" src="${page('#/tablero')}"></iframe></div></div>${demo ? `<div class="gm-scr gm-tall dm-phone" data-n="4"><small>Celular</small>${TOOLS(4, false)}<div class="gm-box" data-w="390"><iframe title="Celular de la persona protagonista" tabindex="-1"></iframe></div></div>` : ''}
          </div>
          ${demo ? `<div class="dm-ctl"><label>Celular de <select data-k="who"><option value="">Automático: quien está en el escenario</option></select></label><span class="dm-who" data-k="whoName"></span>
            <label class="dm-vista">Vista 3D de Code 4 <input data-k="vista" type="url" placeholder="Vacío: la copia de la Sala (/demo-luces/)"><button type="button" data-k="vistaSave">Guardar</button></label></div>${MAPA}` : ''}
          </section>`
        : `<section class="gm-venue gm-none"><header class="gm-head"><b>${demo ? 'Demo · sala simulada' : 'Sala de juegos'}</b></header>
          <p>${demo ? 'Crea la sala simulada en el panel de al lado: elige el local y cuántas personas virtuales. Cuando esté lista, aquí aparecen la cámara simulada, las pantallas y el celular.' : 'No hay sala de juegos abierta. Créala en el panel de al lado («Crear sala de juegos»); cuando esté abierta, aquí aparecen sus pantallas y sus botones.'}</p></section>`;
      ctlBox.className = venue ? `gm-jgctl gm-venue th-${venue}` : 'gm-jgctl'; ctlBox.hidden = !venue;
      ctlBox.innerHTML = venue ? `<div class="gm-keys" data-k="keys"></div>
          <div class="gm-txtrow">
            <input class="gm-text" data-k="text" type="text" maxlength="120" autocomplete="off" placeholder='Texto para el GC PER y el texto 3D · "entre comillas" sale destacado'>
            <div class="gm-capa" title="Capa gráfica sobre la cámara">${CAPA.map(([k, i, t, full]) => `<button type="button" class="gm-ckey" data-capa="${k}" title="${full}" aria-label="${full}"><span>${i}</span><b>${t}</b></button>`).join('')}</div></div>` : '';
      if (venue && away) { /* las pantallas están en la otra ventana */ } else if (venue && demo) demoCam(); else if (venue) sigStop = signal1(left.querySelector('[data-k="p1box"]'), venue, { fit, label: (t) => { const el = left.querySelector('[data-k="p1name"]'); if (el) el.textContent = t; } });
      root.querySelectorAll('.gm-box').forEach((b) => ro.observe(b));
      ctl.attach(venue && !away ? left.querySelector('.gm-screens') : null, sigStop);
      if (demo && venue) { phoneSrc = ''; whoList = ''; demoWho(); }
      paintKeys(); fit();
    };
    // ---------- Demo ----------
    let vista = (sim0 && sim0.vista) || ''; let phoneSrc = ''; let whoList = ''; let who = '';
    // Pantalla 1: la vista 3D de Code 4 (con las luces y el animador virtual) y, encima, el GC real de la sala
    function demoCam() {
      const box = left.querySelector('[data-k="p1box"]'); if (!box) return;
      // Por defecto, la copia del demo de luces de Code 4 que está en la Sala (/demo-luces/, modo «tv»: solo la vista 3D
      // con la cámara sobre el animador); se puede cambiar por otra dirección en «Vista 3D de Code 4»
      const v3d = vista || DEMO3D();
      box.innerHTML = `${v3d ? `<iframe class="dm-v3d" title="Vista 3D del salón (Code 4)" src="${esc(v3d)}" onload="this.dataset.ok=1"></iframe>` : '<div class="dm-stage"><span>La cámara simulada (la vista 3D del salón con las luces y el animador, de Code 4) aparece aquí cuando esté lista. Mientras tanto se ve solo el GC.</span></div>'}<iframe class="dm-gc" title="GC de la sala de juegos" tabindex="-1" src="${page('#/escena')}"></iframe>`;
      const vi = left.querySelector('[data-k="vista"]'); if (vi) vi.value = vista;
      fit();
    }
    // Los momentos de los juegos llegan a la vista 3D como en el escenario real (Code 4: postMessage({momento}))
    let momSeq = null;
    async function demoMom() {
      const r = await api('GET', `/api/momentos?desde=${momSeq == null ? 0 : momSeq}`).catch(() => null);
      if (!alive || !r) return;
      const first = momSeq == null; momSeq = r.seq;
      if (first) return; // al abrir no se repiten los momentos viejos
      const f = left.querySelector('.dm-v3d');
      if (f && f.contentWindow) for (const m of r.momentos) f.contentWindow.postMessage({ momento: m.name, escalon: m.escalon }, '*');
    }
    // El celular: el de quien está en el escenario (automático) o el que se elige
    async function demoWho() {
      const r = await api('GET', `/api/sim/protagonista${who ? `?token=${encodeURIComponent(who)}` : ''}`).catch(() => null);
      if (!alive || !r) return;
      const sel = left.querySelector('[data-k="who"]');
      const listKey = (r.people || []).map((x) => x.token).join(',');
      if (sel && listKey !== whoList) { whoList = listKey; sel.innerHTML = `<option value="">Automático: quien está en el escenario</option>${(r.people || []).map((x) => `<option value="${esc(x.token)}">${esc(x.name)}</option>`).join('')}`; sel.value = who; }
      const nm = left.querySelector('[data-k="whoName"]'); if (nm) nm.textContent = r.token ? `${r.name}${r.why ? ` · ${r.why}` : ''}` : 'nadie en la sala';
      const f = left.querySelector('.dm-phone iframe');
      const src = r.token && r.sid ? `${location.pathname}?como=${encodeURIComponent(r.token)}&mudo=1&mon=1#/jugar/${r.sid}` : '';
      if (f && src !== phoneSrc) { phoneSrc = src; f.src = src || 'about:blank'; }
    }
    left.addEventListener('change', (e) => { if (e.target.matches('[data-k="who"]')) { who = e.target.value; demoWho(); } });
    left.addEventListener('click', async (e) => {
      if (!e.target.matches('[data-k="vistaSave"]')) return;
      const v = left.querySelector('[data-k="vista"]').value.trim();
      try { const r = await api('POST', '/api/sim/vista', { url: v }); vista = r.vista || ''; demoCam(); toast(vista ? 'Vista 3D guardada' : 'Vista 3D quitada'); } catch (err) { fail(err); }
    });
    const load = async () => {
      const r = await api('GET', '/api/consola').catch(() => null);
      if (!alive || !r) return;
      const loc = (r.locales || []).find((x) => x.main);
      const v = loc ? loc.venue : null;
      const st = loc ? loc.main.stage : '';
      if (v !== venue) { venue = v; stage = st; paintLeft(); } else if (st !== stage) { stage = st; paintKeys(); }
      if (demo && venue) { demoWho(); demoMom(); }
      const sala = left.querySelector('[data-k="sala"]');
      if (sala && loc) sala.textContent = `En pantalla: ${loc.main.stageName}`;
      const ti = ctlBox.querySelector('[data-k="text"]'); if (ti && loc && loc.main.perText && !ti.value && document.activeElement !== ti) ti.value = loc.main.perText; // el último texto del GC PER queda a mano
    };
    root.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b || !venue || !(left.contains(b) || ctlBox.contains(b))) return;
      e.preventDefault();
      if (ctl.click(b)) return;
      try {
        if (b.dataset.main === 'per') {
          const ti = ctlBox.querySelector('[data-k="text"]'); const text = ti.value.trim();
          if (!text) { toast('Escribe el texto del GC PER'); ti.focus(); return; }
          ti.blur(); await api('POST', '/api/gcper', { on: true, text }); toast('GC PER en pantalla'); load();
        } else if (b.dataset.main) { await api('POST', '/api/stage', { show: b.dataset.main }); load(); } else if (b.dataset.capa) {
          const ti = ctlBox.querySelector('[data-k="text"]'); const text = ti.value.trim();
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
    return () => { alive = false; offAviso(); if (sigStop) sigStop(); clearInterval(t1); clearInterval(t3); clearInterval(t4); clearInterval(tAway); clearInterval(tFitMap); fitter.stop(); window.removeEventListener('resize', fitPanel); ro.disconnect(); document.body.classList.remove('gm-on', 'gm-compactpage'); };
  };

  // Pantallas en otra ventana (pedido de Cote, 24 nov: «poder abrir una pantalla secundaria, para que las pantallas estén
  // en una pantalla y el control en otra… con distintas vistas, por lo menos unas cinco versiones… y una sexta para
  // personalizar: poder agrandar o achicar manualmente las pantallas»). Las 3 pantallas de la sala de juegos abierta
  // (en el demo, la 1 es la cámara simulada) en una ventana aparte, con 6 vistas; la elegida y la personalizada quedan
  // guardadas en este computador. La barra de arriba se esconde sola si no se mueve el mouse.
  const VISTAS = [
    ['p1', '1 grande', 'La pantalla 1 protagonista y las otras más pequeñas'],
    ['iguales', 'Iguales', 'La 1, la 2 y la 3 del mismo alto'],
    ['p2', '2 grande', 'La pantalla 2 protagonista'],
    ['p3', '3 grande', 'La pantalla 3 (de pie) protagonista'],
    ['mosaico', '1 y 2 apiladas', 'La 1 arriba, la 2 abajo y la 3 a la derecha'],
    ['libre', 'Personalizada', 'Arrastra cada pantalla por su nombre y agrándala o achícala desde la esquina'],
  ];
  const SCR = { 1: [1280, 720], 2: [1280, 720], 3: [720, 1280] };
  const LIBRE0 = { 1: { x: 1, y: 2, w: 60 }, 2: { x: 1, y: 52, w: 38 }, 3: { x: 70, y: 2, w: 27 } };
  const memGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
  const memSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin memoria */ } };
  const pantallas = async (demo) => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gp-on');
    document.title = demo ? 'Pantallas · Demo' : 'Pantallas · Sala de juegos';
    let vista = memGet('gpVista', 'p1');
    if (!VISTAS.some(([k]) => k === vista)) vista = 'p1';
    const libre = { ...LIBRE0, ...memGet('gpLibre', {}) };
    app.innerHTML = `<div id="gp" class="gp-${vista}">
      <div class="gp-bar">${VISTAS.map(([k, t, d]) => `<button type="button" data-vista="${k}" title="${esc(d)}" class="${k === vista ? 'on' : ''}">${esc(t)}</button>`).join('')}
        <button type="button" data-full="1" title="Toda la ventana en pantalla completa">⛶ Pantalla completa</button>
        ${demo ? '' : '<button type="button" data-snd="1" title="Escuchar la señal 1 (transmisión)">🔇 Sonido 1</button>'}<button type="button" data-snd="2" title="Escuchar el tablero (los sonidos de los juegos)">🔇 Sonido 2</button><span data-k="info"></span></div>
      <div class="gp-hot" title="Acerca el mouse aquí para ver las opciones"></div><div class="gp-area" data-k="area"></div></div>`;
    const root = $('#gp'); const area = root.querySelector('[data-k="area"]');
    let alive = true; let venue = null; let sigStop = null; let momSeq = null;
    // Sonido (pedido de Cote, 24 nov: «en pantalla completa no se puede activar el sonido»): la 1 (señal) o la 2 (tablero),
    // una a la vez; tocar la que suena deja todo en silencio
    let snd = 0;
    const paintSnd = () => {
      root.querySelectorAll('[data-snd]').forEach((x) => { const on = Number(x.dataset.snd) === snd; x.classList.toggle('on', on); x.textContent = `${on ? '🔊' : '🔇'} Sonido ${x.dataset.snd}`; });
      const f2 = area.querySelector('.gp-scr[data-n="2"] iframe'); const src = tabSrc(snd !== 2);
      if (f2 && f2.getAttribute('src') !== src) f2.setAttribute('src', src);
      if (sigStop && sigStop.sound) sigStop.sound(snd === 1);
    };
    // Cada pantalla mide lo más que cabe en su espacio sin deformarse; la página real va adentro, achicada
    const fit = () => area.querySelectorAll('.gp-scr').forEach((c) => {
      const [w, h] = SCR[c.dataset.n]; const box = c.querySelector('.gp-box');
      if (vista === 'libre') {
        const L = libre[c.dataset.n]; const bw = area.clientWidth * L.w / 100;
        Object.assign(c.style, { left: `${L.x}%`, top: `${L.y}%`, width: `${bw}px`, height: `${bw * h / w}px` });
        Object.assign(box.style, { width: `${bw}px`, height: `${bw * h / w}px` });
      } else {
        c.removeAttribute('style');
        const k = Math.min(c.clientWidth / w, c.clientHeight / h);
        Object.assign(box.style, { width: `${w * k}px`, height: `${h * k}px` });
      }
      const k = box.clientWidth / w;
      box.querySelectorAll('iframe:not([data-full])').forEach((f) => { f.style.transform = `scale(${k})`; });
    });
    const ro = new ResizeObserver(fit); ro.observe(area);
    const paint = () => {
      if (sigStop) { sigStop(); sigStop = null; }
      momSeq = null;
      root.querySelector('[data-k="info"]').textContent = venue ? `${demo ? 'Demo · ' : ''}Sala de juegos · ${VENUES[venue]}` : 'No hay sala de juegos abierta';
      if (!venue) { area.innerHTML = `<p class="gp-none">${demo ? 'Crea la sala simulada en el GC Master (pestaña Demo).' : 'No hay sala de juegos abierta. Cuando se abra, aquí aparecen sus pantallas.'}</p>`; return; }
      const scr = (n, name, inner, cls = '') => `<div class="gp-scr th-${venue}" data-n="${n}"><small data-drag="${n}">${n} · <span data-k="name${n}">${name}</span></small><div class="gp-box ${cls}">${inner}</div><i class="gp-resize" data-resize="${n}" title="Agrandar o achicar"></i></div>`;
      area.innerHTML = scr(1, demo ? 'Cámara · demo' : 'GC', demo
        ? `<iframe class="dm-v3d" title="Vista 3D del salón" src="${esc(vistaDemo || DEMO3D())}"></iframe><iframe class="dm-gc" title="GC de la sala de juegos" tabindex="-1" src="${page('#/escena')}"></iframe>`
        : '', demo ? 'dm-cam' : '')
        + scr(2, 'Tablero', `<iframe title="Tablero de la sala de juegos" tabindex="-1" src="${tabSrc(true)}"></iframe>`)
        + scr(3, 'De pie', `<iframe title="Pantalla de pie de la sala de juegos" tabindex="-1" src="${page('#/tablero')}"></iframe>`);
      if (!demo) sigStop = signal1(area.querySelector('[data-n="1"] .gp-box'), venue, { fit, label: (t) => { const el = area.querySelector('[data-k="name1"]'); if (el) el.textContent = t; } });
      paintSnd(); fit();
    };
    let vistaDemo = '';
    if (demo) vistaDemo = ((await api('GET', '/api/sim').catch(() => null)) || {}).vista || '';
    // En el demo, los momentos de los juegos llegan a la vista 3D (igual que en la pestaña Demo)
    const pump = async () => {
      if (!demo || !venue) return;
      const r = await api('GET', `/api/momentos?desde=${momSeq == null ? 0 : momSeq}`).catch(() => null);
      if (!alive || !r) return;
      const first = momSeq == null; momSeq = r.seq;
      const f = area.querySelector('.dm-v3d');
      if (!first && f && f.contentWindow) for (const m of r.momentos) f.contentWindow.postMessage({ momento: m.name, escalon: m.escalon }, '*');
    };
    const load = async () => {
      const r = await api('GET', '/api/consola').catch(() => null);
      if (!alive || !r) return;
      const loc = (r.locales || []).find((x) => x.main);
      const v = loc ? loc.venue : null;
      if (v !== venue) { venue = v; paint(); }
      pump();
    };
    // Barra: elegir la vista y pantalla completa
    root.querySelector('.gp-bar').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.full) { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); return; }
      if (b.dataset.snd) { const n = Number(b.dataset.snd); snd = snd === n ? 0 : n; paintSnd(); return; }
      vista = b.dataset.vista; memSet('gpVista', vista);
      root.className = `gp-${vista}`;
      root.querySelectorAll('[data-vista]').forEach((x) => x.classList.toggle('on', x === b));
      fit();
    };
    // Personalizada: mover por el nombre y agrandar o achicar desde la esquina (en % del espacio, se guarda)
    let drag = null;
    area.addEventListener('pointerdown', (e) => {
      if (vista !== 'libre') return;
      const t = e.target.closest('[data-drag], [data-resize]'); if (!t) return;
      e.preventDefault();
      const n = t.dataset.drag || t.dataset.resize;
      drag = { n, kind: t.dataset.drag ? 'move' : 'size', x: e.clientX, y: e.clientY, L: { ...libre[n] } };
      area.classList.add('gp-dragging');
      t.setPointerCapture(e.pointerId);
    });
    area.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / area.clientWidth * 100; const dy = (e.clientY - drag.y) / area.clientHeight * 100;
      const L = libre[drag.n];
      if (drag.kind === 'move') { L.x = Math.max(-5, Math.min(95, drag.L.x + dx)); L.y = Math.max(0, Math.min(95, drag.L.y + dy)); } else L.w = Math.max(8, Math.min(100, drag.L.w + dx));
      fit();
    });
    const end = () => { if (drag) { drag = null; area.classList.remove('gp-dragging'); memSet('gpLibre', libre); } };
    area.addEventListener('pointerup', end); area.addEventListener('pointercancel', end);
    // La barra se esconde sola cuando no se mueve el mouse; aparece al acercarlo al borde de arriba (sobre las pantallas el
    // movimiento no llega a esta página) y no se esconde mientras el mouse está encima
    let hideT = null;
    const wake = () => { root.classList.add('gp-awake'); clearTimeout(hideT); hideT = setTimeout(() => { if (!root.querySelector('.gp-bar:hover')) root.classList.remove('gp-awake'); else wake(); }, 3000); };
    document.addEventListener('pointermove', wake); wake();
    paint();
    await load();
    const t1 = setInterval(load, 3000);
    const offAviso = window.onAviso(load);
    return () => { alive = false; offAviso(); if (sigStop) sigStop(); clearInterval(t1); clearTimeout(hideT); document.removeEventListener('pointermove', wake); ro.disconnect(); document.body.classList.remove('gp-on'); };
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
    const fitter = encaja(root); // todo a la vista sin bajar la página (pedido de Cote, 25 nov)
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
      box.classList.toggle('gm-dos', !!(s.main && l)); // con la sala de juegos de este local, los dos grupos en 3 columnas para que quepan
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
    return () => { alive = false; offAviso(); clearInterval(t1); clearInterval(t2); clearInterval(t3); ro.disconnect(); document.removeEventListener('visibilitychange', onVisible); list.forEach((v) => { clearInterval(fades[v]); ownStop(v); }); fitter.stop(); document.body.classList.remove('gm-on'); };
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
      <div class="cx-sub"><button type="button" class="on" data-sub="vivo">En vivo</button><button type="button" data-sub="reg">Registros de conectados</button><button type="button" data-go="#/master/clientes">Clientes</button></div>
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
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.go) { location.hash = b.dataset.go; return; }
      if (!data) return;
      if (b.dataset.sub) { root.querySelectorAll('[data-sub]').forEach((x) => x.classList.toggle('on', x === b)); vivo.hidden = b.dataset.sub !== 'vivo'; reg.hidden = b.dataset.sub !== 'reg'; tip.hidden = true; if (!reg.hidden) paintReg(); else paintVivo(); }
      if (b.dataset.csv !== undefined) { // punto y coma y marca de inicio: así Excel lo abre con tildes y en columnas
        const csv = [COLS.map(([h]) => h), ...data.jornadas.map((j) => COLS.map(([, f]) => f(j)))].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); a.download = 'registros-de-conectados.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    };
    const onResize = () => { if (data && !vivo.hidden) paintVivo(); };
    window.addEventListener('resize', onResize);
    await load();
    if (window.__cxSub === 'reg') { window.__cxSub = ''; root.querySelector('[data-sub="reg"]').click(); } // se llegó desde «Clientes» tocando «Registros de conectados»
    const t3 = startClock(root); const t1 = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t1); clearInterval(t3); window.removeEventListener('resize', onResize); document.body.classList.remove('gm-on'); };
  };

  // «Clientes» (pedido de Cote, 22 nov, por el Registro: «el registro de la información de todos los clientes: sus
  // nombres, cuánto interactuaron, sus respuestas, qué lugares»): a la izquierda las jornadas (una por sala de juegos y
  // una por noche de cada sala light); a la derecha, la ficha de cada persona de esa jornada. Buscador por nombre en
  // todas las jornadas y «Bajar todo a Excel». Servidor: clientes.js (/api/clientes). Va como tercera vista de la pestaña
  // «Conectados» (En vivo · Registros de conectados · Clientes): una séptima pestaña arriba no cabía en el teléfono.
  const TIPO = { juegos: 'Sala de juegos', light: 'Sala light' };
  const clientes = async () => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on');
    app.innerHTML = `<div id="gm" class="gm-con gm-cli">${navHTML('conectados')}
      <div class="cx-sub"><button type="button" data-go="#/master/conectados">En vivo</button><button type="button" data-go="#/master/conectados" data-reg="1">Registros de conectados</button><button type="button" class="on">Clientes</button></div>
      <div class="cl-top"><input type="search" data-k="q" placeholder="Buscar por nombre en todas las jornadas" autocomplete="off"><span data-k="tot"></span><button type="button" class="btn" data-csv>⬇ Bajar todo a Excel</button></div>
      <div class="cl-grid"><div class="cl-jor" data-k="jor"></div><div class="cl-per" data-k="per"></div></div></div>`;
    const root = $('#gm'); const jor = root.querySelector('[data-k="jor"]'); const per = root.querySelector('[data-k="per"]'); const qi = root.querySelector('[data-k="q"]');
    let alive = true; let sel = ''; let q = ''; let last = null;
    const hm = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const fecha = (d) => { const [y, m, dd] = String(d).split('-').map(Number); return new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(Date.UTC(y, m - 1, dd, 12)); };
    const COLS = [['Nombre', (p) => p.name], ['Lugar', (p) => p.place || '—'], ['Entró', (p) => hm.format(p.at)], ['Visitas', (p) => p.visitas], ['Cartones', (p) => p.cartones], ['Bingos ganados', (p) => p.bingos],
      ['Trivia: respuestas', (p) => p.trivia], ['Trivia: correctas', (p) => p.triviaOk], ['Trivia: puntos', (p) => p.triviaPts], ['Sorteo de concursantes', (p) => p.sorteo || '—'], ['Votos y notas', (p) => p.votos],
      ['Inscripción (Festival u objeto)', (p) => p.inscrito || '—'], ['Canciones pedidas', (p) => p.canciones || '—'], ['Juego votado', (p) => p.juego || '—'], ['Interacciones', (p) => p.interacciones]];
    const WIDE = [['Fecha', (p) => fecha(p.date)], ['Local', (p) => p.local], ['Sala', (p) => TIPO[p.tipo] || p.tipo]];
    const table = (rows, cols) => `<div class="cx-scroll"><table><thead><tr>${cols.map(([h]) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((p) => `<tr>${cols.map(([, f]) => `<td>${esc(f(p))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    const paint = (r) => {
      last = r;
      root.querySelector('[data-k="tot"]').textContent = r.total ? `${r.total} ${r.total === 1 ? 'ficha' : 'fichas'} en ${r.jornadas.length} ${r.jornadas.length === 1 ? 'jornada' : 'jornadas'}` : '';
      root.querySelector('[data-csv]').disabled = !r.total;
      if (!sel && r.jornadas.length && !q) { sel = r.jornadas[0].id; load(); return; }
      jor.innerHTML = r.jornadas.length ? r.jornadas.map((j) => `<button type="button" class="cl-j th-${j.venue} ${!q && j.id === sel ? 'on' : ''}" data-j="${esc(j.id)}"><b>${esc(j.local)}</b><span>${esc(fecha(j.date))} · ${TIPO[j.tipo] || j.tipo}</span><small>${j.personas} ${j.personas === 1 ? 'persona' : 'personas'} · ${j.interacciones} interacciones</small></button>`).join('')
        : '<p class="cx-empty">Todavía no hay jornadas. La primera aparece cuando alguien entre a una sala.</p>';
      const rows = r.personas || [];
      per.innerHTML = q ? `<p class="cl-h">${rows.length} ${rows.length === 1 ? 'resultado' : 'resultados'} para «${esc(q)}»</p>${rows.length ? table(rows, [...WIDE, ...COLS]) : ''}`
        : rows.length ? table(rows, COLS) : (r.jornadas.length ? '<p class="cx-empty">Elige una jornada de la lista.</p>' : '');
    };
    const load = async () => {
      const r = await api('GET', `/api/clientes?${q ? `q=${encodeURIComponent(q)}` : sel ? `id=${encodeURIComponent(sel)}` : ''}`).catch(() => null);
      if (alive && r) paint(r);
    };
    let tq = null;
    qi.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => { q = qi.value.trim(); load(); }, 250); });
    root.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.go) { if (b.dataset.reg) window.__cxSub = 'reg'; location.hash = b.dataset.go; return; }
      if (b.dataset.j) { sel = b.dataset.j; q = ''; qi.value = ''; load(); }
      if (b.dataset.csv !== undefined) {
        const all = await api('GET', '/api/clientes?todo=1').catch(() => null); if (!all || !all.personas) return;
        const cols = [...WIDE, ...COLS];
        const csv = [cols.map(([h]) => h), ...all.personas.map((p) => cols.map(([, f]) => f(p)))].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' })); a.download = 'registro-de-clientes.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    };
    await load();
    const t3 = startClock(root); const t1 = setInterval(load, 20000);
    return () => { alive = false; clearInterval(t1); clearInterval(t3); clearTimeout(tq); document.body.classList.remove('gm-on'); };
  };

  views.master = (v) => (v === 'movil' ? movil() : v === 'clientes' ? clientes() : v === 'conectados' ? conectados() : v === 'juegos' ? juegos() : v === 'demo' ? juegos(true) : v === 'pantallas' ? pantallas(false) : v === 'pantallas-demo' ? pantallas(true) : VENUES[v] ? master([v], true) : master(ORDER, false));
})();
