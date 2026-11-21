/* global PATTERNS */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', 'x-admin': store.get('adminToken') || '', 'x-staff': store.get('staffToken') || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') store.del('adminToken');
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error inesperado'), { status: res.status });
  return data;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
const fail = (e) => toast(e.message);

// ---------- Ayudas de dominio ----------
// `g` describe el juego: { format, headers, values, items, showName }
const colOf = (g, v) => { for (let c = 0; c < 5; c++) if (v <= Math.floor(((c + 1) * g.values) / 5)) return c; return 4; };
const rangeOf = (g, c) => [Math.floor((c * g.values) / 5) + 1, Math.floor(((c + 1) * g.values) / 5)];
const emojiParts = (item) => { const i = item.indexOf(' '); return i < 0 ? [item, ''] : [item.slice(0, i), item.slice(i + 1)]; };
const plain = (g, v) => (g.format === 'numbers' ? String(v) : g.items[v - 1]);
function speakText(g, v) {
  if (g.format === 'numbers') return `${g.headers[colOf(g, v)]}, ${v}`;
  return g.format === 'emojis' ? emojiParts(g.items[v - 1])[1] || g.items[v - 1] : g.items[v - 1];
}
function cellInner(g, v) {
  if (v === 0) return 'LIBRE';
  if (g.format === 'numbers') return String(v);
  if (g.format === 'emojis') {
    const [e, n] = emojiParts(g.items[v - 1]);
    return `<span class="emo">${esc(e)}</span>${g.showName !== false && n ? `<small>${esc(n)}</small>` : ''}`;
  }
  return esc(g.items[v - 1]);
}
function ballHTML(g, v, cls = '') {
  if (!v) return `<span class="ball ${cls}"><span class="v">—</span></span>`;
  const letter = g.headers[colOf(g, v)];
  if (g.format === 'numbers') return `<span class="ball ${cls}"><span class="l">${esc(letter)}</span><span class="v">${v}</span></span>`;
  if (g.format === 'emojis') {
    const [e, n] = emojiParts(g.items[v - 1]);
    return `<span class="ball ${cls}"><span class="v">${esc(e)}</span><span class="l">${g.showName !== false ? esc(n) : ''}</span></span>`;
  }
  return `<span class="ball text ${cls}"><span class="l">${esc(letter)}</span><span class="v">${esc(g.items[v - 1])}</span></span>`;
}
function drawsHTML(g, drawn) {
  return `<div class="draws">
    <figure>${ballHTML(g, drawn.at(-1))}<figcaption>Valor actual</figcaption></figure>
    <figure>${ballHTML(g, drawn.at(-2), 'prev')}<figcaption>Anterior</figcaption></figure>
  </div>`;
}
function boardHTML(g, drawn, pick = false) {
  const hit = new Set(drawn);
  const last = drawn.at(-1);
  const text = g.format === 'words';
  let per = 0;
  const rows = [0, 1, 2, 3, 4].map((c) => {
    const [lo, hi] = rangeOf(g, c);
    per = Math.max(per, hi - lo + 1);
    let cells = '';
    for (let v = lo; v <= hi; v++) {
      const label = g.format === 'emojis' ? esc(emojiParts(g.items[v - 1])[0]) : esc(plain(g, v));
      cells += `<span class="bn ${hit.has(v) ? 'hit' : ''} ${v === last ? 'last' : ''}" data-v="${v}" title="${esc(plain(g, v))}">${label}</span>`;
    }
    return `<div class="board-row"><b>${esc(g.headers[c])}</b><div class="board-cells">${cells}</div></div>`;
  });
  return `<div class="board ${text ? 'text' : ''} ${pick ? 'pick' : ''}" style="--per:${per}">${rows.join('')}</div>`;
}
function cardHTML(g, cells, { no = '', marks = 0, green = 0, hint = 0, note = '' } = {}) {
  const txt = g.format === 'words' ? 'txt' : '';
  const body = cells.map((v, i) => {
    const cls = v === 0 ? 'free' : green & (1 << i) ? 'green' : marks & (1 << i) ? 'marked' : '';
    const h = hint & (1 << i) ? 'hint' : '';
    const g2 = v === 0 && green & (1 << i) ? 'green' : '';
    return `<button class="cell ${txt} ${cls} ${g2} ${h}" data-i="${i}">${cellInner(g, v)}</button>`;
  }).join('');
  return `<div class="card" data-no="${esc(no)}">
    ${no !== '' ? `<div class="card-top"><span>Cartón #${esc(no)}</span><span class="left">${esc(note)}</span></div>` : ''}
    <div class="grid5 head">${[...g.headers].map((h) => `<span>${esc(h)}</span>`).join('')}</div>
    <div class="grid5 cells">${body}</div>
  </div>`;
}
const miniHTML = (id) => {
  const m = PATTERNS.byId[id].variants[0];
  return `<span class="mini">${Array.from({ length: 25 }, (_, i) => `<i class="${m & (1 << i) ? 'x' : ''}"></i>`).join('')}</span>`;
};
const patternsInline = (ids) => ids.map((id) => `<span class="pat-inline">${miniHTML(id)} ${esc(PATTERNS.byId[id].name)}</span>`).join('');
// Pedido de Cote (20 nov): las figuras agrupadas en Líneas, Figuras y Letras, para elegir más rápido
const PAT_GROUPS = [['Líneas', ['linea', 'horizontal', 'vertical', 'diagonal', 'dos-lineas']], ['Letras', null]];
function patternPicker(selected = ['linea']) {
  const one = (p) => `<label class="pat">
    <input type="radio" name="pattern" value="${p.id}" ${selected[0] === p.id ? 'checked' : ''}>${miniHTML(p.id)}<span>${esc(p.name)}</span></label>`;
  const lines = PATTERNS.list.filter((p) => PAT_GROUPS[0][1].includes(p.id));
  const letters = PATTERNS.list.filter((p) => /^Figura [A-Z]$/.test(p.name));
  const shapes = PATTERNS.list.filter((p) => !lines.includes(p) && !letters.includes(p));
  // Las letras van en una pestaña plegada (pedido de Cote); se abre sola si la figura elegida es una letra
  const letterOn = letters.some((p) => p.id === selected[0]);
  return `<div class="patterns"><h3 class="pat-group">Líneas</h3>${lines.map(one).join('')}<h3 class="pat-group">Figuras</h3>${shapes.map(one).join('')}
    <details class="pat-letters" ${letterOn ? 'open' : ''}><summary>Letras (A a la Z)</summary><div class="patterns">${letters.map(one).join('')}</div></details></div>
    <p class="muted small" style="margin-top:8px">Un patrón por ronda: al elegir otro, el anterior se desmarca.</p>`;
}
function readPatterns(root) {
  const ids = $$('input[name=pattern]:checked', root).map((i) => i.value);
  if (ids.length !== 1) { toast('Elige el patrón de la ronda'); return null; }
  return ids;
}
let voiceOn = false; // la voz que lee los números quedó desactivada: su control ya no se muestra
function speak(text) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'es-ES';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
function subscribe(sid, onState, onGone, asAdmin = false, token = '') {
  const query = asAdmin ? `?admin=${encodeURIComponent(store.get('adminToken') || '')}` : token ? `?token=${encodeURIComponent(token)}` : '';
  const es = new EventSource(`/api/sessions/${sid}/events${query}`);
  es.onmessage = (e) => { const st = JSON.parse(e.data); if (st.closed) { es.close(); onGone(); } else onState(st); };
  es.onerror = () => { fetch(`/api/sessions/${sid}`).then((r) => { if (r.status === 404) { es.close(); onGone(); } }).catch(() => {}); };
  return () => es.close();
}
// Enlaces fijos: siempre llevan a la sesión activa, así el QR no cambia de una partida a otra
// La sala se llama «Los Juegos de Frida»; dentro del bingo, el juego se llama «El Bingo de Frida»
function bingoName(name) { return String(name || '').replace(/^Los Juegos de /, 'El Bingo de '); }
const joinUrl = () => `${location.origin}${location.pathname}#/jugar`;
const boardUrl = () => `${location.origin}${location.pathname}#/tablero`;
const gcUrl = () => `${location.origin}${location.pathname}#/gc`;
const stageUrl = () => `${location.origin}${location.pathname}#/escena`;
const activeSessions = async () => (await api('GET', '/api/current').catch(() => ({}))).sessions || [];
// Resuelve el enlace fijo: sin sesiones espera, con una entra directo y con varias deja elegir.
// Devuelve { sid } para continuar o { cleanup } si ya dibujó la pantalla.
// Pantallas que deben refrescarse solas cuando el teléfono vuelve a mostrarlas (pestaña vieja, pantalla bloqueada…)
let refreshOnShow = false;
document.addEventListener('visibilitychange', () => { if (!document.hidden && refreshOnShow) route(); });
window.addEventListener('pageshow', (e) => { if (e.persisted) route(); });
async function pickSession(kind) {
  let fresh = null;
  try { fresh = (await api('GET', '/api/current')).sessions || []; } catch { /* sin conexión: no se toca nada guardado */ }
  const list = fresh || [];
  // Limpieza: se olvidan los cartones de bingos que ya se cerraron, para que el teléfono no quede pegado a ellos
  if (fresh) {
    try {
      const alive = new Set(fresh.map((s) => `tok_${s.id}`));
      for (const k of Object.keys(localStorage)) if (k.startsWith('tok_') && !alive.has(k)) localStorage.removeItem(k);
    } catch { /* sin almacenamiento */ }
  }
  if (!list.length) return { cleanup: waiting() };
  const mine = list.find((s) => store.get(`tok_${s.id}`)); // ya estaba jugando en una de ellas
  if (list.length === 1 || (kind === 'jugar' && mine)) return { sid: (mine || list[0]).id };
  app.innerHTML = `<div class="panel" style="max-width:520px;margin:6vh auto 0"><h1>Elige tu bingo</h1>
    <p class="muted">Hay ${list.length} partidas abiertas. Toca la que te indicó el moderador.</p>
    <div style="display:grid;gap:10px;margin-top:14px">${list.map((s) => `<a class="btn primary" style="text-align:center;padding:14px;font-size:1.1rem;border-radius:14px" href="#/${kind}/${s.id}">${esc(s.name)} ${s.locked ? '🔒' : ''}<br><span class="small" style="font-weight:400">Ronda ${s.round}</span></a>`).join('')}</div></div>`;
  // La lista se mantiene al día: si el moderador cierra o abre bingos, esta pantalla cambia sola
  const shown = list.map((s) => s.id).join();
  refreshOnShow = true;
  const timer = setInterval(async () => {
    const now = await api('GET', '/api/current').catch(() => null);
    if (now && (now.sessions || []).map((s) => s.id).join() !== shown) route();
  }, 4000);
  return { cleanup: () => { clearInterval(timer); refreshOnShow = false; } };
}
// Pantalla de espera: revisa cada pocos segundos si el moderador ya abrió una partida
function waiting(check = activeSessions) {
  app.innerHTML = `<div class="panel" style="max-width:460px;margin:8vh auto 0;text-align:center"><h1>Todavía no hay partida</h1>
    <p class="muted">Cuando el moderador inicie el juego, esta pantalla cambiará sola. No cierres la página.</p></div>`;
  const timer = setInterval(async () => { if ((await check()).length) route(); }, 5000);
  return () => clearInterval(timer);
}
const qr = (text) => `<img class="qr" alt="Código QR" src="/api/qr?text=${encodeURIComponent(text)}">`;
const ended = () => { app.innerHTML = `<div class="panel"><h1>La sesión ha terminado</h1><p>El anfitrión cerró la sesión o se agotó su tiempo.</p><a class="btn primary" href="#/">Ir al inicio</a></div>`; };

const EMOJIS = ('🐶 Perro,🐱 Gato,🐭 Ratón,🐰 Conejo,🦊 Zorro,🐻 Oso,🐼 Panda,🐯 Tigre,🦁 León,🐮 Vaca,🐷 Cerdo,🐸 Rana,🐵 Mono,🐔 Gallina,🐧 Pingüino,' +
  '🦆 Pato,🦉 Búho,🐴 Caballo,🦄 Unicornio,🐝 Abeja,🦋 Mariposa,🐌 Caracol,🐢 Tortuga,🐍 Serpiente,🐙 Pulpo,🦀 Cangrejo,🐬 Delfín,🐳 Ballena,🦈 Tiburón,🐘 Elefante,' +
  '🦒 Jirafa,🐑 Oveja,🐐 Cabra,🦜 Loro,🐊 Cocodrilo,🍎 Manzana,🍐 Pera,🍊 Naranja,🍋 Limón,🍌 Plátano,🍉 Sandía,🍇 Uvas,🍓 Fresa,🍒 Cerezas,🍍 Piña,' +
  '🥥 Coco,🥝 Kiwi,🍅 Tomate,🥕 Zanahoria,🌽 Maíz,🍞 Pan,🧀 Queso,🥚 Huevo,🍕 Pizza,🍰 Pastel,🚗 Coche,🚌 Autobús,🚲 Bicicleta,🚂 Tren,✈️ Avión,' +
  '🚀 Cohete,⛵ Velero,🏠 Casa,🌳 Árbol,🌻 Girasol,🌵 Cactus,🌙 Luna,⭐ Estrella,☀️ Sol,🌈 Arcoíris,⚽ Balón,🎸 Guitarra,🎈 Globo,🎁 Regalo,🔑 Llave').split(',');

const BACK = '<p class="back"><a href="#/proyectos">← Mis proyectos</a></p>';

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
  { id: 'bingo', icon: '🎮', name: 'Crea sala de juegos', desc: 'El juego n.º 1 es el Bingo.', href: '#/proyectos' },
  { id: 'rueda', hidden: true, icon: '🎡', name: 'El Rosco', desc: 'Un rosco de letras por concursante, con reloj. Tú marcas acierto, fallo o paso; el público ve el rosco y la pregunta.', href: '#/ruedas' },
  { id: 'sorteo', hidden: true, icon: '🎲', name: 'Sorteo de concursantes', desc: 'Elige al azar, entre quienes jugaron el bingo, a los concursantes de El Rosco. Se ve en pantalla.', href: '#/sorteoctl' },
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
        <button data-show="rueda"><span>🎡</span>El Rosco</button><button data-show="qr"><span>📱</span>QR en pantalla completa</button>
        <button data-show="karaoke"><span>🎤</span>Karaoke</button><button data-show="show"><span>⭐</span>Show</button>
        <button data-show="voto"><span>🗳️</span>Votación</button><button data-show="insta"><span>📸</span>Instagram</button>
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

views.proyectos = async () => {
  const list = await api('GET', '/api/projects');
  const fmt = { numbers: 'Números', words: 'Palabras', emojis: 'Emojis' };
  app.innerHTML = `
    <p class="back"><a href="#/">← Inicio</a></p><div class="row between" style="margin-bottom:16px"><h1>Bingo · Mis proyectos</h1><a class="btn primary" href="#/nuevo">⊕ Nuevo proyecto de bingo</a></div>
    <div class="panel scroll-x">${list.length ? `<table class="list">
      <tr><th>Proyecto</th><th>Formato</th><th>Cartones</th><th>Estado</th><th></th></tr>
      ${list.map((p) => `<tr>
        <td><b>${esc(p.name)}</b><br><span class="muted small">${new Date(p.created).toLocaleDateString('es')}</span></td>
        <td>${fmt[p.format]}${p.format === 'numbers' ? ` 1–${p.values}` : ''}</td><td>${p.count}</td>
        <td>${p.sessionId ? '<span class="tag live">Generador activo</span>' : '<span class="tag">Listo</span>'}</td>
        <td><div class="row"><a class="btn primary" href="#/anfitrion/${p.id}">${p.sessionId ? 'Abrir' : 'Iniciar'}</a>
          <button class="danger" data-del="${p.id}">Eliminar</button></div></td></tr>`).join('')}
    </table>` : '<p>Aún no tienes proyectos. Crea el primero para generar tus cartones.</p>'}</div>
    <p class="muted small">Tus proyectos quedan asociados a este navegador.</p>`;
  app.onclick = async (e) => {
    const del = e.target.dataset.del;
    if (del && confirm('¿Eliminar este proyecto y sus cartones?')) { await api('DELETE', `/api/projects/${del}`).catch(fail); views.proyectos(); }
  };
};

views.nuevo = async () => {
  if (!(await isAdmin())) return viewLogin();
  // Una sola sala a la vez
  if ((await activeSessions()).length) { toast('Ya hay una sala abierta: ciérrala en el Centro de control para crear otra'); location.hash = '#/'; return undefined; }
  app.innerHTML = `
    ${BACK}<h1>Nuevo proyecto de bingo</h1>
    <form class="panel fields" id="f">
      <div class="wide">
        <span class="f" style="margin-bottom:6px">¿Qué bingo es?</span>
        <div class="seg" id="venues" role="tablist">
          <button type="button" role="tab" data-venue="frida" class="on">Frida</button>
          <button type="button" role="tab" data-venue="tobalaba">Tobalaba</button>
          <button type="button" role="tab" data-venue="kennedy">Kennedy</button>
          <button type="button" role="tab" data-venue="new">Otro nombre</button>
        </div>
        <p class="muted small" id="venue-note" style="margin-top:8px"></p>
        <input type="hidden" name="theme" value="frida">
      </div>
      <label class="f" id="pname-wrap" hidden>Nombre del bingo<input type="text" name="name" maxlength="60" value="Los Juegos de Frida"></label>
      <label class="f" id="ptheme-wrap" hidden>Colores en pantalla<select id="ptheme">
        <option value="frida">Magenta (como Frida)</option><option value="tobalaba">Rojo (como Tobalaba)</option><option value="kennedy">Celeste azulado (como Kennedy)</option></select></label>
      <label class="f">Número de cartones <span class="hint">de 25 a 3.000</span><input type="number" name="count" min="25" max="3000" value="320" required></label>
      <div class="wide"><button class="primary big">Crear los cartones</button></div>
    </form>`;
  const f = $('#f');
  // Pestañas de local: cada una fija el nombre y los colores de la pantalla; «Otro nombre» deja elegirlos
  const VENUES = { frida: ['Los Juegos de Frida', 'magenta'], tobalaba: ['Los Juegos de Tobalaba', 'rojo'], kennedy: ['Los Juegos de Kennedy', 'celeste azulado'] };
  const pickVenue = (v) => {
    $$('#venues button').forEach((b) => { b.classList.toggle('on', b.dataset.venue === v); b.setAttribute('aria-selected', b.dataset.venue === v); });
    const custom = v === 'new';
    $('#pname-wrap').hidden = !custom;
    $('#ptheme-wrap').hidden = !custom;
    if (custom) { f.name.value = ''; f.theme.value = $('#ptheme').value; $('#venue-note').textContent = 'Escribe el nombre y elige los colores de la pantalla.'; f.name.focus(); }
    else { f.name.value = VENUES[v][0]; f.theme.value = v; $('#venue-note').textContent = `Se llamará «${VENUES[v][0]}» y la pantalla saldrá en ${VENUES[v][1]}.`; }
  };
  $('#venues').onclick = (e) => { const v = e.target.dataset.venue; if (v) pickVenue(v); };
  $('#ptheme').onchange = (e) => { f.theme.value = e.target.value; };
  pickVenue('frida');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    // Bingo clásico fijo: números del 1 al 75, encabezado BINGO, casilla central con valor y cartones desde el n.º 1
    const body = { name: d.name, theme: d.theme, count: d.count, format: 'numbers', values: 75, headers: 'BINGO', freeCenter: false, startNumber: 1 };
    // Pedido de Cote (21 nov): la sala ya no parte con el bingo. Se abre de inmediato y se va a Juegos (sortear o elegir)
    try {
      const p = await api('POST', '/api/projects', body);
      await api('POST', `/api/projects/${p.id}/session`, { name: p.name, theme: p.theme || 'frida', password: '', cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] });
      store.set('lastBingo', p.id);
      location.hash = '#/juegos';
    } catch (err) { fail(err); }
  };
};

