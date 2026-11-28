// Programación KRB (Code 3, pedido de Cote, 23 nov): plataforma aparte, solo para Cote, para armar la cartelera y los
// turnos de cada mes marcando alternativas, y sacar los 3 archivos de siempre (Cartelera, Turnos Entretención, Turnos
// Cámaras y Editores) y el bloque de la hoja TURNOS de la GLOSA, que se envía a la GLOSA con un script.
// Es independiente de los juegos: su propia página (/programacion), su propia clave (PROG_USER y PROG_PASS en Render;
// mientras no estén, sirve la del moderador) y sus propios datos (programacion.json, junto a los datos de la sala).
// Los montos y los nombres del equipo se guardan solo en los datos, nunca en este repositorio (es público).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCALES = ['MK', 'TOB', 'FRIDA'];
const NOMBRE_LOCAL = { MK: 'Mercado Kennedy', TOB: 'Tobalaba', FRIDA: 'Frida Kahlo' };
const INSTAGRAM = { MK: 'www.instagram.com/krbstage', TOB: 'www.instagram.com/krbstage3', FRIDA: 'www.instagram.com/krbstage4' };
// Qué días abre cada local (0 = domingo … 6 = sábado)
const ABRE = { MK: [4, 5, 6], TOB: [5], FRIDA: [5, 6, 0] };
const CERRADOS = ['24-12', '25-12', '31-12', '1-1']; // los mismos de llenarMes
const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const titulo = (s) => s.charAt(0) + s.slice(1).toLowerCase();
// Tipos de show y cómo se escriben en la cartelera y en la GLOSA (criterios de los nombres de show)
const TIPOS = {
  standup: 'Stand Up', piano: 'Piano Man', tributo: 'Tributo', doble: 'Doble', bingo: 'Los juegos de…', otro: 'Especial u otro',
};
const ROLES = ['dj', 'extra', 'cantante', 'animador', 'camH', 'camHx', 'camV', 'camVx', 'editor'];
// Los pasos del asistente para prellenar el mes, en el orden que pidió Cote (23 nov)
const PASOS = [
  { id: 'Oscar', nombre: 'Oscar', tipo: 'fijo' }, { id: 'Fer', nombre: 'Fer', tipo: 'fijo' },
  { id: 'mati', nombre: 'Matías', tipo: 'viernes' }, { id: 'dispPriss', nombre: 'Priss', tipo: 'disp' }, { id: 'dispKony', nombre: 'Kony', tipo: 'disp' },
];
const AREA = { dj: 'dj', extra: 'ent', cantante: 'ent', animador: 'ent', camH: 'camH', camHx: 'camH', camV: 'camV', camVx: 'camV', editor: 'edi' };
const SIN_PAGO = ['COTE']; // Cote, 23 nov: «todo lo que sea Cote no se anota»
const ROL_TARIFA = { dj: 'ent', extra: 'ent', cantante: 'ent', animador: 'ent', camH: 'cam', camHx: 'cam', camV: 'cam', camVx: 'cam', editor: 'edi' };

