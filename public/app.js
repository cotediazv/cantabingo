/* global PATTERNS */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', 'x-admin': store.get('adminToken') || '' },
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
function patternPicker(selected = ['linea']) {
  return `<div class="patterns">${PATTERNS.list.map((p) => `<label class="pat">
    <input type="radio" name="pattern" value="${p.id}" ${selected[0] === p.id ? 'checked' : ''}>${miniHTML(p.id)}<span>${esc(p.name)}</span></label>`).join('')}</div>
    <p class="muted small" style="margin-top:8px">Un patrón por ronda: al elegir otro, el anterior se desmarca.</p>`;
}
function readPatterns(root) {
  const ids = $$('input[name=pattern]:checked', root).map((i) => i.value);
  if (ids.length !== 1) { toast('Elige el patrón de la ronda'); return null; }
  return ids;
}
let voiceOn = store.get('voice') !== '0';
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
const joinUrl = () => `${location.origin}${location.pathname}#/jugar`;
const boardUrl = () => `${location.origin}${location.pathname}#/tablero`;
const gcUrl = () => `${location.origin}${location.pathname}#/gc`;
const stageUrl = () => `${location.origin}${location.pathname}#/escena`;
const activeSessions = async () => (await api('GET', '/api/current').catch(() => ({}))).sessions || [];
// Resuelve el enlace fijo: sin sesiones espera, con una entra directo y con varias deja elegir.
// Devuelve { sid } para continuar o { cleanup } si ya dibujó la pantalla.
async function pickSession(kind) {
  const list = await activeSessions();
  if (!list.length) return { cleanup: waiting() };
  const mine = list.find((s) => store.get(`tok_${s.id}`)); // ya estaba jugando en una de ellas
  if (list.length === 1 || (kind === 'jugar' && mine)) return { sid: (mine || list[0]).id };
  app.innerHTML = `<div class="panel" style="max-width:520px;margin:6vh auto 0"><h1>Elige tu bingo</h1>
    <p class="muted">Hay ${list.length} partidas abiertas. Toca la que te indicó el moderador.</p>
    <div style="display:grid;gap:10px;margin-top:14px">${list.map((s) => `<a class="btn primary" style="text-align:center;padding:14px;font-size:1.1rem;border-radius:14px" href="#/${kind}/${s.id}">${esc(s.name)} ${s.locked ? '🔒' : ''}<br><span class="small" style="font-weight:400">Ronda ${s.round}</span></a>`).join('')}</div></div>`;
  return { cleanup: undefined };
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
  const last = store.get('lastBingo');
  const bingoHref = last ? `#/anfitrion/${last}` : '#/proyectos';
  app.innerHTML = `
    <div class="home">
      <h1>Sala de juegos</h1>
      <a class="home-create" href="#/nuevo"><span>🎮</span>Crear sala de juegos</a>
      <div class="home-steps">
        <a class="s1" href="${bingoHref}"><i>1</i><span>🎱</span><b>Bingo</b></a>
        <a class="s2" href="#/sorteoctl"><i>2</i><span>🎲</span><b>Sorteo</b></a>
        <a class="s3" href="#/ruedas"><i>3</i><span>🎡</span><b>El Rosco</b></a>
      </div>
      <a class="home-control" href="#/control">🎛️ Centro de control</a>
      <p style="margin-top:28px"><button id="logout">Cerrar sesión de moderador</button></p>
    </div>`;
  $('#logout').onclick = () => { store.del('adminToken'); route(); };
  return undefined;
};

