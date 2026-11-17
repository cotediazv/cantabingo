/* global views, app, $, esc, api, qr, joinUrl */
// Karaoke en pantalla: zócalo transparente para OBS («Ahora canta» / «Sigue» + QR para pedir) y
// versión a pantalla completa para el tablero del DJ. Los pedidos los maneja el sistema de Google;
// aquí solo se muestran.
(() => {
  const POLL_MS = 2000;
  const sign = (st) => JSON.stringify([st.venue, st.list.slice(0, 6)]);
  const n = (t) => `style="--n:${Math.max(6, String(t).length)}"`;

  // Sigue la cola y vuelve a dibujar solo cuando cambia, para que no parpadee
  const follow = (paint, local = '') => {
    let last = '';
    let alive = true;
    const tick = async () => {
      const st = await api('GET', `/api/karaoke${local ? `?local=${local}` : ''}`).catch(() => null);
      if (!alive || !st) return;
      const s = sign(st);
      if (s === last) return;
      last = s;
      paint(st);
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(timer); };
  };

  // ---------- GC de OBS ----------
  // Con opciones lo usa la sala light: su local, su enlace para entrar y sin el aviso de la sala principal
  views.karaokeGC = async (opts = {}) => {
    const o = opts && typeof opts === 'object' ? opts : {};
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="kg"></div>';
    let swap = null;
    const stop = follow((st) => {
      const box = $('#kg');
      if (!box) return;
      const [a, b] = st.list;
      const html = `
        <div class="kg-qr">${qr(o.join || joinUrl())}<b>Únete a la sesión</b></div>
        ${o.nextUp != null ? o.nextUp : nextUpHTML('kg-up')}
        <div class="kg-bar">
          <div class="kg-tag"><small>${esc(st.name)}</small><b>🎤 Karaoke</b></div>
          ${a ? `<div class="kg-now"><small>Ahora canta</small><b ${n(a.name)}>${esc(a.name)}</b><span ${n(a.song)}>${esc(a.song)}</span>${a.artist ? `<i ${n(a.artist)}>${esc(a.artist)}</i>` : ''}</div>`
    : `<div class="kg-now"><small>Ahora canta</small><b ${n('¡Pide tu canción!')}>¡Pide tu canción!</b><span ${n('Desde el celular')}>Desde el celular</span></div>`}
          ${b ? `<div class="kg-next"><small>Sigue</small><b ${n(b.name)}>${esc(b.name)}</b><span ${n(b.song)}>${esc(b.song)}</span>${b.artist ? `<i ${n(b.artist)}>${esc(b.artist)}</i>` : ''}</div>`
    : `<div class="kg-next"><small>Sigue</small><b ${n('¿Te animas?')}>¿Te animas?</b><span ${n('Pide tu canción desde el celular')}>Pide tu canción desde el celular</span></div>`}
        </div>`;
      // Sale hacia abajo, cambia el contenido y vuelve a entrar
      clearTimeout(swap);
      box.className = `th-${st.venue}`;
      swap = setTimeout(() => { if ($('#kg')) { $('#kg').innerHTML = html; $('#kg').className = `th-${st.venue} on`; } }, box.innerHTML ? 650 : 0);
    }, o.local || '');
    return () => { stop(); clearTimeout(swap); document.body.classList.remove('obs', 'gc-screen'); };
  };

  // ---------- Tablero del DJ ----------
  views.karaokeFull = async () => {
    app.innerHTML = '<div id="kf"></div>';
    const stop = follow((st) => {
      const box = $('#kf');
      if (!box) return;
      const [a, ...rest] = st.list;
      const next = rest.slice(0, 3);
      box.className = `th-${st.venue}`;
      box.innerHTML = `
        <header class="kf-top"><b>Karaoke ${esc(st.name)}</b><span>${st.total ? `${st.total} en la lista` : 'Lista abierta'}</span></header>
        <section class="kf-now">${a ? `<small>🎤 Ahora canta</small><b ${n(a.name)}>${esc(a.name)}</b><span ${n(a.song)}>${esc(a.song)}</span>${a.artist ? `<i ${n(a.artist)}>${esc(a.artist)}</i>` : ''}`
    : '<small>🎤 Karaoke</small><b style="--n:16">¡Pide tu canción!</b><span style="--n:16">Desde el celular</span>'}</section>
        <aside class="kf-side">
          <div class="kf-qr">${qr(joinUrl())}<b>Únete a la sesión</b></div>
          ${next.length ? `<div class="kf-next"><small>Luego vienen</small>${next.map((p, i) => `<div><em>${i + 2}</em><p><b ${n(p.name)}>${esc(p.name)}</b><span ${n(p.song + p.artist)}>${esc(p.song)}${p.artist ? ` · ${esc(p.artist)}` : ''}</span></p></div>`).join('')}</div>` : ''}
        </aside>`;
    });
    return () => stop();
  };
})();