// Juegos (pedido de Cote, 21 nov): la sala parte aquí, sin bingo. Arriba la sala y el QR de entrada; abajo el menú de
// juegos con las pestañas «Sortear juegos» / «Elegir libremente»
views.juegos = async () => {
  if (!(await isAdmin())) return viewLogin();
  const open = (await activeSessions())[0];
  if (!open) { location.hash = '#/'; return undefined; }
  store.set('lastBingo', open.projectId);
  app.innerHTML = `<p class="back"><a href="#/">← Inicio</a></p><div class="panel"><h1 style="margin:0">${esc(open.name)}</h1><p class="muted" id="jg-meta" style="margin:6px 0 0"></p>
      <div class="row" style="justify-content:center;margin-top:12px"><button id="jg-qr"></button></div></div>
    ${activitiesNav('')}`;
  let st = null;
  const paint = async () => {
    st = await api('GET', `/api/sessions/${open.id}/host/state`).catch(() => st);
    if (!st || !$('#jg-meta')) return;
    $('#jg-meta').textContent = `${st.players} participantes · Escanea el código QR con tu celular, pon tu nombre, apellido y participa`;
    $('#jg-qr').textContent = st.bigQr ? '📱 QR grande en pantalla: quitar' : '📱 Mostrar QR grande en pantalla';
  };
  $('#jg-qr').onclick = async () => { try { await api('POST', `/api/sessions/${open.id}/host/bigqr`, { on: !(st && st.bigQr) }); } catch (err) { fail(err); } paint(); };
  await paint();
  const t = setInterval(paint, 4000);
  return () => clearInterval(t);
};
// Figura del bingo cuando el bingo sale en el sorteo o se elige (antes del primer número)
views.figura = async (pid) => {
  if (!(await isAdmin())) return viewLogin();
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) { location.hash = '#/'; return undefined; }
  const info = await api('GET', `/api/sessions/${p.sessionId}/host`);
  if (info.drawn || info.roundOver) { location.hash = `#/anfitrion/${pid}`; return undefined; }
  app.innerHTML = `<p class="back"><a href="#/juegos">← Juegos</a></p><h1>${esc(bingoName(p.name))}</h1>
    <form class="panel" id="f"><h2>¿Qué figura se juega?</h2>${patternPicker(info.patterns)}
      <button class="primary big">Empezar el bingo</button></form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const patterns = readPatterns(e.target);
    if (!patterns) return;
    try {
      await api('POST', `/api/sessions/${p.sessionId}/host/patterns`, { patterns });
      await api('POST', '/api/stage', { show: 'bingo' }).catch(() => {});
      location.hash = `#/anfitrion/${pid}`;
    } catch (err) { fail(err); }
  };
  return undefined;
};
views.anfitrion = async (pid) => {
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) return hostSetup(p);
  return hostConsole(p);
};

// Antes de activar solo se elige la figura: el nombre y los colores vienen del paso anterior,
// no hay contraseña y cada participante recibe un cartón.
function hostSetup(p) {
  app.innerHTML = `
    ${BACK}<h1>${esc(p.name)}</h1>
    <form class="panel" id="f">
      <h2>¿Qué figura se juega?</h2>
      ${patternPicker()}
      <p class="muted small">${p.cards.length} cartones, uno por participante. Podrás cambiar la figura en cada ronda.</p>
      <button class="primary big">Activar el generador</button>
    </form>`;
  const f = $('#f');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const patterns = readPatterns(f);
    if (!patterns) return;
    try {
      await api('POST', `/api/projects/${p.id}/session`, { name: p.name, theme: p.theme || 'frida', password: '', cardsPerPlayer: 1, isPublic: true, showName: true, patterns });
      route();
    } catch (err) { fail(err); }
  };
}

// Panel del bingo en curso: solo lo que el animador usa durante el juego.
// Enlaces, QR, textos de la gráfica y cierre de sesión están en «Administración».
// Instrucciones y criterios para el animador, al partir cada juego (pedido de Cote): cortas y precisas, para leer en voz alta
window.readAloud = (game, lines) => `<details class="panel howto" open><summary>📢 Instrucciones · ${esc(game)}</summary><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></details>`;
// Pedido de Cote (20 nov): las instrucciones en pantalla van ordenadas, cada una en su línea, sin pasarse para abajo:
// si no cabe en el ancho de la pantalla, se achica la letra
window.fitOneLine = (el, min = 9) => {
  if (!el || !el.isConnected) return;
  el.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(el).fontSize) || 20;
  while (el.scrollWidth > el.clientWidth + 1 && fs > min) { fs -= 1; el.style.fontSize = `${fs}px`; }
};
// Instrucciones de El Rosco: las usan el panel (wheel-ui.js) y los celulares
window.ROSCO_HOWTO = [
  '3 participantes.',
  'Todos juegan desde las mesas.',
  '<b>Premio mayor</b> para el que gana El Rosco.',
  '<b>Premio especial</b> para el ganador del público que juega la Trivia del Rosco.',
];
const BINGO_HOWTO = [
  'Todos juegan desde las mesas, con su cartón en el celular.',
  'Gana quien complete primero la <b>figura</b>.',
  'Empate: sorteo.',
]
async function hostConsole(p) {
  const sid = p.sessionId;
  store.set('lastBingo', p.id); // para el botón «Volver al bingo» del sorteo y del rosco
  const act = (action, body) => api('POST', `/api/sessions/${sid}/host/${action}`, body || {}).catch(fail);
  let st = null;
  let manual = false;
  let spoken = -1;
  app.innerHTML = `
    <div id="host-bingo"><p class="back"><a href="#/">← Inicio</a></p>
      <div class="panel"><h1 id="title"></h1><div id="meta" class="muted"></div><div id="pats" style="margin-top:10px"></div></div>
      ${window.readAloud('Bingo', BINGO_HOWTO)}
      <div class="cols">
        <div class="panel">
          <div id="draws"></div>
          <div class="win-alert" id="results-panel" hidden>
            <h2 id="results-title"></h2>
            <div id="results"></div>
            <div id="final"></div>
            <div id="tie-result"></div>
            <p class="tie-hint" id="tie-hint" hidden>Hay un empate: primero desempata por sorteo.</p>
            <button class="primary" id="tiebreak" hidden>🎲 Desempatar por sorteo</button>
            <div class="win-actions" id="win-actions" hidden>
              <button id="confirmwin">✔ Confirmar ganador</button>
              <button id="keepplaying">▶ Seguir jugando</button>
            </div>
            <div id="win-confirmed" hidden><p>✔ Ganador confirmado</p>${activitiesNav('bingo')}</div>
          </div>
          <div class="row" style="justify-content:center;margin-top:16px"><button id="bigqr"></button></div>
          <div class="row" style="justify-content:center;margin-top:12px"><button class="primary big" id="gen">Generar un número</button></div>
          <div class="row" style="justify-content:center;margin-top:14px">
            <label class="small" hidden>Pausa <input type="number" id="interval" min="5" max="60" value="10" style="width:70px"> s</label>
            <label class="check" hidden><input type="checkbox" id="stop" checked> Detener al completarse un cartón</label>
            <button id="auto" hidden>▶ Modo automático</button>
          </div>
          <div class="row" style="justify-content:center;margin-top:10px">
            <button id="manual">Selección manual</button>
            <label class="check" hidden><input type="checkbox" id="voice" ${voiceOn ? 'checked' : ''}> Voz</label>
          </div>
        </div>
        <div class="panel"><h2 id="count"></h2><div id="board"></div><h2 class="ord-title">Orden de salida</h2><div id="history" class="history"></div></div>
      </div>
      ${activitiesNav('bingo')}
      <p class="small" style="text-align:center;margin-top:22px"><a href="#/admin/${p.id}">⚙️ Administración</a></p>
    </div>`;
  const render = () => {
    $('#title').textContent = bingoName(st.name);
    const mins = Math.max(0, Math.round((st.expires - Date.now()) / 60000));
    $('#meta').textContent = `Ronda ${st.round} · ${st.players} participantes · ${st.players * st.cardsPerPlayer} de ${st.totalCards} cartones repartidos · quedan ${Math.floor(mins / 60)} h ${mins % 60} min`;
    $('#pats').innerHTML = patternsInline(st.patterns); // figura de la ronda, a la vista del animador
    $('#draws').innerHTML = drawsHTML(st, st.drawn);
    $('#count').textContent = `Tablero · ${st.drawn.length} de ${st.values}`;
    $('#board').innerHTML = boardHTML(st, st.drawn, manual);
    // Pedido de Cote (20 nov): el tablero no va en el panel del animador; aparece solo con «Selección manual», para tocar el número
    $('#count').style.display = manual ? '' : 'none';
    $('#board').style.display = manual ? '' : 'none';
    $('#history').innerHTML = st.drawn.map((v) => `<span>${esc(plain(st, v))}</span>`).join('') || '<span class="muted">Aún no se ha generado ningún valor.</span>';
    $('#gen').disabled = st.drawn.length >= st.values || st.auto.on || st.winConfirmed; // ganador confirmado = sorteo terminado
    $('#auto').disabled = !!st.winConfirmed;
    $('#gen').textContent = st.winConfirmed ? 'Sorteo terminado' : 'Generar un número';
    $('#auto').textContent = st.auto.on ? '⏸ Detener automático' : '▶ Modo automático';
    $('#auto').classList.toggle('on', st.auto.on);
    $('#manual').classList.toggle('on', manual);
    $('#bigqr').classList.toggle('on', st.bigQr);
    $('#bigqr').textContent = st.bigQr ? '📱 QR grande en pantalla: quitar' : '📱 Mostrar QR grande en pantalla';
    // Los ganadores van arriba de todo; primero los ya validados
    const results = st.results.filter((r) => !r.dismissed).sort((a, b) => Number(b.validated) - Number(a.validated) || a.at - b.at);
    const won = results.filter((r) => r.validated).length;
    $('#results-panel').hidden = !results.length;
    $('#results-panel').classList.toggle('won', won > 0);
    $('#results-title').textContent = won ? (won === 1 ? '🏆 ¡HAY UN GANADOR!' : `🏆 ¡HAY ${won} GANADORES!`) : 'Hay cartones por completar';
    // Ganadores en grande; debajo, quienes ya completaron la figura pero aún no marcan su cartón
    $('#results').innerHTML = `<div class="win-names">${results.filter((r) => r.validated).map((r) => `<span><b>${esc(r.name)}</b><small>Cartón #${p.startNumber + r.cardNo - 1}${r.place ? ` · 📍 ${esc(r.place)}` : ''}</small></span>`).join('')}</div>
      ${results.filter((r) => !r.validated).map((r) => `<p class="win-pending">${esc(r.name)} · cartón #${p.startNumber + r.cardNo - 1} · le falta marcar</p>`).join('')}`;
    // Con dos o más ganadores se puede desempatar con la tómbola en pantalla
    const winners = new Set(results.filter((r) => r.validated).map((r) => r.cardNo)).size;
    $('#tiebreak').hidden = winners < 2;
    const tied = winners >= 2;
    $('#tiebreak').textContent = st.tieWinner ? '🎲 Volver a desempatar' : '🎲 Desempatar por sorteo';
    // El resultado se muestra al animador cuando la tómbola ya terminó en pantalla
    const tieDone = st.tieWinner && Date.now() - st.tieWinner.at >= st.rollMs;
    $('#tie-result').innerHTML = !st.tieWinner ? '' : tieDone ? `<p class="tie-won">Ganador del desempate<b>${esc(st.tieWinner.name)}</b><small>Cartón #${p.startNumber + st.tieWinner.cardNo - 1}</small></p>` : '<p class="tie-won">Sorteando en pantalla…</p>';
    if (st.tieWinner && !tieDone) setTimeout(() => st && render(), st.rollMs - (Date.now() - st.tieWinner.at) + 100);
    // Dos opciones ante un ganador: confirmarlo o seguir jugando
    const pending = results.filter((r) => r.validated && !r.confirmed).length;
    const confirmed = won > 0 && pending === 0;
    // Con empate, primero se desempata: «Confirmar» aparece recién cuando la tómbola ya eligió a uno
    const rolling = st.tieWinner && !tieDone;
    $('#win-actions').hidden = !pending || rolling;
    $('#confirmwin').hidden = tied && !tieDone;
    $('#win-actions').classList.toggle('single', tied && !tieDone);
    $('#confirmwin').textContent = '✔ Confirmar ganador';
    $('#tie-hint').hidden = !(tied && !st.tieWinner);
    $('#win-confirmed').hidden = !confirmed;
    // Pedido de Cote (20 nov): con el ganador aceptado, desaparece todo lo del bingo y queda solo lo que viene (el menú
    // de juegos con el sorteo)
    const done = $('#host-bingo');
    if (done && done.classList.contains('bingo-done') !== confirmed) { done.classList.toggle('bingo-done', confirmed); if (confirmed) window.scrollTo(0, 0); }
    // Las instrucciones se leen al empezar: desaparecen con el primer número (pedido de Cote)
    if (done) done.classList.toggle('bingo-started', st.drawn.length > 0);
    window.setNavFold(st.drawn.length > 0 && !confirmed);
    $('#win-confirmed p').textContent = '✔ Ganador confirmado';
    $('#final').innerHTML = st.finalists ? `<p><b>Selección final:</b> ${st.finalists.map((c) => '#' + (p.startNumber + c - 1)).join(', ') || 'no hay cartones validados'}</p>` : '';
    if (st.drawn.length !== spoken) { if (spoken >= 0 && st.drawn.length > spoken) speak(speakText(st, st.drawn.at(-1))); spoken = st.drawn.length; }
  };
  $('#gen').onclick = () => act('draw');
  $('#confirmwin').onclick = () => act('confirmwin');
  $('#keepplaying').onclick = () => act('keepplaying');
  $('#tiebreak').onclick = () => api('POST', '/api/raffle/tiebreak', { sid }).catch(fail);
  $('#auto').onclick = () => act('auto', { on: !st.auto.on, interval: Number($('#interval').value), stopOnWin: $('#stop').checked });
  $('#manual').onclick = () => { manual = !manual; render(); };
  $('#bigqr').onclick = () => act('bigqr', { on: !st.bigQr });
  $('#voice').onchange = (e) => { voiceOn = e.target.checked; store.set('voice', voiceOn ? '1' : '0'); };
  $('#board').onclick = (e) => { const v = e.target.dataset.v; if (manual && v && !st.drawn.includes(Number(v))) act('draw', { value: Number(v) }); };
  const off = subscribe(sid, (s) => { st = s; render(); }, () => { location.hash = '#/'; }, true);
  const tick = setInterval(() => st && render(), 60000);
  return () => { off(); clearInterval(tick); };
}

