// Estructura: cada escenario que el servidor conoce tiene su pantalla registrada en el navegador (KRB.escenario),
// y cada archivo que carga index.html existe. Así, al agregar un juego no se olvida su parte de las pantallas.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { GAMES } = require('../src/app');
const { BASE_STAGES } = require('../src/core/stage');

const PUBLIC = path.join(__dirname, '..', 'public');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const js = walk(PUBLIC).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

test('cada escenario tiene su pantalla registrada (KRB.escenario)', () => {
  const stages = [...BASE_STAGES, ...GAMES.map((g) => g.stage).filter(Boolean)].filter((s) => s !== 'none');
  const missing = stages.filter((s) => !js.includes(`KRB.escenario('${s}'`));
  assert.deepEqual(missing, [], 'Falta KRB.escenario(...) en el archivo ui.js del juego');
});

test('index.html: todos los archivos que carga existen', () => {
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^":]+\.(?:js|css))"/g)].map((m) => m[1]);
  assert.ok(refs.length > 20);
  assert.deepEqual(refs.filter((r) => !fs.existsSync(path.join(PUBLIC, r))), []);
});
