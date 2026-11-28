// Generador de flyers por volumen (orden de Code 0, 28 nov). Cruza la cartelera del mes (/api/prog/cartelera)
// con las fotos que deja el diseñador y arma la lista de flyers (jobs.json) para la plantilla aprobada.
// No publica nada. Las fotos no van al repositorio (es público): se bajan a una carpeta de trabajo.
//
// Formato de las fotos (decisión final de Cote, 28 nov, 14:10: «el número y el show, tal como va en la lista…
//   solamente George Michael, o Bee Gees, o Piano Man»; «una carpeta por local y nada más»):
//   carpeta del mes en el Drive → una carpeta por local («Kennedy», «Frida», «Tobalaba») → «NN Nombre.jpg»
//   (ej. «01 George Michael.jpg», «05 Bee Gees.jpg», «02 Piano Man.jpg»). NN es el ORDEN dentro del mes en ese local.
//   El generador busca SOLO el nombre en la cartelera del local (el tipo —doble, tributo, piano— sale de la cartelera);
//   tolera mayúsculas, tildes, guiones y errores chicos, y acepta que venga «doble de…» o «tributo a…» escrito.
//   No adivina: si un nombre calza con más de una fecha del local, o hay dos fotos del mismo nombre, lo avisa
//   en el informe y esas fechas quedan sin foto hasta que alguien confirme.
//
// Uso:
//   node generar.js --mes 2026-12 --dir <carpeta local con Kennedy/ Frida/ Tobalaba/>
//   node generar.js --mes 2026-12 --drive <id de la carpeta «Fotos artistas 2026-12»> [--bajar <carpeta>]
//   --solo-revisar  solo dice qué fechas quedan sin foto
//   --cartelera <archivo.json>  usa una cartelera guardada en vez de leerla de la Sala (para probar)
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
const RELLENO = new Set(['de', 'a', 'al', 'el', 'la', 'los', 'las', 'y', 'bingo', 'por', 'karaoke', 'night', 'show', 'tributo', 'doble', 'especial', 'banda', 'noche', 'juegos']);
// lo que va entre paréntesis en la cartelera es a quién se le paga: no es parte del nombre del show
const sinParen = (s) => String(s || '').replace(/\([^)]*\)/g, ' ');
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
  const m = /^(\d{1,3})[\s_.-]+(.+?)\.(jpe?g|png|webp)$/i.exec(f);
  if (!m || !clave(m[2])) { malos.push(f); return null; }
  return { orden: +m[1], show: m[2], archivo: f, fuente };
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
  const cart = arg('cartelera') ? JSON.parse(fs.readFileSync(arg('cartelera'), 'utf8')) : await (await fetch(API + '?m=' + MES)).json();
  if (!cart.locales) { console.error('La cartelera no respondió para', MES, cart); process.exit(1); }
  const fotos = arg('drive') ? await fotosDrive(arg('drive'), arg('bajar')) : arg('dir') ? await fotosDir(arg('dir')) : {};
  const [anio, mm] = MES.split('-').map(Number);
  const jobs = []; const faltan = []; const sueltas = []; const dudas = []; const total = {};
  for (const L of cart.locales) {
    const loc = LOCALES[L.local] || slug(L.nombre); const lista = (fotos[loc] || []).slice().sort((x, y) => x.orden - y.orden);
    total[L.nombre] = lista.length;
    const dias = L.dias.map((d) => { const texto = d.cartelera || [d.tipo, d.show].filter(Boolean).join(' ');
      return { d, dia: +d.fecha.slice(8, 10), texto, k: clave(sinParen(texto)) || clave(d.tipo), foto: null, juegos: /juegos de|tarde de juegos/i.test(texto) }; });
    // cada foto busca su show en la cartelera del local (el número del archivo no es la fecha)
    const porDia = {};
    for (const f of lista) {
      const k = clave(f.show); const mismos = dias.filter((x) => !x.juegos && x.k); let mejor = 0;
      for (const x of mismos) mejor = Math.max(mejor, parecido(k, x.k));
      const calzan = mejor >= 0.8 ? mismos.filter((x) => parecido(k, x.k) >= mejor - 0.001) : [];
      if (!calzan.length) { sueltas.push(`${L.nombre}: ${f.archivo} (no hay un show con ese nombre este mes)`); continue; }
      if (calzan.length > 1) { dudas.push(`${L.nombre} · ${f.archivo}: el show sale ${calzan.length} veces (${calzan.map((x) => `${x.d.dia} ${x.dia}`).join(', ')}). Confirmar si es la misma persona; mientras tanto esas fechas quedan sin foto.`); calzan.forEach((x) => { x.duda = true; }); continue; }
      (porDia[calzan[0].dia] ||= []).push(f);
    }
    for (const x of dias) {
      const c = porDia[x.dia] || [];
      if (c.length === 1 && !x.duda) x.foto = c[0];
      else if (c.length > 1) { dudas.push(`${L.nombre} · ${x.d.dia} ${x.dia} · ${x.texto}: hay ${c.length} fotos del mismo show (${c.map((f) => f.archivo).join(', ')}). Dejar una sola.`); x.duda = true; }
      if (!x.foto && !x.juegos && !x.duda) faltan.push(`${L.nombre} · ${x.d.dia} ${x.dia} · ${x.texto}`);
      const foto = x.foto;
      jobs.push({ name: `${x.d.fecha}_${loc}_${slug(x.texto).slice(0, 40)}`, local: loc, fecha: `${DIAS[x.d.dia] || x.d.dia} <b>${x.dia}</b> · ${MESES[mm - 1]}`, tipo: x.d.tipo, show: x.d.show, artista: x.d.artista, cartelera: x.texto, horarios: L.horarios, instagram: L.instagram, foto: foto ? foto.fuente : null, fotoArchivo: foto ? foto.archivo : null, juegos: x.juegos });
    }
  }
  if (!arg('solo-revisar')) fs.writeFileSync(`jobs-${MES}.json`, JSON.stringify(jobs, null, 2));
  const sec = (t, l) => `${t} (${l.length})` + (l.length ? ':\n  ' + l.join('\n  ') : '');
  const informe = [`Flyers ${MES}: ${jobs.length} fechas; con foto ${jobs.filter((j) => j.foto).length}.`,
    sec('Fechas sin foto', faltan), sec('Dudas: no se adivina', dudas),
    sec('Fotos que no calzan con ningún show', sueltas), sec('Archivos con nombre fuera del formato', malos),
    'Total de fotos por local (para pagar al diseñador): ' + Object.entries(total).map(([k, v]) => `${k} ${v}`).join(' · ') + ` · en total ${Object.values(total).reduce((a, b) => a + b, 0)}`].join('\n\n');
  fs.writeFileSync(`informe-${MES}.txt`, informe + '\n');
  console.log(informe);
})().catch((e) => { console.error(e); process.exit(1); });
