// Sala de juegos (cantabingo.onrender.com): «Ya cantó», Subir y Bajar desde el panel del animador.
// Hace lo mismo que los botones de AppSheet y nada más:
//   «Ya cantó» → agrega una fila en «Cantados»: Clave = Hora Participante Canción / Artista, Fecha = ahora
//   Subir      → agrega una fila en «Orden»: ID del pedido y -1
//   Bajar      → agrega una fila en «Orden»: ID del pedido y +1
// No cambia ni borra ninguna otra hoja, columna ni fórmula.
// Pide una clave guardada en Configuración del proyecto → Propiedades del script → SALA_CLAVE.
// La clave nunca se escribe en este código ni en documentos compartidos.
// Va en un archivo nuevo llamado Sala. Usa getPedidos() del archivo Código.gs, que debe entregar el id.

function doPost(e) {
  let salida;
  const lock = LockService.getScriptLock();
  let conLock = false;
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const clave = PropertiesService.getScriptProperties().getProperty('SALA_CLAVE');
    if (!clave || String(b.clave || '') !== clave) throw new Error('Clave incorrecta');
    lock.waitLock(10000); // si AppSheet o la Sala están escribiendo al mismo tiempo, espera su turno
    conLock = true;
    const ss = SpreadsheetApp.getActive();
    // Solo se aceptan pedidos que están en la lista de este momento
    const p = getPedidos().find(x => String(x.id || '') !== '' && String(x.id) === String(b.id || ''));
    if (!p) throw new Error('Ese pedido ya no está en la lista');
    if (b.accion === 'cantado') {
      if (String(p.nombre) !== String(b.nombre) || String(p.cancion) !== String(b.cancion)) throw new Error('La lista cambió; vuelve a intentarlo');
      const hoja = ss.getSheetByName('Cantados');
      hoja.appendRow([horaDelPedido_(ss, p.id, formatoClave_(hoja)) + ' ' + p.nombre + ' ' + p.cancion, new Date()]);
    } else if (b.accion === 'subir') {
      ss.getSheetByName('Orden').appendRow([p.id, -1]);
    } else if (b.accion === 'bajar') {
      ss.getSheetByName('Orden').appendRow([p.id, 1]);
    } else {
      throw new Error('Acción desconocida');
    }
    SpreadsheetApp.flush();
    salida = { ok: true };
  } catch (err) {
    salida = { error: String(err && err.message || err) };
  } finally {
    if (conLock) lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify(salida))
    .setMimeType(ContentService.MimeType.JSON);
}

// La clave de «Cantados» empieza con la hora del pedido tal como la escribe AppSheet en ese local:
// en Tobalaba con fecha (11/13/2026 21:48:21) y en Kennedy solo la hora (01:27:30).
// El formato se copia de la última fila de «Cantados» que tenga uno de los dos; si no hay ninguna, solo la hora.
// Si algún día hace falta fijarlo a mano: propiedad del script SALA_FORMATO_HORA (ej. MM/dd/yyyy HH:mm:ss).
function formatoClave_(hoja) {
  const fijo = PropertiesService.getScriptProperties().getProperty('SALA_FORMATO_HORA');
  if (fijo) return fijo;
  const filas = hoja.getDataRange().getDisplayValues();
  for (let i = filas.length - 1; i >= 1; i--) {
    const c = String(filas[i][0]).trim();
    if (/^\d{1,2}\/\d{1,2}\/\d{4} \d{1,2}:\d{2}:\d{2} /.test(c)) return 'MM/dd/yyyy HH:mm:ss';
    if (/^\d{1,2}:\d{2}:\d{2} /.test(c)) return 'HH:mm:ss';
  }
  return 'HH:mm:ss';
}

// Hora del pedido igual que AppSheet: la «Marca temporal» del formulario, con los segundos cortados
// (no redondeados). El ID es «P» + la marca temporal en segundos REDONDEADA, así que se usa para
// encontrar la respuesta: se busca, en las hojas cuyo título de A1 es «Marca temporal» (o Timestamp),
// la fila cuya marca redondeada da ese mismo ID. Si no aparece, se usa la hora que sale del ID.
function horaDelPedido_(ss, id, formato) {
  const buscado = Number(String(id).replace(/^P/, ''));
  const zona = ss.getSpreadsheetTimeZone();
  for (const h of ss.getSheets()) {
    const titulo = String(h.getRange(1, 1).getDisplayValue()).toLowerCase();
    if (!titulo.includes('marca temporal') && !titulo.includes('timestamp')) continue;
    const n = h.getLastRow() - 1;
    if (n < 1) continue;
    const col = h.getRange(2, 1, n, 1).getValues();
    for (let i = col.length - 1; i >= 0; i--) {
      const d = col[i][0];
      if (!(d instanceof Date)) continue;
      // Fecha y hora de la planilla (su zona horaria) → número de serie → segundos, igual que la fórmula del ID
      const local = Utilities.formatDate(d, zona, 'yyyy-MM-dd HH:mm:ss.SSS');
      const ms = Date.parse(local.replace(' ', 'T') + 'Z');
      if (Math.round((ms / 86400000 + 25569) * 86400) === buscado) return Utilities.formatDate(d, zona, formato || 'HH:mm:ss');
    }
  }
  return fechaHoraDeId_(id, formato);
}

// El ID es «P» + la marca temporal en segundos (número de serie de la planilla × 86400),
// así que de ahí sale la fecha y hora del pedido (puede quedar un segundo arriba por el redondeo).
function fechaHoraDeId_(id, formato) {
  const segundos = Number(String(id).replace(/^P/, ''));
  const ms = Math.round((segundos / 86400 - 25569) * 86400000); // 25569 = días entre 30/12/1899 y 1/1/1970
  return Utilities.formatDate(new Date(ms), 'UTC', formato || 'HH:mm:ss');
}
