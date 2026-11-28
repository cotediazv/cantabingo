// Generador de flyers por volumen (orden de Code 0, 28 nov). Cruza la cartelera del mes (/api/prog/cartelera)
// con las fotos que deja el diseñador y arma la lista de flyers (jobs.json) para la plantilla aprobada.
// No publica nada. Las fotos no van al repositorio (es público): se bajan a una carpeta de trabajo.
//
// Formato de las fotos (propuesto a Cote por Code 0, 28 nov):
//   «Fotos artistas AAAA-MM» → carpetas «Kennedy», «Frida», «Tobalaba» → archivos «DD_show_artista.jpg»
//   DD = día del show con dos números; minúsculas, sin tildes ni espacios, guiones dentro de cada parte;
//   sin nombre de artista se omite esa parte. Si el show se repite con la misma foto, va una vez con el primer día.
//
// Uso:
//   node generar.js --mes 2026-12 --dir <carpeta local con Kennedy/ Frida/ Tobalaba/>
//   node generar.js --mes 2026-12 --drive <id de la carpeta «Fotos artistas 2026-12»> [--bajar <carpeta>]
//   --solo-revisar  solo dice qué fechas quedan sin foto
// Sale: jobs-<mes>.json (un flyer por fecha y local) y faltan-<mes>.txt (fechas sin foto).
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
function leerNombre(f, fuente) {
  const m = /^(\d{1,2})_([^_]+)(?:_([^_.]+))?\.(jpe?g|png|webp)$/i.exec(f);
  if (!m) { console.warn('Nombre que no sigue el formato (se salta):', f); return null; }
  return { dia: +m[1], show: m[2], artista: m[3] || '', archivo: f, fuente };
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
  const jobs = []; const faltan = [];
  for (const L of cart.locales) {
    const loc = LOCALES[L.local] || slug(L.nombre); const lista = fotos[loc] || [];
    for (const d of L.dias) {
      const dia = +d.fecha.slice(8, 10);
      const texto = d.cartelera || [d.tipo, d.show].filter(Boolean).join(' ');
      const k = clave(texto) || clave(d.tipo);
      // 1) foto de ese día; 2) la misma función en otro día del mes (show repetido, foto una sola vez)
      let foto = lista.find((f) => f.dia === dia) || lista.find((f) => clave(f.show) && clave(f.show) === k) || null;
      const juegos = /juegos de/i.test(texto);
      if (!foto && !juegos) faltan.push(`${L.nombre} · ${d.dia} ${dia} · ${texto}`);
      jobs.push({ name: `${d.fecha}_${loc}_${slug(texto).slice(0, 40)}`, local: loc, fecha: `${DIAS[d.dia] || d.dia} <b>${dia}</b> · ${MESES[mm - 1]}`, tipo: d.tipo, show: d.show, artista: d.artista, cartelera: texto, horarios: L.horarios, instagram: L.instagram, foto: foto ? foto.fuente : null, fotoArchivo: foto ? foto.archivo : null, juegos });
    }
  }
  if (!arg('solo-revisar')) fs.writeFileSync(`jobs-${MES}.json`, JSON.stringify(jobs, null, 2));
  fs.writeFileSync(`faltan-${MES}.txt`, faltan.join('\n') + '\n');
  console.log(`${jobs.length} flyers (${MES}); con foto ${jobs.filter((j) => j.foto).length}; sin foto ${faltan.length}` + (faltan.length ? ':\n  ' + faltan.join('\n  ') : ''));
})().catch((e) => { console.error(e); process.exit(1); });
