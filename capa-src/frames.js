// Dibuja los cuadros del video transparente de prueba (confeti, estrella con brillo suave y anillo) y los guarda como PNG.
const { chromium } = require('playwright');
const fs = require('fs');
const DIR = process.argv[2];
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.setContent('<canvas id="c" width="1280" height="720"></canvas>');
  await p.evaluate(() => {
    const c = document.getElementById('c'), g = c.getContext('2d');
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const COL = ['#ffc400', '#1487cf', '#c4175e', '#ffffff', '#27b866', '#ff7a1a'];
    const P = []; for (let i = 0; i < 150; i++) { const a = rnd() * Math.PI * 2, v = 380 + rnd() * 760; P.push({ a, v, s: 10 + rnd() * 16, col: COL[i % COL.length], rot: rnd() * 6, vr: (rnd() - 0.5) * 14, w: 0.5 + rnd() * 0.8 }); }
    const star = (x, y, r, rot) => { g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.44 : r, an = rot + i * Math.PI / 5 - Math.PI / 2; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } g.closePath(); };
    window.draw = (f, N) => {
      const t = f / 30, T = N / 30; g.clearRect(0, 0, 1280, 720);
      const fade = Math.min(1, t / 0.2) * Math.min(1, (T - t) / 0.5);
      // confeti: sale del centro, frena y cae
      P.forEach((q) => {
        const d = q.v * (1 - Math.exp(-t * 2.2)) / 2.2; const x = 640 + Math.cos(q.a) * d * 1.25, y = 360 + Math.sin(q.a) * d * 0.9 + 190 * t * t * q.w;
        g.save(); g.globalAlpha = fade; g.translate(x, y); g.rotate(q.rot + q.vr * t); g.scale(1, Math.cos(t * 9 + q.rot)); g.fillStyle = q.col; g.fillRect(-q.s / 2, -q.s / 3, q.s, q.s / 1.5); g.restore();
      });
      // anillo que se abre
      const k = Math.min(1, t / 1.1); g.save(); g.globalAlpha = (1 - k) * fade; g.strokeStyle = '#ffc400'; g.lineWidth = 16 * (1 - k) + 2; g.beginPath(); g.arc(640, 360, 60 + 420 * k, 0, Math.PI * 2); g.stroke(); g.restore();
      // brillo suave (bordes difuminados) y estrella
      const pop = Math.min(1, t / 0.35), s = (1 + 0.22 * Math.sin(Math.min(1, t / 0.5) * Math.PI)) * pop;
      const gr = g.createRadialGradient(640, 360, 10, 640, 360, 300 * s + 1); gr.addColorStop(0, 'rgba(255,214,90,.85)'); gr.addColorStop(0.45, 'rgba(255,196,0,.28)'); gr.addColorStop(1, 'rgba(255,196,0,0)');
      g.save(); g.globalAlpha = fade; g.fillStyle = gr; g.fillRect(0, 0, 1280, 720);
      star(640, 360, 150 * s, t * 0.9); g.fillStyle = '#ffc400'; g.fill(); g.lineWidth = 10; g.strokeStyle = '#fff'; g.stroke();
      star(640, 360, 78 * s, t * 0.9); g.fillStyle = '#fff3c4'; g.fill(); g.restore();
      return c.toDataURL('image/png');
    };
  });
  const N = 90;
  for (let f = 0; f < N; f++) { const url = await p.evaluate(([a, n]) => window.draw(a, n), [f, N]); fs.writeFileSync(`${DIR}/f${String(f).padStart(3, '0')}.png`, Buffer.from(url.split(',')[1], 'base64')); }
  await b.close(); console.log('cuadros:', N);
})();
