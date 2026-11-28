// Programación de cada local: los bloques de la noche (música, previa, bingo, show, karaoke…) y el
// show de cada fecha. Sirve para anunciar en pantalla «A continuación…» y para la vista «Show».
// Se escribe en el mismo formato de la cartelera mensual, así basta con pegarla cada mes:
//   Jueves: 19:00 Música / 20:00 Previa / 20:30 Bingo / 21:00 Stand Up / Karaoke 22:00 / 00:30 fiesta
//   Jue 5 - Stand Up: ALEX ORTIZ
const TZ = 'America/Santiago';
const NIGHT_STARTS = 6; // la «noche» cambia a las 6 AM, igual que en el sistema de karaoke
const VENUES = { frida: 'Frida Kahlo', kennedy: 'Mercado Kennedy', tobalaba: 'Tobalaba' }; // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)

const DEFAULTS = {
  month: '2026-11',
  kennedy: `Jueves: 19:00 Música / 20:00 Previa / 20:30 Bingo / 21:00 Stand Up / Karaoke 22:00 / 00:30 fiesta
Viernes: 19:00 Música / 20:30 Previa / Piano 21:15 / Karaoke 22:15 / 00:30 fiesta
Sábado: 19:00 Música / 20:30 Previa / Show 21:00 / Karaoke 22:00 / 00:30 fiesta
Jue 5 - Stand Up: ALEX ORTIZ
Vie 6 - KARAOKE NIGHT SHOW + Piano Man
Sáb 7 - Banda Tributo a Joe Cocker
Jue 12 - Stand Up: KURT CARRERA
Vie 13 - KARAOKE NIGHT SHOW + Piano Man
Sáb 14 - Banda Tributo a Maná
Jue 19 - Stand Up: GONZALO TRUJILLO
Vie 20 - KARAOKE NIGHT SHOW + Piano Man
Sáb 21 - Especial Caribe Tropical
Jue 26 - Stand Up: DAVID PEREZ
Vie 27 - KARAOKE NIGHT SHOW + Piano Man
Sáb 28 - Banda Tributo a Bon Jovi`,
  tobalaba: `Viernes: 18:30 Música / 19:00 Previa / 19:30 Bingo / 20:15 Show / 21:15 Karaoke / 22:30 Cierre
Vier 06 - Especial Salsa (Miguel Angel Caballero)
Vier 13 - Especial 80's (Marcelo Durán)
Vier 20 - Especial México (Verónica Yañez)
Vier 27 - Especial Balada Italiana (Matias Fajardo)`,
  frida: `Viernes: 19:00 Música / 19:30 Previa en vivo + karaoke / 21:00 Dobles / 22:00 Karaoke y Fiesta / 00:00 Cierre
Sábado: 19:00 Música / 19:30 Previa en vivo + karaoke / 21:00 Dobles / 22:00 Karaoke y Fiesta / 00:00 Cierre
Domingo: 13:30 Música / 14:00 Bingo / 16:00 Cierre
Dom 1 - El Bingo de Frida
Vie 6 - Doble de Lucero
Sáb 7 - Doble de Pedro Fernández
Dom 8 - El Bingo de Frida
Vie 13 - Doble de Selena
Sáb 14 - Doble de Marco Antonio Solís
Dom 15 - El Bingo de Frida
Vie 20 - Doble de Shakira
Sáb 21 - Doble de Cristian Castro
Dom 22 - El Bingo de Frida
Vie 27 - Especial Caribe Tropical
Sáb 28 - Doble de Ricky Martin
Dom 29 - El Bingo de Frida`,
};

const plain = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const DAYS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
const dayIndex = (word) => DAYS.findIndex((d) => plain(word).startsWith(d));

