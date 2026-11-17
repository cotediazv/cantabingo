/* global views, app, $ */
// KRB Kids: juegos para niños de 3 a 5 años en el celular de los papás, mientras los adultos juegan.
// Sin sonido, sin preguntas y sin texto: solo tocar y jugar. Nadie pierde.
(() => {
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const COLORS = ['#e63946', '#1d6fe0', '#ffc400', '#2bb24c', '#ff5fa2', '#8e44ad', '#ff8c1a'];
  const confetti = () => {
    const box = document.createElement('div');
    box.className = 'kz-confetti';
    box.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${COLORS[i % COLORS.length]};animation-delay:${(Math.random() * 0.4).toFixed(2)}s"></i>`).join('');
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  };

  // Desenlace final de un juego por niveles: trofeo, estrellas, confeti y botón para jugar de nuevo
  const finale = (stage, again) => {
    stage.innerHTML = `<div class="kz-final"><span class="kz-trophy">🏆</span><div class="kz-final-stars">⭐⭐⭐</div>
      <button type="button" class="kz-again" aria-label="Jugar otra vez">🔄</button></div>`;
    confetti(); setTimeout(confetti, 700); setTimeout(confetti, 1400);
    stage.querySelector('.kz-again').onclick = again;
  };
  // Barra de progreso común a todos los juegos: se llena hasta el trofeo
  const bar = (frac) => `<div class="kz-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></i><span>🏆</span></div>`;
  const setBar = (stage, frac) => { const i = stage.querySelector('.kz-bar i'); if (i) i.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; };
  const games = {
    // Globos por etapas: en cada etapa hay que reventar algunos globos más; suben un poco más rápido
    // y el fondo cambia. La barra se llena con cada globo. Al terminar la última etapa, el trofeo.
    globos(stage) {
      const STAGES = [{ goal: 12, rise: 11, every: 1400 }, { goal: 16, rise: 9.5, every: 1200 }, { goal: 20, rise: 8, every: 1050 }, { goal: 24, rise: 7, every: 950 }];
      let st = 0;
      let popped = 0;
      let timer = null;
      const start = () => {
        clearInterval(timer);
        document.body.dataset.kzLevel = String(st + 1);
        stage.innerHTML = `${bar(st / STAGES.length)}<div class="kz-sky"></div>`;
        const sky = stage.querySelector('.kz-sky');
        const conf = STAGES.at(st);
        const launch = () => {
          if (!sky.isConnected) return;
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'kz-balloon kz-rise';
          b.setAttribute('aria-label', 'Globo');
          b.style.setProperty('--c', pick(COLORS));
          b.style.left = `${5 + Math.random() * 70}%`;
          b.style.animationDuration = `${conf.rise + Math.random() * 3}s`;
          b.onpointerdown = () => {
            if (b.classList.contains('kz-pop')) return;
            b.classList.add('kz-pop');
            setTimeout(() => b.remove(), 400);
            popped++;
            setBar(stage, (st + popped / conf.goal) / STAGES.length);
            if (popped >= conf.goal) {
              clearInterval(timer);
              confetti();
              st++;
              popped = 0;
              setTimeout(() => { if (!stage.isConnected) return; if (st >= STAGES.length) finale(stage, () => { st = 0; start(); }); else start(); }, 1600);
            }
          };
          b.onanimationend = (e) => { if (e.animationName === 'kz-rise') b.remove(); };
          sky.appendChild(b);
        };
        for (let i = 0; i < 3; i++) setTimeout(launch, i * 500);
        timer = setInterval(launch, conf.every);
      };
      start();
      return () => clearInterval(timer);
    },
    // Memoria: 4 cartas; después 6
    // Memoria por niveles: 4 → 6 → 8 → 12 → 16 → 16 cartas. Cada nivel cambia el color del fondo y suma una
    // estrella arriba; al terminar el último, pantalla de triunfo con trofeo y un botón para jugar de nuevo.
    memoria(stage, round = 0) {
      const MEMO = ['🍎', '🚗', '⭐', '🐻', '🌈', '⚽', '🐶', '🦋', '🍓', '🚀', '🐸', '🎈'];
      const LEVELS = [2, 3, 4, 6, 8, 8]; // parejas por nivel
      const COLS = { 2: 2, 3: 3, 4: 4, 6: 4, 8: 4 };
      document.body.dataset.kzLevel = String(Math.min(round, LEVELS.length));
      if (round >= LEVELS.length) { finale(stage, () => games.memoria(stage, 0)); return null; }
      const pairs = LEVELS.at(round);
      const cards = shuffle(shuffle(MEMO).slice(0, pairs).flatMap((e) => [e, e]));
      let open = [];
      let done = 0;
      let lock = false;
      stage.innerHTML = `${bar(round / LEVELS.length)}<div class="kz-memo" style="--cols:${COLS[pairs]}">${cards.map((e, i) => `<button type="button" class="kz-mcard" data-i="${i}"><span>${e}</span></button>`).join('')}</div>`;
      stage.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => {
        if (lock || b.classList.contains('up')) return;
        b.classList.add('up');
        open.push(b);
        if (open.length < 2) return;
        const [x, y] = open;
        open = [];
        if (cards[x.dataset.i] === cards[y.dataset.i]) {
          x.classList.add('kz-yes'); y.classList.add('kz-yes'); done++;
          if (done === pairs) { confetti(); setTimeout(() => { if (stage.isConnected) games.memoria(stage, round + 1); }, 1800); }
        } else {
          lock = true;
          setTimeout(() => { x.classList.remove('up'); y.classList.remove('up'); lock = false; }, 900);
        }
      }; });
      return null;
    },
    // Puzzle por niveles: 6 puzzles de 4 piezas y después 6, 8, 10, 12, 14 y 16 piezas.
    // Se tocan dos piezas para cambiarlas de lugar. El fondo del dibujo cambia de color de una esquina a otra,
    // así cada pieza se ve distinta. Al terminar el último, pantalla de triunfo.
    puzzle(stage, round = 0) {
      const LEVELS = [4, 4, 4, 4, 4, 4, 6, 8, 10, 12, 14, 16];
      const GRID = { 4: [2, 2], 6: [2, 3], 8: [2, 4], 10: [2, 5], 12: [3, 4], 14: [2, 7], 16: [4, 4] }; // [columnas, filas] de un tablero 4:5 que no cambia de forma
      document.body.dataset.kzLevel = String(Math.min(6, Math.floor(round / 2) + 1));
      if (round >= LEVELS.length) { finale(stage, () => games.puzzle(stage, 0)); return null; }
      const n = LEVELS.at(round);
      const [cols, rows] = GRID[n];
      const pics = ['🦁', '🐸', '🚀', '🦄', '🐙', '🌻', '🐢', '🚒', '🐳', '🦒', '🍉', '🐝'];
      // El tablero tiene siempre la misma forma (4 de ancho por 5 de alto) y se divide en más piezas por nivel
      const c = document.createElement('canvas');
      c.width = 480; c.height = 600;
      const g = c.getContext('2d');
      const h0 = Math.floor(Math.random() * 360);
      const grad = g.createLinearGradient(0, 0, c.width, c.height);
      grad.addColorStop(0, `hsl(${h0} 85% 60%)`); grad.addColorStop(0.5, `hsl(${(h0 + 90) % 360} 85% 58%)`); grad.addColorStop(1, `hsl(${(h0 + 180) % 360} 85% 55%)`);
      g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
      // Lunares de colores repartidos, para que ninguna pieza se vea igual a otra
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `hsl(${Math.floor(Math.random() * 360)} 90% 75% / .55)`;
        g.beginPath(); g.arc(Math.random() * c.width, Math.random() * c.height, 10 + Math.random() * 18, 0, Math.PI * 2); g.fill();
      }
      // Un dibujo grande al centro y uno chico en cada esquina
      const chosen = shuffle(pics).slice(0, 5);
      g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '330px serif'; g.fillText(chosen[0], c.width / 2, c.height / 2 + 20);
      g.font = '110px serif';
      g.fillText(chosen[1], 75, 80); g.fillText(chosen[2], c.width - 75, 80); g.fillText(chosen[3], 75, c.height - 70); g.fillText(chosen[4], c.width - 75, c.height - 70);
      const img = c.toDataURL();
      let order = [...Array(n).keys()];
      while (order.every((v, i) => v === i)) order = shuffle(order);
      let sel = null;
      // Tamaño del tablero: lo que quepa en la pantalla del celular, siempre con la forma 4:5
      const boardW = Math.floor(Math.min(Math.min(innerWidth, 640) - 40, (innerHeight - 260) * 0.8));
      const pw = Math.floor(boardW / cols);
      const ph = Math.floor(boardW * 1.25 / rows);
      const pos = (p) => `${cols > 1 ? (p % cols) / (cols - 1) * 100 : 0}% ${rows > 1 ? Math.floor(p / cols) / (rows - 1) * 100 : 0}%`;
      const draw = () => {
        stage.innerHTML = `${bar(round / LEVELS.length)}<div class="kz-peek" style="background-image:url(${img});width:72px;height:90px"></div>
          <div class="kz-puzzle" style="grid-template-columns:repeat(${cols}, ${pw}px);width:auto">${order.map((p, i) => `<button type="button" class="kz-piece ${sel === i ? 'sel' : ''}" data-i="${i}" style="width:${pw}px;height:${ph}px;aspect-ratio:auto;background-image:url(${img});background-size:${cols * 100}% ${rows * 100}%;background-position:${pos(p)}"></button>`).join('')}</div>`;
        stage.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => {
          const i = Number(b.dataset.i);
          if (sel === null) { sel = i; draw(); return; }
          [order[sel], order[i]] = [order[i], order[sel]];
          sel = null;
          draw();
          if (order.every((v, k) => v === k)) {
            stage.querySelector('.kz-puzzle').classList.add('kz-yes');
            confetti();
            setTimeout(() => { if (stage.isConnected) games.puzzle(stage, round + 1); }, 2000);
          }
        }; });
      };
      draw();
      return null;
    },
    // Bloques por etapas: parten con cubos grandes (pocas columnas) y lentos; cada etapa dura unos 2 minutos
    // (la barra se llena con el tiempo y más rápido al borrar cubos). Luego el tablero crece y baja un poco más rápido.
    // 4 del mismo color seguidos (en columna o en fila) desaparecen, y una fila completa también. Nunca se pierde.
    bloques(stage) {
      const STAGES = [{ W: 4, H: 6, ms: 1300 }, { W: 5, H: 7, ms: 1150 }, { W: 6, H: 8, ms: 1050 }, { W: 6, H: 9, ms: 950 }];
      const STAGE_MS = 120000; // unos 2 minutos por etapa
      const BLOCK_COLORS = ['#e63946', '#1d6fe0', '#ffc400', '#2bb24c']; // 4 colores: así se juntan seguido
      let st = 0;
      let timer = null;
      const start = () => {
        clearInterval(timer);
        const { W, H, ms } = STAGES.at(st);
        document.body.dataset.kzLevel = String(st + 1);
        let grid = Array.from({ length: H }, () => Array(W).fill(null));
        let cur = null;
        let bonus = 0;
        const t0 = Date.now();
        stage.innerHTML = `${bar(st / STAGES.length)}<div class="kz-well" style="--w:${W};--h:${H}"></div>
          <div class="kz-pad"><button type="button" data-m="-1" aria-label="Izquierda">◀</button><button type="button" data-m="0" aria-label="Bajar">▼</button><button type="button" data-m="1" aria-label="Derecha">▶</button></div>`;
        const well = stage.querySelector('.kz-well');
        const spawn = () => { cur = { x: Math.floor(Math.random() * W), y: 0, c: pick(BLOCK_COLORS) }; if (grid[0][cur.x]) { grid = grid.map((r) => r.map(() => null)); } };
        const paint = () => {
          well.innerHTML = grid.map((r, y) => r.map((v, x) => {
            const c = cur && cur.x === x && cur.y === y ? cur.c : v;
            return `<i ${c ? `style="background:${c}"` : ''}></i>`;
          }).join('')).join('');
        };
        const gravity = () => {
          for (let x = 0; x < W; x++) {
            const left = grid.map((r) => r[x]).filter(Boolean);
            for (let k = 0; k < H; k++) grid[k][x] = k < H - left.length ? null : left[k - (H - left.length)];
          }
        };
        const flash = () => { well.classList.remove('kz-flash'); void well.offsetWidth; well.classList.add('kz-flash'); confetti(); bonus += 0.12; };
        // 4 o más del mismo color seguidos, en columna o en fila: desaparecen y lo de arriba cae
        const matches = () => {
          const kill = new Set();
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const c = grid[y][x];
            if (!c) continue;
            let e = x; while (e + 1 < W && grid[y][e + 1] === c) e++;
            if (e - x + 1 >= 4) for (let k = x; k <= e; k++) kill.add(`${y},${k}`);
            let f = y; while (f + 1 < H && grid[f + 1][x] === c) f++;
            if (f - y + 1 >= 4) for (let k = y; k <= f; k++) kill.add(`${k},${x}`);
          }
          if (!kill.size) return false;
          kill.forEach((key) => { const [y, x] = key.split(',').map(Number); grid[y][x] = null; });
          gravity();
          return true;
        };
        const land = () => {
          grid[cur.y][cur.x] = cur.c;
          let changed = true;
          while (changed) {
            changed = false;
            const full = grid.findIndex((r) => r.every(Boolean));
            if (full >= 0) { grid.splice(full, 1); grid.unshift(Array(W).fill(null)); changed = true; flash(); continue; }
            if (matches()) { changed = true; flash(); }
          }
          spawn();
        };
        const progress = () => Math.min(1, (Date.now() - t0) / STAGE_MS + bonus);
        const step = () => {
          if (cur.y + 1 < H && !grid[cur.y + 1][cur.x]) cur.y++; else land();
          paint();
          setBar(stage, (st + progress()) / STAGES.length);
          if (progress() >= 1) {
            clearInterval(timer);
            confetti();
            st++;
            setTimeout(() => { if (!stage.isConnected) return; if (st >= STAGES.length) finale(stage, () => { st = 0; start(); }); else start(); }, 1600);
          }
        };
        stage.querySelectorAll('[data-m]').forEach((b) => { b.onpointerdown = (e) => {
          e.preventDefault();
          const m = Number(b.dataset.m);
          if (!m) { while (cur.y + 1 < H && !grid[cur.y + 1][cur.x]) cur.y++; land(); paint(); return; }
          const nx = cur.x + m;
          if (nx >= 0 && nx < W && !grid[cur.y][nx]) { cur.x = nx; paint(); }
        }; });
        spawn();
        paint();
        timer = setInterval(step, ms);
      };
      start();
      return () => clearInterval(timer);
    },
  };
  // Fondo del inicio: animales estampados como con timbre, repartidos por toda la pantalla
  const ANIMALS = ['🐶', '🐱', '🦊', '🐰', '🐨', '🐼', '🐻', '🦁', '🐯', '🐮', '🐷', '🐸', '🐵', '🐭', '🐹', '🐔', '🐣', '🐧', '🦄', '🐺', '🐴', '🐲', '🐻‍❄️', '🐙', '🐳', '🐬', '🦉', '🐝', '🐞', '🦋', '🐢', '🦒', '🦓', '🐘', '🦔', '🦦', '🦥', '🦩', '🦜', '🐤'];
  const stamps = () => {
    const step = 64;
    const cols = Math.ceil(Math.min(innerWidth, 900) / step) + 1;
    const rows = Math.ceil(Math.max(innerHeight, 700) / step) + 1;
    const order = shuffle(ANIMALS);
    let k = 0;
    let html = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * step + (r % 2 ? step / 2 : 0) - 20 + Math.random() * 12;
      const y = r * step - 10 + Math.random() * 12;
      const rot = Math.round(Math.random() * 50 - 25);
      html += `<i style="left:${x}px;top:${y}px;transform:rotate(${rot}deg);font-size:${34 + Math.round(Math.random() * 14)}px">${order.at(k++ % order.length)}</i>`;
    }
    return `<div class="kz-stamps" aria-hidden="true">${html}</div>`;
  };
  // Íconos ilustrados de cada juego
  const shine = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".55"/>`;
  const balloon = (cx, cy, c, d) => `<path d="M${cx} ${cy + 24} q-4 14 3 26" stroke="#8a7a9a" stroke-width="1.6" fill="none"/><ellipse cx="${cx}" cy="${cy}" rx="17" ry="21" fill="${c}"/><ellipse cx="${cx + 5}" cy="${cy + 4}" rx="12" ry="16" fill="${d}" opacity=".35"/>${shine(cx - 6, cy - 8, 4.5, 7)}<path d="M${cx - 3} ${cy + 24} h6 l-3 -4z" fill="${c}"/>`;
  const cube = (x, y, s, c, light, dark) => `<path d="M${x} ${y} l${s / 2} ${-s / 4} l${s / 2} ${s / 4} l${-s / 2} ${s / 4}z" fill="${light}"/><path d="M${x} ${y} v${s * 0.6} l${s / 2} ${s / 4} v${-s * 0.6}z" fill="${c}"/><path d="M${x + s} ${y} v${s * 0.6} l${-s / 2} ${s / 4} v${-s * 0.6}z" fill="${dark}"/>`;
  const ICONS = {
    globos: `<svg viewBox="0 0 100 100" aria-hidden="true">${balloon(32, 40, '#ff4d6d', '#b5172f')}${balloon(68, 36, '#3a86ff', '#1747a6')}${balloon(50, 52, '#ffbe0b', '#c27c00')}</svg>`,
    memoria: `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-14 40 52)"><rect x="18" y="22" width="44" height="60" rx="8" fill="#ff8fab"/><rect x="23" y="27" width="34" height="50" rx="5" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="4 4"/></g><g transform="rotate(10 62 50)"><rect x="40" y="18" width="44" height="60" rx="8" fill="#fff" stroke="#e7d3ff" stroke-width="2"/><path d="M62 62 C44 50 48 36 56 36 c4 0 6 3 6 5 c0 -2 2 -5 6 -5 c8 0 12 14 -6 26z" fill="#ff3d6e"/>${shine(55, 42, 3, 2)}<path d="M48 26 l2 4 4 .6 -3 2.8 .8 4 -3.8 -2 -3.6 2 .7 -4 -3 -2.8 4 -.6z" fill="#ffbe0b"/></g></svg>`,
    puzzle: `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="kz-pz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ae582"/><stop offset="1" stop-color="#25a244"/></linearGradient><linearGradient id="kz-pz2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#f77f00"/></linearGradient></defs><path d="M14 30 H32 a8 8 0 1 1 16 0 H62 V46 a8 8 0 1 1 0 16 V80 H46 a8 8 0 1 0 -16 0 H14 V62 a8 8 0 1 0 0 -16 Z" fill="url(#kz-pz)" stroke="#1b7a35" stroke-width="2"/>${shine(26, 40, 6, 4)}<g transform="rotate(14 74 30)"><path d="M62 16 H86 V40 H62 Z" fill="url(#kz-pz2)" stroke="#b35900" stroke-width="2"/>${shine(70, 22, 4, 2.5)}</g></svg>`,
    bloques: `<svg viewBox="0 0 100 100" aria-hidden="true">${cube(14, 62, 24, '#e63946', '#ff8a94', '#a4161a')}${cube(38, 62, 24, '#1d6fe0', '#7fb3ff', '#0b3d91')}${cube(62, 62, 24, '#2bb24c', '#8ef0a7', '#147a2e')}${cube(26, 44, 24, '#ffc400', '#ffe38a', '#b58900')}${cube(50, 44, 24, '#e63946', '#ff8a94', '#a4161a')}${cube(38, 26, 24, '#1d6fe0', '#7fb3ff', '#0b3d91')}</svg>`,
  };
  const MENU = [['globos'], ['memoria'], ['puzzle'], ['bloques']];

  // Se recuerda desde qué pantalla se entró, para volver ahí con «Volver a la sala»
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.kids-entry')) { try { sessionStorage.setItem('kidsBack', location.hash); } catch { /* sin almacenamiento */ } }
  }, true);
  const backTo = () => { let h = ''; try { h = sessionStorage.getItem('kidsBack') || ''; } catch { /* nada */ } return h && !h.startsWith('#/kids') ? h : '#/'; };

  views.kids = async (which) => {
    document.body.classList.add('kids');
    let stop = null;
    if (!games[which]) {
      app.innerHTML = `${stamps()}<div class="kz"><div class="kz-top"><button type="button" class="kz-back" data-exit>← Volver a la sala</button></div>
        <h1 class="kz-title">🧸 KRB Kids</h1>
        <div class="kz-menu">${MENU.map(([k]) => `<a class="kz-game" href="#/kids/${k}" aria-label="${k}">${ICONS[k]}</a>`).join('')}</div></div>`;
      $('[data-exit]').onclick = () => { location.hash = backTo(); };
    } else {
      app.innerHTML = `<div class="kz"><div class="kz-top"><button type="button" class="kz-back" data-back>←</button><span class="kz-icon">${ICONS[which]}</span></div><div id="kz-stage" class="kz-stage"></div></div>`;
      $('[data-back]').onclick = () => { location.hash = '#/kids'; };
      stop = games[which]($('#kz-stage'));
    }
    return () => { document.body.classList.remove('kids'); delete document.body.dataset.kzLevel; if (typeof stop === 'function') stop(); };
  };
})();
