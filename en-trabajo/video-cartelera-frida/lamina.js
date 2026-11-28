// Lámina de cartelera de Frida sobre el cuadro original del video: tapa los textos viejos y escribe los nuevos.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const LAYOUT = { // filas (y del bloque) para cada cuadro base
  3: { base: 'base3.png', rows: [[340, 530], [580, 770], [815, 1005]] },
  2: { base: 'base2.png', rows: [[345, 600], [655, 905]] } };
const [,, out, json] = process.argv; const filas = JSON.parse(json);
const L = LAYOUT[filas.length];
const BOX_L = 65, BOX_R = 1855; // borde dorado del cuadro (medido en el video original; simétrico respecto del centro, 960)
const img = 'data:image/png;base64,' + fs.readFileSync(path.join(path.dirname(out), L.base)).toString('base64');
const html = `<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Besley:wght@800;900&display=swap">
<style>*{margin:0;padding:0;box-sizing:border-box}body{width:1920px;height:1080px;position:relative;background:url(${img}) 0 0/1920px 1080px;font-family:Besley,serif}
.m{position:absolute;background:#020202}.d{position:absolute;text-align:center;color:#f3eee6;line-height:1}
.d small{display:block;font-weight:800;letter-spacing:.01em}.d b{display:block;color:#e8247c;font-weight:900}
.n{position:absolute;color:#f3eee6;line-height:1;white-space:nowrap}.n small{display:block;font-weight:800}.n b{display:block;font-weight:900;transform-origin:0 50%}.h{position:absolute;color:#e8247c;font-weight:900;line-height:1;text-align:right;white-space:nowrap}</style></head><body>
${filas.map((f, i) => { const [y0, y1] = L.rows[i]; const h = y1 - y0; const big = filas.length === 3 ? 130 : 170; const sm = filas.length === 3 ? 50 : 58;
  return `
  <div class="d" style="left:290px;width:300px;top:${y0 + 6}px"><small style="font-size:${sm}px;${f.color ? 'color:' + f.color : ''}">${f.dia}</small><b style="font-size:${big}px;margin-top:${filas.length===3?2:6}px;${f.color ? 'color:' + f.color : ''}">${f.num}</b></div>
  <div class="n" style="left:680px;top:${y0 + 6}px;width:1060px">${f.antes ? `<small style="font-size:${sm}px">${f.antes}</small>` : ''}<b class="fit" style="font-size:${big}px;margin-top:${f.antes ? (filas.length===3?2:6) : (filas.length===3?48:58)}px;${f.nomColor || f.color ? 'color:' + (f.nomColor || f.color) : ''}">${f.nom}</b></div>
  ${f.hora ? `<div class="h" style="right:${1920 - 1720}px;top:${y0 + 8}px;font-size:${sm}px;${f.horaColor || f.color ? 'color:' + (f.horaColor || f.color) : ''}">${f.hora}</div>` : ''}`; }).join('')}
<script>
// Sangría pareja (regla de Cote): lo que hay entre el borde izquierdo del cuadro y la palabra del día
// es lo mismo que queda entre la hora (y los nombres) y el borde derecho del cuadro.
const BOX_L = ${BOX_L}, BOX_R = ${BOX_R};
document.fonts.ready.then(()=>{
  const izq = Math.min(...[...document.querySelectorAll('.d small')].map(e=>{const r=document.createRange();r.selectNodeContents(e);return r.getBoundingClientRect().left;}));
  const tope = BOX_R - (izq - BOX_L);
  document.querySelectorAll('.h').forEach(h=>{h.style.right=(1920 - tope)+'px';});
  document.querySelectorAll('.fit').forEach(b=>{const w=b.scrollWidth, max=tope - b.getBoundingClientRect().left; if(w>max) b.style.transform='scaleX('+(max/w)+')';});
  document.body.dataset.tope = tope; document.body.dataset.izq = izq; document.body.dataset.ok=1})</script></body></html>`;
(async () => { const b = await chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.setContent(html, { waitUntil: 'networkidle' }); await p.waitForSelector('body[data-ok]'); console.log('sangria', await p.evaluate(()=>[document.body.dataset.izq - 65, 1855 - document.body.dataset.tope])); await p.screenshot({ path: out }); await b.close(); })();
