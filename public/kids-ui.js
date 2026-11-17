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
  const games = {
    // Globos: suben sin parar; se revientan tocándolos
    globos(stage) {
      stage.innerHTML = '<div class="kz-sky"></div>';
      const sky = stage.querySelector('.kz-sky');
      const launch = () => {
        if (!sky.isConnected) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'kz-balloon kz-rise';
        b.setAttribute('aria-label', 'Globo');
        b.style.setProperty('--c', pick(COLORS));
        b.style.left = `${5 + Math.random() * 70}%`;
        b.style.animationDuration = `${6 + Math.random() * 4}s`;
        b.onpointerdown = () => { b.classList.add('kz-pop'); setTimeout(() => b.remove(), 400); };
        b.onanimationend = (e) => { if (e.animationName === 'kz-rise') b.remove(); };
        sky.appendChild(b);
      };
      for (let i = 0; i < 3; i++) setTimeout(launch, i * 500);
      const t = setInterval(launch, 1100);
      return () => clearInterval(t);
    },
    // Memoria: 4 cartas; después 6
    // Memoria por niveles: 4 → 6 → 8 → 12 → 16 → 16 cartas. Cada nivel cambia el color del fondo y suma una
    // estrella arriba; al terminar el último, pantalla de triunfo con trofeo y un botón para jugar de nuevo.
    memoria(stage, round = 0) {
      const MEMO = ['🍎', '🚗', '⭐', '🐻', '🌈', '⚽', '🐶', '🦋', '🍓', '🚀', '🐸', '🎈'];
      const LEVELS = [2, 3, 4, 6, 8, 8]; // parejas por nivel
      const COLS = { 2: 2, 3: 3, 4: 4, 6: 4, 8: 4 };
      document.body.dataset.kzLevel = String(Math.min(round, LEVELS.length));
      const stars = (n) => `<div class="kz-stars">${LEVELS.map((_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('')}</div>`;
      if (round >= LEVELS.length) { finale(stage, () => games.memoria(stage, 0)); return null; }
      const pairs = LEVELS.at(round);
      const cards = shuffle(shuffle(MEMO).slice(0, pairs).flatMap((e) => [e, e]));
      let open = [];
      let done = 0;
      let lock = false;
      stage.innerHTML = `${stars(round)}<div class="kz-memo" style="--cols:${COLS[pairs]}">${cards.map((e, i) => `<button type="button" class="kz-mcard" data-i="${i}"><span>${e}</span></button>`).join('')}</div>`;
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
      const GRID = { 4: [2, 2], 6: [2, 3], 8: [2, 4], 10: [2, 5], 12: [3, 4], 14: [2, 7], 16: [4, 4] }; // [columnas, filas]
      document.body.dataset.kzLevel = String(Math.min(6, Math.floor(round / 2) + 1));
      const dots = `<div class="kz-dots">${LEVELS.map((_, i) => `<i class="${i < round ? 'on' : ''}"></i>`).join('')}</div>`;
      if (round >= LEVELS.length) { finale(stage, () => games.puzzle(stage, 0)); return null; }
      const n = LEVELS.at(round);
      const [cols, rows] = GRID[n];
      const pics = ['🦁', '🐸', '🚀', '🦄', '🐙', '🌻', '🐢', '🚒', '🐳', '🦒', '🍉', '🐝'];
      const S = 120;
      const c = document.createElement('canvas');
      c.width = cols * S; c.height = rows * S;
      const g = c.getContext('2d');
      const h0 = Math.floor(Math.random() * 360);
      const grad = g.createLinearGradient(0, 0, c.width, c.height);
      grad.addColorStop(0, `hsl(${h0} 85% 60%)`); grad.addColorStop(0.5, `hsl(${(h0 + 90) % 360} 85% 58%)`); grad.addColorStop(1, `hsl(${(h0 + 180) % 360} 85% 55%)`);
      g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
      // Lunares de colores, distintos en cada zona, para que ninguna pieza se vea igual a otra
      for (let i = 0; i < cols * rows * 3; i++) {
        g.fillStyle = `hsl(${Math.floor(Math.random() * 360)} 90% 75% / .55)`;
        g.beginPath(); g.arc(Math.random() * c.width, Math.random() * c.height, 8 + Math.random() * 16, 0, Math.PI * 2); g.fill();
      }
      // Si el dibujo es alto o ancho, van varios a lo largo, así ninguna pieza queda vacía
      const tall = rows >= cols;
      const k = Math.max(1, Math.round(Math.max(cols, rows) / Math.min(cols, rows)));
      const seg = (tall ? c.height : c.width) / k;
      const big = Math.min(tall ? c.width : c.height, seg) * 0.82;
      const chosen = shuffle(pics).slice(0, k);
      g.fillStyle = '#000'; g.font = `${big}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      chosen.forEach((e, i) => {
        const x = tall ? c.width / 2 : seg * (i + 0.5);
        const y = tall ? seg * (i + 0.5) : c.height / 2;
        g.fillText(e, x, y + big * 0.06);
      });
      const img = c.toDataURL();
      let order = [...Array(n).keys()];
      while (order.every((v, i) => v === i)) order = shuffle(order);
      let sel = null;
      // Tamaño de cada pieza: lo que quepa en la pantalla del celular
      const side = Math.floor(Math.min((Math.min(innerWidth, 640) - 40) / cols, (innerHeight - 250) / rows));
      const pos = (p) => `${cols > 1 ? (p % cols) / (cols - 1) * 100 : 0}% ${rows > 1 ? Math.floor(p / cols) / (rows - 1) * 100 : 0}%`;
      const draw = () => {
        stage.innerHTML = `${dots}<div class="kz-peek" style="background-image:url(${img});aspect-ratio:${cols}/${rows};width:${cols >= rows ? 84 : Math.round(84 * cols / rows)}px;height:auto"></div>
          <div class="kz-puzzle" style="grid-template-columns:repeat(${cols}, ${side}px);width:auto">${order.map((p, i) => `<button type="button" class="kz-piece ${sel === i ? 'sel' : ''}" data-i="${i}" style="width:${side}px;background-image:url(${img});background-size:${cols * 100}% ${rows * 100}%;background-position:${pos(p)}"></button>`).join('')}</div>`;
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
    // Bloques: caen cuadrados de colores; se mueven con las flechas; una fila llena desaparece. Nunca se pierde.
    bloques(stage) {
      const W = 6;
      const H = 9;
      let grid = Array.from({ length: H }, () => Array(W).fill(null));
      let cur = null;
      stage.innerHTML = `<div class="kz-well" style="--w:${W};--h:${H}"></div>
        <div class="kz-pad"><button type="button" data-m="-1" aria-label="Izquierda">◀</button><button type="button" data-m="0" aria-label="Bajar">▼</button><button type="button" data-m="1" aria-label="Derecha">▶</button></div>`;
      const well = stage.querySelector('.kz-well');
      const spawn = () => { cur = { x: Math.floor(Math.random() * W), y: 0, c: pick(COLORS) }; if (grid[0][cur.x]) { grid = grid.map((r) => r.map(() => null)); } };
      const paint = () => {
        well.innerHTML = grid.map((r, y) => r.map((v, x) => {
          const c = cur && cur.x === x && cur.y === y ? cur.c : v;
          return `<i ${c ? `style="background:${c}"` : ''}></i>`;
        }).join('')).join('');
      };
      const land = () => {
        grid[cur.y][cur.x] = cur.c;
        const full = grid.findIndex((r) => r.every(Boolean));
        if (full >= 0) {
          grid.splice(full, 1);
          grid.unshift(Array(W).fill(null));
          well.classList.remove('kz-flash'); void well.offsetWidth; well.classList.add('kz-flash');
          confetti();
        }
        spawn();
      };
      const step = () => { if (cur.y + 1 < H && !grid[cur.y + 1][cur.x]) cur.y++; else land(); paint(); };
      stage.querySelectorAll('[data-m]').forEach((b) => { b.onpointerdown = (e) => {
        e.preventDefault();
        const m = Number(b.dataset.m);
        if (!m) { while (cur.y + 1 < H && !grid[cur.y + 1][cur.x]) cur.y++; land(); paint(); return; }
        const nx = cur.x + m;
        if (nx >= 0 && nx < W && !grid[cur.y][nx]) { cur.x = nx; paint(); }
      }; });
      spawn();
      paint();
      const t = setInterval(step, 700);
      return () => clearInterval(t);
    },
  };
  const MENU = [['globos', '🎈'], ['memoria', '🃏'], ['puzzle', '🧩'], ['bloques', '🟦']];

  // Se recuerda desde qué pantalla se entró, para volver ahí con «Volver a la sala»
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.kids-entry')) { try { sessionStorage.setItem('kidsBack', location.hash); } catch { /* sin almacenamiento */ } }
  }, true);
  const backTo = () => { let h = ''; try { h = sessionStorage.getItem('kidsBack') || ''; } catch { /* nada */ } return h && !h.startsWith('#/kids') ? h : '#/'; };

  views.kids = async (which) => {
    document.body.classList.add('kids');
    let stop = null;
    if (!games[which]) {
      app.innerHTML = `<div class="kz"><div class="kz-top"><button type="button" class="kz-back" data-exit>← Volver a la sala</button></div>
        <h1 class="kz-title">🧸 KRB Kids</h1>
        <div class="kz-menu">${MENU.map(([k, i]) => `<a class="kz-game" href="#/kids/${k}" aria-label="${k}">${i}</a>`).join('')}</div></div>`;
      $('[data-exit]').onclick = () => { location.hash = backTo(); };
    } else {
      app.innerHTML = `<div class="kz"><div class="kz-top"><button type="button" class="kz-back" data-back>←</button><span class="kz-icon">${MENU.find((m) => m[0] === which)[1]}</span></div><div id="kz-stage" class="kz-stage"></div></div>`;
      $('[data-back]').onclick = () => { location.hash = '#/kids'; };
      stop = games[which]($('#kz-stage'));
    }
    return () => { document.body.classList.remove('kids'); delete document.body.dataset.kzLevel; if (typeof stop === 'function') stop(); };
  };
})();
