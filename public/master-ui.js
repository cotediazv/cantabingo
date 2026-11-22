/* global views, app, $, esc, api, isAdmin, viewLogin, fail, toast */
// GC Master: centro de control de transmisión (pedido de Cote, 21 nov). Una página por local (#/master/<local>) con sus
// 3 pantallas, ordenadas como en el dibujo de Cote: a la izquierda, arriba la 1) video en vivo o GC con un fondo y abajo
// la 2) tablero; a la derecha, a todo el alto, la 3) pantalla vertical; abajo, botones tipo
// TV para cambiar las opciones del GC. Y un cuarto salón (#/master) con los 3 locales juntos, para el control total.
(() => {
  const VENUES = { kennedy: 'Mercado Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const ORDER = ['kennedy', 'frida', 'tobalaba'];
  const TWITCH = { kennedy: 'krbstagekennedy', frida: 'krbstage', tobalaba: 'krbstage3' }; // canal de la transmisión de cada local
  const BOARD = { kennedy: 'kennedy-h', frida: 'frida-h', tobalaba: 'tobalaba' }; // pantalla horizontal (tablero) de cada local
  const VERT = { kennedy: 'kennedy', frida: 'frida', tobalaba: 'tobalaba-v' }; // pantalla vertical de cada local
  // Opciones del GC de la sala light (las mismas del panel de la sala light)
  const LIGHT = [['info', '🔄', 'Información'], ['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show'], ['cartelera', '📅', 'Cartelera'], ['qr', '📱', 'QR grande'], ['none', '⛔', 'Nada']];
  // Opciones del GC de la sala de juegos (cuando la sala abierta es la de este local)
  const MAIN = [['bingo', '🎱', 'Bingo'], ['rueda', '🎡', 'El Rosco'], ['sorteo', '🎲', 'Sorteo'], ['voto', '🗳️', 'Votación'], ['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show'], ['insta', '📸', 'Instagram'], ['qr', '📱', 'QR'], ['none', '⛔', 'Nada']];
  const P1 = [['auto', 'Automático'], ['vivo', '🔴 Video en vivo'], ['gc', 'GC']];
  const page = (hash) => `${location.pathname}?mudo=1${hash}`;

  const venueHTML = (v) => `<section class="gm-venue th-${v}" data-v="${v}">
      <header class="gm-head"><b>${esc(VENUES[v])}</b><span class="gm-live" data-k="live">Sin transmisión en vivo</span><span class="gm-sala" data-k="sala"></span></header>
      <div class="gm-screens">
        <div class="gm-left">
          <div class="gm-scr"><small>1 · <span data-k="p1name">Vivo o GC</span></small>
            <div class="gm-box" data-k="p1" data-w="1280"></div>
            <div class="gm-p1">${P1.map(([k, t]) => `<button type="button" data-p1="${k}">${t}</button>`).join('')}</div></div>
          <div class="gm-scr"><small>2 · Tablero</small>
            <div class="gm-box" data-w="1280"><iframe title="Tablero de ${esc(VENUES[v])}" tabindex="-1" src="${page(`#/pantalla/${BOARD[v]}`)}"></iframe></div></div>
        </div>
        <div class="gm-scr gm-tall"><small>3 · Pantalla vertical</small>
          <div class="gm-box" data-w="720"><iframe title="Pantalla vertical de ${esc(VENUES[v])}" tabindex="-1" src="${page(`#/vertical-in/${VERT[v]}`)}"></iframe></div></div>
      </div>
      <div class="gm-keys" data-k="keys"></div>
    </section>`;

  // Una página del GC Master: uno o los tres locales
  const master = async (list, single) => {
    if (!(await isAdmin())) return viewLogin();
    document.body.classList.add('gm-on');
    app.innerHTML = `<div id="gm" class="${single ? 'gm-one' : 'gm-all'}">
      <nav class="gm-nav"><a href="#/control">← Centro de control</a><b>🎛️ GC Master</b>
        ${ORDER.map((v) => `<a class="gm-tab ${single && list[0] === v ? 'on' : ''}" href="#/master/${v}">${esc(VENUES[v])}</a>`).join('')}
        <a class="gm-tab ${single ? '' : 'on'}" href="#/master">Los 3 locales</a></nav>
      <div class="gm-grid">${list.map(venueHTML).join('')}</div></div>`;
    const root = $('#gm');
    const el = (v, k) => root.querySelector(`.gm-venue[data-v="${v}"] [data-k="${k}"]`);
    const state = {}; // por local: lo que eligió el operador para la pantalla 1 y lo último dibujado
    list.forEach((v) => { state[v] = { p1: 'auto', p1src: '', keys: '', live: false, main: null, light: null }; });
    let alive = true;

    // Las pantallas son las páginas reales, achicadas al ancho de su cuadro
    const fit = () => root.querySelectorAll('.gm-box').forEach((box) => {
      const f = box.querySelector('iframe[data-scale], iframe:not([data-full])');
      if (f) f.style.transform = `scale(${box.clientWidth / Number(box.dataset.w || 1280)})`;
    });
    const ro = new ResizeObserver(fit);
    root.querySelectorAll('.gm-box').forEach((b) => ro.observe(b));

    // Pantalla 1: video en vivo o GC con un fondo. En «Automático»: el video en vivo y, si no hay transmisión, el GC
    const paintP1 = (v) => {
      const s = state[v];
      const mode = s.p1 === 'auto' ? (s.live ? 'vivo' : 'gc') : s.p1;
      const gc = s.main ? '#/escena' : `#/light-gc/${v}`;
      const src = mode === 'vivo' ? `https://player.twitch.tv/?channel=${TWITCH[v]}&parent=${location.hostname}&muted=true&autoplay=true` : page(gc);
      el(v, 'p1name').textContent = mode === 'vivo' ? (s.live ? 'Video en vivo' : 'Video en vivo (ahora no hay transmisión)') : (s.p1 === 'auto' ? 'GC (no hay transmisión en vivo)' : 'GC');
      root.querySelectorAll(`.gm-venue[data-v="${v}"] [data-p1]`).forEach((b) => b.classList.toggle('on', b.dataset.p1 === s.p1));
      if (src === s.p1src) return;
      s.p1src = src;
      const box = el(v, 'p1');
      box.classList.toggle('gm-bg', mode === 'gc'); // el GC es transparente: se ve sobre un fondo con el color del local
      box.innerHTML = mode === 'vivo' ? `<iframe data-full="1" title="Video en vivo de ${esc(VENUES[v])}" allow="autoplay; fullscreen" src="${esc(src)}"></iframe>`
        : `<iframe title="GC de ${esc(VENUES[v])}" tabindex="-1" src="${esc(src)}"></iframe>`;
      fit();
    };

    // Botones tipo TV: el que está al aire queda encendido
    const key = (attr, k, icon, text, on) => `<button type="button" class="gm-key ${on ? 'on' : ''}" ${attr}="${k}"><i></i><span>${icon}</span><b>${text}</b></button>`;
    const paintKeys = (v) => {
      const s = state[v];
      const sig = JSON.stringify([s.main && s.main.stage, s.light && [s.light.stage, s.light.text, s.light.video]]);
      const box = el(v, 'keys');
      // Mientras se escribe el texto del GC personalizable no se redibuja (se perdería lo escrito)
      if (sig === s.keys || (document.activeElement && document.activeElement.name === 'text' && box.contains(document.activeElement))) return;
      s.keys = sig;
      const l = s.light;
      box.innerHTML = `${s.main ? `<div class="gm-row"><small>GC de la sala de juegos</small><div class="gm-keyrow">${MAIN.map(([k, i, t]) => key('data-main', k, i, t, s.main.stage === k)).join('')}</div></div>` : ''}
        ${l ? `<div class="gm-row"><small>GC de la sala light</small><div class="gm-keyrow">${LIGHT.map(([k, i, t]) => key('data-light', k, i, t, l.stage === k)).join('')}
            ${key('data-video', l.video ? '0' : '1', '🎬', 'Video cartelera', !!l.video)}</div>
          <form class="gm-custom"><input type="text" name="text" maxlength="120" autocomplete="off" placeholder="Texto del GC personalizable" value="${esc(l.text || '')}"><button class="gm-key gm-wide ${l.stage === 'custom' ? 'on' : ''}"><i></i><b>✏️ GC personalizable</b></button></form></div>` : ''}`;
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
        const b = el(v, 'live');
        b.classList.toggle('on', s.live);
        b.textContent = s.live ? `🔴 EN VIVO · ${c.vivo.viewers} ${c.vivo.viewers === 1 ? 'persona' : 'personas'}` : 'Sin transmisión en vivo';
        paintP1(v);
      }
    };

    root.onclick = async (e) => {
      const b = e.target.closest('button');
      const box = e.target.closest('.gm-venue');
      if (!b || !box) return;
      const v = box.dataset.v;
      if (b.dataset.p1) { state[v].p1 = b.dataset.p1; paintP1(v); return; }
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
      const text = f.text.value.trim();
      if (!text) { toast('Escribe el texto del GC'); f.text.focus(); return; }
      try { f.text.blur(); await api('POST', '/api/light/stage', { local: v, show: 'custom', text }); toast(`GC personalizable en ${VENUES[v]}`); load(); } catch (err) { fail(err); }
    };

    list.forEach(paintP1);
    await Promise.all([load(), loadLive()]);
    fit();
    const t1 = setInterval(load, 3000);
    const t2 = setInterval(loadLive, 20000);
    return () => { alive = false; clearInterval(t1); clearInterval(t2); ro.disconnect(); document.body.classList.remove('gm-on'); };
  };

  // #/master: los 3 locales juntos · #/master/<local>: la página de un local
  views.master = (v) => (VENUES[v] ? master([v], true) : master(ORDER, false));
})();
