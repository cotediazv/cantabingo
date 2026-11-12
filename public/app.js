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
let HOST = store.get('hostId');
if (!HOST) { HOST = rnd(16); store.set('hostId', HOST); }

async function api(method, url, body) {
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', 'x-host': HOST },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
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
function cardHTML(g, cells, { no = '', marks = 0, green = 0, hint = 0 } = {}) {
  const txt = g.format === 'words' ? 'txt' : '';
  const body = cells.map((v, i) => {
    const cls = v === 0 ? 'free' : green & (1 << i) ? 'green' : marks & (1 << i) ? 'marked' : '';
    const h = hint & (1 << i) ? 'hint' : '';
    const g2 = v === 0 && green & (1 << i) ? 'green' : '';
    return `<button class="cell ${txt} ${cls} ${g2} ${h}" data-i="${i}">${cellInner(g, v)}</button>`;
  }).join('');
  return `<div class="card" data-no="${esc(no)}">
    ${no !== '' ? `<div class="card-top"><span>Cartón</span><span>#${esc(no)}</span></div>` : ''}
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
function subscribe(sid, onState, onGone) {
  const es = new EventSource(`/api/sessions/${sid}/events`);
  es.onmessage = (e) => { const st = JSON.parse(e.data); if (st.closed) { es.close(); onGone(); } else onState(st); };
  es.onerror = () => { fetch(`/api/sessions/${sid}`).then((r) => { if (r.status === 404) { es.close(); onGone(); } }).catch(() => {}); };
  return () => es.close();
}
const joinUrl = (sid) => `${location.origin}${location.pathname}#/jugar/${sid}`;
const boardUrl = (sid) => `${location.origin}${location.pathname}#/tablero/${sid}`;
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

views.home = () => {
  app.innerHTML = `
    <section class="panel">
      <h1>Crea cartones de bingo y dirige sesiones en vivo</h1>
      <p class="muted">Genera de 25 a 3.000 cartones virtuales únicos con números, palabras o emojis. Cada participante los abre en su celular, tú anuncias los valores y la app detecta los cartones completados.</p>
      <div class="row">
        <a class="btn primary" href="#/nuevo">Crear cartones</a>
        <a class="btn" href="#/proyectos">Dirigir una sesión</a>
        <a class="btn" href="#/sesiones">Unirse a una sesión</a>
      </div>
    </section>
    <ol class="steps panel">
      <li><b>Invita</b><br><span class="muted">Comparte el enlace o el QR: cada persona recibe de 1 a 4 cartones en su celular.</span></li>
      <li><b>Anuncia</b><br><span class="muted">Generador aleatorio manual o automático, con voz.</span></li>
      <li><b>Valida</b><br><span class="muted">Los patrones completados aparecen al instante en la lista de resultados.</span></li>
    </ol>`;
};

views.proyectos = async () => {
  const list = await api('GET', '/api/projects');
  const fmt = { numbers: 'Números', words: 'Palabras', emojis: 'Emojis' };
  app.innerHTML = `
    ${BACK}<div class="row between" style="margin-bottom:16px"><h1>Mis proyectos</h1><a class="btn primary" href="#/nuevo">⊕ Nuevo proyecto de bingo</a></div>
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

views.nuevo = () => {
  app.innerHTML = `
    ${BACK}<h1>Nuevo proyecto de bingo</h1>
    <form class="panel fields" id="f">
      <label class="f">Nombre del proyecto<input type="text" name="name" maxlength="60" placeholder="Bingo de fin de curso"></label>
      <label class="f">Número de cartones <span class="hint">de 25 a 3.000</span><input type="number" name="count" min="25" max="3000" value="25" required></label>
      <label class="f">Formato<select name="format"><option value="numbers">Números</option><option value="emojis">Emojis</option><option value="words">Palabras / frases</option></select></label>
      <label class="f" data-for="numbers">Cantidad de valores <span class="hint">25 a 150 (75 es lo habitual)</span><input type="number" name="values" min="25" max="150" value="75"></label>
      <label class="f wide" data-for="words" hidden>Tu lista, una palabra o frase por línea <span class="hint">mínimo 25, máximo 150</span><textarea name="words" placeholder="Pega aquí tu lista desde Word o Excel"></textarea></label>
      <p class="muted small wide" data-for="emojis" hidden>Se usará un conjunto de 75 emojis con su nombre en español.</p>
      <label class="f">Encabezado de columnas <span class="hint">5 letras</span><input type="text" name="headers" maxlength="5" value="BINGO"></label>
      <label class="f">Casilla central<select name="freeCenter"><option value="1">Libre</option><option value="0">Con valor</option></select></label>
      <label class="f">Numerar cartones desde<input type="number" name="startNumber" min="1" value="1"></label>
      <div class="wide"><button class="primary big">Crear los cartones</button></div>
    </form>`;
  const f = $('#f');
  const sync = () => $$('[data-for]', f).forEach((el) => { el.hidden = el.dataset.for !== f.format.value; });
  f.format.onchange = sync;
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const body = { ...d, freeCenter: d.freeCenter === '1' };
    if (d.format === 'words') body.items = d.words.split(/\r?\n|\t/).map((s) => s.trim()).filter(Boolean);
    if (d.format === 'emojis') body.items = EMOJIS;
    delete body.words;
    try { const p = await api('POST', '/api/projects', body); location.hash = `#/anfitrion/${p.id}`; } catch (err) { fail(err); }
  };
};

views.anfitrion = async (pid) => {
  const p = await api('GET', `/api/projects/${pid}`);
  if (!p.sessionId) return hostSetup(p);
  return hostConsole(p);
};

function hostSetup(p) {
  const n = p.cards.length;
  app.innerHTML = `
    ${BACK}<h1>Configurar la sesión</h1>
    <form class="panel" id="f">
      <div class="fields">
        <label class="f">Nombre de la sesión<input type="text" name="name" maxlength="50" value="${esc(p.name)}" required></label>
        <label class="f">Contraseña para unirse <span class="hint">vacía = acceso libre</span><input type="text" name="password" maxlength="40"></label>
        <label class="f">Cartones por participante <span class="hint" id="cap"></span><select name="cardsPerPlayer"><option>1</option><option>2</option><option>3</option><option>4</option></select></label>
        <label class="check"><input type="checkbox" name="isPublic" checked> Mostrar en la lista pública de sesiones</label>
        ${p.format === 'emojis' ? '<label class="check"><input type="checkbox" name="showName" checked> Mostrar el nombre del emoji</label>' : ''}
      </div>
      <h2 style="margin-top:20px">Patrones a completar</h2>
      ${patternPicker()}
      <p class="muted small">El generador queda activo 3 horas. Podrás reiniciar la sesión las veces que quieras y cambiar el patrón en cada ronda.</p>
      <button class="primary big">Activar el generador</button>
    </form>`;
  const f = $('#f');
  const cap = () => { $('#cap').textContent = `alcanza para ${Math.floor(n / Number(f.cardsPerPlayer.value))} personas`; };
  f.cardsPerPlayer.onchange = cap;
  cap();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const patterns = readPatterns(f);
    if (!patterns) return;
    const d = Object.fromEntries(new FormData(f));
    try {
      await api('POST', `/api/projects/${p.id}/session`, { ...d, isPublic: !!d.isPublic, showName: p.format !== 'emojis' || !!d.showName, patterns });
      route();
    } catch (err) { fail(err); }
  };
}

