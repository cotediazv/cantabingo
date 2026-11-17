/* global views, app, $, esc, api, isAdmin, viewLogin, fail, toast, qr, store, wireSongSearch */
// Sala light: karaoke, show, lo que viene y cartelera de la semana en un local, al mismo tiempo que la
// sala principal y sin tocarla. Panel (#/light), GC para OBS (#/light-gc) y celular del público (#/l/<sala>).
(() => {
  const VENUES = { kennedy: 'Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const lightJoin = (id) => `${location.origin}${location.pathname}#/l/${id}`;
  const gcUrl = (v) => `${location.origin}${location.pathname}#/light-gc/${v}`;
  const teamUrl = (v) => `${location.origin}${location.pathname}#/equipo/${v}`;
  // ¿Quién maneja este panel? El moderador, o el equipo del local (clave del equipo)
  const staffVenue = async () => (store.get('staffToken') ? (await api('GET', '/api/staff/me').catch(() => ({}))).venue || '' : '');
  const STAGES = [['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show y lo que viene'], ['cartelera', '📅', 'Cartelera de la semana'], ['qr', '📱', 'QR grande y lista'], ['none', '⛔', 'Nada']];
  const dayName = (d) => ({ MIERCOLES: 'Miércoles', SABADO: 'Sábado' }[d] || d.charAt(0) + d.slice(1).toLowerCase());

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
            <div class="lp-key-row"><input type="text" name="clave" minlength="4" required autocomplete="off" placeholder="${key[v] ? 'Cambiar la clave' : 'Clave de este local'}"><button class="primary">Guardar</button></div></form>`).join('')}</div>`;
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
      last = sig;
      top.innerHTML = `<h1 style="margin:0">${esc(st.title)}</h1><span class="muted">${st.players} ${st.players === 1 ? 'persona entró' : 'personas entraron'} a la sala</span>
        <h2 style="margin:16px 0 10px">En pantalla (GC)</h2>
        <div class="lp-stages">${STAGES.map(([k, i, t]) => `<button type="button" data-st="${k}" class="${st.stage === k ? 'on' : ''}"><span>${i}</span>${t}</button>`).join('')}</div>`;
      bottom.innerHTML = `<h2 style="margin-top:0">Direcciones</h2>
        <div class="lp-links"><div>${qr(lightJoin(st.id))}</div><div>
          <p class="small"><b>Para entrar desde el celular</b> (es el QR de la sala light):<br><a href="${esc(lightJoin(st.id))}" target="_blank">${esc(lightJoin(st.id))}</a></p>
          <p class="small"><b>GC para OBS</b> (fuente de navegador):<br><a href="${esc(gcUrl(v))}" target="_blank">${esc(gcUrl(v))}</a></p></div></div>
`;
      top.querySelectorAll('[data-st]').forEach((b) => { b.onclick = async () => { try { await api('POST', '/api/light/stage', { show: b.dataset.st, local: v }); last = ''; paint(); } catch (err) { fail(err); } }; });
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
        if ((frame.dataset.src || '') !== src) { frame.dataset.src = src; frame.src = src ? `${location.pathname}?mudo=1${src}` : 'about:blank'; }
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
      ${d.show ? `<span class="lg-show">⭐ ${esc(d.show)}</span>` : ''}
      ${d.hours.length ? `<span class="lg-hours">${d.hours.map((h) => `${esc(h.time)} ${esc(h.label)}`).join(' · ')}</span>` : ''}</div>`).join('');
  views['light-gc'] = async (venue) => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="lg"></div>';
    let shown = '';
    let sub = null; // la vista del karaoke, cuando está en pantalla
    let alive = true;
    const stopSub = () => { if (typeof sub === 'function') sub(); sub = null; };
    const tick = async () => {
      // Con local (#/light-gc/kennedy) muestra esa sala; sin local, la primera abierta
      const st = await api('GET', `/api/light${VENUES[venue] ? `?local=${venue}` : ''}`).catch(() => null);
      if (!alive || !st) return;
      const stage = st.open ? st.stage : 'none';
      let c = null;
      if (stage === 'show' || stage === 'cartelera') c = await api('GET', `/api/light/cartelera?local=${st.venue}`).catch(() => null);
      let k = null;
      if (stage === 'qr') k = await api('GET', `/api/karaoke?local=${st.venue}`).catch(() => null);
      if (!alive) return;
      const sig = JSON.stringify([stage, st.id, st.venue, c && [c.show, c.current, c.next, c.week], k && k.list.map((p) => [p.name, p.song])]);
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
      const box = $('#lg');
      box.className = `th-${st.venue || 'kennedy'}`;
      if (stage === 'show') {
        box.innerHTML = `<div class="lg-card lg-bottom">
          <div class="lg-tag"><small>${esc(c ? c.name : '')}</small><b>${c && c.show ? '⭐ Show de hoy' : 'Esta noche'}</b></div>
          <div class="lg-main">${c && c.show ? `<b style="--n:${c.show.length}">${esc(c.show)}</b>` : `<b style="--n:12">KRB Stage</b>`}
          ${c && c.next ? `<span>A continuación · <em>${esc(c.next.time)}</em> ${esc(c.next.label)}</span>` : ''}</div></div>`;
      } else if (stage === 'cartelera') {
        box.innerHTML = `<div class="lg-card lg-week"><div class="lg-head"><small>${esc(c ? c.name : '')}</small><b>📅 Cartelera de la semana</b></div>
          ${c && c.week.length ? weekHTML(c) : '<p class="lg-empty">Pronto la cartelera de la semana</p>'}</div>`;
      } else if (stage === 'qr') {
        const list = k ? k.list.slice(0, 6) : [];
        box.innerHTML = `<div class="lg-card lg-qr"><div class="lg-qrbox">${qr(lightJoin(st.id))}<b>Únete desde tu celular</b><span>Pide tu canción de karaoke</span></div>
          <div class="lg-list"><small>🎤 Próximos en cantar</small>${list.length ? list.map((p, i) => `<div><em>${i + 1}</em><p><b>${esc(p.name)}</b><span>${esc(p.song)}${p.artist ? ` · ${esc(p.artist)}` : ''}</span></p></div>`).join('') : '<p class="lg-empty">¡Sé el primero en pedir tu canción!</p>'}</div></div>`;
      } else box.innerHTML = '';
    };
    await tick();
    const timer = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(timer); stopSub(); document.body.classList.remove('obs', 'gc-screen'); };
  };

  // ---------- Celular del público ----------
  views.l = async (id) => {
    const info = await api('GET', `/api/light/${encodeURIComponent(id || '')}`).catch(() => null);
    if (!info) { app.innerHTML = '<div class="panel"><h1>Esta sala ya terminó</h1><p class="muted">Pide al equipo el código QR de la sala de hoy.</p></div>'; return undefined; }
    const key = `light-${id}`;
    let me = null;
    try { me = JSON.parse(store.get(key) || 'null'); } catch { me = null; }
    if (me && me.token) me = await api('POST', `/api/light/${id}/join`, { token: me.token }).catch(() => null);
    const joinForm = () => {
      app.innerHTML = `<div class="panel"><h1 style="margin-top:0">${esc(info.title)}</h1><p class="muted">Entra con tu nombre para pedir canciones de karaoke y ver la cartelera.</p>
        <form id="lj" class="fields" style="grid-template-columns:1fr">
          <label class="f">Nombre<input type="text" name="name" maxlength="20" required autocomplete="given-name" autocapitalize="words"></label>
          <label class="f">Apellido<input type="text" name="surname" maxlength="25" required autocomplete="family-name" autocapitalize="words"></label>
          ${info.places.length ? `<label class="f">¿Dónde estás?<select name="place" required><option value="">Elige tu lugar</option>${info.places.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>` : ''}
          <button class="primary big">Entrar</button></form></div>`;
      $('#lj').onsubmit = async (e) => {
        e.preventDefault();
        try { me = await api('POST', `/api/light/${id}/join`, Object.fromEntries(new FormData(e.target))); store.set(key, JSON.stringify({ token: me.token })); main(); } catch (err) { fail(err); }
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
        ${window.krbKidsButton ? window.krbKidsButton() : '<a class="btn kids-entry" href="#/kids">🧸 <b>KRB Kids</b><span>Zona de niños</span></a>'}`;
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
