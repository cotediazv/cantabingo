//@ Enrutador: #/<vista>/<dato> → views[vista]. Parte de la aplicación: se carga en orden desde index.html.
// ---------- Enrutador ----------
let cleanup = null;
async function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  app.onclick = null;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  const screen = !arg && (name === 'gc' || name === 'obs') ? 'escena' : name;
  const view = views[screen || 'home'] || views.home;
  window.scrollTo(0, 0);
  try { cleanup = await view(arg); } catch (e) {
    if (e.status === 401) return viewLogin(); // pantallas de moderador sin sesión iniciada
    app.innerHTML = `<div class="panel"><h1>No se pudo abrir esta página</h1><p>${esc(e.message)}</p><a class="btn primary" href="#/">Volver al inicio</a></div>`;
  }
}
window.addEventListener('hashchange', route);
// Arranca cuando ya cargaron los archivos de todos los juegos
window.addEventListener('DOMContentLoaded', route);

