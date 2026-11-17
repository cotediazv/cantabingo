/* global views, app, $ */
// KRB Kids: juegos simples para niños de 3 a 5 años, en el celular de los papás (opción al entrar a la sala).
// Sin leer: dibujos grandes, colores y la voz del celular. Nadie pierde: si se equivoca, «¡Intenta otra vez!».
(() => {
  // ---------- Voz y sonidos ----------
  const say = (text) => {
    try {
      const s = window.speechSynthesis;
      if (!s) return;
      s.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-CL';
      const v = s.getVoices().find((x) => /^es/i.test(x.lang));
      if (v) u.voice = v;
      u.rate = 0.9;
      u.pitch = 1.2;
      s.speak(u);
    } catch { /* sin voz */ }
  };
  let ctx = null;
  const tone = (freqs, dur = 0.12) => {
    try {
      ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      freqs.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        const t = ctx.currentTime + i * dur;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.6);
        o.connect(g).connect(ctx.destination);
        o.start(t);
        o.stop(t + dur * 1.8);
      });
    } catch { /* sin sonido */ }
  };
  const yay = () => tone([523, 659, 784, 1047]);
  const oops = () => tone([330, 262], 0.15);
  const PRAISE = ['¡Muy bien!', '¡Excelente!', '¡Bravo!', '¡Lo lograste!', '¡Súper!'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const confetti = () => {
    const box = document.createElement('div');
    box.className = 'kz-confetti';
    const colors = ['#ff4d6d', '#ffc400', '#2ec4b6', '#4361ee', '#80ed99', '#f72585'];
    box.innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.4).toFixed(2)}s"></i>`).join('');
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 2200);
  };
  const wobble = (el) => { el.classList.remove('kz-no'); void el.offsetWidth; el.classList.add('kz-no'); };

  // ---------- Juegos ----------
  const ANIMALS = [['🐶', 'perro', '¡Guau, guau!'], ['🐱', 'gato', '¡Miau, miau!'], ['🐮', 'vaca', '¡Muuu!'], ['🐷', 'chancho', '¡Oinc, oinc!'],
    ['🐔', 'gallina', '¡Co, co, co!'], ['🦆', 'pato', '¡Cuac, cuac!'], ['🐑', 'oveja', '¡Beee!'], ['🐸', 'rana', '¡Croac, croac!'], ['🦁', 'león', '¡Grrr!'], ['🐴', 'caballo', '¡Iii, iii!']];
  const COLORS = [['rojo', '#e63946'], ['azul', '#1d6fe0'], ['amarillo', '#ffc400'], ['verde', '#2bb24c'], ['rosado', '#ff5fa2'], ['morado', '#8e44ad']];
  const MEMO = ['🍎', '🚗', '⭐', '🐻', '🌈', '⚽'];

  const games = {
    // ¿Qué animal suena? Se escucha el sonido y se toca el animal
    animales(stage, next) {
      const opts = shuffle(ANIMALS).slice(0, 3);
      const ok = pick(opts);
      const ask = () => say(`${ok[2]} ¿Quién hace así?`);
      stage.innerHTML = `<p class="kz-q">¿Quién hace así?</p><button type="button" class="kz-hear">🔊 Escuchar otra vez</button>
        <div class="kz-row">${opts.map((a) => `<button type="button" class="kz-card" data-k="${a[1]}">${a[0]}</button>`).join('')}</div>`;
      stage.querySelector('.kz-hear').onclick = ask;
      stage.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => {
        if (b.dataset.k === ok[1]) { b.classList.add('kz-yes'); yay(); confetti(); say(`${pick(PRAISE)} Es el ${ok[1]}`); setTimeout(next, 2200); } else { wobble(b); oops(); say('¡Intenta otra vez!'); }
      }; });
      ask();
    },
    // Globos de colores: tocar el globo del color que se pide
    globos(stage, next) {
      const opts = shuffle(COLORS).slice(0, 4);
      const ok = pick(opts);
      const ask = () => say(`¡Toca el globo ${ok[0]}!`);
      stage.innerHTML = `<p class="kz-q">¡Toca el globo <b style="color:${ok[1]}">${ok[0]}</b>!</p><button type="button" class="kz-hear">🔊 Escuchar otra vez</button>
        <div class="kz-balloons">${opts.map((c) => `<button type="button" class="kz-balloon" data-k="${c[0]}" style="--c:${c[1]}" aria-label="Globo ${c[0]}"></button>`).join('')}</div>`;
      stage.querySelector('.kz-hear').onclick = ask;
      stage.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => {
        if (b.dataset.k === ok[0]) { b.classList.add('kz-pop'); yay(); confetti(); say(pick(PRAISE)); setTimeout(next, 1900); } else { wobble(b); oops(); say(`Ese es ${b.dataset.k}. ¡Busca el ${ok[0]}!`); }
      }; });
      ask();
    },
    // Memoria: 4 cartas (2 parejas); al terminar, la siguiente ronda trae 6
    memoria(stage, next, round) {
      const pairs = round > 0 ? 3 : 2;
      const cards = shuffle(shuffle(MEMO).slice(0, pairs).flatMap((e) => [e, e]));
      let open = [];
      let done = 0;
      let lock = false;
      stage.innerHTML = `<p class="kz-q">¡Encuentra las parejas!</p><div class="kz-memo ${pairs === 3 ? 'six' : ''}">${cards.map((e, i) => `<button type="button" class="kz-mcard" data-i="${i}"><span>${e}</span></button>`).join('')}</div>`;
      say('¡Encuentra las parejas!');
      stage.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => {
        if (lock || b.classList.contains('up')) return;
        b.classList.add('up');
        tone([660], 0.08);
        open.push(b);
        if (open.length < 2) return;
        const [x, y] = open;
        open = [];
        if (cards[x.dataset.i] === cards[y.dataset.i]) {
          x.classList.add('kz-yes'); y.classList.add('kz-yes'); done++;
          if (done === pairs) { yay(); confetti(); say(pick(PRAISE)); setTimeout(next, 2200); } else tone([784, 988], 0.1);
        } else {
          lock = true;
          setTimeout(() => { x.classList.remove('up'); y.classList.remove('up'); lock = false; }, 900);
        }
      }; });
    },
  };
  const MENU = [['animales', '🐶', '¿Qué animal suena?'], ['globos', '🎈', 'Globos de colores'], ['memoria', '🃏', 'Memoria']];

  views.kids = async (which) => {
    document.body.classList.add('kids');
    const back = '<button type="button" class="kz-back" data-back>←</button>';
    if (!games[which]) {
      app.innerHTML = `<div class="kz"><div class="kz-top"><button type="button" class="kz-back" data-exit>← Salir</button></div>
        <h1 class="kz-title">🧸 KRB Kids</h1><p class="kz-sub">Juegos para niños de 3 a 5 años</p>
        <div class="kz-menu">${MENU.map(([k, i, t]) => `<a class="kz-game" href="#/kids/${k}"><span>${i}</span>${t}</a>`).join('')}</div></div>`;
      $('[data-exit]').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/'; };
    } else {
      app.innerHTML = `<div class="kz"><div class="kz-top">${back}<span class="kz-name">${MENU.find((m) => m[0] === which).slice(1).join(' ')}</span></div><div id="kz-stage" class="kz-stage"></div></div>`;
      $('[data-back]').onclick = () => { location.hash = '#/kids'; };
      let round = 0;
      const next = () => { if ($('#kz-stage')) games[which]($('#kz-stage'), next, round++); };
      next();
    }
    return () => { document.body.classList.remove('kids'); try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* nada */ } };
  };
})();
