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

// Firma de un momento (para el aviso que sale desde el tablero del local): prueba que el aviso lo hizo la Sala sin
// entregar la clave de las luces a una página pública. HMAC-SHA256 de «id|nombre» con LUCES_CLAVE (32 primeros hex).
const firma = (key, id, name) => require('crypto').createHmac('sha256', key).update(`${id}|${name}`).digest('hex').slice(0, 32);

function send(name, extra, id) {
  const url = process.env.LUCES_URL; const key = process.env.LUCES_CLAVE;
  const s = sala();
  if (!url || !key || !s || s.sim || (s.theme || 'frida') !== 'kennedy') return;
  const more = Object.entries(extra || {}).map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('');
  // id y t (pedido de Code 4, 27 nov): el Dell anota cuánto tarda cada aviso y, si le llega dos veces (de Render y del
  // tablero del local), usa el primero
  fetch(`${url.replace(/\/$/, '')}/api/momento?nombre=${encodeURIComponent(name)}&sala=kennedy${more}&id=${id}&t=${Date.now()}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2000) }).catch(() => {});
  // El mismo aviso a las pantallas (pedido de Code 4 y decisión de Cote, 27 nov: «las luces se disparan con el efecto de
  // sonido»): el tablero de Kennedy que toca los sonidos lo manda directo al Dell desde el local, con la firma
  if (ctx.momentoLive) ctx.momentoLive({ nombre: name, id, extra: extra || {}, firma: firma(key, id, name), url: url.replace(/\/$/, '') });
}

// Anuncia un momento. Un momento nuevo cancela los diferidos pendientes. `extra`: datos que van con el aviso
// (por ejemplo { escalon: 7 } en ¿Quién quiere ser ganador?, pedido de Code 4: las luces cambian según el escalón)
function emit(name, extra) {
  if (!ctx) return;
  for (const t of later.values()) clearTimeout(t);
  later.clear();
  const s = sala();
  list.push({ seq: ++seq, name, at: Date.now(), venue: s ? s.theme || 'frida' : '', sim: !!(s && s.sim), ...(extra || {}) });
  while (list.length > MAX) list.shift();
  send(name, extra, seq);
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

module.exports = { init, emit, emitLater, firma };
