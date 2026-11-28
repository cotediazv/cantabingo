/* global PATTERNS */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
// Pedido de Cote (21 nov): al dar a conocer un ganador, un premio o una información, el animador también lo ve en su
// panel, grande, para leerlo en voz alta (lo mismo que está en la pantalla del local)
// El ranking de la Trivia del Rosko desplegado en pantalla, también grande en el panel (pedido de Cote, 21 nov)
// «y» o «e» entre nombres (Cote, 25 nov: «cuando hay empate entre una persona y otra que empieza con I no se puede usar
// la Y sino la E: Camilo e Isidora»): «e» antes de una palabra que suena /i/ (i-, hi-), salvo si forma diptongo (hie-, hia-)
window.eY = (w) => { const s = String(w || '').replace(/^[^A-Za-z\u00C0-\u00FF]+/, '').toLowerCase(); return /^h?[iíï]/.test(s) && !/^h?[ií][aeiouáéóú]/.test(s) ? 'e' : 'y'; };
window.yJoin = (a) => { a = a || []; return a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ${window.eY(a[a.length - 1])} ${a[a.length - 1]}`; };
// Lugar donde está el concursante, bajo su nombre (pedido de Cote, 26 nov: «mostrar bajo el nombre del concursante en
// Kennedy en qué lugar está»); en el diseño nuevo, sin el emoji
window.placeTag = (p, cls) => { if (!p) return ''; const ic = window.sinEmoji ? window.sinEmoji('📍') : '📍'; return `<span class="c-place${cls ? ` ${cls}` : ''}">${ic ? `${ic} ` : ''}${esc(p)}</span>`; };
window.rankAnnHtml = (rank, players, final, title = 'la Trivia del Rosko') => `<div class="panel ann rank-ann"><small>📣 En pantalla ahora</small><span class="ann-t">🏅 Ranking de ${esc(title)} · ${final ? 'resultados finales' : 'resultados parciales'}</span>
  ${rank.length ? `<ol class="rank-ann-list">${rank.map((t, i) => `<li class="${i < 3 ? 'top' : ''}"><em>${i + 1}.º</em><b>${esc(t.name)}</b><i>${t.score} pts</i></li>`).join('')}</ol>` : '<span class="ann-l">Todavía nadie suma puntos</span>'}
  <span class="ann-l">${players} ${players === 1 ? 'persona jugando' : 'personas jugando'}</span></div>`;
window.annHtml = (title, names, lines = []) => `<div class="panel ann"><small>📣 Para anunciar</small><span class="ann-t">${esc(title)}</span>${names.map((n) => `<b class="ann-n">${esc(n)}</b>`).join('')}${lines.filter(Boolean).map((l) => `<span class="ann-l">${esc(l)}</span>`).join('')}</div>`;
// Demo del GC Master: `?como=<token>` muestra el celular de esa persona (de la sala simulada) con una memoria aparte,
// sin tocar la del navegador del moderador
const COMO = new URLSearchParams(location.search).get('como');
const memo = {};
const store = COMO ? {
  get: (k) => (k.startsWith('tok_') ? COMO : k in memo ? memo[k] : null),
  set: (k, v) => { memo[k] = String(v); },
  del: (k) => { delete memo[k]; },
} : {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* sin almacenamiento */ } },
};
const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

// Marca de esta página abierta: el servidor no hace dos veces el mismo paso si lo mandan dos paneles a la vez (26 nov)
const PANEL_ID = rnd(6);
async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', 'x-admin': store.get('adminToken') || '', 'x-staff': store.get('staffToken') || '', 'x-panel': PANEL_ID },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') store.del('adminToken');
  if (!res.ok) throw Object.assign(new Error(data.error || 'Error inesperado'), { status: res.status });
  return data;
}
// Aviso inmediato del servidor (pedido de Cote, 22 nov: que el GC y los efectos respondan fluido): las pantallas siguen
// preguntando cada pocos segundos qué mostrar, pero además escuchan /api/live y, apenas algo cambia (escenario, GC de la
// sala light, un efecto), vuelven a preguntar en el acto. window.onAviso(fn) anota una función y devuelve cómo quitarla.
// Los monitores del GC Master (?mon=1) no abren su propia conexión (son varios en una misma página): la página que los
// contiene les pasa el aviso, y cada una lo pasa a las que tenga dentro.
window.onAviso = (() => {
  const fns = new Set(); let es = null; let t = null;
  const relay = () => { for (const f of document.querySelectorAll('iframe')) { try { f.contentWindow.postMessage('krb-aviso', location.origin); } catch (e) { /* marco de otro sitio */ } } };
  const fire = () => { clearTimeout(t); t = setTimeout(() => { fns.forEach((f) => { try { f(); } catch (e) { /* cada pantalla se cuida sola */ } }); relay(); }, 20); };
  if (window.__mon) window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data === 'krb-aviso') fire(); });
  const sync = () => {
    if (fns.size && !es && window.EventSource && !window.__mon) {
      try {
        es = new EventSource('/api/live'); es.onmessage = fire;
        // momentos de las luces (solo llegan con la sala de Kennedy): los usa el tablero que toca los sonidos
        es.addEventListener('momento', (e) => { try { window.dispatchEvent(new CustomEvent('krb-momento', { detail: JSON.parse(e.data) })); } catch (err) { /* aviso dañado */ } });
      } catch (e) { es = null; }
    }
    else if (!fns.size && es) { es.close(); es = null; }
  };
  return (fn) => { fns.add(fn); sync(); return () => { fns.delete(fn); sync(); }; };
})();
// El ganador del juego anterior no se queda arriba del panel (pedido de Cote, 24 nov: «desde el momento en que ya está
// la votación, no es necesario que arriba siga apareciendo el ganador del concurso anterior»): en los paneles del
// animador se anota qué está en pantalla (<html data-stage>) y los recuadros de ganador de un juego se esconden cuando
// la pantalla ya muestra otra cosa (estilos al final de styles.css). Solo con sesión de moderador: no en celulares.
(() => {
  if (window.__mon) return;
  let cur = null; let live = false;
  const tick = async () => {
    if (document.hidden || !store.get('adminToken')) return; // el moderador puede entrar después de abrir la página
    if (!live) { live = true; window.onAviso(tick); }
    const r = await api('GET', '/api/stage').catch(() => null);
    if (r && r.show !== cur) { cur = r.show; document.documentElement.dataset.stage = cur || 'none'; }
  };
  setInterval(tick, 3000); tick();
})();
// «GC PER» (pedido de Cote, 22 nov): el texto escrito en el GC Master. Lo que va entre comillas ("…", “…” o «…») sale
// destacado en dorado y las comillas no se ven. `card` arma la misma franja del GC de la sala light; `over` la agrega
// encima de una pantalla del local (tablero, de pie, verticales) sin quitar lo que muestra.
window.gcPer = (() => {
  const RE = /"([^"]+)"|“([^”]+)”|«([^»]+)»/g;
  const NAMES = { kennedy: 'Mercado Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
  const html = (text) => { const s = String(text || ''); let out = ''; let i = 0; let m; RE.lastIndex = 0; while ((m = RE.exec(s))) { out += `${esc(s.slice(i, m.index))}<mark>${esc(m[1] || m[2] || m[3])}</mark>`; i = RE.lastIndex; } return out + esc(s.slice(i)); };
  const plain = (text) => String(text || '').replace(RE, (m, a, b, c) => a || b || c);
  const card = (venue, text) => { const n = plain(text).length; const h = html(text);
    return `<div class="lg-card lg-bottom lg-info lg-custom${h.includes('<mark>') ? ' has-hl' : ''}"><div class="lg-tag"><small>${esc(NAMES[venue] || '')}</small><b>KRB Stage</b></div>
      <div class="lg-main">${n <= 30 ? `<b style="--n:${Math.max(10, n)}">${h}</b>` : `<span class="lg-line">${h}</span>`}</div></div>`; };
  let shown = '';
  // Para que la franja no tape nada (QR, últimas filas del bingo), lo que la pantalla muestra se achica un poco hacia
  // arriba mientras la franja está puesta: se mide el alto de la franja y se deja en --per-k (clase per-on del body)
  const room = () => {
    const c = document.querySelector('#gcper .lg-card'); if (!c) return;
    const top = c.getBoundingClientRect().top; if (!(top > 0)) return;
    document.body.style.setProperty('--per-k', String(Math.max(0.7, Math.min(1, (top - innerHeight * 0.012) / innerHeight)).toFixed(4)));
    document.body.classList.add('per-on');
  };
  window.addEventListener('resize', room);
  const over = (text, venue) => {
    const key = text ? `${venue}|${text}|${window.t2 && window.t2() ? 1 : 0}` : '';
    let el = document.getElementById('gcper');
    if (!text) { if (el) { el.remove(); document.body.classList.remove('per-on'); document.body.style.removeProperty('--per-k'); } shown = ''; return; }
    if (el && key === shown) return;
    if (!el) { el = document.createElement('div'); el.id = 'gcper'; document.body.appendChild(el); }
    shown = key; el.className = `gcper-over th-${venue || 'kennedy'}`; el.innerHTML = `<div id="lg" class="th-${venue || 'kennedy'}">${card(venue, text)}</div>`;
    room(); setTimeout(room, 400); setTimeout(room, 1500); // otra vez cuando terminan de cargar las letras
  };
  return { html, plain, card, over };
})();
// Marca al azar de este navegador (sin datos personales): sirve para contar a los conectados sin repetir y para saber,
// en el registro de clientes, cuántas veces vuelve el mismo celular
// Aviso de datos personales en la entrada (pregunta 9.2 de Cote; apagado salvo que se encienda en el Centro de control)
const PRIV_URL = 'https://krbstage.cl/privacidad.html';
window.privLine = async () => {
  try {
    const r = await (await fetch('/api/tema', { cache: 'no-store' })).json();
    return r && r.priv ? `<p class="priv-line small muted">Al participar aceptas que KRB Stage guarde tu nombre y tu participación. <a href="${PRIV_URL}" target="_blank" rel="noopener">Política de privacidad</a></p>` : '';
  } catch (e) { return ''; }
};
window.vid = () => { let v = store.get('vid'); if (!v) { v = rnd(8); store.set('vid', v); } return v; };
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
  es.onmessage = (e) => { const st = JSON.parse(e.data); if (st.closed) { es.close(); onGone(); } else { onState(st); if (!asAdmin) window.figSplash(st); } };
  es.onerror = () => { fetch(`/api/sessions/${sid}`).then((r) => { if (r.status === 404) { es.close(); onGone(); } }).catch(() => {}); };
  return () => es.close();
}
// La figura del bingo en grande (pedido de Cote, 24 nov: «desde el momento en que se elige la figura, debería aparecer
// en pantalla completa por unos 3 o 4 segundos, en todos los dispositivos, la figura completa que se va a hacer»): GC,
// tablero, pantalla de pie y celulares (no el panel del animador). Se muestra una sola vez por figura elegida; si la
// figura tiene varias formas (por ejemplo «Línea (cualquiera)»), van pasando
window.figSplash = (st) => {
  if (!st || !st.figAt || !st.patterns || !st.patterns[0] || window.__figShown === st.figAt) return;
  const left = 3800 - ((st.now || Date.now()) - st.figAt);
  if (left < 600) return;
  const P = PATTERNS.byId[st.patterns[0]];
  if (!P) return;
  window.__figShown = st.figAt;
  const grid = (m) => Array.from({ length: 25 }, (_, i) => `<i class="${m & (1 << i) ? 'x' : ''}"></i>`).join('');
  const el = document.createElement('div');
  el.id = 'figsplash'; el.className = `th-${st.theme || 'frida'}`;
  el.innerHTML = `<div class="fs-card"><small>La figura de este bingo</small><div class="fs-grid">${grid(P.variants[0])}</div><b>${esc(P.name)}</b></div>`;
  document.body.appendChild(el);
  let k = 0;
  const t = P.variants.length > 1 ? setInterval(() => { k = (k + 1) % P.variants.length; const g = el.querySelector('.fs-grid'); if (g) g.innerHTML = grid(P.variants[k]); }, 650) : null;
  setTimeout(() => { el.classList.add('fs-out'); }, left - 400);
  setTimeout(() => { clearInterval(t); el.remove(); }, left);
};
// Enlaces fijos: siempre llevan a la sesión activa, así el QR no cambia de una partida a otra
// La sala se llama «Los Juegos de Frida»; dentro del bingo, el juego se llama «El Bingo de Frida»
function bingoName(name) { return String(name || '').replace(/^Los Juegos de /, 'El Bingo de '); }
const joinUrl = () => `${window.pubBase()}#/jugar`; // el QR del público: a la dirección elegida en el Centro de control
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
  { id: 'bingo', icon: '🎮', name: 'Crea sala de juegos', desc: 'Bingo, El Rosko, El Festival, El objeto más extraño y ¿Quién quiere ser ganador?', href: '#/nuevo' },
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
      <a class="home-control home-control-sm home-sim" href="#/simulada">🤖 Crear sala simulada</a>
      <p style="margin-top:28px"><button id="logout">Cerrar sesión de moderador</button></p>
    </div>`;
  $('#logout').onclick = () => { store.del('adminToken'); route(); };
  // Copia de eventos (orden 12 de Code 0, pedido de Cote, 28 nov: «debería decir en alguna parte eventos y cambiar el color
  // del botón»): arriba «Eventos» y el botón principal en el dorado de la marca
  const tm = await fetch('/api/tema', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}));
  if (tm.evento && document.querySelector('.home')) {
    document.querySelector('.home').classList.add('home-evento');
    document.querySelector('.home h1').insertAdjacentHTML('beforebegin', '<p class="home-ev-tag">🎪 Eventos</p>');
  }
  // Si la sala abierta es simulada, se dice al lado de «Continuar»
  const sim = await api('GET', '/api/sim').catch(() => null);
  const go = document.querySelector('.home-create.open');
  if (sim && sim.on && go && open && sim.sid === open.id) go.insertAdjacentHTML('beforeend', `<small class="home-simtag">🤖 Sala simulada · ${sim.n} personas virtuales</small>`);
  return undefined;
};

// Sala simulada (pedido de Cote, 23 nov: «crear sala simulada… 120 personas virtuales jugando de manera como lo hacen las
// personas… para poder probar los juegos de buena manera»): una sala de juegos normal, con personas virtuales que entran
// y juegan todos los juegos solas (ver simulador.js). Se termina cerrando la sala en el Centro de control.
views.simulada = async () => {
  if (!(await isAdmin())) return viewLogin();
  if ((await activeSessions()).length) { toast('Ya hay una sala abierta: ciérrala en el Centro de control para crear la sala simulada'); location.hash = '#/'; return undefined; }
  app.innerHTML = `<p class="back"><a href="#/">← Inicio</a></p><h1>🤖 Crear sala simulada</h1>
    <form class="panel fields" id="f">
      <p class="wide muted">Una sala de juegos de verdad, con personas virtuales que entran solas y juegan todos los juegos como lo haría el público: bingo, El Rosko, el sorteo de concursantes, El Festival, El objeto más extraño, la votación del juego y El último en pie. Tú la manejas igual que siempre. Para terminar, cierra la sala en el Centro de control.</p>
      <div class="wide"><span class="f" style="margin-bottom:6px">¿De qué local?</span>
        <div class="seg" id="venues" role="tablist">
          <button type="button" data-venue="frida" class="on">Frida</button><button type="button" data-venue="tobalaba">Tobalaba</button><button type="button" data-venue="kennedy">Mercado Kennedy</button>
        </div>
        <p class="muted small" style="margin-top:8px">Las pantallas de ese local que estén en «Automático» también van a mostrar los juegos.</p></div>
      <label class="f">Personas virtuales <span class="hint">de 5 a 300</span><input type="number" name="n" min="5" max="300" value="120" required></label>
      <div class="wide"><button class="primary big paso">🤖 Crear sala simulada</button></div>
    </form>`;
  const f = $('#f'); let venue = 'frida';
  const NAMES = { frida: 'Los Juegos de Frida', tobalaba: 'Los Juegos de Tobalaba', kennedy: 'Los Juegos de Mercado Kennedy' };
  $('#venues').onclick = (e) => { const v = e.target.dataset.venue; if (!v) return; venue = v; $$('#venues button').forEach((b) => b.classList.toggle('on', b.dataset.venue === v)); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector('button.primary'); btn.disabled = true; btn.textContent = '⏳ Entrando las personas virtuales…';
    const n = Math.max(5, Math.min(300, Number(f.n.value) || 120));
    try {
      const p = await api('POST', '/api/projects', { name: NAMES[venue], theme: venue, count: Math.max(320, n + 20), format: 'numbers', values: 75, headers: 'BINGO', freeCenter: false, startNumber: 1 });
      let s;
      try { s = await api('POST', `/api/projects/${p.id}/session`, { name: p.name, theme: venue, password: '', cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] }); } catch (err) { await api('DELETE', `/api/projects/${p.id}`).catch(() => {}); throw err; }
      const r = await api('POST', '/api/sim/start', { sid: s.id, n });
      store.set('lastBingo', p.id);
      toast(`Sala simulada lista: ${r.n} personas virtuales jugando`);
      location.hash = '#/juegos';
    } catch (err) { fail(err); btn.disabled = false; btn.textContent = '🤖 Crear sala simulada'; }
  };
  return undefined;
};

// Centro de control: qué gráfica se ve en la pantalla de OBS
// Centro de control en secciones plegadas (orden 14 de Code 0, pedido de Cote, 28 nov): cada recuadro con título (también
// los que agregan tema.js, emisor-ui.js y animador-ui.js) queda plegado y se abre o se cierra tocando su título. Solo los
// enlaces de las pantallas de la sala de juegos (.ctl-main) quedan a la vista. No se quita ni se cambia nada de adentro.
const ctlFold = () => {
  if (!/^#\/control\b/.test(location.hash)) return;
  app.querySelectorAll(':scope > .panel:not(details):not(.ctl-main)').forEach((p) => {
    const h = p.querySelector(':scope > h2');
    if (!h) return;
    p.classList.add('ctl-col');
    if (!h.hasAttribute('role')) { h.setAttribute('role', 'button'); h.tabIndex = 0; }
    h.setAttribute('aria-expanded', p.classList.contains('open') ? 'true' : 'false');
  });
};
setInterval(ctlFold, 600);
const ctlToggle = (e) => {
  const h = e.target.closest && e.target.closest('#app > .ctl-col > h2');
  if (!h || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
  e.preventDefault();
  h.parentNode.classList.toggle('open'); ctlFold();
};
document.addEventListener('click', ctlToggle);
document.addEventListener('keydown', ctlToggle);
views.control = async () => {
  if (!(await isAdmin())) return viewLogin();
  // Pedido de Cote (20 nov): en la aplicación instalada no hay cómo recargar; botoncito «Refrescar página»
  app.innerHTML = `<p class="back ctl-top"><a href="#/">← Inicio</a><button type="button" class="ctl-reload" onclick="location.reload()">↻ Refrescar página</button></p><h1>Centro de control</h1>
    <!-- Centro de control en secciones (orden 14 de Code 0, pedido de Cote, 28 nov: «todas las informaciones estén en pestañas…
         minimizadas… lo único que se vea como en primera opción son los enlaces de las pantallas de la sala de juego»): a la vista
         solo los enlaces de las pantallas; todo lo demás queda plegado y se abre tocando su título (ctlFold) -->
    <div id="ctl-sala-go"></div><!-- siempre a la vista, al inicio (Cote, 28 nov: «el botón sala de juego debería estar siempre en el inicio») -->
    <div class="panel ctl-main" id="ctl-links-box"><h2>📺 Pantallas de la sala de juegos</h2>
      <div class="ctl-links">
        <p><b>📱 Participar</b><small>Lo que abre el público al escanear el QR</small><a class="link" href="${joinUrl()}" target="_blank">${esc(joinUrl())}</a></p>
        <p><b>🖥️ Tablero</b><small>Pantalla del DJ, con sonido</small><a class="link" href="${boardUrl()}" target="_blank">${esc(boardUrl())}</a></p>
        <p id="ctl-obs"><b>🎬 OBS</b><small>Fuente de navegador, 1920×1080, transparente</small><a class="link" href="${stageUrl()}" target="_blank">${esc(stageUrl())}</a></p>
      </div>
    </div>
    <div class="panel"><h2>Sala de juegos abierta</h2>
      <p class="muted small">Si hay más de una, a la gente le aparece una lista para elegir. Cierra las que ya no se usan.</p>
      <div id="open-list"></div></div>
    <details class="panel ctl-fold" id="ctl-stage-fold"><summary><h2>En pantalla</h2><span class="muted small">Tocar para abrir</span></summary>
      <p class="muted small" id="stage-note"></p>
      <div class="lp-stages" id="stage"></div>
      <form class="lp-custom" id="stage-custom" hidden><input type="text" name="text" maxlength="120" autocomplete="off" placeholder="Escribe aquí el texto del GC"><button>✏️ GC personalizable</button></form>
    </details>
    <div class="panel" id="ctl-pages"><h2>🔗 Otras páginas</h2>
    <a class="btn lp-open" href="#/verticalctl/kennedy">📺 Pantallas de los locales · videos vertical y horizontal</a>
    <a class="btn lp-open" href="#/light">💡 Sala light · karaoke, show y cartelera en otro local</a>
    <a class="btn lp-open" href="#/consola">🖥️ Consola general · los 3 locales en una pantalla</a>
    <a class="btn lp-open" href="#/lucesreg">📋 Registro de las luces del Dell (Kennedy)</a>
    <a class="btn lp-open" href="#/master">🎛️ GC Master · centro de control de transmisión</a>
    <a class="btn lp-open" href="/sala">📱 Sala de juegos en el teléfono · para guardar en el inicio</a>
    </div>
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
  // «En pantalla» (pedido de Cote, 28 nov: «no me sirve tener el botón del bingo… tiene que ser un botón para el juego en
  // vivo. Y luego GC karaoke. Luego QR del karaoke en grande… y tienen que tener los botones que tienen la sala light. No
  // necesito otros botones, porque los juegos van cargando las nuevas escenas»): «🎮 JUEGO EN VIVO» (el GC vuelve a la sala
  // de juegos) y los mismos botones de la sala light del local de la sala abierta (/api/light/stage; gana lo último que se tocó)
  let stVenue = null; let stSig = '';
  const paintStage = async () => {
    const st = await api('GET', '/api/stage').catch(() => null);
    const v = st && st.venue;
    const l = v ? await api('GET', `/api/light?local=${v}`).catch(() => null) : null;
    const box = $('#stage'); const form = $('#stage-custom'); const note = $('#stage-note');
    if (!box) return;
    const insta = !!(l && l.sala && st.show === 'insta'); // «Redes sociales» en pantalla
    const sig = JSON.stringify([v, insta, l && [l.open, l.sala, l.stage, l.text]]);
    if (sig === stSig) return;
    if (document.activeElement && form.contains(document.activeElement)) return; // no se pierde lo que se está escribiendo
    stSig = sig; stVenue = v;
    // El link de OBS es el GC Light del local de la sala (Cote, 28 nov: abrió #/escena desde aquí y veía fijo el QR de la
    // sala; los botones de «En pantalla» mandan en el GC Light, que es el que va en OBS)
    const obs = $('#ctl-obs');
    if (obs) {
      const url = v ? `${location.origin}${location.pathname}#/light-gc/${v}` : stageUrl();
      obs.innerHTML = `<b>🎬 OBS${v ? ` · GC Light de ${esc((l && l.name) || v)}` : ''}</b><small>Fuente de navegador, 1920×1080, transparente${v ? '. Muestra lo que eligen estos botones' : ''}</small><a class="link" href="${esc(url)}" target="_blank">${esc(url)}</a>`;
    }
    if (!v || !l || !l.open) {
      box.innerHTML = ''; form.hidden = true;
      note.textContent = v ? 'La sala light de este local no está disponible.' : 'No hay sala de juegos abierta. Los botones del GC de cada local están en su sala light.';
      return;
    }
    // «Redes sociales» (Cote, 28 nov: «falta redes sociales»): el «Síguenos en Instagram» de la sala de juegos
    const keys = [['sala', '🎮', 'JUEGO EN VIVO'], ...(window.lightStagesOf ? window.lightStagesOf(v) : []), ['insta', '📸', 'REDES SOCIALES']];
    const isOn = (k) => (k === 'sala' ? l.sala && !insta : k === 'insta' ? insta : !l.sala && l.stage === k);
    box.innerHTML = keys.map(([k, i, t]) => `<button type="button" data-show="${k}" class="${isOn(k) ? 'on' : ''}"><span>${i}</span>${t}</button>`).join('');
    form.hidden = false; form.classList.toggle('on', !l.sala && l.stage === 'custom');
    const inp = form.querySelector('input'); if (!inp.value) inp.value = l.text || '';
    note.textContent = `${l.name}: ${l.sala ? 'ahora el GC muestra el juego en vivo.' : 'ahora el GC muestra el botón que tocaste; «Juego en vivo» lo devuelve al juego.'} Los juegos cargan sus escenas solos.`;
  };
  await paintStage();
  $('#stage').onclick = async (e) => {
    const btn = e.target.closest('[data-show]');
    if (!btn || !stVenue) return;
    try {
      if (btn.dataset.show === 'insta') await api('POST', '/api/stage', { show: 'insta' }); // la escena de la sala: el GC vuelve a la sala
      else await api('POST', '/api/light/stage', { local: stVenue, show: btn.dataset.show });
      stSig = ''; paintStage();
    } catch (err) { fail(err); }
  };
  $('#stage-custom').onsubmit = async (e) => {
    e.preventDefault();
    const text = e.target.text.value.trim();
    if (!text) return toast('Escribe el texto del GC');
    try { await api('POST', '/api/light/stage', { local: stVenue, show: 'custom', text }); stSig = ''; e.target.text.blur(); paintStage(); } catch (err) { fail(err); }
  };
  // Refleja los cambios automáticos mientras el panel está abierto
  const timer = setInterval(paintStage, 3000);
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
          <button type="button" role="tab" data-venue="kennedy">Mercado Kennedy</button>
          <button type="button" role="tab" data-venue="new">Otro nombre</button>
        </div>
        <p class="muted small" id="venue-note" style="margin-top:8px"></p>
        <input type="hidden" name="theme" value="frida">
      </div>
      <label class="f" id="pname-wrap" hidden>Nombre del bingo<input type="text" name="name" maxlength="60" value="Los Juegos de Frida"></label>
      <label class="f" id="ptheme-wrap" hidden>Colores en pantalla<select id="ptheme">
        <option value="frida">Magenta (como Frida)</option><option value="tobalaba">Rojo (como Tobalaba)</option><option value="kennedy">Celeste azulado (como Mercado Kennedy)</option></select></label>
      <label class="f">Número de participantes <span class="hint">de 25 a 3.000</span><input type="number" name="count" min="25" max="3000" value="320" required></label>
      <div class="wide"><button class="primary big">Crear juego</button></div>
    </form>`;
  const f = $('#f');
  // Copia de eventos (Cote, 27 nov: «una sala aparte… para eventos externos»): en vez del local, el nombre del evento
  const ev = !!(await fetch('/api/tema', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}))).evento;
  if (ev) {
    f.querySelector('.wide').outerHTML = `<label class="f wide">Nombre del evento<input type="text" id="evname" maxlength="45" required placeholder="Ej.: Colada Continua"></label>
      <p class="muted small wide" id="ev-note">La sala se llamará «Los Juegos de …» y el bingo «El Bingo de …».</p>`;
    $('#pname-wrap').remove(); $('#ptheme-wrap').remove();
    f.insertAdjacentHTML('afterbegin', '<input type="hidden" name="theme" value="evento"><input type="hidden" name="name" value="">');
    $('#evname').oninput = (e) => { const n = e.target.value.trim(); f.name.value = n ? `Los Juegos de ${n}` : ''; $('#ev-note').textContent = n ? `La sala se llamará «Los Juegos de ${n}» y el bingo «El Bingo de ${n}».` : 'La sala se llamará «Los Juegos de …» y el bingo «El Bingo de …».'; };
    setTimeout(() => $('#evname').focus(), 50);
  }
  // Pestañas de local: cada una fija el nombre y los colores de la pantalla; «Otro nombre» deja elegirlos
  const VENUES = { frida: ['Los Juegos de Frida', 'magenta'], tobalaba: ['Los Juegos de Tobalaba', 'rojo'], kennedy: ['Los Juegos de Mercado Kennedy', 'celeste azulado'] }; // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)
  const pickVenue = (v) => {
    $$('#venues button').forEach((b) => { b.classList.toggle('on', b.dataset.venue === v); b.setAttribute('aria-selected', b.dataset.venue === v); });
    const custom = v === 'new';
    $('#pname-wrap').hidden = !custom;
    $('#ptheme-wrap').hidden = !custom;
    if (custom) { f.name.value = ''; f.theme.value = $('#ptheme').value; $('#venue-note').textContent = 'Escribe el nombre y elige los colores de la pantalla.'; f.name.focus(); }
    else { f.name.value = VENUES[v][0]; f.theme.value = v; $('#venue-note').textContent = `Se llamará «${VENUES[v][0]}» y la pantalla saldrá en ${VENUES[v][1]}.`; }
  };
  if (!ev) {
    $('#venues').onclick = (e) => { const v = e.target.dataset.venue; if (v) pickVenue(v); };
    $('#ptheme').onchange = (e) => { f.theme.value = e.target.value; };
    pickVenue('frida');
  }
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    // Bingo clásico fijo: números del 1 al 75, encabezado BINGO, casilla central con valor y cartones desde el n.º 1
    const body = { name: d.name, theme: d.theme, count: d.count, format: 'numbers', values: 75, headers: 'BINGO', freeCenter: false, startNumber: 1 };
    // Pedido de Cote (21 nov): la sala ya no parte con el bingo. Se abre de inmediato y se va a Juegos (sortear o elegir)
    try {
      const p = await api('POST', '/api/projects', body);
      try {
        await api('POST', `/api/projects/${p.id}/session`, { name: p.name, theme: p.theme || 'frida', password: '', cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] });
      } catch (err) { await api('DELETE', `/api/projects/${p.id}`).catch(() => {}); throw err; } // si la sala no se abrió, no queda un proyecto suelto
      store.set('lastBingo', p.id);
      location.hash = '#/juegos';
    } catch (err) { fail(err); if ((await activeSessions()).length) location.hash = '#/juegos'; }
  };
};

// Juegos (pedido de Cote, 21 nov): la sala parte aquí, sin bingo. Arriba la sala y el QR de entrada; abajo el menú de
// juegos con las pestañas «Sortear juegos» / «Elegir libremente»
views.juegos = async () => {
  if (!(await isAdmin())) return viewLogin();
  const open = (await activeSessions())[0];
  if (!open) { location.hash = '#/'; return undefined; }
  store.set('lastBingo', open.projectId);
  // Pedido de Cote (21 nov): al crear la sala, tres botones y nada más (Manual, Por sorteo, Por votación)
  app.innerHTML = `<p class="back"><a href="#/">← Inicio</a></p><div id="jg-sim"></div><div id="jg-cur"></div>${activitiesNav('', { lobby: true })}
    <p class="ep-link"><a class="btn" href="#/enpiectl">🧪 Juego en prueba: 🧍 El último en pie</a></p>`;
  const venue = open.theme || 'frida';
  const paint = async () => {
    const st = await api('GET', `/api/sessions/${open.id}/host/state`).catch((err) => (err.status === 404 ? 'cerrada' : null));
    if (st === 'cerrada' && $('#jg-cur')) { location.hash = '#/'; return; } // la sala se cerró (a mano o sola a la hora de término)
    if (!st || !$('#jg-cur')) return;
    // Si hay un juego en curso, se vuelve a él con un botón grande y el menú queda plegado (para no sortear otro por error)
    const cur = st.current;
    const info = cur && (cur.game === 'enpie' ? { icon: '🧍', name: 'El último en pie', href: '#/enpiectl' } : cur.game === 'desafio' ? { icon: '🏆', name: '¿Quién quiere ser ganador?', href: '#/desafioctl' } : GAME_INFO(venue)[cur.game]);
    const href = !cur ? '' : cur.game === 'bingo' ? `#/anfitrion/${open.projectId}` : cur.wheel ? `#/ruedactl/${cur.wheel}` : info.href;
    const html = cur ? `<a class="home-create open ctl-go paso" data-paso="8" href="${href}"><span>▶</span>Volver al juego en curso: ${info.icon} ${esc(info.name)}</a>` : '';
    if ($('#jg-cur').innerHTML !== html) $('#jg-cur').innerHTML = html;
    window.setNavFold(!!cur);
  };
  await paint();
  api('GET', '/api/sim').then((sim) => { if (sim && sim.on && sim.sid === open.id && $('#jg-sim')) $('#jg-sim').innerHTML = `<p class="sim-bar">🤖 <b>Sala simulada</b> · ${sim.n} personas virtuales jugando. Para terminar, cierra la sala en el Centro de control.</p>`; }).catch(() => {});
  const t = setInterval(() => { paint(); paintGameNav(); }, 4000); // también lo que se haga desde otro equipo (iPad)
  return () => clearInterval(t);
};
// Figura del bingo cuando el bingo sale en el sorteo o se elige (antes del primer número)
views.figura = async (pid) => {
  if (!(await isAdmin())) return viewLogin();
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) { location.hash = '#/'; return undefined; }
  const info = await api('GET', `/api/sessions/${p.sessionId}/host`);
  if (info.roundOver) { location.replace(`#/ronda/${pid}`); return undefined; }
  if (info.started) { location.replace(`#/anfitrion/${pid}`); return undefined; }
  app.innerHTML = `<p class="back"><a href="#/juegos">← Juegos</a></p><h1>${esc(bingoName(p.name))}</h1>
    <form class="panel" id="f"><h2>¿Qué figura se juega?</h2>${patternPicker(info.patterns)}
      <button class="primary big paso">Empezar el bingo</button></form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    const patterns = readPatterns(e.target);
    if (!patterns) return;
    try {
      await api('POST', `/api/sessions/${p.sessionId}/host/patterns`, { patterns });
      await api('POST', '/api/stage', { show: 'bingo' }).catch(() => {});
      location.hash = `#/anfitrion/${pid}`;
    } catch (err) {
      fail(err);
      if (/ya empezó/.test(err.message)) location.hash = `#/anfitrion/${pid}`; // otro equipo ya sacó un número: se sigue en el panel
    }
  };
  return undefined;
};
views.anfitrion = async (pid) => {
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) return hostSetup(p);
  // El panel del bingo se abre cuando el bingo empezó (figura elegida); antes se elige la figura
  const info = await api('GET', `/api/sessions/${p.sessionId}/host`).catch(() => null);
  if (info && !info.started && !info.roundOver) { location.replace(`#/figura/${pid}`); return undefined; } // sin quedar en el historial
  return hostConsole(p);
};

