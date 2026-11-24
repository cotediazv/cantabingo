// Momentos de los juegos para las luces (pedido de Cote, 24 nov; lista acordada con Code 4 en el «Registro Claude 4 y
// Code 4»). Cada vez que en un juego pasa algo que cambia las luces (sale una bolita, gira una tómbola, se inicia una
// pregunta de El Rosko, sube a cantar alguien en El Festival…), la Sala lo anuncia con su nombre (`bingo_numero`,
// `tombola_gira`, `rosko_pregunta`…). Lo que hace cada nombre con las luces lo decide la suite de luces de Code 4.
// Dos destinos:
//   1) La lista de los últimos momentos, `/api/momentos` (se puede leer desde otra página): la usa el demo del GC Master
//      (la copia de la vista 3D de Code 4 que calcula las luces en el navegador, sin tocar las luces reales).
//   2) Las luces reales de Kennedy: solo si la sala abierta es de Mercado Kennedy y NO es la sala simulada, y solo si en
//      Render están puestas LUCES_URL (por ejemplo https://luces.krbstage.cl) y LUCES_CLAVE. Se envía sin esperar la
//      respuesta, con un tope de 2 s: si el Dell está apagado o sin internet, el juego sigue igual.
const MAX = 60;
let ctx = null;
let seq = 0;
const list = [];
const later = new Map(); // momentos que llegan después (la entrega del premio, el resultado de la tómbola), cancelables

const sala = () => (ctx ? Object.values(ctx.db.sessions || {})[0] : null);

function send(name) {
  const url = process.env.LUCES_URL; const key = process.env.LUCES_CLAVE;
  const s = sala();
  if (!url || !key || !s || s.sim || (s.theme || 'frida') !== 'kennedy') return;
  fetch(`${url.replace(/\/$/, '')}/api/momento?nombre=${encodeURIComponent(name)}&sala=kennedy`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2000) }).catch(() => {});
}

// Anuncia un momento. `kind` agrupa los que se reemplazan: un momento nuevo cancela los diferidos pendientes
function emit(name) {
  if (!ctx) return;
  for (const t of later.values()) clearTimeout(t);
  later.clear();
  const s = sala();
  list.push({ seq: ++seq, name, at: Date.now(), venue: s ? s.theme || 'frida' : '', sim: !!(s && s.sim) });
  while (list.length > MAX) list.shift();
  send(name);
  if (ctx.aviso) ctx.aviso();
}
// Anuncia un momento dentro de `ms` milisegundos (se cancela si antes pasa otro momento)
function emitLater(name, ms) {
  if (!ctx) return;
  const t = setTimeout(() => { later.delete(name); emit(name); }, ms);
  later.set(name, t);
}

function init(c) {
  ctx = c;
  c.app.get('/api/momentos', (req, res) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    const from = Number(req.query.desde) || 0;
    const s = sala();
    res.json({ seq, now: Date.now(), sala: s ? { venue: s.theme || 'frida', sim: !!s.sim } : null, momentos: list.filter((m) => m.seq > from) });
  });
}

module.exports = { init, emit, emitLater };
