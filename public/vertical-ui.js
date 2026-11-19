/* global views, app, api, $, esc, toast, fail, isAdmin, viewLogin, store */
// Pantalla vertical de un local: siempre el video de la cartelera del mes y, cuando empieza una actividad
// en ese local (juegos de la sala completa o karaoke de la sala light), esa actividad. Ver vertical.js.
(() => {
  // Pantallas: verticales (de pie, la imagen se entrega girada) y horizontales, en los tres locales
  const SCREENS = {
    kennedy: { venue: 'kennedy', name: 'Kennedy', up: true },
    // horizontales de Kennedy y Frida, con su propio video (pedido de Cote)
    'kennedy-h': { venue: 'kennedy', name: 'Kennedy', up: false },
    frida: { venue: 'frida', name: 'Frida Kahlo', up: true },
    'frida-h': { venue: 'frida', name: 'Frida Kahlo', up: false },
    'tobalaba-v': { venue: 'tobalaba', name: 'Tobalaba', up: true },
    tobalaba: { venue: 'tobalaba', name: 'Tobalaba', up: false },
  };
  const pick = (v) => (SCREENS[v] ? v : 'kennedy');
  const TOBA = 'El viernes se pone sola en «Automático» a las 18:00 y vuelve a «Siempre el video» a las 22:30.';
  const NIGHT = 'Jueves, viernes y sábado se pone sola en «Automático» a las 18:30 y vuelve a «Siempre el video» a las 00:30.';
  const SCHEDULE = { kennedy: NIGHT, frida: NIGHT, tobalaba: TOBA, 'tobalaba-v': TOBA, 'kennedy-h': NIGHT, 'frida-h': NIGHT };
  // Locales con sala light: en «Automático», si no hay juegos, se ve el fondo vertical de la sala light (#/light-v/<local>)
  const LIGHT = { kennedy: true, frida: true, 'tobalaba-v': true }; // pantallas que muestran el fondo vertical con la información
  const base = () => `${location.origin}${location.pathname}`;

  // Para el decodificador: la pantalla de pie recibe la señal horizontal, así que se entrega girada 90° a la
  // derecha, igual que el tablero vertical (#/tablero-v)
  views.vertical = async (local) => {
    const v = pick(local);
    document.body.classList.add('rot-screen');
    app.innerHTML = `<iframe class="rot-frame" title="Pantalla vertical" src="${location.pathname}?mudo=1#/vertical-in/${v}"></iframe>`;
    return () => document.body.classList.remove('rot-screen');
  };

  // La pantalla en sí, sin girar (formato alto en Kennedy; horizontal en Tobalaba: #/pantalla/tobalaba)
  views.pantalla = (local) => views['vertical-in'](local);
  views['vertical-in'] = async (local) => {
    const v = pick(local);
    document.body.classList.add('vert-in'); // sin el fondo animado de las pantallas (en el iPhone quedaba encima del video)
    app.innerHTML = `<div class="vt"><video class="vt-video" muted loop playsinline autoplay></video><iframe class="vt-act" title="Actividad" hidden></iframe>
      <div class="vt-empty" hidden><img src="krb-stage.svg" alt="KRB Stage"></div></div>`;
    const video = $('.vt-video');
    const frame = $('.vt-act');
    const empty = $('.vt-empty');
    let shown = '';
    let ver = 0;
    let alive = true;
    let lightId = '';
    const apply = async () => {
      const st = await api('GET', `/api/vertical/${v}`).catch(() => null);
      if (!alive || !st) return;
      if (st.video !== ver) {
        ver = st.video;
        // La página web (krbstage.cl) puede pasar una copia liviana del mismo video (?liviano=<dirección>&lver=<versión>),
        // para no quitarle conexión a la transmisión en vivo; solo se usa si es de esta misma versión
        const q = new URLSearchParams(location.search);
        const liviano = q.get('liviano') && q.get('lver') === String(ver) ? q.get('liviano') : '';
        if (ver) { video.src = liviano || `/vertical/${v}.mp4?v=${ver}`; video.play().catch(() => {}); } else video.removeAttribute('src');
      }
      const venue = SCREENS[v].venue; // la actividad es la del local de esta pantalla
      // Con la información del local en pantalla, se sigue lo que el equipo elige en el panel de la sala light del local
      // (Karaoke, Show y lo que viene, Cartelera, QR grande y lista); «Nada» deja la información con los shows que vienen
      // (Karaoke sin nadie en la lista: el cartón base con las actividades)
      if (st.show === 'light') st.show = { karaoke: st.karaokeNow ? 'karaoke' : 'light', qr: 'light-qr', show: 'light-show' }[st.lightStage] || 'light';
      if (st.show === 'karaoke' && !lightId) lightId = ((await api('GET', `/api/light?local=${venue}`).catch(() => ({}))) || {}).id || '';
      // Fondo de la sala light cuando toca; sin video subido y sin actividad en este local: el logo (no el tablero de la
      // sala abierta, que puede ser de otro local)
      const want = st.show === 'video' ? 'video' : st.show === 'light' ? `#/light-v/${venue}` : st.show === 'light-qr' ? `#/light-v/${venue}/qr` : st.show === 'light-show' ? `#/light-v/${venue}/show` : st.show === 'karaoke' ? `#/karaoke-v/${venue}/${lightId}` : !st.activity ? 'video' : '#/tablero';
      if (want === shown) return;
      shown = want;
      const isVideo = want === 'video';
      video.hidden = !isVideo || !ver;
      empty.hidden = !isVideo || !!ver;
      frame.hidden = isVideo;
      if (isVideo) { frame.src = 'about:blank'; if (ver) video.play().catch(() => {}); } else { video.pause(); frame.src = `${location.pathname}?mudo=1${want}`; }
    };
    await apply();
    const timer = setInterval(apply, 3000);
    return () => { alive = false; clearInterval(timer); document.body.classList.remove('vert-in'); };
  };

  // Karaoke de la sala light de un local a pantalla completa (lo usa la pantalla vertical)
  views['karaoke-v'] = async () => {
    const [, local, id] = location.hash.replace(/^#\/?/, '').split('/'); // #/karaoke-v/<local>/<sala light>
    document.body.classList.add('full');
    const stop = await views.karaokeFull(pick(local), id ? `${base()}#/l/${id}` : '');
    return () => { document.body.classList.remove('full'); if (typeof stop === 'function') stop(); };
  };

  // Panel: video del mes, modo y enlace para el decodificador
  // Panel por local (pedido de Cote): una pestaña por local y, dentro, dos espacios, la pantalla vertical y la horizontal,
  // cada una con su video, su modo y su enlace para el decodificador. #/verticalctl/<local> (también acepta una pantalla).
  const VENUE_SCREENS = { kennedy: ['kennedy', 'kennedy-h'], frida: ['frida', 'frida-h'], tobalaba: ['tobalaba-v', 'tobalaba'] };
  const VENUE_NAMES = { kennedy: 'Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const NAMES = { video: '🎬 Video de la cartelera', sala: '🎲 Juegos (sala completa)', light: '💡 Información del local (QR, cartelera, horarios)', karaoke: '🎤 Karaoke (sala light)' };
  // Un espacio (vertical u horizontal) dentro del panel del local
  const screenBox = (root, v, onState) => {
    const up = SCREENS[v].up;
    const screenHash = up ? `#/vertical/${v}` : `#/pantalla/${v}`;
    const link = `${base()}${screenHash}`;
    root.innerHTML = `<h2 class="vt-col-title">${up ? '📱 Pantalla vertical' : '🖥️ Pantalla horizontal'}</h2>
      <div class="panel"><h3>Video ${up ? 'vertical' : 'horizontal'}</h3>
        <div class="vt-cur"></div>
        <form class="vt-up"><input type="file" name="f" accept="video/mp4,video/*" required><button class="primary">Subir video ${up ? 'vertical' : 'horizontal'}</button></form>
        <div class="vt-prog" hidden><i></i><span></span></div>
        <p class="muted small">MP4 ${up ? 'vertical' : 'horizontal'}, hasta 300 MB. Si pesa mucho, achícalo antes (HandBrake en el computador o una app del celular). El nuevo reemplaza al anterior y la pantalla lo toma sola.</p></div>
      <div class="panel vt-now"><small>En pantalla ahora</small><b class="vt-show">…</b><span class="vt-why muted small"></span></div>`;
    const q = (sel) => root.querySelector(sel);
    let lastSig = '';
    const paint = (st) => {
      q('.vt-show').textContent = st.show === 'sala' && !st.activity ? '🎲 Portada de la sala (no hay video subido)' : NAMES[st.show] || st.show;
      q('.vt-why').textContent = st.mode === 'auto' ? (st.activity ? 'Hay una actividad en este local.' : 'No hay actividad en este local.') : 'Puesto a mano.';
      onState(v, st);
      q('.vt-cur').innerHTML = st.video
        ? `<video class="vt-prev" src="/vertical/${v}.mp4?v=${st.video}" muted controls playsinline preload="metadata"></video>
           <p class="muted small">Subido el ${esc(new Date((st.opt && st.opt.upload) || st.video).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }))} · ${(st.size / 1048576).toFixed(0)} MB · <button class="link vt-del">Quitar video</button></p>`
        : '<p class="muted">Todavía no hay video subido.</p>';
      // Optimización automática del video subido (pedido de Cote: lo más liviano posible, sin perder calidad)
      const o = st.video && st.opt;
      const mb = (b) => `${Math.max(1, Math.round(b / 1048576))} MB`;
      if (o) {
        const msg = o.state === 'listo' ? `✅ Video optimizado: ${mb(o.from)} → ${mb(o.to)} (${Math.round((1 - o.to / o.from) * 100)} % menos), con la misma calidad.`
          : o.state === 'procesando' || o.state === 'esperando' ? `⏳ Optimizando el video para que pese menos (puede tardar unos minutos). Mientras tanto la pantalla usa el video tal como se subió.`
            : o.state === 'igual' ? '✅ El video ya venía liviano: queda tal como se subió.'
              : '⚠️ No se pudo optimizar el video: queda tal como se subió.';
        q('.vt-cur').insertAdjacentHTML('beforeend', `<p class="vt-opt small">${esc(msg)}</p>`);
      }
      const del = q('.vt-del');
      if (del) del.onclick = async () => { if (!confirm(`¿Quitar el video de la pantalla ${up ? 'vertical' : 'horizontal'}?`)) return; try { lastSig = ''; paint(await api('DELETE', `/api/vertical/${v}/video`)); } catch (err) { fail(err); } };
    };
    const tick = async () => {
      const st = await api('GET', `/api/vertical/${v}`).catch(() => null);
      if (!st || !root.isConnected) return;
      const sig = JSON.stringify(st);
      if (sig !== lastSig) { lastSig = sig; paint(st); }
    };
    q('.vt-up').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.f.files[0];
      if (!f) return;
      if (f.size > 300 * 1048576) { toast('El video pesa más de 300 MB'); return; }
      const btn = e.target.querySelector('button');
      const prog = q('.vt-prog');
      btn.disabled = true;
      prog.hidden = false;
      const x = new XMLHttpRequest();
      x.open('POST', `/api/vertical/${v}/video`);
      x.setRequestHeader('Content-Type', f.type || 'video/mp4');
      x.setRequestHeader('x-admin', store.get('adminToken') || '');
      x.upload.onprogress = (ev) => { if (!ev.lengthComputable) return; const k = Math.round((ev.loaded / ev.total) * 100); prog.querySelector('i').style.width = `${k}%`; prog.querySelector('span').textContent = `Subiendo… ${k}%`; };
      x.onload = () => {
        btn.disabled = false;
        prog.hidden = true;
        let data = {};
        try { data = JSON.parse(x.responseText); } catch { /* nada */ }
        if (x.status >= 200 && x.status < 300) { toast('Video subido'); e.target.reset(); lastSig = ''; paint(data); } else toast(data.error || 'No se pudo subir el video');
      };
      x.onerror = () => { btn.disabled = false; prog.hidden = true; toast('Se cortó la subida'); };
      x.send(f);
    };
    return { tick, reset: () => { lastSig = ''; } };
  };
  views.verticalctl = async (arg) => {
    if (!(await isAdmin())) return viewLogin();
    const venue = VENUE_SCREENS[arg] ? arg : SCREENS[pick(arg)].venue;
    const pair = VENUE_SCREENS[venue];
    // «Qué mostrar» es uno solo por local y se aplica a las dos pantallas, vertical y horizontal (pedido de Cote)
    app.innerHTML = `<p class="back"><a href="#/control">← Centro de control</a></p>
      <h1>📺 Pantallas · ${esc(VENUE_NAMES[venue])}</h1>
      <p class="vt-locales">${Object.keys(VENUE_SCREENS).map((k) => `<a class="btn${k === venue ? ' primary' : ''}" href="#/verticalctl/${k}">${esc(VENUE_NAMES[k])}</a>`).join('')}</p>
      <div class="panel vt-links"><h2>🔗 Enlaces de ${esc(VENUE_NAMES[venue])}</h2>
        ${[['🎥 GC para OBS (sala light)', `#/light-gc/${venue}`],
    ['🖥️ Tablero (pantalla horizontal)', `#/pantalla/${pair[1]}`],
    ['📱 Pantalla vertical girada (pantalla de pie)', `#/vertical/${pair[0]}`],
    ['📱 Pantalla vertical sin girar', `#/vertical-in/${pair[0]}`]].map(([t, h]) => `<div class="vt-linkrow"><b>${t}</b>
          <div><input class="vt-link" readonly value="${esc(base() + h)}"> <button class="vt-copy">Copiar</button> <a class="btn" href="${h}" target="_blank">Ver</a></div></div>`).join('')}</div>
      <div class="panel vt-both"><h2>Qué mostrar <small class="muted">· las dos pantallas, vertical y horizontal</small></h2>
        <div class="vt-modes">
          <button data-mode="auto"><span>🔄</span>Automático<small>Los juegos cuando hay; si no, la vertical muestra la información del local y la horizontal, su video</small></button>
          <button data-mode="video"><span>🎬</span>Siempre el video</button>
          <button data-mode="actividad"><span>🎤</span>Siempre la actividad</button>
        </div>${SCHEDULE[pair[0]] ? `<p class="muted small">🕗 ${esc(SCHEDULE[pair[0]])}</p>` : ''}</div>
      <div class="vt-cols">${pair.map((v) => `<section class="vt-col" data-screen="${v}"></section>`).join('')}</div>`;
    const modes = {};
    const markModes = () => {
      const [a, b] = pair.map((v) => modes[v]);
      app.querySelectorAll('.vt-both [data-mode]').forEach((btn) => btn.classList.toggle('on', !!a && a === b && btn.dataset.mode === a));
    };
    const boxes = pair.map((v) => screenBox(app.querySelector(`.vt-col[data-screen="${v}"]`), v, (sv, st) => { modes[sv] = st.mode; markModes(); }));
    const all = () => Promise.all(boxes.map((x) => x.tick()));
    app.querySelectorAll('.vt-both [data-mode]').forEach((btn) => {
      btn.onclick = async () => {
        try {
          await Promise.all(pair.map((v) => api('POST', `/api/vertical/${v}/mode`, { mode: btn.dataset.mode })));
          boxes.forEach((x) => x.reset());
          await all();
        } catch (err) { fail(err); }
      };
    });
    app.querySelectorAll('.vt-copy').forEach((btn) => { btn.onclick = () => { const i = btn.parentElement.querySelector('.vt-link'); i.select(); navigator.clipboard.writeText(i.value).then(() => toast('Enlace copiado'), () => {}); }; });
    await all();
    const timer = setInterval(all, 3000);
    return () => clearInterval(timer);
  };
})();
