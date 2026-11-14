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
  const bingoHref = open ? `#/anfitrion/${open.projectId}` : last ? `#/anfitrion/${last}` : '#/proyectos';
  app.innerHTML = `
    <div class="home">
      <h1>KRB Stage · Sala de juegos</h1>
      ${open ? `<a class="home-create open" href="${bingoHref}"><span>▶</span>Continuar: ${esc(open.name)}</a>
        <p class="muted small home-note">Hay una sala abierta. Para crear otra, primero ciérrala en el Centro de control.</p>`
    : '<a class="home-create" href="#/nuevo"><span>🎮</span>Crear sala de juegos</a>'}
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
        <button data-show="rueda"><span>🎡</span>El Rosco</button><button data-show="qr"><span>📱</span>QR en pantalla completa</button>
        <button data-show="none" class="wide"><span>⬛</span>Nada</button>
      </div>
      <p class="small" style="margin-top:16px"><b>Enlace para OBS</b> (1920×1080, no pide usuario ni contraseña):<br><a class="link" href="${stageUrl()}" target="_blank">${esc(stageUrl())}</a></p>
    </div>
    <div class="panel"><h2>Bingos abiertos</h2>
      <p class="muted small">Si hay más de uno, a la gente le aparece una lista para elegir. Cierra los que ya no se usan.</p>
      <div id="open-list"></div></div>`;
  const paintOpen = async () => {
    const list = await activeSessions();
    if (!$('#open-list')) return;
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
            <p class="tie-hint" id="tie-hint" hidden>Hay un empate: primero desempata por sorteo.</p>
            <button class="primary" id="tiebreak" hidden>🎲 Desempatar por sorteo</button>
            <div class="win-actions" id="win-actions" hidden>
              <button id="confirmwin">✔ Confirmar ganador</button>
              <button id="keepplaying">▶ Seguir jugando</button>
            </div>
            <div id="win-confirmed" hidden><p>✔ Ganador confirmado</p><a class="btn big" id="win-next">▶ Siguiente bingo</a><a class="btn big" id="win-rosco" href="#/sorteoctl">🎲 Sorteo para El Rosco</a></div>
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
        <div class="panel"><h2 id="count"></h2><div id="board"></div><h2 style="margin-top:16px">Orden de salida</h2><div id="history" class="history"></div></div>
      </div>
      <a class="btn primary big" href="#/ronda/${p.id}" style="margin-bottom:14px">▶ Siguiente bingo</a>
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
    $('#results').innerHTML = `<div class="win-names">${results.filter((r) => r.validated).map((r) => `<span><b>${esc(r.name)}</b><small>Cartón #${p.startNumber + r.cardNo - 1}</small></span>`).join('')}</div>
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
    $('#win-confirmed p').textContent = '✔ Ganador confirmado';
    $('#final').innerHTML = st.finalists ? `<p><b>Selección final:</b> ${st.finalists.map((c) => '#' + (p.startNumber + c - 1)).join(', ') || 'no hay cartones validados'}</p>` : '';
    if (st.drawn.length !== spoken) { if (spoken >= 0 && st.drawn.length > spoken) speak(speakText(st, st.drawn.at(-1))); spoken = st.drawn.length; }
  };
  $('#gen').onclick = () => act('draw');
  $('#confirmwin').onclick = () => act('confirmwin');
  $('#keepplaying').onclick = () => act('keepplaying');
  $('#win-next').href = `#/ronda/${p.id}`;
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
    <div class="live" id="live"><div id="live-player"></div>
      <div class="live-bar"><button type="button" id="live-audio">🔇 Activar audio</button><button type="button" id="live-full">⛶ Pantalla completa</button><button type="button" id="live-sync" class="wide">↻ Poner al día el video</button></div></div>
    <div class="prosco" id="prosco" hidden></div>
    <div id="bingo-bottom"><button class="primary big" id="sync" style="margin-top:16px">↻ Actualizar y marcar lo que falta</button>
    <p class="muted small" style="margin-top:8px">Marca por ti los valores ya anunciados que se te pasaron.</p>
    <div class="panel" style="margin-top:20px"><h2 id="title" style="margin:0"></h2><span class="muted small" id="meta"></span><div id="pats" style="margin-top:8px"></div></div></div>`;
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
  const drawRosco = () => {
    if (!rosco) { $('#prosco').innerHTML = '<p class="muted">Cargando El Rosco…</p>'; return; }
    const c = rosco.players[rosco.turn];
    const reveal = rosco.reveal ? `<div class="prosco-reveal">✔ Letra ${esc(rosco.reveal.letter)}: <b>${esc(rosco.reveal.answer)}</b></div>` : '';
    const body = rosco.winner ? `<div class="prosco-win">🏆 ${esc(rosco.winner.name)}<small>${rosco.winner.full ? '¡Completó el rosco!' : '¡Ganó El Rosco!'}</small></div>`
      : rosco.tie ? `<div class="prosco-wait">Empate entre ${rosco.tie.names.map(esc).join(' y ')}. Se define por sorteo.</div>`
      : rosco.finished ? '<div class="prosco-wait">Juego terminado</div>'
      : `<div class="prosco-q"><span class="prosco-letter">${esc(rosco.letters[c.current])}</span>
          <p>${rosco.question ? esc(rosco.question) : '<span class="muted">Esperando la siguiente pregunta…</span>'}</p></div>`;
    $('#prosco').innerHTML = `<div class="prosco-head"><b>El Rosco</b><span>${rosco.winner || rosco.finished ? '' : `Turno de ${esc(c.name)}`}</span><span class="prosco-clock" id="prosco-clock">${rosco.winner || rosco.finished ? '' : fmtClock(roscoLeft())}</span></div>
      ${body}${reveal}
      <div class="prosco-score">${rosco.players.map((p, i) => `<span class="${i === rosco.turn && !rosco.finished ? 'on' : ''}">${esc(p.name)} <b class="ok">✔ ${p.hits}</b> <b class="ko">✘ ${p.misses}</b></span>`).join('')}</div>`;
  };
  const stopRosco = () => { if (roscoEs) roscoEs.close(); clearInterval(roscoTick); roscoEs = null; roscoId = null; rosco = null; };
  const syncStage = () => {
    const on = st.stage === 'rueda' && !!st.roscoId;
    $('#bingo-top').hidden = on;
    $('#bingo-bottom').hidden = on;
    $('#prosco').hidden = !on;
    if (!on) { stopRosco(); return; }
    if (roscoId === st.roscoId) return;
    stopRosco();
    roscoId = st.roscoId;
    drawRosco();
    roscoEs = new EventSource(`/api/wheels/${roscoId}/events`);
    roscoEs.onmessage = (e) => { rosco = { ...JSON.parse(e.data), gotAt: Date.now() }; drawRosco(); };
    roscoTick = setInterval(() => { const el = $('#prosco-clock'); if (el && rosco && rosco.runningSince && !rosco.winner) el.textContent = fmtClock(roscoLeft()); }, 250);
  };
  const render = () => {
    syncStage();
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
  return () => { off(); stopRosco(); liveFor = null; player = null; document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('visibilitychange', onBack); document.body.classList.remove('live-open'); };
};
// Canal de Twitch de cada local
const LIVE_CHANNELS = { frida: 'krbstage', tobalaba: 'krbstage3', kennedy: 'krbstage3' };
let twitchLoading = null;
const loadTwitch = () => {
  if (window.Twitch && window.Twitch.Player) return Promise.resolve();
  twitchLoading ||= new Promise((resolve, reject) => {
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
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
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
  const sounds = {
    // Acierto: campanita brillante de dos notas
    hit: () => { note(1319, 0, 0.5, 'sine', 0.35); note(2637, 0, 0.35, 'sine', 0.12); note(1760, 0.12, 0.8, 'sine', 0.35); note(3520, 0.12, 0.5, 'sine', 0.1); },
    // Fallo: zumbador grave
    miss: () => { note(160, 0, 0.6, 'sawtooth', 0.28); note(113, 0, 0.6, 'square', 0.16); },
    // Paso: nota corta que baja
    pass: () => { note(660, 0, 0.22, 'triangle', 0.25, 330); },
    // Reloj: tic y tac secos y fuertes, alternados
    tick: () => { note(1500, 0, 0.05, 'square', 0.4); note(3000, 0, 0.03, 'sine', 0.2); },
    tock: () => { note(950, 0, 0.06, 'square', 0.4); note(1900, 0, 0.03, 'sine', 0.2); },
    // Se acabó el tiempo: alarma fuerte de dos tonos
    alarm: () => { for (let i = 0; i < 8; i++) { note(i % 2 ? 660 : 880, i * 0.22, 0.2, 'square', 0.45); note(i % 2 ? 1320 : 1760, i * 0.22, 0.2, 'sawtooth', 0.18); } },
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
  const paintSound = () => { soundBtn.hidden = sfx.ready(); };
  const enableSound = () => { const c = sfx.unlock(); if (c) { c.onstatechange = paintSound; Promise.resolve(c.resume()).then(() => { paintSound(); if (!soundBtn.dataset.done) { soundBtn.dataset.done = '1'; sfx.play('hit'); } }).catch(() => {}); } };
  document.addEventListener('pointerdown', enableSound);
  document.addEventListener('keydown', enableSound);
  sfx.unlock(); // donde el navegador lo permite sin tocar (pantallas en modo quiosco), queda activo de inmediato
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
        else stop = await views.bingoFull(); // bingo, o la portada si no hay nada en juego
      }
      mark();
    } finally { busy = false; }
  };
  await apply();
  const timer = setInterval(apply, 2000);
  return () => { clearInterval(timer); if (typeof stop === 'function') stop(); document.body.classList.remove('full'); soundBtn.remove(); document.removeEventListener('pointerdown', enableSound); document.removeEventListener('keydown', enableSound); };
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
  const id = store.get('lastBingo');
  // Si el bingo anterior ya tiene ganador confirmado, no se vuelve a mostrar: se pasa directo a crear el siguiente
  try {
    const p = id && await api('GET', `/api/projects/${id}`);
    if (p && p.sessionId && (await api('GET', `/api/sessions/${p.sessionId}/host`)).roundOver) { location.hash = `#/ronda/${id}`; return; }
  } catch { /* sin datos: se sigue al panel */ }
  await api('POST', '/api/stage', { show: 'bingo' }).catch(() => {});
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
        else if (show === 'qr') stop = await views.qrBig();
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
