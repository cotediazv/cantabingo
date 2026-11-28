/* global views, app, $, esc, api, isAdmin, viewLogin, fail, toast, qr, store, wireSongSearch */
// Sala light: karaoke, show, lo que viene y cartelera de la semana en un local, al mismo tiempo que la
// sala principal y sin tocarla. Panel (#/light), GC para OBS (#/light-gc) y celular del público (#/l/<sala>).
(() => {
  const VENUES = { kennedy: 'Mercado Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' }; // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)
  const lightJoin = (id) => `${window.pubBase()}#/l/${id}`;
  const gcUrl = (v) => `${location.origin}${location.pathname}#/light-gc/${v}`;
  const teamUrl = (v) => `${location.origin}${location.pathname}#/equipo/${v}`;
  // ¿Quién maneja este panel? El moderador, o el equipo del local (clave del equipo)
  const staffVenue = async () => (store.get('staffToken') ? (await api('GET', '/api/staff/me').catch(() => ({}))).venue || '' : '');
  // Orden y nombres que pidió Cote (27 nov): 1 GC KARAOKE, 2 QR GRANDE, 3 GC SHOW, 4 GC CARTELERA, 5 INFO GRAL, 6 NADA
  const STAGES = [['karaoke', '🎤', 'GC KARAOKE'], ['qr', '📱', 'QR GRANDE'], ['show', '⭐', 'GC SHOW'], ['cartelera', '📅', 'GC CARTELERA'], ['info', '🔄', 'INFO GRAL'], ['none', '⛔', 'NADA']];
  // En Kennedy, «NADA» pasa a ser «FONDO KENNEDY» (pedido de Cote, 27 nov): el video horizontal del local en el GC de OBS
  // Después, lo mismo en Frida y Tobalaba (pedido de Cote, 27 nov: «aplicar lo mismo… fondo Tobalaba y Frida»)
  const FONDO_NAME = { kennedy: 'FONDO KENNEDY', frida: 'FONDO FRIDA', tobalaba: 'FONDO TOBALABA' };
  const stagesOf = (v) => (FONDO_NAME[v] ? STAGES.map((x) => (x[0] === 'none' ? ['fondo', '🎬', FONDO_NAME[v]] : x)) : STAGES);
  window.lightStagesOf = stagesOf; // los mismos botones en «En pantalla» del Centro de control (pedido de Cote, 28 nov)
  const dayName = (d) => ({ MIERCOLES: 'Miércoles', SABADO: 'Sábado' }[d] || d.charAt(0) + d.slice(1).toLowerCase());
  // Diseño nuevo (tema.js): las etiquetas de las pantallas van sin emojis; con el diseño anterior quedan como siempre
  const se = (s) => (window.sinEmoji ? window.sinEmoji(s) : s);
  const t2on = () => (window.t2 && window.t2() ? 1 : 0);

  // ---------- Panel del moderador: salas light de cada local ----------
  views.light = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = '<p class="back"><a href="#/control">← Centro de control</a></p><div id="lp"></div>';
    let last = '';
    const paint = async () => {
      const st = await api('GET', '/api/light').catch(() => null);
      const key = await api('GET', '/api/staff/clave').catch(() => ({}));
      if (!st || !$('#lp')) return;
      const sig = JSON.stringify([st.lights, key]);
      if (sig === last) return;
      last = sig;
      const open = st.lights || [];
      $('#lp').innerHTML = `<div class="panel"><h1 style="margin-top:0">Salas light</h1>
          <p class="muted">Karaoke, show, lo que viene y cartelera de la semana, con su propio QR. Están siempre activas, una por local, al mismo tiempo que la sala principal.</p>
          <div class="lp-open-list">${open.map((l) => `<a class="btn primary big" href="#/karaokectl/${l.venue}">💡 ${esc(l.title)} · ${l.players} ${l.players === 1 ? 'persona' : 'personas'}</a>`).join('')}</div></div>
        <div class="panel"><h2 style="margin-top:0">Enlaces y claves del equipo</h2>
          <p class="muted small">Cada local tiene su enlace y su clave: con ellos, el equipo maneja solo su sala light. No puede tocar la sala principal ni otros locales.</p>
          ${Object.keys(VENUES).map((v) => `<form class="lp-key" data-v="${v}"><b>${esc(VENUES[v])}</b> <span class="muted small">${key[v] ? '· clave puesta' : '· todavía sin clave'}</span><br>
            <a class="small" href="${esc(teamUrl(v))}" target="_blank">${esc(teamUrl(v))}</a>
            <div class="lp-key-row"><input type="text" name="clave" minlength="4" required autocomplete="off" placeholder="${key[v] ? 'Cambiar la clave' : 'Clave de este local'}"><button class="primary">Guardar</button></div></form>`).join('')}</div>
        <div class="panel"><h2 style="margin-top:0">Pantallas verticales</h2>
          <p class="muted small">Enlace para el decodificador de cada pantalla de pie (sale girado). El video y el modo se manejan en <a href="#/verticalctl/kennedy">Pantallas de los locales</a>.</p>
          ${[['kennedy', 'Mercado Kennedy'], ['frida', 'Frida Kahlo'], ['tobalaba-v', 'Tobalaba']].map(([k, n]) => `<p class="small"><b>${esc(n)}</b><br><a href="${esc(`${location.origin}${location.pathname}#/vertical/${k}`)}" target="_blank">${esc(`${location.origin}${location.pathname}#/vertical/${k}`)}</a></p>`).join('')}</div>`;
      document.querySelectorAll('.lp-key').forEach((f) => { f.onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/staff/clave', { local: f.dataset.v, clave: new FormData(f).get('clave') }); toast(`Clave de ${VENUES[f.dataset.v]} guardada`); last = ''; paint(); } catch (err) { fail(err); } }; });
    };
    await paint();
    const timer = setInterval(paint, 5000);
    return () => clearInterval(timer);
  };

  // ---------- Enlace del equipo de un local: #/equipo/<local> ----------
  views.equipo = async (v) => {
    if (!VENUES[v]) { app.innerHTML = '<div class="panel"><h1>Enlace incompleto</h1><p class="muted">Pide a Cote el enlace de tu local.</p></div>'; return undefined; }
    const go = async () => {
      // Si la sala light del local no está abierta, el equipo la abre al entrar
      location.hash = `#/karaokectl/${v}`; // la sala light del local está siempre activa
    };
    if ((await isAdmin()) || (await staffVenue()) === v) return go();
    app.innerHTML = `<form class="panel" id="eq" style="max-width:460px;margin:0 auto"><h1 style="margin-top:0">Sala light · ${esc(VENUES[v])}</h1>
      <p class="muted">Ingreso del equipo del local.</p>
      <label class="f">Clave del equipo<input type="password" name="clave" required autocomplete="current-password"></label>
      <button class="primary big" style="margin-top:12px">Entrar</button></form>`;
    $('#eq').onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api('POST', '/api/staff/login', { local: v, clave: new FormData(e.target).get('clave') }); store.set('staffToken', r.token); go(); } catch (err) { fail(err); }
    };
    return undefined;
  };

  // Botones del GC (arriba) y direcciones (abajo) de la sala light, dentro del panel del karaoke de su local
  views.lightBar = (top, bottom, v, staff = false) => {
    let last = '';
    const paint = async () => {
      const st = await api('GET', `/api/light?local=${v}`).catch(() => null);
      if (!st || !top.isConnected) return;
      const sig = JSON.stringify(st);
      if (sig === last) return;
      // Mientras se escribe el texto del GC personalizable no se redibuja (se perdería lo escrito)
      if (document.activeElement && document.activeElement.name === 'text' && bottom.contains(document.activeElement)) return;
      last = sig;
      // Titulo chico y en una linea, sin el numero de personas (pedido de Cote, 27 nov: «no es relevante»)
      // Los botones del GC lo mas arriba posible (Cote, 27 nov): sin el subtitulo «En pantalla (GC)» (los botones ya dicen GC)
      top.innerHTML = `<h1 class="lp-title">${esc(st.title)}</h1>
        ${st.stage === 'fondo' && !st.sala ? `<p class="lp-sala">🎬 <b>${{ kennedy: 'Fondo Kennedy', frida: 'Fondo Frida', tobalaba: 'Fondo Tobalaba' }[v] || 'Fondo'} en el GC de OBS.</b> Se pone solo a las 19:00 y a la 01:00. Para pasar al GC, toca otro botón.</p>` : ''}
        ${st.salaHoy ? `<p class="lp-sala">🎮 <b>Hoy hay sala de juegos en este local.</b> ${st.sala ? 'Ahora el GC muestra la sala de juegos. Toca cualquier botón para poner ese GC.' : 'Ahora el GC muestra el botón que tocaste.'} Cuando el animador cambie de juego, el GC vuelve solo a la sala de juegos.</p>` : ''}
        <div class="lp-stages">${st.salaHoy ? `<button type="button" data-st="sala" class="${st.sala ? 'on' : ''}"><span>🎮</span>SALA DE JUEGOS</button>` : ''}${stagesOf(v).map(([k, i, t]) => `<button type="button" data-st="${k}" class="${st.stage === k && !st.sala ? 'on' : ''}"><span>${i}</span>${t}</button>`).join('')}</div>
`;
      // Orden de Cote (27 nov): arriba los botones del GC, luego la lista del karaoke y despues el GC personalizable.
      // El switch «Video cartelera» ya no va (Cote: «esta demas, eso funciona automatico»).
      bottom.innerHTML = `<form class="lp-custom${st.stage === 'custom' ? ' on' : ''}"><input type="text" name="text" maxlength="120" autocomplete="off" placeholder="Escribe aquí el texto del GC" value="${esc(st.text || '')}"><button class="${st.stage === 'custom' ? 'on' : ''}">✏️ GC personalizable</button></form>
        <h2 style="margin-top:18px">Direcciones</h2>
        <div class="lp-links"><div>${qr(lightJoin(st.id))}</div><div>
          <p class="small"><b>Para entrar desde el celular</b> (es el QR de la sala light):<br><a href="${esc(lightJoin(st.id))}" target="_blank">${esc(lightJoin(st.id))}</a></p>
          <p class="small"><b>GC para OBS</b> (fuente de navegador):<br><a href="${esc(gcUrl(v))}" target="_blank">${esc(gcUrl(v))}</a></p></div></div>
`;
      top.querySelectorAll('[data-st]').forEach((b) => { b.onclick = async () => { try { await api('POST', '/api/light/stage', { show: b.dataset.st, local: v }); last = ''; paint(); } catch (err) { fail(err); } }; });
      // GC personalizable (pedido de Cote, 21 nov): pone en el GC el texto escrito
      const cf = bottom.querySelector('.lp-custom');
      if (cf) cf.onsubmit = async (e) => { e.preventDefault(); const text = cf.text.value.trim(); if (!text) { toast('Escribe el texto del GC'); cf.text.focus(); return; } try { cf.text.blur(); await api('POST', '/api/light/stage', { show: 'custom', local: v, text }); toast('GC personalizable en pantalla'); last = ''; paint(); } catch (err) { fail(err); } };
    };
    paint();
    const timer = setInterval(paint, 4000);
    return () => clearInterval(timer);
  };

  // ---------- Consola general: los 3 locales en una sola pantalla (solo el moderador) ----------
  views.consola = async () => {
    if (!(await isAdmin())) return viewLogin();
    const ORDER = ['kennedy', 'frida', 'tobalaba'];
    app.innerHTML = `<p class="back"><a href="#/control">← Centro de control</a></p><h1 style="margin-top:0">Consola general</h1>
      <div class="cs-grid">${ORDER.map((v) => `<section class="cs-card th-${v}" id="cs-${v}"><header><b>${esc(VENUES[v])}</b><span class="cs-badge" data-k="badge"></span></header>
        <div class="cs-screen"><iframe data-k="frame" title="Pantalla de ${esc(VENUES[v])}" tabindex="-1"></iframe><p class="cs-off" data-k="off">Sin sala abierta</p></div>
        <dl><dt>En pantalla</dt><dd data-k="stage">—</dd><dt>Horario</dt><dd data-k="block">—</dd><dt>Karaoke</dt><dd data-k="kar">—</dd><dt>Personas</dt><dd data-k="people">—</dd></dl>
        <a class="btn" data-k="go" href="#/control">Abrir panel</a></section>`).join('')}</div>`;
    // Las mini pantallas son la página real del GC, achicada al ancho del cuadro
    const fit = () => document.querySelectorAll('.cs-screen').forEach((box) => { const f = box.querySelector('iframe'); if (f) f.style.transform = `scale(${box.clientWidth / 1280})`; });
    const ro = new ResizeObserver(fit);
    document.querySelectorAll('.cs-screen').forEach((b) => ro.observe(b));
    const paint = async () => {
      const r = await api('GET', '/api/consola').catch(() => null);
      if (!r || !$('.cs-grid')) return;
      for (const l of r.locales) {
        const card = $(`#cs-${l.venue}`);
        const q = (k) => card.querySelector(`[data-k="${k}"]`);
        const src = l.light ? `#/light-gc/${l.venue}` : l.main ? '#/escena' : '';
        const frame = q('frame');
        if ((frame.dataset.src || '') !== src) { frame.dataset.src = src; frame.src = src ? `${location.pathname}?mudo=1${window.__mon || ''}${src}` : 'about:blank'; }
        frame.hidden = !src; q('off').hidden = !!src;
        q('badge').textContent = l.light && l.main ? 'Sala principal + light' : l.light ? 'Sala light' : l.main ? 'Sala principal' : 'Cerrado';
        q('badge').className = `cs-badge ${l.light || l.main ? 'on' : ''}`;
        q('stage').textContent = [l.main && `Principal: ${l.main.stageName}`, l.light && `Light: ${l.light.stageName}`].filter(Boolean).join(' · ') || '—';
        const b = l.block || {};
        q('block').textContent = [b.current && `Ahora ${b.current.time} ${b.current.label}`, b.next && `Sigue ${b.next.time} ${b.next.label}`, b.show && `Show: ${b.show}`].filter(Boolean).join(' · ') || 'Sin horario hoy';
        const k = l.karaoke || {};
        q('kar').textContent = k.at ? (k.now ? `Canta ${k.now.name} · ${k.now.song} · ${k.total} en la lista` : 'Lista vacía') : 'Sin lectura (karaoke no está en pantalla)';
        q('people').textContent = [l.main && `${l.main.players} en la sala principal`, l.light && `${l.light.players} en la sala light`].filter(Boolean).join(' · ') || '—';
        const go = q('go');
        go.href = l.light ? `#/karaokectl/${l.venue}` : l.main ? '#/control' : '#/light';
        go.textContent = l.light ? 'Abrir panel de la sala light' : l.main ? 'Abrir Centro de control' : 'Abrir una sala light';
      }
      fit();
    };
    await paint();
    const timer = setInterval(paint, 5000);
    return () => { clearInterval(timer); ro.disconnect(); };
  };

  // ---------- GC para OBS ----------
  const weekHTML = (c) => c.week.map((d) => `<div class="lg-day ${d.today ? 'today' : ''}"><b>${esc(dayName(d.day))} ${d.date}</b>
      ${d.show ? `<span class="lg-show">${se('⭐')} ${esc(d.show)}</span>` : ''}
      ${d.hours.length ? `<span class="lg-hours">${d.hours.map((h) => `${esc(h.time)} ${esc(h.label)}`).join(' · ')}</span>` : ''}</div>`).join('');
  // El fondo del local a pantalla completa, 1280×720 en OBS, llenando hasta los bordes (pedido de Cote, 27 nov). El tamaño va
  // escrito en el mismo video: aunque OBS se quede con una hoja de estilos anterior, el video no queda de su tamaño natural.
  // Además se agranda un 3 % (recorta un poco los bordes) y detrás va negro: en OBS quedaba una franja delgada arriba y
  // abajo por donde se veía la cámara (foto de Cote, 27 nov: «recortando si hace falta»).
  const FONDO_CSS = 'position:fixed;top:0;left:0;right:0;bottom:0;width:100vw;height:100vh;min-width:100%;min-height:100%;margin:0;padding:0;border:0;object-fit:cover;background:#000;z-index:0;transform:scale(1.03);transform-origin:50% 50%';
  views['light-gc'] = async (venue) => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="lg"></div>';
    let shown = '';
    let sub = null; // la vista del karaoke, cuando está en pantalla
    let alive = true;
    const stopSub = () => { if (typeof sub === 'function') sub(); sub = null; };
    let seq = 0; // si dos lecturas se cruzan (la de cada 2,5 s y la del aviso inmediato), vale solo la última
    const tick = async () => {
      const n = ++seq;
      // Con local (#/light-gc/kennedy) muestra esa sala; sin local, la primera abierta
      const st = await api('GET', `/api/light${VENUES[venue] ? `?local=${venue}` : ''}`).catch(() => null);
      if (!alive || !st || n !== seq) return;
      // Día de juegos (pedido de Cote, 27 nov): con la sala de juegos de este local abierta, el GC Light muestra el GC de la
      // sala de juegos (#/escena: sus juegos, su karaoke y su QR) toda la noche; al cerrarse la sala vuelve al GC Light
      // Fondo horizontal fuera del horario del show (Kennedy, pedido de Cote, 27 nov): de 01:00 a 19:00 el GC Light muestra
      // el video de la pantalla horizontal del local; a las 19:00 vuelve solo al GC (el servidor decide la hora)
      if (st.fondo) {
        const k = `fondo:${st.fondo}`;
        if (shown !== k) { shown = k; stopSub(); document.body.classList.remove('gc-screen'); document.body.classList.add('lg-fondo-on'); document.documentElement.style.background = document.body.style.background = '#000'; app.innerHTML = `<video class="lg-fondo" src="${esc(st.fondo)}" style="${FONDO_CSS}" autoplay muted loop playsinline></video>`; }
        return;
      }
      if (shown.startsWith('fondo:')) { shown = ''; document.body.classList.remove('lg-fondo-on'); document.documentElement.style.background = document.body.style.background = ''; app.innerHTML = '<div id="lg"></div>'; }
      if (st.sala) {
        if (shown !== 'sala') { shown = 'sala'; stopSub(); document.body.classList.remove('gc-screen'); app.innerHTML = ''; sub = await views.escena(); if (!alive) stopSub(); }
        return;
      }
      if (shown === 'sala') { shown = ''; stopSub(); app.innerHTML = '<div id="lg"></div>'; }
      const stage = st.open ? st.stage : 'none';
      let c = null;
      if (stage === 'show' || stage === 'cartelera' || stage === 'info') c = await api('GET', `/api/light/cartelera?local=${st.venue}`).catch(() => null);
      let k = null;
      if (stage === 'qr') k = await api('GET', `/api/karaoke?local=${st.venue}`).catch(() => null);
      if (!alive || n !== seq) return;
      const sig = JSON.stringify([stage, st.id, st.venue, stage === 'custom' ? st.text : '', c && [c.show, c.current, c.next, c.week, c.blocks, c.month], k && k.list.map((p) => [p.name, p.song]), stage === 'info' ? Math.floor(Date.now() / 9000) : 0, t2on(), stage === 'cartelera' ? st.fondoVideo || '' : '']); // t2on: al cambiar de diseño se vuelve a dibujar
      if (sig === shown) return;
      const wasKaraoke = shown.startsWith('["karaoke"');
      shown = sig;
      if (stage === 'karaoke') {
        if (!wasKaraoke) { stopSub(); sub = await views.karaokeGC({ local: st.venue, join: lightJoin(st.id), nextUp: '' }); }
        return;
      }
      stopSub();
      document.body.classList.add('obs', 'gc-screen'); // al salir del karaoke se quitan; el GC sigue transparente
      if (!$('#lg')) app.innerHTML = '<div id="lg"></div>';
      // Cartelera de la semana con el fondo del local detrás (pedido de Cote, 27 nov): el video horizontal del local
      const bgUrl = stage === 'cartelera' ? st.fondoVideo || '' : '';
      const bg = $('#lg-bg');
      if (bg && bg.getAttribute('src') !== bgUrl) bg.remove();
      if (bgUrl && !$('#lg-bg')) app.insertAdjacentHTML('afterbegin', `<video id="lg-bg" src="${esc(bgUrl)}" style="${FONDO_CSS}" autoplay muted loop playsinline></video>`);
      const box = $('#lg');
      box.className = `th-${st.venue || 'kennedy'}`;
      if (stage === 'custom') {
        // GC personalizable: el texto escrito en el panel, en la franja de abajo (corto: grande; largo: en líneas)
        const t = String(st.text || '');
        box.innerHTML = window.gcPer.card(st.venue, t); // lo que va entre comillas sale destacado (pedido de Cote, 22 nov)
      } else if (stage === 'show') {
        box.innerHTML = `<div class="lg-card lg-bottom">
          <div class="lg-tag"><small>${esc(c ? c.name : '')}</small><b>${c && c.show ? se('⭐ Show de hoy') : 'Esta noche'}</b></div>
          <div class="lg-main">${c && c.show ? `<b style="--n:${c.show.length}">${esc(c.show)}</b>` : `<b style="--n:12">KRB Stage</b>`}
          ${c && c.next ? `<span>A continuación · <em>${esc(c.next.time)}</em> ${esc(c.next.label)}</span>` : ''}</div></div>`;
      } else if (stage === 'info') {
        // La información que va cambiando (pedido de Cote: lo que se ve por defecto en el GC), en una franja abajo para no
        // tapar la transmisión; cambia cada 9 segundos
        const cap = (t) => String(t || '').toLocaleLowerCase('es').replace(/(^|[\s:(«"-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es')).replace(/\b(Tributo|Doble) (A|De) /g, (m, a, b) => `${a} ${b.toLowerCase()} `);
        const slides = [];
        if (c && c.current) slides.push(['⏱️ Esta noche', `<b style="--n:${String(c.current.label).length}">${esc(cap(c.current.label))}</b><span>Ahora · desde las <em>${esc(c.current.time)}</em></span>${c.next ? `<span>A continuación · <em>${esc(c.next.time)}</em> ${esc(cap(c.next.label))}</span>` : ''}`]);
        else if (c && c.next) slides.push(['⏱️ Esta noche', `<b style="--n:${String(c.next.label).length}">${esc(cap(c.next.label))}</b><span>Desde las <em>${esc(c.next.time)}</em></span>`]);
        if (c && c.show) slides.push(['⭐ Show de hoy', `<b style="--n:${String(c.show).length}">${esc(c.show)}</b>`]);
        if (c && c.blocks && c.blocks.length) slides.push(['🕗 Horarios de hoy', `<span class="lg-line">${c.blocks.map((b) => `<em>${esc(b.time)}</em> ${esc(cap(b.label))}`).join(' · ')}</span>`]);
        const week = c && c.week ? c.week.filter((d) => d.show || (d.hours && d.hours.length)).slice(0, 4) : [];
        if (week.length) slides.push(['📅 Esta semana', `<span class="lg-line">${week.map((d) => `<em>${esc(dayName(d.day))} ${d.date}</em> ${esc(cap(d.show || (d.hours[0] || {}).label || ''))}`).join(' · ')}</span>`]);
        if (c && c.month && c.month.length) slides.push(['🗓️ Cartelera del mes', `<span class="lg-line">${c.month.slice(0, 4).map((d) => `<em>${esc(cap(d.day))}</em> ${esc(cap(d.show))}`).join(' · ')}</span>`]);
        if (!slides.length) slides.push(['🎶 Bienvenidos', '<b style="--n:10">KRB Stage</b><span>Música, shows y karaoke</span>']);
        const [title, main] = slides[Math.floor(Date.now() / 9000) % slides.length];
        box.innerHTML = `<div class="lg-card lg-bottom lg-info">
          <div class="lg-tag"><small>${esc(c ? c.name : VENUES[st.venue] || '')}</small><b>${se(title)}</b></div>
          <div class="lg-main">${main}</div></div>`;
      } else if (stage === 'cartelera') {
        box.innerHTML = `<div class="lg-card lg-week"><div class="lg-head"><small>${esc(c ? c.name : '')}</small><b>${se('📅 Cartelera de la semana')}</b></div>
          ${c && c.week.length ? weekHTML(c) : '<p class="lg-empty">Pronto la cartelera de la semana</p>'}</div>`;
      } else if (stage === 'qr') {
        const list = k ? k.list.slice(0, 6) : [];
        box.innerHTML = `<div class="lg-card lg-qr"><div class="lg-qrbox">${qr(lightJoin(st.id))}<b>Escanea el código QR con tu celular</b><span>Pide tu canción de karaoke</span></div>
          <div class="lg-list"><small>${se('🎤 Próximos en cantar')}</small>${list.length ? list.map((p, i) => `<div><em>${i + 1}</em><p><b>${esc(p.name)}</b><span>${esc(p.song)}${p.artist ? ` · ${esc(p.artist)}` : ''}</span></p></div>`).join('') : '<p class="lg-empty">¡Sé el primero en pedir tu canción!</p>'}</div></div>`;
      } else box.innerHTML = '';
    };
    await tick();
    const timer = setInterval(tick, 2500);
    const offAviso = window.onAviso(tick); // el cambio de GC llega al instante
    return () => { alive = false; clearInterval(timer); offAviso(); stopSub(); document.body.classList.remove('obs', 'gc-screen', 'lg-fondo-on'); document.documentElement.style.background = document.body.style.background = ''; };
  };

  // ---------- Celular del público ----------
  views.l = async (id) => {
    const info = await api('GET', `/api/light/${encodeURIComponent(id || '')}`).catch(() => null);
    if (!info) { app.innerHTML = '<div class="panel"><h1>Esta sala ya terminó</h1><p class="muted">Pide al equipo el código QR de la sala de hoy.</p></div>'; return undefined; }
    // «Conectados» (pedido de Cote, 22 nov): mientras la sala light está abierta en el celular, avisa cada 45 s para
    // contarla (una marca al azar del navegador, sin datos personales; se corta sola al salir de esta pantalla)
    { const here = location.hash; const vid = window.vid();
      const ping = () => { if (location.hash !== here) return clearInterval(tPing); if (!document.hidden) fetch(`/api/web/viendo?que=light&local=${info.venue}&id=${vid}`).catch(() => {}); return undefined; };
      const tPing = setInterval(ping, 45000); setTimeout(ping, 1500); }
    const key = `light-${id}`;
    let me = null;
    try { me = JSON.parse(store.get(key) || 'null'); } catch { me = null; }
    if (me && me.token) me = await api('POST', `/api/light/${id}/join`, { token: me.token, vid: window.vid() }).catch(() => null);
    const joinForm = () => {
      app.innerHTML = `<div class="panel"><h1 style="margin-top:0">${esc(info.title)}</h1><p class="muted">Entra con tu nombre para pedir canciones de karaoke y ver la cartelera.</p>
        <form id="lj" class="fields" style="grid-template-columns:1fr">
          <label class="f">Nombre<input type="text" name="name" maxlength="20" required autocomplete="given-name" autocapitalize="words"></label>
          <label class="f">Apellido<input type="text" name="surname" maxlength="25" required autocomplete="family-name" autocapitalize="words"></label>
          ${info.places.length ? `<label class="f">¿Dónde estás?<select name="place" required><option value="">Elige tu lugar</option>${info.places.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>` : ''}
          <button class="primary big">Entrar</button></form></div><p class="lm-web">Ve los registros en vivo de esta y todas las noches en <a href="https://krbstage.cl" target="_blank" rel="noopener"><b>krbstage.cl</b></a></p>`;
      $('#lj').onsubmit = async (e) => {
        e.preventDefault();
        try { me = await api('POST', `/api/light/${id}/join`, { ...Object.fromEntries(new FormData(e.target)), vid: window.vid() }); store.set(key, JSON.stringify({ token: me.token })); main(); } catch (err) { fail(err); }
      };
    };
    let tab = 'karaoke';
    let timer = null;
    let shown = '';
    let sent = false;
    const main = () => {
      app.innerHTML = `<div class="panel lm"><h1 style="margin:0">${esc(info.title)}</h1><p class="muted small" style="margin:4px 0 0">Hola, <b>${esc(me.name)}</b></p>
        <div class="lm-tabs"><button data-tab="karaoke">🎤 Karaoke</button><button data-tab="cartelera">📅 Cartelera</button><button data-tab="redes">📸 Redes</button></div>
        <div id="lm-body"></div></div>
        ${window.krbKidsButton ? window.krbKidsButton() : '<a class="btn kids-entry" href="#/kids">🧸 <b>KRB Kids</b><span>Zona de niños</span></a>'}
        <p class="lm-web">Ve los registros en vivo de esta y todas las noches en <a href="https://krbstage.cl" target="_blank" rel="noopener"><b>krbstage.cl</b></a></p>`; // siempre al final (pedido de Cote, 21 nov)
      app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; shown = ''; draw(); }; });
      draw();
      clearInterval(timer);
      timer = setInterval(draw, 4000);
    };
    const draw = async () => {
      app.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
      const body = $('#lm-body');
      if (!body) return;
      if (tab === 'redes') {
        if (shown === 'redes') return;
        shown = 'redes';
        body.innerHTML = info.insta ? `<div class="lm-insta"><p>Síguenos en Instagram</p><b>@${esc(info.insta)}</b>
          <a class="btn primary big" href="https://instagram.com/${encodeURIComponent(info.insta)}" target="_blank" rel="noopener">Abrir Instagram</a></div>` : '<p class="muted">Pronto.</p>';
        return;
      }
      if (tab === 'cartelera') {
        const c = await api('GET', `/api/light/cartelera?local=${info.venue}`).catch(() => null);
        if (!c || tab !== 'cartelera') return;
        const sig = JSON.stringify(['c', c.show, c.next, c.week]);
        if (sig === shown) return;
        shown = sig;
        body.innerHTML = `${c.show ? `<div class="lm-today"><small>⭐ Show de hoy</small><b>${esc(c.show)}</b></div>` : ''}
          ${c.next ? `<p class="lm-next">A continuación: <b>${esc(c.next.time)}</b> ${esc(c.next.label)}</p>` : ''}
          <h3>Esta semana</h3>${c.week.length ? c.week.map((d) => `<div class="lm-day ${d.today ? 'today' : ''}"><b>${esc(dayName(d.day))} ${d.date}${d.today ? ' · hoy' : ''}</b>
            ${d.show ? `<span>⭐ ${esc(d.show)}</span>` : ''}${d.hours.map((h) => `<small>${esc(h.time)} ${esc(h.label)}</small>`).join('')}</div>`).join('') : '<p class="muted">Pronto la cartelera de la semana.</p>'}`;
        return;
      }
      const k = await api('GET', `/api/karaoke?sid=${encodeURIComponent(id)}&token=${encodeURIComponent(me.token)}`).catch(() => null);
      if (!k || tab !== 'karaoke') return;
      const mine = k.me ? k.me.first : -1;
      const count = k.me ? k.me.count : 0;
      const max = k.me ? k.me.max : 2;
      if (sent && (count >= sent.until || Date.now() - sent.at > 25000)) sent = false;
      const sig = JSON.stringify(['k', k.list, mine, count, !!sent, k.phone, k.ask]);
      if (sig === shown) return;
      // Mientras la persona escribe su pedido no se redibuja (se perdería lo que está escribiendo)
      if (document.activeElement && body.contains(document.activeElement) && document.activeElement.form) return;
      shown = sig;
      const full = count >= max;
      const draft = $('#lm-body form') ? Object.fromEntries(new FormData($('#lm-body form'))) : {};
      body.innerHTML = `${mine === 0 ? '<div class="pkar-turn now">🎤 ¡Es tu turno! Te toca cantar</div>' : mine > 0 ? `<div class="pkar-turn">Estás en la lista: ${mine === 1 ? 'eres el siguiente' : `tienes ${mine} personas antes`}</div>` : ''}
        ${sent ? '<div class="pkar-turn">✔ Pedido enviado. Aparecerá en la lista en unos segundos.</div>' : ''}
        ${full ? `<p class="pkar-limit">Ya tienes ${max} canciones en la lista.<br><b>Priorizamos a quienes no han cantado:</b> cuando cantes una, podrás pedir otra.</p>` : ''}
        ${full || sent ? '' : !k.phone ? '<p class="pkar-qr">🎤 En este momento no se están recibiendo pedidos de karaoke.</p>' : `<form>
          <h3>${count ? 'Pide otra canción' : 'Inscribe tu canción'}</h3>
          <label class="f">Canción<input type="text" name="song" maxlength="80" required autocomplete="off" placeholder="Escribe y elige de la lista" value="${esc(draft.song || '')}"></label>
          <div class="sug" data-sug="song"></div>
          <label class="f">Artista<input type="text" name="artist" maxlength="60" required value="${esc(draft.artist || '')}"></label>
          <p class="muted small" style="margin:6px 0 0">Si alguien ya pidió tu canción, cantarás esta otra:</p>
          <label class="f">Canción de reemplazo<input type="text" name="altSong" maxlength="80" required autocomplete="off" placeholder="Escribe y elige de la lista" value="${esc(draft.altSong || '')}"></label>
          <div class="sug" data-sug="altSong"></div>
          <label class="f">Artista de reemplazo<input type="text" name="altArtist" maxlength="60" required value="${esc(draft.altArtist || '')}"></label>
          ${k.ask.choices.map((c) => `<label class="f">${esc(c.title)}<select name="ans-${c.id}" ${c.required ? 'required' : ''}><option value="">Elige una opción</option>${c.options.map((x) => `<option ${draft[`ans-${c.id}`] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`).join('')}
          <button class="primary big">🎤 Enviar mi pedido</button></form>`}
        <h3>Lista del karaoke</h3>${k.list.length ? k.list.map((p, i) => `<div class="kc-row ${i === 0 ? 'now' : ''}"><em>${i === 0 ? '🎤' : i + 1}</em><p><small>${i === 0 ? 'Ahora canta' : i === 1 ? 'Sigue' : ''}</small><b>${esc(p.name)}</b><span>${esc(p.song)}${p.artist ? ` · ${esc(p.artist)}` : ''}</span></p></div>`).join('') : '<p class="muted">Todavía no hay pedidos. ¡Sé el primero!</p>'}`;
      const form = $('#lm-body form');
      if (!form) return;
      if (typeof wireSongSearch === 'function') wireSongSearch(form);
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        const data = Object.fromEntries(new FormData(e.target));
        const answers = Object.fromEntries(Object.entries(data).filter(([x]) => x.startsWith('ans-')).map(([x, v]) => [x.slice(4), v]));
        try {
          await api('POST', '/api/karaoke/request', { sid: id, token: me.token, song: data.song, artist: data.artist, altSong: data.altSong, altArtist: data.altArtist, answers });
          sent = { at: Date.now(), until: count + 1 }; shown = ''; toast('¡Pedido enviado!'); draw();
        } catch (err) { fail(err); btn.disabled = false; }
      };
    };
    if (me && me.token) main(); else joinForm();
    return () => clearInterval(timer);
  };
})();

// Fondo vertical de la sala light (pedido de Cote), para las pantallas de pie de Kennedy y Frida cuando no hay juegos:
// arriba lo de esta noche; al medio, un recuadro que va cambiando solo (ahora y a continuación, horarios de hoy, la semana,
// la cartelera del mes y el karaoke cuando hay lista); abajo, grande, el QR para entrar a la sala light desde el celular.
(() => {
  const NAMES = { kennedy: 'Mercado Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const DAYS = { LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles', JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado', DOMINGO: 'Domingo' };
  const day = (d) => DAYS[String(d || '').toUpperCase()] || String(d || '');
  const cap = (t) => String(t || '').toLocaleLowerCase('es').replace(/(^|[\s:(«"-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('es')).replace(/\b(Tributo|Doble) (A|De) /g, (m, a, b) => `${a} ${b.toLowerCase()} `);
  const SLIDE_MS = 9000;
  // Diseño nuevo (tema.js): los títulos de la pantalla van sin emojis; con el diseño anterior quedan como siempre
  const se = (s) => (window.sinEmoji ? window.sinEmoji(s) : s);
  // Shows con el artista entre paréntesis (ej. «ESPECIAL MÉXICO (VERÓNICA YAÑEZ)»): el título arriba y, abajo, «por» y el
  // nombre del artista en grande y en color (pedido de Cote)
  const showHtml = (t) => {
    const m = String(t || '').match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    return m ? `<span class="lv-sh">${esc(cap(m[1]))}</span><span class="lv-by"><small>por</small> ${esc(cap(m[2]))}</span>` : `<span class="lv-sh">${esc(cap(t))}</span>`;
  };
  // Pedido de Cote (21 nov): en la pantalla vertical de Kennedy el QR es solo para pedir canciones. Se ve solo con los botones
  // del karaoke de la sala light (Karaoke: #/light-v/<local>/karaoke, y QR grande y lista: /qr); con los demás botones
  // (Información que va cambiando, Show, Cartelera, Nada) no hay QR. (La frase de krbstage.cl va en el celular, no aquí.)
  const QR_ONLY_KAR = { kennedy: true };
  views['light-v'] = async (local) => {
    const v = NAMES[local] ? local : 'kennedy';
    // #/light-v/<local>/qr: QR grande con los próximos en cantar · #/light-v/<local>/show: el show y lo de esta noche
    // · #/light-v/<local>/karaoke: la información que va cambiando, con el QR para pedir canciones
    const mine = location.hash; // si mientras carga se cambia de botón (otra dirección), esta vista ya no pinta nada
    const focus = (location.hash.split('/')[3] || '').replace(/[^a-z]/g, '');
    const karOnly = !!QR_ONLY_KAR[v];
    const withQr = !karOnly || focus === 'karaoke' || focus === 'qr';
    document.body.classList.add('full');
    app.innerHTML = `<div id="lv" class="th-${v}${focus === 'qr' ? ' lv-qrmode' : ''}${withQr ? '' : ' lv-noqr'}"><header class="lv-top"><small>Esta noche en</small><b>${esc(NAMES[v])}</b><span class="lv-show" hidden></span></header>
      <section class="lv-card"><div class="lv-slide"></div><div class="lv-dots"></div></section>
      <footer class="lv-qr"><div class="lv-qrbox"></div><div class="lv-qrtext"><b>Escanea el código QR con tu celular</b><span>Pide tu canción de karaoke y espera tu turno</span></div></footer></div>`;
    let alive = true;
    let cart = null;
    let kar = null;
    let idx = 0;
    let flyers = []; // flyers del Instagram del local (pedido de Cote, 21 nov): pasan en el mismo recuadro, solo en la pantalla vertical
    // El QR lleva a la sala light de este mismo local (en Tobalaba también: antes llevaba a la sala de juegos abierta,
    // que podía ser de otro local)
    let joinUrl = '';
    const light = await api('GET', `/api/light?local=${v}`).catch(() => null);
    if (location.hash !== mine) return () => {};
    if (light && light.id) { joinUrl = `${window.pubBase()}#/l/${light.id}`; $('.lv-qrbox').innerHTML = qr(joinUrl); }
    // Qué recuadros hay para mostrar (solo los que tienen algo)
    const slides = () => {
      const out = [];
      if (focus === 'qr') {
        const list = (kar && kar.list) || [];
        return [`<h2>📱 Escanea el código QR con tu celular</h2><div class="lv-bigqr">${joinUrl ? qr(joinUrl) : ''}</div><p class="lv-bigqr-text">Pide tu canción de karaoke y espera tu turno</p>
          ${list.length ? `<h2>🎤 Próximos en cantar</h2><ol class="lv-list">${list.slice(0, 4).map((p) => `<li><b>${esc(p.name)}</b><span>${esc(p.song)}</span></li>`).join('')}</ol>` : ''}`];
      }
      if (kar && kar.list && kar.list.length) {
        const [a, ...rest] = kar.list;
        out.push(`<h2>🎤 Karaoke</h2><div class="lv-now"><small>Ahora canta</small><b>${esc(a.name)}</b><span>${esc(a.song)}${a.artist ? ` · ${esc(a.artist)}` : ''}</span></div>
          ${rest.length ? `<ol class="lv-list" start="2">${rest.slice(0, 2).map((p) => `<li><b>${esc(p.name)}</b><span>${esc(p.song)}</span></li>`).join('')}</ol>` : ''}`);
      }
      if (cart && (cart.current || cart.next)) {
        out.push(`<h2>⏱️ Esta noche</h2>${cart.current ? `<div class="lv-now"><small>Ahora</small><b>${esc(cap(cart.current.label))}</b><span>desde las ${esc(cart.current.time)}</span></div>` : ''}
          ${cart.next ? `<div class="lv-now lv-next"><small>A continuación</small><b>${esc(cap(cart.next.label))}</b><span>a las ${esc(cart.next.time)}</span></div>` : ''}`);
      }
      // Si hoy no hay actividades, los horarios del próximo día que tenga (ej. el viernes en Tobalaba)
      const nextDay = cart && !(cart.blocks || []).length && (cart.week || []).find((d) => !d.today && d.hours && d.hours.length);
      if (nextDay) out.push(`<h2>🕗 ${esc(day(nextDay.day))} ${nextDay.date}</h2>${nextDay.show ? `<div class="lv-now lv-next"><small>Show</small><b>${showHtml(nextDay.show)}</b></div>` : ''}<ul class="lv-hours">${nextDay.hours.map((b) => `<li><em>${esc(b.time)}</em><b>${esc(cap(b.label))}</b></li>`).join('')}</ul>`);
      if (cart && cart.blocks && cart.blocks.length) out.push(`<h2>🕗 Horarios de hoy</h2><ul class="lv-hours">${cart.blocks.map((b) => `<li class="${cart.current && cart.current.time === b.time ? 'on' : ''}"><em>${esc(b.time)}</em><b>${esc(cap(b.label))}</b></li>`).join('')}</ul>`);
      if (cart && cart.week && cart.week.length) out.push(`<h2>📅 Esta semana</h2><ul class="lv-week">${cart.week.slice(0, 7).map((d) => `<li class="${d.today ? 'on' : ''}"><em>${esc(day(d.day))} ${d.date}</em><b>${d.show ? showHtml(d.show) : esc(cap((d.hours[0] || {}).label || ''))}</b></li>`).join('')}</ul>`);
      if (cart && cart.month && cart.month.length) out.push(`<h2>🗓️ Cartelera del mes</h2><ul class="lv-week">${cart.month.slice(0, 6).map((d) => `<li><em>${esc(cap(d.day))}</em><b>${showHtml(d.show)}</b></li>`).join('')}</ul>`);
      if (focus === 'show') {
        const keep = out.filter((x) => x.startsWith('<h2>⏱️') || x.startsWith('<h2>🕗'));
        if (cart && cart.show) keep.unshift(`<h2>⭐ El show de esta noche</h2><div class="lv-now"><b>${showHtml(cart.show)}</b></div>`);
        if (keep.length) return keep;
      }
      if (!out.length) out.push('<h2>🎶 Bienvenidos</h2><div class="lv-now"><b>KRB Stage</b><span>Música, shows y karaoke</span></div>');
      return out;
    };
    // Si el texto completo no cabe en el recuadro, se achica todo el recuadro (nunca se corta)
    const fit = () => {
      const slide = $('.lv-slide');
      if (!slide) return;
      slide.style.zoom = 1;
      for (let z = 0.95; z > 0.5 && slide.scrollHeight > slide.clientHeight + 1; z -= 0.05) slide.style.zoom = z.toFixed(2);
    };
    // El nombre del local (ej. «Mercado Kennedy») va entero en una línea: si no cabe, se achica la letra
    const fitTop = () => {
      const b = $('.lv-top b');
      if (!b) return;
      b.style.fontSize = ''; b.style.whiteSpace = 'nowrap';
      let px = parseFloat(getComputedStyle(b).fontSize) || 40;
      while (b.scrollWidth > b.clientWidth + 1 && px > 12) { px -= 1; b.style.fontSize = `${px}px`; }
    };
    fitTop();
    window.addEventListener('resize', fitTop);
    if (document.fonts) document.fonts.ready.then(() => { fit(); fitTop(); });
    const paint = () => {
      if (!alive || !$('#lv') || location.hash !== mine) return;
      const all = slides();
      // Al final de cada vuelta pasa un flyer distinto del Instagram del local (solo con la pantalla de pie)
      const turn = Math.floor(idx / (all.length + 1));
      if (flyers.length && focus !== 'qr' && innerHeight > innerWidth) all.push(`<div class="lv-flyer"><img alt="" src="${esc(flyers[turn % flyers.length].url)}"></div>`);
      const at = idx % all.length;
      const slide = $('.lv-slide');
      slide.style.zoom = 1;
      slide.innerHTML = all[at].replace(/<h2>([^<]*)<\/h2>/g, (m, t) => `<h2>${se(t)}</h2>`);
      const fly = slide.querySelector('.lv-flyer img');
      if (fly) {
        fly.style.maxHeight = `${Math.floor(slide.clientHeight * 0.92)}px`;
        fly.onerror = () => { const bad = fly.getAttribute('src'); flyers = flyers.filter((f) => f.url !== bad); idx++; paint(); }; // un flyer que no carga se salta
      } else { fit(); setTimeout(fit, 400); } // otra vez cuando ya cargaron las letras
      $('.lv-dots').innerHTML = all.length > 1 ? all.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('') : '';
      const show = $('.lv-show');
      show.hidden = !(cart && cart.show);
      if (cart && cart.show) show.innerHTML = `${se('⭐')} ${showHtml(cart.show)}`;
    };
    const loadCart = async () => { const c = await api('GET', `/api/light/cartelera?local=${v}`).catch(() => null); if (c) cart = c; };
    const loadKar = async () => { const k = await api('GET', `/api/karaoke?local=${v}`).catch(() => null); if (k) kar = k; };
    const loadFly = async () => { const r = await api('GET', `/api/web/flyers?local=${v}`).catch(() => null); if (r && r.flyers) flyers = r.flyers; };
    loadFly(); // sin esperar: si Instagram demora, la pantalla parte igual
    const tFly = setInterval(loadFly, 10 * 60000);
    await Promise.all([loadCart(), loadKar()]);
    if (location.hash !== mine) { window.removeEventListener('resize', fitTop); clearInterval(tFly); return () => {}; }
    paint();
    const tSlide = setInterval(() => { idx++; paint(); }, SLIDE_MS);
    const tCart = setInterval(loadCart, 60000);
    const tKar = setInterval(loadKar, 5000);
    return () => { alive = false; clearInterval(tSlide); clearInterval(tCart); clearInterval(tKar); clearInterval(tFly); window.removeEventListener('resize', fitTop); document.body.classList.remove('full'); };
  };
})();
