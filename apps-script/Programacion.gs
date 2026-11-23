// Programación KRB (Code 3): recibe los turnos y shows del mes desde la plataforma de programación
// (cantabingo.onrender.com/programacion), los deja en la hoja TURNOS y llena la pestaña del mes.
// Se pega en la GLOSA como archivo «Programacion» (Extensiones → Apps Script) y se implementa como aplicación web.
// La plataforma entrega este texto con la clave ya puesta (pestaña GLOSA → «Copiar el script»).
//
// Llena la pestaña igual que llenarMes, con dos cambios pedidos por Cote (23 nov):
//  - Las 5 semanas de la pestaña parten el jueves: jueves, viernes, sábado y domingo. Así el domingo 1 de noviembre
//    queda en la cuarta celda de la semana 1 y la semana 2 empieza el jueves 5 (llenarMes los ponía seguidos).
//  - El presupuesto neto de cada día toma el monto de la fila 3 solo si ese local tiene actividad ese día;
//    los días sin actividad quedan en cero. Los días con banda tributo (show con «BANDA») suman $35.000 de batería.
// También escribe el mes en B8 y el monto de cada show en la columna siguiente a la del show.
// llenarMes (el archivo de antes) no se usa ni se toca.
const CLAVE_PROGRAMACION = '__CLAVE__';
const PROG_VERSION = 5;

const PR_PRIMERA = 12, PR_ALTO = 39, PR_BLOQUES = 20, PR_RESUMEN = 835;
const PR_COL = { MK: 3, KENNEDY: 3, EV: 12, EVENTOS: 12, KR: 22, KARAROCK: 22, TOB: 32, TOBALABA: 32, FRI: 42, FRIDA: 42, PAN: 52, PANORAMICO: 52 };
const PR_COLS = [3, 12, 22, 32, 42, 52];
const PR_ANTICIPO = [6, 15, 25, 35, 45, 55];
const PR_DIA_RESUMEN = [2, 11, 21, 31, 41, 51];
const PR_NOMBRE_DIA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const PR_CERRADOS = ['24-12', '25-12', '31-12', '1-1'];

function doGet(e) {
  if (!e || !e.parameter || e.parameter.clave !== CLAVE_PROGRAMACION) return respuestaProg_({ error: 'Clave incorrecta' });
  const t = SpreadsheetApp.getActive().getSheetByName('TURNOS');
  if (!t) return respuestaProg_({ error: 'Falta la hoja TURNOS' });
  return respuestaProg_({ ok: true, version: PROG_VERSION, filas: t.getDataRange().getDisplayValues() });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (x) { return respuestaProg_({ error: 'Datos no válidos' }); }
  if (!b || b.clave !== CLAVE_PROGRAMACION) return respuestaProg_({ error: 'Clave incorrecta' });
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return respuestaProg_({ error: 'La GLOSA está ocupada, prueba de nuevo en un minuto' });
  try {
    const ss = SpreadsheetApp.getActive();
    let creada = false;
    let sh = ss.getSheetByName(b.pestana);
    if (!sh) {
      const ant = ss.getSheetByName(b.anterior);
      if (!ant) return respuestaProg_({ error: 'No encuentro la pestaña ' + b.pestana + ' ni la del mes anterior (' + b.anterior + ')' });
      sh = ant.copyTo(ss).setName(b.pestana);
      creada = true;
    }
    sh.getRange('B8').setValue(b.b8);
    // La hoja TURNOS queda con el bloque del mes, como registro
    let t = ss.getSheetByName('TURNOS');
    if (!t) t = ss.insertSheet('TURNOS');
    t.clearContents();
    const ancho = b.filas.reduce(function (n, f) { return Math.max(n, f.length); }, 1);
    const datos = b.filas.map(function (f) { const r = f.slice(); while (r.length < ancho) r.push(''); return r; });
    t.getRange(1, 1, datos.length, ancho).setNumberFormat('@').setValues(datos);
    let avisos = [];
    if (b.llenar) avisos = llenarProg_(ss, sh, b);
    return respuestaProg_({ ok: true, version: PROG_VERSION, creada: creada, aviso: avisos.join('; ') });
  } catch (x) {
    return respuestaProg_({ error: String((x && x.message) || x) });
  } finally {
    lock.releaseLock();
  }
}

