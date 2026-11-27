const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const TITULO = 'GC Show Tobalaba';
const FILA_INICIO = 835;   // primera fila de la cartelera
const FILAS = 40;          // cuántas filas revisar hacia abajo para el show de hoy
const CART_COL = 31;  // Tobalaba: AE (días) y AF (show)
const HOR_FILA = 857;      // títulos DIA | HORA | ACTIVIDAD
const HOR_COL = 31;   // Tobalaba: AE, AF, AG
// Tipos que van arriba, chico, en el GC de OBS
const TIPOS = /^(BANDA TRIBUTO A|BANDA TRIBUTO|TRIBUTO A|TRIBUTO|DOBLE DE|DOBLE|STAND UP)(?:\s*:\s*|\s+)(.+)$/i;

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

// Lo que lee la Sala (?modo=json): show de hoy, cartelera del mes, horarios y, en «meses», la pestaña de este mes y la del
// mes siguiente (si ya existe), para que la cartelera de la semana muestre los días que cruzan de mes
function getCartelera() {
  const d = diaShow();
  const actual = hojaDe_(d);
  if (!actual) throw new Error('No encontré la pestaña ' + pestanaDe_(d));
  const cartelera = leerCartelera_(actual.hoja);
  // Horarios: desde la fila siguiente a los títulos, hasta la primera fila vacía
  const horarios = [];
  const filas = actual.hoja.getRange(HOR_FILA + 1, HOR_COL, 60, 3).getDisplayValues();
  for (const [dia, hora, actividad] of filas) {
    if (!String(dia).trim()) break;
    horarios.push({ dia: String(dia).trim().toUpperCase(), hora: String(hora).trim(), actividad: String(actividad).trim() });
  }
  const meses = [{ pestana: actual.pestana, cartelera: cartelera }];
  const siguiente = hojaDe_(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
  if (siguiente) meses.push({ pestana: siguiente.pestana, cartelera: leerCartelera_(siguiente.hoja) });
  return { pestana: actual.pestana, hoy: getShow(), cartelera: cartelera, horarios: horarios, meses: meses };
}

// Para probar: elegir arriba «probar» o «probarCartelera» y apretar Ejecutar
function probar() {
  Logger.log(JSON.stringify(getShow()));
}
function probarCartelera() {
  Logger.log(JSON.stringify(getCartelera()));
}
