//@ Menú de juegos y actividades de los paneles (GAME_INFO, activitiesNav). Parte de la aplicación: se carga en orden desde index.html.
// Menú de abajo en el panel de todos los juegos (pedido de Cote): «Sortear juego» y después los juegos con su ícono;
// más abajo, las demás actividades
// Íconos, nombres y paneles de cada juego: los registra cada juego en su archivo con KRB.juego (public/core/escenarios.js)
const GAME_INFO = (venue) => KRB.gameInfo(venue);
// Menú de juegos (pedido de Cote, 21 nov): tres botones grandes, «Manual», «Por sorteo» y «Por votación», y nada más;
// al tocar uno se despliega lo de esa modalidad en su momento (Manual: los juegos para tocar; Por sorteo: cuántos juegos
// y el botón del sorteo, y los juegos solo para elegir directo después de «Iniciar sorteo»; Por votación: la votación).
// En el lobby (opts.lobby) no van las otras actividades.
function activitiesNav(current, opts = {}) {
  // Los juegos (los que se pueden elegir como el que sigue) y las otras actividades salen del registro (KRB.juego)
  const games = KRB.menu('juego').map((j) => [j.id, j.boton ? `<button type="button" ${j.boton} data-game="${j.id}"><span>${j.icon}</span>${j.label}</button>`
    : `<a class="btn" data-game="${j.id}" href="${j.href}"><span>${j.icon}</span>${j.label}</a>`]);
  const more = KRB.menu('otros').map((j) => [j.id, j.boton ? `<button type="button" ${j.boton}><span>${j.icon}</span>${j.label}</button>`
    : `<a class="btn" href="${j.href}"><span>${j.icon}</span>${j.label}</a>`]);
  setTimeout(paintGameNav, 0);
  return `<div class="act-nav games-nav ${navFoldState() ? 'g-folded' : ''}${opts.lobby ? ' g-lobby' : ''}"><button type="button" class="g-unfold" data-nav-unfold>▸ Ver otros juegos y actividades</button>
    <div class="g-modes" role="tablist"><button type="button" role="tab" data-draw-mode="manual"><span>👆</span>Manual</button><button type="button" role="tab" data-draw-mode="sorteo"><span>🎲</span>Por sorteo</button><button type="button" role="tab" data-draw-mode="votacion"><span>🗳️</span>Por votación</button></div>
    <section class="g-body"><p class="g-free-title">👆 Toca el siguiente juego</p><section class="g-vote"></section>
    <div class="g-plan"><div class="g-slots"></div><label>¿Cuántos juegos vamos a sortear?<input type="number" class="g-total" min="1" max="10" value="3"></label></div>
    <button type="button" class="primary big g-draw paso" data-paso="9" data-game-draw>🎲 Sortear juego</button>
    <button type="button" class="g-undo" data-game-undo disabled>↩️ Deshacer</button>
    <p class="g-direct" hidden>…o toca un juego para elegirlo directo, sin tómbola</p>
    <div class="g-games">${games.map(([k, h]) => (k === current ? h.replace(/data-game="/, 'aria-current="true" data-game="') : h)).join('')}</div></section>
    ${opts.lobby ? '' : `<small>Otras actividades</small><div>${more.filter(([k]) => k !== current).map(([, h]) => h).join('')}</div>`}</div>`;
}
// Modalidad desplegada en el menú: ninguna al entrar (solo los tres botones), salvo que haya algo a medio hacer en una
// (un sorteo iniciado o una votación abierta o con segunda vuelta pendiente), que se despliega sola
let navOpen = null;
window.addEventListener('hashchange', () => { navOpen = null; });
const applyNavOpen = (ready) => {
  document.querySelectorAll('.games-nav').forEach((n) => {
    n.classList.toggle('g-open', !!navOpen);
    n.classList.toggle('g-free', navOpen === 'manual');
    n.classList.toggle('g-smode', navOpen === 'sorteo');
    n.classList.toggle('g-vmode', navOpen === 'votacion');
    if (ready !== undefined) n.classList.toggle('g-ready', ready && navOpen === 'sorteo');
  });
  document.querySelectorAll('[data-draw-mode]').forEach((b) => { const on = b.dataset.drawMode === navOpen; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
};
window.openNavMode = (how) => { if (!navOpen) { navOpen = how; applyNavOpen(); } };
// Pedido de Cote (20 nov): mientras hay un juego en curso, el menú de juegos y actividades queda plegado, para no
// apretar otro por error; «Ver otros juegos y actividades» lo abre. Cada panel avisa si su juego está en curso.
let navInGame = null; let navOpened = false;
const navFoldState = () => !!navInGame && !navOpened;
window.setNavFold = (inGame) => {
  if (inGame !== navInGame) { navInGame = inGame; navOpened = false; }
  document.querySelectorAll('.games-nav').forEach((n) => n.classList.toggle('g-folded', navFoldState()));
};
window.addEventListener('hashchange', () => { navInGame = null; navOpened = false; });
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-nav-unfold]')) return;
  navOpened = true;
  document.querySelectorAll('.games-nav').forEach((n) => n.classList.remove('g-folded'));
});
// Marca en el menú los juegos que ya salieron en el sorteo (quedan fuera del sorteo hasta que salgan los demás)
async function paintGameNav() {
  const g = await api('GET', '/api/gamedraw').catch(() => null);
  if (!g) return;
  const info = GAME_INFO(g.venue);
  const how = g.how || (g.free ? 'manual' : 'sorteo'); // pestaña elegida: «Manual», «Por sorteo» o «Por votación»
  document.querySelectorAll('.g-fest').forEach((b) => { b.textContent = info.festival.name; });
  document.querySelectorAll('[data-game]').forEach((el) => { const done = how === 'sorteo' && g.played.includes(el.dataset.game); el.classList.toggle('g-played', done); el.title = done ? 'Salió en el último sorteo: queda fuera del próximo' : ''; });
  // Casilleros de la noche y botón: «Sortear el 2.º juego (de 3)»; al completar, se desactiva
  document.querySelectorAll('.g-total').forEach((i) => { if (document.activeElement !== i) i.value = g.total; });
  const slots = []; // la noche ya no parte con un bingo (pedido de Cote, 21 nov): 1.º, 2.º, 3.º…
  for (let i = 0; i < g.total; i++) slots.push(g.list[i] ? `<span class="done">${i + 1}.º · ${info[g.list[i]].icon} ${esc(info[g.list[i]].name)}</span>` : `<span>${i + 1}.º · 🔒</span>`);
  document.querySelectorAll('.g-slots').forEach((el) => { el.innerHTML = slots.join(''); });
  const full = g.list.length >= g.total;
  const ready = how === 'sorteo' && !full && !!g.ready && (!g.last || g.ready.at > g.last.at);
  // Pedido de Cote (20 nov): cuántos juegos y sus números se ven solo antes de empezar el sorteo; después se ocultan
  document.querySelectorAll('.g-plan').forEach((el) => { el.hidden = g.list.length > 0 || ready; });
  window.gameDrawReady = ready;
  if (!navOpen && ready) navOpen = 'sorteo'; // un sorteo iniciado (también desde otro equipo) se despliega solo
  applyNavOpen(ready);
  if (window.paintGvote) window.paintGvote(how);
  document.querySelectorAll('[data-game-draw]').forEach((b) => { b.disabled = full; b.textContent = full ? `✔ Ya se sortearon los ${g.total} juegos` : ready ? `🎰 Girar la tómbola · ${g.list.length + 1}.º juego` : `🎲 Iniciar sorteo del ${g.list.length + 1}.º juego (de ${g.total})`; });
  document.querySelectorAll('.g-direct').forEach((el) => { el.hidden = !ready; });
  document.querySelectorAll('[data-game-undo]').forEach((b) => { b.disabled = !g.undoable; });
}
document.addEventListener('change', async (e) => {
  if (!e.target.classList || !e.target.classList.contains('g-total')) return;
  try { await api('POST', '/api/gamedraw/total', { total: e.target.value }); } catch (err) { fail(err); }
  paintGameNav();
});
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-game-draw]');
  if (!b || b.disabled) return;
  b.disabled = true;
  try {
    if (!window.gameDrawReady) { // primer clic: las pantallas muestran los juegos que pueden salir
      await api('POST', '/api/gamedraw/ready');
      toast('En pantalla: los juegos que pueden salir. Ahora gira la tómbola o elige un juego directo.');
      await paintGameNav();
      return;
    }
    const g = await api('POST', '/api/gamedraw');
    window.gameDrawReady = false;
    const info = GAME_INFO((await api('GET', '/api/gamedraw')).venue)[g.last.game];
    toast(`🎲 Se está sorteando en pantalla… Salió: ${info.icon} ${info.name}`);
    window.gameDrawGo = setTimeout(() => { if (g.last.game === 'bingo') backToBingo(); else location.hash = info.href; }, 6000); // cuando termina la tómbola en pantalla, el panel pasa a ese juego
  } catch (err) { fail(err); b.disabled = false; }
});
// Botones de modalidad (pedido de Cote, 21 nov): al tocar uno se despliega su menú y queda elegido en el servidor
// (un sorteo o una votación a medio hacer de otra modalidad se cancela); tocar el desplegado lo vuelve a plegar
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-draw-mode]');
  if (!b) return;
  const how = b.dataset.drawMode;
  clearTimeout(window.gameDrawGo);
  if (navOpen === how) { navOpen = null; applyNavOpen(false); return; }
  navOpen = how;
  if (how !== 'sorteo') window.gameDrawReady = false;
  applyNavOpen(false); // se despliega al instante, sin esperar al servidor
  const g = await api('GET', '/api/gamedraw').catch(() => null);
  if (!g || (g.how || (g.free ? 'manual' : 'sorteo')) !== how) { try { await api('POST', '/api/gamedraw/mode', { how }); } catch (err) { fail(err); } }
  if (how === 'votacion' && window.startGvIntro) await window.startGvIntro(); // primero, en pantalla, las reglas y cada juego (pedido de Cote)
  paintGameNav();
});
// Deshacer (pedido de Cote): vuelve el sorteo de juegos al paso anterior (antes de «Iniciar sorteo», de la tómbola
// o de elegir un juego directo)
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-game-undo]');
  if (!b || b.disabled) return;
  b.disabled = true;
  clearTimeout(window.gameDrawGo); // si la tómbola recién giró, el panel ya no pasa a ese juego
  try { await api('POST', '/api/gamedraw/undo'); toast('↩️ Sorteo de juegos: se volvió al paso anterior'); } catch (err) { fail(err); }
  paintGameNav();
});
// Elegir un juego directo (pedido de Cote): después de «Iniciar sorteo de juegos», tocar un juego del menú lo deja como
// el siguiente de la noche, sin tómbola; el panel pasa a ese juego
document.addEventListener('click', async (e) => {
  const el = e.target.closest('.games-nav [data-game]');
  if (!el) return;
  // «Elegir libremente»: el juego empieza de cero, sin número de la noche, y el panel pasa a él
  const nav = el.closest('.games-nav');
  if (nav && nav.classList.contains('g-free')) {
    e.preventDefault(); e.stopImmediatePropagation();
    try { await api('POST', '/api/gamedraw/free', { game: el.dataset.game }); } catch (err) { fail(err); return; }
    if (el.dataset.game === 'bingo') backToBingo(); else location.hash = el.getAttribute('href');
    return;
  }
  if (!window.gameDrawReady) return;
  e.preventDefault(); e.stopImmediatePropagation();
  try {
    const g = await api('POST', '/api/gamedraw/pick', { game: el.dataset.game });
    window.gameDrawReady = false;
    const info = GAME_INFO((await api('GET', '/api/gamedraw')).venue)[g.last.game];
    toast(`Siguiente juego: ${info.icon} ${info.name}`);
    if (g.last.game === 'bingo') backToBingo(); else location.hash = info.href;
  } catch (err) { fail(err); }
}, true);
// Menú de abajo del sorteo de concursantes y de El Rosko: se arma cuando ya cargaron los juegos (se registran después)
let BACK_BINGO = '';
window.addEventListener('DOMContentLoaded', () => { BACK_BINGO = activitiesNav('rosco'); });
