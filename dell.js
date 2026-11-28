// Semáforo en vivo del Dell de las luces de Mercado Kennedy (orden 7 y 13 de Code 0, pedido de Cote, 28 nov: «las luces
// bajo control»; contrato de Code 4). El Dell manda un latido cada 15 s con la clave de las luces (LUCES_CLAVE de Render,
// nunca en el repositorio); la Sala lo traduce a colores (verde, amarillo, rojo, gris) que ve el moderador en el Centro de
// control y en el GC Master, y avisa por ntfy (tema que manda el mismo Dell, guardado en los datos y nunca mostrado) si en
// horario de Kennedy (jueves a sábado, 18:30 a 00:30, hora de Chile) el Dell deja de responder o algo pasa a rojo.
const crypto = require('crypto');

const COSAS = ['latido', 'cable', 'adaptador', 'obs', 'tunel', 'ritmo', 'memoria', 'disco', 'cpu', 'windows'];
const NOMBRES = { latido: 'Latido del Dell', cable: 'Cable de las luces', adaptador: 'Adaptador USB', obs: 'OBS (transmisión)', tunel: 'Túnel a internet', ritmo: 'Ritmo de la música', memoria: 'Memoria', disco: 'Disco', cpu: 'Procesador', windows: 'Windows' };
const SIN_LATIDO_MS = Number(process.env.DELL_SIN_MS) || 120000; // (las pruebas lo acortan)