// Siguiente ronda: se vuelve a elegir la figura y el sorteo parte de cero.
// Los participantes conservan su cartón.
views.ronda = async (pid) => {
  if (!(await isAdmin())) return viewLogin();
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) { location.hash = `#/anfitrion/${pid}`; return undefined; }
  const info = await api('GET', `/api/sessions/${p.sessionId}/host`);
  const next = info.round + 1;
  app.innerHTML = `<p class="back"><a href="#/anfitrion/${pid}">← Volver al bingo anterior</a></p><h1>${esc(p.name)}</h1>
    <form class="panel" id="f">
      <h2>Ronda ${next}: ¿qué figura se juega?</h2>
      ${patternPicker(info.patterns)}
      <p class="muted small">Se borran los números sorteados y las marcas de la ronda ${info.round}. Cada participante sigue con su mismo cartón.</p>
      <button class="primary big">Iniciar la ronda ${next}</button>
    </form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const patterns = readPatterns(e.target);
    if (!patterns) return;
    try { await api('POST', `/api/sessions/${p.sessionId}/host/restart`, { patterns }); location.hash = `#/anfitrion/${pid}`; } catch (err) { fail(err); }
  };
  return undefined;
};

// Administración del bingo en curso: lo que no se usa durante el juego
views.admin = async (pid) => {
  if (!(await isAdmin())) return viewLogin();
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) { location.hash = `#/anfitrion/${pid}`; return undefined; }
  const sid = p.sessionId;
  const info = await api('GET', `/api/sessions/${sid}/host`);
  const act = (action, body) => api('POST', `/api/sessions/${sid}/host/${action}`, body || {});
  app.innerHTML = `<p class="back"><a href="#/anfitrion/${pid}">← Volver al bingo</a></p><h1>Administración</h1>
    <div class="panel"><h2>Enlaces y código QR</h2>
      <div class="row between"><div class="small">
        <b>Participantes:</b> <a class="link" href="${joinUrl()}" target="_blank">${esc(joinUrl())}</a><br>
        <b>Pantalla de OBS:</b> <a class="link" href="${stageUrl()}" target="_blank">${esc(stageUrl())}</a><br>
        <b>Tablero para el DJ:</b> <a class="link" href="${boardUrl()}" target="_blank">${esc(boardUrl())}</a><br>
        <b>Contraseña:</b> ${info.password ? esc(info.password) : '<i>sin contraseña</i>'}</div>${qr(joinUrl())}</div></div>
    <div class="panel"><h2>Textos de la gráfica de OBS</h2>
      <div class="fields" style="margin-top:10px">
        <label class="f">Franja superior<input type="text" id="gc-top" maxlength="90" value="${esc(info.gc.top)}" placeholder="Escanea el código QR con tu celular y participa"></label>
        <label class="f">Franja inferior<input type="text" id="gc-bottom" maxlength="140" value="${esc(info.gc.bottom)}" placeholder="Pon tu nombre, apellido y participa"></label>
      </div>
      <p class="muted small" style="margin-top:8px">En la franja inferior, lo que escribas entre asteriscos sale resaltado en amarillo: <b>*CONTRASEÑA: 1234*</b></p>
      <p style="margin-top:10px"><button id="gc-save">Guardar textos</button></p></div>
    <div class="panel"><h2>Selección final</h2>
      <p class="muted small">Si hay varios ganadores, elige al azar cuántos cartones conservar. El resultado aparece en el panel del bingo.</p>
      <div class="row"><label class="small">Conservar <input type="number" id="keep" min="1" value="1" style="width:80px"> cartones</label><button id="finalbtn">Elegir al azar</button></div></div>
    <div class="panel"><h2>Cerrar la sesión</h2>
      <p class="muted small">Termina el bingo para todos: se pierden los cartones repartidos y los participantes tendrán que volver a entrar.</p>
      <button class="danger" id="close">Cerrar la sesión</button></div>`;
  $('#gc-save').onclick = async () => { try { await act('gc', { top: $('#gc-top').value, bottom: $('#gc-bottom').value }); toast('Textos de la gráfica guardados'); } catch (err) { fail(err); } };
  $('#finalbtn').onclick = async () => { try { await act('final', { keep: Number($('#keep').value) || 1 }); toast('Selección hecha: mírala en el panel del bingo'); } catch (err) { fail(err); } };
  $('#close').onclick = async () => { if (confirm('¿Cerrar la sesión para todos?')) { await act('close').catch(fail); store.del('lastBingo'); location.hash = '#/'; } };
  return undefined;
};

views.sesiones = async () => {
  const list = await api('GET', '/api/sessions');
  app.innerHTML = `${BACK}<h1>Sesiones activas</h1>
    <div class="panel scroll-x">${list.length ? `<table class="list"><tr><th>Sesión</th><th>Ronda</th><th></th></tr>
      ${list.map((s) => `<tr><td><b>${esc(s.name)}</b> ${s.locked ? '🔒' : ''}</td><td>${s.round}</td>
        <td><div class="row"><a class="btn primary" href="#/jugar/${s.id}">Unirse</a><a class="btn" href="#/tablero/${s.id}">Tablero</a></div></td></tr>`).join('')}</table>`
    : '<p>No hay sesiones públicas activas en este momento. Si tu anfitrión te dio un enlace o un código QR, úsalo para entrar.</p>'}</div>`;
};

