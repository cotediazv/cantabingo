//@ Vista: tablero (pantalla del local), que sigue el escenario. Parte de la aplicación: se carga en orden desde index.html.
// Tablero del DJ: pantalla completa (no transparente) que sigue sola lo que está pasando,
// igual que la gráfica de OBS: bingo, sorteo o desempate, El Rosko.
views.tablero = async () => {
  let current = null;
  let stop = null;
  let busy = false;
  const mark = () => { document.body.classList.add('full'); document.body.classList.remove('obs'); };
  mark();
  // Sonido: botón visible hasta que alguien toca la pantalla (requisito del navegador)
  const soundBtn = document.createElement('button');
  soundBtn.className = 'sound-btn';
  soundBtn.textContent = '🔊 Activar sonido';
  document.body.appendChild(soundBtn);
  // El tablero vertical va mudo (?mudo=1), para que no suene doble junto al tablero principal
  // La pantalla vertical va siempre sin sonido (pedido de Cote): con ?mudo=1 o si la pantalla está de pie
  const mute = new URLSearchParams(location.search).has('mudo') || innerHeight > innerWidth;
  const paintSound = () => { soundBtn.hidden = mute || sfx.ready(); };
  const enableSound = () => { if (mute) return; const c = sfx.unlock(); if (c) { c.onstatechange = paintSound; Promise.resolve(c.resume()).then(() => { paintSound(); if (!soundBtn.dataset.done) { soundBtn.dataset.done = '1'; sfx.play('hit'); } }).catch(() => {}); } };
  document.addEventListener('pointerdown', enableSound);
  document.addEventListener('keydown', enableSound);
  if (!mute) sfx.unlock(); // donde el navegador lo permite sin tocar (pantallas en modo quiosco), queda activo de inmediato
  setTimeout(paintSound, 300);
  let again = false; // llegó un aviso mientras se armaba la pantalla: se vuelve a mirar al terminar
  const apply = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const sr = await api('GET', '/api/stage').catch(() => null);
      const show = (sr && sr.show) || current || 'none';
      // GC PER: en el tablero se agrega como una franja abajo, sin quitar lo que se muestra
      if (sr) window.gcPer.over(sr.per && sr.per.on ? sr.per.text : '', document.body.dataset.venue || '');
      if (show !== current) {
        current = show;
        if (typeof stop === 'function') stop();
        stop = null;
        app.innerHTML = '';
        // Lo que el juego registró para el tablero (KRB.escenario); el bingo, o la portada si no hay nada en juego
        const def = KRB.escenarios[show] && KRB.escenarios[show].full ? KRB.escenarios[show] : KRB.escenarios.bingo;
        stop = await def.full();
        joinQr(def.qrFull);
      }
      mark();
    } finally { busy = false; if (again) { again = false; apply(); } }
  };
  await apply();
  const timer = setInterval(apply, 2000);
  const offAviso = window.onAviso(apply);
  return () => { clearInterval(timer); offAviso(); window.gcPer.over(''); if (typeof stop === 'function') stop(); joinQr(); document.body.classList.remove('full'); soundBtn.remove(); document.removeEventListener('pointerdown', enableSound); document.removeEventListener('keydown', enableSound); };
};

// Tablero para una pantalla puesta de pie (girada 90° a la izquierda) que recibe la señal horizontal de siempre:
// el mismo tablero se dibuja en formato vertical dentro de un marco y se entrega girado 90° a la derecha,
// igual que se hace con los videos para esa pantalla. Va sin sonido.
views['tablero-v'] = async () => {
  document.body.classList.add('rot-screen');
  app.innerHTML = `<iframe class="rot-frame" title="Tablero vertical" src="${location.pathname}?mudo=1${window.__mon || ''}#/tablero"></iframe>`;
  return () => document.body.classList.remove('rot-screen');
};

// Celebración de bingo a pantalla completa: «¡BINGO!», confeti y los nombres de quienes ganaron
const winKey = (st) => st.results.filter((r) => r.validated).map((r) => `${r.cardNo}:${r.name}`).join('|');
function winScreenHTML(st) {
  const seen = new Set();
  const winners = st.results.filter((r) => r.validated && !seen.has(r.cardNo) && seen.add(r.cardNo));
  const colors = ['#ffc400', '#0a9a94', '#ff7a1a', '#2338a8', '#56b04c', '#e8262e', '#ffffff'];
  const confetti = Array.from({ length: 70 }, (_, i) => `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 3).toFixed(2)}s;animation-duration:${(3 + Math.random() * 3).toFixed(2)}s"></i>`).join('');
  const shown = winners.slice(0, 6);
  return `<div class="bwin th-${st.theme} ${winners.length > 3 ? 'many' : ''}"><div class="confetti">${confetti}</div>
    <div class="bwin-card"><span class="bwin-title">¡BINGO!</span>
      ${winners.length > 1 ? '<span class="bwin-sub">Completaron la figura</span>' : ''}
      <div class="bwin-names">${shown.map((r) => `<span><b style="--n:${(r.name || 'Participante').length}">${esc(r.name || 'Participante')}</b><small>Cartón #${st.startNumber + r.cardNo - 1}</small></span>`).join('')}</div>
      ${winners.length > shown.length ? `<span class="bwin-more">y ${winners.length - shown.length} más</span>` : ''}
      ${winners.length > 1 ? '' : '<span class="bwin-sub">¡Felicitaciones!</span>'}</div></div>`;
}

// Vuelve al panel del bingo en curso y devuelve la pantalla de OBS a su gráfica
async function backToBingo() {
  const open = (await activeSessions())[0];
  if (!open) { location.hash = '#/'; return; } // sin sala abierta no hay bingo: se parte creando la sala
  const id = open.projectId;
  store.set('lastBingo', id);
  // Si el bingo anterior ya tiene ganador confirmado, no se vuelve a mostrar: se pasa directo a crear el siguiente
  try {
    const info = await api('GET', `/api/sessions/${open.id}/host`);
    if (info.roundOver) { location.hash = `#/ronda/${id}`; return; }
    if (!info.started) { location.hash = `#/figura/${id}`; return; } // bingo sin empezar: primero la figura
  } catch { /* sin datos: se sigue al panel */ }
  await api('POST', '/api/stage', { show: 'bingo' }).catch(() => {});
  location.hash = `#/anfitrion/${id}`;
}
