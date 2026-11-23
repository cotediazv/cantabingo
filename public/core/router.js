//@ Enrutador: #/<vista>/<dato> → views[vista]. Parte de la aplicación: se carga en orden desde index.html.
// ---------- Enrutador ----------
let cleanup = null;
const REDIRECTS = {
  proyectos: '#/control', // «Mis proyectos»: la sala se crea desde el Centro de control
  admin: (pid) => (pid ? `#/anfitrion/${pid}` : '#/juegos'), // «Administración»: ahora en «Más opciones» del panel del bingo
  sesiones: '#/jugar', // lista de sesiones públicas: hay una sola sala a la vez
  ruedas: '#/sorteoctl', // lista de roskos: El Rosko parte con el sorteo de concursantes
  ruedanueva: '#/sorteoctl',
};
async function route() {
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  app.onclick = null;
  const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
  // Páginas que ya no existen (23 nov): sus direcciones guardadas llevan a donde quedó lo suyo
  const to = Object.prototype.hasOwnProperty.call(REDIRECTS, name) ? REDIRECTS[name] : null;
  if (to) { location.replace(`${location.pathname}${location.search}${typeof to === 'function' ? to(arg) : to}`); return undefined; }
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