views.jugar = async (sid) => {
  if (!sid) { const r = await pickSession('jugar'); if (!r.sid) return r.cleanup; sid = r.sid; }
  const backToStart = () => { if (location.hash === '#/jugar') route(); else location.hash = '#/jugar'; };
  const key = `tok_${sid}`;
  let me = null;
  const token = store.get(key);
  if (token) me = await api('POST', `/api/sessions/${sid}/join`, { token }).catch(() => null);
  if (!me) {
    let info;
    try { info = await api('GET', `/api/sessions/${sid}`); } catch { backToStart(); return undefined; }
    app.innerHTML = `<form class="panel" id="f" style="max-width:460px;margin:0 auto">
      <h1>${esc(info.name)}</h1><p class="muted">Recibirás ${info.cardsPerPlayer} ${info.cardsPerPlayer > 1 ? 'cartones' : 'cartón'} en este dispositivo. No necesitas cuenta.</p>
      <div class="fields" style="grid-template-columns:1fr">
        <label class="f">Nombre<input type="text" name="name" maxlength="20" autocomplete="given-name" autocapitalize="words" value="${esc(store.get('playerFirst') || '')}" required autofocus></label>
        <label class="f">Apellido<input type="text" name="surname" maxlength="25" autocomplete="family-name" autocapitalize="words" value="${esc(store.get('playerLast') || '')}" required></label>
        ${info.places && info.places.length ? `<label class="f">¿Dónde estás?<select name="place" required><option value="">Elige tu lugar</option>${info.places.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>` : ''}
        ${info.locked ? '<label class="f">Contraseña de la sesión<input type="text" name="password" required></label>' : ''}
        <button class="primary big">Unirse</button>
      </div></form>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', `/api/sessions/${sid}/join`, Object.fromEntries(new FormData(e.target)));
        store.set(key, r.token);
        store.set('playerFirst', e.target.name.value.trim());
        store.set('playerLast', e.target.surname.value.trim());
        route();
      } catch (err) { if (err.status === 404) backToStart(); else fail(err); }
    };
    // Si el moderador cierra este bingo mientras la persona escribe su nombre, se la lleva al bingo vigente
    refreshOnShow = true;
    const gone = setInterval(async () => { const r = await fetch(`/api/sessions/${sid}`).catch(() => null); if (r && r.status === 404) backToStart(); }, 5000);
    return () => { clearInterval(gone); refreshOnShow = false; };
  }
  let st = null;
  let round = null;
  const marks = Object.fromEntries(me.cards.map((c) => [c.no, new Set(c.marks)]));
  const maskOf = (c) => [...marks[c.no]].reduce((m, i) => m | (1 << i), c.cells[12] === 0 ? 1 << 12 : 0);
  app.innerHTML = `<div id="bingo-top"><div class="now" id="now"></div>
    <div id="banner"></div>
    <div class="cards" id="cards"></div></div>
    <div class="prosco" id="prosco" hidden></div>
    <div class="pkar" id="pkar" hidden></div>
    <div class="pvote" id="pvote" hidden></div>
    <div class="pvote pinsta" id="pinsta" hidden></div>
    <div id="bingo-bottom"><button class="primary big" id="sync" style="margin-top:16px">↻ Actualizar y marcar lo que falta</button>
    <p class="muted small" style="margin-top:8px">Marca por ti los valores ya anunciados que se te pasaron.</p>
    <div class="panel" style="margin-top:20px"><h2 id="title" style="margin:0"></h2><span class="muted small" id="meta"></span><div id="pats" style="margin-top:8px"></div></div></div>
    <div class="live" id="live"><div id="live-player"></div>
      <div class="live-bar"><button type="button" id="live-audio">🔇 Activar audio</button><button type="button" id="live-full">⛶ Pantalla completa</button><button type="button" id="live-sync" class="wide">↻ Poner al día el video</button></div></div>
    ${window.krbKidsButton ? window.krbKidsButton() : '<a class="btn kids-entry" href="#/kids">🧸 <b>KRB Kids</b><span>Zona de niños</span></a>'}`;
  // Durante El Rosco: se guarda el cartón y quedan el video y, debajo, la pregunta en juego
  let roscoEs = null;
  let roscoId = null;
  let rosco = null;
  let roscoTick = null;
  const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const roscoLeft = () => {
    const c = rosco.players[rosco.turn];
    return rosco.runningSince ? c.remainingMs - (Date.now() - rosco.gotAt + rosco.now - rosco.runningSince) : c.remainingMs;
  };
  // Rosco en línea: lo que esta persona respondió (pregunta → alternativa), en orden, y su puntaje
  let crowdMine = {};
  let crowdOrder = [];
  let crowdInfo = null;
  let crowdTimer = null;
  const loadCrowd = async () => {
    if (!roscoId) return;
    const r = await api('GET', `/api/wheels/${roscoId}/crowd?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(me.token)}`).catch(() => null);
    if (!r || !rosco) return;
    crowdInfo = r;
    for (const [k, t] of Object.entries(r.mine)) { if (!(k in crowdMine)) crowdOrder.push(k); crowdMine[k] = t; }
    drawRosco();
  };
  // Tras cada novedad del escenario se vuelve a pedir el puntaje, con una pequeña espera distinta en cada celular
  const crowdSoon = () => { clearTimeout(crowdTimer); crowdTimer = setTimeout(loadCrowd, 500 + Math.random() * 1500); };
  const crowdHTML = () => {
    if (rosco.crowdWinner) return `<div class="prosco-win pcrowd-win">🏅 ${esc(rosco.crowdWinner.name)}<small>Ganó la Trivia del Rosco con ${rosco.crowdWinner.score} puntos</small></div>`;
    const cq = rosco.winner || rosco.finished ? null : rosco.crowd;
    const sent = cq && crowdMine[cq.key];
    // Al tocar, la alternativa elegida se pone verde con ✔ si es correcta o roja con ✘ si no lo es
    const mark = (o) => (!sent || o !== sent.text ? '' : sent.ok === true ? 'ok' : sent.ok === false ? 'ko' : 'wait');
    const sign = (o) => (mark(o) === 'ok' ? '✔ ' : mark(o) === 'ko' ? '✘ ' : '');
    const play = !cq ? '' : `<div class="pcrowd ${sent ? 'done' : ''}"><small>${sent ? (sent.ok === true ? '¡Correcto!' : sent.ok === false ? 'Esta vez no' : 'Enviando…') : 'Juega tú también: mientras más rápido, más puntos'}</small>
      ${cq.options.map((o) => `<button type="button" class="${mark(o)}" data-crowd="${esc(o)}" data-key="${cq.key}" ${sent ? 'disabled' : ''}>${sign(o)}${esc(o)}</button>`).join('')}</div>`;
    return play;
  };
  const drawRosco = () => {
    if (!rosco) { $('#prosco').innerHTML = '<p class="muted">Cargando El Rosco…</p>'; return; }
    const c = rosco.players[rosco.turn];
    const reveal = ''; // en el celular no se muestra la respuesta correcta: solo si la propia alternativa fue verde o roja
    const body = rosco.winner ? `<div class="prosco-win">🏆 ${esc(rosco.winner.name)}<small>${rosco.winner.full ? '¡Completó el rosco!' : '¡Ganó El Rosco!'}</small></div>`
      : rosco.tie ? `<div class="prosco-wait">Empate entre ${rosco.tie.names.map(esc).join(' y ')}. Se define por sorteo.</div>`
      : rosco.finished ? '<div class="prosco-wait">Juego terminado</div>'
      : `<div class="prosco-q"><span class="prosco-letter">${esc(rosco.letters[c.current])}</span>
          <p>${rosco.question ? esc(rosco.question) : '<span class="muted">Esperando la siguiente pregunta…</span>'}</p></div>`;
    // Los 5 primeros del público con su puntaje y, en la sexta fila y con otro color, el puesto de esta persona
    const mine = crowdInfo && crowdInfo.me;
    const inTop = mine && mine.rank <= 5 && mine.score > 0;
    const top = crowdInfo && ((crowdInfo.top && crowdInfo.top.length) || mine) ? `<div class="pcrowd-top"><small>Top 5</small>${(crowdInfo.top || []).map((t, i) => `<div class="${inTop && i === mine.rank - 1 ? 'me' : ''}"><em>${i + 1}</em><span>${esc(t.name)}</span><b>${t.score}</b></div>`).join('')}
      ${mine && !inTop ? `<div class="you"><em>${mine.rank}.º</em><span>${esc(me.name)}</span><b>${mine.score}</b></div>` : ''}</div>` : '';
    $('#prosco').innerHTML = `<div class="prosco-head big"><b>Trivia del Rosco</b><span></span><span class="prosco-clock" id="prosco-clock">${rosco.winner || rosco.finished ? '' : fmtClock(roscoLeft())}</span></div>
      ${body}${reveal}${crowdHTML()}
      ${top}`;
  };
  const stopRosco = () => { if (roscoEs) roscoEs.close(); clearInterval(roscoTick); clearTimeout(crowdTimer); roscoEs = null; roscoId = null; rosco = null; crowdMine = {}; crowdOrder = []; crowdInfo = null; };
  // Durante el karaoke: se guarda el cartón y aparece el formulario para pedir canción.
  // El nombre no se pregunta: es el mismo con que la persona entró a la sala.
  let karTimer = null;
  let karShown = '';
  let karSent = false;
  const drawKar = async () => {
    const k = await api('GET', `/api/karaoke?sid=${encodeURIComponent(sid)}&token=${encodeURIComponent(me.token)}`).catch(() => null);
    if (!k || $('#pkar').hidden) return;
    const mine = k.me ? k.me.first : -1;
    const count = k.me ? k.me.count : 0;
    const max = k.me ? k.me.max : 2;
    // Tras enviar, se espera a que el pedido aparezca en la lista (o 25 s) antes de ofrecer el formulario otra vez
    if (karSent && (count >= karSent.until || Date.now() - karSent.at > 25000)) karSent = false;
    const now = k.list[0];
    const sig = JSON.stringify([k.venue, now, mine, count, !!karSent, k.total, k.phone, k.ask]);
    if (sig === karShown) return;
    karShown = sig;
    const full = count >= max;
    const turn = `${mine === 0 ? '<div class="pkar-turn now">🎤 ¡Es tu turno! Te toca cantar</div>'
      : mine > 0 ? `<div class="pkar-turn">Estás en la lista: ${mine === 1 ? 'eres el siguiente' : `tienes ${mine} personas antes`}</div>` : ''}
      ${karSent ? '<div class="pkar-turn">✔ Pedido enviado. Aparecerá en la lista en unos segundos.</div>' : ''}
      ${full ? `<p class="pkar-limit">Ya tienes ${max} canciones en la lista.<br><b>Priorizamos a quienes no han cantado:</b> cuando cantes una, podrás pedir otra.</p>` : ''}`;
    const draft = $('#pkar form') ? Object.fromEntries(new FormData($('#pkar form'))) : {};
    $('#pkar').innerHTML = `<div class="pkar-head"><b>🎤 Karaoke ${esc(k.name)}</b><span>${k.total ? `${k.total} en la lista` : 'Lista abierta'}</span></div>
      ${now ? `<div class="pkar-now"><small>Ahora canta</small><b>${esc(now.name)}</b><span>${esc(now.song)}${now.artist ? ` · ${esc(now.artist)}` : ''}</span></div>` : ''}
      ${turn}
      ${full || karSent ? '' : !k.phone ? '<p class="pkar-qr">🎤 En este momento no se están recibiendo pedidos de karaoke.</p>' : `<form>
        <h3>${count ? 'Pide otra canción' : 'Inscribe tu canción y participa'}</h3>
        ${count ? `<p class="muted small">Puedes tener hasta ${max} canciones en la lista. Priorizamos a quienes no han cantado.</p>` : ''}
        <p class="muted small">Canta: <b>${esc(me.name)}</b></p>
        <label class="f">Canción<input type="text" name="song" maxlength="80" required autocomplete="off" placeholder="Escribe y elige de la lista" value="${esc(draft.song || '')}"></label>
        <div class="sug" data-sug="song"></div>
        <label class="f">Artista<input type="text" name="artist" maxlength="60" required value="${esc(draft.artist || '')}"></label>
        <p class="muted small" style="margin:6px 0 0">Si alguien ya pidió tu canción, cantarás esta otra:</p>
        <label class="f">Canción de reemplazo<input type="text" name="altSong" maxlength="80" required autocomplete="off" placeholder="Escribe y elige de la lista" value="${esc(draft.altSong || '')}"></label>
        <div class="sug" data-sug="altSong"></div>
        <label class="f">Artista de reemplazo<input type="text" name="altArtist" maxlength="60" required value="${esc(draft.altArtist || '')}"></label>
        ${k.ask.places.length && !me.place ? `<label class="f">¿Dónde estás?<select name="ans-place" required><option value="">Elige tu lugar</option>${k.ask.places.map((x) => `<option ${draft['ans-place'] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}
        ${k.ask.choices.map((c) => `<label class="f">${esc(c.title)}<select name="ans-${c.id}" ${c.required ? 'required' : ''}><option value="">Elige una opción</option>${c.options.map((x) => `<option ${draft[`ans-${c.id}`] === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`).join('')}
        <button class="primary big">🎤 Enviar mi pedido</button></form>`}`;
    if ($('#pkar form')) wireSongSearch($('#pkar form'));
    if ($('#pkar form')) $('#pkar form').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      const data = Object.fromEntries(new FormData(e.target));
      const answers = Object.fromEntries(Object.entries(data).filter(([key]) => key.startsWith('ans-')).map(([key, v]) => [key.slice(4), v]));
      try { await api('POST', '/api/karaoke/request', { sid, token: me.token, song: data.song, artist: data.artist, altSong: data.altSong, altArtist: data.altArtist, answers }); karSent = { at: Date.now(), until: count + 1 }; karShown = ''; toast('¡Pedido enviado!'); drawKar(); } catch (err) { fail(err); btn.disabled = false; }
    };
  };
  const syncKar = () => {
    const on = st.stage === 'karaoke';
    $('#pkar').hidden = !on;
    if (on && !karTimer) { karShown = ''; drawKar(); karTimer = setInterval(drawKar, 5000); }
    if (!on && karTimer) { clearInterval(karTimer); karTimer = null; karSent = false; }
    return on;
  };
  // Durante una votación: se guarda el cartón y aparece la teclera (vote-ui.js)
  let voteTimer = null;
  let voteRev = null;
  const syncVote = () => {
    const on = st.stage === 'voto';
    $('#pvote').hidden = !on;
    if (on && !voteTimer) { window.phoneVote.reset(); voteRev = null; voteTimer = setInterval(() => window.phoneVote.draw(sid, me.token), 8000); }
    if (on && voteRev !== st.voteRev) { voteRev = st.voteRev; window.phoneVote.draw(sid, me.token); }
    if (!on && voteTimer) { clearInterval(voteTimer); voteTimer = null; }
    return on;
  };
  // «Síguenos en Instagram»: se guarda el cartón y aparece la cuenta del local (insta-ui.js)
  let instaOn = false;
  const syncInsta = () => {
    const on = st.stage === 'insta';
    $('#pinsta').hidden = !on;
    if (on && !instaOn) { window.phoneInsta.reset(); window.phoneInsta.draw(); instaOn = setInterval(() => window.phoneInsta.draw(), 10000); } // se vuelve a leer por si el animador corrige la cuenta
    if (!on && instaOn) { clearInterval(instaOn); instaOn = false; }
    return on;
  };
  // Instrucciones en el celular (pedido de Cote, 20 nov): al empezar cada juego (y al entrar a la sala) aparecen
  // 3 segundos las instrucciones del juego en curso: Bingo (cada ronda), El Rosco, El Festival o El objeto más extraño
  // Cada juego tiene su propia clave: bingo por ronda (desde el primer número), El Rosco por rosco cargado y la votación
  // por concurso (voteGen); cada clave se muestra una sola vez (volver a un juego que sigue no las repite)
  let howtoKey = null;
  const howtoShown = new Set();
  const phoneHowto = (title, lines) => {
    let el = document.getElementById('phone-howto');
    if (el) el.remove();
    el = document.createElement('div'); el.id = 'phone-howto';
    el.innerHTML = `<div class="ph-card"><small>📢 Instrucciones</small><b>${esc(title)}</b><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><i class="ph-bar"></i></div>`;
    document.body.appendChild(el);
    setTimeout(() => { if (el.isConnected) el.remove(); }, 3000); // 3 segundos como máximo (pedido de Cote, 20 nov)
  };
  const syncHowto = async () => {
    const s = st.stage || 'bingo';
    const key = s === 'rueda' && st.roscoId ? `rosco:${st.roscoId}` : s === 'voto' ? `voto:${st.voteGen}` : s === 'bingo' && st.drawn && st.drawn.length && !st.winConfirmed ? `bingo:${st.round}` : null;
    if (!key || howtoShown.has(key)) return;
    howtoShown.add(key); howtoKey = key;
    if (key.startsWith('voto')) {
      const v = await api('GET', '/api/vote').catch(() => null);
      if (!v || !window.voteHowto || howtoKey !== key) return;
      const h = window.voteHowto(v); phoneHowto(h.title, h.lines);
    } else if (key.startsWith('rosco')) phoneHowto('El Rosco', window.ROSCO_HOWTO);
    else phoneHowto(bingoName(st.name), BINGO_HOWTO);
  };
  const syncStage = () => {
    syncHowto();
    const kar = syncKar() | syncVote() | syncInsta();
    const on = (st.stage === 'rueda' && !!st.roscoId) || kar;
    $('#bingo-top').hidden = on;
    $('#bingo-bottom').hidden = on;
    if (kar) { $('#prosco').hidden = true; stopRosco(); return; }
    $('#prosco').hidden = !on;
    if (!on) { stopRosco(); return; }
    if (roscoId === st.roscoId) return;
    stopRosco();
    roscoId = st.roscoId;
    drawRosco();
    roscoEs = new EventSource(`/api/wheels/${roscoId}/events`);
    roscoEs.onmessage = (e) => { rosco = { ...JSON.parse(e.data), gotAt: Date.now() }; drawRosco(); crowdSoon(); };
    // Tocar una alternativa: queda marcada al instante y se envía; solo se puede responder una vez por pregunta
    $('#prosco').onclick = async (e) => {
      const b = e.target.closest('[data-crowd]');
      if (!b || !roscoId) return;
      const key = b.dataset.key;
      const choice = b.dataset.crowd;
      if (crowdMine[key]) return;
      crowdMine[key] = { text: choice }; crowdOrder.push(key); drawRosco();
      try { const r = await api('POST', `/api/wheels/${roscoId}/crowd`, { sid, token: me.token, key, choice }); crowdMine[key] = { text: choice, ok: !!r.correct }; if (rosco) drawRosco(); crowdSoon(); } catch (err) {
        if (!/Ya respondiste/.test(err.message)) { delete crowdMine[key]; crowdOrder = crowdOrder.filter((k) => k !== key); fail(err); if (rosco) drawRosco(); }
      }
    };
    roscoTick = setInterval(() => { const el = $('#prosco-clock'); if (el && rosco && rosco.runningSince && !rosco.winner) el.textContent = fmtClock(roscoLeft()); }, 250);
  };
  const render = () => {
    syncStage();
    if (round !== null && st.round !== round) me.cards.forEach((c) => marks[c.no].clear());
    round = st.round;
    $('#title').textContent = bingoName(st.name);
    $('#meta').textContent = `${me.name} · Ronda ${st.round} · ${st.drawn.length} valores anunciados`;
    $('#pats').innerHTML = patternsInline(st.patterns);
    $('#now').innerHTML = `${ballHTML(st, st.drawn.at(-1), 'mid')}<div><div class="small"><b>Valor actual</b> · anteriores:</div>
      <div class="history">${st.drawn.slice(-7, -1).reverse().map((v) => `<span>${esc(plain(st, v))}</span>`).join('') || '<span>—</span>'}</div></div>`;
    const mine = st.results.filter((r) => r.validated && marks[r.cardNo]);
    // Si este cartón ganó, se marcan solas todas las casillas ya anunciadas (aunque no las haya tocado)
    for (const r of mine) {
      const c = me.cards.find((x) => x.no === r.cardNo);
      c.cells.forEach((v, i) => { if (v !== 0 && st.drawn.includes(v)) marks[c.no].add(i); });
    }
    // Sombra de la figura. Si el patrón admite varias formas (cualquier línea, dos líneas…),
    // se sombrea la que este cartón lleva más avanzada.
    const bits = (x) => { let n = 0; for (; x; x &= x - 1) n++; return n; };
    const bestFor = (m) => PATTERNS.byId[st.patterns[0]].variants.reduce((p, v) => (bits(v & m) / bits(v) > bits(p & m) / bits(p) ? v : p));
    // Cuántas casillas de la figura le quedan por marcar a este cartón
    const noteFor = (m) => {
      const left = bits(bestFor(m) & ~m);
      return left === 0 ? '¡Figura completa!' : left === 1 ? 'Te falta 1 número' : `Te faltan ${left} números`;
    };
    $('#banner').innerHTML = mine.length ? '<div class="bingo-banner">¡BINGO!</div>' : '';
    $('#cards').innerHTML = me.cards.map((c) => {
      const m = maskOf(c);
      const green = mine.filter((r) => r.cardNo === c.no).reduce((g, r) => g | PATTERNS.completed(r.pattern, m), 0);
      return cardHTML(st, c.cells, { no: me.startNumber + c.no - 1, marks: m, green, hint: bestFor(m), note: noteFor(m) });
    }).join('');
  };
  $('#cards').onclick = async (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !st) return;
    const c = me.cards.find((x) => String(me.startNumber + x.no - 1) === cell.closest('.card').dataset.no);
    const i = Number(cell.dataset.i);
    const v = c.cells[i];
    if (v === 0) return;
    const on = !marks[c.no].has(i);
    if (on && !st.drawn.includes(v)) {
      cell.classList.remove('nope');
      void cell.offsetWidth; // reinicia la animación
      cell.classList.add('nope');
      cell.blur();
      setTimeout(() => cell.classList.remove('nope'), 350);
      return toast('Ese valor todavía no ha salido: no se puede marcar');
    }
    on ? marks[c.no].add(i) : marks[c.no].delete(i);
    render();
    try { await api('POST', `/api/sessions/${sid}/mark`, { token: me.token, cardNo: c.no, cell: i, on }); } catch (err) { on ? marks[c.no].delete(i) : marks[c.no].add(i); render(); fail(err); }
  };
  $('#sync').onclick = async (e) => {
    e.target.disabled = true;
    try {
      const r = await api('POST', `/api/sessions/${sid}/sync`, { token: me.token });
      let added = 0;
      me.cards.forEach((c) => { const next = new Set(r.marks[c.no] || []); added += Math.max(0, next.size - marks[c.no].size); marks[c.no] = next; });
      st = r.state;
      round = st.round;
      render();
      toast(added ? `Se ${added === 1 ? 'marcó 1 casilla' : `marcaron ${added} casillas`} que faltaban` : 'Todo al día: no te falta marcar nada');
    } catch (err) { fail(err); }
    e.target.disabled = false;
  };
  // Transmisión en vivo del local bajo el cartón: silenciada, sin controles, y solo si el canal está en vivo
  let player = null;
  let liveFor = null;
  const startLive = () => {
    const channel = LIVE_CHANNELS[st.theme] || LIVE_CHANNELS.frida;
    if (liveFor === channel) return;
    liveFor = channel;
    loadTwitch().then(() => {
      if (!$('#live-player') || liveFor !== channel) return;
      $('#live-player').innerHTML = '';
      $('#live').classList.remove('on');
      player = new window.Twitch.Player('live-player', { channel, parent: [location.hostname], muted: true, controls: false, autoplay: true, width: '100%', height: '100%' });
      const show = (on) => { const box = $('#live'); if (box) box.classList.toggle('on', on); };
      player.addEventListener(window.Twitch.Player.ONLINE, () => { show(true); try { player.setMuted(true); player.play(); } catch { /* el reproductor decide */ } });
      player.addEventListener(window.Twitch.Player.PLAYING, () => show(true));
      player.addEventListener(window.Twitch.Player.OFFLINE, () => { show(false); setFull(false); });
      player.addEventListener(window.Twitch.Player.ENDED, () => { show(false); setFull(false); });
    }).catch(() => { liveFor = null; }); // sin acceso a Twitch: simplemente no se muestra
  };
  // Audio y pantalla completa, a elección de cada persona (parte siempre silenciado)
  let muted = true;
  $('#live-audio').onclick = () => {
    if (!player) return;
    muted = !muted;
    try { player.setMuted(muted); if (!muted) { player.setVolume(1); player.play(); } } catch { /* el reproductor decide */ }
    $('#live-audio').textContent = muted ? '🔇 Activar audio' : '🔊 Silenciar';
  };
  const setFull = (on) => {
    $('#live').classList.toggle('full', on);
    document.body.classList.toggle('live-open', on);
    $('#live-full').textContent = on ? '✕ Cerrar' : '⛶ Pantalla completa';
    // Donde el navegador lo permite, además se oculta su barra; en iPhone basta con la vista ampliada
    try {
      if (on && $('#live').requestFullscreen) $('#live').requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch { /* sin pantalla completa nativa */ }
  };
  $('#live-full').onclick = () => setFull(!$('#live').classList.contains('full'));
  // Poner el video al día: al pausar y reanudar, el reproductor salta al punto más reciente del vivo.
  // Se hace solo cuando la persona vuelve a la página (el video se atrasa mientras el teléfono está en otra cosa).
  const resync = () => { if (!player) return; try { player.pause(); setTimeout(() => { try { player.play(); } catch { /* el reproductor decide */ } }, 250); } catch { /* el reproductor decide */ } };
  $('#live-sync').onclick = () => { resync(); toast('Video al día'); };
  const onBack = () => { if (!document.hidden && $('#live') && $('#live').classList.contains('on')) resync(); };
  document.addEventListener('visibilitychange', onBack);
  const onFs = () => { if (!document.fullscreenElement && $('#live') && $('#live').classList.contains('full') && $('#live').requestFullscreen) setFull(false); };
  document.addEventListener('fullscreenchange', onFs);
  const off = subscribe(sid, (s) => { st = s; render(); startLive(); }, () => { store.del(key); backToStart(); }, false, me.token);
  return () => { off(); stopRosco(); clearInterval(karTimer); clearInterval(voteTimer); clearInterval(instaOn); liveFor = null; player = null; document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('visibilitychange', onBack); document.body.classList.remove('live-open'); };
};
// Canal de Twitch de cada local (uno por local: KRB Stage en Frida, KRB Stage Kennedy en Kennedy, KRB Stage 3 en Tobalaba)
const LIVE_CHANNELS = { frida: 'krbstage', kennedy: 'krbstagekennedy', tobalaba: 'krbstage3' };
let twitchLoading = null;
const loadTwitch = () => {
  if (window.Twitch && window.Twitch.Player) return Promise.resolve();
  twitchLoading = twitchLoading || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://player.twitch.tv/js/embed/v1.js';
    s.onload = resolve;
    s.onerror = () => { twitchLoading = null; s.remove(); reject(new Error('twitch')); };
    document.head.appendChild(s);
  });
  return twitchLoading;
};

