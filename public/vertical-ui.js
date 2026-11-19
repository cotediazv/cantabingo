/* global views, app, api, $, esc, toast, fail, isAdmin, viewLogin, store */
// Pantalla vertical de un local: siempre el video de la cartelera del mes y, cuando empieza una actividad
// en ese local (juegos de la sala completa o karaoke de la sala light), esa actividad. Ver vertical.js.
(() => {
  const VENUES = { kennedy: 'Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const pick = (v) => (VENUES[v] ? v : 'kennedy');
  // Kennedy tiene pantallas de pie (la imagen se entrega girada); Tobalaba, una pantalla horizontal (pedido de Cote)
  const UPRIGHT = { kennedy: true };
  const SCHEDULE = { kennedy: 'Jueves, viernes y sábado se pone sola en «Automático» a las 20:00 y vuelve a «Siempre el video» a las 00:30.', tobalaba: 'El viernes se pone sola en «Automático» a las 18:00 y vuelve a «Siempre el video» a las 22:30.' };
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
      if (st.show === 'karaoke' && !lightId) lightId = ((await api('GET', `/api/light?local=${v}`).catch(() => ({}))) || {}).id || '';
      const want = st.show === 'video' ? 'video' : st.show === 'karaoke' ? `#/karaoke-v/${v}/${lightId}` : '#/tablero';
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
  views.verticalctl = async (local) => {
    if (!(await isAdmin())) return viewLogin();
    const v = pick(local);
    const up = !!UPRIGHT[v];
    const screenHash = up ? `#/vertical/${v}` : `#/pantalla/${v}`;
    const link = `${base()}${screenHash}`;
    app.innerHTML = `<p class="back"><a href="#/control">← Centro de control</a></p>
      <h1>📺 Pantalla ${up ? 'vertical' : 'horizontal'} · ${esc(VENUES[v])}</h1>
      <p class="vt-locales">${Object.keys(VENUES).map((k) => `<a class="btn${k === v ? ' primary' : ''}" href="#/verticalctl/${k}">${esc(VENUES[k])}</a>`).join('')}</p>
      <div class="panel vt-now"><small>En pantalla ahora</small><b id="vt-show">…</b><span id="vt-why" class="muted small"></span></div>
      <div class="panel"><h2>Qué mostrar</h2>
        <div class="vt-modes">
          <button data-mode="auto"><span>🔄</span>Automático<small>Video, y la actividad cuando empieza</small></button>
          <button data-mode="video"><span>🎬</span>Siempre el video</button>
          <button data-mode="actividad"><span>🎤</span>Siempre la actividad</button>
        </div>${SCHEDULE[v] ? `<p class="muted small">🕗 ${esc(SCHEDULE[v])}</p>` : ''}</div>
      <div class="panel"><h2>Video de la cartelera</h2>
        <div id="vt-cur"></div>
        <form id="vt-up" class="vt-up"><input type="file" name="f" accept="video/mp4,video/*" required><button class="primary">Subir video</button></form>
        <div class="vt-prog" hidden><i></i><span></span></div>
        <p class="muted small">Video ${up ? 'vertical' : 'horizontal'} en MP4, hasta 300 MB. El nuevo reemplaza al anterior y la pantalla lo toma sola.</p></div>
      <div class="panel"><h2>Enlace para el decodificador</h2>
        <p class="muted small">Se abre en el navegador del decodificador, en pantalla completa.${up ? ' Va girado, para la pantalla de pie.' : ''}</p>
        <p><input class="vt-link" readonly value="${esc(link)}"> <button id="vt-copy">Copiar</button> <a class="btn" href="${screenHash}" target="_blank">Ver</a></p>
        ${up ? `<p class="muted small">Sin girar (si el decodificador ya gira la imagen): <a href="#/vertical-in/${v}" target="_blank">${esc(`${base()}#/vertical-in/${v}`)}</a></p>` : ''}</div>`;
    const NAMES = { video: '🎬 Video de la cartelera', sala: '🎲 Juegos (sala completa)', karaoke: '🎤 Karaoke (sala light)' };
    let alive = true;
    const paint = (st) => {
      $('#vt-show').textContent = st.show === 'sala' && !st.activity ? '🎲 Portada de la sala (no hay video subido)' : NAMES[st.show] || st.show;
      $('#vt-why').textContent = st.mode === 'auto' ? (st.activity ? 'Hay una actividad en este local.' : 'No hay actividad en este local.') : 'Puesto a mano.';
      document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === st.mode));
      $('#vt-cur').innerHTML = st.video
        ? `<video class="vt-prev" src="/vertical/${v}.mp4?v=${st.video}" muted controls playsinline preload="metadata"></video>
           <p class="muted small">Subido el ${esc(new Date(st.video).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' }))} · ${(st.size / 1048576).toFixed(0)} MB · <button id="vt-del" class="link">Quitar video</button></p>`
        : '<p class="muted">Todavía no hay video subido.</p>';
      const del = $('#vt-del');
      if (del) del.onclick = async () => { if (!confirm('¿Quitar el video de la pantalla vertical?')) return; try { paint(await api('DELETE', `/api/vertical/${v}/video`)); } catch (err) { fail(err); } };
    };
    let lastSig = '';
    const tick = async () => {
      const st = await api('GET', `/api/vertical/${v}`).catch(() => null);
      if (!alive || !st) return;
      const sig = JSON.stringify(st);
      if (sig !== lastSig) { lastSig = sig; paint(st); }
    };
    await tick();
    const timer = setInterval(tick, 3000);
    document.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = async () => { try { paint(await api('POST', `/api/vertical/${v}/mode`, { mode: b.dataset.mode })); lastSig = ''; } catch (err) { fail(err); } }; });
    $('#vt-copy').onclick = () => { const i = $('.vt-link'); i.select(); navigator.clipboard.writeText(i.value).then(() => toast('Enlace copiado'), () => {}); };
    $('#vt-up').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.f.files[0];
      if (!f) return;
      if (f.size > 300 * 1048576) { toast('El video pesa más de 300 MB'); return; }
      const btn = e.target.querySelector('button');
      const prog = $('.vt-prog');
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
    return () => { alive = false; clearInterval(timer); };
  };
})();