// Proyecto sin sala (desde «Mis proyectos»): se abre la sala y se va a Juegos, sin bingo (pedido de Cote, 21 nov)
function hostSetup(p) {
  app.innerHTML = `
    ${BACK}<h1>${esc(p.name)}</h1>
    <form class="panel" id="f">
      <p class="muted small">${p.cards.length} cartones, uno por participante.</p>
      <button class="primary big">🎮 Crear sala de juegos</button>
    </form>`;
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api('POST', `/api/projects/${p.id}/session`, { name: p.name, theme: p.theme || 'frida', password: '', cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] });
      store.set('lastBingo', p.id);
      location.hash = '#/juegos';
    } catch (err) { fail(err); }
  };
}

// Panel del bingo en curso: solo lo que el animador usa durante el juego.
// Enlaces, QR, textos de la gráfica y cierre de sesión están en «Administración».
// Instrucciones y criterios para el animador, al partir cada juego (pedido de Cote): cortas y precisas, para leer en voz alta
window.readAloud = (game, lines) => `<details class="panel howto" open><summary>📢 Instrucciones · ${esc(game)}</summary><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul></details>`;
// Pedido de Cote (20 nov): las instrucciones en pantalla van ordenadas, cada una en su línea, sin pasarse para abajo:
// si no cabe en el ancho de la pantalla, se achica la letra
// Top 5 de la Trivia en el celular (pedido de Code 2 por Code 0, 28 nov; regla de Cote: nombres siempre completos): si un
// nombre no cabe, se achica la letra en vez de cortarlo con «…»
window.fitTopNames = (root) => { if (root) root.querySelectorAll('.pcrowd-top span').forEach((el) => window.fitOneLine(el, 9)); };
window.fitOneLine = (el, min = 9) => {
  if (!el || !el.isConnected) return;
  el.style.fontSize = '';
  let fs = parseFloat(getComputedStyle(el).fontSize) || 20;
  while (el.scrollWidth > el.clientWidth + 1 && fs > min) { fs -= 1; el.style.fontSize = `${fs}px`; }
};
// Instrucciones de El Rosko: las usan el panel (wheel-ui.js) y los celulares
window.ROSCO_HOWTO = [
  '3 participantes.',
  'Todos juegan desde las mesas.',
  '<b>Premio mayor</b> para el que gana El Rosko.',
  '<b>Premio especial</b> para el ganador del público que juega la Trivia del Rosko.',
];
const BINGO_HOWTO = [
  'Todos juegan desde las mesas, con su cartón en el celular.',
  'Gana quien complete primero la <b>figura</b>.',
  'Empate: sorteo.',
]
async function hostConsole(p) {
  const sid = p.sessionId;
  store.set('lastBingo', p.id); // para el botón «Volver al bingo» del sorteo y del rosko
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
            <button class="primary paso" data-paso="1" id="tiebreak" hidden>🎲 Desempatar por sorteo</button>
            <div class="win-actions" id="win-actions" hidden>
              <button id="confirmwin" class="paso" data-paso="2">✔ Confirmar ganador</button>
              <button id="keepplaying">▶ Seguir jugando</button>
            </div>
            <div id="win-confirmed" hidden>${activitiesNav('bingo')}</div>
          </div>
          <div class="row" style="justify-content:center;margin-top:16px"><button id="bigqr"></button></div>
          <div class="row" style="justify-content:center;margin-top:12px"><button class="primary big paso" id="gen">Generar un número</button></div>
          <p class="publico-hint" id="publico-hint" hidden>Llevas los primeros números desde el escenario. Ahora baja al público: anda mesa por mesa preguntando los números y vuelve al escenario cuando haya ganador.</p>
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
      <div id="win-ann"></div>
      ${activitiesNav('bingo')}
      <p class="small an-hide" style="text-align:center;margin-top:22px"><a href="#/admin/${p.id}">⚙️ Administración</a></p>
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
    $('#gen').disabled = st.drawn.length >= st.values || (st.auto.on && !(st.publico && st.publico.due)) || st.winConfirmed; // ganador confirmado = sorteo terminado
    $('#auto').disabled = !!st.winConfirmed;
    // «Anda al público» (pedido de Cote, 24 nov, para las luces): después de los primeros ocho números, el mismo botón verde
    // pide bajar al público y no deja seguir hasta aceptarlo; las luces pasan a seguir al animador por el salón
    const publico = !!(st.publico && st.publico.due);
    $('#gen').dataset.publico = publico ? '1' : '';
    $('#publico-hint').hidden = !publico;
    $('#gen').textContent = st.winConfirmed ? 'Sorteo terminado' : publico ? '🚶 Anda al público' : 'Generar un número';
    $('#gen').classList.toggle('paso', !st.winConfirmed); // con el ganador confirmado ya no es el paso que sigue
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
    $('#tiebreak').textContent = st.tieWinner && Date.now() - st.tieWinner.at < st.rollMs ? '🎲 Sorteando en pantalla…' : st.tieWinner ? '🎲 Volver a desempatar' : '🎲 Desempatar por sorteo';
    // El resultado se muestra al animador cuando la tómbola ya terminó en pantalla
    const tieDone = st.tieWinner && Date.now() - st.tieWinner.at >= st.rollMs;
    // Con el desempate hecho, el paso que sigue (el botón verde) es «Confirmar ganador», no volver a desempatar; mientras
    // gira la tómbola no se puede volver a sortear (simulación del 26 nov: el verde se quedaba en «Volver a desempatar»)
    const tieRolling = !!(st.tieWinner && !tieDone);
    $('#tiebreak').classList.toggle('paso', !st.tieWinner || tieRolling);
    $('#tiebreak').disabled = tieRolling;
    if (tieRolling) $('#gen').disabled = true; // mientras gira la tómbola del desempate no se sacan números
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
    const confirmedWins = results.filter((r) => r.validated && r.confirmed);
    const annKey = confirmed ? JSON.stringify(confirmedWins.map((r) => [r.name, r.cardNo])) : '';
    if ($('#win-ann').dataset.k !== annKey) {
      $('#win-ann').dataset.k = annKey;
      $('#win-ann').innerHTML = confirmed ? window.annHtml(confirmedWins.length > 1 ? '🏆 ¡Bingo! Ganaron' : '🏆 ¡Bingo! Ganó', confirmedWins.map((r) => r.name || 'Participante'),
        [`Cartón ${confirmedWins.map((r) => `#${p.startNumber + r.cardNo - 1}`).join(' · ')}${confirmedWins.length === 1 && confirmedWins[0].place ? ` · 📍 ${confirmedWins[0].place}` : ''}`, `Figura: ${(PATTERNS.byId[st.patterns[0]] || {}).name || ''}`]) : '';
    }
    $('#final').innerHTML = st.finalists ? `<p><b>Selección final:</b> ${st.finalists.map((c) => '#' + (p.startNumber + c - 1)).join(', ') || 'no hay cartones validados'}</p>` : '';
    if (st.drawn.length !== spoken) { if (spoken >= 0 && st.drawn.length > spoken) speak(speakText(st, st.drawn.at(-1))); spoken = st.drawn.length; }
  };
  $('#gen').onclick = () => act($('#gen').dataset.publico ? 'publico' : 'draw');
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
      <button class="primary big paso">Iniciar la ronda ${next}</button>
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
  if (token) me = await api('POST', `/api/sessions/${sid}/join`, { token, vid: window.vid() }).catch(() => null);
  if (!me) {
    let info;
    try { info = await api('GET', `/api/sessions/${sid}`); } catch { backToStart(); return undefined; }
    const priv = await window.privLine();
    app.innerHTML = `<form class="panel" id="f" style="max-width:460px;margin:0 auto">
      <h1>${esc(info.name)}</h1><p class="muted">Recibirás ${info.cardsPerPlayer} ${info.cardsPerPlayer > 1 ? 'cartones' : 'cartón'} en este dispositivo. No necesitas cuenta.</p>
      <div class="fields" style="grid-template-columns:1fr">
        <label class="f">Nombre<input type="text" name="name" maxlength="20" autocomplete="given-name" autocapitalize="words" value="${esc(store.get('playerFirst') || '')}" required autofocus></label>
        <label class="f">Apellido<input type="text" name="surname" maxlength="25" autocomplete="family-name" autocapitalize="words" value="${esc(store.get('playerLast') || '')}" required></label>
        ${info.places && info.places.length ? `<label class="f">¿Dónde estás?<select name="place" required><option value="">Elige tu lugar</option>${info.places.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>` : ''}
        ${info.locked ? '<label class="f">Contraseña de la sesión<input type="text" name="password" required></label>' : ''}
        <button class="primary big">Unirse</button>${priv}
      </div></form>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', `/api/sessions/${sid}/join`, { ...Object.fromEntries(new FormData(e.target)), vid: window.vid() });
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
    <div class="pvote penpie" id="penpie" hidden></div>
    <div class="pvote pinsta" id="pinsta" hidden></div>
    <div class="pvote pgvote" id="pgvote" hidden></div>
    <div class="pvote pact" id="pact" hidden></div>
    <div class="pvote pdesafio" id="pdesafio" hidden></div>
    <div id="bingo-bottom"><button class="primary big" id="sync" style="margin-top:16px">↻ Actualizar y marcar lo que falta</button>
    <p class="muted small" style="margin-top:8px">Marca por ti los valores ya anunciados que se te pasaron.</p>
    <div class="panel" style="margin-top:20px"><h2 id="title" style="margin:0"></h2><span class="muted small" id="meta"></span><div id="pats" style="margin-top:8px"></div></div></div>
    <div class="live" id="live"><div id="live-player"></div>
      <div class="live-bar"><button type="button" id="live-audio">🔇 Activar audio</button><button type="button" id="live-full">⛶ Pantalla completa</button><button type="button" id="live-sync" class="wide">↻ Poner al día el video</button></div></div>
    <div id="kids-slot">${window.krbKidsButton ? window.krbKidsButton() : '<a class="btn kids-entry" href="#/kids">🧸 <b>KRB Kids</b><span>Zona de niños</span></a>'}</div>`;
  // Durante El Rosko: se guarda el cartón y quedan el video y, debajo, la pregunta en juego
  let roscoEs = null;
  let roscoId = null;
  let rosco = null;
  let roscoTick = null;
  const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const roscoLeft = () => {
    const c = rosco.players[rosco.turn];
    return rosco.runningSince ? c.remainingMs - (Date.now() - rosco.gotAt + rosco.now - rosco.runningSince) : c.remainingMs;
  };
  // Rosko en línea: lo que esta persona respondió (pregunta → alternativa), en orden, y su puntaje
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
    if (rosco.crowdWinner) return ''; // el ganador de la Trivia ya sale arriba (crowdWin), una sola vez
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
    if (!rosco) { $('#prosco').innerHTML = '<p class="muted">Cargando El Rosko…</p>'; return; }
    const c = rosco.players[rosco.turn];
    const reveal = ''; // en el celular no se muestra la respuesta correcta: solo si la propia alternativa fue verde o roja
    // Pedido de Cote (21 nov): el ganador de la Trivia del Rosko también en los celulares (y si es esta persona, ¡ganaste!)
    const cw0 = rosco.crowdWinner;
    // Mientras gira la «tómbola» del ganador de la Trivia en pantalla, el celular no adelanta el nombre (Cote, 24 nov)
    const cwRollLeft = cw0 && !cw0.none && cw0.rollMs ? cw0.rollMs - ((rosco.now || Date.now()) - cw0.at) : 0;
    if (cwRollLeft > 200) { clearTimeout(window.__pcwT); window.__pcwT = setTimeout(() => { if (rosco && rosco.crowdWinner === cw0) { rosco = { ...rosco, now: (rosco.now || Date.now()) + cwRollLeft + 100 }; drawRosco(); } }, cwRollLeft + 100); }
    const cw = cwRollLeft > 200 ? null : cw0;
    const crowdWin = cwRollLeft > 200 ? '<div class="prosco-win">🥁 Trivia del Rosko<small>¡Ya viene el ganador! Mira la pantalla</small></div>' : cw ? (cw.none ? '<div class="prosco-win">🏅 Trivia del Rosko<small>Esta vez nadie sumó puntos</small></div>'
      : `<div class="prosco-win">🏅 ${esc(cw.name)}<small>${String(cw.name).toLowerCase() === String(me.name || '').toLowerCase() ? '¡Ganaste la Trivia del Rosko!' : '¡Ganó la Trivia del Rosko!'} ${cw.score} puntos</small></div>`) : '';
    const body = crowdWin + (rosco.winner ? `<div class="prosco-win">🏆 ${esc(rosco.winner.name)}<small>${rosco.winner.full ? '¡Completó el rosko!' : '¡Ganó El Rosko!'}</small></div>`
      : rosco.tie ? `<div class="prosco-wait">Empate entre ${window.yJoin(rosco.tie.names.map(esc))}. Se define por sorteo.</div>`
      : rosco.finished ? '<div class="prosco-wait">Juego terminado</div>'
      : `<div class="prosco-q"><span class="prosco-letter">${esc(rosco.letters[c.current])}</span>
          <p>${rosco.question ? esc(rosco.question) : '<span class="muted">Esperando la siguiente pregunta…</span>'}</p></div>`);
    // Los 5 primeros del público con su puntaje y, en la sexta fila y con otro color, el puesto de esta persona
    const mine = crowdInfo && crowdInfo.me;
    const inTop = mine && mine.rank <= 5 && mine.score > 0;
    const top = !rosco.rank && crowdInfo && ((crowdInfo.top && crowdInfo.top.length) || mine) ? `<div class="pcrowd-top"><small>Top 5</small>${(crowdInfo.top || []).map((t, i) => `<div class="${inTop && i === mine.rank - 1 ? 'me' : ''}"><em>${i + 1}</em><span>${esc(t.name)}</span><b>${t.score}</b></div>`).join('')}
      ${mine && !inTop ? `<div class="you"><em>${mine.rank}.º</em><span>${esc(me.name)}</span><b>${mine.score}</b></div>` : ''}</div>` : '';
    // Pedido de Cote (21 nov): al desplegar el ranking de la Trivia (botón del animador), también sale en todos los celulares
    const meName = String(me.name || '').toLowerCase();
    const rankBox = rosco.rank ? `<div class="pcrowd-rank"><small>🏅 Trivia del Rosko · Top 10</small><b>${rosco.crowdWinner || rosco.winner ? 'Resultados finales' : 'Resultados parciales'}</b>
      ${rosco.rank.length ? rosco.rank.map((t, i) => `<div class="${String(t.name).toLowerCase() === meName ? 'me' : ''}"><em>${i + 1}.º</em><span>${esc(t.name)}</span><b>${t.score}</b></div>`).join('') : '<p class="muted">Todavía nadie suma puntos</p>'}
      ${mine && mine.rank > 10 && mine.score > 0 ? `<div class="you"><em>${mine.rank}.º</em><span>${esc(me.name)}</span><b>${mine.score}</b></div>` : ''}</div>` : '';
    $('#prosco').innerHTML = `<div class="prosco-head big"><b>Trivia del Rosko</b><span></span><span class="prosco-clock" id="prosco-clock">${rosco.winner || rosco.finished ? '' : fmtClock(roscoLeft())}</span></div>
      ${rankBox}${body}${reveal}${crowdHTML()}
      ${top}`;
    window.fitTopNames($('#prosco'));
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
    const on = st.stage === 'karaoke' || !!st.luzKar; // también con el karaoke de la sala light en pantalla (un solo QR, Cote 28 nov)
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
  // Pedido de Cote (21 nov): en todo momento el celular muestra el nombre de la actividad y lo que viene; el cartón del
  // bingo solo mientras se juega el bingo. Sorteo de concursantes, sorteo del próximo juego, QR, show o espera entre juegos
  let actTimer = null; let actKey = ''; let actShown = ''; let actSoon = null;
  // «El último en pie» (versión de prueba): el celular muestra la pregunta, sus vidas y el ranking
  let epTimer = null; let epRev = null;
  const syncEnpie = () => {
    const on = st.stage === 'enpie';
    $('#penpie').hidden = !on;
    if (on && !epTimer) { window.phoneEnpie.reset(); epRev = null; epTimer = setInterval(() => window.phoneEnpie.draw(sid, me.token), 6000); }
    if (on && epRev !== st.enpieRev) { epRev = st.enpieRev; window.phoneEnpie.draw(sid, me.token); }
    if (!on && epTimer) { clearInterval(epTimer); epTimer = null; }
    return on;
  };
  // ¿Quién quiere ser ganador?: se guarda el cartón; los botones A, B, C y D aparecen con la pregunta al público (desafio-ui.js)
  let desafioTimer = null;
  let desafioRev = null;
  const syncDesafio = () => {
    const on = st.stage === 'desafio';
    $('#pdesafio').hidden = !on;
    if (on && !desafioTimer) { window.phoneDesafio.reset(); desafioRev = null; desafioTimer = setInterval(() => window.phoneDesafio.draw(sid, me.token), 8000); }
    if (on && desafioRev !== st.desafioRev) { desafioRev = st.desafioRev; window.phoneDesafio.draw(sid, me.token); }
    if (!on && desafioTimer) { clearInterval(desafioTimer); desafioTimer = null; }
    return on;
  };
  const actOf = () => {
    const s = st.stage || 'bingo';
    if (['sorteo', 'juego', 'qr', 'show', 'none'].includes(s)) return s;
    if (s === 'rueda' && !st.roscoId) return 'rueda';
    if (s === 'bingo' && !st.started && !st.winConfirmed && !(st.drawn || []).length) return 'espera'; // sala abierta, aún sin juego
    if (s === 'bingo' && st.winConfirmed) return 'bingofin'; // bingo con ganador confirmado: el resultado y lo que viene
    return '';
  };
  const venueShort = () => (st.theme === 'evento' ? String(st.name || '').replace(/^Los Juegos de /, '') : ({ frida: 'Frida', kennedy: 'Mercado Kennedy', tobalaba: 'Tobalaba' })[st.theme] || 'Frida');
  const drawAct = async () => {
    const box = $('#pact');
    if (!box || box.hidden) return;
    const k = actKey;
    let head = ''; let body = '';
    if (k === 'sorteo') {
      const r = await api('GET', '/api/raffle').catch(() => null);
      if (!r || actKey !== k) return;
      const rolling = r.roll && (r.now || Date.now()) < r.roll.at + (r.rollMs || 6000) + 500; // con la hora del servidor
      // Al terminar la tómbola se vuelve a leer enseguida (con una pequeña espera distinta en cada celular), sin esperar la próxima vuelta
      clearTimeout(actSoon);
      if (rolling) actSoon = setTimeout(drawAct, Math.max(0, r.roll.at + (r.rollMs || 6000) + 500 - (r.now || Date.now())) + 100 + Math.random() * 900);
      if (r.mode === 'tie') {
        const isRosco = r.roll && r.roll.game === 'rosco'; // El Rosko usa el mismo sorteo para su desempate
        head = isRosco ? '🎡 El Rosko · Desempate' : '🎲 Desempate del bingo';
        body = `<p class="pvote-wait">${rolling ? '🎲 Sorteando en pantalla…' : r.roll && r.roll.winner ? `${isRosco ? 'Ganó El Rosko' : 'Ganó el desempate'}:<br><b>${esc(r.roll.winner)}</b>` : isRosco ? 'Se sortea el ganador entre los concursantes empatados.' : 'Se sortea el ganador entre los cartones empatados.'}</p>`;
      } else {
        const picked = r.picked || [];
        const same = (n) => String(n).toLowerCase() === String(me.name || '').toLowerCase();
        const myName = rolling ? null : picked.find(same);
        const seen = rolling ? picked.filter((n) => n !== r.roll.winner) : picked; // mientras gira la tómbola no se adelanta el nombre
        const myState = myName ? (r.confirm || {})[myName] : null;
        const iDeclined = (r.declined || []).some(same);
        // El mismo sorteo sirve para El Rosko y para ¿Quién quiere ser ganador? (principal y suplente; pedido de Cote, 25 nov)
        const des = r.game === 'desafio';
        const gName = des ? '¿Quién quiere ser ganador?' : 'El Rosko';
        const trivia = des ? 'la Trivia del Ganador' : 'la Trivia del Rosko';
        const role = (i) => `${i + 1}.º`;
        const myRole = myName && des && picked.indexOf(myName) > 0 ? ' como reemplazo' : '';
        head = `🎲 Sorteo de concursantes · ${gName}`;
        // Pedido de Cote (21 nov): quien sale sorteado confirma si quiere jugar en el escenario o prefiere jugar online
        body = (myName && myState !== 'ok' ? `<div class="pvote-win">🎉 ¡Saliste sorteado${myRole}!<small>Para jugar ${gName} en nuestro escenario</small></div>
            <p class="pvote-ask">¿Quieres jugar?</p><div class="pact-yesno"><button type="button" class="primary big" data-raffle="1">✅ Sí, quiero jugar</button><button type="button" class="big" data-raffle="0">🙅 No, gracias, prefiero jugar online</button></div>`
          : myName ? `<div class="pvote-win">✅ ¡Confirmado${myRole}!<small>Acércate a nuestro escenario para jugar ${gName}</small></div>`
            : iDeclined ? `<p class="pvote-ask">👍 Elegiste jugar online<b>Juega ${trivia} desde tu celular</b></p>`
              : '<p class="pvote-ask">¡Prepárate!<b>Puedes salir elegido para participar en nuestro escenario</b></p>') +
          (rolling ? '<p class="pvote-wait">🎲 Sorteando en pantalla…</p>' : '') +
          (seen.length ? `<div class="pact-list"><small>Ya salieron</small>${seen.map((n, i) => `<p><em>${role(i)}</em><span>${esc(n)}</span><i>${(r.confirm || {})[n] === 'ok' ? '✅' : '⏳'}</i></p>`).join('')}</div>` : '') +
          `<p class="pact-next">Después: <b>${des ? '🏆' : '🎡'} ${gName}</b> · y tú juegas ${trivia} desde el celular</p>`;
      }
    } else if (k === 'juego') {
      const g = await api('GET', '/api/gamedraw').catch(() => null);
      if (!g || actKey !== k) return;
      const info = GAME_INFO(g.venue);
      const ready = g.ready && (!g.last || g.ready.at > g.last.at);
      const rolling = !ready && g.last && !g.last.direct && (g.now || Date.now()) < g.last.at + 4800;
      head = '🎲 Sorteo del próximo juego';
      body = ready || rolling ? '<p class="pvote-wait">Mira la pantalla: la tómbola elige el próximo juego…</p>'
        : g.last ? `<p class="pvote-ask">El próximo juego es<b>${info[g.last.game].icon} ${esc(info[g.last.game].name)}</b></p><p class="pact-next">¡Prepárate!</p>` : '<p class="pvote-wait">Mira la pantalla: ya viene el sorteo del próximo juego.</p>';
    } else if (k === 'qr') {
      head = '📱 Invita a tus amigos';
      body = '<p class="pvote-wait">Que escaneen el código QR de la pantalla para entrar a la sala.</p><p class="pact-next">Ya viene el próximo juego</p>';
    } else if (k === 'show') {
      head = '⭐ Show en vivo';
      body = '<p class="pvote-wait">¡Disfruta el show!</p><p class="pact-next">Después siguen los juegos</p>';
    } else if (k === 'bingofin') {
      const wins = (st.results || []).filter((x) => x.validated && !x.dismissed);
      const names = [...new Set(wins.map((x) => x.name).filter(Boolean))];
      head = `🎱 ${bingoName(st.name)}`;
      body = (wins.some((x) => marks[x.cardNo]) ? '<div class="pvote-win">🎉 ¡BINGO!<small>¡Ganaste el bingo!</small></div>'
        : `<p class="pvote-ask">¡Tenemos ganador!${names.map((n) => `<b>${esc(n)}</b>`).join('')}</p>`) +
        '<p class="pact-next">Ya viene el próximo juego</p>';
    } else if (k === 'rueda') {
      head = '🎡 El Rosko';
      body = '<p class="pvote-wait">Ya viene el sorteo de concursantes: ¡puedes salir elegido para participar en nuestro escenario!</p>';
    } else {
      head = `🎮 Los Juegos de ${venueShort()}`;
      body = '<p class="pvote-ask">¡Ya estás en la sala!<b>Mira la pantalla: ya viene el próximo juego</b></p><p class="pact-next">Bingo, El Rosko, El Festival o El objeto más extraño</p>';
    }
    const html = `<div class="pvote-head"><b>${esc(head)}</b></div>${body}`;
    if (html !== actShown) { actShown = html; box.innerHTML = html; }
    box.onclick = async (e) => {
      const b = e.target.closest('[data-raffle]');
      if (!b) return;
      box.querySelectorAll('[data-raffle]').forEach((x) => { x.disabled = true; });
      try { await api('POST', '/api/raffle/answer', { sid, token: me.token, play: b.dataset.raffle === '1' }); } catch (err) { fail(err); }
      actShown = ''; drawAct();
    };
  };
  const syncAct = () => {
    const k = actOf();
    $('#pact').hidden = !k;
    if (k !== actKey) { actKey = k; actShown = ''; clearInterval(actTimer); actTimer = null; if (k) { drawAct(); if (k === 'sorteo' || k === 'juego') actTimer = setInterval(drawAct, 3000); } } else if (k === 'bingofin') drawAct(); // por si se confirma otro ganador
    return !!k;
  };
  // Votación del próximo juego (pedido de Cote, 21 nov): los juegos para votar; se vuelve a leer al abrir o cerrar cada
  // vuelta (gameVoteRev) y, por si acaso, cada 8 segundos
  let gvRev = null; let gvTimer = null;
  const syncGvote = () => {
    const on = st.stage === 'votojuego';
    $('#pgvote').hidden = !on;
    if (on && !gvTimer) { window.phoneGvote.reset(); gvRev = null; gvTimer = setInterval(() => window.phoneGvote.draw(sid, me.token), 8000); }
    if (on && gvRev !== st.gameVoteRev) { gvRev = st.gameVoteRev; window.phoneGvote.draw(sid, me.token); }
    if (!on && gvTimer) { clearInterval(gvTimer); gvTimer = null; window.phoneGvote.stop(); }
    return on;
  };
  // Instrucciones en el celular (pedido de Cote, 20 nov): al empezar cada juego (y al entrar a la sala) aparecen
  // 2 segundos las instrucciones del juego en curso: Bingo (cada ronda), El Rosko, El Festival o El objeto más extraño
  // Cada juego tiene su propia clave: bingo por ronda (desde que se elige la figura), El Rosko por rosco cargado y la votación
  // por concurso (voteGen); cada clave se muestra una sola vez (volver a un juego que sigue no las repite)
  let howtoKey = null;
  const howtoShown = new Set();
  const phoneHowto = (title, lines) => {
    let el = document.getElementById('phone-howto');
    if (el) el.remove();
    el = document.createElement('div'); el.id = 'phone-howto';
    el.innerHTML = `<div class="ph-card"><small>📢 Instrucciones</small><b>${esc(title)}</b><ul>${lines.map((l) => `<li>${l}</li>`).join('')}</ul><i class="ph-bar"></i></div>`;
    document.body.appendChild(el);
    // Pedido de Cote (21 nov): desaparece a los 2 segundos, o antes si la persona toca el mensaje o cualquier parte de la
    // pantalla (el aviso cubre toda la pantalla: ese toque solo lo cierra, no aprieta lo que está debajo)
    const close = () => { if (el.isConnected) el.remove(); };
    // Con el dedo se cierra apenas toca (también al empezar a deslizar), y se anula el clic: así, aunque el dedo se levante
    // justo cuando el aviso ya se fue, el toque no cae en la casilla, la votación o la Trivia de abajo
    el.addEventListener('touchstart', (e) => { e.preventDefault(); close(); }, { passive: false });
    el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); close(); });
    setTimeout(close, 2000);
  };
  const syncHowto = async () => {
    const s = st.stage || 'bingo';
    const key = st.stageDone ? null : s === 'desafio' && st.desafioGen ? `desafio:${st.desafioGen}` : s === 'rueda' && st.roscoId ? `rosco:${st.roscoId}` : s === 'voto' ? `voto:${st.voteGen}` : s === 'bingo' && st.started && !st.winConfirmed ? `bingo:${st.round}` : null;
    if (!key || howtoShown.has(key)) return;
    howtoShown.add(key); howtoKey = key;
    if (key.startsWith('voto')) {
      const v = await api('GET', '/api/vote').catch(() => null);
      if (!v || !window.voteHowto || howtoKey !== key) return;
      const h = window.voteHowto(v); phoneHowto(h.title, h.lines);
    } else if (key.startsWith('rosco')) phoneHowto('El Rosko', window.ROSCO_HOWTO);
    else if (key.startsWith('desafio')) phoneHowto('¿Quién quiere ser ganador?', window.DESAFIO_HOWTO);
    else phoneHowto(bingoName(st.name), BINGO_HOWTO);
  };
  // Pedido de Cote (21 nov): el botón de KRB Kids no aparece durante los juegos, solo en los intermedios (sala abierta
  // esperando, QR, show, karaoke, sorteo o votación del próximo juego, y cuando un juego ya terminó)
  const syncKids = () => {
    const s = st.stage || 'bingo';
    const inGame = (s === 'bingo' && st.started && !st.winConfirmed) || s === 'sorteo' || (s === 'rueda' && !!st.roscoId && !st.stageDone) || (s === 'voto' && !st.stageDone) || (s === 'enpie' && !st.stageDone) || (s === 'desafio' && !st.stageDone);
    const slot = $('#kids-slot');
    if (slot) slot.hidden = inGame;
  };
  const syncStage = () => {
    syncHowto();
    syncKids();
    const kar = syncKar() | syncVote() | syncEnpie() | syncInsta() | syncGvote() | syncAct() | syncDesafio();
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
    roscoEs.onmessage = (e) => { const d = JSON.parse(e.data); if (d.closed || !d.players) { stopRosco(); return; } rosco = { ...d, gotAt: Date.now() }; drawRosco(); crowdSoon(); }; // un rosko borrado avisa «closed»
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
    $('#pats').innerHTML = st.started ? patternsInline(st.patterns) : ''; // la figura se ve cuando el bingo empieza
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
      return cardHTML(st, c.cells, { no: me.startNumber + c.no - 1, marks: m, green, hint: st.started ? bestFor(m) : 0, note: st.started ? noteFor(m) : '' });
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
  return () => { off(); stopRosco(); clearInterval(karTimer); clearInterval(voteTimer); clearInterval(instaOn); clearInterval(gvTimer); window.phoneGvote.stop(); clearInterval(actTimer); clearInterval(desafioTimer); liveFor = null; player = null; document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('visibilitychange', onBack); document.body.classList.remove('live-open'); };
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
    // Incorrecta (Cote, 24 nov: no se oía): zumbido de dos tonos que bajan, en tonos medios para que suene en cualquier parlante
    miss: () => { note(415, 0, 0.3, 'sawtooth', 0.3, 370); note(830, 0, 0.3, 'square', 0.07, 740); note(311, 0.32, 0.6, 'sawtooth', 0.32, 262); note(622, 0.32, 0.6, 'square', 0.08, 523); },
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
    // Temblor (El último en pie): el piso se sacude y la gente cae
    rumble: () => { noise(0, 1.5, 0.5, 140, 0.7); noise(0.1, 1.2, 0.25, 420, 0.6); note(52, 0, 1.4, 'sawtooth', 0.3, 34); note(70, 0.2, 1.1, 'triangle', 0.25, 45); },
    win: () => {
      [523, 659, 784].forEach((f, i) => { note(f, i * 0.14, 0.2, 'sawtooth', 0.16); note(f, i * 0.14, 0.2, 'square', 0.08); });
      [1047, 784, 659, 523].forEach((f) => { note(f, 0.42, 1.6, 'sawtooth', 0.13); note(f * 2, 0.42, 1.2, 'sine', 0.06); });
      [1319, 1568, 2093].forEach((f, i) => note(f, 0.9 + i * 0.12, 0.6, 'sine', 0.14));
    },
  };
  const play = (name) => { if (ready() && sounds[name]) { try { sounds[name](); } catch { /* sin audio */ } } };
  // Redoble de tambores sostenido (pedido de Cote, 23 nov: «cuando se va a revelar el ganador del Festival… tiene que haber
  // un redoble de tambores que suene»): golpes de caja hechos con ruido (se oyen bien en cualquier parlante; el redoble
  // anterior era de tonos graves, casi mudo en parlantes chicos), cada vez más rápidos y fuertes, que siguen sonando hasta
  // que se revela al ganador (tope 45 s); al parar, un golpe de platillo.
  let noiseBuf = null; let rollTimer = null;
  const noise = (at, dur, vol, freq, q) => {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = Math.max(ctx.currentTime, ctx.currentTime + at);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = q ? 'bandpass' : 'highpass'; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  };
  const snare = (at, vol) => { noise(at, 0.085, vol, 2200, 0.9); note(210, Math.max(0, at), 0.06, 'triangle', vol * 0.5, 150); };
  const roll = (on) => {
    const was = !!rollTimer;
    clearInterval(rollTimer); rollTimer = null;
    if (!on) { if (was && ready()) { try { noise(0, 1.6, 0.3, 5200, 0); note(60, 0, 0.5, 'sine', 0.4, 40); } catch { /* sin audio */ } } return; }
    if (!ready()) return;
    const t0 = ctx.currentTime; let next = 0.02;
    const sched = () => {
      try {
        const now = ctx.currentTime - t0;
        if (now > 45) { roll(false); return; }
        while (next < now + 0.7) { const k = Math.min(1, next / 3.5); snare(next - now, 0.1 + 0.26 * k); next += 0.11 - 0.062 * k; }
      } catch { /* sin audio */ }
    };
    sched(); rollTimer = setInterval(sched, 250);
  };
  // Música de un archivo (pedido de Cote, 26 nov: la cortina de la pregunta en ¿Quién quiere ser ganador?): se baja una
  // vez, suena con el mismo permiso de «Activar sonido», se repite desde `loop` segundos (sin volver a dar el golpe del
  // comienzo) y al parar se apaga de a poco. music(url, {from, loop, vol}) / music(null) la detiene.
  const bufs = {}; let cur = null;
  const music = (url, o = {}) => {
    if (cur && (!url || cur.url !== url)) {
      const c = cur; cur = null;
      try { const t = ctx.currentTime; c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(c.g.gain.value, t); c.g.gain.linearRampToValueAtTime(0.0001, t + 1.2); c.src.stop(t + 1.3); } catch { /* sin audio */ }
    }
    if (!url || (cur && cur.url === url) || !ready()) return;
    const go = (buf) => {
      if (!ready() || (cur && cur.url === url)) return;
      try {
        const src = ctx.createBufferSource(); src.buffer = buf;
        if (o.loop != null && o.loop < buf.duration - 1) { src.loop = true; src.loopStart = o.loop; src.loopEnd = buf.duration; }
        const g = ctx.createGain(); g.gain.value = o.vol || 0.7;
        src.connect(g).connect(ctx.destination); src.start(0, Math.min(o.from || 0, buf.duration - 1));
        cur = { url, src, g };
      } catch { /* sin audio */ }
    };
    if (bufs[url] && bufs[url].duration) { go(bufs[url]); return; }
    if (bufs[url]) return; // bajando
    bufs[url] = fetch(url).then((r) => r.arrayBuffer()).then((a) => new Promise((ok, ko) => ctx.decodeAudioData(a, ok, ko)))
      .then((buf) => { bufs[url] = buf; }).catch(() => { delete bufs[url]; });
  };
  return { unlock, ready, play, roll, music, playing: () => (cur ? cur.url : ''), rolling: () => !!rollTimer, played: [], ticks: 0 };
})();

