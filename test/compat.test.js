// Compatibilidad con el Chrome antiguo de los decodificadores de las pantallas de los locales.
// Todo lo que corre en el navegador debe entenderse con JavaScript de 2019: sin «??», «?.», «||=», «&&=»…
// y el CSS sin «inset:» (se escribe top/right/bottom/left). Si esta prueba falla, la pantalla del local puede quedar en blanco.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const PUBLIC = path.join(__dirname, '..', 'public');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
// demo-luces/: copia del demo 3D de Code 4 para el PC del GC Master (no corre en los decodificadores)
const files = walk(PUBLIC).filter((f) => !path.relative(PUBLIC, f).startsWith('demo-luces'));
const rel = (f) => path.relative(PUBLIC, f);

test('JavaScript del navegador: solo sintaxis de 2019', () => {
  const bad = [];
  for (const f of files.filter((x) => x.endsWith('.js'))) {
    try { acorn.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2019, sourceType: 'script' }); } catch (err) { bad.push(`${rel(f)}:${err.loc ? err.loc.line : '?'} ${err.message}`); }
  }
  assert.deepEqual(bad, []);
});

test('scripts dentro del HTML: solo sintaxis de 2019', () => {
  const bad = [];
  for (const f of files.filter((x) => x.endsWith('.html'))) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      try { acorn.parse(m[1], { ecmaVersion: 2019 }); } catch (err) { bad.push(`${rel(f)} ${err.message}`); }
    }
  }
  assert.deepEqual(bad, []);
});

test('CSS: sin «inset:»', () => {
  const bad = [];
  for (const f of files.filter((x) => x.endsWith('.css') || x.endsWith('.html'))) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (/(^|[\s;{])inset\s*:/.test(line)) bad.push(`${rel(f)}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
});
