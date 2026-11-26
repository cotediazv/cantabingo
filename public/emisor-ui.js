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
    // Qué está mostrando el deco de la pantalla vertical (pv.html avisa cada 30 s)
    const d = ((await api('GET', '/api/deco').catch(() => ({}))) || {}).kennedy;
    let tag = ''; try { tag = (await fetch('/pv.html', { method: 'HEAD', cache: 'no-store' })).headers.get('etag') || ''; } catch (e) { tag = ''; }
    const viejo = d && tag && d.ver && d.ver !== tag;
    const deco = !d ? '⚪ El deco no ha avisado todavía (si está encendido, puede tener una versión antigua de la página: se pone al día sola cuando pasa a la cartelera, o al recargarla)'
      : d.hace > 90 ? `⚪ El deco no avisa hace ${Math.round(d.hace / 60)} min (¿apagado o sin internet?). Lo último: mostraba ${esc(d.que)}`
        : d.emi ? `🟢 El deco está mostrando <b>la transmisión en vivo</b>${d.vw ? ` · le llega de ${d.vw}x${d.vh}` : ''}${d.saltos ? ` · el video cambió de tamaño ${d.saltos} ${d.saltos === 1 ? 'vez' : 'veces'} (eso es la copia chica que salta)` : ''}`
          : d.cuadros ? '🟢 El deco está mostrando <b>el plan B: la imagen cuadro a cuadro</b> (una por segundo)'
          : `🟡 El deco está mostrando <b>${esc(d.que)}</b>, no la transmisión${d.vista === 'sala' ? (!d.rtc ? ' · su navegador no tiene WebRTC: no puede recibir la emisión' : !d.emiUrl ? ' · no tiene la dirección de la emisión' : d.intentando ? ' · está intentando conectarse a la emisión' : ' · reintenta cada 15 s') : ' · la transmisión se pone encima solo cuando la pantalla muestra los juegos de la sala'}`;
    // Por qué el deco no toma el plan A (la transmisión en vivo): lo que el deco cuenta de sus intentos (26 nov)
    const porQue = !d || d.hace > 90 || d.emi ? '' : `<p class="small"><b>Plan A (transmisión en vivo) en el deco:</b> ${!d.rtc ? '❌ su navegador <b>no tiene WebRTC</b>: no puede recibir la transmisión en vivo; ahí solo sirve el plan B'
      : `${d.fallos ? `${d.fallos} intento${d.fallos === 1 ? '' : 's'} sin imagen` : 'sin intentos fallidos'}${d.err ? ` · último motivo: <b>${esc(d.err)}</b>` : ''}${d.ice ? ` · conexión: ${esc(d.ice)}` : ''}${d.vw ? ` · le llega video de ${d.vw}x${d.vh}` : ''}${d.codecs ? ` · formatos que recibe: ${esc(d.codecs)}` : ''}`}${d.soloA ? ' · está en «Solo plan A»' : ''}</p>`;
    // Quién lee la pantalla vertical de Kennedy (aunque la página sea antigua y no avise) y la foto del emisor
    const lec = (await api('GET', '/api/deco/lectores?p=kennedy').catch(() => [])) || [];
    const quien = (r) => { const pag = /pv\.html/.test(r.ref) ? 'pantalla liviana (pv.html)' : r.ref === '' ? 'sin página (¿app o emisor?)' : /emisor=1/.test(r.ref) ? 'el emisor' : 'pantalla completa'; const nav = (/(Chrome|Firefox|Safari|Edg|OPR|SamsungBrowser|CrKey|Android)[\/ ][\d.]+/.exec(r.ua) || [r.ua.slice(0, 40)])[0]; return `${pag} · ${esc(nav)}${/Android/.test(r.ua) ? ' · Android' : ''} · hace ${r.hace} s`; };
    const lecTxt = `<details class="emi-lec"><summary class="small">Quién está leyendo la pantalla vertical de Kennedy (${lec.length})</summary><ul class="small">${lec.map((r) => `<li>${quien(r)}<br><span class="muted">${esc(r.ua)} · ${esc(r.ref || '—')}</span></li>`).join('') || '<li class="muted">Nadie en los últimos 10 minutos</li>'}</ul></details>`;
    const fi = await api('GET', '/api/emisor/foto/info').catch(() => null);
    const fotoTxt = fi ? `<div class="emi-foto"><img alt="Lo que transmite el emisor" data-foto="${fi.at}"><div class="small"><b>Lo que está transmitiendo el emisor</b><br>foto de hace ${fi.hace} s${fi.cap ? ` · ${esc(fi.cap)}` : ''}<br>${fi.luz >= 0 ? (fi.luz < 6 ? '⚠️ La captura sale <b>negra</b> (la página sí se ve en la foto si no está negra)' : fi.luz >= 250 ? `⚠️ La captura sale <b>blanca</b> (luz ${fi.luz}): el emisor vuelve a abrir la página solo` : `luz de la captura: ${fi.luz} (no es negra)`) : 'no se pudo medir la captura'}</div></div>` : '<p class="muted small">Todavía no hay foto del emisor (la manda cada minuto mientras transmite).</p>';
    const decoTxt = `<p>${deco}${d && d.hace <= 90 ? ` <span class="muted small">· aviso hace ${d.hace} s${viejo ? ' · tiene una versión antigua de la página' : ''}</span>` : ''}</p>`;
    const estado = r.corriendo ? '🟢 Encendido' : '⚪ Apagado';
    const wasOpen = !!(box.querySelector('.emi-lec') && box.querySelector('.emi-lec').open);
    const oldImg = box.querySelector('img[data-foto]'); const oldFoto = oldImg ? [oldImg.dataset.foto, oldImg.src] : null;
    box.innerHTML = `<h2>📡 Emisión de la pantalla vertical · Mercado Kennedy</h2>
      <p class="muted small">${r.configurado ? '' : 'Falta poner RENDER_API_KEY y EMISOR_CRON en Render. '}El emisor parte solo cuando hay un juego en pantalla en Mercado Kennedy y se apaga a los 10 minutos sin juego. Con el <b>modo prueba</b> queda encendido y transmitiendo todo el tiempo (cada minuto encendido se cobra).</p>
      <p><b>${estado}</b>${r.prueba ? ' · <b>modo prueba puesto</b>' : ''}${r.error ? ` · <span class="muted small">Último error: ${esc(r.error)}</span>` : ''}</p>
      ${decoTxt}${porQue}
      <div class="row"><button type="button" data-emi-reload>↻ Recargar la pantalla vertical de Kennedy a distancia</button><button type="button" data-emi-restart>↻ Reiniciar el emisor</button></div>
      ${lecTxt}${fotoTxt}
      <div class="emi-planb"><b>Qué muestra el deco con un juego</b> <span class="muted small">Plan A = la transmisión en vivo (se ve igual que la pantalla completa). Plan B = una imagen por segundo de la misma pantalla (sirve en cualquier aparato). En «Automático» el plan B entra solo si el deco no tiene WebRTC o la transmisión no le llega en dos intentos.${r.cuadro != null ? ` · última imagen del plan B hace ${r.cuadro} s` : ' · todavía no llegan imágenes del plan B'}</span>
        <div class="row">${[['a', '📡 Solo plan A'], ['auto', 'Automático'], ['b', '🖼️ Plan B siempre']].map(([m, t]) => `<button type="button" class="${r.modo === m ? 'primary' : ''}" data-modo="${m}">${t}${r.modo === m ? ' · puesto' : ''}</button>`).join('')}</div></div>
      <div class="emi-planb"><b>Formato del video de la transmisión</b> <span class="muted small">VP8 lo recibe cualquier navegador con WebRTC; H.264 es más liviano para el deco, pero no todos lo reciben (Cloudflare responde 406). Al cambiarlo, la emisión se vuelve a partir sola.</span>
        <div class="row">${[['vp8', 'VP8 (recomendado)'], ['h264', 'H.264']].map(([c, t]) => `<button type="button" class="${r.codec === c ? 'primary' : ''}" data-codec="${c}">${t}${r.codec === c ? ' · puesto' : ''}</button>`).join('')}</div></div>
      <div class="emi-planb"><b>Resolución de la transmisión</b> <span class="muted small">720×1280 le exige mucho menos al emisor y al deco y no salta; 1080×1920 se ve más nítido. Al cambiarla, el emisor se reinicia solo (1 o 2 minutos sin transmisión).</span>
        <div class="row">${[[720, '720×1280 (recomendado)'], [1080, '1080×1920']].map(([v, t]) => `<button type="button" class="${r.res === v ? 'primary' : ''}" data-res="${v}">${t}${r.res === v ? ' · puesto' : ''}</button>`).join('')}</div></div>
      <div class="row"><button type="button" class="${r.prueba ? 'primary' : ''}" data-emi="1">🧪 Modo prueba: encendido siempre${r.prueba ? ' · puesto' : ''}</button><button type="button" class="${r.prueba ? '' : 'primary'}" data-emi="0">Solo con juegos${r.prueba ? '' : ' · puesto'}</button><a class="btn" href="/emision" target="_blank" rel="noopener">👁 Ver la emisión</a></div>`;
    if (wasOpen) box.querySelector('.emi-lec').open = true;
    const img = box.querySelector('img[data-foto]');
    if (img) {
      if (oldFoto && oldFoto[0] === img.dataset.foto) img.src = oldFoto[1];
      else fetch(`/api/emisor/foto?t=${img.dataset.foto}`, { headers: { 'x-admin': store.get('adminToken') || '' } }).then((r) => (r.ok ? r.blob() : null)).then((bl) => { if (bl) img.src = URL.createObjectURL(bl); }).catch(() => {});
    }
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
      if (e.target.closest('[data-emi-reload]')) {
        if (!confirm('¿Recargar la pantalla vertical de Kennedy? Si está en pantalla completa, sale de ella.')) return;
        try { await api('POST', '/api/deco/recargar', { p: 'kennedy' }); toast('Listo: la pantalla se recarga en unos segundos (si tiene la página nueva)'); } catch (err) { toast(err.message); }
        return;
      }
      if (e.target.closest('[data-emi-restart]')) {
        if (!confirm('¿Reiniciar el emisor? La emisión se corta 1 o 2 minutos y vuelve sola.')) return;
        try { await api('POST', '/api/emisor/reiniciar'); toast('Listo: el emisor parte de nuevo en 1 o 2 minutos'); } catch (err) { toast(err.message); }
        return;
      }
      const rb = e.target.closest('button[data-res]');
      if (rb) {
        if (!confirm('¿Cambiar la resolución? El emisor se reinicia: 1 o 2 minutos sin transmisión.')) return;
        busy = true;
        try { const r = await api('POST', '/api/emisor/res', { res: Number(rb.dataset.res) }); toast(`Resolución ${r.res === 720 ? '720×1280' : '1080×1920'}: el emisor parte de nuevo en 1 o 2 minutos`); } catch (err) { toast(err.message); }
        busy = false; paint(box); return;
      }
      const cb = e.target.closest('button[data-codec]');
      if (cb) {
        busy = true;
        try { const r = await api('POST', '/api/emisor/codec', { codec: cb.dataset.codec }); toast(`Formato ${r.codec === 'vp8' ? 'VP8' : 'H.264'}: la emisión se vuelve a partir en unos segundos`); } catch (err) { toast(err.message); }
        busy = false; paint(box); return;
      }
      const pb = e.target.closest('button[data-modo]');
      if (pb) {
        busy = true;
        try { const r = await api('POST', '/api/emisor/modo', { modo: pb.dataset.modo }); toast({ a: 'Solo plan A: el deco muestra solo la transmisión en vivo y sigue intentando (el plan B no entra)', auto: 'Automático: el deco usa la transmisión y, si no le llega, la imagen cuadro a cuadro', b: 'Plan B puesto: el deco muestra la imagen cuadro a cuadro' }[r.modo]); } catch (err) { toast(err.message); }
        busy = false; paint(box); return;
      }
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
