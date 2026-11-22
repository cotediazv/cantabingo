// Conectados (pedido de Cote, 22 nov, por el Registro: «en el panel de control, ver cuánta gente está conectada, con algún
// gráfico en vivo… y una pestaña "Registros de conectados", que vaya registrando solamente los días y horarios en que
// realmente hay actividades»). Cada minuto se cuenta, por local:
//   sala    personas conectadas ahora a la sala de juegos (celulares con la sala abierta)
//   light   personas con la sala light abierta en el celular (avisan cada 45 s)
//   twitch  espectadores de la transmisión de Twitch del local
//   propia  personas viendo la transmisión nuestra (krbstage.cl). Cloudflare no entrega ese número para la señal de baja
//           latencia, así que cada reproductor avisa aquí cada 30 s mientras está viendo (/api/web/viendo)
// Las últimas 3 horas quedan en memoria para el gráfico. El registro guarda una fila por jornada (máximo, a qué hora fue
// y promedio) y solo se escribe dentro de los horarios con actividad real (respuesta de Cote: opción A).
const VENUES = { kennedy: 'Mercado Kennedy', frida: 'Frida Kahlo', tobalaba: 'Tobalaba' };
const TWITCH = { kennedy: 'krbstagekennedy', frida: 'krbstage', tobalaba: 'krbstage3' };
const KEYS = ['sala', 'light', 'twitch', 'propia'];
// Horarios con actividad real, hora de Chile: [día (0 = domingo), desde, hasta]; si «hasta» es menor que «desde», la
// jornada sigue pasada la medianoche y pertenece al día en que empezó
const HORARIOS = {
  kennedy: [[4, '18:30', '00:30'], [5, '18:30', '00:30'], [6, '18:30', '00:30']], // jueves: juegos y karaoke; viernes y sábado: sala light
  frida: [[5, '18:30', '00:30'], [6, '18:30', '00:30'], [0, '13:00', '17:00']], // viernes y sábado: sala light; domingo: juegos
  tobalaba: [[5, '18:00', '22:45']], // viernes: juegos
};
const SERIE_MAX = 180; // 3 horas, un punto por minuto
const JORNADAS_MAX = 400;
const VIVO_MS = 80e3; // un aviso vale 80 s (los reproductores avisan cada 30 a 45 s)

const chile = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hm: `${p.hour}:${p.minute}` };
};
// La jornada en curso de un local a esa hora (o null si está fuera de horario)
const jornadaOf = (venue, ms) => {
  const hoy = chile(ms); const ayer = chile(ms - 24 * 3600e3);
  for (const [dow, from, to] of HORARIOS[venue] || []) {
    const cruza = to < from;
    if (dow === hoy.dow && hoy.hm >= from && (cruza || hoy.hm < to)) return { date: hoy.date, from, to };
    if (cruza && dow === ayer.dow && hoy.hm < to) return { date: ayer.date, from, to };
  }
  return null;
};

