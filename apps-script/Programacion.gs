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
const PROG_VERSION = 12;

const PR_PRIMERA = 12, PR_ALTO = 39, PR_BLOQUES = 20, PR_RESUMEN = 835;
const PR_COL = { MK: 3, KENNEDY: 3, EV: 12, EVENTOS: 12, KR: 22, KARAROCK: 22, TOB: 32, TOBALABA: 32, FRI: 42, FRIDA: 42, PAN: 52, PANORAMICO: 52 };
const PR_COLS = [3, 12, 22, 32, 42, 52];
const PR_ANTICIPO = [6, 15, 25, 35, 45, 55];
const PR_DIA_RESUMEN = [2, 11, 21, 31, 41, 51];
const PR_NOMBRE_DIA = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
// Locales que maneja la plataforma: Kennedy (C), Tobalaba (AF) y Frida (AP). Eventos, Kararock y Panorámico los llena
// Cote a mano (Cote, 24 nov): el script no borra ni escribe sus montos, presupuestos ni resumen de shows
const PR_PROPIOS = [3, 32, 42];
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
    if (!sh && b.cambios) return respuestaProg_({ error: 'No encuentro la pestaña ' + b.pestana + ': para enviar solo los cambios, la pestaña tiene que existir. Usa «Enviar y llenar el mes».' });
    if (!sh) {
      const ant = ss.getSheetByName(b.anterior);
      if (!ant) return respuestaProg_({ error: 'No encuentro la pestaña ' + b.pestana + ' ni la del mes anterior (' + b.anterior + ')' });
      sh = ant.copyTo(ss).setName(b.pestana);
      creada = true;
      // Al crear la pestaña se borran los anticipos que vienen del mes anterior (Cote, 24 nov): anticipos finales de
      // cada persona (BU793 a BU823) y anticipos de los pagos mensuales (BK864 a BK874). Las fórmulas se mantienen.
      limpiarProg_(sh.getRange('BU793:BU823'));
      limpiarProg_(sh.getRange('BK864:BK874'));
    }
    // B8: el mes y el año como texto (si no, la planilla lo toma como fecha y muestra «noviembre 26» a la derecha)
    sh.getRange('B8').setNumberFormat('@').setValue(String(b.b8).toUpperCase()).setHorizontalAlignment('left');
    // La hoja TURNOS queda con el bloque del mes, como registro
    let t = ss.getSheetByName('TURNOS');
    if (!t) t = ss.insertSheet('TURNOS');
    t.clearContents();
    const ancho = b.filas.reduce(function (n, f) { return Math.max(n, f.length); }, 1);
    const datos = b.filas.map(function (f) { const r = f.slice(); while (r.length < ancho) r.push(''); return r; });
    t.getRange(1, 1, datos.length, ancho).setNumberFormat('@').setValues(datos);
    let avisos = [];
    if (b.llenar || b.cambios) avisos = llenarProg_(ss, sh, b);
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

// Normaliza un nombre para compararlo: sin tildes, en mayúsculas, sin números al final y sin letras repetidas seguidas
// (LORETTO y LORETO quedan iguales)
function normProg_(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s*[X×*]?\s*\d+(?:[.,]\d+)?\s*$/, '')
    .replace(/[^A-ZÑ ]/g, ' ').replace(/(.)\1+/g, '$1').replace(/\s+/g, ' ').trim();
}
// Fila de una persona en la lista de nombres de la pestaña: primero el nombre de EQUIPO, después el nombre igual y al
// final el que empieza con ese nombre (LORETTO → LORETO CANALES). -1 si no está; -2 si hay más de una posible.
function filaDe_(nombres, nombre, corto) {
  const n = nombres.map(normProg_);
  let i = n.indexOf(normProg_(nombre)); if (i >= 0 && n[i]) return i;
  i = n.indexOf(normProg_(corto)); if (i >= 0 && n[i]) return i;
  const pri = normProg_(nombre).split(' ')[0] || normProg_(corto).split(' ')[0];
  const cand = [];
  n.forEach(function (x, j) { if (x && x.split(' ')[0] === pri) cand.push(j); });
  if (cand.length === 1) return cand[0];
  return cand.length > 1 ? -2 : -1;
}

