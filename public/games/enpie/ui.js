// «El último en pie» — VERSIÓN DE PRUEBA (pedido de Cote, 23 nov). Todo el salón juega desde el celular: 3 rondas de 4
// preguntas con 3 vidas, banca y repechaje (3 de 4: vuelve con 1 vida; 4 de 4: con 2), un corte al final de cada ronda; después, eliminación
// directa hasta que queden 3, y la final en el escenario con preguntas habladas (ver enpie.js).
// Aquí: el panel del animador (#/enpiectl), el tablero y la pantalla de pie, el GC de OBS y el celular.
(() => {
  const LET = ['A', 'B', 'C'];
  const HOWTO = [
    'Todos juegan desde su celular, en las mesas.',
    'Cada persona parte con <b>3 vidas</b>. Si fallas o no contestas antes de que se cierre la pregunta, pierdes una.',
    'Tú manejas el tiempo: «Iniciar pregunta» la muestra a todos, la lees en voz alta, das un momento para responder y con el mismo botón la cierras.',
    'Sin vidas pasas <b>a la banca</b>, pero sigues contestando: con <b>3 buenas de 4</b> vuelves al juego con 1 vida, y con <b>las 4</b>, con 2 vidas.',
    'Son <b>3 rondas de 4 preguntas</b>, cada vez más difíciles. Al final de cada ronda vemos cuántos quedan en pie.',
    'Después viene <b>la recta final</b>: no vuelve nadie de la banca y todos quedan con <b>una sola vida</b>. El que falla, se va, hasta que queden 3.',
    'Los 3 pasan a <b>la final en el escenario</b>: el que se equivoca queda eliminado. Gana el último en pie.',
  ];
  const hearts = (n, max = 3) => '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, max - n));
  const qTag = (st) => (st.direct ? `Recta final · pregunta ${st.n}` : `Ronda ${st.round} de ${st.rounds} · pregunta ${st.inRound} de ${st.perRound}`);
  const counters = (st) => `<span class="ep-c up"><b>${st.standing}</b> en pie</span><span class="ep-c"><b>${st.bench}</b> ${st.direct || st.phase === 'final' || st.phase === 'done' ? 'fuera' : 'en la banca'}</span>`;
  // Reloj: cuenta local, sincronizada con la hora del servidor
  let end = 0; let endKey = 0;
  const setClock = (st) => { if (st.until !== endKey) { endKey = st.until; end = st.until ? Date.now() + (st.until - st.now) : 0; } };
  const left = () => Math.max(0, Math.ceil((end - Date.now()) / 1000));
  setInterval(() => { if (!endKey) return; const t = String(left()); for (const el of document.querySelectorAll('.ep-clock')) if (el.textContent !== t) el.textContent = t; }, 200);
  const opts = (st, cls = '') => `<div class="ep-opts ${cls}">${st.q.opts.map((o, i) => `<div class="ep-opt ${st.q.correct === i ? 'ok' : st.q.correct != null ? 'no' : ''}"><em>${LET[i]}</em><span>${esc(o)}</span></div>`).join('')}</div>`;
  const rank = (st, n = 8) => (st.top.length ? `<ol class="ep-rank">${st.top.slice(0, n).map((p, i) => `<li class="${p.up ? 'up' : 'out'}"><em>${i + 1}</em><b>${esc(p.name)}</b><span>${p.up ? hearts(p.lives) : st.direct ? 'fuera' : 'banca'}</span><i>${p.hits}</i></li>`).join('')}</ol>` : '');
  const lastLine = (st) => {
    const l = st.last; if (!l) return '';
    const a = [];
    if (l.mercy) a.push('Nadie acertó: nadie cae'); else a.push(l.fell ? (l.direct ? `${l.fell === 1 ? 'Queda 1 fuera' : `Quedan ${l.fell} fuera`}` : `${l.fell === 1 ? 'Cayó 1' : `Cayeron ${l.fell}`} a la banca`) : 'Nadie cayó');
    if (l.back) a.push(`${l.back === 1 ? 'Vuelve 1' : `Vuelven ${l.back}`} al juego`);
    if (l.toFinal) a.push('¡Tenemos finalistas!');
    return a.join(' · ');
  };
  // El corte de la ronda: en pie y en la banca; desde el segundo, también cuántos pasaron a la banca y cuántos salieron
  // ---------- Las personas dibujadas (idea y dibujo de Cote, 23 nov) ----------
  // «Una representación gráfica con monitos simples, de palitos… no son monos, son personas… en blanco y el fondo más
  // oscuro, sobre una base… hay 150 personas, hay 150 monitos. Arriba sale en grande 150 personas que están de pie. Y al
  // momento de revelar… el piso se mueve, tiembla muy fuerte, rápidamente, y muestra cómo se caen las personas… y pasan
  // abajo a la banca… luego vemos cuántas personas suben. Cuando ya pasamos a la ronda final… cada vez que hay una
  // pregunta, se sacude la tierra y la gente se cae. En ese momento ya la banca desapareció y todos cayeron al vacío».
  // Una persona por jugador, dibujada como en la foto de Cote: cabeza redonda, cuerpo de un palo, brazos abiertos y las
  // dos piernas con sus pies hacia afuera. La animación dura unos segundos y queda quieta (regla de pantallas fluidas);
  // en los monitores del GC Master se dibuja directo el final.
  const crowd = (() => {
    let raf = 0;
    const person = (c, x, y, h, rot) => { // x: centro; y: los pies
      const w = h * 0.5; const cs = Math.cos(rot); const sn = Math.sin(rot); const cy = -h / 2; // gira sobre su centro
      const P = (px, py) => [x + px * cs - (py - cy) * sn, y + cy + px * sn + (py - cy) * cs];
      const L = (a, b) => { const p = P(a[0], a[1]); const q = P(b[0], b[1]); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); };
      const r = h * 0.15; const hc = P(0, -h + r);
      c.moveTo(hc[0] + r, hc[1]); c.arc(hc[0], hc[1], r, 0, 6.2832);
      L([0, -h + 2 * r], [0, -h * 0.36]); L([-w / 2, -h * 0.55], [w / 2, -h * 0.58]);
      L([0, -h * 0.36], [-w * 0.2, 0]); L([0, -h * 0.36], [w * 0.2, 0]); L([-w * 0.2, 0], [-w * 0.5, 0]); L([w * 0.2, 0], [w * 0.5, 0]);
    };
    const pickSome = (n, k) => { const a = Array.from({ length: n }, (_, i) => i); for (let i = a.length - 1; i > 0; i--) { const r = Math.floor(Math.random() * (i + 1)); [a[i], a[r]] = [a[r], a[i]]; } return a.slice(0, k); };
    const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
    // spec: total (personas del juego), up y bench antes del temblor, fell (caen) y back (suben); pit: sin banca, caen al vacío
    const start = (root, spec) => {
      cancelAnimationFrame(raf); raf = 0;
      const cv = root.querySelector('canvas'); if (!cv) return;
      const nUp = root.querySelector('[data-k="up"]'); const nBe = root.querySelector('[data-k="bench"]'); const sum = root.querySelector('[data-k="sum"]');
      const c = cv.getContext('2d');
      const total = Math.max(1, spec.total, spec.up + spec.bench);
      // Las medidas se toman del tamaño real del dibujo y se vuelven a tomar si cambia (al cargar las letras, al girar…)
      let W = 0; let H = 0; let zUp; let zBe; let cw; let ch; let cols; let ph;
      const measure = () => {
        const w = Math.max(200, cv.clientWidth); const h = Math.max(160, cv.clientHeight);
        if (w === W && h === H) return;
        W = cv.width = w; H = cv.height = h;
        const pad = Math.round(W * 0.03);
        zUp = { x: pad, y: 0, w: W - 2 * pad, h: spec.pit ? H * 0.62 : H * 0.5 };
        zBe = { x: pad, y: H * 0.58, w: W - 2 * pad, h: H * 0.38 };
        // tamaño de cada persona: que quepan todas, en filas, en la zona más chica
        const zone = spec.pit ? zUp : { w: zUp.w, h: Math.min(zUp.h, zBe.h) };
        cw = Math.min(Math.sqrt((zone.w * zone.h * 0.6) / total), zone.h * 0.6, W / 9);
        while (Math.floor(zone.w / cw) * Math.floor(zone.h / (cw / 0.6)) < total && cw > 3) cw *= 0.96;
        ch = cw / 0.6; cols = Math.max(1, Math.floor(zUp.w / cw)); ph = ch * 0.86;
      };
      measure();
      // las filas se llenan desde la base hacia arriba (la gente parada sobre el piso)
      const slot = (z, i, n) => { const row = Math.floor(i / cols); const inRow = Math.min(cols, n - row * cols); const off = (z.w - inRow * cw) / 2; return { x: z.x + off + ((i % cols) + 0.5) * cw, y: z.y + z.h - row * ch - 4 }; };
      const fell = Math.min(spec.fell, spec.up); const back = spec.pit ? 0 : Math.min(spec.back, spec.bench);
      const fallers = pickSome(spec.up, fell); const isF = new Set(fallers);
      const risers = pickSome(spec.bench, back); const isR = new Set(risers);
      const stay = Array.from({ length: spec.up }, (_, i) => i).filter((i) => !isF.has(i));
      const upMid = spec.up - fell; const upEnd = upMid + back; const beMid = spec.bench + fell; const beEnd = beMid - back;
      const stayB = Array.from({ length: spec.bench }, (_, i) => i).filter((i) => !isR.has(i));
      const rnd = Array.from({ length: Math.max(spec.up, spec.bench) + 1 }, () => Math.random());
      // tiempos (ms): quieto → tiembla y caen → se reordenan → suben → se reordenan
      const T1 = 1100; const SHAKE = 1500; const FALL = 950; const T2 = T1 + 700 + FALL; const PACK = 450; const T3 = T2 + PACK; const RISE = 950; const T4 = back ? T3 + 500 + RISE : T3; const END = T4 + (back ? PACK : 0);
      const frame = (t) => {
        measure();
        c.clearRect(0, 0, W, H);
        const shaking = t > T1 && t < T1 + SHAKE && fell > 0;
        const sx = shaking ? (Math.random() - 0.5) * cw * 0.5 : 0; const sy = shaking ? (Math.random() - 0.5) * cw * 0.35 : 0;
        // la base y la banca
        c.lineCap = 'round'; c.lineJoin = 'round';
        c.strokeStyle = '#f4bf5a'; c.lineWidth = Math.max(3, H * 0.012); c.beginPath(); c.moveTo(zUp.x + sx, zUp.y + zUp.h + sy); c.lineTo(zUp.x + zUp.w + sx, zUp.y + zUp.h + sy); c.stroke();
        if (!spec.pit) { c.strokeStyle = '#5b566d'; c.lineWidth = Math.max(2, H * 0.008); c.beginPath(); const by = zBe.y + zBe.h; c.moveTo(zBe.x, by); c.lineTo(zBe.x + zBe.w, by); c.moveTo(zBe.x + zBe.w * 0.06, by); c.lineTo(zBe.x + zBe.w * 0.06, by + H * 0.03); c.moveTo(zBe.x + zBe.w * 0.94, by); c.lineTo(zBe.x + zBe.w * 0.94, by + H * 0.03); c.stroke(); }
        const lw = Math.max(1, ph * 0.075);
        // los que siguen de pie (se reordenan cuando ya cayeron los demás)
        c.strokeStyle = '#ffffff'; c.lineWidth = lw; c.beginPath();
        const k = ease((t - T2) / PACK);
        stay.forEach((i, n) => { const a = slot(zUp, i, spec.up); const b = slot(zUp, n, upEnd); person(c, a.x + (b.x - a.x) * k + sx, a.y + (b.y - a.y) * k + sy, ph, shaking ? (Math.random() - 0.5) * 0.25 : 0); });
        // los que suben desde la banca
        risers.forEach((i, n) => { const u = ease((t - T3 - 100 - rnd[i] * 400) / RISE); if (u <= 0) return; const a = slot(zBe, i, spec.bench); const b = slot(zUp, upMid + n, upEnd); person(c, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, ph, 0); });
        c.stroke();
        // los que caen: giran en el aire y aterrizan en la banca (o se van al vacío)
        c.beginPath();
        let falling = 0;
        fallers.forEach((i, n) => { const u = Math.min(1, Math.max(0, (t - T1 - 250 - rnd[i] * 450) / FALL)); const a = slot(zUp, i, spec.up); const b = spec.pit ? { x: a.x + (rnd[i] - 0.5) * cw * 6, y: H + ph * 1.5 } : slot(zBe, spec.bench + n, beMid); if (u >= 1 && spec.pit) return; if (u > 0 && u < 1) falling++; const g = u * u; person(c, a.x + (b.x - a.x) * u + (u ? 0 : sx), a.y + (b.y - a.y) * g + (u ? 0 : sy), ph, u > 0 && u < 1 ? (rnd[i] > 0.5 ? 1 : -1) * u * 6.2832 : 0); });
        c.strokeStyle = t > T1 + 250 ? '#b8b3c9' : '#ffffff'; c.stroke();
        // la banca
        if (!spec.pit) {
          c.strokeStyle = '#8b879c'; c.beginPath();
          const kb = ease((t - T4) / PACK);
          stayB.forEach((i, n) => { const a = slot(zBe, i, spec.bench); const b = slot(zBe, n, beEnd); person(c, a.x + (b.x - a.x) * kb, a.y + (b.y - a.y) * kb, ph, 0); });
          risers.forEach((i) => { if (t - T3 - 100 - rnd[i] * 400 > 0) return; const a = slot(zBe, i, spec.bench); person(c, a.x, a.y, ph, 0); });
          c.stroke();
        }
        // los números de arriba van cambiando con lo que se ve
        const fd = Math.min(1, Math.max(0, (t - T1 - 250) / (FALL + 450))); const rd = back ? Math.min(1, Math.max(0, (t - T3 - 100) / (RISE + 400))) : 0;
        const up = Math.round(spec.up - fell * fd + back * rd); const be = Math.round(spec.bench + fell * fd - back * rd);
        if (nUp && nUp.textContent !== String(up)) nUp.textContent = String(up);
        if (nBe && nBe.textContent !== String(be)) nBe.textContent = String(be);
        if (sum && t >= END && !sum.dataset.on) { sum.dataset.on = '1'; sum.textContent = spec.sum || ''; }
      };
      // ya quieta, si la pantalla cambia de tamaño se vuelve a dibujar el final
      if (window.ResizeObserver) new ResizeObserver(() => { if (!raf && document.body.contains(cv)) frame(END + 1); }).observe(cv);
      if (window.__mon || document.documentElement.classList.contains('lento')) { frame(END + 1); return; } // monitores y equipos lentos: directo el final
      const t0 = performance.now(); let lastDraw = 0; let rumbled = false;
      const loop = (now) => {
        const t = now - t0;
        if (!rumbled && t > T1 && fell > 0) { rumbled = true; sfx.play('rumble'); }
        if (now - lastDraw >= 30) { lastDraw = now; frame(t); } // unos 30 cuadros por segundo
        if (t < END + 60 && document.body.contains(cv)) raf = requestAnimationFrame(loop); else { raf = 0; if (document.body.contains(cv)) frame(END + 1); }
      };
      frame(0); raf = requestAnimationFrame(loop);
    };
    return { start, stop: () => { cancelAnimationFrame(raf); raf = 0; } };
  })();
  // Qué mostrar con las personas: en el corte de cada ronda (caen a la banca y suben los que vuelven) y, en la recta
  // final, después de cada pregunta (caen al vacío; la banca ya no está)
  const crowdSpec = (st) => {
    if (st.phase === 'cut') { const c = st.cut; return { total: c.standing + c.bench, up: c.standing - c.back + c.fell, bench: c.bench - c.fell + c.back, fell: c.fell, back: c.back, pit: false, sum: `${c.fell === 1 ? 'Cayó 1' : `Cayeron ${c.fell}`} a la banca${c.round > 1 ? ` · ${c.back === 1 ? 'volvió 1' : `volvieron ${c.back}`} al juego` : ''}` }; }
    if (st.phase === 'reveal' && st.direct && st.last) return { total: Math.max(st.directFrom || 0, st.standing + st.last.fell), up: st.standing + st.last.fell, bench: 0, fell: st.last.fell, back: 0, pit: true, sum: lastLine(st) };
    return null;
  };
  const crowdHTML = (st, pit) => `<div class="ep-crowd ${pit ? 'pit' : ''}"><p class="ep-crowd-n"><b data-k="up"></b><span>personas de pie</span></p><canvas></canvas>${pit ? '' : '<p class="ep-crowd-b"><b data-k="bench"></b><span>en la banca</span></p>'}<i class="ep-crowd-s" data-k="sum"></i></div>`;
  const cutHTML = (st) => { const c = st.cut; return `<div class="ep-cut crowded"><small>Fin de la ronda ${c.round}${c.last ? ' · se cierra la puerta: recta final con una sola vida' : ''}</small>${crowdHTML(st, false)}</div>`; };
  const finHTML = (st) => `<div class="ep-fin"><small>La final · en el escenario</small><div class="ep-fs">${st.fin.players.map((p, i) => `<div class="ep-f ${p.out ? 'out' : ''} ${!p.out && st.phase === 'final' && st.fin.turn === i ? 'turn' : ''}"><b>${esc(p.name)}</b><span>${p.out ? 'Eliminado' : st.phase === 'final' && st.fin.turn === i ? 'Su turno' : 'En pie'}</span></div>`).join('')}</div></div>`;
  const follow = (paint, url = '/api/enpie') => {
    let last = ''; let alive = true;
    const tick = async () => { const st = await api('GET', url).catch(() => null); if (!alive || !st) return; setClock(st); const k = `${st.rev}:${st.phase}:${url.endsWith('/host') ? st.answered : ''}`; if (k === last) return; last = k; paint(st); };
    tick(); const t = setInterval(tick, 1500); const off = window.onAviso ? window.onAviso(tick) : () => {};
    return () => { alive = false; clearInterval(t); off(); };
  };

  // ---------- Panel del animador ----------
  views.enpiectl = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = `<div class="panel"><h1>🧍 El último en pie <small class="ep-test">versión de prueba</small></h1><div id="ep-ctl"></div></div><div id="ep-nav"></div>
      <details class="more"><summary>Más opciones</summary><button type="button" data-ep="new">Empezar un juego nuevo (borra este)</button></details>`;
    const box = $('#ep-ctl'); let shown = '';
    const paint = (st) => {
      let step = ''; let body = '';
      if (st.phase === 'done') {
        body = window.annHtml('El último en pie', st.winner ? [st.winner.name] : ['Nadie quedó en pie'], st.winner ? ['Premio mayor'] : []);
      } else if (st.phase === 'final') {
        // La final: como en El Rosko, aquí son dos botones (no hay un solo paso): el animador hace la pregunta en voz alta
        const p = st.fin.players[st.fin.turn];
        body = `<div class="ep-turn"><small>La final · es el turno de</small><b>${esc(p.name)}</b></div>
          <div class="ep-now"><small>Pregunta ${st.fin.asked} · léela en voz alta</small><b>${esc(st.fin.q.text)}</b><p class="ep-ans">Respuesta: <b>${esc(st.fin.q.answer)}</b></p></div>
          <div class="ep-yn"><button type="button" class="ep-yes" data-ep="right">✔ Correcta</button><button type="button" class="ep-no" data-ep="wrong">✘ Incorrecta · queda eliminado</button></div>
          <div class="ep-flist">${st.fin.players.map((x, i) => `<p class="${x.out ? 'out' : ''}"><b>${esc(x.name)}</b><span>${x.out ? 'Eliminado' : i === st.fin.turn ? 'Su turno' : 'En pie'}</span></p>`).join('')}</div>`;
      } else if (st.phase === 'question') {
        step = `<button class="primary big paso" data-ep="next">⏹ Cerrar la pregunta y mostrar la respuesta</button>`;
        body = `<div class="ep-now"><small>${esc(qTag(st))} · ${st.q.level === 'm' ? 'nivel medio' : 'fácil'} · léela en voz alta · <span class="ep-ansn">${st.answered} ${st.answered === 1 ? 'respuesta' : 'respuestas'}</span></small><b>${esc(st.q.text)}</b>${opts(st)}</div>`;
      } else if (st.phase === 'cut') {
        const c = st.cut;
        step = `<button class="primary big paso" data-ep="next">${c.last ? (st.standing <= st.finalists ? '🏁 Pasar a la final' : '⚡ Recta final: iniciar pregunta') : `▶ Ronda ${c.round + 1}: iniciar pregunta`}</button>`;
        body = window.annHtml(`Fin de la ronda ${c.round}`, [`${c.standing} en pie · ${c.bench} en la banca`], [c.round > 1 ? `En esta ronda: ${c.fell} pasaron a la banca y ${c.back} salieron de la banca` : '', c.last ? 'Se cierra la puerta: no vuelve nadie de la banca y todos quedan con una sola vida. El que falla, se va, hasta que queden 3.' : ''].filter(Boolean));
      } else if (st.phase === 'reveal') {
        const label = st.last && st.last.toFinal ? '🏁 Pasar a la final en el escenario' : st.cutDue ? `📊 Mostrar el corte de la ronda ${st.round}` : st.nextDirect ? '⚡ Siguiente pregunta (recta final)' : `▶ Siguiente pregunta (ronda ${st.round} · ${st.inRound + 1} de ${st.perRound})`;
        step = `<button class="primary big paso" data-ep="next">${label}</button>`;
        body = `<div class="ep-now"><small>${esc(qTag(st))} · ${esc(lastLine(st))}</small><b>${esc(st.q.text)}</b>${opts(st)}</div>`;
      } else {
        step = '<button class="primary big paso" data-ep="next">▶ Iniciar pregunta</button>';
        body = window.readAloud('El último en pie', HOWTO);
      }
      const html = `${step}${body}<p class="ep-counts">${counters(st)}</p>${st.phase !== 'lobby' && st.phase !== 'final' ? `<h2>Ranking</h2>${rank(st, 10) || '<p class="muted">Todavía no contesta nadie.</p>'}` : ''}`;
      if (html !== shown) { shown = html; box.innerHTML = html; }
      // Con el juego terminado vuelve el menú de juegos
      const nav = $('#ep-nav'); const want = st.phase === 'done' ? '1' : '';
      if (nav && nav.dataset.on !== want) { nav.dataset.on = want; nav.innerHTML = want && typeof activitiesNav === 'function' ? activitiesNav('enpie') : ''; }
    };
    const stop = follow(paint, '/api/enpie/host');
    const first = await api('GET', '/api/enpie/host').catch(() => null);
    // Al entrar: si no hay un juego a medias, parte uno nuevo y la pantalla pasa al juego
    if (first && (first.phase === 'done' || first.phase === 'lobby')) { const st = await api('POST', '/api/enpie/host', { action: 'new' }).catch(fail); if (st) { setClock(st); paint(st); } }
    document.body.addEventListener('click', views.enpiectl.onClick = async (e) => {
      const b = e.target.closest('[data-ep]');
      if (!b || !$('#ep-ctl')) return;
      if (b.dataset.ep === 'new' && !confirm('¿Empezar un juego nuevo? Se borra el que está en curso.')) return;
      b.disabled = true;
      try { const st = await api('POST', '/api/enpie/host', { action: b.dataset.ep }); setClock(st); shown = ''; paint(st); } catch (err) { fail(err); b.disabled = false; }
    });
    return () => { stop(); document.body.removeEventListener('click', views.enpiectl.onClick); };
  };

  // ---------- Tablero del local y pantalla de pie ----------
  const scene = (st) => {
    if (st.phase === 'done') return `<div class="ep-win"><small>${st.winner ? 'El último en pie' : 'Fin del juego'}</small><b>${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}</b>${st.winner ? '<span>¡Felicitaciones!</span>' : ''}</div>`;
    if (st.phase === 'final') return finHTML(st);
    if (st.phase === 'cut') return cutHTML(st);
    if (st.phase === 'lobby') return '<div class="ep-intro"><small>Todos juegan desde su celular</small><b>Tienes 3 vidas</b><ul><li>Si fallas, pierdes una vida</li><li>Sin vidas vas a la banca, pero sigues jugando</li><li>Con 3 buenas de 4 vuelves al juego</li><li>Los 3 últimos van a la final en el escenario</li></ul></div>';
    const q = `<div class="ep-q"><small class="ep-tag ${st.direct ? 'subita' : ''}">${esc(qTag(st))}</small><b>${esc(st.q.text)}</b>${opts(st)}</div>`;
    if (st.phase === 'question') return `${q}<div class="ep-side wait"><small>Pregunta abierta</small><b>Contesta en tu celular</b></div>`;
    return st.direct ? `${q}<div class="ep-side crowdside">${crowdHTML(st, true)}</div>` : `${q}<div class="ep-side rank"><small>${esc(lastLine(st))}</small>${rank(st, 8)}</div>`;
  };
  views.enpieFull = async () => {
    app.innerHTML = '<div id="ep"></div>';
    const stop = follow((st) => {
      const box = $('#ep'); if (!box) return;
      if (st.phase === 'done' && st.winner && box.dataset.won !== String(st.gen)) { box.dataset.won = String(st.gen); sfx.play('win'); } else if (st.phase === 'reveal' && !st.direct && box.dataset.rev !== String(st.rev)) sfx.play('chime');
      box.dataset.rev = String(st.rev);
      box.className = `th-${st.venue} ph-${st.phase}`;
      box.innerHTML = `<header class="ep-top"><b>El último en pie</b><p>${counters(st)}</p></header><main class="ep-main">${scene(st)}</main>`;
      const spec = crowdSpec(st); const cr = box.querySelector('.ep-crowd');
      if (spec && cr) requestAnimationFrame(() => crowd.start(cr, spec)); else crowd.stop();
    });
    return () => { stop(); crowd.stop(); };
  };

  // ---------- GC de OBS: franja de abajo ----------
  views.enpieGC = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="epg"></div>';
    const stop = follow((st) => {
      const box = $('#epg'); if (!box) return;
      let main; let side; let tag;
      if (st.phase === 'done') { tag = 'Ganó'; main = `<b>${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}</b><span>¡El último en pie!</span>`; side = ''; } else if (st.phase === 'final') {
        tag = 'La final'; main = `<span class="epg-opts">${st.fin.players.map((p, i) => `<i class="${p.out ? 'no' : i === st.fin.turn ? 'ok' : ''}">${esc(p.name)}</i>`).join('')}</span><span>El que se equivoca queda eliminado</span>`; side = `<small>En pie</small><b>${st.fin.players.filter((p) => !p.out).length}</b>`;
      } else if (st.phase === 'cut') {
        const c = st.cut; tag = `Fin de la ronda ${c.round}`; main = `<b>${c.standing} en pie · ${c.bench} en la banca</b>${c.round > 1 ? `<span>${c.fell} pasaron a la banca · ${c.back} salieron de la banca</span>` : ''}`; side = `<small>En pie</small><b>${c.standing}</b>`;
      } else if (st.phase === 'lobby') { tag = 'Nuevo juego'; main = '<b>Todos juegan desde su celular</b><span>3 vidas · sin vidas vas a la banca · con 3 buenas de 4 vuelves</span>'; side = '<small>Prepárate</small>'; } else {
        tag = qTag(st);
        main = `<b>${esc(st.q.text)}</b><span class="epg-opts">${st.q.opts.map((o, i) => `<i class="${st.q.correct === i ? 'ok' : st.q.correct != null ? 'no' : ''}"><em>${LET[i]}</em>${esc(o)}</i>`).join('')}</span>`;
        side = `<small>En pie</small><b>${st.standing}</b>`;
      }
      box.className = `th-${st.venue} on`;
      box.innerHTML = `<div class="epg-bar"><div class="epg-tag"><small>El último en pie</small><b>${esc(tag)}</b></div><div class="epg-main">${main}</div><div class="epg-side">${side}</div></div>`;
    });
    return () => { stop(); document.body.classList.remove('obs', 'gc-screen'); };
  };

  // ---------- Celular ----------
  let pShown = ''; let sending = false;
  window.phoneEnpie = {
    reset() { pShown = ''; },
    async draw(sid, token) {
      const box = $('#penpie');
      const st = await api('GET', `/api/enpie?token=${encodeURIComponent(token)}`).catch(() => null);
      if (!st || !box || box.hidden) return;
      setClock(st);
      const me = st.me;
      const over = st.phase === 'final' || st.phase === 'done';
      const closed = st.direct || over || (st.phase === 'cut' && st.cut.last);
      const way = !me || me.up ? '' : closed ? '<i>Quedaste fuera: ya no hay repechaje</i>' : `<i>Para volver: 3 buenas de 4 (1 vida) o las 4 (2 vidas) · llevas <b>${me.h}</b> de ${me.w}</i>`;
      const status = !me ? '' : me.finalist ? '<p class="pep-me up">🏁 <b>¡Eres finalista!</b><span>Acércate a nuestro escenario</span></p>'
        : `<p class="pep-me ${me.up ? 'up' : 'out'}">${me.up ? `${hearts(me.lives)} <b>En pie</b>` : closed ? '👋 <b>Fuera del juego</b>' : '🪑 <b>En la banca</b>'}<span>Puesto ${me.pos} de ${me.of} · ${me.hits} aciertos</span>${way}</p>`;
      let body;
      if (st.phase === 'done') {
        body = `<div class="pvote-win">🏆 ${esc(st.winner ? st.winner.name : 'Nadie quedó en pie')}<small>${st.winner ? '¡Es el último en pie!' : 'Fin del juego'}</small></div>`;
      } else if (st.phase === 'final') {
        body = `<p class="pvote-ask">La final<b>Mira el escenario</b></p><div class="pep-fin">${st.fin.players.map((p, i) => `<p class="${p.out ? 'out' : ''}"><b>${esc(p.name)}</b><span>${p.out ? 'Eliminado' : i === st.fin.turn ? 'Su turno' : 'En pie'}</span></p>`).join('')}</div><p class="pvote-wait">El que se equivoca queda eliminado.</p>`;
      } else if (st.phase === 'cut') {
        const c = st.cut;
        body = `<p class="pvote-ask">Fin de la ronda ${c.round}<b>${c.standing} en pie · ${c.bench} en la banca</b></p>${c.round > 1 ? `<p class="pep-last">${c.fell} pasaron a la banca · ${c.back} salieron de la banca</p>` : ''}${c.last ? '<p class="pep-hint">Recta final: todos con una sola vida. El que falla, se va</p>' : ''}<h3 class="pep-h">Ranking</h3>${rank(st, 10)}`;
      } else if (st.phase === 'lobby') {
        body = `<p class="pvote-ask">¡Prepárate!<b>Tienes 3 vidas</b></p><ul class="pep-how">${HOWTO.slice(1).map((l) => `<li>${l}</li>`).join('')}</ul>`;
      } else if (st.phase === 'question') {
        const pick = me ? me.pick : null;
        const can = st.direct ? !!(me && me.up) : true; // en la eliminación directa solo contestan los que siguen en pie
        const hint = st.direct ? (can ? '⚡ Tienes una sola vida: si fallas, quedas fuera' : '') : me && !me.up && me.w === st.backOf - 1 && me.h >= st.backNeed - 1 ? (me.h === st.backOf - 1 ? '🔁 ¡Si aciertas esta, vuelves con 2 vidas!' : '🔁 ¡Si aciertas esta, vuelves al juego!') : !me && st.n > 2 ? 'Entras por la banca: con 3 buenas de 4 pasas al juego' : '';
        body = `<p class="pvote-ask">${esc(qTag(st))}<b>${esc(st.q.text)}</b></p>${hint ? `<p class="pep-hint">${hint}</p>` : ''}
          ${can ? `<div class="pep-keys">${st.q.opts.map((o, i) => `<button type="button" data-pick="${i}" class="${pick === i ? 'on' : ''}" ${pick != null ? 'disabled' : ''}><em>${LET[i]}</em>${esc(o)}</button>`).join('')}</div>` : '<p class="pvote-wait">Mira la pantalla: quedan pocos en pie.</p>'}
          <p class="pvote-clock">${pick != null ? '✔ Respuesta enviada' : can ? 'Responde antes de que se cierre la pregunta' : ''}</p>`;
      } else {
        const played = me && me.lastOk != null && (!st.direct || me.up || me.fell);
        const res = !played ? '' : me.back ? `<div class="pvote-win">🎉 ¡Volviste al juego!<small>Tienes ${me.lives === 1 ? '1 vida' : `${me.lives} vidas`}</small></div>` : me.fell ? `<div class="pep-res no">${st.direct ? '💔 Quedaste fuera' : '💔 Te quedaste sin vidas<small>Pasas a la banca: sigue contestando, con 3 buenas de 4 vuelves</small>'}</div>` : me.lastOk ? '<div class="pep-res ok">✔ ¡Correcto!</div>' : `<div class="pep-res no">✘ Incorrecto${me.up && !st.last.mercy ? '<small>Pierdes una vida</small>' : ''}</div>`;
        body = `${res}<p class="pvote-wait">La respuesta era <b>${LET[st.q.correct]} · ${esc(st.q.opts[st.q.correct])}</b></p><p class="pep-last">${esc(lastLine(st))}</p><h3 class="pep-h">Ranking</h3>${rank(st, 10)}`;
      }
      const html = `<div class="pvote-head"><b>🧍 El último en pie</b></div><p class="pep-counts">${counters(st)}</p>${status}${body}`;
      if (html !== pShown) { pShown = html; box.innerHTML = html; }
      box.onclick = async (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b || sending) return;
        sending = true; box.querySelectorAll('[data-pick]').forEach((x) => { x.disabled = true; }); b.classList.add('on');
        try { await api('POST', '/api/enpie/answer', { sid, token, pick: Number(b.dataset.pick) }); } catch (err) { fail(err); }
        sending = false; pShown = ''; window.phoneEnpie.draw(sid, token);
      };
    },
  };
})();

// Qué se ve en el tablero y en el GC de OBS cuando el escenario es El último en pie (public/core/escenarios.js)
KRB.escenario('enpie', { full: () => views.enpieFull(), gc: () => views.enpieGC(), qrFull: 'br', qrGc: 'above',
  // celular: la caja con la teclera o la pregunta (views.jugar la muestra con este escenario)
  celular: { id: 'penpie', cls: 'pvote penpie', rev: 'enpieRev', every: 6000, reset: () => window.phoneEnpie.reset(), draw: (sid, token) => window.phoneEnpie.draw(sid, token) },
});
KRB.juego({ id: 'enpie', icon: '🧍', name: 'El último en pie', href: '#/enpiectl' }); // versión de prueba: se abre desde Juegos
