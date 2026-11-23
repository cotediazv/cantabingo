//@ Vistas: ingreso del moderador, portada y Centro de control. Parte de la aplicación: se carga en orden desde index.html.
// ---------- Vistas ----------
const views = {};

// Entrada del moderador: usuario y contraseña
function viewLogin() {
  app.innerHTML = `<form class="panel" id="login" style="max-width:420px;margin:8vh auto 0">
    <h1>Moderador</h1><p class="muted">Ingresa para crear partidas y dirigir el bingo.</p>
    <div class="fields" style="grid-template-columns:1fr">
      <label class="f">Usuario<input type="text" name="user" autocomplete="username" autocapitalize="none" required></label>
      <label class="f">Contraseña<input type="password" name="pass" autocomplete="current-password" required></label>
      <button class="primary big">Entrar</button>
    </div>
    <p class="muted small" style="margin-top:14px">¿Vienes a jugar? Usa el enlace o el código QR que te dio el moderador.</p></form>`;
  $('#login').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('POST', '/api/login', Object.fromEntries(new FormData(e.target)));
      store.set('adminToken', r.token);
      route();
    } catch (err) { fail(err); }
  };
}
const isAdmin = async () => Boolean(store.get('adminToken')) && (await api('GET', '/api/me').catch(() => ({}))).admin === true;

// Catálogo de juegos de la plataforma. Para sumar uno: agregar aquí su entrada y sus vistas.
const GAMES = [
  { id: 'bingo', icon: '🎮', name: 'Crea sala de juegos', desc: 'Bingo, El Rosko, El Festival y El objeto más extraño.', href: '#/nuevo' },
  { id: 'rueda', hidden: true, icon: '🎡', name: 'El Rosko', desc: 'Un rosko de letras por concursante, con reloj. Tú marcas acierto, fallo o paso; el público ve el rosko y la pregunta.', href: '#/ruedas' },
  { id: 'sorteo', hidden: true, icon: '🎲', name: 'Sorteo de concursantes', desc: 'Elige al azar, entre quienes jugaron el bingo, a los concursantes de El Rosko. Se ve en pantalla.', href: '#/sorteoctl' },
];

views.home = async () => {
  if (!(await isAdmin())) return viewLogin();
  // Si ya hay un bingo en curso, el paso 1 lleva a su panel; si no, a la lista
  // Una sola sala a la vez: si ya hay una abierta, se continúa con ella en vez de crear otra
  const open = (await activeSessions())[0];
  if (open) store.set('lastBingo', open.projectId);
  const last = open ? open.projectId : store.get('lastBingo');
  const bingoHref = open ? '#/juegos' : last ? `#/anfitrion/${last}` : '#/proyectos'; // la sala abierta continúa en Juegos
  app.innerHTML = `
    <div class="home">
      <h1>KRB Stage · Sala de juegos</h1>
      ${open ? `<a class="home-create open" href="${bingoHref}"><span>▶</span>Continuar: ${esc(open.name)}</a>
        <p class="muted small home-note">Hay una sala abierta. Para crear otra, primero ciérrala en el Centro de control.</p>`
    : '<a class="home-create" href="#/nuevo"><span>🎮</span>Crear sala de juegos</a>'}
      <a class="home-control home-control-sm" href="#/control">🎛️ Centro de control</a>
      <p style="margin-top:28px"><button id="logout">Cerrar sesión de moderador</button></p>
    </div>`;
  $('#logout').onclick = () => { store.del('adminToken'); route(); };
  return undefined;
};

