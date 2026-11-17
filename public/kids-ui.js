/* global views, app, $ */
// KRB Kids: juegos para niños de 3 a 5 años en el celular de los papás, mientras los adultos juegan.
// Sin sonido, sin preguntas y sin texto: solo tocar y jugar. Nadie pierde.
(() => {
  // Logo de KRB Kids: un racimo de globos, y el nombre con cada letra de un color
  const kidsBalloons = () => {
    const b = (cx, cy, c, d) => `<path d="M${cx} ${cy + 22} q-4 14 3 26" stroke="#fff" stroke-width="2" fill="none" opacity=".9"/><ellipse cx="${cx}" cy="${cy}" rx="16" ry="20" fill="${c}"/><ellipse cx="${cx + 5}" cy="${cy + 4}" rx="11" ry="15" fill="${d}" opacity=".35"/><ellipse cx="${cx - 6}" cy="${cy - 8}" rx="4" ry="6.5" fill="#fff" opacity=".6"/><path d="M${cx - 3} ${cy + 22} h6 l-3 -4z" fill="${c}"/>`;
    return `<svg class="kz-logo" viewBox="0 0 100 100" aria-hidden="true">${b(30, 34, '#ff4d6d', '#b5172f')}${b(70, 30, '#3a86ff', '#1747a6')}${b(50, 46, '#ffbe0b', '#c27c00')}${b(18, 58, '#2bb24c', '#147a2e')}${b(82, 56, '#b56cff', '#6a1fb5')}</svg>`;
  };
  const LETTER_COLORS = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#2bb24c', '#3a86ff', '#b56cff', '#ff5fa2'];
  const kidsName = () => `<span class="kz-name-word">${[...'KRB'].map((ch, i) => `<i style="color:${LETTER_COLORS.at(i)}">${ch}</i>`).join('')}</span> <span class="kz-name-word">${[...'Kids'].map((ch, i) => `<i style="color:${LETTER_COLORS.at(i + 3)}">${ch}</i>`).join('')}</span>`;
  window.krbKidsButton = () => `<a class="btn kids-entry kids-entry2" href="#/kids">${kidsBalloons()}<span class="kz-entry-text"><b class="kz-name">${kidsName()}</b><span class="kz-tag">Zona de niños</span></span></a>`;
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
    // El siguiente juego del menú (después del último, vuelve al primero)
    const here = (location.hash.split('/')[2] || '');
    const i = MENU.findIndex((m) => m[0] === here);
    const next = MENU.at((i + 1) % MENU.length)[0];
    stage.innerHTML = `<div class="kz-final"><span class="kz-trophy">🏆</span><div class="kz-final-stars">⭐⭐⭐</div>
      <div class="kz-final-row"><button type="button" class="kz-again" aria-label="Jugar otra vez">🔄</button>
      <a class="kz-next" href="#/kids/${next}" aria-label="Siguiente juego">${ICONS[next]}<span class="kz-next-arrow">➜</span></a></div></div>`;
    confetti(); setTimeout(confetti, 700); setTimeout(confetti, 1400);
    stage.querySelector('.kz-again').onclick = again;
  };
  // Barra de progreso común a todos los juegos: se llena hasta el trofeo
  const bar = (frac) => `<div class="kz-bar"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%"></i><span>🏆</span></div>`;
  const setBar = (stage, frac) => { const i = stage.querySelector('.kz-bar i'); if (i) i.style.width = `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`; };
  const games = {
    // Pintar: se toca un color y después una parte del dibujo (también el fondo). 8 dibujos que van teniendo
    // más partes, siempre con el modelo arriba. La barra se llena con cada dibujo terminado; al final, el trofeo.
    pintar(stage, round = 0, total = 0) {
      const INK = '#3b2a4d';
      const P = ['#e63946', '#ff8c1a', '#ffc400', '#2bb24c', '#3a86ff', '#8e44ad', '#ff5fa2', '#8d5524', '#c9f2ff', '#ffe8a3'];
      const BG = ['#c9f2ff', '#ffe8a3']; // colores claros de la paleta, para el fondo
      // Cada dibujo: partes que se pintan [etiqueta SVG, atributos] y detalles fijos (ojos, líneas)
      const D = [
        { parts: [['ellipse', 'cx="95" cy="100" rx="58" ry="40"'], ['polygon', 'points="150,100 185,70 185,130"'], ['polygon', 'points="85,62 110,35 120,64"'], ['circle', 'cx="40" cy="45" r="12"']],
          deco: '<circle cx="65" cy="92" r="6" fill="#3b2a4d"/><path d="M48 112 q10 8 20 0" stroke="#3b2a4d" stroke-width="3" fill="none"/>' },
        { parts: [['rect', 'x="45" y="95" width="110" height="80"'], ['polygon', 'points="35,98 100,40 165,98"'], ['rect', 'x="88" y="125" width="28" height="50"'], ['rect', 'x="55" y="110" width="24" height="24"'], ['circle', 'cx="165" cy="35" r="18"']],
          deco: '<circle cx="110" cy="152" r="3" fill="#3b2a4d"/>' },
        { parts: [['ellipse', 'cx="100" cy="150" rx="45" ry="35"'], ['circle', 'cx="100" cy="85" r="42"'], ['polygon', 'points="64,62 70,20 95,46"'], ['polygon', 'points="136,62 130,20 105,46"'], ['polygon', 'points="92,92 108,92 100,102"'], ['path', 'd="M142 160 q40 -10 30 -50 q-4 -8 -10 0 q6 30 -22 38z"']],
          deco: '<circle cx="84" cy="78" r="6" fill="#3b2a4d"/><circle cx="116" cy="78" r="6" fill="#3b2a4d"/><path d="M100 102 q-8 10 -16 4 M100 102 q8 10 16 4 M60 92 h-26 M60 98 h-24 M140 92 h26 M140 98 h24" stroke="#3b2a4d" stroke-width="2.5" fill="none"/>' },
        { parts: [['path', 'd="M40 120 a60 55 0 0 1 120 0 z"'], ['circle', 'cx="172" cy="108" r="18"'], ['ellipse', 'cx="58" cy="132" rx="14" ry="10"'], ['ellipse', 'cx="142" cy="132" rx="14" ry="10"'], ['ellipse', 'cx="80" cy="134" rx="12" ry="9"'], ['ellipse', 'cx="120" cy="134" rx="12" ry="9"'], ['polygon', 'points="40,118 22,126 40,128"']],
          deco: '<circle cx="177" cy="103" r="4" fill="#3b2a4d"/><path d="M70 92 l15 -18 l15 18 l15 -18 l15 18" stroke="#3b2a4d" stroke-width="3" fill="none"/>' },
        { parts: [['ellipse', 'cx="100" cy="160" rx="50" ry="34"'], ['circle', 'cx="100" cy="90" r="50"'], ['circle', 'cx="58" cy="48" r="18"'], ['circle', 'cx="142" cy="48" r="18"'], ['circle', 'cx="58" cy="48" r="8"'], ['circle', 'cx="142" cy="48" r="8"'], ['ellipse', 'cx="100" cy="108" rx="24" ry="18"'], ['ellipse', 'cx="100" cy="100" rx="9" ry="6"']],
          deco: '<circle cx="80" cy="80" r="6" fill="#3b2a4d"/><circle cx="120" cy="80" r="6" fill="#3b2a4d"/><path d="M100 106 v8 q-6 6 -12 2 M100 114 q6 6 12 2" stroke="#3b2a4d" stroke-width="2.5" fill="none"/>' },
        { parts: [['rect', 'x="20" y="100" width="160" height="45" rx="14"'], ['path', 'd="M55 100 l20 -38 h55 l22 38 z"'], ['path', 'd="M72 98 l12 -26 h18 v26 z"'], ['path', 'd="M110 98 v-26 h16 l13 26 z"'], ['circle', 'cx="60" cy="148" r="20"'], ['circle', 'cx="142" cy="148" r="20"'], ['circle', 'cx="60" cy="148" r="8"'], ['circle', 'cx="142" cy="148" r="8"']],
          deco: '<rect x="166" y="112" width="12" height="8" rx="2" fill="#ffe066" stroke="#3b2a4d" stroke-width="2"/>' },
        { parts: [['ellipse', 'cx="62" cy="70" rx="40" ry="34"'], ['ellipse', 'cx="138" cy="70" rx="40" ry="34"'], ['ellipse', 'cx="68" cy="135" rx="30" ry="26"'], ['ellipse', 'cx="132" cy="135" rx="30" ry="26"'], ['ellipse', 'cx="100" cy="110" rx="12" ry="55"'], ['circle', 'cx="100" cy="50" r="14"'], ['circle', 'cx="62" cy="68" r="12"'], ['circle', 'cx="138" cy="68" r="12"'], ['circle', 'cx="82" cy="18" r="7"'], ['circle', 'cx="118" cy="18" r="7"']],
          deco: '<path d="M94 40 q-6 -14 -10 -18 M106 40 q6 -14 10 -18" stroke="#3b2a4d" stroke-width="2.5" fill="none"/><circle cx="95" cy="48" r="2.5" fill="#3b2a4d"/><circle cx="105" cy="48" r="2.5" fill="#3b2a4d"/>' },
        { parts: [['path', 'd="M75 150 v-80 q25 -60 50 0 v80 z"'], ['path', 'd="M75 72 q25 -62 50 0 z"'], ['circle', 'cx="100" cy="100" r="17"'], ['circle', 'cx="100" cy="100" r="10"'], ['path', 'd="M75 120 l-25 35 h25 z"'], ['path', 'd="M125 120 l25 35 h-25 z"'], ['path', 'd="M80 150 q20 50 40 0 z"'], ['path', 'd="M90 150 q10 28 20 0 z"'], ['polygon', 'points="35,40 39,50 50,50 41,57 45,68 35,61 25,68 29,57 20,50 31,50"'], ['polygon', 'points="165,70 168,78 177,78 170,83 173,92 165,87 157,92 160,83 153,78 162,78"']],
          deco: '' },
      ];
      // Siempre hay un modelo grande arriba. Ningún color está mal: igual se pinta y se puede terminar.
      // Al terminar, de 1 a 5 estrellas según cuánto se parece al modelo; las estrellas se van sumando.
      document.body.dataset.kzLevel = String(Math.min(6, round + 1));
      if (round >= D.length) { finale(stage, () => games.pintar(stage, 0, 0)); return null; }
      const d = D.at(round);
      // El fondo es una parte más que se pinta (va primero, detrás del dibujo)
      const parts = [['rect', 'x="2" y="2" width="196" height="196" rx="18"'], ...d.parts];
      const target = parts.map((_, i) => (i === 0 ? BG.at(round % BG.length) : P.at((i * 3 + round) % 8)));
      const fills = parts.map(() => null);
      let done = false;
      let color = P.at(0);
      const svg = (paintWith, cls) => `<svg viewBox="0 0 200 200" class="${cls}">${parts.map(([tag, attrs], i) => `<${tag} ${attrs} data-r="${i}" fill="${paintWith(i) || '#fff'}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`).join('')}<g pointer-events="none">${d.deco}</g></svg>`;
      const draw = () => {
        stage.innerHTML = `<div class="kz-paint-top">${bar(round / D.length)}<span class="kz-total">⭐ ${total}</span></div><div class="kz-model">${svg((i) => target.at(i), '')}</div>
          <div class="kz-canvas">${svg((i) => fills.at(i), 'kz-paint')}</div>
          <div class="kz-palette">${P.map((c) => `<button type="button" class="${c === color ? 'on' : ''}" data-c="${c}" style="--c:${c}" aria-label="Color"></button>`).join('')}</div>`;
        stage.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { color = b.dataset.c; stage.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }; });
        stage.querySelectorAll('.kz-paint [data-r]').forEach((el) => { el.onclick = () => {
          if (done) return;
          const i = Number(el.dataset.r);
          fills[i] = color;
          el.setAttribute('fill', color);
          if (fills.every(Boolean)) {
            done = true;
            const same = fills.filter((c, k) => c === target.at(k)).length;
            const stars = Math.max(1, Math.round((same / fills.length) * 5));
            stage.querySelector('.kz-canvas').classList.add('kz-yes');
            setBar(stage, (round + 1) / D.length);
            confetti();
            const pop = document.createElement('div');
            pop.className = 'kz-stars-pop';
            pop.innerHTML = [1, 2, 3, 4, 5].map((k) => `<i class="${k <= stars ? 'on' : ''}" style="animation-delay:${k * 0.12}s">★</i>`).join('');
            stage.appendChild(pop);
            setTimeout(() => { if (stage.isConnected) games.pintar(stage, round + 1, total + stars); }, 2600);
          }
        }; });
      };
      draw();
      return null;
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
      // Cada vez más difícil: el pozo crece, los bloques caen más rápido y en las últimas etapas hay más colores.
      // Dentro de cada etapa la caída también se va acelerando de a poco (hasta un 25 % más rápido al final).
      const STAGES = [{ W: 4, H: 6, ms: 1300, n: 3 }, { W: 5, H: 7, ms: 1150, n: 4 }, { W: 6, H: 8, ms: 1000, n: 4 },
        { W: 6, H: 9, ms: 860, n: 5 }, { W: 7, H: 10, ms: 740, n: 5 }, { W: 7, H: 10, ms: 640, n: 6 }];
      const STAGE_MS = 120000; // unos 2 minutos por etapa
      const ALL_COLORS = ['#e63946', '#1d6fe0', '#ffc400', '#2bb24c', '#8e44ad', '#ff8c1a']; // pocos colores al inicio: se juntan seguido
      let st = 0;
      let timer = null;
      const start = () => {
        clearTimeout(timer);
        const { W, H, ms, n } = STAGES.at(st);
        const BLOCK_COLORS = ALL_COLORS.slice(0, n);
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
            clearTimeout(timer);
            confetti();
            st++;
            setTimeout(() => { if (!stage.isConnected) return; if (st >= STAGES.length) finale(stage, () => { st = 0; start(); }); else start(); }, 1600);
            return;
          }
          timer = setTimeout(step, ms * (1 - 0.25 * progress()));
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
        timer = setTimeout(step, ms);
      };
      start();
      return () => clearTimeout(timer);
    },
    // La Víbora: se mueve sola; con las flechas (o deslizando el dedo) se cambia de dirección. Cada fruta la hace
    // crecer. Por niveles: el tablero crece, la víbora va más rápido, se necesitan más frutas; desde el nivel 3 los
    // bordes son paredes y desde el 5 aparecen piedras. Si choca, el nivel parte de nuevo (nadie pierde).
    vibora(stage) {
      const LEVELS = [
        { N: 9, ms: 430, fruits: 5, walls: false, rocks: 0 }, { N: 10, ms: 380, fruits: 6, walls: false, rocks: 0 },
        { N: 11, ms: 340, fruits: 7, walls: true, rocks: 0 }, { N: 12, ms: 300, fruits: 8, walls: true, rocks: 0 },
        { N: 13, ms: 265, fruits: 9, walls: true, rocks: 4 }, { N: 14, ms: 235, fruits: 10, walls: true, rocks: 7 },
      ];
      const FRUITS = ['🍎', '🍓', '🍌', '🍇', '🍒', '🍊', '🍉', '🍐'];
      let lv = 0;
      let timer = null;
      let unbind = null;
      const start = () => {
        clearTimeout(timer);
        if (unbind) unbind();
        document.body.dataset.kzLevel = String(lv + 1);
        if (lv >= LEVELS.length) { finale(stage, () => { lv = 0; start(); }); return; }
        const { N, ms, fruits, walls, rocks } = LEVELS.at(lv);
        const mid = Math.floor(N / 2);
        let snake = [[mid, 2], [mid, 1], [mid, 0]].map(([y, x]) => ({ x, y }));
        let dir = { x: 1, y: 0 };
        let want = dir;
        let eaten = 0;
        let grow = 0;
        let waiting = true; // parte quieta hasta que el niño toca una flecha
        const busy = (x, y) => snake.some((s) => s.x === x && s.y === y) || stones.some((s) => s.x === x && s.y === y);
        const free = () => { for (;;) { const x = Math.floor(Math.random() * N); const y = Math.floor(Math.random() * N); if (!busy(x, y) && !(fruit && fruit.x === x && fruit.y === y) && !(y === mid && x < 6)) return { x, y }; } };
        let fruit = null;
        const stones = [];
        for (let k = 0; k < rocks; k++) stones.push(free());
        fruit = { ...free(), e: pick(FRUITS) };
        stage.innerHTML = `${bar(lv / LEVELS.length)}<div class="kz-snake${walls ? ' walls' : ''}" style="--n:${N}"></div>
          <div class="kz-pad kz-pad4"><span></span><button type="button" data-d="0,-1" aria-label="Arriba">▲</button><span></span>
          <button type="button" data-d="-1,0" aria-label="Izquierda">◀</button><button type="button" data-d="0,1" aria-label="Abajo">▼</button><button type="button" data-d="1,0" aria-label="Derecha">▶</button></div>`;
        const board = stage.querySelector('.kz-snake');
        const paint = () => {
          const cells = Array(N * N).fill('<i></i>');
          stones.forEach((s) => { cells[s.y * N + s.x] = '<i class="rock"></i>'; });
          cells[fruit.y * N + fruit.x] = `<i class="fruit">${fruit.e}</i>`;
          snake.forEach((s, k) => { cells[s.y * N + s.x] = k ? `<i class="body" style="--k:${k % 2}"></i>` : `<i class="head" style="--r:${Math.atan2(dir.y, dir.x)}rad"></i>`; });
          board.innerHTML = cells.join('');
        };
        const turn = (dx, dy) => { if (dx === -dir.x && dy === -dir.y) return; want = { x: dx, y: dy }; if (waiting) { waiting = false; timer = setTimeout(step, ms); } };
        const crash = () => {
          board.classList.remove('kz-shake'); void board.offsetWidth; board.classList.add('kz-shake');
          setTimeout(() => { if (stage.isConnected) start(); }, 900);
        };
        function step() {
          dir = want;
          let x = snake[0].x + dir.x;
          let y = snake[0].y + dir.y;
          if (!walls) { x = (x + N) % N; y = (y + N) % N; }
          const tail = snake.at(-1);
          const hitSelf = snake.some((s) => s.x === x && s.y === y && !(s === tail && !grow));
          if (x < 0 || y < 0 || x >= N || y >= N || hitSelf || stones.some((s) => s.x === x && s.y === y)) { crash(); return; }
          snake.unshift({ x, y });
          if (grow) grow--; else snake.pop();
          if (x === fruit.x && y === fruit.y) {
            eaten++; grow += 1;
            board.classList.remove('kz-flash'); void board.offsetWidth; board.classList.add('kz-flash');
            setBar(stage, (lv + eaten / fruits) / LEVELS.length);
            if (eaten >= fruits) { paint(); confetti(); lv++; setTimeout(() => { if (stage.isConnected) start(); }, 1600); return; }
            fruit = { ...free(), e: pick(FRUITS) };
          }
          paint();
          timer = setTimeout(step, ms);
        }
        stage.querySelectorAll('[data-d]').forEach((b) => { b.onpointerdown = (e) => { e.preventDefault(); const [dx, dy] = b.dataset.d.split(',').map(Number); turn(dx, dy); }; });
        // Deslizar el dedo sobre el tablero también cambia la dirección
        let t0 = null;
        board.addEventListener('touchstart', (e) => { t0 = e.touches[0]; }, { passive: true });
        board.addEventListener('touchmove', (e) => { e.preventDefault(); }, { passive: false });
        board.addEventListener('touchend', (e) => {
          if (!t0) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - t0.clientX;
          const dy = t.clientY - t0.clientY;
          t0 = null;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
          if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy));
        });
        const keys = (e) => { const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key]; if (m) { e.preventDefault(); turn(...m); } };
        document.addEventListener('keydown', keys);
        unbind = () => document.removeEventListener('keydown', keys);
        paint();
      };
      start();
      return () => { clearTimeout(timer); if (unbind) unbind(); };
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
  const cube = (x, y, s, c, light, dark) => `<path d="M${x} ${y} l${s / 2} ${-s / 4} l${s / 2} ${s / 4} l${-s / 2} ${s / 4}z" fill="${light}"/><path d="M${x} ${y} v${s * 0.6} l${s / 2} ${s / 4} v${-s * 0.6}z" fill="${c}"/><path d="M${x + s} ${y} v${s * 0.6} l${-s / 2} ${s / 4} v${-s * 0.6}z" fill="${dark}"/>`;
  const ICONS = {
    pintar: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 18 C24 18 10 36 12 54 c2 18 18 28 32 26 c8 -1 6 -10 12 -12 c8 -3 14 6 24 -2 c10 -8 10 -30 -6 -42 c-7 -5 -15 -6 -24 -6z" fill="#f4d7a1" stroke="#b58a4a" stroke-width="2"/><circle cx="32" cy="38" r="7" fill="#e63946"/><circle cx="52" cy="30" r="7" fill="#ffc400"/><circle cx="70" cy="40" r="7" fill="#2bb24c"/><circle cx="28" cy="58" r="7" fill="#3a86ff"/><ellipse cx="54" cy="56" rx="7" ry="6" fill="#fff" stroke="#b58a4a" stroke-width="1.5"/>${shine(30, 35, 2, 1.5)}${shine(50, 27, 2, 1.5)}<g transform="rotate(35 74 66)"><rect x="70" y="40" width="8" height="34" rx="3" fill="#8d5524"/><rect x="69" y="70" width="10" height="6" fill="#c0c0c0"/><path d="M69 76 h10 l-2 12 q-3 4 -6 0z" fill="#8e44ad"/></g></svg>`,
    memoria: `<svg viewBox="0 0 100 100" aria-hidden="true"><g transform="rotate(-14 40 52)"><rect x="18" y="22" width="44" height="60" rx="8" fill="#ff8fab"/><rect x="23" y="27" width="34" height="50" rx="5" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="4 4"/></g><g transform="rotate(10 62 50)"><rect x="40" y="18" width="44" height="60" rx="8" fill="#fff" stroke="#e7d3ff" stroke-width="2"/><path d="M62 62 C44 50 48 36 56 36 c4 0 6 3 6 5 c0 -2 2 -5 6 -5 c8 0 12 14 -6 26z" fill="#ff3d6e"/>${shine(55, 42, 3, 2)}<path d="M48 26 l2 4 4 .6 -3 2.8 .8 4 -3.8 -2 -3.6 2 .7 -4 -3 -2.8 4 -.6z" fill="#ffbe0b"/></g></svg>`,
    puzzle: `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="kz-pz" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ae582"/><stop offset="1" stop-color="#25a244"/></linearGradient><linearGradient id="kz-pz2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#f77f00"/></linearGradient></defs><path d="M14 30 H32 a8 8 0 1 1 16 0 H62 V46 a8 8 0 1 1 0 16 V80 H46 a8 8 0 1 0 -16 0 H14 V62 a8 8 0 1 0 0 -16 Z" fill="url(#kz-pz)" stroke="#1b7a35" stroke-width="2"/>${shine(26, 40, 6, 4)}<g transform="rotate(14 74 30)"><path d="M62 16 H86 V40 H62 Z" fill="url(#kz-pz2)" stroke="#b35900" stroke-width="2"/>${shine(70, 22, 4, 2.5)}</g></svg>`,
    bloques: `<svg viewBox="0 0 100 100" aria-hidden="true">${cube(14, 62, 24, '#e63946', '#ff8a94', '#a4161a')}${cube(38, 62, 24, '#1d6fe0', '#7fb3ff', '#0b3d91')}${cube(62, 62, 24, '#2bb24c', '#8ef0a7', '#147a2e')}${cube(26, 44, 24, '#ffc400', '#ffe38a', '#b58900')}${cube(50, 44, 24, '#e63946', '#ff8a94', '#a4161a')}${cube(38, 26, 24, '#1d6fe0', '#7fb3ff', '#0b3d91')}</svg>`,
    vibora: `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M18 78 C18 62 40 62 46 70 S70 84 74 66 S60 44 44 46 S26 34 36 24 S60 16 66 26" fill="none" stroke="#1f8a3a" stroke-width="15" stroke-linecap="round"/><path d="M18 78 C18 62 40 62 46 70 S70 84 74 66 S60 44 44 46 S26 34 36 24 S60 16 66 26" fill="none" stroke="#4cd964" stroke-width="10" stroke-linecap="round" stroke-dasharray="1 9"/><circle cx="68" cy="27" r="11" fill="#2bb24c"/><circle cx="71" cy="23" r="3.2" fill="#fff"/><circle cx="72" cy="23" r="1.6" fill="#3b2a4d"/><path d="M79 30 l7 2 m-7 -2 l6 5" stroke="#e63946" stroke-width="2" stroke-linecap="round"/><circle cx="84" cy="78" r="9" fill="#e63946"/><path d="M84 69 q2 -6 7 -7" stroke="#2bb24c" stroke-width="3" fill="none"/>${shine(81, 75, 2.5, 2)}</svg>`,
  };
  const MENU = [['pintar'], ['memoria'], ['puzzle'], ['bloques'], ['vibora']];

  // Se recuerda desde qué pantalla se entró, para volver ahí con «Volver a la sala»
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.kids-entry')) { try { sessionStorage.setItem('kidsBack', location.hash); } catch { /* sin almacenamiento */ } }
  }, true);
  const backTo = () => { let h = ''; try { h = sessionStorage.getItem('kidsBack') || ''; } catch { /* nada */ } return h && !h.startsWith('#/kids') ? h : '#/jugar'; }; // sin sala de origen: al ingreso de clientes

  views.kids = async (which) => {
    document.body.classList.add('kids');
    let stop = null;
    if (!games[which]) {
      app.innerHTML = `${stamps()}<div class="kz"><div class="kz-top"><button type="button" class="kz-back" data-exit>← Volver a la sala</button></div>
        <h1 class="kz-title">${kidsBalloons()}<span class="kz-name">${kidsName()}</span></h1>
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
