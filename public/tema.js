// Interruptor del diseño nuevo (pedido de Cote, 22 nov). El diseño nuevo vive en tema*.css, todo bajo «html.t2». La clase
// se pone al cargar (en index.html, para que no parpadee) y aquí se mantiene al día con el servidor: si en el Centro de
// control se vuelve al diseño anterior, todas las pantallas abiertas (OBS, tableros, verticales) cambian solas en unos
// segundos, sin recargar. ?tema=0 o ?tema=1 en la dirección lo deja fijo en esa página (para probar y comparar).
(() => {
  const forced = /[?&]tema=([01])/.exec(location.search);
  const root = document.documentElement;
  window.t2 = () => root.classList.contains('t2');
  // En el diseño nuevo las etiquetas de las pantallas van sin emojis
  window.sinEmoji = (s) => (window.t2() ? String(s).replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})[\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]*/gu, '').replace(/\s{2,}/g, ' ').trim() : s);
  const set = (on) => {
    if (forced) return;
    if (window.__t2ok === false) on = false; // navegador antiguo: siempre el diseño anterior
    root.classList.toggle('t2', on);
    try { localStorage.setItem('tema', on ? '1' : '0'); } catch (e) { /* sin almacenamiento: se usa lo que diga el servidor */ }
    window.dispatchEvent(new CustomEvent('tema', { detail: { on } }));
  };
  let last = null;
  // Dirección de los QR (pedido de Cote, 22 nov: juegos.krbstage.cl): llega junto con el diseño. Si cambia mientras una
  // pantalla con QR está abierta (tablero, GC, pantallas del local), esa pantalla se recarga sola una vez para rehacer
  // sus QR (solo si la dirección quedó guardada en el navegador: así nunca se recarga en círculo).
  let pub = null;
  const setPub = (u) => {
    const was = window.__pub || ''; window.__pub = u; let kept = false;
    try { localStorage.setItem('pub', u); kept = localStorage.getItem('pub') === u; } catch (e) { kept = false; }
    if (u !== was && kept && document.querySelector('body.full, body.obs, body.vert-in, body.rot-screen')) location.reload();
  };
  const sync = async () => {
    try {
      const r = await (await fetch('/api/tema', { cache: 'no-store' })).json();
      if (typeof r.pub === 'string' && r.pub !== pub) { pub = r.pub; setPub(r.pub); paintPub(); }
      if (typeof r.on === 'boolean' && r.on !== last) { last = r.on; set(r.on); paint(); }
    } catch (e) { /* sin conexión: queda como está */ }
  };
  // Centro de control: a dónde apuntan los QR
  const PUBS = [['', 'cantabingo.onrender.com', 'la de siempre'], ['https://saladejuegos.krbstage.cl', 'saladejuegos.krbstage.cl', 'la de los participantes']];
  const paintPub = () => {
    const box = document.getElementById('pub-box');
    if (!box || pub === null) return;
    box.innerHTML = `<h2>Dirección de los QR</h2>
      <p class="muted small">A dónde lleva el código QR que escanea el público. La sala es la misma en las dos; las direcciones de OBS y de las pantallas no cambian. Antes de cambiar, se comprueba que la dirección responde.</p>
      <div class="row">${PUBS.map(([u, name, nota]) => `<button type="button" class="${pub === u ? 'primary' : ''}" data-pub="${u}">${name}${pub === u ? ' · puesta' : ` · ${nota}`}</button>`).join('')}</div>`;
  };
  // Centro de control: recuadro para encender o apagar el diseño nuevo
  const paint = () => {
    const box = document.getElementById('tema-box');
    if (!box || last === null) return;
    box.innerHTML = `<h2>Diseño de las pantallas</h2>
      <p class="muted small">Vale para el GC de la transmisión, los tableros y las pantallas de pie de los tres locales. Cambia solo en unos segundos, sin recargar nada.</p>
      <div class="row"><button type="button" class="${last ? 'primary' : ''}" data-tema="1">🎨 Diseño nuevo${last ? ' · puesto' : ''}</button><button type="button" class="${last ? '' : 'primary'}" data-tema="0">↩️ Diseño anterior${last ? '' : ' · puesto'}</button></div>`;
  };
  const mount = () => {
    if (!/^#\/control\b/.test(location.hash)) return;
    const stage = document.getElementById('stage');
    if (!stage || document.getElementById('tema-box')) return;
    const box = document.createElement('div'); box.className = 'panel'; box.id = 'tema-box';
    const panel = stage.closest('.panel'); panel.parentNode.insertBefore(box, panel.nextSibling);
    box.onclick = async (e) => {
      const b = e.target.closest('button[data-tema]'); if (!b) return;
      try { const r = await api('POST', '/api/tema', { on: b.dataset.tema === '1' }); last = r.on; set(r.on); paint(); toast(r.on ? 'Diseño nuevo en todas las pantallas' : 'Diseño anterior en todas las pantallas'); } catch (err) { toast(err.message); }
    };
    paint();
    const pbox = document.createElement('div'); pbox.className = 'panel'; pbox.id = 'pub-box';
    box.parentNode.insertBefore(pbox, box.nextSibling);
    pbox.onclick = async (e) => {
      const b = e.target.closest('button[data-pub]'); if (!b || b.dataset.pub === pub) return;
      try { b.disabled = true; const r = await api('POST', '/api/pub', { url: b.dataset.pub }); pub = r.pub; setPub(r.pub); paintPub(); toast(r.pub ? `Los QR ahora llevan a ${r.pub.replace('https://', '')}` : 'Los QR vuelven a cantabingo.onrender.com'); } catch (err) { toast(err.message); paintPub(); }
    };
    paintPub();
  };
  sync(); setInterval(sync, 10000); setInterval(mount, 1000);
})();
