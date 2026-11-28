// Generador de flyers por volumen (orden de Code 0, 28 nov). Cruza la cartelera del mes (/api/prog/cartelera)
// con las fotos que deja el diseñador y arma la lista de flyers (jobs.json) para la plantilla aprobada.
// No publica nada. Las fotos no van al repositorio (es público): se bajan a una carpeta de trabajo.
//
// Formato de las fotos (propuesto a Cote por Code 0, 28 nov):
//   «Fotos artistas AAAA-MM» → carpetas «Kennedy», «Frida», «Tobalaba» → archivos «NN_show_artista.jpg»
//   (decisión de Cote, 28 nov): NN es el ORDEN dentro del mes (01, 02…; sirve para contar y pagar), no la fecha.
//   La fecha se busca por el nombre del show en la cartelera de ese local (sin tildes, mayúsculas ni «de/a/el»,
//   tolerando diferencias chicas). Una foto sirve para todas las fechas de ese show en ese local. Si el mismo show
//   va dos veces con artistas distintos, el archivo termina en «_diaDD» (ej. 07_doble-chayanne_pedro_dia19.jpg);
//   si no, se avisa en vez de adivinar.
//
// Uso:
//   node generar.js --mes 2026-12 --dir <carpeta local con Kennedy/ Frida/ Tobalaba/>
//   node generar.js --mes 2026-12 --drive <id de la carpeta «Fotos artistas 2026-12»> [--bajar <carpeta>]
//   --solo-revisar  solo dice qué fechas quedan sin foto
// Sale: jobs-<mes>.json (un flyer por fecha y local) e informe-<mes>.txt (sin foto, dudas, fotos sueltas y total por local).
const fs = require('fs'); const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const MES = arg('mes'); if (!MES) { console.error('Falta --mes AAAA-MM'); process.exit(1); }
const API = arg('api', 'https://cantabingo.onrender.com/api/prog/cartelera');
const LOCALES = { MK: 'kennedy', TOB: 'tobalaba', FRIDA: 'frida' };
const CARPETA = { kennedy: 'kennedy', frida: 'frida', tobalaba: 'tobalaba' };
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = { Lun: 'Lunes', Mar: 'Martes', 'Mié': 'Miércoles', Mie: 'Miércoles', Jue: 'Jueves', Vie: 'Viernes', 'Sáb': 'Sábado', Sab: 'Sábado', Dom: 'Domingo' };

// misma forma de escribir que el diseñador: minúsculas, sin tildes, guiones; sin palabras de relleno para comparar
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const RELLENO = new Set(['de', 'a', 'al', 'el', 'la', 'los', 'las', 'y', 'bingo', 'por', 'karaoke', 'night', 'show', 'tributo', 'doble', 'especial', 'banda']);
const clave = (s) => slug(s).split('-').filter((w) => w && !RELLENO.has(w)).join('-');

// fotos: { local: [{ dia, show, artista, archivo, fuente }] }
async function fotosDir(dir) {
  const out = {};
  for (const d of fs.readdirSync(dir)) {
    const loc = Object.values(CARPETA).find((l) => slug(d) === l); if (!loc) continue;
    out[loc] = fs.readdirSync(path.join(dir, d)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).map((f) => leerNombre(f, path.join(dir, d, f))).filter(Boolean);
  }
  return out;
}
const malos = [];
function leerNombre(f, fuente) {
  const m = /^(\d{1,3})_([^_.]+)(?:_(?!dia\d)([^_.]+))?(?:_dia(\d{1,2}))?\.(jpe?g|png|webp)$/i.exec(f);
  if (!m) { malos.push(f); return null; }
  return { orden: +m[1], show: m[2], artista: m[3] || '', dia: m[4] ? +m[4] : 0, archivo: f, fuente };
}
// parecido entre dos textos ya normalizados (0 a 1), para tolerar errores chicos de escritura
function parecido(a, b) {
  if (!a || !b) return 0; if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.95;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
}
async function listarDrive(id) {
  const html = await (await fetch('https://drive.google.com/embeddedfolderview?id=' + id)).text();
  const re = /<a href="([^"]+)"[^>]*>[\s\S]*?<div class="flip-entry-title">([^<]+)<\/div>/g; const r = []; let m;
  while ((m = re.exec(html))) r.push({ href: m[1], name: m[2].replace(/&amp;/g, '&').trim() });
  return r;
}
async function fotosDrive(id, bajar) {
  const out = {};
  for (const e of await listarDrive(id)) {
    const loc = Object.values(CARPETA).find((l) => slug(e.name) === l); const fid = /folders\/([\w-]+)/.exec(e.href); if (!loc || !fid) continue;
    out[loc] = [];
    for (const f of await listarDrive(fid[1])) {
      const fileId = /\/d\/([\w-]+)/.exec(f.href) || /id=([\w-]+)/.exec(f.href); const x = leerNombre(f.name, fileId ? 'drive:' + fileId[1] : f.href); if (!x) continue;
      if (bajar && fileId) {
        const dst = path.join(bajar, loc, f.name); fs.mkdirSync(path.dirname(dst), { recursive: true });
        if (!fs.existsSync(dst)) { const b = Buffer.from(await (await fetch('https://drive.google.com/uc?export=download&id=' + fileId[1])).arrayBuffer()); fs.writeFileSync(dst, b); }
        x.fuente = dst;
      }
      out[loc].push(x);
    }
  }
  return out;
}