// ---------- Efectos de sonido (tablero del DJ) ----------
// Se generan en el navegador, sin archivos de audio. El navegador solo deja sonar después de un
// toque o clic en la página, por eso el tablero muestra «Activar sonido» hasta que alguien lo pulsa.
const sfx = (() => {
  let ctx = null;
  const ready = () => !!ctx && ctx.state === 'running';
  const unlock = () => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state !== 'running') ctx.resume();
    } catch { /* sin audio */ }
    return ctx;
  };
  // Una nota: frecuencia, inicio y duración en segundos, forma de onda y volumen
  const note = (freq, at, dur, type = 'sine', vol = 0.3, slideTo = 0) => {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  // Bocina de aire comprimido (la de los estadios): dos tonos ásperos y desafinados que entran
  // con un pequeño «subidón», saturados para que suenen fuertes y metálicos.
  const horn = (at, dur) => {
    const t = ctx.currentTime + at;
    const out = ctx.createGain();
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(3 * x); }
    shape.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    out.gain.setValueAtTime(0.5, t + dur - 0.08);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    shape.connect(lp).connect(out).connect(ctx.destination);
    for (const [f, v] of [[466, 0.5], [469, 0.4], [587, 0.45], [591, 0.35], [932, 0.15], [1174, 0.1]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.93, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      g.gain.value = v;
      o.connect(g).connect(shape);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  };
  const sounds = {
    // Acierto: campanita brillante de dos notas
    hit: () => { note(1319, 0, 0.5, 'sine', 0.35); note(2637, 0, 0.35, 'sine', 0.12); note(1760, 0.12, 0.8, 'sine', 0.35); note(3520, 0.12, 0.5, 'sine', 0.1); },
    // Fallo: zumbador grave
    miss: () => { note(160, 0, 0.6, 'sawtooth', 0.28); note(113, 0, 0.6, 'square', 0.16); },
    // Paso: nota corta que baja
    pass: () => { note(660, 0, 0.22, 'triangle', 0.25, 330); },
    // Bolita del bingo: campanita tipo triángulo, muy suave y con cola larga
    ball: () => { note(2637, 0, 1.6, 'sine', 0.09); note(5290, 0, 1.1, 'sine', 0.04); note(7980, 0, 0.6, 'sine', 0.02); note(3960, 0, 0.9, 'sine', 0.025); },
    // Tómbola: golpe seco de la rueda en cada nombre que pasa, y «ta-dá» al salir el elegido
    ratchet: () => { note(820, 0, 0.045, 'triangle', 0.45, 520); note(2400, 0, 0.02, 'square', 0.12); },
    tada: () => {
      [392, 494, 587].forEach((f) => { note(f, 0, 0.16, 'sawtooth', 0.14); note(f * 2, 0, 0.16, 'square', 0.05); });
      [523, 659, 784, 1047].forEach((f) => { note(f, 0.2, 1.5, 'sawtooth', 0.13); note(f * 2, 0.2, 1.1, 'sine', 0.06); });
      [2093, 2637, 3136].forEach((f, i) => note(f, 0.25 + i * 0.07, 0.9, 'sine', 0.07));
    },
    // Reloj: tic y tac secos y fuertes, alternados
    tick: () => { note(1500, 0, 0.05, 'square', 0.4); note(3000, 0, 0.03, 'sine', 0.2); },
    tock: () => { note(950, 0, 0.06, 'square', 0.4); note(1900, 0, 0.03, 'sine', 0.2); },
    // Reloj de la votación: tic-tac suave, tipo madera, y una campanita al terminar
    softTick: () => { note(880, 0, 0.07, 'sine', 0.22); note(1760, 0, 0.03, 'sine', 0.06); },
    softTock: () => { note(660, 0, 0.08, 'sine', 0.22); note(1320, 0, 0.03, 'sine', 0.06); },
    chime: () => { note(1047, 0, 0.5, 'sine', 0.22); note(1319, 0.14, 0.6, 'sine', 0.2); note(1568, 0.28, 0.9, 'sine', 0.18); },
    // Se acabó el tiempo: tres bocinazos de aire comprimido, el último más largo
    alarm: () => { horn(0, 0.45); horn(0.62, 0.45); horn(1.24, 1.1); },
    // Redoble de tambores (concurso de karaoke): golpes cada vez más rápidos y fuertes, y un platillo al final
    drum: () => {
      let t = 0;
      for (let i = 0; i < 46; i++) { const v = 0.08 + 0.3 * (i / 46); note(110 + (i % 2) * 18, t, 0.06, 'triangle', v); note(70, t, 0.05, 'square', v * 0.5); t += Math.max(0.035, 0.11 - i * 0.0018); }
      note(55, t, 0.9, 'sawtooth', 0.35); note(2400, t, 1.2, 'square', 0.06, 900); note(1800, t + 0.02, 1.1, 'sine', 0.08, 700);
    },
    // Ganador: fanfarria ascendente con acorde final
    win: () => {
      [523, 659, 784].forEach((f, i) => { note(f, i * 0.14, 0.2, 'sawtooth', 0.16); note(f, i * 0.14, 0.2, 'square', 0.08); });
      [1047, 784, 659, 523].forEach((f) => { note(f, 0.42, 1.6, 'sawtooth', 0.13); note(f * 2, 0.42, 1.2, 'sine', 0.06); });
      [1319, 1568, 2093].forEach((f, i) => note(f, 0.9 + i * 0.12, 0.6, 'sine', 0.14));
    },
  };
  const play = (name) => { if (ready() && sounds[name]) { try { sounds[name](); } catch { /* sin audio */ } } };
  return { unlock, ready, play, played: [], ticks: 0 };
})();

// Tablero del DJ: pantalla completa (no transparente) que sigue sola lo que está pasando,
// igual que la gráfica de OBS: bingo, sorteo o desempate, El Rosco.
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
  const apply = async () => {
    if (busy) return;
    busy = true;
    try {
      const show = (await api('GET', '/api/stage').catch(() => ({}))).show || current || 'none';
      if (show !== current) {
        current = show;
        if (typeof stop === 'function') stop();
        stop = null;
        app.innerHTML = '';
        if (show === 'sorteo') stop = await views.sorteo();
        else if (show === 'rueda') stop = await views.rueda();
        else if (show === 'qr') stop = await views.qrFull();
        else if (show === 'karaoke') stop = await views.karaokeFull();
        else if (show === 'voto') stop = await views.votoFull();
        else if (show === 'juego') stop = await views.juegoDraw('full');
        else if (show === 'insta') stop = await views.instaFull();
        else if (show === 'show') stop = await views.showFull();
        else stop = await views.bingoFull(); // bingo, o la portada si no hay nada en juego
        joinQr({ sorteo: 'tr', rueda: 'tr', show: 'br' }[show]);
      }
      mark();
    } finally { busy = false; }
  };
  await apply();
  const timer = setInterval(apply, 2000);
  return () => { clearInterval(timer); if (typeof stop === 'function') stop(); joinQr(); document.body.classList.remove('full'); soundBtn.remove(); document.removeEventListener('pointerdown', enableSound); document.removeEventListener('keydown', enableSound); };
};

// Tablero para una pantalla puesta de pie (girada 90° a la izquierda) que recibe la señal horizontal de siempre:
// el mismo tablero se dibuja en formato vertical dentro de un marco y se entrega girado 90° a la derecha,
// igual que se hace con los videos para esa pantalla. Va sin sonido.
views['tablero-v'] = async () => {
  document.body.classList.add('rot-screen');
  app.innerHTML = `<iframe class="rot-frame" title="Tablero vertical" src="${location.pathname}?mudo=1#/tablero"></iframe>`;
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
  const id = store.get('lastBingo');
  // Si el bingo anterior ya tiene ganador confirmado, no se vuelve a mostrar: se pasa directo a crear el siguiente
  try {
    const p = id && await api('GET', `/api/projects/${id}`);
    const info = p && p.sessionId ? await api('GET', `/api/sessions/${p.sessionId}/host`) : null;
    if (info && info.roundOver) { location.hash = `#/ronda/${id}`; return; }
    if (info && !info.drawn) { location.hash = `#/figura/${id}`; return; } // bingo sin empezar: primero la figura
  } catch { /* sin datos: se sigue al panel */ }
  await api('POST', '/api/stage', { show: 'bingo' }).catch(() => {});
  location.hash = id ? `#/anfitrion/${id}` : '#/proyectos';
}
// ---------- Karaoke: buscador de canciones ----------
// Mientras la persona escribe, se consulta el catálogo de iTunes y se ofrecen canciones reales;
// al tocar una, se llenan solos la canción y el artista. Es una ayuda: también se puede escribir a mano.
// La consulta sale del propio celular; si el navegador no lo permite, pasa por nuestro servidor.
const tidySongs = (results) => {
  const seen = new Set();
  return (results || []).map((x) => ({ song: (String(x.trackName || x.song || '').replace(/\s*[(（][^)）]*[)）]?/g, ' ').replace(/\s+/g, ' ').trim() || String(x.trackName || x.song || '').trim()), artist: String(x.artistName || x.artist || '').trim() }))
    .filter((x) => x.song && x.artist && !seen.has(`${x.song}|${x.artist}`.toLowerCase()) && seen.add(`${x.song}|${x.artist}`.toLowerCase())).slice(0, 5);
};
let songDirect = true; // se apaga si el celular no logra hablar directo con iTunes
async function songSearch(term) {
  if (songDirect) {
    try {
      const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=10&country=CL&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error('itunes');
      return tidySongs((await r.json()).results);
    } catch { songDirect = false; }
  }
  try { return tidySongs((await (await fetch(`/api/songs?q=${encodeURIComponent(term)}`)).json()).list); } catch { return []; }
}
function wireSongSearch(form) {
  const pairs = { song: 'artist', altSong: 'altArtist' };
  let timer = null;
  let turn = 0;
  form.addEventListener('input', (e) => {
    const field = e.target.name;
    if (!pairs[field]) return;
    const box = form.querySelector(`[data-sug="${field}"]`);
    const term = e.target.value.trim();
    clearTimeout(timer);
    if (term.length < 3) { box.innerHTML = ''; return; }
    const mine = ++turn;
    timer = setTimeout(async () => {
      const list = await songSearch(term);
      if (mine !== turn || !form.isConnected) return; // llegó tarde: la persona siguió escribiendo
      box.innerHTML = list.map((x) => `<button type="button" data-song="${esc(x.song)}" data-artist="${esc(x.artist)}"><b>${esc(x.song)}</b><span>${esc(x.artist)}</span></button>`).join('');
    }, 350);
  });
  form.addEventListener('click', (e) => {
    const pick = e.target.closest('.sug button');
    if (!pick) return;
    const field = pick.parentElement.dataset.sug;
    form.elements[field].value = pick.dataset.song.slice(0, 80);
    form.elements[pairs[field]].value = pick.dataset.artist.slice(0, 60);
    pick.parentElement.innerHTML = '';
    turn++;
  });
}

