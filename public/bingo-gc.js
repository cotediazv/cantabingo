/* global views, app, $, esc, api, subscribe, ballHTML, PATTERNS, qr, joinUrl */
// Gráfica del bingo para OBS (GC), con fondo transparente para ir encima de la cámara:
// franja superior con título y guirnalda, QR arriba a la derecha, sorteo actual abajo a la
// izquierda, figura abajo a la derecha y una franja inferior con texto libre.
(() => {
  const FLAGS = ['#ffc400', '#0a9a94', '#ff7a1a', '#2338a8', '#56b04c', '#e8262e'];
  const bunting = Array.from({ length: 20 }, (_, i) => `<i style="background:${FLAGS[i % FLAGS.length]}"></i>`).join('');
  // En el texto inferior, lo escrito entre asteriscos se resalta en amarillo: *CONTRASEÑA: 1234*
  const rich = (text) => esc(text).replace(/\*([^*]+)\*/g, '<b>$1</b>');

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
      $('#gc').innerHTML = `
        <header class="gc-top"><b class="gc-title">${esc(st.name)}</b>${st.gc.top ? `<span class="gc-sub">${esc(st.gc.top)}</span>` : ''}</header>
        <div class="gc-bunting">${bunting}</div>
        <div class="gc-qr">${qr(joinUrl())}</div>
        <footer class="gc-bottom">${st.gc.bottom ? `<span class="gc-msg">${rich(st.gc.bottom)}</span>` : ''}</footer>
        <div class="gc-draw">
          <span class="gc-label">Sorteo actual</span>
          <div class="gc-ballwrap ${fresh ? 'pop' : ''}">${ballHTML(st, current, 'gcball')}</div>
        </div>
        <div class="gc-figure">
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
