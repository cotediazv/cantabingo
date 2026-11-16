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
      ss.getSheetByName('Cantados').appendRow([p.hora + ' ' + p.nombre + ' ' + p.cancion, new Date()]);
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