async function hostConsole(p) {
  const sid = p.sessionId;
  const info = await api('GET', `/api/sessions/${sid}/host`);
  const act = (action, body) => api('POST', `/api/sessions/${sid}/host/${action}`, body || {}).catch(fail);
  let st = null;
  let manual = false;
  let spoken = -1;
  app.innerHTML = `
    <div>${BACK}
      <div class="panel">
        <div class="row between">
          <div><h1 id="title"></h1><div id="meta" class="muted"></div></div>
          <div class="row">
            <div class="small"><b>Participantes:</b> <a class="link" href="${joinUrl(sid)}" target="_blank">${esc(joinUrl(sid))}</a><br>
              <b>Tablero:</b> <a class="link" href="${boardUrl(sid)}" target="_blank">${esc(boardUrl(sid))}</a><br>
              <b>Contraseña:</b> ${info.password ? esc(info.password) : '<i>sin contraseña</i>'}</div>
            ${qr(joinUrl(sid))}
          </div>
        </div>
        <div id="pats" style="margin-top:10px"></div>
      </div>
      <div class="cols">
        <div class="panel">
          <div id="draws"></div>
          <div class="row" style="justify-content:center;margin-top:16px"><button class="primary big" id="gen">Generar un número</button></div>
          <div class="row" style="justify-content:center;margin-top:14px">
            <label class="small">Pausa <input type="number" id="interval" min="5" max="60" value="10" style="width:70px"> s</label>
            <label class="check"><input type="checkbox" id="stop" checked> Detener al completarse un cartón</label>
            <button id="auto">▶ Modo automático</button>
          </div>
          <div class="row" style="justify-content:center;margin-top:10px">
            <button id="manual">Selección manual</button>
            <label class="check"><input type="checkbox" id="voice" ${voiceOn ? 'checked' : ''}> Voz</label>
          </div>
        </div>
        <div class="panel"><h2 id="count"></h2><div id="board"></div><h2 style="margin-top:16px">Orden de salida</h2><div id="history" class="history"></div></div>
      </div>
    </div>
    <div class="panel" id="results-panel">
      <h2>Lista de resultados</h2>
      <div id="results" class="scroll-x"></div>
      <div id="final"></div>
    </div>
    <div class="panel">
      <h2>Siguiente ronda</h2>
      <div id="restart-pats"></div>
      <div class="row">
        <button class="primary" id="restart">Reiniciar la sesión</button>
        <button id="finalbtn">Selección final entre cartones completados</button>
        <button class="danger" id="close">Cerrar la sesión</button>
      </div>
    </div>`;
  let pickerRound = null;
  const render = () => {
    $('#title').textContent = st.name;
    if (pickerRound !== st.round) { pickerRound = st.round; $('#restart-pats').innerHTML = patternPicker(st.patterns); }
    const mins = Math.max(0, Math.round((st.expires - Date.now()) / 60000));
    $('#meta').textContent = `Ronda ${st.round} · ${st.players} participantes · ${st.players * st.cardsPerPlayer} de ${st.totalCards} cartones repartidos · quedan ${Math.floor(mins / 60)} h ${mins % 60} min`;
    $('#pats').innerHTML = patternsInline(st.patterns);
    $('#draws').innerHTML = drawsHTML(st, st.drawn);
    $('#count').textContent = `Tablero · ${st.drawn.length} de ${st.values}`;
    $('#board').innerHTML = boardHTML(st, st.drawn, manual);
    $('#history').innerHTML = st.drawn.map((v) => `<span>${esc(plain(st, v))}</span>`).join('') || '<span class="muted">Aún no se ha generado ningún valor.</span>';
    $('#gen').disabled = st.drawn.length >= st.values || st.auto.on;
    $('#auto').textContent = st.auto.on ? '⏸ Detener automático' : '▶ Modo automático';
    $('#auto').classList.toggle('on', st.auto.on);
    $('#manual').classList.toggle('on', manual);
    $('#results').innerHTML = st.results.length ? `<table class="list"><tr><th>Cartón</th><th>Patrón</th><th>Participante</th><th>Valores</th><th>Estado</th></tr>
      ${st.results.map((r) => `<tr><td class="${r.validated ? 'validated' : ''}"><b>#${p.startNumber + r.cardNo - 1}</b></td><td>${esc(PATTERNS.byId[r.pattern].name)}</td>
        <td>${esc(r.name)}</td><td>${r.at}</td>
        <td>${r.validated ? '<span class="tag live">Validado</span>' : '<span class="tag">Pendiente de marcar</span>'}</td></tr>`).join('')}
      </table>` : '<p class="muted">Aquí aparecerá cada cartón que complete un patrón.</p>';
    $('#final').innerHTML = st.finalists ? `<p><b>Selección final:</b> ${st.finalists.map((c) => '#' + (p.startNumber + c - 1)).join(', ') || 'no hay cartones validados'}</p>` : '';
    if (st.drawn.length !== spoken) { if (spoken >= 0 && st.drawn.length > spoken) speak(speakText(st, st.drawn.at(-1))); spoken = st.drawn.length; }
  };
  $('#gen').onclick = () => act('draw');
  $('#auto').onclick = () => act('auto', { on: !st.auto.on, interval: Number($('#interval').value), stopOnWin: $('#stop').checked });
  $('#manual').onclick = () => { manual = !manual; render(); };
  $('#voice').onchange = (e) => { voiceOn = e.target.checked; store.set('voice', voiceOn ? '1' : '0'); };
  $('#board').onclick = (e) => { const v = e.target.dataset.v; if (manual && v && !st.drawn.includes(Number(v))) act('draw', { value: Number(v) }); };
  $('#restart').onclick = () => { const patterns = readPatterns($('#restart-pats')); if (patterns && confirm('¿Reiniciar la sesión? Los cartones de los participantes se limpian.')) act('restart', { patterns }); };
  $('#finalbtn').onclick = () => { const keep = prompt('¿Cuántos cartones quieres conservar?', '1'); if (keep) act('final', { keep: Number(keep) }); };
  $('#close').onclick = async () => { if (confirm('¿Cerrar la sesión para todos?')) { await act('close'); location.hash = '#/proyectos'; } };
  const off = subscribe(sid, (s) => { st = s; render(); }, () => { location.hash = '#/proyectos'; });
  const tick = setInterval(() => st && render(), 60000);
  return () => { off(); clearInterval(tick); };
}

