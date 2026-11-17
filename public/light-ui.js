/* global views, app, $, esc, api, isAdmin, viewLogin, fail, toast, qr, store, wireSongSearch */
// Sala light: karaoke, show, lo que viene y cartelera de la semana en un local, al mismo tiempo que la
// sala principal y sin tocarla. Panel (#/light), GC para OBS (#/light-gc) y celular del público (#/l/<sala>).
(() => {
  const VENUES = { kennedy: 'Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const lightJoin = (id) => `${location.origin}${location.pathname}#/l/${id}`;
  const gcUrl = () => `${location.origin}${location.pathname}#/light-gc`;
  const STAGES = [['karaoke', '🎤', 'Karaoke'], ['show', '⭐', 'Show y lo que viene'], ['cartelera', '📅', 'Cartelera de la semana'], ['qr', '📱', 'QR grande y lista'], ['none', '⛔', 'Nada']];
  const dayName = (d) => ({ MIERCOLES: 'Miércoles', SABADO: 'Sábado' }[d] || d.charAt(0) + d.slice(1).toLowerCase());

  // ---------- Panel del animador y del DJ ----------
  views.light = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = '<p class="back"><a href="#/control">← Centro de control</a></p><div id="lp"></div>';
    let last = '';
    const paint = async () => {
      const st = await api('GET', '/api/light').catch(() => null);
      if (!st || !$('#lp')) return;
      const sig = JSON.stringify(st);
      if (sig === last) return;
      last = sig;
      if (!st.open) {
        $('#lp').innerHTML = `<div class="panel"><h1 style="margin-top:0">Sala light</h1>
          <p class="muted">Karaoke, show, lo que viene y cartelera de la semana, con su propio QR. Funciona al mismo tiempo que la sala principal, sin tocarla.</p>
          <form id="lp-new" class="fields" style="grid-template-columns:1fr"><label class="f">Local<select name="venue">${Object.entries(VENUES).map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
          <button class="primary big">Abrir sala light</button></form></div>`;
        $('#lp-new').onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/light', { venue: new FormData(e.target).get('venue') }); last = ''; paint(); } catch (err) { fail(err); } };
        return;
      }
      // Abierta: todo se maneja en una sola pantalla (GC + lista del karaoke + direcciones)
      location.replace(`#/karaokectl/${st.venue}`);
    };
    await paint();
    const timer = setInterval(paint, 4000);
    return () => clearInterval(timer);
  };

  // Botones del GC (arriba) y direcciones (abajo) de la sala light, dentro del panel del karaoke de su local
  views.lightBar = (top, bottom) => {
    let last = '';
    const paint = async () => {
      const st = await api('GET', '/api/light').catch(() => null);
      if (!st || !top.isConnected) return;
      if (!st.open) { location.hash = '#/light'; return; }
      const sig = JSON.stringify(st);
      if (sig === last) return;
      last = sig;
      top.innerHTML = `<h1 style="margin:0">${esc(st.title)}</h1><span class="muted">${st.players} ${st.players === 1 ? 'persona entró' : 'personas entraron'} a la sala</span>
        <h2 style="margin:16px 0 10px">En pantalla (GC)</h2>
        <div class="lp-stages">${STAGES.map(([k, i, t]) => `<button type="button" data-st="${k}" class="${st.stage === k ? 'on' : ''}"><span>${i}</span>${t}</button>`).join('')}</div>`;
      bottom.innerHTML = `<h2 style="margin-top:0">Direcciones</h2>
        <div class="lp-links"><div>${qr(lightJoin(st.id))}</div><div>
          <p class="small"><b>Para entrar desde el celular</b> (es el QR de la sala light):<br><a href="${esc(lightJoin(st.id))}" target="_blank">${esc(lightJoin(st.id))}</a></p>
          <p class="small"><b>GC para OBS</b> (fuente de navegador):<br><a href="${esc(gcUrl())}" target="_blank">${esc(gcUrl())}</a></p></div></div>
        <button type="button" id="lp-close" class="danger" style="margin-top:14px">Cerrar sala light</button>`;
      top.querySelectorAll('[data-st]').forEach((b) => { b.onclick = async () => { try { await api('POST', '/api/light/stage', { show: b.dataset.st }); last = ''; paint(); } catch (err) { fail(err); } }; });
      bottom.querySelector('#lp-close').onclick = async () => {
        if (!confirm('¿Cerrar la sala light? Las personas que entraron tendrán que volver a entrar.')) return;
        try { await api('DELETE', '/api/light'); location.hash = '#/light'; } catch (err) { fail(err); }
      };
    };
    paint();
    const timer = setInterval(paint, 4000);
    return () => clearInterval(timer);
  };

  // ---------- GC para OBS ----------
  const weekHTML = (c) => c.week.map((d) => `<div class="lg-day ${d.today ? 'today' : ''}"><b>${esc(dayName(d.day))} ${d.date}</b>
      ${d.show ? `<span class="lg-show">⭐ ${esc(d.show)}</span>` : ''}
      ${d.hours.length ? `<span class="lg-hours">${d.hours.map((h) => `${esc(h.time)} ${esc(h.label)}`).join(' · ')}</span>` : ''}</div>`).join('');
  views['light-gc'] = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="lg"></div>';
    let shown = '';
    let sub = null; // la vista del karaoke, cuando está en pantalla
    let alive = true;
    const stopSub = () => { if (typeof sub === 'function') sub(); sub = null; };
    const tick = async () => {
      const st = await api('GET', '/api/light').catch(() => null);
      if (!alive || !st) return;
      const stage = st.open ? st.stage : 'none';
      let c = null;
      if (stage === 'show' || stage === 'cartelera') c = await api('GET', '/api/light/cartelera').catch(() => null);
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
        ${window.krbKidsButton ? window.krbKidsButton() : '<a class="btn kids-entry" href="#/kids">🧸 <b>KRB Kids</b><span>Juegos para niños de 3 a 5 años</span></a>'}`;
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