// Centro de control: qué gráfica se ve en la pantalla de OBS
views.control = async () => {
  if (!(await isAdmin())) return viewLogin();
  app.innerHTML = `<p class="back"><a href="#/">← Inicio</a></p><h1>Centro de control</h1>
    <div class="panel">
      <h2>En pantalla</h2>
      <p class="muted small">La pantalla cambia sola al activar un bingo, lanzar un sorteo o cargar un rosco. Aquí puedes cambiarla a mano.</p>
      <div class="control-grid" id="stage">
        <button data-show="bingo"><span>🎱</span>Bingo</button><button data-show="sorteo"><span>🎲</span>Sorteo</button>
        <button data-show="rueda"><span>🎡</span>El Rosco</button><button data-show="none"><span>⬛</span>Nada</button>
      </div>
      <p class="small" style="margin-top:16px"><b>Enlace para OBS</b> (1920×1080, no pide usuario ni contraseña):<br><a class="link" href="${stageUrl()}" target="_blank">${esc(stageUrl())}</a></p>
    </div>`;
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
      <label class="f" id="pname-wrap" hidden>Nombre del bingo<input type="text" name="name" maxlength="60" value="El Bingo de Frida"></label>
      <label class="f" id="ptheme-wrap" hidden>Colores en pantalla<select id="ptheme">
        <option value="frida">Magenta (como Frida)</option><option value="tobalaba">Rojo (como Tobalaba)</option><option value="kennedy">Celeste azulado (como Kennedy)</option></select></label>
      <label class="f">Número de cartones <span class="hint">de 25 a 3.000</span><input type="number" name="count" min="25" max="3000" value="280" required></label>
      <div class="wide"><button class="primary big">Crear los cartones</button></div>
    </form>`;
  const f = $('#f');
  // Pestañas de local: cada una fija el nombre y los colores de la pantalla; «Otro nombre» deja elegirlos
  const VENUES = { frida: ['El Bingo de Frida', 'magenta'], tobalaba: ['El Bingo de Tobalaba', 'rojo'], kennedy: ['El Bingo de Kennedy', 'celeste azulado'] };
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
    try { const p = await api('POST', '/api/projects', body); location.hash = `#/anfitrion/${p.id}`; } catch (err) { fail(err); }
  };
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
async function hostConsole(p) {
  const sid = p.sessionId;
  store.set('lastBingo', p.id); // para el botón «Volver al bingo» del sorteo y del rosco
  const act = (action, body) => api('POST', `/api/sessions/${sid}/host/${action}`, body || {}).catch(fail);
  let st = null;
  let manual = false;
  let spoken = -1;
  app.innerHTML = `
    <div><p class="back"><a href="#/">← Inicio</a></p>
      <div class="panel"><h1 id="title"></h1><div id="meta" class="muted"></div><div id="pats" style="margin-top:10px"></div></div>
      <div class="cols">
        <div class="panel">
          <div id="draws"></div>
          <div class="win-alert" id="results-panel" hidden>
            <h2 id="results-title"></h2>
            <div id="results"></div>
            <div id="final"></div>
            <div id="tie-result"></div>
            <button class="primary" id="tiebreak" hidden>🎲 Desempatar por sorteo</button>
            <button id="hidewin" hidden></button>
          </div>
          <div class="row" style="justify-content:center;margin-top:16px"><button class="primary big" id="gen">Generar un número</button></div>
          <div class="row" style="justify-content:center;margin-top:14px">
            <label class="small">Pausa <input type="number" id="interval" min="5" max="60" value="10" style="width:70px"> s</label>
            <label class="check"><input type="checkbox" id="stop" checked> Detener al completarse un cartón</label>
            <button id="auto">▶ Modo automático</button>
          </div>
          <div class="row" style="justify-content:center;margin-top:10px">
            <button id="manual">Selección manual</button>
            <button id="bigqr"></button>
            <label class="check"><input type="checkbox" id="voice" ${voiceOn ? 'checked' : ''}> Voz</label>
          </div>
        </div>
        <div class="panel"><h2 id="count"></h2><div id="board"></div><h2 style="margin-top:16px">Orden de salida</h2><div id="history" class="history"></div></div>
      </div>
      <a class="btn primary big" href="#/ronda/${p.id}" style="margin-bottom:14px">▶ Siguiente ronda</a>
      <a class="btn big" href="#/sorteoctl">🎲 Sortear participantes de El Rosco</a>
      <p class="small" style="text-align:center;margin-top:22px"><a href="#/admin/${p.id}">⚙️ Administración</a></p>
    </div>`;
  const render = () => {
    $('#title').textContent = st.name;
    const mins = Math.max(0, Math.round((st.expires - Date.now()) / 60000));
    $('#meta').textContent = `Ronda ${st.round} · ${st.players} participantes · ${st.players * st.cardsPerPlayer} de ${st.totalCards} cartones repartidos · quedan ${Math.floor(mins / 60)} h ${mins % 60} min`;
    $('#pats').innerHTML = patternsInline(st.patterns); // figura de la ronda, a la vista del animador
    $('#draws').innerHTML = drawsHTML(st, st.drawn);
    $('#count').textContent = `Tablero · ${st.drawn.length} de ${st.values}`;
    $('#board').innerHTML = boardHTML(st, st.drawn, manual);
    $('#history').innerHTML = st.drawn.map((v) => `<span>${esc(plain(st, v))}</span>`).join('') || '<span class="muted">Aún no se ha generado ningún valor.</span>';
    $('#gen').disabled = st.drawn.length >= st.values || st.auto.on;
    $('#auto').textContent = st.auto.on ? '⏸ Detener automático' : '▶ Modo automático';
    $('#auto').classList.toggle('on', st.auto.on);
    $('#manual').classList.toggle('on', manual);
    $('#bigqr').classList.toggle('on', st.bigQr);
    $('#bigqr').textContent = st.bigQr ? '📱 QR grande en pantalla: quitar' : '📱 Mostrar QR grande en pantalla';
    // Los ganadores van arriba de todo; primero los ya validados
    const results = [...st.results].sort((a, b) => Number(b.validated) - Number(a.validated) || a.at - b.at);
    const won = results.filter((r) => r.validated).length;
    $('#results-panel').hidden = !results.length;
    $('#results-panel').classList.toggle('won', won > 0);
    $('#results-title').textContent = won ? (won === 1 ? '🏆 ¡HAY UN GANADOR!' : `🏆 ¡HAY ${won} GANADORES!`) : 'Hay cartones por completar';
    // Ganadores en grande; debajo, quienes ya completaron la figura pero aún no marcan su cartón
    $('#results').innerHTML = `<div class="win-names">${results.filter((r) => r.validated).map((r) => `<span><b>${esc(r.name)}</b><small>Cartón #${p.startNumber + r.cardNo - 1}</small></span>`).join('')}</div>
      ${results.filter((r) => !r.validated).map((r) => `<p class="win-pending">${esc(r.name)} · cartón #${p.startNumber + r.cardNo - 1} · le falta marcar</p>`).join('')}`;
    // Con dos o más ganadores se puede desempatar con la tómbola en pantalla
    const winners = new Set(results.filter((r) => r.validated).map((r) => r.cardNo)).size;
    $('#tiebreak').hidden = winners < 2;
    $('#tiebreak').textContent = st.tieWinner ? '🎲 Volver a desempatar' : '🎲 Desempatar por sorteo';
    // El resultado se muestra al animador cuando la tómbola ya terminó en pantalla
    const tieDone = st.tieWinner && Date.now() - st.tieWinner.at >= st.rollMs;
    $('#tie-result').innerHTML = !st.tieWinner ? '' : tieDone ? `<p class="tie-won">Ganador del desempate<b>${esc(st.tieWinner.name)}</b><small>Cartón #${p.startNumber + st.tieWinner.cardNo - 1}</small></p>` : '<p class="tie-won">Sorteando en pantalla…</p>';
    if (st.tieWinner && !tieDone) setTimeout(() => st && render(), st.rollMs - (Date.now() - st.tieWinner.at) + 100);
    $('#hidewin').hidden = !won;
    $('#hidewin').textContent = st.celebrate ? 'Quitar la celebración de la pantalla' : 'Volver a mostrar la celebración';
    $('#final').innerHTML = st.finalists ? `<p><b>Selección final:</b> ${st.finalists.map((c) => '#' + (p.startNumber + c - 1)).join(', ') || 'no hay cartones validados'}</p>` : '';
    if (st.drawn.length !== spoken) { if (spoken >= 0 && st.drawn.length > spoken) speak(speakText(st, st.drawn.at(-1))); spoken = st.drawn.length; }
  };
  $('#gen').onclick = () => act('draw');
  $('#hidewin').onclick = () => act('hidewin', { hide: st.celebrate });
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
  app.innerHTML = `<p class="back"><a href="#/anfitrion/${pid}">← Volver sin cambiar de ronda</a></p><h1>${esc(p.name)}</h1>
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
        <label class="f">Franja superior<input type="text" id="gc-top" maxlength="90" value="${esc(info.gc.top)}" placeholder="Escanea el código QR y participa"></label>
        <label class="f">Franja inferior<input type="text" id="gc-bottom" maxlength="140" value="${esc(info.gc.bottom)}" placeholder="Pon tu nombre y apellido y participa"></label>
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
      } catch (err) { fail(err); }
    };
    return undefined;
  }
  let st = null;
  let round = null;
  const marks = Object.fromEntries(me.cards.map((c) => [c.no, new Set(c.marks)]));
  const maskOf = (c) => [...marks[c.no]].reduce((m, i) => m | (1 << i), c.cells[12] === 0 ? 1 << 12 : 0);
  app.innerHTML = `<div class="now" id="now"></div>
    <div id="banner"></div>
    <div class="cards" id="cards"></div>
    <button class="primary big" id="sync" style="margin-top:16px">↻ Actualizar y marcar lo que falta</button>
    <p class="muted small" style="margin-top:8px">Marca por ti los valores ya anunciados que se te pasaron.</p>
    <div class="panel" style="margin-top:20px"><h2 id="title" style="margin:0"></h2><span class="muted small" id="meta"></span><div id="pats" style="margin-top:8px"></div></div>`;
  const render = () => {
    if (round !== null && st.round !== round) me.cards.forEach((c) => marks[c.no].clear());
    round = st.round;
    $('#title').textContent = st.name;
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
  return subscribe(sid, (s) => { st = s; render(); }, () => { store.del(key); backToStart(); }, false, me.token);
};

views.tablero = async (sid) => {
  if (!sid) { const r = await pickSession('tablero'); if (!r.sid) return r.cleanup; sid = r.sid; }
  document.body.classList.add('tv');
  let tvWin = null;
  app.innerHTML = '<div id="tv"></div>';
  const off = subscribe(sid, (st) => {
    if (st.celebrate) { if (winKey(st) !== tvWin) { tvWin = winKey(st); $('#tv').innerHTML = winScreenHTML(st); } return; }
    tvWin = null;
    $('#tv').innerHTML = `
      <div class="row between" style="margin-bottom:1.5vw">
        <div><h1 style="margin:0">${esc(st.name)}</h1><span class="muted">Ronda ${st.round} · ${st.drawn.length} de ${st.values}</span><div style="margin-top:8px">${patternsInline(st.patterns)}</div></div>
        ${drawsHTML(st, st.drawn)}
        ${qr(joinUrl(sid))}
      </div>${boardHTML(st, st.drawn)}`;
  }, () => { document.body.classList.remove('tv'); if (location.hash === '#/tablero') route(); else location.hash = '#/tablero'; });
  return () => { off(); document.body.classList.remove('tv'); };
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
      <div class="bwin-names">${shown.map((r) => `<span><b>${esc(r.name || 'Participante')}</b><small>Cartón #${st.startNumber + r.cardNo - 1}</small></span>`).join('')}</div>
      ${winners.length > shown.length ? `<span class="bwin-more">y ${winners.length - shown.length} más</span>` : ''}
      ${winners.length > 1 ? '' : '<span class="bwin-sub">¡Felicitaciones!</span>'}</div></div>`;
}

// Vuelve al panel del bingo en curso y devuelve la pantalla de OBS a su gráfica
async function backToBingo() {
  await api('POST', '/api/stage', { show: 'bingo' }).catch(() => {});
  const id = store.get('lastBingo');
  location.hash = id ? `#/anfitrion/${id}` : '#/proyectos';
}
const BACK_BINGO = '<p style="margin-top:20px"><button class="big" data-back-bingo>← Volver al bingo</button></p>';
document.addEventListener('click', (e) => { if (e.target.closest('[data-back-bingo]')) backToBingo(); });

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
        document.body.classList.add('obs');
      }
    } finally { busy = false; }
  };
  await apply();
  const timer = setInterval(apply, 2000);
  return () => { clearInterval(timer); if (typeof stop === 'function') stop(); document.body.classList.remove('obs'); };
};

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
