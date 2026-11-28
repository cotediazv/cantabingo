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
  let priv = null; // aviso de datos personales en la entrada (apagado por defecto)
  const setPub = (u) => {
    const was = window.__pub || ''; window.__pub = u; let kept = false;
    try { localStorage.setItem('pub', u); kept = localStorage.getItem('pub') === u; } catch (e) { kept = false; }
    if (u !== was && kept && document.querySelector('body.full, body.obs, body.vert-in, body.rot-screen')) location.reload();
  };
  const sync = async () => {
    try {
      const r = await (await fetch('/api/tema', { cache: 'no-store' })).json();
      // Copia de eventos (MODO_EVENTO): nombre libre (Cote, 27 nov) y todos los juegos (orden 12 de Code 0, 28 nov)
      window.EVENTO = !!r.evento; document.documentElement.classList.toggle('evento', !!r.evento);
      if (r.evento) window.EVENTO_NOMBRE = r.eventoNombre || '';
      if (r.salas) window.SALAS = r.salas; // nombre de la sala de cada local (orden 15, 28 nov)
      if (typeof r.pub === 'string' && r.pub !== pub) { pub = r.pub; setPub(r.pub); paintPub(); }
      if (typeof r.priv === 'boolean' && r.priv !== priv) { priv = r.priv; paintPriv(); }
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
  // Centro de control: aviso de datos personales en la entrada de la sala de juegos y de la sala light
  const paintPriv = () => {
    const box = document.getElementById('priv-box');
    if (!box || priv === null) return;
    box.innerHTML = `<h2>Aviso de datos personales</h2>
      <p class="muted small">Línea bajo el botón de entrada de la sala de juegos y de la sala light: «Al participar aceptas que KRB Stage guarde tu nombre y tu participación», con enlace a la Política de privacidad de krbstage.cl. Vale para quien entra desde ese momento.</p>
      <div class="row"><button type="button" class="${priv ? '' : 'primary'}" data-priv="0">Apagado${priv ? '' : ' · puesto'}</button><button type="button" class="${priv ? 'primary' : ''}" data-priv="1">🔒 Encendido${priv ? ' · puesto' : ''}</button></div>`;
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
    const vbox = document.createElement('div'); vbox.className = 'panel'; vbox.id = 'priv-box';
    pbox.parentNode.insertBefore(vbox, pbox.nextSibling);
    vbox.onclick = async (e) => {
      const b = e.target.closest('button[data-priv]'); if (!b) return;
      try { const r = await api('POST', '/api/privacidad', { on: b.dataset.priv === '1' }); priv = r.on; paintPriv(); toast(r.on ? 'Aviso de datos personales encendido' : 'Aviso de datos personales apagado'); } catch (err) { toast(err.message); }
    };
    paintPriv();
    // Respaldo de los datos (Code 0, 28 nov): estado del último, «Respaldar ahora» y «Bajar respaldo ahora»
    const rbox = document.createElement('div'); rbox.className = 'panel'; rbox.id = 'resp-box';
    vbox.parentNode.insertBefore(rbox, vbox.nextSibling);
    const mb = (n) => (n == null ? '—' : n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);
    const paintResp = async () => {
      const r = await api('GET', '/api/respaldo').catch(() => null);
      if (!r || !document.getElementById('resp-box')) return;
      const when = r.at ? new Date(r.at).toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      rbox.innerHTML = `<h2>Respaldo de los datos</h2>
        <p class="muted small">Todos los días a las 05:00 se guarda una copia de los datos de la Sala, del registro de clientes y de Programación en el disco de Render (quedan los últimos 14 días)${r.drive ? ' y en el Google Drive' : ''}. Los videos no van.</p>
        <p class="small">${r.at ? `${r.ok ? '✅' : '⚠️'} Último: ${esc(when)} · ${mb(r.size)}${r.ok ? '' : ` · ${esc(r.error)}`}` : 'Todavía no hay respaldos.'}${r.drive ? ` · Drive: ${r.driveUltimo === 'ok' ? 'llegó' : esc(r.driveUltimo || '—')}` : ' · Drive: sin configurar'}<br>Copias en el disco: ${r.copias.length}${r.copias.length ? ` (${esc(r.copias[0].name.slice(9, 19))} a ${esc(r.copias[r.copias.length - 1].name.slice(9, 19))})` : ''} · Libre en el disco: ${mb(r.libre)}</p>
        <div class="row"><button type="button" data-resp="ahora">💾 Respaldar ahora</button><button type="button" data-resp="bajar">⬇ Bajar respaldo ahora</button></div>`;
    };
    rbox.onclick = async (e) => {
      const b = e.target.closest('button[data-resp]'); if (!b) return;
      b.disabled = true;
      try {
        if (b.dataset.resp === 'ahora') { const r = await api('POST', '/api/respaldo/ahora', {}); toast(r.ok ? 'Respaldo guardado' : r.error); }
        else {
          const res = await fetch('/api/respaldo/bajar', { headers: { 'x-admin': localStorage.getItem('adminToken') || '' } });
          if (!res.ok) throw new Error('No se pudo bajar el respaldo');
          const name = (/filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '') || [])[1] || 'respaldo-sala.json.gz';
          const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        }
      } catch (err) { toast(err.message); }
      b.disabled = false; paintResp();
    };
    paintResp();
  };
  sync(); setInterval(sync, 10000); setInterval(mount, 1000);
  // Semáforo del Dell de las luces de Kennedy (orden 13 de Code 0, 28 nov): una fila por cosa, con su color y una línea de
  // texto, y arriba «Último latido hace N s». Va en el panel de la sala light de Mercado Kennedy y en su pestaña «Luces»
  const COLOR = { verde: 'Bien', amarillo: 'Atención', rojo: 'Problema', gris: 'Sin datos' };
  window.dellHtml = (r, compact) => {
    if (!r) return '<p class="muted small">No se pudo leer el estado del Dell.</p>';
    const head = r.recibido ? `Último latido hace ${r.segundos} s` : 'Todavía no llega ningún latido del Dell (falta instalar la versión con latido)';
    const rows = (r.orden || []).map((k) => `<div class="dell-row dell-${r.luces[k]}"><i aria-hidden="true"></i><b>${esc(r.nombres[k])}</b><span>${esc(COLOR[r.luces[k]] || '')}</span>${compact ? '' : `<small>${esc(r.textos[k] || '')}</small>`}</div>`).join('');
    return `<p class="small dell-head"><b>${esc(head)}</b>${r.horario ? ' · horario de Kennedy' : ''}${r.avisos ? ' · avisos al celular activos' : ''}</p><div class="dell-rows${compact ? ' dell-compact' : ''}">${rows}</div>`;
  };
})();