(async () => {
  const cart = await (await fetch(API + '?m=' + MES)).json();
  if (!cart.locales) { console.error('La cartelera no respondió para', MES, cart); process.exit(1); }
  const fotos = arg('drive') ? await fotosDrive(arg('drive'), arg('bajar')) : arg('dir') ? await fotosDir(arg('dir')) : {};
  const [anio, mm] = MES.split('-').map(Number);
  const jobs = []; const faltan = []; const sueltas = []; const dudas = []; const total = {};
  for (const L of cart.locales) {
    const loc = LOCALES[L.local] || slug(L.nombre); const lista = (fotos[loc] || []).slice().sort((x, y) => x.orden - y.orden);
    total[L.nombre] = lista.length;
    const dias = L.dias.map((d) => { const texto = d.cartelera || [d.tipo, d.show].filter(Boolean).join(' '); return { d, dia: +d.fecha.slice(8, 10), texto, k: clave(texto) || clave(d.tipo), foto: null, juegos: /juegos de/i.test(texto) }; });
    // cada foto busca su show en la cartelera del local (el número del archivo no es la fecha)
    const porDia = {};
    for (const f of lista) {
      const k = clave(f.show); let mejor = 0;
      for (const x of dias) mejor = Math.max(mejor, parecido(k, x.k));
      const calzan = mejor >= 0.8 ? dias.filter((x) => parecido(k, x.k) >= mejor - 0.001 && !x.juegos) : [];
      if (!calzan.length) { sueltas.push(`${L.nombre}: ${f.archivo}`); continue; }
      const destino = f.dia ? calzan.filter((x) => x.dia === f.dia) : calzan;
      if (f.dia && !destino.length) { sueltas.push(`${L.nombre}: ${f.archivo} (no hay ese show el día ${f.dia})`); continue; }
      for (const x of destino) (porDia[x.dia] ||= []).push(f);
    }
    for (const x of dias) {
      const c = porDia[x.dia] || [];
      // dos fotos distintas para la misma fecha: vale la que dice el día; si ninguna lo dice, se avisa
      const conDia = c.filter((f) => f.dia === x.dia);
      if (conDia.length === 1) x.foto = conDia[0];
      else if (c.length === 1) x.foto = c[0];
      else if (c.length > 1) dudas.push(`${L.nombre} · ${x.d.dia} ${x.dia} · ${x.texto}: ${c.map((f) => f.archivo).join(', ')} (agregar «_diaDD» al archivo que corresponde)`);
      if (!x.foto && !x.juegos && !(c.length > 1)) faltan.push(`${L.nombre} · ${x.d.dia} ${x.dia} · ${x.texto}`);
      const foto = x.foto;
      jobs.push({ name: `${x.d.fecha}_${loc}_${slug(x.texto).slice(0, 40)}`, local: loc, fecha: `${DIAS[x.d.dia] || x.d.dia} <b>${x.dia}</b> · ${MESES[mm - 1]}`, tipo: x.d.tipo, show: x.d.show, artista: x.d.artista, cartelera: x.texto, horarios: L.horarios, instagram: L.instagram, foto: foto ? foto.fuente : null, fotoArchivo: foto ? foto.archivo : null, juegos: x.juegos });
    }
  }
  if (!arg('solo-revisar')) fs.writeFileSync(`jobs-${MES}.json`, JSON.stringify(jobs, null, 2));
  const sec = (t, l) => `${t} (${l.length})` + (l.length ? ':\n  ' + l.join('\n  ') : '');
  const informe = [`Flyers ${MES}: ${jobs.length} fechas; con foto ${jobs.filter((j) => j.foto).length}.`,
    sec('Fechas sin foto', faltan), sec('Fechas con dos fotos posibles (no se adivina)', dudas),
    sec('Fotos que no calzan con ningún show', sueltas), sec('Archivos con nombre fuera del formato', malos),
    'Total de fotos por local (para pagar al diseñador): ' + Object.entries(total).map(([k, v]) => `${k} ${v}`).join(' · ') + ` · en total ${Object.values(total).reduce((a, b) => a + b, 0)}`].join('\n\n');
  fs.writeFileSync(`informe-${MES}.txt`, informe + '\n');
  console.log(informe);
})().catch((e) => { console.error(e); process.exit(1); });
