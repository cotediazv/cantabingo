//@ Vista: sorteo del próximo juego (tómbola) en tablero y GC. Parte de la aplicación: se carga en orden desde index.html.
// Sorteo del siguiente juego en pantalla: tómbola con los juegos disponibles y, al final, el que salió en grande;
// abajo, todos los juegos (los que ya salieron, marcados). kind: 'full' (tablero) o 'gc' (OBS)
views.juegoDraw = async (kind) => {
  const ROLL_MS = 4500;
  // Pedido de Cote: todo centrado y dentro del cuadro, con márgenes; si un texto llega al borde, se achica la letra
  const fitText = (el) => {
    if (!el) return;
    el.style.fontSize = '';
    let fs = parseFloat(getComputedStyle(el).fontSize) || 20;
    while (el.scrollWidth > el.clientWidth + 1 && fs > 8) { fs -= 1; el.style.fontSize = `${fs}px`; }
  };
  const fitJd = () => {
    const card = $('#jd .jd-card');
    if (!card) return;
    ['.jd-win', '.jd-roll', '.jd-opts'].forEach((q) => fitText(card.querySelector(q)));
    card.querySelectorAll('.jd-slots span').forEach(fitText);
  };
  app.innerHTML = `<div id="jd" class="jd-${kind}"></div>`;
  const se = (t) => (window.sinEmoji ? window.sinEmoji(t) : t); // diseño nuevo: las etiquetas de pantalla van sin emojis
  let shownAt = 0; let timer = null; let alive = true;
  const paint = (g) => {
    const box = $('#jd');
    const ready = g.ready && (!g.last || g.ready.at > g.last.at);
    if (!box || (!g.last && !ready)) { if (box) box.innerHTML = ''; return; }
    const info = GAME_INFO(g.venue);
    // Casilleros de la noche (pedido de Cote): juego inicial y 1.º, 2.º… sorteados; los que ya salieron quedan bloqueados
    // con su juego; el que se está sorteando gira; los que faltan, con candado
    const listOf = (rolling) => {
      const cells = []; // sin «Juego inicial · Bingo» (pedido de Cote, 21 nov)
      for (let i = 0; i < g.total; i++) {
        if (ready && i === g.list.length) { cells.push(`<span class="now"><small>${i + 1}.º juego</small>${se('🎲 …')}</span>`); continue; }
        const k = g.list[i]; const cur = !ready && i === g.list.length - 1;
        cells.push(!k ? `<span class="todo"><small>${i + 1}.º juego</small>${se('🔒')}</span>`
          : cur ? `<span class="${rolling ? 'now' : 'on'}"><small>${i + 1}.º juego</small>${se(rolling ? '🎲 …' : `${info[k].icon} ${esc(info[k].name)}`)}</span>`
            : `<span class="done"><small>${i + 1}.º juego</small>${se(`${info[k].icon} ${esc(info[k].name)}`)}</span>`);
      }
      return `<div class="jd-list jd-slots">${cells.join('')}</div>`;
    };
    if (ready) {
      // paso 1: los juegos que pueden salir
      box.innerHTML = `<div class="jd-card"><small>${se(`🎲 Sorteo del ${g.list.length + 1}.º juego`)}</small><div class="jd-opts">${g.ready.pool.map((k) => `<span>${se(`${info[k].icon} ${esc(info[k].name)}`)}</span>`).join('')}</div>${listOf(true)}</div>`;
      fitJd(); // en una sola línea, centrado y dentro del cuadro
      return;
    }
    const win = info[g.last.game];
    const pool = g.last.pool.map((k) => info[k]);
    const nth = `${g.list.length}.º juego`;
    const left = g.last.direct ? 0 : ROLL_MS - (Date.now() + (g.offset || 0) - g.last.at); // elegido directo: sin tómbola
    if (left > 0) {
      // tómbola: pasan los juegos disponibles cada vez más lento
      box.innerHTML = `<div class="jd-card"><small>${se(`🎲 Sorteo del ${nth}`)}</small><b class="jd-roll"></b>${listOf(true)}</div>`;
      let i = 0; let wait = 70;
      fitJd();
      const spin = () => { if (!alive || !$('.jd-roll')) return; const x = pool[i++ % pool.length]; $('.jd-roll').textContent = se(`${x.icon} ${x.name}`); fitText($('.jd-roll')); wait *= 1.13; if (Date.now() + (g.offset || 0) - g.last.at < ROLL_MS - 200) timer = setTimeout(spin, wait); else paintWin(); };
      const paintWin = () => { if (alive) paint({ ...g, last: { ...g.last, at: g.last.at - ROLL_MS } }); };
      spin();
      return;
    }
    box.innerHTML = `<div class="jd-card won"><small>${se(`🎲 El ${nth} es`)}</small><b class="jd-win">${se(`${win.icon} ${esc(win.name)}`)}</b>${listOf(false)}</div>`;
    fitJd();
    if (Date.now() - shownAt > 1000) { shownAt = Date.now(); sfx.play('win'); }
  };
  let last = '';
  const tick = async () => {
    const g = await api('GET', '/api/gamedraw').catch(() => null);
    if (!alive || !g) return;
    g.offset = g.now - Date.now(); // diferencia de reloj con el servidor
    const key = JSON.stringify([g.last && g.last.at, g.played, g.total, g.list, g.ready && g.ready.at]);
    if (key === last) return;
    last = key;
    clearTimeout(timer);
    paint(g);
  };
  await tick();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) fitJd(); }); // al llegar las letras, se ajusta de nuevo
  const poll = setInterval(tick, 2000);
  return () => { alive = false; clearTimeout(timer); clearInterval(poll); };
};
document.addEventListener('click', (e) => { if (e.target.closest('[data-back-bingo]')) backToBingo(); });
// «QR en pantalla completa» desde cualquier panel: lo pone en OBS y en el tablero sin salir de donde estás
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-stage-qr]')) return;
  try { await api('POST', '/api/stage', { show: 'qr' }); toast('QR en pantalla completa'); } catch (err) { fail(err); }
});