// Tablero del DJ: pantalla completa (no transparente) que sigue sola lo que está pasando,
// igual que la gráfica de OBS: bingo, sorteo o desempate, El Rosko.
views.tablero = async () => {
  let current = null;
  let desIntroSeen = null; // última carga de ¿Quién quiere ser ganador? ya vista (para tocar su música del comienzo una vez)
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
  // Luces al ritmo del sonido (pedido de Code 4 y decisión de Cote, 27 nov: «las luces se disparan con el efecto de
  // sonido»): el tablero que toca los sonidos manda cada momento directo al Dell desde el local, al mismo tiempo que le
  // llega para sonar. Va con el mismo id del aviso de Render (el Dell usa el que llega primero) y con la firma de la
  // Sala (nunca la clave de las luces). Solo si este tablero suena: si no, las luces siguen con el aviso de Render.
  const sentMom = {};
  const onMomento = (e) => {
    const m = e.detail || {};
    if (mute || window.__mon || !sfx.ready() || !m.url || !m.firma || sentMom[m.id]) return;
    sentMom[m.id] = 1;
    const more = Object.keys(m.extra || {}).map((k) => `&${encodeURIComponent(k)}=${encodeURIComponent(m.extra[k])}`).join('');
    fetch(`${m.url}/api/momento?nombre=${encodeURIComponent(m.nombre)}&sala=kennedy${more}&id=${m.id}&t=${Date.now()}&desde=sonido&firma=${m.firma}`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  };
  window.addEventListener('krb-momento', onMomento);
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
      // Música del comienzo de ¿Quién quiere ser ganador? (Cote, 26 nov, por el Registro: «al iniciar el juego: desde el
      // momento en que se pone ¿Quién quiere ser ganador? y se avanza, ahí sale la cortina»): una vez, cuando el juego se
      // carga en pantalla (también si parte por el sorteo del participante); solo si fue hace menos de 20 s
      if (sr && sr.desIntro && sr.desIntro !== desIntroSeen) {
        const fresh = desIntroSeen !== null && sr.desIntroHace != null && sr.desIntroHace < 20000;
        desIntroSeen = sr.desIntro;
        if (fresh && !mute) { sfx.music('audio/desafio-intro.mp3', { vol: 1 }); setTimeout(() => { if (sfx.playing() !== 'audio/desafio-intro.mp3') sfx.music('audio/desafio-intro.mp3', { vol: 1 }); }, 1500); }
      } else if (sr && desIntroSeen === null) desIntroSeen = sr.desIntro || 0;
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
        else if (show === 'enpie') stop = await views.enpieFull();
        else if (show === 'desafio') stop = await views.desafioFull();
        else if (show === 'juego') stop = await views.juegoDraw('full');
        else if (show === 'votojuego') stop = await views.gameVote('full'); // el QR va dentro del cuadro
        else if (show === 'insta') stop = await views.instaFull();
        else if (show === 'show') stop = await views.showFull();
        else stop = await views.bingoFull(); // bingo, o la portada si no hay nada en juego
        joinQr({ sorteo: 'tr', rueda: 'tr', show: 'br', enpie: 'br' }[show]);
      }
      mark();
    } finally { busy = false; if (again) { again = false; apply(); } }
  };
  await apply();
  const timer = setInterval(apply, 2000);
  const offAviso = window.onAviso(apply);
  return () => { clearInterval(timer); offAviso(); window.gcPer.over(''); if (typeof stop === 'function') stop(); joinQr(); document.body.classList.remove('full'); soundBtn.remove(); window.removeEventListener('krb-momento', onMomento); document.removeEventListener('pointerdown', enableSound); document.removeEventListener('keydown', enableSound); };
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
      <div class="bwin-names">${shown.map((r) => `<span><b style="--n:${(r.name || 'Participante').length}">${esc(r.name || 'Participante')}</b><small>Cartón #${st.startNumber + r.cardNo - 1}${r.place ? ` · ${esc(r.place)}` : ''}</small></span>`).join('')}</div>
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

