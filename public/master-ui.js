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
  const MAIN = [['bingo', '🎱', 'Bingo'], ['rueda', '🎡', 'El Rosco'], ['sorteo', '🎲', 'Sorteo'], ['voto', '🗳️', 'Votación'], ['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show'], ['insta', '📸', 'Instagram'], ['qr', '📱', 'QR'], ['none', '⛔', 'Nada']];
  // Capa gráfica sobre la cámara (pedido de Cote, 21 nov): piezas que se disparan sobre el GC de OBS del local y salen solas
  const CAPA = [['cortina', '🎬', 'Cortina', 'Cortina'], ['texto3d', '🧊', 'Texto 3D', 'Texto 3D'], ['celebracion', '🎉', 'Celebración', 'Celebración'], ['fuegos', '🎆', 'Fuegos', 'Fuegos artificiales'],
    ['confeti', '🎊', 'Confeti', 'Lluvia de confeti'], ['luces', '🔦', 'Luces', 'Luces de escenario'], ['corazones', '❤️', 'Corazones', 'Corazones'], ['off', '✖', 'Quitar', 'Quitar lo que está en pantalla']];
  const page = (hash) => `${location.pathname}?mudo=1${hash}`;

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

  // Una página del GC Master: uno o los tres locales
  const master = async (list, single) => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on');
    app.innerHTML = `<div id="gm" class="${single ? 'gm-one' : 'gm-all'}">
      <nav class="gm-nav"><a class="gm-back" href="#/control">←<span> Centro de control</span></a><b>🎛️ GC Master</b>
        ${ORDER.map((v) => `<a class="gm-tab ${single && list[0] === v ? 'on' : ''}" href="#/master/${v}">${esc(VENUES[v])}</a>`).join('')}
        <a class="gm-tab ${single ? '' : 'on'}" href="#/master">Los 3 locales</a>
        <span class="gm-clock" data-k="clock"><b></b><i></i></span></nav>
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
            <button class="gm-key gm-long ${l.stage === 'custom' ? 'on' : ''}"><i></i><span>✏️</span><b>GC personalizable</b></button>
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
        else if (b.dataset.main) await api('POST', '/api/stage', { show: b.dataset.main });
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
      try { ti.blur(); await api('POST', '/api/light/stage', { local: v, show: 'custom', text }); toast(`GC personalizable en ${VENUES[v]}`); load(); } catch (err) { fail(err); }
    };

    list.forEach(paintP1);
    list.forEach(ownStart);
    await Promise.all([load(), loadLive()]);
    fit();
    // Arriba, la fecha con el año y la hora local de los locales (hora de Chile), al segundo (pedido de Cote, 22 nov)
    const clockEl = root.querySelector('[data-k="clock"]');
    const fmtDate = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const fmtTime = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const tickClock = () => { const now = new Date(); const d = fmtDate.format(now); clockEl.querySelector('i').textContent = d.charAt(0).toUpperCase() + d.slice(1); clockEl.querySelector('b').textContent = fmtTime.format(now); };
    tickClock();
    const t3 = setInterval(tickClock, 1000);
    const t1 = setInterval(load, 3000);
    const t2 = setInterval(loadLive, 20000);
    return () => { alive = false; clearInterval(t1); clearInterval(t2); clearInterval(t3); ro.disconnect(); document.removeEventListener('visibilitychange', onVisible); list.forEach((v) => { clearInterval(fades[v]); ownStop(v); }); document.body.classList.remove('gm-on'); };
  };

  // #/master: los 3 locales juntos · #/master/<local>: la página de un local
  views.master = (v) => (VENUES[v] ? master([v], true) : master(ORDER, false));
})();
