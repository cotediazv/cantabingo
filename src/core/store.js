// Almacenamiento: todos los datos viven en un solo JSON en disco (en Render, /var/data/data.json).
// Al arrancar se leen y se aplican los arreglos de datos antiguos; save() guarda como mucho una vez por segundo.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
// Si existe un disco permanente montado en /var/data, los datos se guardan ahí y sobreviven a los reinicios
const DISK_DIR = '/var/data';
const hasDisk = (() => { try { fs.accessSync(DISK_DIR, fs.constants.W_OK); return true; } catch { return false; } })();
const DATA_FILE = process.env.DATA_FILE || path.join(hasDisk ? DISK_DIR : ROOT, 'data.json');

module.exports = function createStore() {

  // ---------- Almacenamiento (JSON en disco) ----------
  let db = { projects: {}, sessions: {} };
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* primera ejecución */ }
  for (const s of Object.values(db.sessions)) s.auto = { on: false, interval: 10, stopOnWin: true };
  // Las salas se llaman «Los Juegos de…»; las ya creadas con el nombre anterior se renombran al arrancar
  for (const x of [...Object.values(db.sessions || {}), ...Object.values(db.projects || {})]) {
    if (typeof x.name === 'string') x.name = x.name.replace(/^El Bingo de /, 'Los Juegos de ');
  }
  // Datos anteriores: los nombres ya guardados también pasan a mayúsculas
  {
    const up = (n) => String(n || '').toLocaleUpperCase('es');
    for (const s of Object.values(db.sessions)) { for (const pl of Object.values(s.players || {})) pl.name = up(pl.name); for (const r of s.results || []) r.name = up(r.name); if (s.tieWinner) s.tieWinner.name = up(s.tieWinner.name); }
    for (const p of Object.values(db.people || {})) p.name = up(p.name);
    if (db.raffle) { db.raffle.picked = (db.raffle.picked || []).map(up); for (const k of ['roll', 'tie']) if (db.raffle[k]) { db.raffle[k].winner = up(db.raffle[k].winner); db.raffle[k].names = (db.raffle[k].names || []).map(up); } }
    for (const w of Object.values(db.wheels || {})) { for (const c of w.players || []) c.name = up(c.name); if (w.setup && w.setup.players) w.setup.players = w.setup.players.map(up); }
  }
  let saveTimer = null;
  let writing = false;
  let dirty = false;
  // Escribe primero un archivo temporal y luego lo renombra: si el proceso muere a mitad,
  // el archivo anterior queda intacto.
  function writeNow() {
    if (writing) { dirty = true; return; }
    writing = true;
    fs.writeFile(`${DATA_FILE}.tmp`, JSON.stringify(db), (err) => {
      const done = () => { writing = false; if (dirty) { dirty = false; writeNow(); } };
      if (err) { console.error('No se pudo guardar:', err.message); return done(); }
      fs.rename(`${DATA_FILE}.tmp`, DATA_FILE, done);
    });
  }
  // Guarda como mucho una vez por segundo, aunque haya cientos de cambios seguidos
  const save = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; writeNow(); }, 1000);
  };
  // Al apagarse o reiniciarse el servicio, guarda todo antes de salir
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      try { fs.writeFileSync(`${DATA_FILE}.tmp`, JSON.stringify(db)); fs.renameSync(`${DATA_FILE}.tmp`, DATA_FILE); } catch (err) { console.error('No se pudo guardar al salir:', err.message); }
      process.exit(0);
    });
  }
  return { db, save, DATA_FILE, hasDisk };
};
