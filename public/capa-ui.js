// Capa gráfica sobre la cámara (pedido de Cote, 21 nov). Vive encima del GC de OBS de cada local (#/light-gc/<local> y
// #/escena) y reproduce lo que se dispara desde el GC Master: cortina, texto en 3D real y celebración. No toca el GC:
// es una capa aparte, transparente, que aparece y se va sola. Las piezas pesadas (3D) se cargan solo al usarse.
(() => {
  const COL = { kennedy: ['#1487cf', 0x1487cf], frida: ['#c4175e', 0xc4175e], tobalaba: ['#c81e1e', 0xc81e1e] };
  const DUR = { cortina: 3600, texto3d: 9000, celebracion: 3400 };
  let last = null; // id del último disparo visto
  let venue = '';
  let stopNow = null; // corta la pieza que está en pantalla
  let gl = null; // el 3D se crea una sola vez y se reutiliza
  let glTried = false;

  // Solo en los GC de OBS; el local sale de la ruta o del que ya calculó la página (sala de juegos)
  const where = () => {
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    if (name === 'light-gc') return COL[arg] ? arg : document.body.dataset.venue || '';
    if (name === 'escena') return document.body.dataset.venue || '';
    return '';
  };
  const root = () => {
    let el = document.getElementById('capa');
    if (!el) { el = document.createElement('div'); el.id = 'capa'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
    el.style.setProperty('--cp', (COL[venue] || COL.kennedy)[0]);
    return el;
  };
  const clear = () => { if (stopNow) { const f = stopNow; stopNow = null; try { f(); } catch (e) { /* nada */ } } };
  const layer = (cls, html) => { const d = document.createElement('div'); d.className = `cp ${cls}`; d.innerHTML = html || ''; root().appendChild(d); return d; };
  // Cada pieza se quita sola al terminar; si llega otra antes, se corta
  const timed = (el, ms, extra) => { const t = setTimeout(() => { if (stopNow === end) stopNow = null; end(); }, ms); const end = () => { clearTimeout(t); if (extra) extra(); el.remove(); }; stopNow = end; };

  const cortina = () => timed(layer('cp-cur', '<i></i><i></i><i></i><i></i><i></i><img src="krb-stage.svg" alt="">'), DUR.cortina);

  const celebracion = () => {
    const el = layer('cp-vid', '<video muted playsinline autoplay preload="auto" src="capa/celebracion.webm"></video>');
    const v = el.querySelector('video');
    const p = v.play(); if (p && p.catch) p.catch(() => {});
    timed(el, DUR.celebracion, () => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* nada */ } });
  };

  // Texto: «arriba / abajo» son dos líneas (la de abajo más chica); un texto largo sin «/» se parte en dos líneas iguales
  const lines = (text) => {
    const parts = text.split('/').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return [{ text: parts[0], size: 150 }, { text: parts.slice(1).join(' '), size: 66 }];
    const t = parts[0] || text;
    if (t.length > 18 && t.includes(' ')) {
      let cut = -1;
      for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (cut < 0 || Math.abs(i - t.length / 2) < Math.abs(cut - t.length / 2))) cut = i;
      return [{ text: t.slice(0, cut), size: 120 }, { text: t.slice(cut + 1), size: 120 }];
    }
    return [{ text: t, size: 150 }];
  };
  const loadScript = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  const ready3d = async () => {
    if (gl || glTried) return gl;
    glTried = true;
    try {
      if (!window.Capa3D) await loadScript('capa/capa3d.js');
      const font = await (await fetch('capa/fuente-3d.json')).json();
      const canvas = document.createElement('canvas'); canvas.className = 'cp-gl';
      gl = { canvas, api: window.Capa3D.create(canvas, font, { scale: 0.75 }) };
    } catch (e) { gl = null; }
    return gl;
  };
  const texto3d = async (text, id) => {
    const g = await ready3d();
    if (last !== id) return; // mientras cargaba llegó otro disparo
    const ls = lines(text);
    if (!g) {
      // sin 3D en este navegador: el mismo texto, plano, para que igual salga al aire
      timed(layer('cp-flat', ls.map((l, i) => `<b class="${i && ls[0].size > l.size ? 's' : ''}"></b>`).join('')), DUR.texto3d);
      document.querySelectorAll('#capa .cp-flat b').forEach((b, i) => { b.textContent = ls[i].text; });
      return;
    }
    const el = layer('cp-3d'); el.appendChild(g.canvas);
    const c = (COL[venue] || COL.kennedy)[1];
    g.api.setText(ls, [{ front: 0xffc400, side: c }, { front: 0xffffff, side: c }]);
    g.api.play(DUR.texto3d);
    timed(el, DUR.texto3d + 200, () => g.api.stop());
  };

  const play = (c) => {
    clear();
    if (c.kind === 'cortina') cortina();
    else if (c.kind === 'celebracion') celebracion();
    else if (c.kind === 'texto3d' && c.text) texto3d(c.text, c.id);
  };

  let busy = false;
  const tick = async () => {
    const v = where();
    if (!v) { if (venue) { clear(); const el = document.getElementById('capa'); if (el) el.remove(); venue = ''; last = null; } return; }
    if (v !== venue) { clear(); venue = v; last = null; }
    if (busy) return;
    busy = true;
    try {
      const c = await (await fetch(`/api/capa?local=${v}`, { cache: 'no-store' })).json();
      if (v !== venue || typeof c.id !== 'number') return;
      if (last === null) { last = c.id; return; } // al abrir la página no se repite lo que ya pasó
      if (c.id === last) return;
      last = c.id;
      // solo lo recién disparado (si la página estuvo sin conexión, no sale algo viejo de golpe)
      if (c.kind === 'off' || c.now - c.at > 6000) clear(); else play(c);
    } catch (e) { /* sin conexión: se reintenta */ } finally { busy = false; }
  };
  setInterval(tick, 1000);
  // A los 8 s de abierto el GC se dejan bajadas las piezas del 3D, para que el primer texto no se demore en salir
  setTimeout(() => { if (where()) { fetch('capa/capa3d.js').catch(() => {}); fetch('capa/fuente-3d.json').catch(() => {}); } }, 8000);
  window.addEventListener('hashchange', () => setTimeout(tick, 300));
})();
