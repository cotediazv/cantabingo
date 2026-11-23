//@ Pantallas: logo y color del local, fondo de neuronas, aviso de KRB Kids, botón refrescar. Parte de la aplicación: se carga en orden desde index.html.
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