const pad = (n) => String(n).padStart(2, '0');
const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const clean = (s, n = 80) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const parse = (f) => { const [y, m, d] = f.split('-').map(Number); return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
const addDays = (f, n) => { const x = parse(f); const t = new Date(Date.UTC(x.y, x.m - 1, x.d + n)); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
// Semana de lunes a domingo (para separar con una línea en blanco)
const semana = (f) => { const x = parse(f); return addDays(f, -((x.wd + 6) % 7)); };
const cerradoFijo = (f) => { const x = parse(f); return CERRADOS.includes(`${x.d}-${x.m}`); };

module.exports = function programacion({ app, dir }) {
  const FILE = process.env.PROG_FILE || path.join(dir, 'programacion.json');
  let P = {};
  try { P = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* primera vez */ }
  P.ajustes ||= {}; P.dias ||= {}; P.personas ||= []; P.tarifas ||= []; P.horarios ||= {}; P.glosa ||= {}; P.asist ||= {};
  // Semana tipo (criterio de noviembre que dijo Cote, 23 nov): con qué se prellena cada día y local. Cote la confirma o
  // la cambia al empezar cada mes. Solo nombres cortos; los montos nunca van aquí.
  P.plantilla ||= {
    '4|MK': { dj: 'Oscar', cantante: 'Fer', animador: 'Gonzalo', camH: 'Caro', camHx: 'Fer', camV: 'Liza', editor: 'Meni' },
    '5|MK': { dj: 'Fer', camV: 'Guille', camNota: '22:30', editor: 'Meni' },
    '5|TOB': { dj: 'Oscar', cantante: 'Andrés', animador: 'Gonzalo', camH: 'Andrés', camV: 'Vero', editor: 'Vero' },
    '5|FRIDA': { dj: 'Nico', camH: 'Caro', camV: 'Guille', camNota: '21 a 22', editor: 'Vero' },
    '6|MK': { dj: 'Oscar', cantante: 'Fer', camV: 'Guille', editor: 'Meni' },
    '6|FRIDA': { dj: 'Nico', camH: 'Caro', camV: 'Vero', editor: 'Meni' },
    '0|FRIDA': { dj: 'Nico', cantante: 'Gonzalo', camH: 'Guille', camV: 'Liza', editor: 'Meni' },
  };
  if (!P.glosa.clave) P.glosa.clave = crypto.randomBytes(12).toString('hex');
  let timer = null; let pendiente = false;
  const save = () => {
    clearTimeout(timer); pendiente = true;
    timer = setTimeout(() => {
      pendiente = false;
      fs.writeFile(`${FILE}.tmp`, JSON.stringify(P), (err) => { if (!err) fs.rename(`${FILE}.tmp`, FILE, () => {}); });
    }, 300);
  };
  // Si el servidor se apaga (por ejemplo, al publicar) con un cambio recién hecho, se guarda antes de cerrar
  process.on('exit', () => {
    if (!pendiente) return;
    try { fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(P)); fs.renameSync(`${FILE}.tmp`, FILE); } catch (e) { console.error('Programación: no se pudo guardar al salir', e.message); }
  });
  save();

  // ---------- Acceso (clave propia) ----------
  const USER = process.env.PROG_PASS ? (process.env.PROG_USER || 'cote') : (process.env.ADMIN_USER || '');
  const PASS = process.env.PROG_PASS || process.env.ADMIN_PASS || '';
  const READY = Boolean(USER && PASS);
  const KEY = crypto.createHash('sha256').update(`programacion:${USER}:${PASS}`).digest();
  const sha = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
  const sign = (exp) => crypto.createHmac('sha256', KEY).update(String(exp)).digest('hex');
  const valid = (t) => {
    if (!READY || typeof t !== 'string') return false;
    const [exp, sig] = t.split('.');
    return Number(exp) > Date.now() && Boolean(sig) && crypto.timingSafeEqual(sha(sig), sha(sign(exp)));
  };
  const fail = (res, code, error) => res.status(code).json({ error });
  const auth = (req, res, next) => (valid(req.get('x-prog')) ? next() : fail(res, 401, 'Entra con tu clave'));
  const tries = {};

  const page = (_req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(__dirname, 'public', 'programacion.html'));
  app.get('/programacion', page);
  // Con su propia dirección (por ejemplo programacion.krbstage.cl) abre directo la plataforma
  app.get('/', (req, res, next) => (/^(programacion|cartelera|turnos)\./i.test(req.hostname || '') ? page(req, res) : next()));

  app.post('/api/prog/login', (req, res) => {
    if (!READY) return fail(res, 503, 'Falta configurar la clave en el servidor');
    const a = (tries[req.ip] ||= { n: 0, until: 0 });
    if (Date.now() < a.until) return fail(res, 429, 'Demasiados intentos. Espera 10 minutos.');
    const b = req.body || {};
    const ok = crypto.timingSafeEqual(sha(b.user), sha(USER)) & crypto.timingSafeEqual(sha(b.pass), sha(PASS));
    if (!ok) { if (++a.n >= 8) { a.n = 0; a.until = Date.now() + 10 * 60e3; } return fail(res, 401, 'Usuario o clave incorrectos'); }
    delete tries[req.ip];
    const exp = Date.now() + 30 * 24 * 3600e3;
    res.json({ token: `${exp}.${sign(exp)}` });
  });

  // ---------- Personas y tarifas ----------
  const codigoDe = (nombre) => {
    const p = P.personas.find((x) => plain(x.nombre) === plain(nombre));
    return p ? p.codigo : plain(nombre);
  };
  const persona = (nombre, rol) => {
    nombre = clean(nombre, 40);
    if (!nombre) return;
    let p = P.personas.find((x) => plain(x.nombre) === plain(nombre));
    if (!p) { p = { nombre, codigo: plain(nombre), roles: [] }; P.personas.push(p); }
    if (rol && !p.roles.includes(rol)) p.roles.push(rol);
  };
  // La tarifa más específica: día de la semana, local y persona (o «todos»)
  function tarifa(codigo, rol, local, wd) {
    let best = null; let score = -1;
    for (const t of P.tarifas) {
      if (t.rol !== rol) continue;
      if (t.persona !== codigo && t.persona !== '*') continue;
      if (t.local !== local && t.local !== '*') continue;
      if (String(t.dia) !== String(wd) && t.dia !== '*') continue;
      // Gana la más específica en día y local; con el mismo día y local, la de la persona. Así una regla general como
      // «Todos · Cámara · Kennedy · Viernes» (el karaoke, Cote, 23 nov) vale para todos, salvo quien tenga una propia de ese mismo día y local
      const s = (t.dia !== '*' ? 4 : 0) + (t.local === local ? 2 : 0) + (t.persona === codigo ? 1 : 0);
      if (s >= score) { score = s; best = t; }
    }
    return best ? Number(best.monto) || 0 : null;
  }

  // ---------- Celdas (un local en una fecha) ----------
  // Días que no se trabaja (Cote, 23 nov): se marcan por mes en «Prellenar» (A.cerrados); si el mes aún no los tiene
  // marcados, valen los de siempre (24 y 25 de diciembre, 31 de diciembre y 1 de enero)
  const cerrado = (f) => { const a = P.asist[f.slice(0, 7)]; return a && Array.isArray(a.cerrados) ? a.cerrados.includes(f) : cerradoFijo(f); };
  const abreDefault = (f, local) => !cerrado(f) && ABRE[local].includes(parse(f).wd);
  const celda = (f, local) => ((P.dias[f] || {})[local]) || {};
  const abierto = (f, local) => { const c = celda(f, local); return typeof c.abierto === 'boolean' ? c.abierto : abreDefault(f, local); };
  const limpiaShow = (s) => {
    s = s || {};
    const tipo = TIPOS[s.tipo] ? s.tipo : '';
    if (!tipo) return null;
    const o = { tipo, nombre: clean(s.nombre, 80), artista: clean(s.artista, 60), banda: Boolean(s.banda) };
    // Para la contadora (Cote, 23 nov): a nombre de quién se paga el show y su monto (variable, show por show)
    const per = clean(s.persona, 60); if (per) o.persona = per;
    if (s.monto !== '' && s.monto != null && Number.isFinite(Number(s.monto))) o.monto = Math.max(0, Math.round(Number(s.monto)));
    return o;
  };
  function limpiaCelda(c) {
    c = c || {};
    const o = {};
    if (typeof c.abierto === 'boolean') o.abierto = c.abierto;
    const sh = limpiaShow(c.show);
    if (sh) o.show = sh;
    // Nombres limpios (Cote, 23 nov: «Caro», no «Caro (Guille)»; «Claudia», no «Claudia 1.5»). En cámaras, el nombre
    // entre paréntesis es un turno extra de un turno que normalmente hace otra persona: queda aparte (camHx, camVx)
    for (const r of ROLES) {
      if (r === 'camHx' || r === 'camVx') continue; // van más abajo
      let v = clean(c[r], 60).replace(/\s*[x×*]?\s*\d+(?:[.,]\d+)?\s*$/i, '');
      const x = v.match(/^(.+?)\s*\(([^)]*)\)\s*(.*)$/);
      if (x) {
        v = `${x[1]} ${x[3]}`.trim().replace(/\s*[x×*]?\s*\d+(?:[.,]\d+)?\s*$/i, '');
        const p = clean(x[2], 40);
        if (p && !/\d/.test(p)) { if ((r === 'camH' || r === 'camV') && !c[`${r}x`]) o[`${r}x`] = p; else if (r === 'dj' && !c.extra) o.extra = p; }
      }
      v = clean(v, 40);
      if (v) o[r] = v;
    }
    for (const k of ['camHx', 'camVx']) { const v = clean(c[k], 40).replace(/\s*\(.*$/, '').replace(/\s*[x×*]?\s*\d+(?:[.,]\d+)?\s*$/i, ''); if (v && o[k.slice(0, 4)]) o[k] = v; }
    for (const k of ['showPor', 'camNota']) { const v = clean(c[k], 40); if (v) o[k] = v; }
    if (c.montos && typeof c.montos === 'object') {
      const m = {};
      for (const r of ROLES) if (c.montos[r] !== '' && c.montos[r] != null && Number.isFinite(Number(c.montos[r]))) m[r] = Math.max(0, Math.round(Number(c.montos[r])));
      if (Object.keys(m).length) o.montos = m;
    }
    return o;
  }
  const setCelda = (f, local, c) => {
    P.dias[f] ||= {};
    P.dias[f][local] = limpiaCelda(c);
    for (const r of ROLES) if (P.dias[f][local][r]) persona(P.dias[f][local][r], ROL_TARIFA[r]);
    for (const k of ['camHx', 'camVx']) if (P.dias[f][local][k]) persona(P.dias[f][local][k], 'cam');
  };
  // Una vez al abrir: limpia los nombres que ya estaban guardados con agregados y saca esas «personas» de la lista
  {
    const sucio = (n) => /[()]|\d/.test(String(n || ''));
    let n = 0;
    for (const [f, d] of Object.entries(P.dias)) for (const l of Object.keys(d)) {
      const antes = JSON.stringify(d[l]);
      setCelda(f, l, d[l]);
      if (JSON.stringify(P.dias[f][l]) !== antes) n++;
    }
    const antes = P.personas.length;
    P.personas = P.personas.filter((p) => !sucio(p.nombre));
    if (n || antes !== P.personas.length) console.log(`Programación: nombres limpiados en ${n} días y ${antes - P.personas.length} personas`);
  }

  // ---------- Fechas de un mes ----------
  // Jueves a domingo del mes, solo los días del mes (Cote, 23 nov: sin los días de cortesía del mes anterior)
  function fechasMes(y, m) {
    const out = [];
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= ultimo; d++) { const f = ymd(y, m, d); if ([4, 5, 6, 0].includes(parse(f).wd)) out.push({ fecha: f, cortesia: false }); }
    return out;
  }
  const mesDe = (q) => {
    const x = String(q || '').match(/^(\d{4})-(\d{1,2})$/);
    if (x && +x[2] >= 1 && +x[2] <= 12) return { y: +x[1], m: +x[2] };
    const now = new Date(Date.now() - 3 * 3600e3);
    return { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
  };

  // ---------- Cómo se escribe cada show ----------
  // «El Bingo de…» pasó a ser «Los juegos de» + el local (Cote, 23 nov)
  const JUEGOS_DE = { MK: 'Mercado Kennedy', TOB: 'Tobalaba', FRIDA: 'Frida' };
  const losJuegos = (local) => `Los juegos de ${JUEGOS_DE[local] || 'Frida'}`;
  function showGlosa(s, local) {
    if (!s) return '';
    if (s.tipo === 'standup') return `Stand Up: ${plain(s.nombre) ? s.nombre.toUpperCase() : ''}`.trim();
    if (s.tipo === 'piano') return 'Piano Man';
    if (s.tipo === 'bingo') return losJuegos(local);
    // En la GLOSA el artista va entre comillas (Cote, 24 nov: su script del GC lo muestra; lo que va entre paréntesis
    // es la cuenta a transferir y no sale en pantalla)
    return [s.nombre, s.artista ? `"${s.artista}"` : ''].filter(Boolean).join(' ');
  }
  // En la GLOSA el show lleva entre paréntesis el nombre de la persona a quien se le paga (Cote, 23 nov)
  // En Tobalaba, el nombre entre paréntesis del especial ya es la persona a quien se le paga (Cote, 24 nov): no se repite
  const showGlosaPago = (s, local) => {
    const per = s && s.persona && s.persona !== s.artista ? s.persona : '';
    return [showGlosa(s, local), per ? `(${per})` : ''].filter(Boolean).join(' ');
  };
  function showCartelera(s, local) {
    if (!s) return '';
    let t;
    if (s.tipo === 'standup') t = `Stand Up: ${(s.nombre || '').toUpperCase()}`;
    else if (s.tipo === 'piano') t = 'KARAOKE NIGHT SHOW + Piano Man';
    else if (s.tipo === 'tributo') t = `${s.banda ? 'Banda Tributo a' : 'Tributo a'} ${s.nombre}`;
    else if (s.tipo === 'doble') t = `Doble de ${s.nombre}`;
    else if (s.tipo === 'bingo') t = losJuegos(local);
    else t = [s.nombre, s.artista ? `(${s.artista})` : ''].filter(Boolean).join(' ');
    return local === 'TOB' ? `BINGO + ${t}` : t; // sin «+ Karaoke» (Cote, 24 nov)
  }
  const interno = (s) => Boolean(s) && (s.tipo === 'bingo' || /bingo|juego/i.test(`${s.nombre || ''}`));
  const showVacio = (s) => !s || (!['piano', 'bingo'].includes(s.tipo) && !clean(s.nombre));

  // ---------- Los 3 archivos y el bloque de TURNOS ----------
  const DIA_TURNO = { 4: 'Jue', 5: 'Vier', 6: 'Sab', 0: 'Dom' };
  const DIA_CART = { 4: 'Jue', 5: 'Vie', 6: 'Sáb', 0: 'Dom' };
  const etiquetaTurno = (f, cortesia) => { const x = parse(f); return cortesia ? `(${DIA_TURNO[x.wd]} ${x.d} ${MES_CORTO[x.m - 1]})` : `${DIA_TURNO[x.wd]} ${pad(x.d)}`; };
  const ETQ = { MK: 'MK', TOB: 'Tob', FRIDA: 'Frida' };
  const etqCam = (local, wd) => (local === 'MK' && wd === 5 ? 'MK Karaoke' : ETQ[local]);
  const etqEdi = (local, wd) => (local === 'MK' && wd === 5 ? 'MK Karaoke' : local === 'FRIDA' && wd === 0 ? 'Frida Bingo' : ETQ[local]);
  const ORDEN_ENT = { 4: ['MK', 'FRIDA', 'TOB'], 5: ['MK', 'FRIDA', 'TOB'], 6: ['MK', 'FRIDA', 'TOB'], 0: ['MK', 'FRIDA', 'TOB'] };
  const ORDEN_CAM = { 4: ['MK', 'FRIDA', 'TOB'], 5: ['FRIDA', 'MK', 'TOB'], 6: ['MK', 'FRIDA', 'TOB'], 0: ['FRIDA', 'MK', 'TOB'] };
  const ORDEN_EDI = { 4: ['MK', 'FRIDA', 'TOB'], 5: ['MK', 'FRIDA', 'TOB'], 6: ['FRIDA', 'MK', 'TOB'], 0: ['FRIDA', 'MK', 'TOB'] };
  // Junta las líneas por día y separa las semanas con una línea en blanco
  function porDias(fechas, linea) {
    const out = []; let sem = null;
    for (const { fecha, cortesia } of fechas) {
      const ls = linea(fecha, cortesia);
      if (!ls.length) continue;
      const s = semana(fecha);
      if (sem && s !== sem) out.push('');
      sem = s;
      out.push(etiquetaTurno(fecha, cortesia), ...ls);
    }
    return out;
  }
  const lineaEnt = (f) => {
    const wd = parse(f).wd;
    return ORDEN_ENT[wd].filter((l) => abierto(f, l)).map((l) => {
      const c = celda(f, l);
      const dj = c.dj ? c.dj + (c.extra ? ` (${c.extra})` : '') : '';
      const ns = [dj, c.cantante, c.animador].filter(Boolean);
      if (!ns.length) return '';
      return `${ETQ[l]}: ${ns.join(' - ')}${c.showPor ? ` (${c.showPor} Show)` : ''}`;
    }).filter(Boolean);
  };
  const lineaCam = (f) => {
    const wd = parse(f).wd;
    return ORDEN_CAM[wd].filter((l) => abierto(f, l)).map((l) => {
      const c = celda(f, l);
      const ns = [c.camH && c.camH + (c.camHx ? ` (${c.camHx})` : ''), c.camV && c.camV + (c.camVx ? ` (${c.camVx})` : '')].filter(Boolean);
      return ns.length ? `${etqCam(l, wd)}: ${ns.join(' - ')}${c.camNota ? ` (${c.camNota})` : ''}` : '';
    }).filter(Boolean);
  };
  const lineaEdi = (f) => {
    const wd = parse(f).wd;
    return ORDEN_EDI[wd].filter((l) => abierto(f, l)).map((l) => { const c = celda(f, l); return c.editor ? `${etqEdi(l, wd)}: ${c.editor}` : ''; }).filter(Boolean);
  };
  // Quién se paga en una celda y cuánto (en el orden del bloque de TURNOS)
  function pagos(f, l) {
    const c = celda(f, l); const wd = parse(f).wd;
    const out = []; const vistos = new Set();
    for (const r of ROLES) {
      if (!c[r]) continue;
      const cod = codigoDe(c[r]);
      if (SIN_PAGO.includes(cod)) continue; // Cote no se anota (no tiene tarifa)
      const fijo = c.montos && c.montos[r] != null ? c.montos[r] : null;
      const monto = fijo != null ? fijo : tarifa(cod, ROL_TARIFA[r], l, wd);
      // Quien está en entretención y en cámara (Andrés en Tobalaba, que anima y graba) se paga una vez, salvo que su
      // cámara tenga monto o tarifa propia (Guille en Tobalaba: entretención y cámara, Cote, 23 nov)
      if (r !== 'editor' && vistos.has(cod) && monto == null) continue;
      if (r !== 'editor') vistos.add(cod);
      if (r === 'extra' && monto == null) continue; // en capacitación: solo se paga si tiene tarifa o monto
      out.push({ rol: r, nombre: c[r], codigo: cod, monto, falta: monto == null });
    }
    return out;
  }
  function archivos(y, m) {
    const fechas = fechasMes(y, m);
    const delMes = fechas.filter((x) => !x.cortesia);
    const MES = MESES[m - 1]; const Mes = titulo(MES);
    const faltan = [];
    // Cartelera
    const cart = [`${pad(m)} CARTELERA ${MES} ${y}`, ''];
    const H = P.horarios;
    const secCart = (local, enc1, enc2) => {
      cart.push(`${enc1} ${MES}`, ...String(H[local] || '').split('\n').map((s) => s.trimEnd()).filter((s, i, a) => s || (i > 0 && i < a.length - 1)), '');
      cart.push(`${enc2} ${MES}`);
      let sem = null;
      for (const { fecha } of delMes) {
        if (!abierto(fecha, local)) continue;
        const c = celda(fecha, local); const x = parse(fecha);
        if (showVacio(c.show)) { faltan.push(`${etiquetaTurno(fecha)} ${ETQ[local]}: falta el show`); continue; }
        const s = semana(fecha);
        if (local !== 'TOB' && sem && s !== sem) cart.push('');
        sem = s;
        const dia = local === 'TOB' ? `Vier ${pad(x.d)}` : `${DIA_CART[x.wd]} ${x.d}`;
        cart.push(`${dia} - ${showCartelera(c.show, local)}`);
      }
      cart.push(`Registros en: ${INSTAGRAM[local]}`, '');
    };
    secCart('MK', 'MERCADO KENNEDY', 'KENNEDY');
    secCart('TOB', 'TOBALABA', 'TOBALABA');
    secCart('FRIDA', 'FRIDA KAHLO', 'FRIDA KAHLO');
    while (cart[cart.length - 1] === '') cart.pop();
    // Lo obligado (Cote, 23 nov): Oscar y Fer, tres días cada semana; Matías, dos viernes al mes
    const semanas = {};
    for (const { fecha } of delMes) ((semanas[semana(fecha)] ||= [])).push(fecha);
    const trabaja = (f, q) => LOCALES.some((l) => abierto(f, l) && ['dj', 'extra', 'cantante', 'animador', 'camH', 'camV'].some((k) => celda(f, l)[k] === q));
    for (const fs of Object.values(semanas)) {
      // Solo semanas completas (jueves, viernes y sábado en el mes) y sin días cerrados: en esas semanas la regla no corre
      if (![4, 5, 6].every((wd) => fs.some((f) => parse(f).wd === wd))) continue;
      if (fs.some((f) => cerrado(f))) continue;
      for (const q of ['Oscar', 'Fer']) { const n = fs.filter((f) => trabaja(f, q)).length; if (n < 3) faltan.push(`Semana del ${parse(fs[0]).d}: ${q} tiene ${n} ${n === 1 ? 'día' : 'días'} (deben ser 3)`); }
    }
    const nMati = delMes.filter(({ fecha }) => parse(fecha).wd === 5 && trabaja(fecha, 'Mati')).length;
    if (nMati !== 2) faltan.push(`Matías tiene ${nMati} ${nMati === 1 ? 'viernes' : 'viernes'} este mes (deben ser 2)`);
    // Turnos
    const ent = [`${pad(m)} Turnos Entretención ${Mes} ${y}`, '', ...porDias(fechas, lineaEnt)];
    const cam = [`${pad(m)} Turnos Cámaras y Editores ${Mes} ${String(y).slice(2)}`, '', ...porDias(fechas, lineaCam), '', `Editores ${Mes}:`, ...porDias(delMes, lineaEdi)];
    // Bloque de la hoja TURNOS de la GLOSA (y las mismas filas ya separadas, para enviarlas por el script)
    const pest = `${MES}${String(y).slice(2)} MASTER TOTAL`;
    const filas = [['MES', String(m), 'AÑO', String(y), 'PESTAÑA', pest], [], ['DIA', 'LOCAL', 'TURNOS']];
    const detalle = [];
    for (const { fecha } of delMes) {
      for (const l of ['MK', 'FRIDA', 'TOB']) {
        if (!abierto(fecha, l)) continue;
        const ps = pagos(fecha, l);
        ps.filter((p) => p.falta).forEach((p) => faltan.push(`${etiquetaTurno(fecha)} ${ETQ[l]}: falta la tarifa de ${p.nombre} (${ROL_TARIFA[p.rol] === 'ent' ? 'entretención' : ROL_TARIFA[p.rol] === 'cam' ? 'cámara' : 'edición'})`));
        if (ps.length) filas.push([String(parse(fecha).d), l, ps.map((p) => `${p.codigo} ${p.monto || 0}`).join(', ')]);
        // Lo mismo con el área de cada uno, para que el script lo ponga en su sección de la lista (Cote, 24 nov)
        ps.forEach((p) => detalle.push({ dia: parse(fecha).d, local: l, codigo: p.codigo, monto: p.monto || 0, area: AREA[p.rol] }));
      }
    }
    filas.push([]);
    const shows = [];
    for (const l of ['MK', 'TOB', 'FRIDA']) {
      for (const { fecha } of delMes) {
        const c = celda(fecha, l);
        if (!abierto(fecha, l) || showVacio(c.show)) continue;
        const f = [String(parse(fecha).d), l, 'SHOW', showGlosaPago(c.show, l)];
        if (c.show.banda && c.show.tipo === 'tributo') f.push('BANDA'); // solo «Banda tributo» lleva batería (Cote, 23 nov)
        filas.push(f);
        if (interno(c.show)) continue; // el bingo y los juegos son internos: no se le paga a nadie de afuera (Cote, 23 nov)
        if (c.show.monto == null) faltan.push(`${etiquetaTurno(fecha)} ${ETQ[l]}: falta el monto del show`);
        // Bloque del día en la pestaña del mes (el mismo orden de jueves a domingo que usa llenarMes)
        else shows.push({ dia: parse(fecha).d, local: l, monto: c.show.monto });
      }
    }
    const turnos = filas.map((f) => f.join('-')).join('\n');
    // Los 20 bloques de la pestaña del mes: 5 semanas de jueves a domingo (Cote, 23 nov: el domingo 1 de noviembre va en
    // la cuarta celda de la semana 1 y la semana 2 parte el jueves 5)
    const POS = { 4: 0, 5: 1, 6: 2, 0: 3 };
    const bloques = Array(20).fill(null); const jueves = [];
    for (const { fecha } of delMes) {
      const x = parse(fecha);
      const j = addDays(fecha, -(x.wd === 0 ? 3 : x.wd - 4));
      if (!jueves.includes(j)) jueves.push(j);
      const k = (jueves.length - 1) * 4 + POS[x.wd];
      if (k < 20) bloques[k] = { d: x.d, wd: x.wd };
    }
    return {
      mes: `${y}-${pad(m)}`, pestana: pest, anterior: `${MESES[(m + 10) % 12]}${String(m === 1 ? y - 1 : y).slice(2)} MASTER TOTAL`, b8: `${MES}${String(y).slice(2)}`,
      cartelera: cart.join('\n'), entretencion: ent.join('\n'), camaras: cam.join('\n'), turnos, filas, detalle, shows, bloques, mesNum: m, anio: y, faltan: [...new Set(faltan)],
    };
  }

  // ---------- Leer los textos de siempre (para cargar un mes ya hecho) ----------
  const LOC_ETQ = (s) => {
    const t = plain(s);
    if (/^MK|KENNEDY/.test(t)) return 'MK';
    if (/^TOB/.test(t)) return 'TOB';
    if (/^FRI/.test(t)) return 'FRIDA';
    return '';
  };
  const RE_DIA = /^\(?\s*(jue|vie|vier|sab|sáb|dom)[a-zé]*\.?\s+(\d{1,2})(?:\s+([a-zé]{3})[a-zé]*)?\s*\)?\s*$/i;
  function fechaDe(match, y, m) {
    const d = Number(match[2]);
    let mm = m; let yy = y;
    if (match[3]) {
      const i = MES_CORTO.findIndex((x) => plain(x) === plain(match[3]));
      if (i >= 0) { mm = i + 1; if (mm > m + 6) yy = y - 1; }
    }
    return ymd(yy, mm, d);
  }
  const unLocal = (f) => { const ls = LOCALES.filter((l) => abreDefault(f, l)); return ls.length === 1 ? ls[0] : ''; };
  function leerTurnos(texto, y, m, cada) {
    let fecha = null;
    for (const raw of String(texto || '').split('\n')) {
      const s = raw.trim();
      if (!s || /^\d{1,2}\s+turnos/i.test(s)) continue;
      const d = s.match(RE_DIA);
      if (d) { fecha = fechaDe(d, y, m); continue; }
      if (!fecha) continue;
      const x = s.match(/^([^:]+):\s*(.+)$/);
      const local = x ? LOC_ETQ(x[1]) : unLocal(fecha);
      if (!local) continue;
      cada(fecha, local, (x ? x[2] : s).trim(), x ? x[1] : '');
    }
  }
  function leerShowCartelera(t, local) {
    t = t.trim();
    if (local === 'TOB') t = t.replace(/^BINGO\s*\+\s*/i, '').replace(/\s*\+\s*Karaoke\s*$/i, '');
    let x;
    if ((x = t.match(/^Stand Up:\s*(.+)$/i))) return { tipo: 'standup', nombre: x[1].trim() };
    if (/piano man/i.test(t)) return { tipo: 'piano' };
    if (/bingo de frida|^los juegos de/i.test(t)) return { tipo: 'bingo' };
    if ((x = t.match(/^Banda Tributo a\s+(.+)$/i))) return { tipo: 'tributo', nombre: x[1].trim(), banda: true };
    if ((x = t.match(/^Tributo a\s+(.+)$/i))) return { tipo: 'tributo', nombre: x[1].trim() };
    if ((x = t.match(/^Doble de\s+(.+)$/i))) return { tipo: 'doble', nombre: x[1].trim() };
    if ((x = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/))) return { tipo: 'otro', nombre: x[1].trim(), artista: x[2].trim() };
    return { tipo: 'otro', nombre: t };
  }
  function leerShowGlosa(t, banda, local, wd) {
    t = String(t || '').trim();
    let x;
    // Formato nuevo (Cote, 24 nov): «Especial Salsa "Miguel Ángel Caballero" (cuenta a transferir)»
    let persona = '';
    if ((x = t.match(/^(.*?)\s*\(([^()]+)\)\s*$/)) && (/"[^"]+"/.test(x[1]) || local !== 'TOB')) { persona = x[2].trim(); t = x[1].trim(); }
    const q = t.match(/^(.*?)\s*["“”«]([^"“”»]+)["“”»]\s*$/);
    if (q) { const o = { tipo: 'otro', nombre: q[1].trim(), artista: q[2].trim() }; if (persona) o.persona = persona; return o; }
    const con = (o) => (persona ? { ...o, persona } : o);
    if ((x = t.match(/^Stand Up:\s*(.+)$/i))) return con({ tipo: 'standup', nombre: x[1].trim() });
    if (/^piano man$/i.test(t)) return { tipo: 'piano' };
    if (/^(bingo de frida|los juegos de .+)$/i.test(t)) return { tipo: 'bingo' };
    if (banda) return con({ tipo: 'tributo', nombre: t, banda: true });
    if (/^especial/i.test(t) || local === 'TOB') { x = t.match(/^(.+?)\s*\(([^)]+)\)\s*$/); return x ? { tipo: 'otro', nombre: x[1].trim(), artista: x[2].trim() } : { tipo: 'otro', nombre: t }; }
    if (local === 'FRIDA' && (wd === 5 || wd === 6)) return con({ tipo: 'doble', nombre: t });
    if (local === 'MK' && wd === 6) return con({ tipo: 'tributo', nombre: t });
    return con({ tipo: 'otro', nombre: t });
  }
  // Filas de la hoja TURNOS: [día, local, lista | 'SHOW', show, 'BANDA']
  const filasDeBloque = (txt) => String(txt || '').split('\n').map((s) => s.trim()).filter((s) => /^\d{1,2}-/.test(s)).map((s) => {
    const p = s.split('-');
    return p[2] && p[2].trim().toUpperCase() === 'SHOW' ? [p[0], p[1], 'SHOW', p.slice(3, p[p.length - 1].trim().toUpperCase() === 'BANDA' && p.length > 4 ? -1 : undefined).join('-'), p.length > 4 && p[p.length - 1].trim().toUpperCase() === 'BANDA' ? 'BANDA' : ''] : [p[0], p[1], p.slice(2).join('-')];
  });
  function importar(b) {
    const { y, m } = mesDe(b.mes);
    const tocadas = new Set();
    const cel = (f, l) => { P.dias[f] ||= {}; P.dias[f][l] ||= {}; tocadas.add(`${f}|${l}`); return P.dias[f][l]; };
    // Cartelera: horarios y shows
    if (b.cartelera) {
      let local = ''; let horario = null; let enShows = false;
      const cerrar = () => { if (local && horario && horario.some(Boolean)) P.horarios[local] = horario.join('\n').trim(); horario = null; };
      for (const raw of String(b.cartelera).split('\n')) {
        const s = raw.trim();
        if (/^\d{1,2}\s+CARTELERA/i.test(s)) continue;
        const enc = s.match(/^(MERCADO KENNEDY|KENNEDY|TOBALABA|FRIDA KAHLO|FRIDA)\s+([A-ZÉ]+)$/);
        if (enc && MESES.includes(plain(enc[2]))) { cerrar(); local = LOC_ETQ(enc[1]); horario = []; enShows = false; continue; }
        if (!local) continue;
        if (/^Registros en:/i.test(s)) continue;
        const sh = s.match(/^(jue|vie|vier|sab|sáb|dom)[a-zé]*\.?\s+(\d{1,2})\s+-\s+(.+)$/i);
        if (sh) {
          if (!enShows) { horario = null; enShows = true; }
          const f = ymd(y, m, Number(sh[2]));
          const c = cel(f, local); c.show = limpiaShow(leerShowCartelera(sh[3], local)); c.abierto = true;
          continue;
        }
        if (horario) horario.push(raw.trimEnd());
      }
      cerrar();
    }
    if (b.entretencion) {
      leerTurnos(b.entretencion, y, m, (f, l, t) => {
        const c = cel(f, l); c.abierto = true;
        let x = t.match(/\(([^)]+?)\s+Show\)\s*$/i);
        if (x) { c.showPor = x[1].trim(); t = t.slice(0, x.index).trim(); } else delete c.showPor;
        const ps = t.split(/\s+-\s+/).map((s) => s.trim());
        x = (ps[0] || '').match(/^(.+?)\s*\(([^)]+)\)$/);
        c.dj = x ? x[1] : ps[0]; if (x) c.extra = x[2]; else delete c.extra;
        if (ps[1]) c.cantante = ps[1]; else delete c.cantante;
        if (ps[2]) c.animador = ps[2]; else delete c.animador;
      });
    }
    if (b.camaras) {
      const [cams, edis] = String(b.camaras).split(/^\s*editores[^\n]*$/im);
      leerTurnos(cams, y, m, (f, l, t) => {
        const c = cel(f, l); c.abierto = true;
        const x = t.match(/\(([^)]*\d[^)]*)\)\s*$/); // el horario lleva números; un nombre entre paréntesis es turno extra
        if (x) { c.camNota = x[1].trim(); t = t.slice(0, x.index).trim(); } else delete c.camNota;
        const ps = t.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
        delete c.camHx; delete c.camVx;
        if (ps.length >= 2) { c.camH = ps[0]; c.camV = ps[1]; } else { delete c.camH; c.camV = ps[0]; }
      });
      if (edis) leerTurnos(edis, y, m, (f, l, t) => { const c = cel(f, l); c.abierto = true; c.editor = t.trim(); });
    }
    for (const k of tocadas) { const [f, l] = k.split('|'); setCelda(f, l, P.dias[f][l]); }
    // Bloque de TURNOS: aprende las tarifas (persona, rol, local y día) y los códigos de la GLOSA
    let aprendidas = 0;
    if (b.turnos) {
      const nuevas = {};
      for (const r of filasDeBloque(b.turnos)) {
        const f = ymd(y, m, Number(r[0])); const l = LOC_ETQ(r[1]);
        if (!l) continue;
        if (r[2] === 'SHOW') {
          const c = cel(f, l);
          if (showVacio(c.show)) { c.show = limpiaShow(leerShowGlosa(r[3], r[4] === 'BANDA', l, parse(f).wd)); c.abierto = true; setCelda(f, l, c); }
          else if (r[4] === 'BANDA') { c.show.banda = true; }
          continue;
        }
        const c = celda(f, l);
        const libres = ROLES.filter((k) => c[k]).map((k) => ({ k, nombre: c[k] }));
        for (const it of r[2].split(',')) {
          const x = it.trim().match(/^(.+?)\s+(\d+)$/);
          if (!x) continue;
          const cod = plain(x[1]);
          // Busca el rol de esa persona en la celda (por nombre o por el comienzo del nombre: Lore → LORETTO)
          let i = libres.findIndex((s) => s && plain(s.nombre) === cod);
          if (i < 0) i = libres.findIndex((s) => s && plain(s.nombre).length >= 3 && cod.startsWith(plain(s.nombre)));
          if (i < 0) continue;
          const s = libres[i]; libres[i] = null;
          // Si el mismo nombre está en entretención y en cámara (anima y graba), el pago queda en el primero
          for (let j = i + 1; j < libres.length; j++) if (libres[j] && plain(libres[j].nombre) === plain(s.nombre) && libres[j].k !== 'editor' && s.k !== 'editor') libres[j] = null;
          const p = P.personas.find((q) => plain(q.nombre) === plain(s.nombre));
          if (p && p.codigo !== cod) p.codigo = cod;
          nuevas[`${cod}|${ROL_TARIFA[s.k]}|${l}|${parse(f).wd}`] = Number(x[2]);
        }
      }
      // Se guardan resumidas: si una persona cobra lo mismo en todo, una sola fila; si no, por local o por día
      const grupos = {};
      for (const [k, v] of Object.entries(nuevas)) { const [cod, rol, l, wd] = k.split('|'); ((grupos[`${cod}|${rol}`] ||= [])).push({ l, wd, v }); }
      for (const [g, xs] of Object.entries(grupos)) {
        const [cod, rol] = g.split('|');
        P.tarifas = P.tarifas.filter((t) => !(t.persona === cod && t.rol === rol));
        const add = (local, dia, monto) => { P.tarifas.push({ persona: cod, rol, local, dia, monto }); aprendidas++; };
        if (new Set(xs.map((x) => x.v)).size === 1) { add('*', '*', xs[0].v); continue; }
        for (const l of new Set(xs.map((x) => x.l))) {
          const ys = xs.filter((x) => x.l === l);
          if (new Set(ys.map((x) => x.v)).size === 1) add(l, '*', ys[0].v);
          else for (const x of ys) add(l, x.wd, x.v);
        }
      }
    }
    save();
    return { celdas: tocadas.size, tarifas: aprendidas };
  }

  // ---------- Rutas ----------
  function estadoMes(y, m) {
    const fechas = fechasMes(y, m).map((x) => ({
      ...x, wd: parse(x.fecha).wd, cerrado: cerrado(x.fecha),
      locales: Object.fromEntries(LOCALES.map((l) => [l, { abierto: abierto(x.fecha, l), abreDefault: abreDefault(x.fecha, l), ...celda(x.fecha, l), pagos: pagos(x.fecha, l) }])),
    }));
    // Nombres de shows ya usados, para elegir en vez de escribir
    const usados = {};
    for (const d of Object.values(P.dias)) for (const c of Object.values(d)) if (c.show && c.show.nombre) ((usados[c.show.tipo] ||= new Set())).add(c.show.nombre);
    return {
      mes: `${y}-${pad(m)}`, nombre: `${titulo(MESES[m - 1])} ${y}`, fechas, personas: P.personas, tarifas: P.tarifas, horarios: P.horarios,
      tipos: TIPOS, usados: Object.fromEntries(Object.entries(usados).map(([k, v]) => [k, [...v].sort()])), locales: NOMBRE_LOCAL,
      glosa: { url: P.glosa.url || '', ultimo: P.glosa.ultimo || null },
      ajustes: P.ajustes[`${y}-${pad(m)}`] || {}, plantilla: P.plantilla, asist: P.asist[`${y}-${pad(m)}`] || {}, pasos: PASOS,
    };
  }
  app.get('/api/prog/mes', auth, (req, res) => { const { y, m } = mesDe(req.query.m); res.json(estadoMes(y, m)); });

  // ---------- Prellenar el mes (Cote, 23 nov: «que la plataforma le vaya preguntando… y después un prellenado que Cote
  // pueda ir modificando hasta aprobarlo») ----------
  app.post('/api/prog/plantilla', auth, (req, res) => {
    const b = req.body || {};
    if (!/^[0456]\|(MK|TOB|FRIDA)$/.test(String(b.clave))) return fail(res, 400, 'Día o local no válido');
    const c = limpiaCelda(b.celda); delete c.show; delete c.montos; delete c.abierto;
    P.plantilla[b.clave] = c;
    for (const r of ROLES) if (c[r]) persona(c[r], ROL_TARIFA[r]);
    save(); res.json({ ok: true, plantilla: P.plantilla });
  });
  // Respuestas del asistente: días que NO hace cada persona fija, domingos de Oscar, viernes de Matías, días de Priss y Kony
  app.post('/api/prog/asist', auth, (req, res) => {
    const b = req.body || {}; const { y, m } = mesDe(b.mes);
    const lista = (xs) => (Array.isArray(xs) ? xs.map(String).filter((x) => /^\d{4}-\d{2}-\d{2}(\|[A-Z]+\|\w+)?$/.test(x)).slice(0, 200) : []);
    const a = b.asist || {}; const o = {};
    for (const k of Object.keys(a)) if (/^[\w-]{1,20}$/.test(k)) o[k] = lista(a[k]);
    P.asist[`${y}-${pad(m)}`] = o;
    save(); res.json({ ok: true, asist: o });
  });
  app.post('/api/prog/prellenar', auth, (req, res) => {
    const { y, m } = mesDe((req.body || {}).mes);
    res.json({ ok: true, ...prellenar(y, m) });
  });
  function prellenar(y, m) {
    const A = P.asist[`${y}-${pad(m)}`] || {};
    const no = new Set([...(A.noOscar || []), ...(A.noFer || [])]);
    const delMes = fechasMes(y, m).filter((x) => !x.cortesia).map((x) => x.fecha);
    let n = 0;
    for (const f of delMes) {
      const wd = parse(f).wd;
      for (const l of LOCALES) {
        if (!abierto(f, l)) continue;
        const base = P.plantilla[`${wd}|${l}`];
        if (!base) continue;
        const c = { ...celda(f, l) }; let cambio = false;
        for (const k of [...ROLES, 'camNota']) {
          if (c[k] || !base[k]) continue;
          if (no.has(`${f}|${l}|${k}`)) continue; // Cote dijo que ese día no lo hace
          if ((k === 'camHx' && !c.camH && !base.camH) || (k === 'camVx' && !c.camV && !base.camV)) continue;
          c[k] = base[k]; cambio = true;
        }
        // Domingos de Frida: DJ Oscar los domingos que eligió Cote; los otros, el de la semana tipo
        if (l === 'FRIDA' && wd === 0 && (A.domOscar || []).includes(f) && (!celda(f, l).dj)) { c.dj = 'Oscar'; cambio = true; }
        // Viernes de Matías: animador cantante en Mercado Kennedy
        if (l === 'MK' && wd === 5 && (A.mati || []).includes(f) && !c.cantante) { c.cantante = 'Mati'; cambio = true; }
        if (cambio) { setCelda(f, l, c); n++; }
      }
    }
    // Lo que queda de animador cantante (viernes en Kennedy y viernes y sábado en Frida) se reparte entre Priss y Kony
    // según los días que dieron. Reglas: en Frida no repite la misma el viernes y el sábado; nadie en dos locales el mismo
    // día. Se arma cada fin de semana completo (Cote, 23 nov: «hay que usar el criterio»: si el sábado solo puede Kony,
    // Kony queda el sábado y el viernes Priss va a Frida y Kony a Kennedy), llenando la mayor cantidad posible y
    // después lo más parejo entre las dos.
    const QUIEN = ['Priss', 'Kony'];
    const cuenta = { Priss: 0, Kony: 0 };
    for (const f of delMes) for (const l of LOCALES) { const v = celda(f, l).cantante; if (v in cuenta) cuenta[v]++; }
    const ocupado = (f, q, l0) => LOCALES.some((l) => l !== l0 && Object.values(celda(f, l)).includes(q));
    let repartidos = 0; const sinNadie = [];
    const slots = [];
    for (const f of delMes) {
      const wd = parse(f).wd;
      for (const l of ['MK', 'FRIDA']) {
        if (!abierto(f, l) || celda(f, l).cantante) continue;
        if ((l === 'MK' && wd === 5) || (l === 'FRIDA' && (wd === 5 || wd === 6))) slots.push({ f, l, wd, sem: semana(f) });
      }
    }
    for (const sem of [...new Set(slots.map((x) => x.sem))]) {
      const ss = slots.filter((x) => x.sem === sem);
      const opciones = ss.map((x) => [...QUIEN.filter((q) => (A[`disp${q}`] || []).includes(x.f) && !ocupado(x.f, q, x.l)), null]);
      let mejor = null; let mejorNota = -Infinity;
      const prueba = (k, elegidos) => {
        if (k === ss.length) {
          // Reglas dentro del fin de semana (también contra lo que ya estaba marcado)
          for (let a = 0; a < ss.length; a++) {
            const q = elegidos[a]; if (!q) continue;
            for (let b = 0; b < ss.length; b++) if (a !== b && elegidos[b] === q && ss[b].f === ss[a].f) return; // dos locales el mismo día
            if (ss[a].l === 'FRIDA') {
              const otro = ss[a].wd === 5 ? addDays(ss[a].f, 1) : addDays(ss[a].f, -1);
              const b = ss.findIndex((x) => x.l === 'FRIDA' && x.f === otro);
              if ((b >= 0 && elegidos[b] === q) || celda(otro, 'FRIDA').cantante === q) return; // repite viernes y sábado en Frida
            }
          }
          const c = { ...cuenta }; elegidos.forEach((q) => { if (q) c[q]++; });
          const nota = elegidos.filter(Boolean).length * 1000 - Math.abs(c.Priss - c.Kony);
          if (nota > mejorNota) { mejorNota = nota; mejor = elegidos.slice(); }
          return;
        }
        for (const q of opciones[k]) { elegidos.push(q); prueba(k + 1, elegidos); elegidos.pop(); }
      };
      prueba(0, []);
      ss.forEach((x, k) => {
        const q = mejor && mejor[k];
        if (!q) { sinNadie.push(`${etiquetaTurno(x.f)} ${ETQ[x.l]}`); return; }
        cuenta[q]++; repartidos++;
        setCelda(x.f, x.l, { ...celda(x.f, x.l), cantante: q });
      });
    }
    save();
    return { celdas: n, repartidos, sinNadie };
  }
  app.post('/api/prog/celda', auth, (req, res) => {
    const b = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.fecha)) || !LOCALES.includes(b.local)) return fail(res, 400, 'Fecha o local no válido');
    setCelda(b.fecha, b.local, b.celda);
    save();
    res.json({ ok: true, celda: { abierto: abierto(b.fecha, b.local), ...celda(b.fecha, b.local), pagos: pagos(b.fecha, b.local) } });
  });
  app.post('/api/prog/personas', auth, (req, res) => {
    const xs = Array.isArray((req.body || {}).personas) ? req.body.personas : [];
    const antes = Object.fromEntries(P.personas.map((p) => [plain(p.nombre), p.fijo]));
    P.personas = xs.map((p) => {
      const o = { nombre: clean(p.nombre, 40), codigo: plain(p.codigo || p.nombre).slice(0, 40), roles: (Array.isArray(p.roles) ? p.roles : []).filter((r) => ['ent', 'cam', 'edi'].includes(r)) };
      const f = p.fijo != null ? p.fijo : antes[plain(o.nombre)];
      if (Number(f) > 0) o.fijo = Math.round(Number(f));
      return o;
    }).filter((p) => p.nombre);
    save(); res.json({ ok: true, personas: P.personas });
  });
  // Sueldo fijo mensual (Cote, 23 nov: Oscar y Fer tienen sueldo fijo; los valores por día son solo de referencia)
  app.post('/api/prog/fijo', auth, (req, res) => {
    const b = req.body || {};
    const n = clean(b.nombre, 40); if (!n) return fail(res, 400, 'Falta el nombre');
    persona(n);
    const p = P.personas.find((x) => plain(x.nombre) === plain(n));
    const f = Math.round(Number(String(b.fijo == null ? '' : b.fijo).replace(/[^\d]/g, '')) || 0);
    if (f > 0) p.fijo = f; else delete p.fijo;
    save(); res.json({ ok: true, personas: P.personas });
  });
  // Días que no trabajó alguien con sueldo fijo en el mes y con qué se cubren (Cote, 24 nov: Oscar pide días que
  // después cubre con un domingo; se descuentan de las vacaciones o del turno extra)
  app.post('/api/prog/ajuste', auth, (req, res) => {
    const b = req.body || {}; const { y, m } = mesDe(b.mes); const k = `${y}-${pad(m)}`;
    const n = clean(b.nombre, 40); if (!n) return fail(res, 400, 'Falta el nombre');
    const menos = Math.max(0, Math.min(31, Math.round(Number(b.menos) || 0)));
    P.ajustes[k] ||= {};
    if (menos) P.ajustes[k][n] = { menos, cubre: b.cubre === 'extra' ? 'extra' : 'vacaciones' }; else delete P.ajustes[k][n];
    save(); res.json({ ok: true, ajustes: P.ajustes[k] });
  });
  app.post('/api/prog/tarifas', auth, (req, res) => {
    const xs = Array.isArray((req.body || {}).tarifas) ? req.body.tarifas : [];
    P.tarifas = xs.map((t) => ({
      persona: t.persona === '*' ? '*' : plain(t.persona).slice(0, 40), rol: ['ent', 'cam', 'edi'].includes(t.rol) ? t.rol : 'ent',
      local: LOCALES.includes(t.local) ? t.local : '*', dia: ['0', '4', '5', '6'].includes(String(t.dia)) ? String(t.dia) : '*', monto: Math.max(0, Math.round(Number(t.monto) || 0)),
    })).filter((t) => t.persona);
    save(); res.json({ ok: true, tarifas: P.tarifas });
  });
  app.post('/api/prog/horarios', auth, (req, res) => {
    const b = req.body || {};
    for (const l of LOCALES) if (typeof b[l] === 'string') P.horarios[l] = b[l].slice(0, 2000).replace(/\r/g, '');
    save(); res.json({ ok: true, horarios: P.horarios });
  });
  // Respaldo (pedido de Cote por Code 0, 28 nov): todos los datos de la plataforma en un archivo para guardar aparte
  app.get('/api/prog/respaldo', auth, (_req, res) => {
    const f = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="programacion-respaldo-${f}.json"`).set('Cache-Control', 'no-store').json(P);
  });
  app.get('/api/prog/archivos', auth, (req, res) => { const { y, m } = mesDe(req.query.m); res.json(archivos(y, m)); });
  app.post('/api/prog/importar', auth, (req, res) => res.json({ ok: true, ...importar(req.body || {}) }));

  // ---------- GLOSA (con un script que Cote pega en la planilla) ----------
  app.get('/api/prog/glosa/script', auth, (_req, res) => res.type('text/plain').send(scriptGlosa(P.glosa.clave)));
  app.post('/api/prog/glosa', auth, (req, res) => {
    const url = String((req.body || {}).url || '').trim();
    if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return fail(res, 400, 'La dirección debe ser la de la aplicación web del script (termina en /exec)');
    P.glosa.url = url; save(); res.json({ ok: true, url });
  });
  const GLOSA_URL = () => process.env.PROG_GLOSA_TEST_URL || P.glosa.url;
  let envio = null; // envío en curso o el último
  // ---------- Enviar solo los cambios (Cote, 27 nov: «subir eso y que detecte los cambios que hubo… y simplemente aplique
  // ese cambio sobre la planilla, sin tener que cargarla entera») ----------
  // Foto de lo que quedó en la GLOSA en el último envío: montos por persona y área, shows y días con actividad
  function fotoMes(y, m) {
    const a = archivos(y, m);
    const personas = {};
    for (const d of a.detalle) { const k = `${d.dia}|${d.local}|${d.codigo}|${d.area}`; personas[k] = (personas[k] || 0) + (Number(d.monto) || 0); }
    const shows = {}; const ppto = {};
    for (const f of a.filas) {
      if (!/^\d+$/.test(f[0] || '')) continue;
      const k = `${f[0]}|${f[1]}`;
      ppto[k] ||= { activo: true, banda: false };
      if (f[2] === 'SHOW') { shows[k] = { nombre: f[3], monto: null }; if (f[4] === 'BANDA') ppto[k].banda = true; }
    }
    for (const x of a.shows) { const k = `${x.dia}|${x.local}`; if (shows[k]) shows[k].monto = x.monto; }
    return { a, personas, shows, ppto };
  }
  const AREA_TXT = { dj: 'DJ', ent: 'entretención', camH: 'cámara en vivo', camV: 'cámara vertical', edi: 'edición' };
  const plata = (n) => `$${Number(n || 0).toLocaleString('es-CL')}`;
  function cambiosMes(y, m) {
    const mes = `${y}-${pad(m)}`;
    const antes = (P.glosa.enviado || {})[mes];
    const ahora = fotoMes(y, m);
    if (!antes) return { sinFoto: true, ahora };
    const dia = (d) => { const f = ymd(y, m, Number(d)); return `${DIA_TURNO[parse(f).wd]} ${Number(d)}`; };
    const lista = []; const personas = []; const shows = []; const presupuesto = [];
    // Personas: por cada persona con algún cambio en un día y local, se mandan todos sus montos de ese día y local
    const todasP = [...new Set([...Object.keys(antes.personas), ...Object.keys(ahora.personas)])];
    const grupo = {};
    for (const k of todasP) {
      const v0 = antes.personas[k] || 0; const v1 = ahora.personas[k] || 0;
      if (v0 === v1) continue;
      const [d, l, cod, area] = k.split('|');
      lista.push(`${dia(d)} · ${ETQ[l]} · ${cod} (${AREA_TXT[area] || area}): ${v0 ? plata(v0) : '—'} → ${v1 ? plata(v1) : 'sin turno'}`);
      grupo[`${d}|${l}|${cod}`] = true;
    }
    for (const g of Object.keys(grupo)) {
      const [d, l, cod] = g.split('|');
      const areas = new Set(todasP.filter((k) => k.startsWith(`${g}|`)).map((k) => k.split('|')[3]));
      for (const area of areas) personas.push({ dia: Number(d), local: l, codigo: cod, area, monto: ahora.personas[`${g}|${area}`] || 0 });
    }
    for (const k of new Set([...Object.keys(antes.shows), ...Object.keys(ahora.shows)])) {
      const s0 = antes.shows[k] || {}; const s1 = ahora.shows[k] || {};
      if ((s0.nombre || '') === (s1.nombre || '') && (s0.monto ?? null) === (s1.monto ?? null)) continue;
      const [d, l] = k.split('|');
      lista.push(`${dia(d)} · ${ETQ[l]} · show: ${s0.nombre || '—'}${s0.monto != null ? ` ${plata(s0.monto)}` : ''} → ${s1.nombre || 'sin show'}${s1.monto != null ? ` ${plata(s1.monto)}` : ''}`);
      shows.push({ dia: Number(d), local: l, nombre: s1.nombre || '', monto: s1.monto ?? null });
    }
    for (const k of new Set([...Object.keys(antes.ppto), ...Object.keys(ahora.ppto)])) {
      const p0 = antes.ppto[k] || { activo: false, banda: false }; const p1 = ahora.ppto[k] || { activo: false, banda: false };
      if (p0.activo === p1.activo && p0.banda === p1.banda) continue;
      const [d, l] = k.split('|');
      lista.push(`${dia(d)} · ${ETQ[l]} · presupuesto: ${!p1.activo ? 'sin actividad (queda en cero)' : p1.banda ? 'con banda tributo (+$35.000)' : 'con actividad'}`);
      presupuesto.push({ dia: Number(d), local: l, activo: p1.activo, banda: p1.banda });
    }
    return { lista, personas, shows, presupuesto, ahora };
  }
  const guardarFoto = (mes, f) => { P.glosa.enviado ||= {}; P.glosa.enviado[mes] = { personas: f.personas, shows: f.shows, ppto: f.ppto }; };
  // La GLOSA ya está al día (por ejemplo, Cote la arregló a mano): se toma lo de la plataforma como punto de partida, sin enviar nada
  app.post('/api/prog/glosa/base', auth, (req, res) => {
    const { y, m } = mesDe((req.body || {}).mes);
    guardarFoto(`${y}-${pad(m)}`, fotoMes(y, m)); save();
    res.json({ ok: true });
  });
  app.get('/api/prog/glosa/cambios', auth, (req, res) => {
    const { y, m } = mesDe(req.query.m);
    const c = cambiosMes(y, m);
    if (c.sinFoto) return res.json({ sinFoto: true });
    res.json({ lista: c.lista });
  });
  app.post('/api/prog/glosa/enviar', auth, (req, res) => {
    if (!GLOSA_URL()) return fail(res, 400, 'Primero conecta la GLOSA');
    if (envio && envio.estado === 'enviando') return res.json(envio);
    const b = req.body || {};
    const { y, m } = mesDe(b.mes);
    const solo = Boolean(b.soloCambios);
    const c = solo ? cambiosMes(y, m) : null;
    if (solo && c.sinFoto) return fail(res, 400, 'Todavía no hay un envío completo de este mes con la plataforma: primero usa «Enviar y llenar el mes».');
    if (solo && !c.lista.length) return fail(res, 400, 'No hay cambios desde el último envío.');
    const foto = solo ? c.ahora : fotoMes(y, m);
    const a = foto.a;
    envio = { estado: 'enviando', mes: a.mes, desde: Date.now(), solo, cambios: solo ? c.lista.length : 0 };
    const datos = { clave: P.glosa.clave, pestana: a.pestana, anterior: a.anterior, b8: a.b8, filas: a.filas, detalle: a.detalle, shows: a.shows, bloques: a.bloques, mes: a.mesNum, anio: a.anio, llenar: !solo && b.llenar !== false };
    // Un script anterior no conoce «cambios» y, con llenar en falso, solo reescribe la hoja TURNOS: no pisa nada
    if (solo) datos.cambios = { personas: c.personas, shows: c.shows, presupuesto: c.presupuesto };
    fetch(GLOSA_URL(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), redirect: 'follow', signal: AbortSignal.timeout(6 * 60e3) })
      .then((r) => r.text()).then((t) => {
        let j; try { j = JSON.parse(t); } catch { throw new Error('La GLOSA no respondió como se esperaba (revisa que el script esté publicado como aplicación web)'); }
        if (j.error) throw new Error(j.error);
        const viejo = !(Number(j.version) >= 12);
        if (solo && viejo) throw new Error('El script de la GLOSA es una versión anterior y no sabe aplicar solo los cambios: no se cambió nada. Actualiza el script (pestaña GLOSA, «Actualizar el script») y vuelve a intentar.');
        guardarFoto(a.mes, foto);
        envio = { estado: 'listo', mes: a.mes, a: Date.now(), solo, cambios: solo ? c.lista.length : 0, creada: Boolean(j.creada), aviso: [j.aviso || '', viejo ? 'El script de la GLOSA es una versión anterior: le faltan los últimos cambios (por ejemplo, enviar solo los cambios). Actualiza el script (pestaña GLOSA, «Actualizar el script»).' : ''].filter(Boolean).join(' ') };
      })
      .catch((e) => { envio = { estado: 'error', mes: a.mes, a: Date.now(), solo, error: clean(e && e.message, 300) || 'No se pudo enviar' }; })
      .finally(() => { P.glosa.ultimo = envio; save(); });
    res.json(envio);
  });
  app.get('/api/prog/glosa/estado', auth, (_req, res) => res.json(envio || P.glosa.ultimo || { estado: 'nada' }));
  // Lee la hoja TURNOS de la GLOSA y la compara con lo que hay en la plataforma
  app.get('/api/prog/glosa/leer', auth, async (req, res) => {
    if (!GLOSA_URL()) return fail(res, 400, 'Primero conecta la GLOSA');
    const { y, m } = mesDe(req.query.m);
    try {
      const r = await fetch(`${GLOSA_URL()}?clave=${encodeURIComponent(P.glosa.clave)}`, { redirect: 'follow', signal: AbortSignal.timeout(60e3) });
      const j = JSON.parse(await r.text());
      if (j.error) return fail(res, 502, j.error);
      const filas = (j.filas || []).map((f) => f.map((x) => String(x).trim()));
      const mesGlosa = Number((filas[0] || [])[1]); const anioGlosa = Number((filas[0] || [])[3]);
      const a = archivos(y, m);
      const norm = (f) => f.slice(0, 5).map((x) => String(x || '').trim()).join('-').replace(/-+$/, '');
      const enGlosa = filas.filter((f) => /^\d+$/.test(f[0] || '')).map(norm);
      const aca = a.filas.filter((f) => /^\d+$/.test(f[0] || '')).map(norm);
      res.json({
        mesGlosa, anioGlosa, mismoMes: mesGlosa === m && anioGlosa === y, pestana: (filas[0] || [])[5] || '',
        soloGlosa: enGlosa.filter((x) => !aca.includes(x)), soloAca: aca.filter((x) => !enGlosa.includes(x)), iguales: enGlosa.filter((x) => aca.includes(x)).length,
        bloque: filas.map((f) => f.filter((x, i) => x || i < 2).join('-').replace(/-+$/, '')).join('\n'),
      });
    } catch (e) { fail(res, 502, `No se pudo leer la GLOSA: ${clean(e && e.message, 200)}`); }
  });
  // Trae los shows de la hoja TURNOS de la GLOSA a los días que aún no tienen show
  app.post('/api/prog/glosa/traer', auth, async (req, res) => {
    if (!GLOSA_URL()) return fail(res, 400, 'Primero conecta la GLOSA');
    try {
      const r = await fetch(`${GLOSA_URL()}?clave=${encodeURIComponent(P.glosa.clave)}`, { redirect: 'follow', signal: AbortSignal.timeout(60e3) });
      const j = JSON.parse(await r.text());
      if (j.error) return fail(res, 502, j.error);
      const filas = (j.filas || []).map((f) => f.map((x) => String(x).trim()));
      const m = Number((filas[0] || [])[1]); const y = Number((filas[0] || [])[3]);
      if (!m || !y) return fail(res, 400, 'La hoja TURNOS no tiene el mes y el año en la fila 1');
      const bloque = filas.filter((f) => /^\d+$/.test(f[0] || '') && (f[2] || '').toUpperCase() === 'SHOW').map((f) => f.slice(0, 5).join('-')).join('\n');
      let n = 0;
      for (const f of filasDeBloque(bloque)) {
        const fecha = ymd(y, m, Number(f[0])); const l = LOC_ETQ(f[1]);
        if (!l || !showVacio(celda(fecha, l).show)) continue;
        const c = { ...celda(fecha, l), abierto: true, show: leerShowGlosa(f[3], f[4] === 'BANDA', l, parse(fecha).wd) };
        setCelda(fecha, l, c); n++;
      }
      save(); res.json({ ok: true, mes: `${y}-${pad(m)}`, shows: n });
    } catch (e) { fail(res, 502, `No se pudo leer la GLOSA: ${clean(e && e.message, 200)}`); }
  });
};

// Script para pegar en la GLOSA (archivo «Programacion» en Extensiones → Apps Script): apps-script/Programacion.gs,
// con la clave puesta
function scriptGlosa(clave) {
  return fs.readFileSync(path.join(__dirname, 'apps-script', 'Programacion.gs'), 'utf8').replace('__CLAVE__', clave);
}
