//@ Efectos de sonido (sin archivos de audio). Parte de la aplicación: se carga en orden desde index.html.
// ---------- Efectos de sonido (tablero del DJ) ----------
// Se generan en el navegador, sin archivos de audio. El navegador solo deja sonar después de un
// toque o clic en la página, por eso el tablero muestra «Activar sonido» hasta que alguien lo pulsa.
const sfx = (() => {
  let ctx = null;
  const ready = () => !!ctx && ctx.state === 'running';
  const unlock = () => {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state !== 'running') ctx.resume();
    } catch { /* sin audio */ }
    return ctx;
  };
  // Una nota: frecuencia, inicio y duración en segundos, forma de onda y volumen
  const note = (freq, at, dur, type = 'sine', vol = 0.3, slideTo = 0) => {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  // Bocina de aire comprimido (la de los estadios): dos tonos ásperos y desafinados que entran
  // con un pequeño «subidón», saturados para que suenen fuertes y metálicos.
  const horn = (at, dur) => {
    const t = ctx.currentTime + at;
    const out = ctx.createGain();
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 512) - 1; curve[i] = Math.tanh(3 * x); }
    shape.curve = curve;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.5, t + 0.03);
    out.gain.setValueAtTime(0.5, t + dur - 0.08);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    shape.connect(lp).connect(out).connect(ctx.destination);
    for (const [f, v] of [[466, 0.5], [469, 0.4], [587, 0.45], [591, 0.35], [932, 0.15], [1174, 0.1]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.93, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      g.gain.value = v;
      o.connect(g).connect(shape);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  };
  const sounds = {
    // Acierto: campanita brillante de dos notas
    hit: () => { note(1319, 0, 0.5, 'sine', 0.35); note(2637, 0, 0.35, 'sine', 0.12); note(1760, 0.12, 0.8, 'sine', 0.35); note(3520, 0.12, 0.5, 'sine', 0.1); },
    // Fallo: zumbador grave
    miss: () => { note(160, 0, 0.6, 'sawtooth', 0.28); note(113, 0, 0.6, 'square', 0.16); },
    // Paso: nota corta que baja
    pass: () => { note(660, 0, 0.22, 'triangle', 0.25, 330); },
    // Bolita del bingo: campanita tipo triángulo, muy suave y con cola larga
    ball: () => { note(2637, 0, 1.6, 'sine', 0.09); note(5290, 0, 1.1, 'sine', 0.04); note(7980, 0, 0.6, 'sine', 0.02); note(3960, 0, 0.9, 'sine', 0.025); },
    // Tómbola: golpe seco de la rueda en cada nombre que pasa, y «ta-dá» al salir el elegido
    ratchet: () => { note(820, 0, 0.045, 'triangle', 0.45, 520); note(2400, 0, 0.02, 'square', 0.12); },
    tada: () => {
      [392, 494, 587].forEach((f) => { note(f, 0, 0.16, 'sawtooth', 0.14); note(f * 2, 0, 0.16, 'square', 0.05); });
      [523, 659, 784, 1047].forEach((f) => { note(f, 0.2, 1.5, 'sawtooth', 0.13); note(f * 2, 0.2, 1.1, 'sine', 0.06); });
      [2093, 2637, 3136].forEach((f, i) => note(f, 0.25 + i * 0.07, 0.9, 'sine', 0.07));
    },
    // Reloj: tic y tac secos y fuertes, alternados
    tick: () => { note(1500, 0, 0.05, 'square', 0.4); note(3000, 0, 0.03, 'sine', 0.2); },
    tock: () => { note(950, 0, 0.06, 'square', 0.4); note(1900, 0, 0.03, 'sine', 0.2); },
    // Reloj de la votación: tic-tac suave, tipo madera, y una campanita al terminar
    softTick: () => { note(880, 0, 0.07, 'sine', 0.22); note(1760, 0, 0.03, 'sine', 0.06); },
    softTock: () => { note(660, 0, 0.08, 'sine', 0.22); note(1320, 0, 0.03, 'sine', 0.06); },
    chime: () => { note(1047, 0, 0.5, 'sine', 0.22); note(1319, 0.14, 0.6, 'sine', 0.2); note(1568, 0.28, 0.9, 'sine', 0.18); },
    // Se acabó el tiempo: tres bocinazos de aire comprimido, el último más largo
    alarm: () => { horn(0, 0.45); horn(0.62, 0.45); horn(1.24, 1.1); },
    // Redoble de tambores (concurso de karaoke): golpes cada vez más rápidos y fuertes, y un platillo al final
    drum: () => {
      let t = 0;
      for (let i = 0; i < 46; i++) { const v = 0.08 + 0.3 * (i / 46); note(110 + (i % 2) * 18, t, 0.06, 'triangle', v); note(70, t, 0.05, 'square', v * 0.5); t += Math.max(0.035, 0.11 - i * 0.0018); }
      note(55, t, 0.9, 'sawtooth', 0.35); note(2400, t, 1.2, 'square', 0.06, 900); note(1800, t + 0.02, 1.1, 'sine', 0.08, 700);
    },
    // Ganador: fanfarria ascendente con acorde final
    // Temblor (El último en pie): el piso se sacude y la gente cae
    rumble: () => { noise(0, 1.5, 0.5, 140, 0.7); noise(0.1, 1.2, 0.25, 420, 0.6); note(52, 0, 1.4, 'sawtooth', 0.3, 34); note(70, 0.2, 1.1, 'triangle', 0.25, 45); },
    win: () => {
      [523, 659, 784].forEach((f, i) => { note(f, i * 0.14, 0.2, 'sawtooth', 0.16); note(f, i * 0.14, 0.2, 'square', 0.08); });
      [1047, 784, 659, 523].forEach((f) => { note(f, 0.42, 1.6, 'sawtooth', 0.13); note(f * 2, 0.42, 1.2, 'sine', 0.06); });
      [1319, 1568, 2093].forEach((f, i) => note(f, 0.9 + i * 0.12, 0.6, 'sine', 0.14));
    },
  };
  const play = (name) => { if (ready() && sounds[name]) { try { sounds[name](); } catch { /* sin audio */ } } };
  // Redoble de tambores sostenido (pedido de Cote, 23 nov: «cuando se va a revelar el ganador del Festival… tiene que haber
  // un redoble de tambores que suene»): golpes de caja hechos con ruido (se oyen bien en cualquier parlante; el redoble
  // anterior era de tonos graves, casi mudo en parlantes chicos), cada vez más rápidos y fuertes, que siguen sonando hasta
  // que se revela al ganador (tope 45 s); al parar, un golpe de platillo.
  let noiseBuf = null; let rollTimer = null;
  const noise = (at, dur, vol, freq, q) => {
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = Math.max(ctx.currentTime, ctx.currentTime + at);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = q ? 'bandpass' : 'highpass'; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(ctx.destination); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  };
  const snare = (at, vol) => { noise(at, 0.085, vol, 2200, 0.9); note(210, Math.max(0, at), 0.06, 'triangle', vol * 0.5, 150); };
  const roll = (on) => {
    const was = !!rollTimer;
    clearInterval(rollTimer); rollTimer = null;
    if (!on) { if (was && ready()) { try { noise(0, 1.6, 0.3, 5200, 0); note(60, 0, 0.5, 'sine', 0.4, 40); } catch { /* sin audio */ } } return; }
    if (!ready()) return;
    const t0 = ctx.currentTime; let next = 0.02;
    const sched = () => {
      try {
        const now = ctx.currentTime - t0;
        if (now > 45) { roll(false); return; }
        while (next < now + 0.7) { const k = Math.min(1, next / 3.5); snare(next - now, 0.1 + 0.26 * k); next += 0.11 - 0.062 * k; }
      } catch { /* sin audio */ }
    };
    sched(); rollTimer = setInterval(sched, 250);
  };
  return { unlock, ready, play, roll, rolling: () => !!rollTimer, played: [], ticks: 0 };
})();