// Centro de control: qué gráfica se ve en la pantalla de OBS
views.control = async () => {
  if (!(await isAdmin())) return viewLogin();
  // Pedido de Cote (20 nov): en la aplicación instalada no hay cómo recargar; botoncito «Refrescar página»
  app.innerHTML = `<p class="back ctl-top"><a href="#/">← Inicio</a><button type="button" class="ctl-reload" onclick="location.reload()">↻ Refrescar página</button></p><h1>Centro de control</h1>
    <div class="panel"><h2>Sala de juegos abierta</h2>
      <p class="muted small">Si hay más de una, a la gente le aparece una lista para elegir. Cierra las que ya no se usan.</p>
      <div id="ctl-sala-go"></div><div id="open-list"></div></div>
    <a class="btn lp-open" href="#/verticalctl/kennedy">📺 Pantallas de los locales · videos vertical y horizontal</a>
    <div class="panel">
      <h2>En pantalla</h2>
      <p class="muted small">La pantalla cambia sola al activar un bingo, lanzar un sorteo o cargar un rosco. Aquí puedes cambiarla a mano.</p>
      <div class="control-grid" id="stage">
        <button data-show="bingo"><span>🎱</span>Bingo</button><button data-show="sorteo"><span>🎲</span>Sorteo</button>
        <button data-show="rueda"><span>🎡</span>El Rosko</button><button data-show="qr"><span>📱</span>QR en pantalla completa</button>
        <button data-show="karaoke"><span>🎤</span>Karaoke</button><button data-show="show"><span>⭐</span>Show</button>
        <button data-show="voto"><span>🗳️</span>Votación</button><button data-show="insta"><span>📸</span>Instagram</button>
        <button data-show="desafio" class="wide"><span>🏆</span>El Gran Desafío</button>
        <button data-show="none" class="wide"><span>⬛</span>Nada</button>
      </div>
      <div class="ctl-links">
        <p><b>📱 Participar</b><small>Lo que abre el público al escanear el QR</small><a class="link" href="${joinUrl()}" target="_blank">${esc(joinUrl())}</a></p>
        <p><b>🖥️ Tablero</b><small>Pantalla del DJ, con sonido</small><a class="link" href="${boardUrl()}" target="_blank">${esc(boardUrl())}</a></p>
        <p><b>🎬 OBS</b><small>Fuente de navegador, 1920×1080, transparente</small><a class="link" href="${stageUrl()}" target="_blank">${esc(stageUrl())}</a></p>
      </div>
    </div>
    <a class="btn lp-open" href="#/light">💡 Sala light · karaoke, show y cartelera en otro local</a>
    <a class="btn lp-open" href="#/consola">🖥️ Consola general · los 3 locales en una pantalla</a>
    <a class="btn lp-open" href="#/master">🎛️ GC Master · centro de control de transmisión</a>
    <a class="btn lp-open" href="/sala">📱 Sala de juegos en el teléfono · para guardar en el inicio</a>
    <div class="panel"><h2>Karaoke</h2>
      <p class="muted small">Muestra en pantalla la lista de pedidos del sistema de karaoke (formulario y app del equipo).</p>
      <div class="venue-tabs" id="kar-venue" role="tablist"></div>
      <p class="muted small" id="kar-note" style="margin:8px 0 0"></p>
      <p class="small" id="kar-status" style="margin:10px 0 0"></p>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="kar-phone"> Permitir pedir canciones desde el celular (quien ya está inscrito en la sala)</label>
      <p class="muted small" style="margin:4px 0 0">Se abre y se cierra solo según el horario del local. Si lo cambias a mano, vale hasta que pasan 30 minutos sin pedidos.</p>
      <details style="margin-top:12px"><summary class="small">Direcciones de cada local</summary>
        <form id="kar-form" class="fields" style="grid-template-columns:1fr;margin-top:10px"></form></details>
    </div>
    <div class="panel"><h2>Programación</h2>
      <div id="ag-now" class="small"></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="ag-notice"> Anunciar en pantalla el bloque que viene («A continuación…»)</label>
      <details style="margin-top:12px"><summary class="small">Editar horarios y cartelera del mes</summary>
        <form id="ag-form" class="fields" style="grid-template-columns:1fr;margin-top:10px"></form></details>
    </div>
`;
  // Karaoke: local del día y direcciones de la web app y del formulario de cada local
  const paintKar = (c) => {
    if (!$('#kar-venue')) return;
    $('#kar-venue').innerHTML = Object.entries(c.venues).map(([id, name]) => `<button type="button" role="tab" data-kar="${id}" class="${id === c.venue ? 'on' : ''}">${esc(name)}</button>`).join('');
    const s = c.status;
    $('#kar-phone').checked = !!c.phone;
    $$('#kar-venue button').forEach((b) => { b.disabled = !!c.fromSala; });
    $('#kar-note').textContent = c.fromSala ? `Se usa el local de la sala abierta: ${c.venues ? c.venues[c.venue] : ''}. No hace falta elegirlo.` : 'No hay sala abierta: elige el local.';
    $('#kar-status').innerHTML = !s ? '<span class="muted">Todavía no se ha consultado la lista de este local.</span>'
      : s.error ? `⚠️ <b>No se pudo leer la lista:</b> ${esc(s.error)}` : `✅ Lista leída: ${s.total} ${s.total === 1 ? 'pedido' : 'pedidos'} por cantar.`;
    if (!$('#kar-form').dataset.ready) {
      $('#kar-form').dataset.ready = '1';
      $('#kar-form').innerHTML = `${Object.entries(c.venues).map(([id, name]) => `
        <label class="f">${esc(name)} · web app (termina en /exec)<input type="url" name="exec-${id}" value="${esc(c.urls[id].exec)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
        <label class="f">${esc(name)} · formulario de pedidos<input type="url" name="form-${id}" value="${esc(c.urls[id].form)}" placeholder="https://forms.gle/…"></label>`).join('')}
        <button class="primary">Guardar y probar</button>`;
    }
  };
  const saveKar = async (body) => {
    try { const r = await api('POST', '/api/karaoke/config', body); paintKar({ ...karCfg, ...r }); karCfg = { ...karCfg, ...r }; return true; } catch (err) { fail(err); return false; }
  };
  let karCfg = await api('GET', '/api/karaoke/config').catch(() => null);
  if (karCfg) paintKar(karCfg);
  $('#kar-phone').onchange = (e) => saveKar({ phone: e.target.checked });
  $('#kar-venue').onclick = (e) => { const b = e.target.closest('[data-kar]'); if (b) saveKar({ venue: b.dataset.kar }); };
  $('#kar-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const urls = Object.fromEntries(Object.keys(karCfg.venues).map((id) => [id, { exec: f.get(`exec-${id}`), form: f.get(`form-${id}`) }]));
    if (await saveKar({ urls })) toast('Direcciones guardadas');
  };
  // Programación: bloque actual, el que viene, y editor con el mismo formato de la cartelera mensual
  const paintAg = (a) => {
    if (!$('#ag-now')) return;
    $('#ag-notice').checked = a.notice;
    $('#ag-now').innerHTML = `<b>${esc(a.name)}</b> · ${a.blocks.length ? a.blocks.map((b) => `<span class="ag-b ${a.current && a.current.time === b.time ? 'on' : ''}">${b.time} ${esc(b.label)}</span>`).join(' ') : '<span class="muted">hoy no hay bloques programados</span>'}
      <br>${a.next ? `Sigue: <b>${a.next.time} · ${esc(a.next.label)}</b>` : '<span class="muted">No hay nada más que anunciar hoy.</span>'}`;
    if (!$('#ag-form').dataset.ready) {
      $('#ag-form').dataset.ready = '1';
      $('#ag-form').innerHTML = `<label class="f">Mes de la cartelera <span class="hint">año-mes, ej. 2026-11</span><input type="text" name="month" value="${esc(a.month)}" pattern="\\d{4}-\\d{2}"></label>
        ${Object.entries(a.venues).map(([id, name]) => `<label class="f">${esc(name)} <span class="hint">horarios por día y, debajo, el show de cada fecha</span><textarea name="text-${id}" rows="8" style="font-size:14px">${esc(a.text[id])}</textarea></label>`).join('')}
        <button class="primary">Guardar programación</button>`;
    }
  };
  const loadAg = async () => { const a = await api('GET', '/api/agenda/config').catch(() => null); if (a) paintAg(a); };
  $('#ag-notice').onchange = async (e) => { try { paintAg(await api('POST', '/api/agenda/config', { notice: e.target.checked })); } catch (err) { fail(err); } };
  $('#ag-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const text = Object.fromEntries([...f.keys()].filter((k) => k.startsWith('text-')).map((k) => [k.slice(5), f.get(k)]));
    try { paintAg(await api('POST', '/api/agenda/config', { month: f.get('month'), text })); toast('Programación guardada'); } catch (err) { fail(err); }
  };
  loadAg();
  const paintOpen = async () => {
    const list = await activeSessions();
    if (!$('#open-list')) return;
    // Pedido de Cote (21 nov): desde el Centro de control, ir directo a la sala en juego o crear una
    $('#ctl-sala-go').innerHTML = list.length ? `<a class="home-create open ctl-go" href="#/juegos"><span>▶</span>Ir a la sala en juego: ${esc(list[0].name)}</a>`
      : '<a class="home-create ctl-go" href="#/nuevo"><span>🎮</span>Crear sala de juegos</a>';
    $('#open-list').innerHTML = list.length ? `${list.map((s) => `<div class="open-row"><span><b>${esc(s.name)}</b><br><small class="muted">Ronda ${s.round}</small></span><button class="danger" data-close="${s.id}">Cerrar</button></div>`).join('')}
      ${list.length > 1 ? '<button class="danger big" id="close-all" style="width:100%;margin-top:12px">Cerrar todos</button>' : ''}` : '<p class="muted">No hay ningún bingo abierto.</p>';
  };
  const closeOne = (id) => api('POST', `/api/sessions/${id}/host/close`);
  $('#open-list').onclick = async (e) => {
    const one = e.target.closest('[data-close]');
    try {
      if (one) { if (!confirm('¿Cerrar este bingo para todos? Sus participantes pierden el cartón.')) return; await closeOne(one.dataset.close); }
      else if (e.target.closest('#close-all')) { if (!confirm('¿Cerrar TODOS los bingos abiertos?')) return; for (const s of await activeSessions()) await closeOne(s.id); }
      else return;
      store.del('lastBingo');
      toast('Listo');
    } catch (err) { fail(err); }
    paintOpen();
  };
  paintOpen();
  const paintStage = (show) => $$('#stage button').forEach((b) => b.classList.toggle('on', b.dataset.show === show));
  paintStage((await api('GET', '/api/stage').catch(() => ({}))).show);
  $('#stage').onclick = async (e) => {
    const btn = e.target.closest('[data-show]');
    if (!btn) return;
    try { paintStage((await api('POST', '/api/stage', { show: btn.dataset.show })).show); } catch (err) { fail(err); }
  };
  // Refleja los cambios automáticos mientras el panel está abierto
  const timer = setInterval(async () => paintStage((await api('GET', '/api/stage').catch(() => ({}))).show), 3000);
  return () => clearInterval(timer);
};

