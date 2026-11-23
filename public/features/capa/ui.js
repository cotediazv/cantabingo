// Capa gráfica sobre la cámara (pedido de Cote, 21 nov). Vive encima del GC de OBS de cada local (#/light-gc/<local> y
// #/escena) y reproduce lo que se dispara desde el GC Master: cortina, texto en 3D real, celebración, fuegos artificiales,
// lluvia de confeti, luces de escenario y corazones. No toca el GC:
// es una capa aparte, transparente, que aparece y se va sola. Las piezas pesadas (3D) se cargan solo al usarse.
(() => {
  const COL_OLD = { kennedy: ['#1487cf', 0x1487cf], frida: ['#c4175e', 0xc4175e], tobalaba: ['#c81e1e', 0xc81e1e] };
  // con el diseño nuevo (html.t2), los colores de la marca: los mismos de las pantallas
  const COL_NEW = { kennedy: ['#47b8e6', 0x47b8e6], frida: ['#e0338f', 0xe0338f], tobalaba: ['#e5413a', 0xe5413a] };
  const COL = new Proxy({}, { get: (_t, k) => ((window.t2 && window.t2()) ? COL_NEW : COL_OLD)[k] });
  const oro = () => ((window.t2 && window.t2()) ? 0xf4bf5a : 0xffc400);
  const DUR = { cortina: 3600, texto3d: 9000, celebracion: 3400, fuegos: 7000, confeti: 8000, luces: 8000, corazones: 7000 };
  const PAL = ['#ffc400', '#ffffff', '#ff5aa5', '#3ddc84', '#5ac8ff', '#ff8a2a'];
  let last = null; // id del último disparo visto
  let venue = '';
  let stopNow = null; // corta la pieza que está en pantalla
  let gl = null; // el 3D se crea una sola vez y se reutiliza
  let glTried = false;
  // Para que vaya fluido en cualquier equipo (pedido de Cote, 22 nov): los efectos se dibujan a 30 cuadros por segundo, que
  // es lo que transmite OBS (a 60 el computador hacía el doble de trabajo sin que se viera); en los monitores del GC
  // Master (?mon=1) van a 15 y el texto sale plano, para no dibujar el 3D dos veces en el mismo computador
  const MON = document.documentElement.classList.contains('mon');
  const FRAME = MON ? 62 : 29; // milisegundos mínimos entre cuadros

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

  // Efectos dibujados (pedido de Cote, 22 nov: 4 botones más): un lienzo transparente de 1280x720 que el navegador estira
  // (liviano para el computador de OBS); cada efecto es una función que dibuja un cuadro; al final se desvanece solo
  const fx = (kind, setup) => {
    const el = layer('cp-fx', '<canvas width="1280" height="720"></canvas>');
    el.style.animationDuration = `${DUR[kind]}ms`;
    const g = el.querySelector('canvas').getContext('2d');
    const step = setup(g, 1280, 720, (COL[venue] || COL.kennedy)[0]);
    let raf = 0; let t0 = 0; let prev = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (!t0) { t0 = now; prev = now - 33; }
      if (now - prev < FRAME) return;
      const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
      g.clearRect(0, 0, 1280, 720);
      step((now - t0) / 1000, dt);
    };
    raf = requestAnimationFrame(loop);
    timed(el, DUR[kind], () => cancelAnimationFrame(raf));
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  // Fuegos artificiales: un estallido cada medio segundo, con chispas que caen y se apagan
  const fuegos = () => fx('fuegos', (g, W, H, col) => {
    const parts = []; const flashes = []; let next = 0;
    const burst = () => {
      const x = rnd(W * 0.14, W * 0.86), y = rnd(H * 0.14, H * 0.5), c = [col, ...PAL][Math.floor(rnd(0, PAL.length + 1))], n = 96;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd(-0.05, 0.05), v = rnd(170, 520); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(1.3, 2.1), age: 0, c: i % 4 ? c : '#ffffff' }); }
      flashes.push({ x, y, age: 0, c });
    };
    return (t, dt) => {
      if (t >= next && t < DUR.fuegos / 1000 - 1.9) { burst(); next = t + rnd(0.28, 0.5); }
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineWidth = 5;
      // el destello del estallido
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i]; f.age += dt;
        if (f.age > 0.35) { flashes.splice(i, 1); continue; }
        const r = 30 + f.age * 420, gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 1 - f.age / 0.35; g.fillStyle = gr; g.beginPath(); g.arc(f.x, f.y, r, 0, Math.PI * 2); g.fill();
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        const px = p.x, py = p.y, drag = Math.pow(0.16, dt);
        p.vx *= drag; p.vy = p.vy * drag + 190 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        g.globalAlpha = Math.pow(1 - p.age / p.life, 0.8); g.strokeStyle = p.c;
        g.beginPath(); g.moveTo(px - p.vx * 0.07, py - p.vy * 0.07); g.lineTo(p.x, p.y); g.stroke();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(p.x, p.y, 2.6, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    };
  });
  // Lluvia de confeti: papelitos que caen girando desde arriba
  const confeti = () => fx('confeti', (g, W, H, col) => {
    const cs = [col, ...PAL];
    const parts = Array.from({ length: 190 }, (_, i) => ({ x: rnd(0, W), y: -rnd(20, H * 1.15), w: rnd(9, 18), h: rnd(6, 11), vy: rnd(170, 330), sway: rnd(18, 60), ph: rnd(0, 6.3), rot: rnd(0, 6.3), vr: rnd(-7, 7), c: cs[i % cs.length] }));
    return (t, dt) => {
      for (const p of parts) {
        p.y += p.vy * dt; p.rot += p.vr * dt;
        if (p.y > H + 30) continue;
        g.save(); g.translate(p.x + Math.sin(t * 2 + p.ph) * p.sway, p.y); g.rotate(p.rot); g.scale(1, Math.cos(t * 6 + p.ph));
        g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore();
      }
    };
  });
  // Corazones: suben desde abajo meciéndose y se desvanecen arriba
  const corazones = () => fx('corazones', (g, W, H, col) => {
    const cs = ['#ff2d55', '#ff5aa5', '#ff8fb8', '#ffffff', col];
    const parts = Array.from({ length: 34 }, (_, i) => ({ x: rnd(W * 0.04, W * 0.96), d: rnd(0, 4.2), s: rnd(22, 58), vy: rnd(150, 260), sway: rnd(14, 44), ph: rnd(0, 6.3), c: cs[i % cs.length] }));
    const heart = (s) => { g.beginPath(); g.moveTo(0, s * 0.35); g.bezierCurveTo(-s * 1.1, -s * 0.3, -s * 0.55, -s * 1.05, 0, -s * 0.45); g.bezierCurveTo(s * 0.55, -s * 1.05, s * 1.1, -s * 0.3, 0, s * 0.35); g.closePath(); };
    return (t) => {
      for (const p of parts) {
        const a = t - p.d; if (a < 0) continue;
        const y = H + p.s - a * p.vy; if (y < -p.s * 2) continue;
        g.save(); g.translate(p.x + Math.sin(a * 2.2 + p.ph) * p.sway, y); g.rotate(Math.sin(a * 2.2 + p.ph) * 0.25); g.scale(1 + Math.sin(a * 5 + p.ph) * 0.08, 1 + Math.sin(a * 5 + p.ph) * 0.08);
        g.globalAlpha = Math.max(0, Math.min(1, y / (H * 0.45)));
        heart(p.s); g.fillStyle = p.c; g.fill(); g.lineWidth = 2.5; g.strokeStyle = 'rgba(255,255,255,.75)'; g.stroke(); g.restore();
      }
      g.globalAlpha = 1;
    };
  });
  // Luces de escenario: cinco haces de luz que barren desde arriba (dibujados en el mismo lienzo liviano; con CSS eran pesados)
  const luces = () => fx('luces', (g, W, H, col) => {
    const beams = [[0.12, -0.14, 0.52, 3.2, '255,255,255'], [0.31, 0.42, -0.35, 2.6, '255,196,0'], [0.5, -0.45, 0.45, 3.8, null], [0.69, 0.35, -0.42, 2.9, '255,196,0'], [0.88, 0.14, -0.52, 3.4, '255,255,255']];
    const rgb = `${parseInt(col.slice(1, 3), 16)},${parseInt(col.slice(3, 5), 16)},${parseInt(col.slice(5, 7), 16)}`;
    const L = H * 1.25;
    return (t) => {
      const a0 = Math.min(1, t / 0.6); // se encienden de a poco
      for (const [x, from, to, per, c] of beams) {
        const k = (1 - Math.cos((t / per) * Math.PI)) / 2; // va y vuelve suave
        const cc = c || rgb;
        g.save(); g.translate(W * x, -H * 0.06); g.rotate(from + (to - from) * k);
        const gr = g.createLinearGradient(0, 0, 0, L); gr.addColorStop(0, `rgba(${cc},${0.66 * a0})`); gr.addColorStop(0.45, `rgba(${cc},${0.22 * a0})`); gr.addColorStop(0.92, `rgba(${cc},0)`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.lineTo(H * 0.2, L); g.lineTo(-H * 0.2, L); g.closePath(); g.fill(); g.restore();
      }
    };
  });

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
    if (gl || glTried || MON) return gl;
    glTried = true;
    try {
      if (!window.Capa3D) await loadScript('capa/capa3d.js');
      const font = await (await fetch('capa/fuente-3d.json')).json();
      const canvas = document.createElement('canvas'); canvas.className = 'cp-gl';
      gl = { canvas, api: window.Capa3D.create(canvas, font, { scale: 0.75, fps: 30 }) };
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
    g.api.setText(ls, [{ front: oro(), side: c }, { front: 0xffffff, side: c }]);
    g.api.play(DUR.texto3d);
    timed(el, DUR.texto3d + 200, () => g.api.stop());
  };

  const play = (c) => {
    clear();
    if (c.kind === 'cortina') cortina();
    else if (c.kind === 'celebracion') celebracion();
    else if (c.kind === 'texto3d' && c.text) texto3d(c.text, c.id);
    else if (c.kind === 'fuegos') fuegos();
    else if (c.kind === 'confeti') confeti();
    else if (c.kind === 'corazones') corazones();
    else if (c.kind === 'luces') luces();
  };

  let busy = false; let again = false;
  const tick = async () => {
    const v = where();
    if (!v) { if (venue) { clear(); const el = document.getElementById('capa'); if (el) el.remove(); venue = ''; last = null; } return; }
    if (v !== venue) { clear(); venue = v; last = null; }
    if (busy) { again = true; return; }
    busy = true;
    try {
      const c = await (await fetch(`/api/capa?local=${v}`, { cache: 'no-store' })).json();
      if (v !== venue || typeof c.id !== 'number') return;
      if (last === null) { last = c.id; return; } // al abrir la página no se repite lo que ya pasó
      if (c.id === last) return;
      last = c.id;
      // solo lo recién disparado (si la página estuvo sin conexión, no sale algo viejo de golpe)
      if (c.kind === 'off' || c.now - c.at > 6000) clear(); else play(c);
    } catch (e) { /* sin conexión: se reintenta */ } finally { busy = false; if (again) { again = false; tick(); } }
  };
  setInterval(tick, 1000);
  // y al instante cuando el servidor avisa de un disparo (solo en los GC: where() dice si esta página lo es)
  let offAviso = null;
  const listen = () => { const on = !!where(); if (on && !offAviso && window.onAviso) offAviso = window.onAviso(tick); else if (!on && offAviso) { offAviso(); offAviso = null; } };
  setInterval(listen, 2000); setTimeout(listen, 0);
  // A los 8 s de abierto el GC se deja listo el 3D (piezas bajadas y dibujo preparado), para que el primer texto salga
  // de inmediato y no se quede pegado mientras el computador lo prepara
  setTimeout(() => { if (where() && !MON) ready3d().then((g) => { if (g && g.api.warm) g.api.warm(); }).catch(() => {}); }, 8000);
  window.addEventListener('hashchange', () => setTimeout(tick, 300));
})();
