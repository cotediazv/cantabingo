//@ Vista: escena (GC de OBS), que sigue el escenario; QR para entrar y nombres que caben. Parte de la aplicación: se carga en orden desde index.html.
// El QR siempre es para entrar a la sala. Las gráficas que no traen el suyo (sorteo, rosco y show)
// reciben este, en la esquina que cada una tiene libre. Sin lugar indicado, se retira.
function joinQr(spot) {
  let el = document.getElementById('join-qr');
  if (!spot) { if (el) el.remove(); return; }
  // Pedido de Cote: el recuadro blanco no se ensancha por la frase; el ancho es el del QR y la frase va en dos líneas
  // centradas («Escanea el código QR» / «con tu celular»), con la letra justa para caber
  if (!el) { el = document.createElement('div'); el.id = 'join-qr'; el.innerHTML = `${qr(joinUrl())}<b><span>Escanea el código QR</span><span>con tu celular</span></b>`; document.body.appendChild(el); }
  el.className = `join-qr ${spot}`;
  // La frase se mide ahora, otra vez cuando cargan las letras, y al cambiar de diseño sin recargar (cada diseño tiene su letra)
  const refit = () => { fitJoinQr(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitJoinQr); };
  refit();
  if (!joinQr.onTema) { joinQr.onTema = refit; addEventListener('tema', refit); }
}
function fitJoinQr() {
  const el = document.getElementById('join-qr');
  const code = el && el.querySelector('.qr');
  const b = el && el.querySelector('b');
  if (!code || !b) return;
  b.style.fontSize = '';
  const max = code.getBoundingClientRect().width;
  let f = parseFloat(getComputedStyle(b).fontSize) || 16;
  const wide = () => Math.max(...Array.from(b.children).map((x) => x.getBoundingClientRect().width));
  for (let i = 0; i < 40 && wide() > max + 1 && f > 6; i++) { f *= 0.96; b.style.fontSize = `${f.toFixed(1)}px`; }
}
addEventListener('resize', fitJoinQr);
if (document.fonts) document.fonts.ready.then(fitJoinQr);

// Pantalla única para OBS: muestra la gráfica que el moderador elija en «Juegos».
// No requiere iniciar sesión y queda transparente cuando no hay nada que mostrar.
views.escena = async () => {
  let current = null;
  let stop = null;
  let busy = false;
  document.body.classList.add('obs');
  let again = false; // llegó un aviso mientras se armaba la pantalla: se vuelve a mirar al terminar
  const apply = async () => {
    if (busy) { again = true; return; }
    busy = true;
    try {
      const sr = await api('GET', '/api/stage').catch(() => null);
      // GC PER: en el GC de OBS el texto va en la franja de abajo, en lugar del GC, hasta que se toque otro botón
      const per = sr && sr.per && sr.per.on ? sr.per.text : '';
      const show = !sr ? (current || 'none') : per ? `per:${document.body.dataset.venue || ''}:${per}` : sr.show || current || 'none';
      if (show !== current) {
        current = show;
        if (typeof stop === 'function') stop();
        stop = null;
        app.innerHTML = '';
        if (per) {
          const v = document.body.dataset.venue || 'kennedy';
          document.body.classList.add('gc-screen');
          app.innerHTML = `<div id="lg" class="th-${v}">${window.gcPer.card(v, per)}</div>`;
          stop = () => document.body.classList.remove('gc-screen');
        } else if (KRB.escenarios[show] && KRB.escenarios[show].gc) stop = await KRB.escenarios[show].gc(); // lo que el juego registró para el GC
        joinQr(KRB.escenarios[show] ? KRB.escenarios[show].qrGc : undefined);
        document.body.classList.add('obs');
      }
    } finally { busy = false; if (again) { again = false; apply(); } }
  };
  await apply();
  const timer = setInterval(apply, 2000);
  const offAviso = window.onAviso(apply);
  return () => { clearInterval(timer); offAviso(); if (typeof stop === 'function') stop(); joinQr(); document.body.classList.remove('obs'); };
};

// Red de seguridad para los nombres en pantalla: el CSS ya calcula la letra según el largo, pero si un
// nombre con letras muy anchas igual no cabe, aquí se achica lo justo. Así nunca se corta.
const fitNames = () => {
  for (const el of document.querySelectorAll('[style*="--n"]')) {
    el.style.fontSize = '';
    const width = Math.max(el.scrollWidth, el.offsetWidth); // medida del diseño: no la alteran las animaciones de entrada
    const pad = parseFloat(getComputedStyle(el.parentElement).paddingLeft) + parseFloat(getComputedStyle(el.parentElement).paddingRight);
    const room = Math.min(innerWidth * 0.92, (el.parentElement.clientWidth - pad) || Infinity);
    if (width > room && room > 0) el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * room / width) * 0.97}px`;
  }
};
new MutationObserver(() => requestAnimationFrame(fitNames)).observe(document.getElementById('app'), { childList: true, subtree: true, characterData: true });
window.addEventListener('resize', fitNames);
// Los nombres se vuelven a medir cuando terminan de cargar las letras y al cambiar de diseño (con otra letra el ancho cambia)
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestAnimationFrame(fitNames));
window.addEventListener('tema', () => requestAnimationFrame(fitNames));