// ---------- Karaoke de Kennedy: pestaña «Luces» (pedido de Cote, 25 nov, por Claude 1 y Code 4) ----------
// «Que se pueda cambiar la pestaña… y que se transforme en la página que ve el DJ para mover las luces… Todo en un solo
// lugar». Arriba del panel, dos pestañas: «🎤 Karaoke» y «💡 Luces». Luces muestra a pantalla completa el panel del DJ de
// Code 4 (luces.krbstage.cl/dj, con la sesión que entrega el servidor); el karaoke no se pierde: el recuadro de las luces
// queda cargado y solo se oculta al volver.
function lucesTab() {
  const bar = document.createElement('div'); bar.className = 'lz-tabs';
  bar.innerHTML = '<button type="button" class="on" data-lz="kar">🎤 Karaoke</button><button type="button" data-lz="luces">💡 Luces</button>';
  app.prepend(bar);
  const box = document.createElement('div'); box.className = 'lz-box'; box.hidden = true;
  box.innerHTML = '<div class="lz-top"><button type="button" data-lz="kar">🎤 Volver al karaoke</button><b>💡 Luces · Mercado Kennedy</b><button type="button" data-lz="nuevo" title="Si el panel pide la clave">↻ Sesión nueva</button></div><div class="lz-dell"></div><div class="lz-frame"><p class="muted" id="lz-msg">Cargando el panel de las luces…</p></div>';
  app.appendChild(box);
  const load = async (nuevo) => {
    const msg = box.querySelector('#lz-msg');
    try {
      const r = await api('GET', `/api/luces/dj${nuevo ? '?nuevo=1' : ''}`);
      const old = box.querySelector('iframe'); if (old) old.remove();
      const f = document.createElement('iframe'); f.src = r.url; f.allow = 'fullscreen'; f.title = 'Panel del DJ · luces';
      box.querySelector('.lz-frame').appendChild(f);
      // Sin sesión: el panel de las luces pide la clave adentro; arriba, el motivo (para arreglarlo con Code 4 o en Render)
      if (msg) { msg.hidden = !r.aviso; msg.textContent = r.aviso || ''; msg.classList.toggle('lz-aviso', !!r.aviso); }
    } catch (err) { if (msg) { msg.hidden = false; msg.textContent = err.message; } }
  };
  const show = (luces) => {
    box.hidden = !luces; document.body.classList.toggle('lz-on', luces);
    bar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b.dataset.lz === 'luces') === luces));
    if (luces && !box.querySelector('iframe')) load(false);
  };
  const onClick = (e) => {
    const b = e.target.closest('[data-lz]'); if (!b) return;
    if (b.dataset.lz === 'nuevo') load(true); else show(b.dataset.lz === 'luces');
  };
  bar.onclick = onClick; box.onclick = onClick;
}