module.exports = function dell({ app, db, save, requireAdmin, fail, reloj = () => new Date(), ntfyBase = () => process.env.NTFY_URL || 'https://ntfy.sh' }) {
  let ultimo = null; // { at, data }: solo en memoria (no va a data.json)
  const inicio = Date.now(); // si la Sala se reinicia y el Dell no manda nada en 2 min, también se avisa
  const inesp = {}; // reinicios inesperados de Windows al primer latido de cada noche (para ver si aumentaron)
  const avisado = { caido: false, rojos: {} }; // avisos ya mandados esta noche

  const num = (x) => (x === null || x === undefined || x === '' || Number.isNaN(Number(x)) ? null : Number(x));
  // Hora de Chile y «noche» (antes de las 06:00 todavía es la noche anterior)
  const chile = () => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(reloj()).map((x) => [x.type, x.value]));
    const min = Number(p.hour) * 60 + Number(p.minute);
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
    const ayer = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) - (min < 360 ? 1 : 0)));
    return { min, dow, noche: ayer.toISOString().slice(0, 10), nocheDow: ayer.getUTCDay() };
  };
  // Horario de Kennedy: jueves, viernes y sábado de 18:30 a 00:30
  const enHorario = () => {
    const c = chile();
    if ([4, 5, 6].includes(c.dow) && c.min >= 18 * 60 + 30) return true;
    return [5, 6, 0].includes(c.dow) && c.min < 30; // 00:00 a 00:30 del día siguiente
  };

  // Colores según las reglas del contrato
  const luces = () => {
    const out = Object.fromEntries(COSAS.map((k) => [k, 'gris']));
    if (!ultimo) return out;
    const seg = (Date.now() - ultimo.at) / 1000;
    out.latido = seg * 1000 < SIN_LATIDO_MS * 0.375 ? 'verde' : seg * 1000 <= SIN_LATIDO_MS ? 'amarillo' : 'rojo'; // 45 s y 120 s
    const d = ultimo.data || {};
    const w = d.windows || {};
    if (d.cable && typeof d.cable.ok === 'boolean') out.cable = d.cable.ok ? 'verde' : 'rojo';
    const a = w.adaptador;
    if (a && typeof a === 'object') out.adaptador = a.visto === false ? 'amarillo' : ((num(a.error) || 0) !== 0 || String(a.controlador || '') !== 'WinUSB') ? 'rojo' : 'verde';
    if (!d.obsHorario) out.obs = 'gris';
    else {
      const o = d.obs || {};
      const tot = num(o.cuadrosTotal) || 0; const perd = num(o.cuadrosPerdidos) || 0;
      out.obs = !o.transmitiendo ? 'rojo' : ((tot > 0 && perd / tot > 0.02) || (num(o.congestion) || 0) > 0.5) ? 'amarillo' : 'verde';
    }
    if (d.tunel === true) out.tunel = 'verde'; else if (d.tunel === false) out.tunel = 'rojo';
    if (d.ritmo && typeof d.ritmo === 'object') out.ritmo = d.ritmo.estacion === false ? 'amarillo' : 'verde';
    const ram = num(w.ram); if (ram !== null) out.memoria = ram >= 93 ? 'rojo' : ram >= 85 ? 'amarillo' : 'verde';
    const disco = num(w.discoGB); if (disco !== null) out.disco = disco < 8 ? 'rojo' : disco < 20 ? 'amarillo' : 'verde';
    const cpu = num(w.cpu); if (cpu !== null) out.cpu = cpu >= 95 ? 'rojo' : cpu >= 80 ? 'amarillo' : 'verde';
    if (Object.keys(w).length) {
      const n = num((w.ultimoReinicio || {}).inesperados7d);
      const base = inesp[chile().noche];
      out.windows = (n !== null && base !== undefined && n > base) ? 'rojo' : w.reinicioPendiente ? 'amarillo' : 'verde';
    }
    return out;
  };
  // Una línea de texto por cosa (sin el tema de los avisos)
  const textos = () => {
    const t = Object.fromEntries(COSAS.map((k) => [k, 'Sin datos']));
    if (!ultimo) { t.latido = 'Todavía no llega ningún latido del Dell'; return t; }
    const d = ultimo.data || {}; const w = d.windows || {};
    t.latido = `Último latido hace ${Math.round((Date.now() - ultimo.at) / 1000)} s${d.version ? ` · versión ${d.version}` : ''}`;
    if (d.cable) t.cable = d.cable.ok ? `Conectado${d.cable.puerto ? ` (${d.cable.puerto})` : ''} · ${num(d.cable.envios) || 0} envíos, ${num(d.cable.fallas) || 0} fallas` : `Sin conexión${d.cable.error ? `: ${d.cable.error}` : ''}`;
    const a = w.adaptador; if (a) t.adaptador = a.visto === false ? 'Windows no ve el adaptador USB' : `${a.nombre || 'Adaptador'} · ${a.estado || ''}${(num(a.error) || 0) !== 0 ? ` · error ${a.error}` : ''} · controlador ${a.controlador || '¿?'}`;
    const o = d.obs || {};
    t.obs = !d.obsHorario ? 'Fuera del horario de transmisión' : o.transmitiendo ? `Transmitiendo · ${num(o.kbps) || 0} kbps · ${num(o.cuadrosPerdidos) || 0} de ${num(o.cuadrosTotal) || 0} cuadros perdidos` : `No está transmitiendo${o.estado ? ` (${o.estado})` : ''}`;
    t.tunel = d.tunel === true ? 'Conectado' : d.tunel === false ? 'Caído' : 'Sin datos';
    if (d.ritmo) t.ritmo = d.ritmo.estacion === false ? 'La estación de ritmo no responde' : `Funcionando${d.ritmo.bpm ? ` · ${d.ritmo.bpm} BPM` : ''}${d.ritmo.musica ? ' · con música' : ''}`;
    if (num(w.ram) !== null) t.memoria = `${Math.round(num(w.ram))} % usada`;
    if (num(w.discoGB) !== null) t.disco = `${Math.round(num(w.discoGB))} GB libres`;
    if (num(w.cpu) !== null) t.cpu = `${Math.round(num(w.cpu))} % de uso`;
    if (Object.keys(w).length) {
      const r = w.ultimoReinicio || {};
      t.windows = `${w.reinicioPendiente ? 'Reinicio pendiente · ' : ''}${num(r.inesperados7d) !== null ? `${num(r.inesperados7d)} reinicios inesperados en 7 días` : 'Sin reinicios inesperados'}${r.hora ? ` · último: ${r.hora}${r.motivo ? ` (${r.motivo})` : ''}` : ''}`;
    }
    return t;
  };

  // Aviso por ntfy (sin esperar; si falla, el semáforo sigue igual)
  const avisar = (texto) => {
    const tema = String(db.dellTema || '');
    if (!tema) return;
    fetch(`${ntfyBase().replace(/\/$/, '')}/${encodeURIComponent(tema)}`, { method: 'POST', body: texto, headers: { Title: 'Dell de Kennedy', Tags: 'rotating_light' }, signal: AbortSignal.timeout(5000) })
      .catch((e) => console.log('Dell: no se pudo mandar el aviso', e.message));
  };
  const revisar = () => {
    const c = chile();
    if (avisado.noche !== c.noche) { avisado.noche = c.noche; avisado.rojos = {}; avisado.caido = false; }
    if (!enHorario()) return;
    const sin = Date.now() - (ultimo ? ultimo.at : inicio) > SIN_LATIDO_MS;
    if (sin && !avisado.caido) { avisado.caido = true; avisar('El Dell de Kennedy no responde hace 2 min (apagado o sin internet)'); }
    if (!sin && ultimo) {
      const l = luces(); const t = textos();
      for (const k of COSAS) {
        if (k !== 'latido' && l[k] === 'rojo' && !avisado.rojos[k]) { avisado.rojos[k] = true; avisar(`Dell de Kennedy · ${NOMBRES[k]} en rojo: ${t[k]}`); }
      }
    }
  };

  app.post('/api/luces/latido', (req, res) => {
    const key = process.env.LUCES_CLAVE || '';
    const got = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!key || !got || got.length !== key.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key))) return fail(res, 401, 'Clave de las luces incorrecta');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const tema = String(b.avisoTema || '').trim();
    if (/^[A-Za-z0-9_-]{1,64}$/.test(tema) && tema !== db.dellTema) { db.dellTema = tema; save(); }
    const data = { ...b }; delete data.avisoTema; // el tema de los avisos nunca se muestra
    const n = num(((data.windows || {}).ultimoReinicio || {}).inesperados7d);
    const noche = chile().noche;
    if (n !== null && inesp[noche] === undefined) inesp[noche] = n;
    const volvio = avisado.caido && enHorario();
    ultimo = { at: Date.now(), data };
    if (volvio) { avisado.caido = false; avisar('El Dell de Kennedy volvió a responder'); }
    revisar();
    res.json({ ok: true });
  });

  app.get('/api/luces/salud', requireAdmin, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ recibido: ultimo ? ultimo.at : 0, segundos: ultimo ? Math.round((Date.now() - ultimo.at) / 1000) : null, latido: ultimo ? ultimo.data : null, luces: luces(), textos: textos(), nombres: NOMBRES, orden: COSAS, horario: enHorario(), avisos: !!db.dellTema });
  });

  const timer = setInterval(revisar, Number(process.env.DELL_REVISA_MS) || 15000);
  timer.unref();
  return { luces, revisar };
};