views.sesiones = async () => {
  const list = await api('GET', '/api/sessions');
  app.innerHTML = `${BACK}<h1>Sesiones activas</h1>
    <div class="panel scroll-x">${list.length ? `<table class="list"><tr><th>Sesión</th><th>Ronda</th><th></th></tr>
      ${list.map((s) => `<tr><td><b>${esc(s.name)}</b> ${s.locked ? '🔒' : ''}</td><td>${s.round}</td>
        <td><div class="row"><a class="btn primary" href="#/jugar/${s.id}">Unirse</a><a class="btn" href="#/tablero/${s.id}">Tablero</a></div></td></tr>`).join('')}</table>`
    : '<p>No hay sesiones públicas activas en este momento. Si tu anfitrión te dio un enlace o un código QR, úsalo para entrar.</p>'}</div>`;
};

views.jugar = async (sid) => {
  const key = `tok_${sid}`;
  let me = null;
  const token = store.get(key);
  if (token) me = await api('POST', `/api/sessions/${sid}/join`, { token }).catch(() => null);
  if (!me) {
    let info;
    try { info = await api('GET', `/api/sessions/${sid}`); } catch { return ended(); }
    app.innerHTML = `<form class="panel" id="f" style="max-width:460px;margin:0 auto">
      <h1>${esc(info.name)}</h1><p class="muted">Recibirás ${info.cardsPerPlayer} ${info.cardsPerPlayer > 1 ? 'cartones' : 'cartón'} en este dispositivo. No necesitas cuenta.</p>
      <div class="fields" style="grid-template-columns:1fr">
        <label class="f">Tu nombre<input type="text" name="name" maxlength="30" required autofocus></label>
        ${info.locked ? '<label class="f">Contraseña de la sesión<input type="text" name="password" required></label>' : ''}
        <button class="primary big">Unirse</button>
      </div></form>`;
    $('#f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', `/api/sessions/${sid}/join`, Object.fromEntries(new FormData(e.target)));
        store.set(key, r.token);
        route();
      } catch (err) { fail(err); }
    };
    return undefined;
  }
  let st = null;
  let round = null;
  const marks = Object.fromEntries(me.cards.map((c) => [c.no, new Set(c.marks)]));
  const maskOf = (c) => [...marks[c.no]].reduce((m, i) => m | (1 << i), c.cells[12] === 0 ? 1 << 12 : 0);
  app.innerHTML = `<div id="banner"></div>
    <div class="panel"><h2 id="title" style="margin:0"></h2><span class="muted small" id="meta"></span><div id="pats" style="margin-top:8px"></div></div>
    <div class="now" id="now"></div>
    <div class="cards" id="cards"></div>
    <button class="primary big" id="sync" style="margin-top:16px">↻ Actualizar y marcar lo que falta</button>
    <p class="muted small" style="margin-top:8px">Marca por ti los valores ya anunciados que se te pasaron.</p>`;
  const render = () => {
    if (round !== null && st.round !== round) me.cards.forEach((c) => marks[c.no].clear());
    round = st.round;
    $('#title').textContent = st.name;
    $('#meta').textContent = `${me.name} · Ronda ${st.round} · ${st.drawn.length} valores anunciados`;
    $('#pats').innerHTML = patternsInline(st.patterns);
    $('#now').innerHTML = `${ballHTML(st, st.drawn.at(-1), 'mid')}<div><div class="small"><b>Valor actual</b> · anteriores:</div>
      <div class="history">${st.drawn.slice(-7, -1).reverse().map((v) => `<span>${esc(plain(st, v))}</span>`).join('') || '<span>—</span>'}</div></div>`;
    const mine = st.results.filter((r) => r.validated && marks[r.cardNo]);
    // Sombra de la figura. Si el patrón admite varias formas (cualquier línea, dos líneas…),
    // se sombrea la que este cartón lleva más avanzada.
    const bits = (x) => { let n = 0; for (; x; x &= x - 1) n++; return n; };
    const hintFor = (m) => st.patterns.reduce((a, id) => {
      const best = PATTERNS.byId[id].variants.reduce((p, v) => (bits(v & m) / bits(v) > bits(p & m) / bits(p) ? v : p));
      return a | best;
    }, 0);
    $('#banner').innerHTML = mine.length ? '<div class="bingo-banner">¡BINGO!</div>' : '';
    $('#cards').innerHTML = me.cards.map((c) => {
      const m = maskOf(c);
      const green = mine.filter((r) => r.cardNo === c.no).reduce((g, r) => g | PATTERNS.completed(r.pattern, m), 0);
      return cardHTML(st, c.cells, { no: me.startNumber + c.no - 1, marks: m, green, hint: hintFor(m) });
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
  return subscribe(sid, (s) => { st = s; render(); }, () => { store.del(key); ended(); });
};

views.tablero = async (sid) => {
  document.body.classList.add('tv');
  app.innerHTML = '<div id="tv"></div>';
  const off = subscribe(sid, (st) => {
    $('#tv').innerHTML = `
      <div class="row between" style="margin-bottom:1.5vw">
        <div><h1 style="margin:0">${esc(st.name)}</h1><span class="muted">Ronda ${st.round} · ${st.drawn.length} de ${st.values}</span><div style="margin-top:8px">${patternsInline(st.patterns)}</div></div>
        ${drawsHTML(st, st.drawn)}
        ${qr(joinUrl(sid))}
      </div>${boardHTML(st, st.drawn)}`;
  }, ended);
  return () => { off(); document.body.classList.remove('tv'); };
};

// ---------- Enrutador ----------
let cleanup = null;
async function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  app.onclick = null;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const view = views[name || 'home'] || views.home;
  window.scrollTo(0, 0);
  try { cleanup = await view(arg); } catch (e) {
    app.innerHTML = `<div class="panel"><h1>No se pudo abrir esta página</h1><p>${esc(e.message)}</p><a class="btn primary" href="#/">Volver al inicio</a></div>`;
  }
}
window.addEventListener('hashchange', route);
route();
