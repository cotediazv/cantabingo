/* global views, app, $, esc, api, subscribe, ballHTML, PATTERNS, qr, joinUrl, winKey, winScreenHTML, rangeOf */
// Pantalla completa para las pantallas del local (tablero del DJ): muestra en grande lo que
// está pasando en cada momento, en paralelo a la gráfica de OBS. No es transparente.
(() => {
  // Bingo a pantalla completa: bolita gigante, tablero de los 75 números, figura, QR y participantes
  views.bingoFull = async () => {
    app.innerHTML = '<div id="fb"></div>';
    let off = null;
    let sid = null;
    let lastCount = -1;
    let shown = null; // qué pantalla especial está dibujada (para no redibujar y cortar animaciones)
    const leave = () => { if (off) off(); off = null; sid = null; lastCount = -1; shown = null; };
    // Sin nada en juego: portada con el QR, para que la gente vaya entrando desde ya
    const idle = () => {
      $('#fb').className = '';
      $('#fb').innerHTML = `<div class="fb-idle"><b><i>KRB Stage</i> Sala de juegos</b>
        <div class="fb-idle-qr">${qr(joinUrl())}</div>
        <small>Escanea el código QR y prepárate</small><small class="soon">En unos momentos comenzamos</small></div>`;
    };

    const draw = (st) => {
      $('#fb').className = `th-${st.theme}`;
      if (st.celebrate) {
        if (shown !== `win:${winKey(st)}`) { shown = `win:${winKey(st)}`; $('#fb').innerHTML = winScreenHTML(st); }
        return;
      }
      if (st.bigQr) {
        const count = st.players === 1 ? '1 participante ya está dentro' : `${st.players} participantes ya están dentro`;
        if (shown !== 'qr' || !$('.gc-big-count')) {
          shown = 'qr';
          $('#fb').innerHTML = `<div class="gc-big-wrap"><div class="gc-big fb-bigqr"><b class="gc-big-title">${esc(st.name)}</b>
            <div class="gc-big-qr">${qr(joinUrl())}</div>
            <span class="gc-big-text">Escanea el código QR, pon tu nombre y apellido y participa</span>
            <span class="gc-big-count"></span></div></div>`;
        }
        $('.gc-big-count').textContent = count;
        lastCount = st.drawn.length;
        return;
      }
      shown = null;
      const fresh = st.drawn.length !== lastCount && lastCount >= 0 && st.drawn.length > 0;
      lastCount = st.drawn.length;
      const current = st.drawn.at(-1);
      const hit = new Set(st.drawn);
      const id = st.patterns[0];
      const mask = PATTERNS.byId[id].variants[0];
      const figure = Array.from({ length: 25 }, (_, i) => `<i class="${mask & (1 << i) ? 'x' : ''}"></i>`).join('');
      const rows = [0, 1, 2, 3, 4].map((c) => {
        const [lo, hi] = rangeOf(st, c);
        let cells = '';
        for (let v = lo; v <= hi; v++) cells += `<span class="${hit.has(v) ? 'hit' : ''} ${v === current ? 'last' : ''}">${v}</span>`;
        return `<div class="fb-row"><b>${esc(st.headers[c])}</b>${cells}</div>`;
      }).join('');
      const previous = st.drawn.slice(-6, -1).reverse().map((v) => ballHTML(st, v, 'fbprev')).join('');
      $('#fb').innerHTML = `
        <header class="fb-top">
          <b class="fb-title">${esc(st.name)}</b>
          <span class="fb-pill">👥 <b>${st.players}</b> ${st.players === 1 ? 'participante' : 'participantes'}</span>
          <span class="fb-pill">Ronda <b>${st.round}</b></span>
          <span class="fb-pill"><b>${st.drawn.length}</b> de ${st.values}</span>
        </header>
        <section class="fb-left">
          <div class="fb-ballwrap ${fresh ? 'pop' : ''}">${ballHTML(st, current, 'fbball')}</div>
          <div class="fb-prev">${previous}</div>
        </section>
        <section class="fb-board">${rows}</section>
        <aside class="fb-side">
          <div class="fb-figure"><span>Figura</span><div class="gc-grid">${figure}</div><b>${esc(PATTERNS.byId[id].name)}</b></div>
          <div class="fb-qr">${qr(joinUrl())}<span>Escanea y juega</span></div>
        </aside>`;
    };

    const follow = async () => {
      const list = (await api('GET', '/api/current').catch(() => ({}))).sessions || [];
      const next = list.length ? list[0].id : null;
      if (next === sid) return;
      leave();
      if (!next) { idle(); return; }
      sid = next;
      off = subscribe(sid, draw, () => { leave(); idle(); });
    };
    idle();
    await follow();
    const poll = setInterval(follow, 5000);
    return () => { clearInterval(poll); leave(); };
  };
})();
