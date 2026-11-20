/* global views, app, $, esc, api, qr, joinUrl, isAdmin, viewLogin, fail, activitiesNav */
// «Síguenos en Instagram»: panel del animador, tarjeta del celular, GC de OBS y tablero del DJ.
(() => {
  const url = (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`;

  // ---------- Panel del animador ----------
  views.instactl = async () => {
    if (!(await isAdmin())) return viewLogin();
    const cfg = await api('GET', '/api/insta');
    // Simple: solo lo que está saliendo, con la cuenta del local de la sala
    app.innerHTML = `<div class="panel"><h1 style="margin:0">📸 Instagram</h1><span class="muted">${esc(cfg.name)}</span>
        <div class="vc-read" style="margin-top:14px"><small>En pantalla y en los celulares</small><em>Síguenos en Instagram</em><b>@${esc(cfg.handle)}</b><span>Programación y registros en vivo</span></div>
      </div>${activitiesNav('insta')}`;
    await api('POST', '/api/stage', { show: 'insta' }).catch(fail); // al entrar, pasa a la pantalla y a los celulares
    return undefined;
  };

  // ---------- Celular ----------
  let shown = '';
  window.phoneInsta = {
    reset() { shown = ''; },
    async draw() {
      const box = $('#pinsta');
      const st = await api('GET', '/api/insta').catch(() => null);
      if (!st || !box || box.hidden) return;
      if (st.handle === shown && box.innerHTML) return;
      shown = st.handle;
      box.innerHTML = st.handle ? `<div class="pinsta-head">📸 Síguenos en Instagram</div>
        <a class="pinsta-go" href="${url(st.handle)}" target="_blank" rel="noopener"><b>@${esc(st.handle)}</b><i>Programación y registros en vivo</i><span>Abrir Instagram y seguir</span></a>
        <iframe class="pinsta-frame" title="Instagram de ${esc(st.name)}" src="${url(st.handle)}embed/" loading="lazy" scrolling="no" frameborder="0"></iframe>
        <p class="muted small" style="text-align:center;margin-top:8px">Toca el botón, sigue la cuenta y vuelve aquí para seguir jugando.</p>`
        : '<p class="pvote-wait">Ya volvemos con más juegos.</p>';
    },
  };

  // ---------- Pantallas ----------
  const follow = (paint) => {
    let last = null;
    let alive = true;
    const tick = async () => {
      const st = await api('GET', '/api/insta').catch(() => null);
      if (!alive || !st) return;
      const s = `${st.venue}|${st.handle}`;
      if (s === last) return;
      last = s;
      paint(st);
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(timer); };
  };
  const n = (t) => `style="--n:${Math.max(6, String(t).length)}"`;

  views.instaGC = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="vg"></div>';
    const stop = follow((st) => {
      const box = $('#vg');
      if (!box) return;
      box.className = `th-${st.venue}`;
      box.innerHTML = st.handle ? `<div class="vg-qr">${qr(joinUrl())}<b>Escanea el código QR con tu celular</b></div>
        <div class="vg-bar">
          <div class="vg-tag"><small>${esc(st.name)}</small><b>📸 Síguenos en Instagram</b></div>
          <div class="vg-main"><b style="text-transform:none;--n:${Math.max(6, st.handle.length + 1)}">@${esc(st.handle)}</b><span ${n('Programación y registros en vivo')}>Programación y registros en vivo</span></div>
          <div class="vg-side"><small ${n('Míralo')}>Míralo</small><b ${n('En tu celular')}>En tu celular</b></div>
        </div>` : '';
      requestAnimationFrame(() => { if ($('#vg')) $('#vg').classList.add('on'); });
    });
    return () => { stop(); document.body.classList.remove('obs', 'gc-screen'); };
  };

  views.instaFull = async () => {
    app.innerHTML = '<div id="vf"></div>';
    const stop = follow((st) => {
      const box = $('#vf');
      if (!box) return;
      box.className = `th-${st.venue}`;
      box.innerHTML = `<header class="vf-top"><b>Síguenos en Instagram</b><span>📸 ${esc(st.name)}</span></header>
        <section class="vf-main"><small>Síguenos en Instagram</small><b style="text-transform:none;--n:${(st.handle || 'KRB Stage').length + 1}">${st.handle ? `@${esc(st.handle)}` : 'KRB Stage'}</b><span style="--n:32">Programación y registros en vivo</span></section>
        <aside class="vf-side"><div class="vf-qr insta">${qr(joinUrl())}<b>Escanea el código QR con tu celular</b></div></aside>`;
    });
    return () => stop();
  };
})();