// ---------- Karaoke: panel del animador ----------
// Pone el karaoke en pantalla y muestra la cola. El local es el de la sala abierta.
// «Ya cantó», Subir y Bajar: cuando el local ya tiene instalado Sala.gs, se pueden usar aquí o en la app del equipo.
views.karaokectl = async (local) => {
  // Con un local (#/karaokectl/kennedy) es el karaoke de la sala light: no cambia la pantalla de la sala principal.
  // Ahí también entra el equipo de ese local con su clave (sin acceso a lo demás).
  const light = ['frida', 'kennedy', 'tobalaba'].includes(local) ? local : '';
  const admin = await isAdmin();
  const staff = !admin && light && store.get('staffToken') && (await api('GET', '/api/staff/me').catch(() => ({}))).venue === light;
  if (!admin && !staff) { if (light) { location.hash = `#/equipo/${light}`; return undefined; } return viewLogin(); }
  const lq = light ? `?local=${light}` : '';
  app.innerHTML = `${light ? '<div class="panel" id="kc-lt"></div>' : ''}<div class="panel"><div class="row between"><div><h1 id="kc-title" style="margin:0">Karaoke</h1><span class="muted" id="kc-sub"></span></div></div>
      <div id="kc-list" style="margin-top:14px"></div>
      <div id="kc-sung-box" hidden><button type="button" id="kc-sung-btn" class="kc-sung-btn">✓ Ya cantaron</button><div id="kc-sung"></div></div>
      <label class="check" style="margin-top:14px"><input type="checkbox" id="kc-phone"> Permitir pedir canciones desde el celular</label>
      <p class="muted small" style="margin:4px 0 0">Se abre y se cierra solo según el horario del local (Kennedy: jue a sáb 21:45–00:30 · Frida: vie y sáb 18:30–00:00 · Tobalaba: vie 21:00–22:10). Si lo cambias a mano, vale hasta que pasan 30 minutos sin pedidos.</p>
      <p class="muted small" id="kc-note" style="margin-top:10px"></p>
    </div>
    ${light ? `<div class="panel" id="kc-lb"></div>${staff ? '' : '<p class="back"><a href="#/light">← Salas light</a></p>'}` : activitiesNav('karaoke')}`;
  if (staff) $('#kc-phone').closest('label').hidden = true; // permitir pedidos desde el celular: solo el moderador
  const stopBar = light && views.lightBar ? views.lightBar($('#kc-lt'), $('#kc-lb'), light, staff) : null;
  if (!light) await api('POST', '/api/stage', { show: 'karaoke' }).catch(fail); // al entrar, el karaoke pasa a la pantalla
  let last = '';
  let k = null; // lo último que se mostró (la lista del servidor, o con los cambios recién tocados)
  const queue = []; // cambios tocados que todavía se están guardando en Google, en orden
  // Dibuja la lista. Los botones siguen activos mientras se guarda: los cambios se guardan uno tras otro.
  const render = () => {
    if (!k || !$('#kc-list')) return;
    $('#kc-title').textContent = light ? '🎤 Lista del karaoke' : `Karaoke ${k.name}`;
    $('#kc-sub').textContent = queue.length ? 'Guardando en la planilla…' : k.stale ? 'No se pudo leer la lista; se muestra la última conocida' : k.total ? `${k.total} ${k.total === 1 ? 'pedido' : 'pedidos'} por cantar` : 'Todavía no hay pedidos';
    $('#kc-phone').checked = !!k.phone;
    $('#kc-sung-box').hidden = !k.edit;
    $('#kc-note').textContent = k.edit ? '«Ya cantó», Subir y Bajar también se pueden usar en la app del equipo.' : 'El orden y «Ya cantó» se manejan en la app del equipo. Esta pantalla solo muestra la lista.';
    const n = k.list.length;
    $('#kc-list').innerHTML = n ? k.list.map((p, i) => `<div class="kc-row ${i === 0 ? 'now' : ''}"><em>${i === 0 ? '🎤' : i + 1}</em><p><small>${i === 0 ? 'Ahora canta' : i === 1 ? 'Sigue' : ''}</small><b>${esc(p.name)}</b><span>${esc(p.song)}${p.artist ? ` · ${esc(p.artist)}` : ''}</span></p>${k.edit && p.id ? `<div class="kc-act">
        <button type="button" class="kc-up" data-kc="subir" data-id="${esc(p.id)}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">▲</button><button type="button" class="kc-down" data-kc="bajar" data-id="${esc(p.id)}" ${i === n - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar">▼</button><button type="button" class="kc-done" data-kc="cantado" data-id="${esc(p.id)}">Ya cantó</button></div>` : ''}</div>`).join('')
      : '<p class="muted">Cuando alguien pida una canción, aparecerá aquí.</p>';
  };
  const paint = async () => {
    if (queue.length) return; // mientras se guarda, se deja lo que se tocó (la lista del servidor aún no lo trae)
    const r = await api('GET', `/api/karaoke/cola${lq}`).catch(() => null);
    if (!r || !$('#kc-list') || queue.length) return;
    const sig = JSON.stringify(r);
    if (sig === last) return;
    last = sig;
    k = r;
    render();
    if (k.edit && sungOpen) paintSung(); // si la lista cambió (también desde AppSheet), «Ya cantaron» se pone al día
  };
  // Aplica el cambio en pantalla al instante
  const applyLocal = (accion, id) => {
    const list = [...k.list];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    if (accion === 'cantado') list.splice(i, 1);
    else {
      const j = accion === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return false;
      [list[i], list[j]] = [list[j], list[i]];
    }
    k = { ...k, list, total: accion === 'cantado' ? Math.max(0, k.total - 1) : k.total };
    return true;
  };
  // Guarda los cambios en orden. Si Google rechaza uno, se descartan los que venían detrás y se vuelve a la lista real.
  let saving = false;
  const drain = async () => {
    if (saving) return;
    saving = true;
    while (queue.length) {
      const job = queue[0];
      try {
        await api('POST', '/api/karaoke/accion', { ...job, local: light || undefined });
        if (job.accion === 'cantado') toast('Marcado: ya cantó');
        queue.shift();
      } catch (err) {
        queue.length = 0;
        // Aviso claro (pedido de Cote, 21 nov): el cambio no quedó en la planilla y el pedido vuelve a la lista
        fail(new Error(`${job.accion === 'cantado' ? '«Ya cantó»' : 'El cambio'} NO quedó guardado en la planilla: ${err.message} Vuelve a apretarlo.`));
      }
    }
    saving = false;
    last = '';
    render();
    paint();
    paintSung(); // los recién marcados aparecen en «Ya cantaron»
  };
  $('#kc-list').onclick = (e) => {
    const btn = e.target.closest('[data-kc]');
    if (!btn || !k) return;
    if (!applyLocal(btn.dataset.kc, btn.dataset.id)) return;
    queue.push({ accion: btn.dataset.kc, id: btn.dataset.id });
    render();
    drain();
  };
  // «Ya cantaron»: las marcas de esta noche, para revisar y deshacer un error (igual que «Volver» en AppSheet)
  let sungOpen = true; // a la vista por defecto; se puede esconder
  const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' }) : '');
  const paintSung = async () => {
    if (!sungOpen) { $('#kc-sung').innerHTML = ''; $('#kc-sung-btn').textContent = '✓ Ya cantaron'; return; }
    $('#kc-sung-btn').textContent = '✓ Ya cantaron · ocultar';
    if (!$('#kc-sung').innerHTML) $('#kc-sung').innerHTML = '<p class="muted small">Cargando…</p>';
    try {
      const r = await api('GET', `/api/karaoke/cantados${lq}`);
      if (!sungOpen || !$('#kc-sung')) return;
      $('#kc-sung').innerHTML = r.list.length ? r.list.map((x) => `<div class="kc-row kc-sung-row"><em>✓</em><p><small>${x.at ? `Marcado a las ${esc(hhmm(x.at))}` : ''}</small><b>${esc(x.text)}</b></p><div class="kc-act"><button type="button" class="kc-back" data-fila="${x.fila}" data-key="${esc(x.key)}">Volver a la lista</button></div></div>`).join('')
        : '<p class="muted small">Esta noche todavía nadie aparece como «ya cantó».</p>';
    } catch (err) { if ($('#kc-sung')) $('#kc-sung').innerHTML = `<p class="muted small">⚠️ ${esc(err.message)}</p>`; }
  };
  $('#kc-sung-btn').onclick = () => { sungOpen = !sungOpen; paintSung(); };
  $('#kc-sung').onclick = async (e) => {
    const btn = e.target.closest('[data-fila]');
    if (!btn || queue.length || btn.disabled) return;
    $('#kc-sung').querySelectorAll('[data-fila]').forEach((x) => { x.disabled = true; });
    btn.closest('.kc-row').style.opacity = '.4'; // se ve al instante que se está devolviendo
    try { await api('POST', '/api/karaoke/volver', { fila: Number(btn.dataset.fila), key: btn.dataset.key, local: light || undefined }); toast('Volvió a la lista'); } catch (err) { fail(err); }
    last = '';
    paint();
    paintSung();
  };
  $('#kc-phone').onchange = async (e) => { try { await api('POST', '/api/karaoke/config', { phone: e.target.checked, local: light || undefined }); last = ''; paint(); } catch (err) { fail(err); } };
  await paint();
  if (k && k.edit) paintSung();
  const timer = setInterval(paint, 3000);
  return () => { clearInterval(timer); if (stopBar) stopBar(); };
};

// Menú de abajo en el panel de todos los juegos (pedido de Cote): «Sortear juego» y después los juegos con su ícono;
// más abajo, las demás actividades
const GAME_INFO = (venue) => ({
  bingo: { icon: '🎱', name: 'Bingo', href: '' },
  rosco: { icon: '🎡', name: 'El Rosco', href: '#/sorteoctl' },
  festival: { icon: '🎤', name: `El Festival de ${{ frida: 'Frida', kennedy: 'Kennedy', tobalaba: 'Tobalaba' }[venue] || 'Frida'}`, href: '#/votoctl/festival' },
  objeto: { icon: '🗳️', name: 'El objeto más extraño', href: '#/votoctl/objeto' },
});
function activitiesNav(current) {
  const games = [
    ['bingo', '<button type="button" data-back-bingo data-game="bingo"><span>🎱</span>Bingo</button>'],
    ['rosco', '<a class="btn" data-game="rosco" href="#/sorteoctl"><span>🎡</span>El Rosco</a>'],
    ['festival', '<a class="btn" data-game="festival" href="#/votoctl/festival"><span>🎤</span><b class="g-fest">El Festival</b></a>'],
    ['objeto', '<a class="btn" data-game="objeto" href="#/votoctl/objeto"><span>🗳️</span>El objeto más extraño</a>'],
  ];
  const more = [
    ['show', '<a class="btn" href="#/showctl"><span>⭐</span>Show</a>'],
    ['karaoke', '<a class="btn" href="#/karaokectl"><span>🎤</span>Karaoke</a>'],
    ['insta', '<a class="btn" href="#/instactl"><span>📸</span>Instagram</a>'],
    ['qr', '<button type="button" data-stage-qr><span>📱</span>QR en pantalla completa</button>'],
  ];
  setTimeout(paintGameNav, 0);
  return `<div class="act-nav games-nav ${navFoldState() ? 'g-folded' : ''}"><button type="button" class="g-unfold" data-nav-unfold>▸ Ver otros juegos y actividades</button>
    <div class="g-tabs" role="tablist"><button type="button" role="tab" data-draw-mode="draw">🎲 Sortear juegos</button><button type="button" role="tab" data-draw-mode="free">👆 Elegir libremente</button></div>
    <p class="g-free-title">👆 Toca el siguiente juego</p><div class="g-plan"><div class="g-slots"></div><label>¿Cuántos juegos vamos a sortear?<input type="number" class="g-total" min="1" max="10" value="3"></label></div>
    <button type="button" class="primary big g-draw" data-game-draw>🎲 Sortear juego</button>
    <button type="button" class="g-undo" data-game-undo disabled>↩️ Deshacer</button>
    <p class="g-direct" hidden>…o toca un juego para elegirlo directo, sin tómbola</p>
    <small>Juegos</small><div>${games.map(([k, h]) => (k === current ? h.replace(/data-game="/, 'aria-current="true" data-game="') : h)).join('')}</div>
    <small>Otras actividades</small><div>${more.filter(([k]) => k !== current).map(([, h]) => h).join('')}</div></div>`;
}
// Pedido de Cote (20 nov): mientras hay un juego en curso, el menú de juegos y actividades queda plegado, para no
// apretar otro por error; «Ver otros juegos y actividades» lo abre. Cada panel avisa si su juego está en curso.
let navInGame = null; let navOpened = false;
const navFoldState = () => !!navInGame && !navOpened;
window.setNavFold = (inGame) => {
  if (inGame !== navInGame) { navInGame = inGame; navOpened = false; }
  document.querySelectorAll('.games-nav').forEach((n) => n.classList.toggle('g-folded', navFoldState()));
};
window.addEventListener('hashchange', () => { navInGame = null; navOpened = false; });
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-nav-unfold]')) return;
  navOpened = true;
  document.querySelectorAll('.games-nav').forEach((n) => n.classList.remove('g-folded'));
});
// Marca en el menú los juegos que ya salieron en el sorteo (quedan fuera del sorteo hasta que salgan los demás)
async function paintGameNav() {
  const g = await api('GET', '/api/gamedraw').catch(() => null);
  if (!g) return;
  const info = GAME_INFO(g.venue);
  document.querySelectorAll('.g-fest').forEach((b) => { b.textContent = info.festival.name; });
  document.querySelectorAll('[data-game]').forEach((el) => { const done = !g.free && g.played.includes(el.dataset.game); el.classList.toggle('g-played', done); el.title = done ? 'Salió en el último sorteo: queda fuera del próximo' : ''; });
  // Casilleros de la noche y botón: «Sortear el 2.º juego (de 3)»; al completar, se desactiva
  document.querySelectorAll('.g-total').forEach((i) => { if (document.activeElement !== i) i.value = g.total; });
  const slots = []; // la noche ya no parte con un bingo (pedido de Cote, 21 nov): 1.º, 2.º, 3.º…
  for (let i = 0; i < g.total; i++) slots.push(g.list[i] ? `<span class="done">${i + 1}.º · ${info[g.list[i]].icon} ${esc(info[g.list[i]].name)}</span>` : `<span>${i + 1}.º · 🔒</span>`);
  document.querySelectorAll('.g-slots').forEach((el) => { el.innerHTML = slots.join(''); });
  const full = g.list.length >= g.total;
  const ready = !g.free && !full && !!g.ready && (!g.last || g.ready.at > g.last.at);
  // Pedido de Cote (20 nov): cuántos juegos y sus números se ven solo antes de empezar el sorteo; después se ocultan
  document.querySelectorAll('.g-plan').forEach((el) => { el.hidden = g.list.length > 0 || ready; });
  window.gameDrawReady = ready;
  document.querySelectorAll('.games-nav').forEach((n) => { n.classList.toggle('g-ready', ready); n.classList.toggle('g-free', !!g.free); });
  // Pestañas «Sortear juegos» / «Elegir libremente» (pedido de Cote, 21 nov)
  document.querySelectorAll('[data-draw-mode]').forEach((b) => { const on = (b.dataset.drawMode === 'free') === !!g.free; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  document.querySelectorAll('[data-game-draw]').forEach((b) => { b.disabled = full; b.textContent = full ? `✔ Ya se sortearon los ${g.total} juegos` : ready ? `🎰 Girar la tómbola · ${g.list.length + 1}.º juego` : `🎲 Iniciar sorteo del ${g.list.length + 1}.º juego (de ${g.total})`; });
  document.querySelectorAll('.g-direct').forEach((el) => { el.hidden = !ready; });
  document.querySelectorAll('[data-game-undo]').forEach((b) => { b.disabled = !g.undoable; });
}
document.addEventListener('change', async (e) => {
  if (!e.target.classList || !e.target.classList.contains('g-total')) return;
  try { await api('POST', '/api/gamedraw/total', { total: e.target.value }); } catch (err) { fail(err); }
  paintGameNav();
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-game-draw]');
  if (!b || b.disabled) return;
  b.disabled = true;
  try {
    if (!window.gameDrawReady) { // primer clic: las pantallas muestran los juegos que pueden salir
      await api('POST', '/api/gamedraw/ready');
      toast('En pantalla: los juegos que pueden salir. Ahora gira la tómbola o elige un juego directo.');
      await paintGameNav();
      return;
    }
    const g = await api('POST', '/api/gamedraw');
    window.gameDrawReady = false;
    const info = GAME_INFO((await api('GET', '/api/gamedraw')).venue)[g.last.game];
    toast(`🎲 Se está sorteando en pantalla… Salió: ${info.icon} ${info.name}`);
    window.gameDrawGo = setTimeout(() => { if (g.last.game === 'bingo') backToBingo(); else location.hash = info.href; }, 6000); // cuando termina la tómbola en pantalla, el panel pasa a ese juego
  } catch (err) { fail(err); b.disabled = false; }
});
// Pestañas del menú de juegos: «Sortear juegos» o «Elegir libremente» (pedido de Cote, 21 nov)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-draw-mode]');
  if (!b || b.classList.contains('on')) return; // la pestaña que ya está elegida no hace nada
  const free = b.dataset.drawMode === 'free';
  clearTimeout(window.gameDrawGo);
  // Se marca al instante (sin esperar al servidor), para que no quede un sorteo a medio empezar a un toque
  if (free) window.gameDrawReady = false;
  document.querySelectorAll('.games-nav').forEach((n) => n.classList.toggle('g-free', free));
  document.querySelectorAll('[data-draw-mode]').forEach((x) => x.classList.toggle('on', (x.dataset.drawMode === 'free') === free));
  try { await api('POST', '/api/gamedraw/mode', { free }); } catch (err) { fail(err); }
  paintGameNav();
});
// Deshacer (pedido de Cote): vuelve el sorteo de juegos al paso anterior (antes de «Iniciar sorteo», de la tómbola
// o de elegir un juego directo)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-game-undo]');
  if (!b || b.disabled) return;
  b.disabled = true;
  clearTimeout(window.gameDrawGo); // si la tómbola recién giró, el panel ya no pasa a ese juego
  try { await api('POST', '/api/gamedraw/undo'); toast('↩️ Sorteo de juegos: se volvió al paso anterior'); } catch (err) { fail(err); }
  paintGameNav();
});
// Elegir un juego directo (pedido de Cote): después de «Iniciar sorteo de juegos», tocar un juego del menú lo deja como
// el siguiente de la noche, sin tómbola; el panel pasa a ese juego
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.games-nav [data-game]');
  if (!el) return;
  // «Elegir libremente»: el juego empieza de cero, sin número de la noche, y el panel pasa a él
  const nav = el.closest('.games-nav');
  if (nav && nav.classList.contains('g-free')) {
    e.preventDefault(); e.stopImmediatePropagation();
    try { await api('POST', '/api/gamedraw/free', { game: el.dataset.game }); } catch (err) { fail(err); return; }
    if (el.dataset.game === 'bingo') backToBingo(); else location.hash = el.getAttribute('href');
    return;
  }
  if (!window.gameDrawReady) return;
  e.preventDefault(); e.stopImmediatePropagation();
  try {
    const g = await api('POST', '/api/gamedraw/pick', { game: el.dataset.game });
    window.gameDrawReady = false;
    const info = GAME_INFO((await api('GET', '/api/gamedraw')).venue)[g.last.game];
    toast(`Siguiente juego: ${info.icon} ${info.name}`);
    if (g.last.game === 'bingo') backToBingo(); else location.hash = info.href;
  } catch (err) { fail(err); }
}, true);
const BACK_BINGO = activitiesNav('rosco');
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
        if (ready && i === g.list.length) { cells.push(`<span class="now"><small>${i + 1}.º juego</small>🎲 …</span>`); continue; }
        const k = g.list[i]; const cur = !ready && i === g.list.length - 1;
        cells.push(!k ? `<span class="todo"><small>${i + 1}.º juego</small>🔒</span>`
          : cur ? `<span class="${rolling ? 'now' : 'on'}"><small>${i + 1}.º juego</small>${rolling ? '🎲 …' : `${info[k].icon} ${esc(info[k].name)}`}</span>`
            : `<span class="done"><small>${i + 1}.º juego</small>${info[k].icon} ${esc(info[k].name)}</span>`);
      }
      return `<div class="jd-list jd-slots">${cells.join('')}</div>`;
    };
    if (ready) {
      // paso 1: los juegos que pueden salir
      box.innerHTML = `<div class="jd-card"><small>🎲 Sorteo del ${g.list.length + 1}.º juego</small><div class="jd-opts">${g.ready.pool.map((k) => `<span>${info[k].icon} ${esc(info[k].name)}</span>`).join('')}</div>${listOf(true)}</div>`;
      fitJd(); // en una sola línea, centrado y dentro del cuadro
      return;
    }
    const win = info[g.last.game];
    const pool = g.last.pool.map((k) => info[k]);
    const nth = `${g.list.length}.º juego`;
    const left = g.last.direct ? 0 : ROLL_MS - (Date.now() + (g.offset || 0) - g.last.at); // elegido directo: sin tómbola
    if (left > 0) {
      // tómbola: pasan los juegos disponibles cada vez más lento
      box.innerHTML = `<div class="jd-card"><small>🎲 Sorteo del ${nth}</small><b class="jd-roll"></b>${listOf(true)}</div>`;
      let i = 0; let wait = 70;
      fitJd();
      const spin = () => { if (!alive || !$('.jd-roll')) return; const x = pool[i++ % pool.length]; $('.jd-roll').textContent = `${x.icon} ${x.name}`; fitText($('.jd-roll')); wait *= 1.13; if (Date.now() + (g.offset || 0) - g.last.at < ROLL_MS - 200) timer = setTimeout(spin, wait); else paintWin(); };
      const paintWin = () => { if (alive) paint({ ...g, last: { ...g.last, at: g.last.at - ROLL_MS } }); };
      spin();
      return;
    }
    box.innerHTML = `<div class="jd-card won"><small>🎲 El ${nth} es</small><b class="jd-win">${win.icon} ${esc(win.name)}</b>${listOf(false)}</div>`;
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
  const poll = setInterval(tick, 2000);
  return () => { alive = false; clearTimeout(timer); clearInterval(poll); };
};
document.addEventListener('click', (e) => { if (e.target.closest('[data-back-bingo]')) backToBingo(); });
// «QR en pantalla completa» desde cualquier panel: lo pone en OBS y en el tablero sin salir de donde estás
document.addEventListener('click', async (e) => {
  if (!e.target.closest('[data-stage-qr]')) return;
  try { await api('POST', '/api/stage', { show: 'qr' }); toast('QR en pantalla completa'); } catch (err) { fail(err); }
});

