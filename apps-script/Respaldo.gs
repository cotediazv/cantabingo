/**
 * Respaldo de la Sala de juegos en Google Drive (capa B del respaldo diario; Code 0, 28 nov).
 * LISTO PERO APAGADO: solo funciona cuando Cote lo publica y pone RESPALDO_URL y RESPALDO_CLAVE en Render.
 *
 * Qué hace: recibe una vez al día (05:00, hora de Chile) la copia comprimida de los datos de la Sala y la guarda en la
 * carpeta privada «Respaldos Sala» del Drive de quien publica el script. Borra solas las copias de más de 60 días.
 *
 * La clave NO va en este código: se guarda en Propiedades del script (paso 4) con el nombre CLAVE.
 *
 * PASO A PASO (unos 10 minutos, una sola vez):
 *  1. Entrar a script.google.com con la cuenta de Google de KRB y tocar «Nuevo proyecto».
 *  2. Ponerle de nombre «Respaldo Sala» (arriba a la izquierda).
 *  3. Borrar lo que trae y pegar todo este archivo. Guardar (ícono del disquete).
 *  4. Rueda «Configuración del proyecto» → «Propiedades del script» → «Agregar propiedad del script»:
 *     Propiedad: CLAVE · Valor: una clave larga inventada (la misma que va en Render como RESPALDO_CLAVE). Guardar.
 *  5. Volver al editor, elegir la función «probar» y tocar «Ejecutar»; aceptar los permisos de Drive que pide Google.
 *     Debe aparecer en el Drive la carpeta «Respaldos Sala» con un archivo «prueba.txt» (se puede borrar).
 *  6. «Implementar» → «Nueva implementación» → tipo «Aplicación web»:
 *     Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario. Tocar «Implementar» y copiar la URL que termina en /exec.
 *  7. En Render → cantabingo → Environment, agregar RESPALDO_URL (la URL del paso 6) y RESPALDO_CLAVE (la del paso 4).
 *  8. Al día siguiente, en el Centro de control → «Respaldo de los datos» debe decir «Drive: llegó»
 *     (o tocar «Respaldar ahora» para probar al tiro).
 */
var CARPETA = 'Respaldos Sala';
var DIAS = 60;

function carpeta_() {
  var it = DriveApp.getFoldersByName(CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
}

function responder_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var clave = PropertiesService.getScriptProperties().getProperty('CLAVE');
    if (!clave || b.clave !== clave) return responder_({ ok: false, error: 'No autorizado' });
    var nombre = String(b.nombre || '');
    if (!/^respaldo-\d{4}-\d{2}-\d{2}\.json\.gz$/.test(nombre)) return responder_({ ok: false, error: 'Nombre no válido' });
    var datos = Utilities.base64Decode(String(b.datos || ''));
    var dir = carpeta_();
    var viejos = dir.getFilesByName(nombre); // si ese día se respaldó dos veces, queda la última
    while (viejos.hasNext()) viejos.next().setTrashed(true);
    dir.createFile(Utilities.newBlob(datos, 'application/gzip', nombre));
    limpiar_(dir);
    return responder_({ ok: true });
  } catch (err) {
    return responder_({ ok: false, error: String(err) });
  }
}

// Borra las copias de más de 60 días
function limpiar_(dir) {
  var limite = Date.now() - DIAS * 24 * 3600 * 1000;
  var it = dir.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^respaldo-/.test(f.getName()) && f.getDateCreated().getTime() < limite) f.setTrashed(true);
  }
}

// Paso 5: crea la carpeta y pide los permisos de Drive
function probar() {
  carpeta_().createFile('prueba.txt', 'Prueba del respaldo de la Sala: se puede borrar.');
}
