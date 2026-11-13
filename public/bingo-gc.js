/* global views, app, $, esc, api, subscribe, ballHTML, plain, PATTERNS, qr, joinUrl, route */
// Gráfica del bingo para OBS (GC): franjas arriba y abajo con fondo transparente,
// pensada para ir encima de la cámara. Muestra título, QR, sorteo actual y figura.
(() => {
  views.gc = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="gc"></div>';
    let off = null;
    let poll = null;
    let sid = null;
    let lastCount = -1;
    const leave = () => { if (off) off(); off = null; sid = null; lastCount = -1; };

    const draw = (st) => {
      const current = st.drawn.at(-1);
      const fresh = st.drawn.length !== lastCount && lastCount >= 0 && st.drawn.length > 0;
      lastCount = st.drawn.length;
      const id = st.patterns[0];
      const mask = PATTERNS.byId[id].variants[0];
      const figure = Array.from({ length: 25 }, (_, i) => `<i class="${mask & (1 << i) ? 'x' : ''}"></i>`).join('');
      const previous = st.drawn.slice(-6, -1).reverse().map((v) => `<span>${esc(plain(st, v))}</span>`).join('');
      $('#gc').innerHTML = `
        <header class="gc-top">
          <div class="gc-titles"><b class="gc-title">${esc(st.name)}</b>${st.gc.top ? `<span class="gc-sub">${esc(st.gc.top)}</span>` : ''}</div>
        </header>
        <div class="gc-qr">${qr(joinUrl())}</div>
        <footer class="gc-bottom">${st.gc.bottom ? `<span class="gc-msg">${esc(st.gc.bottom)}</span>` : ''}</footer>
        <div class="gc-draw">
          <span class="gc-label">Sorteo actual</span>
          <div class="${fresh ? 'pop' : ''}">${ballHTML(st, current, 'gcball')}</div>
          <div class="gc-prev">${previous}</div>
        </div>
        <div class="gc-figure">
          <span class="gc-label">Figura</span>
          <div class="gc-grid">${figure}</div>
          <b>${esc(PATTERNS.byId[id].name)}</b>
        </div>`;
    };

    // Sigue siempre a la sesión activa más reciente; sin sesión, la gráfica queda vacía (transparente)
    const follow = async () => {
      const list = (await api('GET', '/api/current').catch(() => ({}))).sessions || [];
      const next = list.length ? list[0].id : null;
      if (next === sid) return;
      leave();
      $('#gc').innerHTML = '';
      if (!next) return;
      sid = next;
      off = subscribe(sid, draw, () => { leave(); $('#gc').innerHTML = ''; });
    };
    await follow();
    poll = setInterval(follow, 5000);
    return () => { clearInterval(poll); leave(); document.body.classList.remove('obs', 'gc-screen'); };
  };
})();