module.exports = function conectados({ app, db, save, requireAdmin, salaOf, port }) {
  if (!db.conectados || !Array.isArray(db.conectados.jornadas)) db.conectados = { jornadas: [] };
  const vivos = { light: {}, propia: {} }; // por tipo y local: id → última vez que avisó
  for (const k of Object.keys(vivos)) for (const v of Object.keys(VENUES)) vivos[k][v] = new Map();
  const serie = {}; for (const v of Object.keys(VENUES)) serie[v] = [];
  let twitch = {}; // local → espectadores

  const cuenta = (map, now) => { let n = 0; for (const [id, at] of map) { if (now - at > VIVO_MS) map.delete(id); else n++; } return n; };
  const ahora = (v, now) => { const s = salaOf(v); return { sala: s.now, salaTotal: s.total, light: cuenta(vivos.light[v], now), twitch: twitch[v] || 0, propia: cuenta(vivos.propia[v], now) }; };

  // Aviso de «estoy aquí»: la sala light (celular) y el reproductor de la transmisión nuestra (krbstage.cl, otro sitio:
  // por eso es una lectura simple, sin clave y con permiso para leerse desde cualquier sitio). No guarda datos personales:
  // «id» es una marca al azar del navegador, solo para no contar dos veces a la misma persona.
  app.get('/api/web/viendo', (req, res) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    const que = req.query.que === 'light' ? 'light' : 'propia';
    const v = String(req.query.local || '');
    const id = String(req.query.id || '').slice(0, 40);
    if (!VENUES[v] || !/^[A-Za-z0-9_-]{6,40}$/.test(id)) return res.status(400).json({ error: 'Faltan el local o la marca' });
    const map = vivos[que][v];
    if (map.size < 5000 || map.has(id)) map.set(id, Date.now());
    res.json({ ok: true });
  });

  const leerTwitch = async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/web/twitch`, { signal: AbortSignal.timeout(8000) });
      const j = await r.json(); const out = {};
      for (const v of Object.keys(VENUES)) { const c = (j.canales || []).find((x) => x.canal === TWITCH[v]); out[v] = c && c.vivo ? Number(c.vivo.viewers) || 0 : 0; }
      twitch = out;
    } catch (e) { /* se mantiene lo último */ }
  };

  const muestra = async () => {
    await leerTwitch();
    const now = Date.now(); let cambio = false;
    for (const v of Object.keys(VENUES)) {
      const a = ahora(v, now);
      const p = [now, a.sala, a.light, a.twitch, a.propia];
      serie[v].push(p); if (serie[v].length > SERIE_MAX) serie[v].shift();
      const jn = jornadaOf(v, now);
      if (!jn) continue;
      const total = a.sala + a.light + a.twitch + a.propia;
      let j = db.conectados.jornadas.find((x) => x.venue === v && x.date === jn.date && x.from === jn.from);
      if (!j) {
        if (!total) continue; // la jornada se abre con la primera persona conectada
        j = { venue: v, date: jn.date, from: jn.from, to: jn.to, first: now, last: now, n: 0, sum: 0, max: 0, maxAt: now, salaTotal: 0 };
        for (const k of KEYS) { j[`${k}Max`] = 0; j[`${k}Sum`] = 0; }
        db.conectados.jornadas.push(j);
        if (db.conectados.jornadas.length > JORNADAS_MAX) db.conectados.jornadas.shift();
      }
      j.last = now; j.n++; j.sum += total;
      if (total > j.max) { j.max = total; j.maxAt = now; }
      KEYS.forEach((k) => { j[`${k}Max`] = Math.max(j[`${k}Max`], a[k]); j[`${k}Sum`] += a[k]; });
      j.salaTotal = Math.max(j.salaTotal, a.salaTotal);
      cambio = true;
    }
    if (cambio) save();
  };
  setInterval(() => { muestra().catch(() => {}); }, 60e3).unref();
  setTimeout(() => { muestra().catch(() => {}); }, 5000).unref();

  app.get('/api/conectados', requireAdmin, (_req, res) => {
    const now = Date.now();
    const locales = Object.keys(VENUES).map((v) => ({ venue: v, name: VENUES[v], now: ahora(v, now), serie: serie[v], jornada: jornadaOf(v, now), horarios: HORARIOS[v] }));
    const jornadas = db.conectados.jornadas.slice().sort((a, b) => b.first - a.first).map((j) => ({
      venue: j.venue, name: VENUES[j.venue], date: j.date, from: j.from, to: j.to, first: j.first, last: j.last, max: j.max, maxAt: j.maxAt, avg: j.n ? Math.round((j.sum / j.n) * 10) / 10 : 0, minutos: j.n, salaTotal: j.salaTotal || 0,
      salaMax: j.salaMax, lightMax: j.lightMax, twitchMax: j.twitchMax, propiaMax: j.propiaMax,
    }));
    res.json({ at: now, locales, jornadas });
  });
  return { muestra, jornadaOf };
};
module.exports.jornadaOf = jornadaOf;
