const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const TITULO = 'GC Show Frida Kahlo';
const FILA_INICIO = 835;   // primera fila de la cartelera
const FILAS = 40;          // cuántas filas revisar hacia abajo para el show de hoy
const CART_COL = 41;  // Frida: AO (días) y AP (show)
const HOR_FILA = 857;      // donde termina la cartelera (los horarios se buscan solos por su título DIA, filas 850 a 870)
const HOR_COL = 41;   // Frida: AO, AP, AQ
// Tipos que van arriba, chico, en el GC de OBS
const TIPOS = /^(BANDA TRIBUTO A|BANDA TRIBUTO|TRIBUTO A|TRIBUTO|DOBLE DE|DOBLE|ESPECIAL|STAND UP KENNEDY|STAND UP)(?:\s*:\s*|\s+)(.+)$/i;

function doGet(e) {
  if (e && e.parameter && e.parameter.modo === 'json') {
    let salida;
    try { salida = getCartelera(); } catch (err) { salida = { error: String(err && err.message || err) }; }
    return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
  }
  return HtmlService.createHtmlOutputFromFile('GC').setTitle(TITULO);
}

// Día del show (hasta las 6 AM cuenta como la noche anterior)
function diaShow() {
  const d = new Date();
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return d;
}

// Nombre de la pestaña de un mes, ej. NOVIEMBRE26 MASTER TOTAL
function pestanaDe_(d) {
  const tz = Session.getScriptTimeZone();
  return MESES[Number(Utilities.formatDate(d, tz, 'M')) - 1] + Utilities.formatDate(d, tz, 'yy') + ' MASTER TOTAL';
}

// La planilla GLOSA del año (queda guardada 6 horas para no buscarla cada vez)
function glosaId_(anio) {
  const cache = CacheService.getScriptCache();
  let id = cache.get('GLOSA_ID_' + anio);
  if (id) return id;
  const it = DriveApp.searchFiles('title contains "GLOSA" and mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false');
  const lista = [];
  while (it.hasNext()) lista.push(it.next());
  const f = lista.find(x => x.getName().includes(anio)) || lista[0];
  if (!f) return '';
  Logger.log('Planilla encontrada: ' + f.getName());
  id = f.getId();
  cache.put('GLOSA_ID_' + anio, id, 21600);
  return id;
}

// La pestaña del mes de esa fecha (null si todavía no existe)
function hojaDe_(d) {
  const tz = Session.getScriptTimeZone();
  const id = glosaId_(Utilities.formatDate(d, tz, 'yyyy'));
  if (!id) return null;
  const pestana = pestanaDe_(d);
  const hoja = SpreadsheetApp.openById(id).getSheetByName(pestana);
  return hoja ? { hoja: hoja, pestana: pestana } : null;
}