// El QR siempre es para entrar a la sala. Las gráficas que no traen el suyo (sorteo, rosco y show)
// reciben este, en la esquina que cada una tiene libre. Sin lugar indicado, se retira.
function joinQr(spot) {
  let el = document.getElementById('join-qr');
  if (!spot) { if (el) el.remove(); return; }
  // Pedido de Cote: el recuadro blanco no se ensancha por la frase; el ancho es el del QR y la frase va en dos líneas
  // centradas («Escanea el código QR» / «con tu celular»), con la letra justa para caber
  if (!el) { el = document.createElement('div'); el.id = 'join-qr'; el.innerHTML = `${qr(joinUrl())}<b><span>Escanea el código QR</span><span>con tu celular</span></b>`; document.body.appendChild(el); }
  el.className = `join-qr ${spot}`;
  fitJoinQr();
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
  const apply = async () => {
    if (busy) return;
    busy = true;
    try {
      const show = (await api('GET', '/api/stage').catch(() => ({}))).show || current || 'none';
      if (show !== current) {
        current = show;
        if (typeof stop === 'function') stop();
        stop = null;
        app.innerHTML = '';
        if (show === 'bingo') stop = await views.gc();
        else if (show === 'rueda') stop = await views.obs();
        else if (show === 'sorteo') stop = await views.sorteo();
        else if (show === 'qr') stop = await views.qrBig();
        else if (show === 'karaoke') stop = await views.karaokeGC();
        else if (show === 'voto') stop = await views.votoGC();
        else if (show === 'juego') stop = await views.juegoDraw('gc');
        else if (show === 'insta') stop = await views.instaGC();
        else if (show === 'show') stop = await views.showGC();
        joinQr({ sorteo: 'br', rueda: 'bl', show: 'above' }[show]);
        document.body.classList.add('obs');
      }
    } finally { busy = false; }
  };
  await apply();
  const timer = setInterval(apply, 2000);
  return () => { clearInterval(timer); if (typeof stop === 'function') stop(); joinQr(); document.body.classList.remove('obs'); };
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

// ---------- Enrutador ----------
let cleanup = null;
async function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  app.onclick = null;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const screen = !arg && (name === 'gc' || name === 'obs') ? 'escena' : name;
  const view = views[screen || 'home'] || views.home;
  window.scrollTo(0, 0);
  try { cleanup = await view(arg); } catch (e) {
    if (e.status === 401) return viewLogin(); // pantallas de moderador sin sesión iniciada
    app.innerHTML = `<div class="panel"><h1>No se pudo abrir esta página</h1><p>${esc(e.message)}</p><a class="btn primary" href="#/">Volver al inicio</a></div>`;
  }
}
window.addEventListener('hashchange', route);
// Arranca cuando ya cargaron los archivos de todos los juegos
window.addEventListener('DOMContentLoaded', route);

