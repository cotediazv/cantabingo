// TOBALABA — reemplaza la función getPedidos completa de Código.gs por esta.
// Es la misma de hoy, con dos datos más en cada pedido: hora e id (los necesita Sala.gs para
// «Ya cantó», Subir y Bajar desde la Sala de juegos). El resto funciona igual.
// La columna de la hora se busca por su título («hora»); la del ID, por sus valores (P seguido de números).
function getPedidos() {
  const ss = SpreadsheetApp.getActive();
  const hoja = ss.getSheets().find(h => h.getName().replace(/\s+/g, '').toLowerCase().includes('pedidoshoy'));
  const datos = hoja.getDataRange().getDisplayValues();
  let fila = -1, cNom = -1, cCan = -1, cHora = -1;
  for (let i = 0; i < Math.min(15, datos.length) && fila < 0; i++) {
    const t = datos[i].map(x => String(x).toLowerCase());
    const can = t.findIndex(x => x.includes('canci'));
    const nom = t.findIndex(x => x.includes('particip') || x.includes('nombre'));
    if (can >= 0 && nom >= 0) { fila = i; cNom = nom; cCan = can; cHora = t.findIndex(x => x.includes('hora')); }
  }
  if (fila < 0) return [];
  const filas = datos.slice(fila + 1);
  let cId = -1;
  for (let c = 0; c < (datos[0] || []).length && cId < 0; c++) {
    if (filas.some(r => /^P\d{6,}$/.test(String(r[c]).trim()))) cId = c;
  }
  const limpiar = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
  const hc = ss.getSheetByName('Cantados');
  const claves = hc ? hc.getDataRange().getValues().slice(1).filter(r => r[0]).map(r => limpiar(r[0])) : [];
  return filas
    .filter(r => r[cNom] && r[cCan])
    .map(r => ({
      hora: cHora >= 0 ? String(r[cHora]).trim() : '',
      nombre: String(r[cNom]).trim(),
      cancion: String(r[cCan]).trim(),
      id: cId >= 0 ? String(r[cId]).trim() : '',
    }))
    .filter(p => !claves.some(c => c.endsWith(limpiar(p.nombre + ' ' + p.cancion))));
}