// Cómo se lee el show (pedido de Cote, 27 nov): lo que va entre paréntesis es a quién se le transfiere y NO se muestra;
// lo que va entre comillas es la persona o el grupo que hace el tributo.
// Ej.: GEORGE MICHAEL "RAFA DAMIÁN" (X) → titulo: GEORGE MICHAEL · por: RAFA DAMIÁN
function limpiaShow_(texto) {
  const raw = String(texto || '').replace(/\([^()]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const q = raw.match(/["“”«»]\s*([^"“”«»]+?)\s*["“”«»]/);
  const por = q ? q[1].trim() : '';
  let titulo = (q ? raw.replace(q[0], ' ') : raw).replace(/["“”«»]/g, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—,:·]+|[\s\-–—,:·]+$/g, '');
  if (por && titulo.toUpperCase().endsWith(' ' + por.toUpperCase())) titulo = titulo.slice(0, titulo.length - por.length).trim();
  return { titulo: titulo || por, por: titulo ? por : '' };
}

// Show de hoy para el GC de OBS
function getShow() {
  const tz = Session.getScriptTimeZone();
  const d = diaShow();
  const mes = hojaDe_(d);
  if (!mes) return { artista: '', aviso: 'No encontré la pestaña ' + pestanaDe_(d) };
  const datos = mes.hoja.getRange(FILA_INICIO, CART_COL, FILAS, 2).getDisplayValues();
  const dia = Number(Utilities.formatDate(d, tz, 'd'));
  // En la columna de días se escribe así: SABADO 7 (se toma el número del final)
  for (const [fecha, show] of datos) {
    const m = String(fecha).trim().match(/(\d+)$/);
    if (m && Number(m[1]) === dia) {
      const s = limpiaShow_(show);
      if (s.por) return { tipo: 'POR ' + s.por.toUpperCase(), artista: s.titulo };
      const m2 = s.titulo.match(TIPOS);
      if (m2) return { tipo: m2[1].toUpperCase(), artista: m2[2].trim() };
      return { tipo: '', artista: s.titulo };
    }
  }
  return { artista: '', aviso: 'No hay show para el día ' + dia };
}

// Cartelera de una pestaña: desde la fila 835 hasta antes de los horarios
function leerCartelera_(hoja) {
  return hoja.getRange(FILA_INICIO, CART_COL, HOR_FILA - FILA_INICIO, 2).getDisplayValues()
    .filter(r => /\d+$/.test(String(r[0]).trim()) && String(r[1]).trim())
    .map(r => ({ dia: String(r[0]).trim(), show: String(r[1]).trim() }));
}

// Horarios de una pestaña (mejorado el 28 nov, pedido de Code 0: el 28 nov Frida y Tobalaba dejaron de mostrar horarios
// sin ningún aviso). Ahora:
// 1) busca el título «DIA» (o «DÍA») en su columna entre las filas 850 y 870, en vez de suponer la 857;
// 2) salta las filas vacías y corta recién después de 3 vacías seguidas;
// 3) si la celda del día viene vacía (el día escrito solo en la primera fila), repite el último día;
// 4) si no encuentra horarios, devuelve un aviso claro (la Sala lo puede mostrar en el panel del local).
const HOR_DESDE = 850, HOR_HASTA = 870;
function columna_(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
function leerHorarios_(hoja) {
  const titulos = hoja.getRange(HOR_DESDE, HOR_COL, HOR_HASTA - HOR_DESDE + 1, 1).getDisplayValues();
  let fila = 0;
  for (let i = 0; i < titulos.length; i++) {
    const t = String(titulos[i][0]).trim().toUpperCase().replace('Í', 'I');
    if (t === 'DIA' || t === 'DIAS') { fila = HOR_DESDE + i; break; }
  }
  const donde = 'columna ' + columna_(HOR_COL) + ' de la pestaña ' + hoja.getName();
  if (!fila) return { lista: [], aviso: 'No encontré el título DIA entre las filas ' + HOR_DESDE + ' y ' + HOR_HASTA + ' (' + donde + ')' };
  const lista = [];
  let dia = '';
  let vacias = 0;
  const filas = hoja.getRange(fila + 1, HOR_COL, 60, 3).getDisplayValues();
  for (const [d, hora, actividad] of filas) {
    const dd = String(d).trim(), hh = String(hora).trim(), aa = String(actividad).trim();
    if (!dd && !hh && !aa) { vacias++; if (vacias >= 3) break; continue; }
    vacias = 0;
    if (dd) dia = dd.toUpperCase();
    if (!dia || !hh || !aa) continue; // fila a medio llenar: se salta
    lista.push({ dia: dia, hora: hh, actividad: aa });
  }
  return { lista: lista, aviso: lista.length ? '' : 'No hay horarios debajo del título DIA (fila ' + fila + ', ' + donde + ')' };
}

// Lo que lee la Sala (?modo=json): show de hoy, cartelera y horarios del mes y, en «meses», la pestaña de este mes y la del
// mes siguiente (si ya existe), cada una con su cartelera y sus horarios. Así la Sala siempre puede leer las actividades de
// hoy y de los próximos 6 días, haya o no cambio de mes (pedido de Cote, 27 nov)
function getCartelera() {
  const d = diaShow();
  const actual = hojaDe_(d);
  if (!actual) throw new Error('No encontré la pestaña ' + pestanaDe_(d));
  const cartelera = leerCartelera_(actual.hoja);
  const h = leerHorarios_(actual.hoja);
  const meses = [{ pestana: actual.pestana, cartelera: cartelera, horarios: h.lista, avisoHorarios: h.aviso }];
  const siguiente = hojaDe_(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  if (siguiente) { const h2 = leerHorarios_(siguiente.hoja); meses.push({ pestana: siguiente.pestana, cartelera: leerCartelera_(siguiente.hoja), horarios: h2.lista, avisoHorarios: h2.aviso }); }
  return { pestana: actual.pestana, hoy: getShow(), cartelera: cartelera, horarios: h.lista, avisoHorarios: h.aviso, meses: meses };
}

// Para probar: elegir arriba «probar» o «probarCartelera» y apretar Ejecutar
function probar() {
  Logger.log(JSON.stringify(getShow()));
}
function probarCartelera() {
  Logger.log(JSON.stringify(getCartelera()));
}