function rango_(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
// Como filaDe_, pero solo entre algunas filas de la lista
function filaEn_(nombres, idxs, nombre, corto) {
  const n = nombres.map(normProg_);
  const a = normProg_(nombre), c = normProg_(corto);
  let hit = idxs.filter(function (j) { return n[j] && n[j] === a; });
  if (!hit.length) hit = idxs.filter(function (j) { return n[j] && n[j] === c; });
  if (!hit.length) { const pri = a.split(' ')[0] || c.split(' ')[0]; hit = idxs.filter(function (j) { return n[j] && n[j].split(' ')[0] === pri; }); }
  // Nombre corto que es el comienzo del nombre (MATI → MATIAS FAJARDO)
  if (!hit.length) { const pri = a.split(' ')[0] || c.split(' ')[0]; if (pri.length >= 3) hit = idxs.filter(function (j) { return n[j] && n[j].split(' ')[0].indexOf(pri) === 0; }); }
  return hit.length === 1 ? hit[0] : hit.length > 1 ? -2 : -1;
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
  // Solo los cambios (Cote, 27 nov): no se borra nada; se escriben solo las celdas que cambiaron desde el último envío
  const parcial = Boolean(b.cambios);
  const C = b.cambios || {};

  // Resumen de shows: SEM 1 a SEM 5 y el día de cada bloque
  if (!parcial) {
  const semanas = [];
  for (let i = 0; i < PR_BLOQUES; i++) semanas.push([i % 4 === 0 ? 'SEM ' + (i / 4 + 1) : '']);
  sh.getRange(PR_RESUMEN, 1, PR_BLOQUES, 1).setValues(semanas);
  PR_DIA_RESUMEN.forEach(function (c) {
    const rg = sh.getRange(PR_RESUMEN, c, PR_BLOQUES, 1);
    const f = rg.getFormulas();
    rg.setValues(f.map(function (r, i) { return [r[0] || (dias[i] ? PR_NOMBRE_DIA[dias[i].wd] + ' ' + dias[i].d : '')]; }));
    if (PR_PROPIOS.indexOf(c + 1) < 0) return;
    limpiarProg_(sh.getRange(PR_RESUMEN, c + 1, PR_BLOQUES, 2)); // show y su monto (Kennedy C y D)
    limpiarProg_(sh.getRange(PR_RESUMEN, c + 5, PR_BLOQUES, 1)); // anticipo del show (Kennedy G)
  });
  for (let k = 0; k < PR_BLOQUES; k++) {
    const top = PR_PRIMERA + k * PR_ALTO;
    // Pagos (Kennedy C) y anticipos (Kennedy F) de toda la lista, de Nicolás Lavé a Dani González, solo de los locales de la plataforma
    PR_COLS.forEach(function (c, i) { if (PR_PROPIOS.indexOf(c) < 0) return; limpiarProg_(sh.getRange(top + 3, c, 30, 1)); limpiarProg_(sh.getRange(top + 3, PR_ANTICIPO[i], 30, 1)); });
  }
  }

  // Nombres cortos → nombres de la planilla (hoja EQUIPO)
  const alias = {};
  const eq = ss.getSheetByName('EQUIPO');
  if (eq && eq.getLastRow() > 1) {
    eq.getRange(2, 1, eq.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0]) alias[String(r[0]).trim().toUpperCase()] = String(r[1]).trim().toUpperCase();
    });
  }
  // Lista de nombres de cada día (columna B, 30 filas; la misma en los 20 días). Secciones que dijo Cote (24 nov),
  // contadas desde la primera fila de la lista (B15 en el primer día): DJ B15-B18, animadores y cantantes B19-B27,
  // Kararock y Liza B28-B31, técnico B32, cámaras verticales B33-B37, cámaras en vivo B38-B41, editores B42-B43,
  // extra (cámara en vivo) B44
  const rgB = sh.getRange(PR_PRIMERA + 3, 2, 30, 1);
  const nombres = rgB.getValues().map(function (r) { return String(r[0]).trim().toUpperCase(); });
  const formB = rgB.getFormulas().map(function (r) { return r[0]; });
  const SEC = { dj: rango_(0, 3), ent: rango_(4, 12), kara: rango_(13, 16), tec: [17], camV: rango_(18, 22), camH: rango_(23, 26), edi: [27, 28], extra: [29] };
  const todas = rango_(0, 29);
  const escribirNombre = function (off, valor) {
    for (let x = 0; x < PR_BLOQUES; x++) {
      const c = sh.getRange(PR_PRIMERA + x * PR_ALTO + 3 + off, 2);
      if (!c.getFormula()) c.setValue(valor);
    }
    nombres[off] = String(valor).toUpperCase();
  };
  // Limpia las filas repetidas que agregaba el script antes (Cote, 24 nov: «Claudia 1.5» o «Loreto» cuando ya está
  // «Loreto Canales»): una fila es repetida si es la misma persona que otra fila más completa de la lista
  const limpiadas = [];
  nombres.forEach(function (n, i) {
    if (!n || formB[i]) return;
    const ni = normProg_(n); const pi = ni.split(' ')[0];
    const otra = nombres.some(function (m, j) {
      if (j === i || !m) return false;
      const nj = normProg_(m);
      if (nj.split(' ')[0] !== pi) return false;
      // Más corta («Loreto» junto a «Loretto Canales») o con números («Claudia 1.5»). El mismo nombre en dos secciones
      // no es repetido: una persona puede estar en dos (Jessica en cantantes y en cámaras)
      return nj.split(' ').length > ni.split(' ').length || (nj === ni && /\d/.test(n) && !/\d/.test(m));
    });
    if (otra) { limpiadas.push(n); escribirNombre(i, ''); }
  });
  if (limpiadas.length) avisos.push('Saqué filas repetidas: ' + limpiadas.join(', '));
  // Fila de una persona según lo que hizo: primero en su sección, después en las parecidas; si no está, en un espacio
  // libre de su sección (por ejemplo, Jessica como cantante va en un espacio libre de animadores y cantantes)
  const ORDEN = { dj: ['dj', 'ent', 'todas'], ent: ['ent', 'dj'], camV: ['camV', 'camH', 'extra', 'todas'], camH: ['camH', 'camV', 'extra', 'todas'], edi: ['edi', 'todas'] };
  const filaArea = function (area, nombre, corto, sinAgregar) {
    const pasos = ORDEN[area] || ['todas'];
    for (let p = 0; p < pasos.length; p++) {
      const idx = pasos[p] === 'todas' ? todas : SEC[pasos[p]];
      const f = filaEn_(nombres, idx, nombre, corto);
      if (f !== -1) return f;
    }
    const sec = sinAgregar ? [] : (SEC[area] || []);
    for (let q = 0; q < sec.length; q++) if (!nombres[sec[q]] && !formB[sec[q]]) { escribirNombre(sec[q], nombre); agregados.push(nombre); return sec[q]; }
    // Sin espacio libre en su sección: va a la fila que ya tiene en otra parte de la lista (Cote, 24 nov: Guille como
    // animador en Tobalaba cae en su fila de cámaras)
    return filaEn_(nombres, todas, nombre, corto);
  };
  const agregados = [], faltan = [], suma = {}, activo = {}, banda = {};

  if (!parcial) filas.forEach(function (r) {
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
    if (b.detalle) return; // los montos van abajo, con el área de cada uno
    String(r[2]).split(',').forEach(function (item) {
      const m = item.trim().match(/^(.+?)\s+(\d+)$/);
      if (!m) return;
      const corto = m[1].trim().toUpperCase();
      const nombre = alias[corto] || corto;
      const off = filaDe_(nombres, nombre, corto);
      if (off === -2) { avisos.push('Hay más de una fila que puede ser ' + corto + ': revisa los nombres en la pestaña o en EQUIPO'); return; }
      if (off < 0) { if (faltan.indexOf(corto) < 0) faltan.push(corto); return; }
      const key = k + '|' + col + '|' + off;
      suma[key] = (suma[key] || 0) + Number(m[2]);
    });
  });
  (parcial ? (C.personas || []) : (b.detalle || [])).forEach(function (d) {
    const k = bloqueDe[Number(d.dia)]; const col = PR_COL[String(d.local).toUpperCase()];
    if (k == null || !col) return;
    const corto = String(d.codigo).trim().toUpperCase();
    const nombre = alias[corto] || corto;
    // Al sacar a alguien (monto 0) solo se busca su fila: nunca se le crea una
    const off = filaArea(d.area, nombre, corto, parcial && !Number(d.monto));
    if (off === -2) { avisos.push('Hay más de una fila que puede ser ' + corto + ': revisa los nombres en la pestaña o en EQUIPO'); return; }
    if (off < 0) { if (faltan.indexOf(corto) < 0) faltan.push(corto); return; }
    const key = k + '|' + col + '|' + off;
    suma[key] = (suma[key] || 0) + Number(d.monto || 0);
  });
  Object.keys(suma).forEach(function (key) {
    const p = key.split('|').map(Number);
    sh.getRange(PR_PRIMERA + p[0] * PR_ALTO + 3 + p[2], p[1]).setValue(suma[key] || '');
  });

  // Presupuesto neto de cada día: el monto de la fila 3 según el día, solo si el local tiene actividad; si no, cero.
  // Con banda tributo se suman $35.000 de batería (Cote, 23 nov)
  const OFF_DIA = { 3: 0, 4: 1, 5: 2, 6: 3, 0: 4 }; // MIE, JUE, VIE, SAB, DOM
  if (parcial) (C.presupuesto || []).forEach(function (p) {
    const k = bloqueDe[Number(p.dia)]; const c = PR_COL[String(p.local).toUpperCase()];
    if (k == null || PR_PROPIOS.indexOf(c) < 0) return;
    if (p.activo) activo[k + '|' + c] = true;
    if (p.banda) banda[k + '|' + c] = true;
  });
  const pptoCambio = {};
  (C.presupuesto || []).forEach(function (p) { const k = bloqueDe[Number(p.dia)]; if (k != null) pptoCambio[k + '|' + PR_COL[String(p.local).toUpperCase()]] = true; });
  for (let k = 0; k < PR_BLOQUES; k++) {
    const fila = PR_PRIMERA + k * PR_ALTO + 34;
    const x = dias[k];
    PR_PROPIOS.forEach(function (c) {
      if (parcial && !pptoCambio[k + '|' + c]) return;
      const celda = sh.getRange(fila, c);
      if (!x || cerrado(x.d) || !activo[k + '|' + c]) { celda.setValue(0); return; }
      celda.setFormula('=' + letraProg_(c + OFF_DIA[x.wd]) + '$3' + (banda[k + '|' + c] ? '+35000' : ''));
    });
  }

  // Montos de los shows: en la columna siguiente a la del show
  if (!parcial) (b.shows || []).forEach(function (s) {
    const k = bloqueDe[Number(s.dia)];
    const ci = PR_COLS.indexOf(PR_COL[String(s.local).toUpperCase()]);
    if (k != null && ci >= 0) sh.getRange(PR_RESUMEN + k, PR_DIA_RESUMEN[ci] + 2).setValue(Number(s.monto) || 0);
  });
  // Solo los cambios: el show (nombre y monto) de los días que cambiaron
  if (parcial) (C.shows || []).forEach(function (s) {
    const k = bloqueDe[Number(s.dia)];
    const ci = PR_COLS.indexOf(PR_COL[String(s.local).toUpperCase()]);
    if (k == null || ci < 0 || PR_PROPIOS.indexOf(PR_COLS[ci]) < 0) return;
    sh.getRange(PR_RESUMEN + k, PR_DIA_RESUMEN[ci] + 1).setValue(String(s.nombre || '').toUpperCase());
    sh.getRange(PR_RESUMEN + k, PR_DIA_RESUMEN[ci] + 2).setValue(s.monto == null ? '' : Number(s.monto) || 0);
  });

  // Diseños de Rodrigo: un flyer por show; Piano Man y Los juegos (antes Bingo de Frida; desde el 28 nov «Noche de juegos» y «Tarde de juegos»), uno al mes; más la cartelera
  const FILA_DISENO = { MK: 877, TOB: 879, FRIDA: 880 }; // Panorámico (878) lo maneja Cote
  const dis = {};
  filas.forEach(function (r) {
    if (!esShow(r)) return;
    const loc = String(r[1]).trim().toUpperCase();
    const show = String(r[3]).trim().toUpperCase();
    if (!dis[loc]) dis[loc] = { n: 1, unicos: {} };
    if (show === 'PIANO MAN' || show === 'BINGO DE FRIDA' || show === 'TARDE DE JUEGOS' || show === 'NOCHE DE JUEGOS' || show.indexOf('LOS JUEGOS DE') === 0) dis[loc].unicos[show.indexOf('PIANO') === 0 ? 'PIANO' : 'JUEGOS'] = 1;
    else dis[loc].n++;
  });
  if (!parcial || (C.shows || []).length) Object.keys(FILA_DISENO).forEach(function (loc) {
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
  if (!parcial || (C.personas || []).length || (C.presupuesto || []).length) Object.keys(COL_MM).forEach(function (wd) {
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
  if (!parcial || (C.personas || []).some(function (p) { return /^OSCAR/i.test(String(p.codigo)); })) sh.getRange('BU866').setValue(bonoOscar);

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
  const sinAnticipo = anio * 12 + mes >= 2026 * 12 + 12;
  const FACT = [
    // Desde diciembre de 2026 ya no hay anticipo (Cote, 23 nov): la factura de Kennedy es el total del mes, jueves incluidos
    sinAnticipo ? ['Factura Kennedy saldo ' + MESES[mes - 1], netoLocal(3)] : ['Factura Kennedy saldo ' + MESES[mes - 1], netoLocal(3, function (x) { return x.wd !== 4; })],
    sinAnticipo ? ['', 0] : ['Factura Kennedy anticipo jueves ' + MESES[mesSig - 1], juevesSig * pptoJueves],
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
  if (!parcial || (C.presupuesto || []).length) FACT.forEach(function (f) {
    const texto = f[0], neto = f[1];
    if (!neto) return;
    let i = usados.indexOf(texto);
    if (i < 0) i = usados.indexOf('');
    if (i < 0) { avisos.push('Sin fila libre en la billetera para ' + texto); return; }
    usados[i] = texto;
    sh.getRange(827 + i, 71, 1, 3).setValues([[texto, Math.round(neto * 1.19), new Date(anio, mes - 1, 2)]]);
    sh.getRange(827 + i, 73).setNumberFormat('dd-mm-yyyy');
  });

  if (agregados.length) avisos.unshift('Puse en un espacio libre de su sección a: ' + agregados.join(', '));
  if (faltan.length) avisos.unshift('No encontré en la pestaña a: ' + faltan.join(', ') + '. Agrégalos a mano en su fila (o en la hoja EQUIPO) y vuelve a enviar; sus montos de esos días no se escribieron');
  return avisos;
}
