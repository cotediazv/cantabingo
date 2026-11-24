/* global views, app, $, esc, api, subscribe, ballHTML, PATTERNS, qr, joinUrl, winKey, winScreenHTML */
// Gráfica del bingo para OBS (GC), con fondo transparente para ir encima de la cámara:
// franja superior con título y guirnalda, QR arriba a la derecha, sorteo actual abajo a la
// izquierda, figura abajo a la derecha y una franja inferior con texto libre.
(() => {
  const FLAGS = ['#ffc400', '#0a9a94', '#ff7a1a', '#2338a8', '#56b04c', '#e8262e'];
  const bunting = Array.from({ length: 20 }, (_, i) => `<i style="background:${FLAGS[i % FLAGS.length]}"></i>`).join('');
  // En el texto inferior, lo escrito entre asteriscos se resalta en amarillo: *CONTRASEÑA: 1234*
  const rich = (text) => esc(text).replace(/\*([^*]+)\*/g, '<b>$1</b>');

  // El QR en versión GC (pregunta 19 de Cote, 24 nov: «en todo», también en el GC real de OBS): en lugar del cartel
  // grande al centro, que tapaba al animador, el QR va abajo a la izquierda con su frase (que no pasa de su ancho) y,
  // a su lado, la franja con el nombre de la sala. Lo usan «QR en pantalla completa» y el QR del bingo antes del primer
  // número. El tablero y la pantalla de pie siguen con el QR grande.
  const qrGC = (name, count) => `<div class="gc-qrgc">
      <div class="gc-qrgc-qr">${qr(joinUrl())}<span>Escanea el código QR con tu celular</span></div>
      <div class="gc-qrgc-band"><b class="gc-qrgc-title">${esc(name)}</b><span>Pon tu nombre, apellido y participa</span>${count ? '<em class="gc-big-count"></em>' : ''}</div></div>`;
  // Nombre completo siempre: si no cabe en la franja, se achica la letra
  const fitQrGC = () => { const t = document.querySelector('.gc-qrgc-title'); if (!t) return; t.style.fontSize = ''; let k = 1; while (t.scrollWidth > t.clientWidth + 1 && k > 0.4) { k -= 0.05; t.style.fontSize = `calc(var(--qrgc-t) * ${k})`; } };
  // QR a pantalla completa, elegido a mano en el centro de control (en el GC de OBS, en versión GC)
  views.qrBig = async () => {
    document.body.classList.add('obs', 'gc-screen');
    const s = ((await api('GET', '/api/current').catch(() => ({}))).sessions || [])[0];
    app.innerHTML = `<div id="gc" class="th-${s ? s.theme : 'frida'}">${qrGC(s ? s.name : 'KRB Stage · Sala de juegos', false)}</div>`;
    fitQrGC(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitQrGC);
    return () => document.body.classList.remove('obs', 'gc-screen');
  };

  views.gc = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="gc"></div>';
    let off = null;
    let poll = null;
    let sid = null;
    let lastCount = -1;
    let winShown = null;
    let winTimer = null;
    let shrinkTimer = null;
    const FULL_MS = 6000; // cuánto dura la celebración a pantalla completa
    let bigShown = false;
    let inPlay = false; // diseño nuevo: las piezas entran con movimiento solo la primera vez que se dibuja el bingo
    const leave = () => { clearTimeout(winTimer); clearTimeout(shrinkTimer); if (off) off(); off = null; sid = null; lastCount = -1; winShown = null; bigShown = false; inPlay = false; };

    // Diseño nuevo: se parte del tamaño que da su CSS (en el anterior, de 6 y 4 vh como siempre)
    const fitTop = () => {
      const t2 = !!(window.t2 && window.t2());
      const fit = (el, top) => {
        if (!el) return;
        el.style.fontSize = '';
        const from = t2 ? (parseFloat(getComputedStyle(el).fontSize) / innerHeight) * 100 || top : top;
        for (let f = from; f > from / 2 && el.scrollWidth > el.clientWidth + 1; f -= 0.2) el.style.fontSize = `${f.toFixed(1)}vh`;
      };
      fit($('.gc-title'), 6);
      fit($('.gc-sub'), 4);
      // El texto libre va en un recuadro de varias líneas: si no cabe, se achica la letra (nunca se corta)
      const msg = $('.gc-msg');
      if (msg) { msg.style.fontSize = ''; if (t2) { const box = msg.parentElement; let f = parseFloat(getComputedStyle(msg).fontSize); for (let i = 0; i < 30 && f > 9 && (box.scrollHeight > box.clientHeight + 1 || msg.scrollWidth > msg.clientWidth + 1); i++) { f *= 0.94; msg.style.fontSize = `${f.toFixed(1)}px`; } } }
    };
    // Al cambiar de diseño sin recargar, la letra se vuelve a ajustar (y otra vez cuando cargan las letras de ese diseño)
    const onTema = () => { fitTop(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTop); };
    window.addEventListener('tema', onTema);

    const draw = (st) => {
      const current = st.drawn.at(-1);
      const fresh = st.drawn.length !== lastCount && lastCount >= 0 && st.drawn.length > 0;
      lastCount = st.drawn.length;
      const id = st.patterns[0];
      const mask = PATTERNS.byId[id].variants[0];
      const figure = Array.from({ length: 25 }, (_, i) => `<i class="${mask & (1 << i) ? 'x' : ''}"></i>`).join('');
      // Con ganadores: se retira la gráfica y queda la celebración a pantalla completa
      if (st.celebrate) {
        bigShown = false; inPlay = false;
        // Ganador ya confirmado: la celebración se recoge a un cartel abajo al centro, para dejar ver la cámara
        // A los 15 s de confirmado, el cartel se retira y el GC queda limpio
        const left = st.winConfirmed ? 15000 - (st.now - st.winConfirmedAt) : Infinity;
        clearTimeout(winTimer);
        if (left <= 0) { winShown = 'gone'; $('#gc').innerHTML = ''; return; }
        if (st.winConfirmed) winTimer = setTimeout(() => { winShown = 'gone'; $('#gc').innerHTML = ''; }, left);
        // Sin confirmar todavía: la pantalla completa dura 6 s y después baja sola al cartel, que se queda
        // hasta que el animador confirme (ahí cuenta sus 15 s) o siga jugando.
        const sinceWin = st.now - (st.celebrateAt || 0);
        const low = st.winConfirmed || sinceWin >= FULL_MS;
        clearTimeout(shrinkTimer);
        if (!low) shrinkTimer = setTimeout(() => draw({ ...st, now: st.now + (FULL_MS - sinceWin) + 50 }), FULL_MS - sinceWin + 50);
        const key = winKey(st) + (st.winConfirmed ? '|ok' : low ? '|low' : '');
        if (key !== winShown) {
          winShown = key;
          if (low) {
            const seen = new Set();
            const w = st.results.filter((r) => r.validated && !seen.has(r.cardNo) && seen.add(r.cardNo));
            $('#gc').className = `th-${st.theme}`;
            $('#gc').innerHTML = `<div class="gc-winlow ${w.length > 1 ? 'many' : ''} ${st.winConfirmed ? '' : 'hold'}"><span class="gc-winlow-tag">¡Bingo! · ${w.length > 1 ? 'Ganadores' : 'Ganador'}</span>
              <b style="--n:${w.slice(0, 4).map((r) => r.name || 'Participante').join(' · ').length}">${w.slice(0, 4).map((r) => esc(r.name || 'Participante')).join(' · ')}</b>
              <small>${w.length > 1 ? esc(bingoName(st.name)) : `Cartón #${st.startNumber + w[0].cardNo - 1} · ${esc(PATTERNS.byId[id].name)}`}</small></div>`;
          } else $('#gc').innerHTML = winScreenHTML(st);
        }
        return;
      }
      winShown = null; clearTimeout(winTimer); clearTimeout(shrinkTimer);
      $('#gc').className = `th-${st.theme}`; // colores según el local
      // Antes de empezar: cartel con el QR en grande para que la gente entre
      if (st.bigQr) {
        inPlay = false;
        lastCount = st.drawn.length;
        const count = st.players === 1 ? '1 participante ya está dentro' : `${st.players} participantes ya están dentro`;
        // Se dibuja una sola vez; después solo se actualiza el contador, para que el cartel no salte
        if (!bigShown || !$('.gc-big-count')) {
          bigShown = true;
          $('#gc').innerHTML = qrGC(st.name, true);
          fitQrGC(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitQrGC);
        }
        $('.gc-big-count').textContent = count;
        return;
      }
      bigShown = false;
      $('#gc').innerHTML = `
        <header class="gc-top"><b class="gc-title">${esc(bingoName(st.name))}</b>${st.gc.top ? `<span class="gc-sub">${esc(st.gc.top)}</span>` : ''}</header>
        <div class="gc-bunting">${bunting}</div>
        <div class="gc-people"><span class="t2-emo">👥</span> <b>${st.players}</b> ${st.players === 1 ? 'participante' : 'participantes'}</div>
        ${nextUpHTML()}
        <div class="gc-qr">${qr(joinUrl())}</div>
        <footer class="gc-bottom">${st.gc.bottom ? `<span class="gc-msg">${rich(st.gc.bottom)}</span>` : ''}</footer>
        <div class="gc-draw">
          ${st.drawn.length ? `<div class="gc-ballwrap ${fresh ? 'pop' : ''}">${ballHTML(st, current, 'gcball')}</div>` : '<div class="gc-soon">¡Ya comienza<br>el bingo!</div>'}
          <div class="gc-prev" hidden>${st.drawn.slice(-5, -1).map((v) => ballHTML(st, v, 'gcprev')).join('')}</div>
        </div>
        <div class="gc-figure${/^figura\b/i.test(PATTERNS.byId[id].name) ? ' fig-sola' : ''}">
          <div class="gc-grid">${figure}</div>
          <b class="${PATTERNS.byId[id].name.length > 10 ? 'long' : ''}">${esc(PATTERNS.byId[id].name)}</b>
        </div>`;
      // La frase de la franja de arriba se achica hasta caber completa (pedido de Cote: que no se corte con «…»)
      // El título también (ej. «El Bingo de Mercado Kennedy»), antes que la frase, que usa el espacio que él deja
      fitTop();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTop);
      if (!inPlay) { inPlay = true; $('#gc').classList.add('t2-entra'); }
    };

    // Sin sesión activa: queda solo el QR arriba a la derecha, sobre fondo transparente
    const idle = () => {
      $('#gc').className = 'th-frida';
      $('#gc').innerHTML = `<div class="gc-qr">${qr(joinUrl())}</div><div class="gc-idle-label">Escanea el código QR con tu celular y prepárate</div>`;
    };
    // Sigue siempre a la sesión activa más reciente; sin sesión, la gráfica queda vacía (transparente)
    const follow = async () => {
      if (!$('#gc')) { clearInterval(poll); return; } // ya se salió de esta pantalla
      const list = (await api('GET', '/api/current').catch(() => ({}))).sessions || [];
      if (!$('#gc')) return;
      const next = list.length ? list[0].id : null;
      if (next === sid) return;
      leave();
      idle();
      if (!next) return;
      sid = next;
      off = subscribe(sid, draw, () => { leave(); idle(); });
    };
    idle();
    await follow();
    poll = setInterval(follow, 5000);
    return () => { clearInterval(poll); leave(); window.removeEventListener('tema', onTema); document.body.classList.remove('obs', 'gc-screen'); };
  };
})();