// Mini panel de luces (pedido de Cote, 27 nov: «abajo, 4 botones fijos a la pantalla, con Stand By, Previa, Show y Fiesta,
// todos automáticos… abajo el fader de intensidad y al lado derecho un botón pequeño apagar todo»). Manda las órdenes al
// panel de las luces de Code 4, cargado oculto (?mini=1: sin la vista 3D), que es el que sabe armar las escenas.
function lucesMini() {
  const bar = document.createElement('div'); bar.className = 'lm-bar';
  bar.innerHTML = `<p class="lm-tit">CONTROL DE LUCES BÁSICO</p><div class="lm-g">${[['Standby', '🌙'], ['Previa', '🎹'], ['Show', '🎤'], ['Fiesta', '🎉']].map(([g, i]) => `<button type="button" data-g="${g}">${i} ${g === 'Standby' ? 'Stand By' : g}</button>`).join('')}</div>
    <div class="lm-i"><span>💡</span><input type="range" min="0" max="100" value="100" aria-label="Intensidad de las luces"><b>100%</b><button type="button" class="lm-off" title="Apagar todas las luces">⏻ Apagar</button></div>
    <p class="lm-msg" hidden></p>`;
  document.body.appendChild(bar); document.body.classList.add('lm-on');
  let frame = null; let origen = '';
  const msg = (t) => { const m = bar.querySelector('.lm-msg'); m.hidden = !t; m.textContent = t || ''; };
  const mandar = (o) => { if (!frame || !origen) { msg('Conectando con las luces…'); return; } frame.contentWindow.postMessage({ krbLuces: o }, origen); };
  (async () => {
    try {
      const r = await api('GET', '/api/luces/dj');
      const u = new URL(r.url); u.searchParams.set('mini', '1'); origen = u.origin;
      frame = document.createElement('iframe'); frame.className = 'lm-frame'; frame.title = 'Luces (mini panel)'; frame.src = u.toString();
      bar.appendChild(frame);
      if (r.aviso) msg('Luces: abre la pestaña «💡 Luces» y pon la clave una vez; después recarga esta página.');
    } catch (err) { msg(`Luces: ${err.message}`); }
  })();
  const onMsg = (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== origen || !e.data || !e.data.krbLucesEstado) return;
    const st = e.data.krbLucesEstado; msg('');
    bar.querySelectorAll('[data-g]').forEach((b) => b.classList.toggle('on', b.dataset.g === st.grupo));
    const rg = bar.querySelector('input');
    if (document.activeElement !== rg && st.master != null) { rg.value = st.master; bar.querySelector('b').textContent = `${st.master}%`; }
  };
  window.addEventListener('message', onMsg);
  bar.querySelectorAll('[data-g]').forEach((b) => { b.onclick = () => { bar.querySelectorAll('[data-g]').forEach((x) => x.classList.toggle('on', x === b)); mandar({ grupo: b.dataset.g }); }; });
  let t = null;
  bar.querySelector('input').oninput = (e) => { bar.querySelector('b').textContent = `${e.target.value}%`; clearTimeout(t); t = setTimeout(() => mandar({ int: +e.target.value }), 120); };
  bar.querySelector('.lm-off').onclick = () => { bar.querySelectorAll('[data-g]').forEach((x) => x.classList.remove('on')); mandar({ apagar: 1 }); };
  return () => { window.removeEventListener('message', onMsg); bar.remove(); document.body.classList.remove('lm-on'); };
}

