//@ Base: $, esc, store, api, toast, aviso inmediato y GC PER. Parte de la aplicación: se carga en orden desde index.html.
/* global PATTERNS */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');
// Pedido de Cote (21 nov): al dar a conocer un ganador, un premio o una información, el animador también lo ve en su
// panel, grande, para leerlo en voz alta (lo mismo que está en la pantalla del local)
// El ranking de la Trivia del Rosko desplegado en pantalla, también grande en el panel (pedido de Cote, 21 nov)
window.rankAnnHtml = (rank, players, final) => `<div class="panel ann rank-ann"><small>📣 En pantalla ahora</small><span class="ann-t">🏅 Ranking de la Trivia del Rosko · ${final ? 'resultados finales' : 'resultados parciales'}</span>
  ${rank.length ? `<ol class="rank-ann-list">${rank.map((t, i) => `<li class="${i < 3 ? 'top' : ''}"><em>${i + 1}.º</em><b>${esc(t.name)}</b><i>${t.score} pts</i></li>`).join('')}</ol>` : '<span class="ann-l">Todavía nadie suma puntos</span>'}
  <span class="ann-l">${players} ${players === 1 ? 'persona jugando' : 'personas jugando'}</span></div>`;
window.annHtml = (title, names, lines = []) => `<div class="panel ann"><small>📣 Para anunciar</small><span class="ann-t">${esc(title)}</span>${names.map((n) => `<b class="ann-n">${esc(n)}</b>`).join('')}${lines.filter(Boolean).map((l) => `<span class="ann-l">${esc(l)}</span>`).join('')}</div>`;
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
    if (fns.size && !es && window.EventSource && !window.__mon) { try { es = new EventSource('/api/live'); es.onmessage = fire; } catch (e) { es = null; } }
    else if (!fns.size && es) { es.close(); es = null; }
  };
  return (fn) => { fns.add(fn); sync(); return () => { fns.delete(fn); sync(); }; };
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

