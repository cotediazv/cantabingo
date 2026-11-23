// Arma las piezas de la prueba de la capa gráfica: tipografía para el 3D y animación Lottie.
import fs from 'node:fs';
import opentype from 'opentype.js';

const OUT = '/home/user/cantabingo/public/capa/';
fs.mkdirSync(OUT, { recursive: true });

// 1) Tipografía Source Sans 3 Black → formato de three (solo letras, números y signos del español)
const buf = fs.readFileSync('x-font/package/files/source-sans-3-latin-900-normal.woff');
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const KEEP = ' ABCDEFGHIJKLMNÑOPQRSTUVWXYZabcdefghijklmnñopqrstuvwxyzÁÉÍÓÚÜáéíóúü0123456789.,;:¡!¿?()-–·«»"\'#%&+/@°º';
const scale = 100000 / ((font.unitsPerEm || 2048) * 72);
const round = Math.round;
const glyphs = {};
for (const ch of KEEP) {
  const g = font.charToGlyph(ch);
  if (!g || (g.index === 0 && ch !== ' ')) { console.log('sin letra:', ch); continue; }
  const token = { ha: round(g.advanceWidth * scale), x_min: round((g.xMin || 0) * scale), x_max: round((g.xMax || 0) * scale), o: '' };
  g.path.commands.forEach((c) => {
    let t = c.type.toLowerCase(); if (t === 'c') t = 'b';
    token.o += t + ' ';
    if (c.x !== undefined && c.y !== undefined) token.o += round(c.x * scale) + ' ' + round(c.y * scale) + ' ';
    if (c.x1 !== undefined && c.y1 !== undefined) token.o += round(c.x1 * scale) + ' ' + round(c.y1 * scale) + ' ';
    if (c.x2 !== undefined && c.y2 !== undefined) token.o += round(c.x2 * scale) + ' ' + round(c.y2 * scale) + ' ';
  });
  glyphs[ch] = token;
}
const face = { glyphs, familyName: 'Source Sans 3', ascender: round(font.ascender * scale), descender: round(font.descender * scale),
  underlinePosition: round(font.tables.post.underlinePosition * scale), underlineThickness: round(font.tables.post.underlineThickness * scale),
  boundingBox: { xMin: round(font.tables.head.xMin * scale), xMax: round(font.tables.head.xMax * scale), yMin: round(font.tables.head.yMin * scale), yMax: round(font.tables.head.yMax * scale) },
  resolution: 1000, original_font_information: { license: 'SIL Open Font License 1.1' } };
fs.writeFileSync(OUT + 'fuente-3d.json', JSON.stringify(face));
console.log('fuente-3d.json', Object.keys(glyphs).length, 'letras,', Math.round(fs.statSync(OUT + 'fuente-3d.json').size / 1024), 'KB');

// 2) Animación Lottie de prueba, escrita a mano (figuras simples): barra que se abre, estrella que gira y anillos
const st = (v) => ({ a: 0, k: v });
const ease = { i: { x: [0.2], y: [1] }, o: { x: [0.6], y: [0] } };
const an = (frames) => ({ a: 1, k: frames.map(([t, s], i) => (i < frames.length - 1 ? { t, s, ...ease } : { t, s })) });
const tr = (o = {}) => ({ ty: 'tr', p: st([0, 0]), a: st([0, 0]), s: st([100, 100]), r: st(0), o: st(100), sk: st(0), sa: st(0), ...o });
const fill = (c) => ({ ty: 'fl', c: st([...c, 1]), o: st(100), r: 1 });
const stroke = (c, w) => ({ ty: 'st', c: st([...c, 1]), o: st(100), w: st(w), lc: 2, lj: 2 });
const layer = (ind, nm, ks, shapes, ip = 0, op = 120) => ({ ddd: 0, ind, ty: 4, nm, sr: 1, ao: 0, bm: 0, ip, op, st: 0,
  ks: { o: st(100), r: st(0), p: st([0, 0, 0]), a: st([0, 0, 0]), s: st([100, 100, 100]), ...ks }, shapes: [{ ty: 'gr', nm: 'g', it: [...shapes, tr()] }] });
const BLUE = [0.078, 0.529, 0.812], GOLD = [1, 0.769, 0], DARK = [0.063, 0.055, 0.133], WHITE = [1, 1, 1];
const W = 1280, H = 360, X0 = 150;
const bar = (ind, nm, col, y, h, w, t0, t1) => layer(ind, nm, { p: st([X0, y, 0]) }, [
  { ty: 'rc', d: 1, r: st(h / 2), p: an([[t0, [0, 0]], [t0 + 22, [w / 2, 0]], [t1, [w / 2, 0]], [t1 + 16, [0, 0]]]), s: an([[t0, [0, h]], [t0 + 22, [w, h]], [t1, [w, h]], [t1 + 16, [0, h]]]) }, fill(col)]);
const ring = (ind, t0) => layer(ind, 'anillo', { p: st([X0, 180, 0]), s: an([[t0, [40, 40, 100]], [t0 + 30, [330, 330, 100]]]), o: an([[t0, 90], [t0 + 30, 0]]) },
  [{ ty: 'el', d: 1, s: st([100, 100]), p: st([0, 0]) }, stroke(GOLD, 7)], t0, t0 + 31);
const anim = { v: '5.7.4', fr: 30, ip: 0, op: 120, w: W, h: H, nm: 'prueba', ddd: 0, assets: [], layers: [
  layer(1, 'estrella', { p: st([X0, 180, 0]), r: an([[0, -90], [120, 270]]), s: an([[6, [0, 0, 100]], [22, [125, 125, 100]], [30, [100, 100, 100]], [102, [100, 100, 100]], [116, [0, 0, 100]]]) },
    [{ ty: 'sr', sy: 1, d: 1, pt: st(5), p: st([0, 0]), r: st(0), ir: st(30), is: st(0), or: st(72), os: st(0) }, fill(GOLD), stroke(WHITE, 5)]),
  layer(2, 'disco', { p: st([X0, 180, 0]), s: an([[2, [0, 0, 100]], [18, [100, 100, 100]], [104, [100, 100, 100]], [118, [0, 0, 100]]]) },
    [{ ty: 'el', d: 1, s: st([200, 200]), p: st([0, 0]) }, fill(DARK), stroke(GOLD, 8)]),
  ring(3, 22), ring(4, 56),
  bar(5, 'barra dorada', GOLD, 262, 18, 620, 14, 96),
  bar(6, 'barra azul', BLUE, 180, 132, 1010, 6, 100),
] };
fs.writeFileSync(OUT + 'anim-prueba.json', JSON.stringify(anim));
console.log('anim-prueba.json', Math.round(fs.statSync(OUT + 'anim-prueba.json').size / 1024), 'KB');