// Lista del karaoke de la sala light (Cote, 27 nov: «las letras se ajustan al espacio que tienen, no se cortan»): la canción y
// el nombre se achican hasta caber; si aun así no caben, pasan a otra línea (nunca «…»)
function ajustarKl(caja) {
  if (!caja) return;
  caja.querySelectorAll('.kl-song, .kl-name').forEach((el) => {
    el.style.fontSize = ''; el.classList.remove('kl-2l');
    // se mide el ancho real del texto (el recuadro siempre mide lo mismo que su celda)
    const rg = document.createRange(); rg.selectNodeContents(el);
    const ancho = () => rg.getBoundingClientRect().width;
    let f = parseFloat(getComputedStyle(el).fontSize);
    const caja = () => el.getBoundingClientRect().width;
    while (ancho() > caja() + 0.5 && f > 9) { f -= 0.5; el.style.fontSize = `${f}px`; }
    if (ancho() > caja() + 0.5) el.classList.add('kl-2l');
  });
}
// Registro de las luces del Dell en línea (pedido de Cote, 28 nov): lo sube el Dell solo; aquí se lee, y el enlace de
// lectura es para Code 4 (se pega una vez en el Registro)
views.lucesreg = async () => {
  if (!(await isAdmin())) return viewLogin();
  app.innerHTML = '<p class="back"><a href="#/control">← Centro de control</a></p><h1>Registro de las luces del Dell</h1><div class="panel" id="lr"><p class="muted">Cargando…</p></div>';
  const pinta = async (noche) => {
    let r; try { r = await api('GET', `/api/luces/registro${noche ? `?noche=${encodeURIComponent(noche)}` : ''}`); } catch (err) { $('#lr').innerHTML = `<p>${esc(err.message)}</p>`; return; }
    const cuando = (t) => (t ? new Date(t).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : 'nunca');
    $('#lr').innerHTML = `<p class="small">Subido por el Dell: <b>${esc(cuando(r.at))}</b> · versión ${esc(r.version || '—')}. El Dell lo sube solo cada 10 minutos.</p>
      <p class="small"><b>Enlace para Code 4</b> (solo lectura; pegarlo una vez en el Registro): <input readonly style="width:100%" value="${esc(r.enlace || '')}"></p>
      <label class="small">Noche: <select id="lr-n">${r.noches.map((n) => `<option ${n === r.noche ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
      <pre style="white-space:pre-wrap;font-size:.75rem;max-height:55vh;overflow:auto">${esc(r.texto || 'Todavía no llega nada del Dell.')}</pre>
      <h2>Diagnóstico (${esc(cuando(r.diagAt))})</h2><pre style="white-space:pre-wrap;font-size:.75rem;max-height:55vh;overflow:auto">${esc(r.diag || 'Todavía no llega el diagnóstico.')}</pre>`;
    const sel = $('#lr-n'); if (sel) sel.onchange = () => pinta(sel.value);
  };
  await pinta('');
  return undefined;
};

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
  // Sala light (pedido de Cote, 27 nov): los botones del GC quedan fijos arriba y, debajo, una pestaña desplegable para ver la
  // transmisión en vivo del local (se cierra y se esconde; cerrada no gasta: cada minuto visto de la señal propia se paga)
  app.innerHTML = `${light ? `<div class="kc-fijo"><div class="panel" id="kc-lt"></div><div class="kc-tv"><button type="button" id="kc-tv-btn">📺 Ver la transmisión en vivo <span>▾</span></button><small id="kc-tv-que"></small><div class="kc-tv-box" id="kc-tv-box" hidden></div></div></div>` : ''}<div class="panel${light ? ' kc-lpanel' : ''}"><div class="row between"><div><h1 id="kc-title" style="margin:0">Karaoke</h1><span class="muted" id="kc-sub"></span></div></div>
      <div id="kc-list" ${light ? 'class="kc-1l" ' : ''}style="margin-top:14px"></div>
      <div id="kc-sung-box" hidden><button type="button" id="kc-sung-btn" class="kc-sung-btn">✓ Ya cantaron</button><div id="kc-sung"></div></div>
      <p class="muted small kc-horario" style="margin:14px 0 0">Los pedidos desde el celular se abren y se cierran solos según el horario del local (Mercado Kennedy: jue a sáb 21:45–00:30 · Frida: vie y sáb 18:30–00:00 · Tobalaba: vie 21:00–22:10).</p>
      <p class="muted small" id="kc-note" style="margin-top:10px"></p>
    </div>
    ${light ? `<div class="panel" id="kc-lb"></div>${light === 'kennedy' ? '<div class="panel" id="kc-dell"><h2>💡 Dell de las luces</h2><div class="dell-in"></div></div>' : ''}${staff ? '' : '<p class="back"><a href="#/light">← Salas light</a></p>'}` : activitiesNav('karaoke')}`;
  const stopBar = light && views.lightBar ? views.lightBar($('#kc-lt'), $('#kc-lb'), light, staff) : null;
  if (light === 'kennedy') lucesTab(); // pestaña «Luces»: el panel del DJ de las luces, en el mismo lugar
  const stopMini = light === 'kennedy' ? lucesMini() : null; // mini panel de luces fijo abajo
  // Semáforo del Dell de las luces (orden 13 de Code 0, Cote, 28 nov: «eso debería ir en el GC Lite, porque eso muestra el
  // estado de los computadores siempre. Y también podría ser en la sala de luces»): en el panel y, compacto, en «Luces»
  const dellPaint = async () => {
    if (!window.dellHtml || !$('#kc-dell')) return;
    const r = await api('GET', '/api/luces/salud').catch(() => null);
    const a = document.querySelector('#kc-dell .dell-in'); if (a) a.innerHTML = window.dellHtml(r);
    const b = document.querySelector('.lz-dell'); if (b) b.innerHTML = window.dellHtml(r, true);
  };
  const dellT = light === 'kennedy' ? setInterval(dellPaint, 10000) : 0;
  if (dellT) dellPaint();
  let stopTv = null;
  const tvClose = () => { if (stopTv) { stopTv(); stopTv = null; } const bx = $('#kc-tv-box'); if (bx) { bx.hidden = true; bx.innerHTML = ''; } if ($('#kc-tv-que')) $('#kc-tv-que').textContent = ''; if ($('#kc-tv-btn')) $('#kc-tv-btn').innerHTML = '📺 Ver la transmisión en vivo <span>▾</span>'; };
  if (light) $('#kc-tv-btn').onclick = () => {
    if (stopTv) return tvClose();
    const bx = $('#kc-tv-box'); bx.hidden = false;
    $('#kc-tv-btn').innerHTML = '📺 Esconder la transmisión <span>▴</span>';
    if (window.krbSenal1) stopTv = window.krbSenal1(bx, light, { fit: () => {}, label: (t) => { if ($('#kc-tv-que')) $('#kc-tv-que').textContent = t; } });
    else bx.innerHTML = '<p class="muted small">No se pudo abrir la transmisión.</p>';
  };
  if (!light) await api('POST', '/api/stage', { show: 'karaoke' }).catch(fail); // al entrar, el karaoke pasa a la pantalla
  let last = '';
  let k = null; // lo último que se mostró (la lista del servidor, o con los cambios recién tocados)
  const queue = []; // cambios tocados que todavía se están guardando en Google, en orden
  // Dibuja la lista. Los botones siguen activos mientras se guarda: los cambios se guardan uno tras otro.
  const render = () => {
    if (!k || !$('#kc-list')) return;
    $('#kc-title').textContent = light ? '🎤 Lista del karaoke' : `Karaoke ${k.name}`;
    $('#kc-sub').textContent = queue.length ? 'Guardando en la planilla…' : k.stale ? 'No se pudo leer la lista; se muestra la última conocida' : k.total ? `${k.total} ${k.total === 1 ? 'pedido' : 'pedidos'} por cantar` : 'Todavía no hay pedidos';
    $('#kc-sung-box').hidden = !k.edit;
    $('#kc-note').textContent = k.edit ? '«Ya cantó», Subir y Bajar también se pueden usar en la app del equipo.' : 'El orden y «Ya cantó» se manejan en la app del equipo. Esta pantalla solo muestra la lista.';
    const n = k.list.length;
    // Sala light (Cote, 27 nov, con una foto de la app del equipo: «algo así, incluso más apretado»): una línea por persona,
    // canción – artista a la izquierda, el NOMBRE a la derecha y botones redondos chicos solo con su ícono
    const fila = (p, i) => `<div class="kc-row kl ${i === 0 ? 'now' : ''}"><em>${i === 0 ? '🎤' : i + 1}</em><span class="kl-song">${esc(p.song)}${p.artist ? ` – ${esc(p.artist)}` : ''}</span><b class="kl-name">${esc(p.name)}${p.place ? ` <i class="kl-lugar">(${esc(p.place)})</i>` : ''}</b>${k.edit && p.id ? `<div class="kc-act">
        <button type="button" class="kc-up" data-kc="subir" data-id="${esc(p.id)}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">▲</button><button type="button" class="kc-down" data-kc="bajar" data-id="${esc(p.id)}" ${i === n - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar">▼</button><button type="button" class="kc-done" data-kc="cantado" data-id="${esc(p.id)}" title="Ya cantó" aria-label="Ya cantó">✓</button></div>` : ''}</div>`;
    if (light) $('#kc-list').innerHTML = n ? k.list.map(fila).join('') : '<p class="muted">Cuando alguien pida una canción, aparecerá aquí.</p>';
    else $('#kc-list').innerHTML = n ? k.list.map((p, i) => `<div class="kc-row ${i === 0 ? 'now' : ''}"><em>${i === 0 ? '🎤' : i + 1}</em><p><small>${i === 0 ? 'Ahora canta' : i === 1 ? 'Sigue' : ''}</small><b>${esc(p.name)}</b><span>${esc(p.song)}${p.artist ? ` · ${esc(p.artist)}` : ''}</span></p>${k.edit && p.id ? `<div class="kc-act">
        <button type="button" class="kc-up" data-kc="subir" data-id="${esc(p.id)}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">▲</button><button type="button" class="kc-down" data-kc="bajar" data-id="${esc(p.id)}" ${i === n - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar">▼</button><button type="button" class="kc-done" data-kc="cantado" data-id="${esc(p.id)}">Ya cantó</button></div>` : ''}</div>`).join('')
      : '<p class="muted">Cuando alguien pida una canción, aparecerá aquí.</p>';
    // Sala light: una línea por participante; el nombre va entero (regla de Cote): si no cabe, se achica la letra
    if (light) ajustarKl($('#kc-list'));
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
      if (light) { $('#kc-sung').innerHTML = r.list.length ? r.list.map((x) => `<div class="kc-row kc-sung-row kl"><em>✓</em><span class="kl-song">${esc(x.text)}</span><b class="kl-name kl-hora">${esc(hhmm(x.at))}</b><div class="kc-act"><button type="button" class="kc-back" data-fila="${x.fila}" data-key="${esc(x.key)}" title="Volver a la lista" aria-label="Volver a la lista">↺</button></div></div>`).join('')
        : '<p class="muted small">Esta noche todavía nadie aparece como «ya cantó».</p>'; ajustarKl($('#kc-sung')); return; }
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
  // «Permitir pedir canciones desde el celular» se quitó del panel del karaoke (pedido de Cote, 27 nov): va solo por horario
  await paint();
  if (k && k.edit) paintSung();
  const timer = setInterval(paint, 3000);
  return () => { clearInterval(timer); clearInterval(dellT); if (stopBar) stopBar(); if (stopMini) stopMini(); tvClose(); };
};

// Menú de abajo en el panel de todos los juegos (pedido de Cote): «Sortear juego» y después los juegos con su ícono;
// más abajo, las demás actividades
// Nombre corto del local (o del evento, en la copia de eventos: orden 12 de Code 0, 28 nov)
window.lugarCorto = (v) => ({ frida: 'Frida', kennedy: 'Mercado Kennedy', tobalaba: 'Tobalaba' })[v] || (v === 'evento' ? (window.EVENTO_NOMBRE || 'el evento') : 'Frida');
const GAME_INFO = (venue) => ({
  bingo: { icon: '🎱', name: 'Bingo', href: '' },
  rosco: { icon: '🎡', name: 'El Rosko', href: '#/sorteoctl' },
  festival: { icon: '🎤', name: `El Festival de ${window.lugarCorto(venue)}`, href: '#/votoctl/festival' },
  objeto: { icon: '🗳️', name: 'El objeto más extraño', href: '#/votoctl/objeto' },
  desafio: { icon: '🏆', name: '¿Quién quiere ser ganador?', href: '#/desafioctl' },
});
// Menú de juegos (pedido de Cote, 21 nov): tres botones grandes, «Manual», «Por sorteo» y «Por votación», y nada más;
// al tocar uno se despliega lo de esa modalidad en su momento (Manual: los juegos para tocar; Por sorteo: cuántos juegos
// y el botón del sorteo, y los juegos solo para elegir directo después de «Iniciar sorteo»; Por votación: la votación).
// En el lobby (opts.lobby) no van las otras actividades.
function activitiesNav(current, opts = {}) {
  const games = [
    ['bingo', '<button type="button" data-back-bingo data-game="bingo"><span>🎱</span>Bingo</button>'],
    ['rosco', '<a class="btn" data-game="rosco" href="#/sorteoctl"><span>🎡</span>El Rosko</a>'],
    ['festival', '<a class="btn" data-game="festival" href="#/votoctl/festival"><span>🎤</span><b class="g-fest">El Festival</b></a>'],
    ['objeto', '<a class="btn" data-game="objeto" href="#/votoctl/objeto"><span>🗳️</span>El objeto más extraño</a>'],
    ['desafio', '<a class="btn" data-game="desafio" href="#/desafioctl"><span>🏆</span>¿Quién quiere ser ganador?</a>'],
  ];
  const more = [
    ['show', '<a class="btn" href="#/showctl"><span>⭐</span>Show</a>'],
    ['karaoke', '<a class="btn" href="#/karaokectl"><span>🎤</span>Karaoke</a>'],
    ['insta', '<a class="btn" href="#/instactl"><span>📸</span>Instagram</a>'],
    ['qr', '<button type="button" data-stage-qr><span>📱</span>QR en pantalla completa</button>'],
  ];
  setTimeout(paintGameNav, 0);
  return `<div class="act-nav games-nav ${navFoldState() ? 'g-folded' : ''}${opts.lobby ? ' g-lobby' : ''}"><button type="button" class="g-unfold" data-nav-unfold>▸ Ver otros juegos y actividades</button>
    <div class="g-modes" role="tablist"><button type="button" role="tab" data-draw-mode="manual"><span>👆</span>Manual</button><button type="button" role="tab" data-draw-mode="sorteo"><span>🎲</span>Por sorteo</button><button type="button" role="tab" data-draw-mode="votacion"><span>🗳️</span>Por votación</button></div>
    <section class="g-body"><p class="g-free-title">👆 Toca el siguiente juego</p><section class="g-vote"></section>
    <div class="g-plan"><div class="g-slots"></div><label>¿Cuántos juegos vamos a sortear?<input type="number" class="g-total" min="1" max="10" value="3"></label></div>
    <button type="button" class="primary big g-draw paso" data-paso="9" data-game-draw>🎲 Sortear juego</button>
    <button type="button" class="g-undo" data-game-undo disabled>⬅️ Un paso atrás</button>
    <p class="g-direct" hidden>…o toca un juego para elegirlo directo, sin tómbola</p>
    <div class="g-games">${games.map(([k, h]) => (k === current ? h.replace(/data-game="/, 'aria-current="true" data-game="') : h)).join('')}</div></section>
    ${opts.lobby ? '' : `<small>Otras actividades</small><div>${more.filter(([k]) => k !== current).map(([, h]) => h).join('')}</div>`}</div>`;
}
// Modalidad desplegada en el menú: ninguna al entrar (solo los tres botones), salvo que haya algo a medio hacer en una
// (un sorteo iniciado o una votación abierta o con segunda vuelta pendiente), que se despliega sola
let navOpen = null;
window.addEventListener('hashchange', () => { navOpen = null; });
const applyNavOpen = (ready) => {
  document.querySelectorAll('.games-nav').forEach((n) => {
    n.classList.toggle('g-open', !!navOpen);
    n.classList.toggle('g-free', navOpen === 'manual');
    n.classList.toggle('g-smode', navOpen === 'sorteo');
    n.classList.toggle('g-vmode', navOpen === 'votacion');
    if (ready !== undefined) n.classList.toggle('g-ready', ready && navOpen === 'sorteo');
  });
  document.querySelectorAll('[data-draw-mode]').forEach((b) => { const on = b.dataset.drawMode === navOpen; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
};
window.openNavMode = (how) => { if (!navOpen) { navOpen = how; applyNavOpen(); } };
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
  const how = g.how || (g.free ? 'manual' : 'sorteo'); // pestaña elegida: «Manual», «Por sorteo» o «Por votación»
  // Copia de eventos: el nombre del evento y sus juegos; Manual, Por sorteo y Por votación, como en los locales (orden 13 de
  // Code 0, pedido de Cote, 28 nov)
  if (g.evento) {
    if (g.eventoNombre) window.EVENTO_NOMBRE = g.eventoNombre;
    document.querySelectorAll('.games-nav [data-game]').forEach((el) => { el.hidden = !(g.games || []).includes(el.dataset.game); });
  }
  document.querySelectorAll('.g-fest').forEach((b) => { b.textContent = info.festival.name; });
  document.querySelectorAll('[data-game]').forEach((el) => { const done = how === 'sorteo' && g.played.includes(el.dataset.game); el.classList.toggle('g-played', done); el.title = done ? 'Salió en el último sorteo: queda fuera del próximo' : ''; });
  // Casilleros de la noche y botón: «Sortear el 2.º juego (de 3)»; al completar, se desactiva
  document.querySelectorAll('.g-total').forEach((i) => { if (document.activeElement !== i) i.value = g.total; });
  const slots = []; // la noche ya no parte con un bingo (pedido de Cote, 21 nov): 1.º, 2.º, 3.º…
  for (let i = 0; i < g.total; i++) slots.push(g.list[i] ? `<span class="done">${i + 1}.º · ${info[g.list[i]].icon} ${esc(info[g.list[i]].name)}</span>` : `<span>${i + 1}.º · 🔒</span>`);
  document.querySelectorAll('.g-slots').forEach((el) => { el.innerHTML = slots.join(''); });
  const full = g.list.length >= g.total;
  const ready = how === 'sorteo' && !full && !!g.ready && (!g.last || g.ready.at > g.last.at);
  // Pedido de Cote (20 nov): cuántos juegos y sus números se ven solo antes de empezar el sorteo; después se ocultan
  document.querySelectorAll('.g-plan').forEach((el) => { el.hidden = g.list.length > 0 || ready; });
  window.gameDrawReady = ready;
  if (!navOpen && ready) navOpen = 'sorteo'; // un sorteo iniciado (también desde otro equipo) se despliega solo
  applyNavOpen(ready);
  if (window.paintGvote) window.paintGvote(how);
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
// Botones de modalidad (pedido de Cote, 21 nov): al tocar uno se despliega su menú y queda elegido en el servidor
// (un sorteo o una votación a medio hacer de otra modalidad se cancela); tocar el desplegado lo vuelve a plegar
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-draw-mode]');
  if (!b) return;
  const how = b.dataset.drawMode;
  clearTimeout(window.gameDrawGo);
  if (navOpen === how) { navOpen = null; applyNavOpen(false); return; }
  navOpen = how;
  if (how !== 'sorteo') window.gameDrawReady = false;
  applyNavOpen(false); // se despliega al instante, sin esperar al servidor
  const g = await api('GET', '/api/gamedraw').catch(() => null);
  if (!g || (g.how || (g.free ? 'manual' : 'sorteo')) !== how) { try { await api('POST', '/api/gamedraw/mode', { how }); } catch (err) { fail(err); } }
  // «Por votación» ya no parte sola la presentación (Cote, 24 nov): el animador toca «Iniciar instrucciones»
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
  const se = (t) => (window.sinEmoji ? window.sinEmoji(t) : t); // diseño nuevo: las etiquetas de pantalla van sin emojis
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
        if (ready && i === g.list.length) { cells.push(`<span class="now"><small>${i + 1}.º juego</small>${se('🎲 …')}</span>`); continue; }
        const k = g.list[i]; const cur = !ready && i === g.list.length - 1;
        cells.push(!k ? `<span class="todo"><small>${i + 1}.º juego</small>${se('🔒')}</span>`
          : cur ? `<span class="${rolling ? 'now' : 'on'}"><small>${i + 1}.º juego</small>${se(rolling ? '🎲 …' : `${info[k].icon} ${esc(info[k].name)}`)}</span>`
            : `<span class="done"><small>${i + 1}.º juego</small>${se(`${info[k].icon} ${esc(info[k].name)}`)}</span>`);
      }
      return `<div class="jd-list jd-slots">${cells.join('')}</div>`;
    };
    if (ready) {
      // paso 1: los juegos que pueden salir
      box.innerHTML = `<div class="jd-card"><small>${se(`🎲 Sorteo del ${g.list.length + 1}.º juego`)}</small><div class="jd-opts">${g.ready.pool.map((k) => `<span>${se(`${info[k].icon} ${esc(info[k].name)}`)}</span>`).join('')}</div>${listOf(true)}</div>`;
      fitJd(); // en una sola línea, centrado y dentro del cuadro
      return;
    }
    const win = info[g.last.game];
    const pool = g.last.pool.map((k) => info[k]);
    const nth = `${g.list.length}.º juego`;
    const left = g.last.direct ? 0 : ROLL_MS - (Date.now() + (g.offset || 0) - g.last.at); // elegido directo: sin tómbola
    if (left > 0) {
      // tómbola: pasan los juegos disponibles cada vez más lento
      box.innerHTML = `<div class="jd-card"><small>${se(`🎲 Sorteo del ${nth}`)}</small><b class="jd-roll"></b>${listOf(true)}</div>`;
      let i = 0; let wait = 70;
      fitJd();
      const spin = () => { if (!alive || !$('.jd-roll')) return; const x = pool[i++ % pool.length]; $('.jd-roll').textContent = se(`${x.icon} ${x.name}`); fitText($('.jd-roll')); wait *= 1.13; if (Date.now() + (g.offset || 0) - g.last.at < ROLL_MS - 200) timer = setTimeout(spin, wait); else paintWin(); };
      const paintWin = () => { if (alive) paint({ ...g, last: { ...g.last, at: g.last.at - ROLL_MS } }); };
      spin();
      return;
    }
    box.innerHTML = `<div class="jd-card won"><small>${se(`🎲 El ${nth} es`)}</small><b class="jd-win">${se(`${win.icon} ${esc(win.name)}`)}</b>${listOf(false)}</div>`;
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
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (alive) fitJd(); }); // al llegar las letras, se ajusta de nuevo
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

// #/escena es la misma escena que el GC Light del local (Cote, 28 nov: «igual como pasa en Kennedy los jueves…
// por aquí pasan los juegos y se enganchan al karaoke usando la misma escena en OBS»): con la sala de juegos abierta en un
// local, #/escena muestra lo mismo que #/light-gc/<local> (la sala de juegos y, si se toca un botón de la sala light, ese
// GC; gana lo último que se tocó). Así da lo mismo cuál de los dos links esté en OBS. Sin sala, en una sala simulada o
// en la copia de eventos, es la escena de siempre.
views.escena = async () => {
  const st = await api('GET', '/api/stage').catch(() => null);
  const v = st && st.venue;
  if (v && /^(kennedy|frida|tobalaba)$/.test(v) && views['light-gc']) {
    const l = await api('GET', `/api/light?local=${v}`).catch(() => null);
    if (l && l.salaHoy) return views['light-gc'](v);
  }
  return views.escenaSala();
};
// Pantalla única para OBS: muestra la gráfica que el moderador elija en «Juegos».
// No requiere iniciar sesión y queda transparente cuando no hay nada que mostrar.
views.escenaSala = async () => {
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
        } else if (show === 'bingo') stop = await views.gc();
        else if (show === 'rueda') stop = await views.obs();
        else if (show === 'sorteo') stop = await views.sorteo();
        else if (show === 'qr') stop = await views.qrBig();
        else if (show === 'karaoke') stop = await views.karaokeGC();
        else if (show === 'voto') stop = await views.votoGC();
        else if (show === 'enpie') stop = await views.enpieGC();
        else if (show === 'desafio') stop = await views.desafioGC();
        else if (show === 'juego') stop = await views.juegoDraw('gc');
        else if (show === 'votojuego') stop = await views.gameVote('gc');
        else if (show === 'insta') stop = await views.instaGC();
        else if (show === 'show') stop = await views.showGC();
        joinQr({ sorteo: 'br', rueda: 'bl', show: 'above', votojuego: 'br', enpie: 'above', desafio: 'tl' }[show]);
        document.body.classList.add('obs');
      }
      if (sr) carton(!!sr.carton);
    } finally { busy = false; if (again) { again = false; apply(); } }
  };
  // «Cartón al centro» (pregunta 20 de Cote, 24 nov): en una pausa, la franja de abajo se cambia por un cartón mediano al
  // centro con la información del juego en ese momento, el QR y el nombre del juego
  let cartonT = null;
  const carton = (on) => {
    let el = document.getElementById('carton');
    if (!on) { if (el) el.remove(); document.body.classList.remove('carton-on'); clearInterval(cartonT); cartonT = null; return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'carton';
      el.innerHTML = `<div class="ct-card"><div class="ct-info"><small class="ct-title"></small><span class="ct-small"></span><b class="ct-big"></b><div class="ct-lines"></div></div><div class="ct-qr">${qr(joinUrl())}<span>Escanea el código QR con tu celular</span></div></div>`;
      document.body.appendChild(el); document.body.classList.add('carton-on');
    }
    const paint = async () => {
      const c = await api('GET', '/api/carton').catch(() => null);
      const box = document.getElementById('carton');
      if (!c || !box) return;
      box.className = `th-${c.venue}`;
      const set = (sel, t) => { const x = box.querySelector(sel); if (x && x.textContent !== t) x.textContent = t; };
      set('.ct-title', window.sinEmoji(c.title)); set('.ct-small', c.small || ''); set('.ct-big', c.big || '');
      const lines = c.lines.map((l) => `<p>${esc(l)}</p>`).join('');
      const lb = box.querySelector('.ct-lines'); if (lb.innerHTML !== lines) lb.innerHTML = lines;
      box.querySelectorAll('.ct-title, .ct-big').forEach((x) => window.fitOneLine(x));
    };
    paint();
    if (!cartonT) cartonT = setInterval(paint, 1500);
  };
  await apply();
  const timer = setInterval(apply, 2000);
  const offAviso = window.onAviso(apply);
  return () => { clearInterval(timer); offAviso(); if (typeof stop === 'function') stop(); joinQr(); carton(false); document.body.classList.remove('obs'); };
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

// ---------- Enrutador ----------
let cleanup = null;
async function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  app.onclick = null;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const screen = !arg && (name === 'gc' || name === 'obs') ? 'escena' : name;
  document.body.dataset.view = screen || 'home'; // qué vista es (el celular del público lleva el diseño nuevo: tema-celular.css)
  // Pantallas de los locales y GC (26 nov): si la página se abrió justo mientras la Sala se reiniciaba y no cargó el archivo
  // de esa pantalla, no se muestra el inicio ni el ingreso del moderador (eso salió en las verticales): se vuelve a cargar
  const isScreen = /^(vertical|vertical-in|pantalla|tablero|tablero-v|escena|light-gc|light-v|karaoke-v)$/.test(screen || '');
  if (isScreen && !views[screen]) {
    app.innerHTML = '';
    setTimeout(() => location.reload(), 5000);
    return;
  }
  const view = views[screen || 'home'] || views.home;
  window.scrollTo(0, 0);
  try { cleanup = await view(arg); } catch (e) {
    if (isScreen) { app.innerHTML = ''; setTimeout(() => location.reload(), 5000); return; } // una pantalla nunca muestra el ingreso ni un error: vuelve a intentar
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
const VENUE_LOGOS = { kennedy: 'logo-kennedy.png', frida: 'logo-frida.png' }; // el de Frida Kahlo lo mandó Cote el 23 nov
// Frida (Cote, 23 nov: «y esto encima»): el dibujo azul va encima de las letras. Donde hay espacio (GC de OBS, arriba a la
// derecha) va así, más alto que el de KRB Stage; en la franja de abajo de los tableros y pantallas de pie no cabe un logo
// alto, así que ahí el dibujo va al lado de las letras, al mismo alto.
const VENUE_LOGOS_STRIP = { frida: 'logo-frida-h.png' };
const SCREEN_ROUTES = ['tablero', 'escena', 'gc', 'obs', 'light-gc', 'karaoke-v', 'light-v'];
let venueOfSala = '';
let venueAt = 0;
// Color de fondo de las pantallas según el local (también en navegadores antiguos, que no leen «:has»)
const VENUE_BG = { tobalaba: '#2a0608', kennedy: '#06183a', frida: '#1b0f3a', evento: '#16110a' };
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
  const strip = document.body.classList.contains('full');
  const src = (strip && VENUE_LOGOS_STRIP[v]) || VENUE_LOGOS[v];
  if (!src) { if (el) el.remove(); document.body.classList.remove('has-vm'); return; }
  // Los dos logos juntos y al mismo alto, separados por una línea: KRB Stage | Mercado Kennedy
  if (!el) { el = document.createElement('div'); el.id = 'venue-mark'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  if (el.dataset.src !== src) { el.dataset.src = src; el.innerHTML = `<img src="krb-stage.svg" alt=""><i></i><img src="${src}" alt="">`; }
  // Dónde va: en el tablero, en una franja abajo que se le deja libre; en OBS, arriba a la derecha (en el bingo, sobre la bolita)
  const spot = document.body.classList.contains('full') ? 'full' : document.getElementById('gc') ? 'obs-bingo' : 'obs';
  el.className = `venue-mark vm-${spot}${v === 'frida' && !strip ? ' vm-alto' : ''}`;
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
  // Para que las pantallas vayan fluidas en cualquier equipo (pedido de Cote, 22 nov): si no hay nada que dibujar no se
  // toca el lienzo (así el navegador no trabaja de más); en los monitores del GC Master (?mon=1) el fondo animado no va;
  // y si el equipo no da abasto (menos de 22 cuadros por segundo de forma sostenida) se apaga solo y el fondo queda quieto
  const MON = document.documentElement.classList.contains('mon');
  let blank = true; let slow = false; let fT = 0; let fN = 0; let fPrev = 0; let bad = 0; let retry = 5;
  const build = () => {
    W = innerWidth; H = innerHeight; cw = -1; frameTo(0, 0, W, H); // en los GC se ajusta después a la zona de los recuadros
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
  // El lienzo ocupa toda la pantalla en los tableros; en los GC, solo la zona donde están los recuadros (así el navegador
  // recompone un pedazo y no la pantalla entera en cada cuadro). Se dibuja siempre en las coordenadas de la página.
  let ox = 0; let oy = 0; let cw = -1; let ch = -1;
  const frameTo = (l, t, w, h) => {
    if (l === ox && t === oy && w === cw && h === ch) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    ox = l; oy = t; cw = w; ch = h;
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    if (mode === 'gc') Object.assign(c.style, { left: `${l}px`, top: `${t}px`, right: 'auto', bottom: 'auto', width: `${w}px`, height: `${h}px` });
    x.setTransform(dpr, 0, 0, dpr, -l * dpr, -t * dpr); blank = true;
  };
  const inside = (o, b) => o.left <= b.left && o.top <= b.top && o.right >= b.right && o.bottom >= b.bottom;
  const readBoxes = () => {
    const shown = c && getComputedStyle(c).display !== 'none';
    boxes = !shown ? [] : Array.from(document.querySelectorAll(BOXES)).map((e) => ({ r: e.getBoundingClientRect(), rad: parseFloat(getComputedStyle(e).borderRadius) || 0 })).filter((b) => b.r.width > 0 && b.r.height > 0);
    // un recuadro que está entero dentro de otro no se dibuja aparte (quedaría con doble brillo)
    boxes = boxes.filter((b, i) => !boxes.some((o, n) => n !== i && inside(o.r, b.r) && !(inside(b.r, o.r) && n > i)));
    holes = Array.from(document.querySelectorAll(NO_FX)).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
    boxesAt = Date.now();
    if (boxes.length) {
      // la zona que abarcan los recuadros, en pasos de 16 px para no rehacer el lienzo por cambios mínimos
      const l = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.r.left)) / 16) * 16); const t = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.r.top)) / 16) * 16);
      const r = Math.min(W, Math.ceil(Math.max(...boxes.map((b) => b.r.right)) / 16) * 16); const bt = Math.min(H, Math.ceil(Math.max(...boxes.map((b) => b.r.bottom)) / 16) * 16);
      if (r > l && bt > t) frameTo(l, t, r - l, bt - t); else boxes = [];
    }
  };
  const path = (r, rad) => { if (x.roundRect) x.roundRect(r.left, r.top, r.width, r.height, Math.min(rad, r.height / 2)); else x.rect(r.left, r.top, r.width, r.height); };
  const draw = () => {
    const R = 200 * k;
    if (mode === 'gc') {
      if (Date.now() - boxesAt > 600) readBoxes();
      if (!boxes.length) { if (!blank) { x.clearRect(ox, oy, cw, ch); blank = true; } return; } // nada que dibujar: el lienzo queda quieto
    }
    blank = false;
    x.clearRect(ox, oy, cw, ch);
    // los tramos entre neuronas cercanas se calculan una vez por cuadro
    const segs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < R) segs.push([a.x, a.y, b.x, b.y, (1 - d / R) * (mode === 'gc' ? 0.45 : 0.38) * Math.min(alphaOf(a), alphaOf(b))]);
      }
    }
    // dibuja lo que toca la zona (l, t, r, b); lo que queda fuera ni se intenta
    const m = 8 * k;
    const net = (l, t, r, b) => {
      x.lineWidth = 2.2 * k;
      for (const s of segs) {
        if (Math.max(s[0], s[2]) < l - m || Math.min(s[0], s[2]) > r + m || Math.max(s[1], s[3]) < t - m || Math.min(s[1], s[3]) > b + m) continue;
        x.strokeStyle = `rgba(243,238,230,${s[4]})`; x.beginPath(); x.moveTo(s[0], s[1]); x.lineTo(s[2], s[3]); x.stroke();
      }
      for (const p of pulses) {
        const px = p.a.x + (p.b.x - p.a.x) * p.t; const py = p.a.y + (p.b.y - p.a.y) * p.t;
        if (Math.max(p.a.x, px) < l - m || Math.min(p.a.x, px) > r + m || Math.max(p.a.y, py) < t - m || Math.min(p.a.y, py) > b + m) continue;
        x.globalAlpha = Math.min(alphaOf(p.a), alphaOf(p.b));
        x.strokeStyle = `${colors[p.a.c]}aa`; x.lineWidth = 3 * k; x.beginPath(); x.moveTo(p.a.x, p.a.y); x.lineTo(px, py); x.stroke();
        x.fillStyle = colors[p.a.c]; x.beginPath(); x.arc(px, py, 6.5 * k, 0, 7); x.fill();
        x.globalAlpha = 1;
      }
      for (const a of pts) { if (a.x < l - m || a.x > r + m || a.y < t - m || a.y > b + m) continue; x.globalAlpha = 0.9 * alphaOf(a); x.fillStyle = colors[a.c]; x.beginPath(); x.arc(a.x, a.y, 5.5 * k, 0, 7); x.fill(); }
      x.globalAlpha = 1;
    };
    if (mode !== 'gc') { net(-1e9, -1e9, 1e9, 1e9); return; }
    // En los GC: recuadro por recuadro, con un recorte simple cada uno (recortar todo junto con una sola forma compuesta
    // era carísimo: más de un núcleo y medio de trabajo permanente en el GC de El Rosko)
    for (const bx of boxes) { x.save(); x.beginPath(); path(bx.r, bx.rad); x.clip(); net(bx.r.left, bx.r.top, bx.r.right, bx.r.bottom); x.restore(); }
    for (const h of holes) x.clearRect(h.left - 2, h.top - 2, h.width + 4, h.height + 4);
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
    // Vigilante: cuenta los cuadros que el equipo logra dar; con 3 tramos seguidos de 3 s bajo 22 por segundo, se apaga
    const gap = now - fPrev; fPrev = now;
    if (gap > 0 && gap < 400) { fT += gap; fN++; } else { fT = 0; fN = 0; } // un salto largo es una pausa (pantalla oculta), no lentitud
    if (fT >= 3000) { bad = fT / fN > 45 && now > 15000 ? bad + 1 : 0; fT = 0; fN = 0; if (bad >= 3) { goSlow(); return; } }
    if (now - last < 29) return; // 30 cuadros por segundo como máximo
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
  // Equipo lento: sin fondo animado (clase «lento»: el fondo de las pantallas también queda quieto). Se vuelve a probar
  // a los 5 min, después a los 20 y de ahí cada hora, por si la lentitud fue pasajera
  const goSlow = () => {
    slow = true; document.documentElement.classList.add('lento'); stop();
    setTimeout(() => { slow = false; document.documentElement.classList.remove('lento'); sync(); }, retry * 60000);
    retry = retry < 20 ? 20 : 60;
  };
  const sync = () => {
    const cl = document.body.classList;
    const want = MON || slow ? '' : cl.contains('full') ? 'full' : cl.contains('obs') ? 'gc' : '';
    colors = PALETTES[document.body.dataset.venue] || PALETTES.frida;
    if (want === mode) return;
    stop();
    if (!want) return;
    mode = want;
    c = document.createElement('canvas'); c.id = 'neural-bg'; c.setAttribute('aria-hidden', 'true');
    if (mode === 'gc') c.className = 'neural-gc';
    document.body.insertBefore(c, document.body.firstChild);
    x = c.getContext('2d'); build(); blank = true; fT = 0; fN = 0; bad = 0;
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
  const PANELS = /^#\/?($|juegos|simulada|figura|anfitrion|ronda|proyectos|nuevo|admin|votoctl|enpiectl|desafioctl|ruedactl|ruedas|sorteoctl|karaokectl|showctl|instactl|light$|consola|verticalctl)/;
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

// «Cartón al centro» (pregunta 20 de Cote, 24 nov): botón en los paneles de los juegos (arriba, junto a «Refrescar»):
// en una pausa cambia la franja del GC de OBS por un cartón al centro con la información del juego, el QR y su nombre;
// el mismo botón lo quita y sale solo cuando cambia lo que está en pantalla
(() => {
  const GAMES = /^#\/?(juegos|anfitrion|admin|votoctl|enpiectl|desafioctl|ruedactl|ruedas|sorteoctl)/;
  let on = false;
  const paint = () => { const b = document.getElementById('ctl-carton'); if (b) { b.classList.toggle('on', on); b.textContent = on ? '🗂️ Cartón al centro: quitar' : '🗂️ Cartón al centro'; } };
  const sync = async () => {
    let b = document.getElementById('ctl-carton');
    const show = GAMES.test(location.hash || '') && !document.body.classList.contains('full') && !document.body.classList.contains('obs') && !!store.get('adminToken');
    if (!show) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('button'); b.id = 'ctl-carton'; b.type = 'button'; b.className = 'ctl-reload ctl-carton';
      b.onclick = async () => { try { const r = await api('POST', '/api/carton', { on: !on }); on = !!r.on; paint(); toast(on ? '🗂️ Cartón al centro en el GC' : 'Volvió la franja del GC'); } catch (err) { fail(err); } };
      document.body.appendChild(b);
    }
    const r = await api('GET', '/api/stage').catch(() => null);
    if (r) on = !!r.carton;
    paint();
  };
  window.addEventListener('hashchange', () => setTimeout(sync, 300));
  setTimeout(sync, 700); setInterval(() => { if (document.getElementById('ctl-carton') && !document.hidden) sync(); }, 4000);
})();

// ---------- El botón que sigue: siempre verde y siempre en el mismo lugar ----------
// Pedido de Cote (23 nov): «el botón que el animador tiene que apretar tiene que estar en verde… debería estar siempre en
// el mismo lugar». Los paneles marcan con la clase «paso» el botón del paso que sigue (bingo: generar número, desempatar,
// confirmar ganador; sorteo de concursantes; Festival y objeto; sorteo y votación del juego; volver al juego en curso).
// Aquí se elige uno solo (el de menor «data-paso»; primero los que se pueden apretar) y se deja fijo arriba de la
// página, a todo el ancho; el resto del panel baja lo que mide el botón. El Rosko queda como está (ahí son 3 botones).
(() => {
  let queued = false; let cur = null;
  const pick = () => {
    queued = false;
    const all = [...app.querySelectorAll('.paso')].filter((b) => b.getClientRects().length);
    const pri = (b) => Number(b.dataset.paso || 5);
    const best = all.filter((b) => !b.disabled).sort((x, y) => pri(x) - pri(y))[0] || all.sort((x, y) => pri(x) - pri(y))[0] || null;
    if (best !== cur) { if (cur) cur.classList.remove('paso-fijo'); cur = best; if (cur) cur.classList.add('paso-fijo'); }
    document.body.classList.toggle('con-paso', !!cur);
    const h = cur ? `${Math.ceil(cur.getBoundingClientRect().height)}px` : '';
    if (document.documentElement.style.getPropertyValue('--paso-h') !== h) document.documentElement.style.setProperty('--paso-h', h);
  };
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(pick); } };
  // al redibujarse un panel el botón nuevo queda fijo antes de que se pinte la pantalla (sin saltos)
  new MutationObserver(() => { if (!queued) pick(); }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'class', 'open'] });
  window.addEventListener('resize', later);
})();

// ---------- Paneles sincronizados ----------
// Pedido de Cote (26 nov): «en el caso de tener dos paneles de control de animador abiertos, uno como para ir
// supervisando y otro como para ir operando… si el animador va apretando avanzar, la otra sesión que está abierta también
// vaya avanzando y no haya que estar actualizando». Lo de dentro de cada juego ya se pone al día solo; lo que faltaba era
// la vista: cuando un panel pasa a otra vista de juego (Juegos, la figura, el panel de un juego, la ronda, el sorteo),
// la anuncia al servidor y los demás paneles que estén en una vista de juego pasan solos a la misma (también el iPad viejo
// y el panel dentro del GC Master). Al abrir un panel no se mueve a los demás: solo cuentan los cambios posteriores.
(() => {
  const FOLLOW = /^#\/(juegos|figura\/|anfitrion\/|ronda\/|votoctl\/|enpiectl|desafioctl|ruedactl\/|sorteoctl)/;
  let seq = -1; let quiet = Date.now() + 3000; // los primeros segundos son el ingreso y las redirecciones de la página
  const isPanel = () => !!store.get('adminToken') && !window.__mon && !document.body.classList.contains('full') && !document.body.classList.contains('obs');
  const send = () => {
    const h = location.hash || '';
    if (Date.now() < quiet || !isPanel() || !FOLLOW.test(h)) return;
    api('POST', '/api/panel/ruta', { hash: h }).then((r) => { seq = r.seq; }).catch(() => {});
  };
  const check = async () => {
    if (!isPanel() || document.hidden) return;
    const r = await api('GET', '/api/panel/ruta').catch(() => null);
    if (!r) return;
    const fresh = seq >= 0 && r.seq !== seq;
    seq = r.seq;
    if (!fresh || r.from === PANEL_ID || !r.hash || r.hash === location.hash || !FOLLOW.test(location.hash || '')) return;
    quiet = Date.now() + 2500; // la vista a la que se llega puede redirigir: eso no se vuelve a anunciar
    location.hash = r.hash;
  };
  window.addEventListener('hashchange', () => setTimeout(send, 60));
  setTimeout(check, 1200);
  setInterval(check, 1500);
})();