// Logo del local en las pantallas de sus actividades (pedido de Cote: el de Mercado Kennedy, siempre en las
// actividades de Kennedy). Solo en pantallas (tablero, OBS, GC de la sala light, karaoke de la pantalla vertical),
// nunca en celulares ni paneles. El local sale de la dirección (#/light-gc/kennedy) o de la sala completa abierta.
const VENUE_LOGOS = { kennedy: 'logo-kennedy.png' };
const SCREEN_ROUTES = ['tablero', 'escena', 'gc', 'obs', 'light-gc', 'karaoke-v', 'light-v'];
let venueOfSala = '';
let venueAt = 0;
// Color de fondo de las pantallas según el local (también en navegadores antiguos, que no leen «:has»)
const VENUE_BG = { tobalaba: '#2a0608', kennedy: '#06183a', frida: '#1b0f3a' };
function paintVenueBg() {
  const full = document.body.classList.contains('full');
  const bg = full ? VENUE_BG[document.body.dataset.venue] || VENUE_BG.frida : '';
  if (document.documentElement.style.backgroundColor !== bg) document.documentElement.style.backgroundColor = bg;
}
new MutationObserver(paintVenueBg).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-venue'] });
async function syncVenueMark() {
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  let v = '';
  if (SCREEN_ROUTES.includes(name)) {
    if ((name === 'light-gc' || name === 'karaoke-v' || name === 'light-v') && arg) v = arg;
    else {
      if (Date.now() - venueAt > 10000) { venueAt = Date.now(); venueOfSala = (((await api('GET', '/api/current').catch(() => ({}))).sessions || [])[0] || {}).theme || ''; }
      v = venueOfSala;
    }
  }
  // El fondo de las pantallas toma los colores del local (pedido de Cote: que el GC y la pantalla vertical combinen)
  if ((document.body.dataset.venue || '') !== v) document.body.dataset.venue = v;
  paintVenueBg();
  let el = document.getElementById('venue-mark');
  const src = VENUE_LOGOS[v];
  if (!src) { if (el) el.remove(); document.body.classList.remove('has-vm'); return; }
  // Los dos logos juntos y al mismo alto, separados por una línea: KRB Stage | Mercado Kennedy
  if (!el) { el = document.createElement('div'); el.id = 'venue-mark'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  if (el.dataset.src !== src) { el.dataset.src = src; el.innerHTML = `<img src="krb-stage.svg" alt=""><i></i><img src="${src}" alt="">`; }
  // Dónde va: en el tablero, en una franja abajo que se le deja libre; en OBS, arriba a la derecha (en el bingo, sobre la bolita)
  const spot = document.body.classList.contains('full') ? 'full' : document.getElementById('gc') ? 'obs-bingo' : 'obs';
  el.className = `venue-mark vm-${spot}`;
  document.body.classList.add('has-vm');
}
window.addEventListener('hashchange', () => { setTimeout(syncVenueMark, 50); setTimeout(syncVenueMark, 700); }); // la segunda, cuando la pantalla ya se armó
setInterval(syncVenueMark, 3000);
syncVenueMark();
setTimeout(syncVenueMark, 700);

// Fondo de neuronas en las pantallas de las actividades (pedido de Cote: el mismo efecto del fondo de la página
// web krbstage.cl). Puntos de colores que se mueven lento, unidos por líneas finas, con impulsos que viajan
// de un punto a otro cercano. Va encima del fondo de colores y debajo de todo lo demás; solo en el tablero.
// Aviso de KRB Kids (pedido de Cote): en las pantallas del local (no en el GC de OBS ni en los celulares) aparece cada
// 10 minutos durante 12 segundos «KRB Kids · Juegos para niños dentro de la plataforma»
(() => {
  const EVERY_MS = 900000; const SHOW_MS = 12000; // cada 15 minutos (pedido de Cote, 20 nov)
  const word = [...'KRB Kids'].map((ch, i) => (ch === ' ' ? ' ' : `<i style="color:${['#ff5fa2', '#ffbe0b', '#2bb24c', '#3a86ff', '#ff5fa2', '#ffbe0b', '#2bb24c', '#3a86ff'][i % 8]}">${ch}</i>`)).join('');
  const show = () => {
    if (!document.body.classList.contains('full') || /^#\/kids/.test(location.hash)) return;
    let el = document.getElementById('kids-ad');
    if (!el) { el = document.createElement('div'); el.id = 'kids-ad'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = `<span class="ka-balloons">🎈🎈</span><b>${word}</b><small>Juegos para niños dentro de la plataforma</small>`; document.body.appendChild(el); }
    place(el);
    el.classList.add('on');
    setTimeout(() => el.classList.remove('on'), SHOW_MS);
  };
  // Pedido de Cote: el aviso va en un lugar libre de la pantalla, sin tapar nada. Se buscan en toda la pantalla los
  // espacios sin textos, imágenes, QR, videos ni recuadros; si no hay espacio para el aviso ancho, se prueba en columna
  // (para los costados) y más chico. Si en ninguna parte cabe sin tapar, va donde tape menos.
  const content = (ad) => {
    const out = []; const W = window.innerWidth; const H = window.innerHeight;
    const ok = (el) => { if (!el || ad.contains(el) || el.id === 'neural-bg') return false; if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.opacity !== '0' && el.getClientRects().length > 0; };
    // peso: tapar textos, imágenes, QR y videos es mucho peor que tapar el fondo vacío de un recuadro
    const add = (r, k) => { if (r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < W && r.top < H) out.push({ l: r.left - 8, t: r.top - 8, r: r.right + 8, b: r.bottom + 8, k }); };
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const rg = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.nodeValue.trim() || !ok(n.parentElement)) continue;
      rg.selectNodeContents(n); add(rg.getBoundingClientRect(), 30);
    }
    document.querySelectorAll('body *').forEach((el) => {
      if (el.parentElement && el.parentElement.closest('svg')) return;
      const media = /^(IMG|SVG|CANVAS|VIDEO|IFRAME|INPUT|BUTTON)$/i.test(el.tagName);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || (!media && r.width * r.height > W * H * 0.85)) return; // los fondos de toda la pantalla no cuentan
      if (!media) { const cs = getComputedStyle(el); const bg = cs.backgroundImage !== 'none' || !/rgba\(.*,\s*0\)|transparent/.test(cs.backgroundColor); const bd = parseFloat(cs.borderTopWidth) > 0 && !/rgba\(.*,\s*0\)|transparent/.test(cs.borderTopColor); if (!bg && !bd) return; }
      if (ok(el)) add(r, media ? 30 : 1);
    });
    return out;
  };
  const place = (el) => {
    const W = window.innerWidth; const H = window.innerHeight; const mx = W * 0.015; const my = H * 0.02;
    const rects = content(el);
    const hitAt = (x, y, w, h) => { let hit = 0; for (const r of rects) { const ix = Math.min(x + w, r.r) - Math.max(x, r.l); const iy = Math.min(y + h, r.b) - Math.max(y, r.t); if (ix > 0 && iy > 0) hit += ix * iy * r.k; } return hit; };
    let best = null;
    for (const v of [['ka-tall', 1], ['ka-tall', 0.8], ['ka-tall', 0.62], ['ka-tall', 0.5]]) { // siempre centrado con la imagen (pedido de Cote)
      el.classList.toggle('ka-tall', v[0] === 'ka-tall'); el.style.setProperty('--ka-s', v[1]);
      const w = el.offsetWidth * v[1]; const h = el.offsetHeight * v[1];
      if (w > W - 2 * mx || h > H - 2 * my) continue;
      const step = Math.max(6, Math.min(W, H) / 60);
      for (let y = my; y <= H - h - my + 0.5; y += step) {
        for (let x = mx; x <= W - w - mx + 0.5; x += step) {
          // primero lo que menos tapa; a igualdad, pegado a un borde (mejor abajo) y del tamaño más grande
          const hit = hitAt(x, y, w, h);
          const edge = Math.min(x - mx, W - w - mx - x, (y - my) * 1.5, H - h - my - y);
          const sc = hit * 10 + edge;
          if (!best || sc < best.sc) best = { sc, hit, x, y, v };
        }
      }
      if (best && best.hit === 0) break; // cabe sin tapar nada: listo
    }
    if (!best) return;
    el.classList.toggle('ka-tall', best.v[0] === 'ka-tall'); el.style.setProperty('--ka-s', best.v[1]);
    el.style.left = `${Math.round(best.x)}px`; el.style.top = `${Math.round(best.y)}px`; el.style.bottom = 'auto';
    el.classList.toggle('ka-top', best.y < H / 3);
  };
  setTimeout(() => { show(); setInterval(show, EVERY_MS); }, 60000); // el primero al minuto de abrir la pantalla
})();
const neuralBg = (() => {
  // Pedido de Cote (20 nov): el efecto de neuronas de krbstage.cl, más visible y con los colores del local, de fondo en las
  // pantallas (body.full) y, en el GC de OBS (body.obs), solo dentro de los recuadros (nunca sobre la cámara ni sobre el QR).
  // Se dibuja en el aparato que muestra la pantalla (no en el servidor), a 30 cuadros por segundo como máximo, y con menos
  // puntos en aparatos con poca memoria (decodificadores).
  const PALETTES = {
    frida: ['#47b8e6', '#e0338f', '#e5413a', '#f3eee6', '#f4bf5a'],
    tobalaba: ['#ff4d4d', '#ff9a3d', '#ffd166', '#f3eee6', '#e8262e'],
    kennedy: ['#35c6ff', '#1487cf', '#7fdcff', '#f3eee6', '#f4bf5a'],
  };
  // Recuadros de los GC donde va el efecto; los QR quedan siempre limpios
  const BOXES = '.gc-top, .gc-bottom, .gc-people, .gc-draw, .gc-figure, .obs-player, .obs-question, .obs-rank, .rosco-winlow, .lg-card, .kg-tag, .kg-now, .kg-next, .sg-tag, .sg-main, .vg-tag, .vg-main, .vg-side, .vg-list, .vg-duel';
  const NO_FX = '.gc-qr, .kg-qr, .vg-qr, .lg-qrbox, .qr';
  const weak = (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);
  let c = null; let x = null; let mode = ''; let W = 0; let H = 0; let k = 1; let pts = []; let pulses = []; let raf = 0; let last = 0;
  let colors = PALETTES.frida; let boxes = []; let holes = []; let boxesAt = 0;
  const build = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight; c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    k = Math.max(1, Math.min(W, H) / 700); // más grande que antes (pedido de Cote)
    // Pocos destellos a la vez, repartidos (pedido de Cote: uno acá, otro abajo, otro arriba; no cientos, que se ve sucio)
    let n = Math.round(Math.min(18, (W * H) / (60000 * k * k)));
    if (mode === 'gc') n = Math.round(n * 2); // en el GC solo se ven los que caen dentro de los recuadros
    if (weak) n = Math.round(n * 0.55);
    pts = Array.from({ length: n }, () => spawn(true));
    pulses = [];
  };
  // Cada neurona aparece, dura unos segundos y se desvanece; después nace otra en otro lugar (pedido de Cote: que no
  // quede como telaraña fija)
  const LIFE = [30, 60]; // en cuadros (a 30 por segundo: 1 a 2 segundos, fugaces: pedido de Cote)
  const spawn = (anyAge) => {
    const life = LIFE[0] + Math.random() * (LIFE[1] - LIFE[0]);
    return { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.5 * k, vy: (Math.random() - 0.5) * 0.5 * k, c: Math.floor(Math.random() * 5), life, age: anyAge ? Math.random() * life : 0 };
  };
  const alphaOf = (a) => { const f = a.age / a.life; return f < 0.2 ? f / 0.2 : f > 0.75 ? Math.max(0, (1 - f) / 0.25) : 1; };
  const readBoxes = () => {
    boxes = Array.from(document.querySelectorAll(BOXES)).map((e) => ({ r: e.getBoundingClientRect(), rad: parseFloat(getComputedStyle(e).borderRadius) || 0 })).filter((b) => b.r.width > 0 && b.r.height > 0);
    holes = Array.from(document.querySelectorAll(NO_FX)).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    boxesAt = Date.now();
  };
  const path = (r, rad) => { if (x.roundRect) x.roundRect(r.left, r.top, r.width, r.height, Math.min(rad, r.height / 2)); else x.rect(r.left, r.top, r.width, r.height); };
  const draw = () => {
    const R = 200 * k;
    x.clearRect(0, 0, W, H);
    if (mode === 'gc') {
      if (Date.now() - boxesAt > 600) readBoxes();
      if (!boxes.length) return;
      x.save(); x.beginPath(); for (const b of boxes) path(b.r, b.rad); x.clip();
    }
    x.lineWidth = 2.2 * k;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < R) { x.strokeStyle = `rgba(243,238,230,${(1 - d / R) * (mode === 'gc' ? 0.45 : 0.38) * Math.min(alphaOf(a), alphaOf(b))})`; x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke(); }
      }
    }
    for (const p of pulses) {
      const px = p.a.x + (p.b.x - p.a.x) * p.t; const py = p.a.y + (p.b.y - p.a.y) * p.t;
      x.globalAlpha = Math.min(alphaOf(p.a), alphaOf(p.b));
      x.strokeStyle = `${colors[p.a.c]}aa`; x.lineWidth = 3 * k; x.beginPath(); x.moveTo(p.a.x, p.a.y); x.lineTo(px, py); x.stroke();
      x.fillStyle = colors[p.a.c]; x.beginPath(); x.arc(px, py, 6.5 * k, 0, 7); x.fill();
      x.globalAlpha = 1;
    }
    for (const a of pts) { x.globalAlpha = 0.9 * alphaOf(a); x.fillStyle = colors[a.c]; x.beginPath(); x.arc(a.x, a.y, 5.5 * k, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    if (mode === 'gc') { x.restore(); for (const h of holes) x.clearRect(h.left - 2, h.top - 2, h.width + 4, h.height + 4); }
  };
  const newPulse = () => {
    if (!pts.length) return;
    const a = pts[Math.floor(Math.random() * pts.length)]; let best = null; let dm = 1e9;
    for (const b of pts) { if (b === a) continue; const d = Math.hypot(a.x - b.x, a.y - b.y); if (d < dm && d > 30 * k) { dm = d; best = b; } }
    if (best) pulses.push({ a, b: best, t: 0 });
  };
  const step = (now) => {
    raf = 0;
    if (!c || document.hidden) return;
    raf = requestAnimationFrame(step);
    if (now - last < 33) return; // 30 cuadros por segundo como máximo
    last = now;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      a.x += a.vx; a.y += a.vy; if (a.x < 0 || a.x > W) a.vx *= -1; if (a.y < 0 || a.y > H) a.vy *= -1;
      if (++a.age >= a.life) pts[i] = spawn(false); // se desvaneció: nace otra en otro lugar
    }
    pulses = pulses.filter((p) => pts.includes(p.a) && pts.includes(p.b));
    if (Math.random() < 0.05 && pulses.length < 4) newPulse();
    for (const p of pulses) p.t += 0.03;
    pulses = pulses.filter((p) => p.t < 1);
    draw();
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; if (c) c.remove(); c = null; mode = ''; };
  const sync = () => {
    const cl = document.body.classList;
    const want = cl.contains('full') ? 'full' : cl.contains('obs') ? 'gc' : '';
    colors = PALETTES[document.body.dataset.venue] || PALETTES.frida;
    if (want === mode) return;
    stop();
    if (!want) return;
    mode = want;
    c = document.createElement('canvas'); c.id = 'neural-bg'; c.setAttribute('aria-hidden', 'true');
    if (mode === 'gc') c.className = 'neural-gc';
    document.body.insertBefore(c, document.body.firstChild);
    x = c.getContext('2d'); build();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { for (let i = 0; i < 10; i++) newPulse(); pulses.forEach((p, i) => { p.t = 0.3 + (i % 5) * 0.12; }); draw(); } else raf = requestAnimationFrame(step);
  };
  addEventListener('resize', () => { if (c) { build(); boxesAt = 0; draw(); } });
  document.addEventListener('visibilitychange', () => { if (c && !document.hidden && !raf && !matchMedia('(prefers-reduced-motion: reduce)').matches) raf = requestAnimationFrame(step); });
  new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class', 'data-venue'] });
  sync();
  return { sync };
})();

// Modo de revisión (solo con ?diag=1 en la dirección): un recuadro encima de todo con lo que el navegador ve por dentro
// (si la pantalla armó su contenido, su tamaño, estilos y errores). Sirve para revisar fallas en el iPhone desde una captura.
if (new URLSearchParams(location.search).has('diag')) {
  const errs = [];
  addEventListener('error', (e) => errs.push(String(e.message || e.type).slice(0, 120)));
  addEventListener('unhandledrejection', (e) => errs.push(`promesa: ${String((e.reason && e.reason.message) || e.reason).slice(0, 120)}`));
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:2147483647;margin:0;padding:8px;font:11px/1.35 monospace;background:rgba(255,255,255,.93);color:#000;white-space:pre-wrap;word-break:break-all;max-height:70vh;overflow:auto';
  const info = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return `${sel}: no existe`;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return `${sel}: ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} pos=${cs.position} z=${cs.zIndex} disp=${cs.display} op=${cs.opacity} vis=${cs.visibility} tr=${cs.transform} hijos=${el.children.length}`;
  };
  setInterval(() => {
    if (!box.isConnected) document.documentElement.appendChild(box);
    const c = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    box.textContent = [navigator.userAgent, `ventana ${innerWidth}x${innerHeight} · ${location.hash}`, `body: ${document.body.className}`,
      info('main'), info('#app'), info('#lv'), info('.lv-top'), info('.lv-card'), info('#neural-bg'),
      `al centro: ${c ? (c.id || c.className || c.tagName) : '-'}`, `texto: ${(document.getElementById('app') || {}).innerText ? document.getElementById('app').innerText.slice(0, 160).replace(/\s+/g, ' ') : '(vacío)'}`,
      `errores: ${errs.length ? errs.join(' | ') : 'ninguno'}`].join('\n');
  }, 1500);
}

// Pedido de Cote (20 nov): botoncito «Refrescar página» en todos los paneles del moderador (en la aplicación instalada
// no hay cómo recargar). El Centro de control ya lo trae en su encabezado.
(() => {
  const PANELS = /^#\/?($|juegos|figura|anfitrion|ronda|proyectos|nuevo|admin|votoctl|ruedactl|ruedas|sorteoctl|karaokectl|showctl|instactl|light$|consola|verticalctl)/;
  const sync = () => {
    let b = document.getElementById('ctl-reload-fixed');
    const on = PANELS.test(location.hash || '#/') && !document.body.classList.contains('full') && !document.body.classList.contains('obs') && !!store.get('adminToken');
    // Pedido de Cote (20 nov): abajo de cada panel, siempre, el enlace al Centro de control (no en el inicio ni en el
    // mismo Centro de control, que ya lo tienen)
    let home = document.getElementById('ctl-home-link');
    const homeOn = on && !/^#\/?($|control)/.test(location.hash || '#/');
    if (!homeOn && home) home.remove();
    if (homeOn && !home) { home = document.createElement('p'); home.id = 'ctl-home-link'; home.innerHTML = '<a class="home-control home-control-sm" href="#/control">🎛️ Centro de control</a>'; const appEl = document.getElementById('app'); appEl.parentNode.insertBefore(home, appEl.nextSibling); }
    if (!on) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('button'); b.id = 'ctl-reload-fixed'; b.type = 'button'; b.className = 'ctl-reload'; b.textContent = '↻ Refrescar'; b.onclick = () => location.reload(); document.body.appendChild(b); }
  };
  window.addEventListener('hashchange', () => setTimeout(sync, 300));
  setTimeout(sync, 600);
})();
