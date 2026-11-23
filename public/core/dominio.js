//@ Bingo en HTML (bolas, cartones, figuras), enlaces, QR y conexión en vivo. Parte de la aplicación: se carga en orden desde index.html.
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