// Convierte el texto de la cartelera en { blocks: {día: [{min, time, label}]}, shows: {díaDelMes: texto} }
function parse(text) {
  const blocks = {};
  const shows = {};
  for (const raw of String(text || '').split('\n')) {
    const line = raw.replace(/["“”]/g, '').trim();
    if (!line) continue;
    const show = line.match(/^([A-Za-zÁÉÍÓÚáéíóúñ]+)\.?\s+(\d{1,2})\s*[-–:]\s*(.+)$/);
    if (show && dayIndex(show[1]) >= 0) { shows[Number(show[2])] = show[3].trim(); continue; }
    const sched = line.match(/^([A-Za-zÁÉÍÓÚáéíóúñ]+)\s*:\s*(.+)$/);
    if (!sched || dayIndex(sched[1]) < 0) continue;
    const list = [];
    for (const part of sched[2].split('/')) {
      const m = part.match(/(\d{1,2})[:.](\d{2})/);
      if (!m) continue;
      const label = part.replace(m[0], '').replace(/\s+/g, ' ').trim();
      const h = Number(m[1]);
      // Las horas de la madrugada (00:30) pertenecen a la misma noche: se ordenan después de las 23:59
      list.push({ min: (h < NIGHT_STARTS ? h + 24 : h) * 60 + Number(m[2]), time: `${String(h).padStart(2, '0')}:${m[2]}`, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    if (list.length) blocks[dayIndex(sched[1])] = list.sort((a, b) => a.min - b.min);
  }
  return { blocks, shows };
}

// «Stand Up: KURT CARRERA» -> tipo chico arriba + nombre grande, con las mismas reglas del GC del show
function splitShow(text) {
  const t = String(text || '').replace(/^bingo\s*\+\s*/i, '').replace(/\s*\+\s*karaoke.*$/i, '').trim();
  if (!t) return null;
  const paren = t.match(/^(.+?)\s*\((.+)\)\s*$/);
  if (paren) return { kind: `Por ${paren[2].trim()}`, name: paren[1].trim() };
  const pre = t.match(/^(banda tributo a|tributo a|doble de|especial|stand up)\s*:?\s+(.+)$/i);
  if (pre) return { kind: pre[1].replace(/^./, (c) => c.toUpperCase()), name: pre[2].trim() };
  return { kind: '', name: t };
}
const isShowBlock = (label) => /show|stand up|dobles?|piano/.test(plain(label));
const SILENT = /cierre|musica/; // bloques que no se anuncian como «a continuación»

module.exports = function agenda({ app, db, save, requireAdmin, fail, currentVenue }) {
  db.agenda ||= {};
  db.agenda.notice = db.agenda.notice !== false; // el anuncio «A continuación» parte activado
  db.agenda.month ||= DEFAULTS.month;
  db.agenda.text ||= {};
  for (const v of Object.keys(VENUES)) if (db.agenda.text[v] == null) db.agenda.text[v] = DEFAULTS[v];

  // Fecha y hora de Chile de la «noche» en curso
  function nightNow() {
    const now = process.env.AGENDA_NOW ? new Date(process.env.AGENDA_NOW) : new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value]));
    const hour = Number(parts.hour);
    const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
    if (hour < NIGHT_STARTS) local.setUTCDate(local.getUTCDate() - 1); // antes de las 6 AM todavía es la noche anterior
    return { weekday: local.getUTCDay(), day: local.getUTCDate(), month: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`, min: (hour < NIGHT_STARTS ? hour + 24 : hour) * 60 + Number(parts.minute) };
  }

  function state() {
    const venue = currentVenue();
    const { blocks, shows } = parse(db.agenda.text[venue]);
    const n = nightNow();
    const today = blocks[n.weekday] || [];
    const show = n.month === db.agenda.month ? splitShow(shows[n.day]) : null;
    const withShow = today.map((b) => {
      const s = isShowBlock(b.label) && show ? show : null;
      // «Stand up: KURT CARRERA», «Doble de Selena», «Especial Salsa»…
      const title = !s ? b.label : !s.kind || /^por /i.test(s.kind) ? s.name : /^stand up$/i.test(s.kind) ? `${s.kind}: ${s.name}` : `${s.kind} ${s.name}`;
      return { time: b.time, min: b.min, label: title, isShow: isShowBlock(b.label) };
    });
    const current = [...withShow].reverse().find((b) => b.min <= n.min) || null;
    const next = withShow.find((b) => b.min > n.min && !SILENT.test(plain(b.label))) || null;
    const strip = (b) => (b ? { time: b.time, label: b.label, isShow: b.isShow, upcoming: b.min > n.min } : null);
    // Fecha de la noche en curso, como «VIERNES 20/11/26»
    const date = `${['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][n.weekday]} ${String(n.day).padStart(2, '0')}/${n.month.slice(5)}/${n.month.slice(2, 4)}`;
    return { venue, name: VENUES[venue], date, notice: db.agenda.notice, show, current: strip(current), next: strip(next), blocks: withShow.map(strip) };
  }

  app.get('/api/agenda', (_req, res) => res.json(state()));
  app.get('/api/agenda/config', requireAdmin, (_req, res) => res.json({ ...state(), month: db.agenda.month, text: db.agenda.text, venues: VENUES }));
  app.post('/api/agenda/config', requireAdmin, (req, res) => {
    const b = req.body || {};
    if (b.notice != null) db.agenda.notice = !!b.notice;
    if (b.month != null) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(b.month))) return fail(res, 400, 'El mes debe escribirse como 2026-11');
      db.agenda.month = String(b.month);
    }
    for (const v of Object.keys(VENUES)) {
      if ((b.text || {})[v] == null) continue;
      const text = String(b.text[v]).slice(0, 6000);
      if (text.trim() && !Object.keys(parse(text).blocks).length) return fail(res, 400, `No reconocí ningún horario en la programación de ${VENUES[v]}. Ejemplo: «Jueves: 19:00 Música / 20:30 Bingo / 21:00 Show»`);
      db.agenda.text[v] = text;
    }
    save();
    res.json({ ...state(), month: db.agenda.month, text: db.agenda.text, venues: VENUES });
  });

  // Horas de respaldo para la sala light (orden 9 de Code 0, pedido de Cote, 28 nov: «Usar las mismas horas del mes
  // anterior»): las de la cartelera pegada de ese local para un día de la semana (0 = domingo), sin el «Cierre»
  const horasDe = (venue, dow) => (parse(db.agenda.text[venue]).blocks[dow] || [])
    .filter((b) => !/^cierre\b/i.test(b.label))
    .map((b) => ({ time: b.time, label: b.label.toUpperCase() }));
  return { state, horasDe };
};