function respuestaProg_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Borra los valores de un rango y deja las fórmulas
function limpiarProg_(rg) {
  const f = rg.getFormulas();
  rg.setValues(f.map(function (fila) { return fila.map(function (x) { return x || ''; }); }));
}

function letraProg_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function llenarProg_(ss, sh, b) {
  const mes = Number(b.mes), anio = Number(b.anio);
  // 20 bloques: 5 semanas de jueves a domingo. b.bloques trae, por bloque, el día del mes o nada
  const dias = b.bloques.map(function (x) { return x ? { d: Number(x.d), wd: Number(x.wd) } : null; });
  const bloqueDe = {};
  dias.forEach(function (x, i) { if (x) bloqueDe[x.d] = i; });
  const cerrado = function (d) { return PR_CERRADOS.indexOf(d + '-' + mes) >= 0; };
  const filas = b.filas.filter(function (r) { return /^\d+$/.test(String(r[0]).trim()); });
  const esShow = function (r) { return String(r[2]).trim().toUpperCase() === 'SHOW'; };
  const avisos = [];

  // Resumen de shows: SEM 1 a SEM 5 y el día de cada bloque
  const semanas = [];
  for (let i = 0; i < PR_BLOQUES; i++) semanas.push([i % 4 === 0 ? 'SEM ' + (i / 4 + 1) : '']);
  sh.getRange(PR_RESUMEN, 1, PR_BLOQUES, 1).setValues(semanas);
  PR_DIA_RESUMEN.forEach(function (c) {
    const rg = sh.getRange(PR_RESUMEN, c, PR_BLOQUES, 1);
    const f = rg.getFormulas();
    rg.setValues(f.map(function (r, i) { return [r[0] || (dias[i] ? PR_NOMBRE_DIA[dias[i].wd] + ' ' + dias[i].d : '')]; }));
    limpiarProg_(sh.getRange(PR_RESUMEN, c + 1, PR_BLOQUES, 2));
    limpiarProg_(sh.getRange(PR_RESUMEN, c + 5, PR_BLOQUES, 1));
  });
  for (let k = 0; k < PR_BLOQUES; k++) {
    const top = PR_PRIMERA + k * PR_ALTO;
    PR_COLS.concat(PR_ANTICIPO).forEach(function (c) { limpiarProg_(sh.getRange(top + 3, c, 30, 1)); });
  }

  // Nombres cortos → nombres de la planilla (hoja EQUIPO)
  const alias = {};
  const eq = ss.getSheetByName('EQUIPO');
  if (eq && eq.getLastRow() > 1) {
    eq.getRange(2, 1, eq.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0]) alias[String(r[0]).trim().toUpperCase()] = String(r[1]).trim().toUpperCase();
    });
  }
  const nombres = sh.getRange(PR_PRIMERA + 3, 2, 30, 1).getValues().map(function (r) { return String(r[0]).trim().toUpperCase(); });
  const agregados = [], suma = {}, activo = {}, banda = {};

  filas.forEach(function (r) {
    const k = bloqueDe[Number(r[0])];
    const local = String(r[1]).trim().toUpperCase();
    const col = PR_COL[local];
    if (k == null || !col) { avisos.push('Día o local no válido: ' + r[0] + '-' + r[1]); return; }
    activo[k + '|' + col] = true;
    if (esShow(r) && String(r[4] || '').trim().toUpperCase() === 'BANDA') banda[k + '|' + col] = true;
    if (esShow(r)) {
      const ci = PR_COLS.indexOf(col);
      sh.getRange(PR_RESUMEN + k, PR_DIA_RESUMEN[ci] + 1).setValue(String(r[3]).trim().toUpperCase());
      return;
    }
    String(r[2]).split(',').forEach(function (item) {
      const m = item.trim().match(/^(.+?)\s+(\d+)$/);
      if (!m) return;
      const corto = m[1].trim().toUpperCase();
      const nombre = alias[corto] || corto;
      let off = nombres.indexOf(nombre);
      if (off < 0) {
        off = nombres.indexOf('');
        if (off < 0) { avisos.push('Sin fila vacía para ' + nombre); return; }
        nombres[off] = nombre;
        agregados.push(nombre);
        for (let x = 0; x < PR_BLOQUES; x++) sh.getRange(PR_PRIMERA + x * PR_ALTO + 3 + off, 2).setValue(nombre);
      }
      const key = k + '|' + col + '|' + off;
      suma[key] = (suma[key] || 0) + Number(m[2]);
    });
  });
  Object.keys(suma).forEach(function (key) {
    const p = key.split('|').map(Number);
    sh.getRange(PR_PRIMERA + p[0] * PR_ALTO + 3 + p[2], p[1]).setValue(suma[key]);
  });

  // Presupuesto neto de cada día: el monto de la fila 3 según el día, solo si el local tiene actividad; si no, cero.
  // Con banda tributo se suman $35.000 de batería (Cote, 23 nov)
  const OFF_DIA = { 3: 0, 4: 1, 5: 2, 6: 3, 0: 4 }; // MIE, JUE, VIE, SAB, DOM
  for (let k = 0; k < PR_BLOQUES; k++) {
    const fila = PR_PRIMERA + k * PR_ALTO + 34;
    const x = dias[k];
    PR_COLS.forEach(function (c) {
      const celda = sh.getRange(fila, c);
      if (!x || cerrado(x.d) || !activo[k + '|' + c]) { celda.setValue(0); return; }
      celda.setFormula('=' + letraProg_(c + OFF_DIA[x.wd]) + '$3' + (banda[k + '|' + c] ? '+35000' : ''));
    });
  }

  // Montos de los shows: en la columna siguiente a la del show
  (b.shows || []).forEach(function (s) {
    const k = bloqueDe[Number(s.dia)];
    const ci = PR_COLS.indexOf(PR_COL[String(s.local).toUpperCase()]);
    if (k != null && ci >= 0) sh.getRange(PR_RESUMEN + k, PR_DIA_RESUMEN[ci] + 2).setValue(Number(s.monto) || 0);
  });

  // Diseños de Rodrigo: un flyer por show; Piano Man y Los juegos (antes Bingo de Frida), uno al mes; más la cartelera
  const FILA_DISENO = { MK: 877, PAN: 878, TOB: 879, FRIDA: 880 };
  const dis = {};
  filas.forEach(function (r) {
    if (!esShow(r)) return;
    const loc = String(r[1]).trim().toUpperCase();
    const show = String(r[3]).trim().toUpperCase();
    if (!dis[loc]) dis[loc] = { n: 1, unicos: {} };
    if (show === 'PIANO MAN' || show === 'BINGO DE FRIDA' || show.indexOf('LOS JUEGOS DE') === 0) dis[loc].unicos[show.indexOf('PIANO') === 0 ? 'PIANO' : 'JUEGOS'] = 1;
    else dis[loc].n++;
  });
  Object.keys(FILA_DISENO).forEach(function (loc) {
    const x = dis[loc];
    sh.getRange(FILA_DISENO[loc], 77).setValue(x ? x.n + Object.keys(x.unicos).length : 0);
  });

  // Media manager (Liza): locales por día (fila 853) y cantidad de días (fila 856), de miércoles (BK) a domingo (BO)
  const COL_MM = { 3: 63, 4: 64, 5: 65, 6: 66, 0: 67 };
  const porFecha = {};
  filas.forEach(function (r) {
    if (esShow(r)) return;
    const d = Number(r[0]);
    if (!porFecha[d]) porFecha[d] = {};
    porFecha[d][String(r[1]).trim().toUpperCase()] = 1;
  });
  const mmLoc = {}, mmDias = {};
  Object.keys(porFecha).forEach(function (d) {
    const wd = new Date(anio, mes - 1, Number(d)).getDay();
    mmLoc[wd] = Math.max(mmLoc[wd] || 0, Object.keys(porFecha[d]).length);
    mmDias[wd] = (mmDias[wd] || 0) + 1;
  });
  Object.keys(COL_MM).forEach(function (wd) {
    sh.getRange(853, COL_MM[wd]).setValue(mmLoc[wd] || 0);
    sh.getRange(856, COL_MM[wd]).setValue(mmDias[wd] || 0);
  });

  // Bono de Óscar: lo que trabaja los domingos, en BU866
  let bonoOscar = 0;
  filas.forEach(function (r) {
    const d = Number(r[0]);
    if (esShow(r) || new Date(anio, mes - 1, d).getDay() !== 0) return;
    String(r[2]).split(',').forEach(function (item) {
      const m = item.trim().match(/^OSCAR\s+(\d+)$/i);
      if (m) bonoOscar += Number(m[1]);
    });
  });
  sh.getRange('BU866').setValue(bonoOscar);

  // Billetera (bruto = neto x 1,19): Kennedy en dos (saldo del mes: viernes y sábados, con la batería que ya va en el
  // presupuesto de cada día; y anticipo con los jueves del mes siguiente), Frida y Tobalaba; fecha el día 2 del mes, filas 827 a 842
  SpreadsheetApp.flush();
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const netoLocal = function (c, filtro) {
    let n = 0;
    for (let k = 0; k < PR_BLOQUES; k++) {
      const x = dias[k];
      if (!x || (filtro && !filtro(x))) continue;
      n += Number(sh.getRange(PR_PRIMERA + k * PR_ALTO + 34, c).getValue()) || 0;
    }
    return n;
  };
  const mesSig = mes % 12 + 1, anioSig = mes === 12 ? anio + 1 : anio;
  let juevesSig = 0;
  const ultimoSig = new Date(anioSig, mesSig, 0).getDate();
  for (let d = 1; d <= ultimoSig; d++) if (new Date(anioSig, mesSig - 1, d).getDay() === 4 && PR_CERRADOS.indexOf(d + '-' + mesSig) < 0) juevesSig++;
  const pptoJueves = Number(sh.getRange(3, 4).getValue()) || 0;
  const FACT = [
    ['Factura Kennedy saldo ' + MESES[mes - 1], netoLocal(3, function (x) { return x.wd !== 4; })],
    ['Factura Kennedy anticipo jueves ' + MESES[mesSig - 1], juevesSig * pptoJueves],
    ['Factura Frida ' + MESES[mes - 1], netoLocal(42)],
    ['Factura Tobalaba ' + MESES[mes - 1], netoLocal(32)]
  ];
  const bil = sh.getRange(827, 71, 16, 1);
  const usados = bil.getValues().map(function (r) { return String(r[0]).trim(); });
  // Las facturas que escribe este script y que no son de este mes (por ejemplo, las de noviembre que vienen en la pestaña
  // duplicada) se borran, para no cobrar dos veces. Lo que Cote escribe a mano en la billetera no se toca.
  const propias = FACT.map(function (f) { return f[0]; });
  usados.forEach(function (t, i) {
    if (/^Factura (Kennedy saldo|Kennedy anticipo jueves|Frida|Tobalaba) /.test(t) && propias.indexOf(t) < 0) {
      sh.getRange(827 + i, 71, 1, 3).setValues([['', '', '']]);
      usados[i] = '';
    }
  });
  FACT.forEach(function (f) {
    const texto = f[0], neto = f[1];
    if (!neto) return;
    let i = usados.indexOf(texto);
    if (i < 0) i = usados.indexOf('');
    if (i < 0) { avisos.push('Sin fila libre en la billetera para ' + texto); return; }
    usados[i] = texto;
    sh.getRange(827 + i, 71, 1, 3).setValues([[texto, Math.round(neto * 1.19), new Date(anio, mes - 1, 2)]]);
    sh.getRange(827 + i, 73).setNumberFormat('dd-mm-yyyy');
  });

  if (agregados.length) avisos.unshift('Agregué: ' + agregados.join(', '));
  return avisos;
}
