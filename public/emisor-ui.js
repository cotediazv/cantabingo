/* global api, toast, esc, store, views, app */
// Centro de control: el emisor de la pantalla vertical de Mercado Kennedy (26 nov). Dice si está encendido, deja ver la
// emisión (/emision) y tiene el «modo prueba» que pidió Cote el 25 nov («hoy necesita que se quede en prueba y prendido
// todo el tiempo, da lo mismo el costo; necesita probarlo»): con el modo prueba el emisor corre y transmite siempre, haya
// o no juego. Sin él, parte solo cuando hay un juego en Kennedy y se apaga a los 10 minutos sin juego.
(() => {
  if (/^\/animador/.test(location.pathname)) return;
  let busy = false;
  const paint = async (box) => {
    const r = await api('GET', '/api/emisor').catch(() => null);
    if (!r || !document.body.contains(box)) return;
    const estado = r.corriendo ? '🟢 Encendido' : '⚪ Apagado';
    box.innerHTML = `<h2>📡 Emisión de la pantalla vertical · Mercado Kennedy</h2>
      <p class="muted small">${r.configurado ? '' : 'Falta poner RENDER_API_KEY y EMISOR_CRON en Render. '}El emisor parte solo cuando hay un juego en pantalla en Mercado Kennedy y se apaga a los 10 minutos sin juego. Con el <b>modo prueba</b> queda encendido y transmitiendo todo el tiempo (cada minuto encendido se cobra).</p>
      <p><b>${estado}</b>${r.prueba ? ' · <b>modo prueba puesto</b>' : ''}${r.error ? ` · <span class="muted small">Último error: ${esc(r.error)}</span>` : ''}</p>
      <div class="row"><button type="button" class="${r.prueba ? 'primary' : ''}" data-emi="1">🧪 Modo prueba: encendido siempre${r.prueba ? ' · puesto' : ''}</button><button type="button" class="${r.prueba ? '' : 'primary'}" data-emi="0">Solo con juegos${r.prueba ? '' : ' · puesto'}</button><a class="btn" href="/emision" target="_blank" rel="noopener">👁 Ver la emisión</a></div>`;
  };
  const mount = () => {
    if (!/^#\/control\b/.test(location.hash)) return;
    let box = document.getElementById('emi-box');
    if (box) { if (!busy && !document.hidden) paint(box); return; }
    // siempre en el mismo lugar: justo debajo de «Dirección de los QR»
    const pub = document.getElementById('pub-box'); if (!pub || !store.get('adminToken')) return;
    box = document.createElement('div'); box.className = 'panel'; box.id = 'emi-box';
    pub.parentNode.insertBefore(box, pub.nextSibling);
    wire(box);
    paint(box);
  };
  const wire = (box) => {
    box.onclick = async (e) => {
      const b = e.target.closest('button[data-emi]'); if (!b) return;
      busy = true;
      try { const r = await api('POST', '/api/emisor/prueba', { on: b.dataset.emi === '1' }); toast(r.prueba ? 'Modo prueba: el emisor queda encendido todo el tiempo (parte en 1 o 2 minutos)' : 'El emisor vuelve a encenderse solo con juegos'); } catch (err) { toast(err.message); }
      busy = false; paint(box);
    };
  };
  // Enlace directo (Cote, 25 nov: «decir exactamente dónde está… y el link directo»): cantabingo.onrender.com/emisor
  views.emisor = async () => {
    await api('GET', '/api/emisor'); // sin sesión de moderador, pide entrar
    app.innerHTML = '<p class="back"><a href="#/control">← Centro de control</a></p><div class="panel" id="emi-box"></div>';
    const box = document.getElementById('emi-box'); wire(box); paint(box);
    const t = setInterval(() => { if (!busy && !document.hidden) paint(box); }, 5000);
    return () => clearInterval(t);
  };
  setInterval(mount, 5000); window.addEventListener('hashchange', () => setTimeout(mount, 900)); setTimeout(mount, 1300);
})();
