//@ El botón que sigue: siempre verde y en el mismo lugar. Parte de la aplicación: se carga en orden desde index.html.
// ---------- El botón que sigue: siempre verde y siempre en el mismo lugar ----------
// Pedido de Cote (23 nov): «el botón que el animador tiene que apretar tiene que estar en verde… debería estar siempre en
// el mismo lugar». Los paneles marcan con la clase «paso» el botón del paso que sigue (bingo: generar número, desempatar,
// confirmar ganador; sorteo de concursantes; Festival y objeto; sorteo y votación del juego; volver al juego en curso).
// Aquí se elige uno solo (el de menor «data-paso»; primero los que se pueden apretar) y se deja fijo arriba de la
// página, a todo el ancho; el resto del panel baja lo que mide el botón. El Rosko queda como está (ahí son 3 botones).
(() => {
  let queued = false; let cur = null;
  const pick = () => {
    queued = false;
    const all = [...app.querySelectorAll('.paso')].filter((b) => b.getClientRects().length);
    const pri = (b) => Number(b.dataset.paso || 5);
    const best = all.filter((b) => !b.disabled).sort((x, y) => pri(x) - pri(y))[0] || all.sort((x, y) => pri(x) - pri(y))[0] || null;
    if (best !== cur) { if (cur) cur.classList.remove('paso-fijo'); cur = best; if (cur) cur.classList.add('paso-fijo'); }
    document.body.classList.toggle('con-paso', !!cur);
    const h = cur ? `${Math.ceil(cur.getBoundingClientRect().height)}px` : '';
    if (document.documentElement.style.getPropertyValue('--paso-h') !== h) document.documentElement.style.setProperty('--paso-h', h);
  };
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(pick); } };
  // al redibujarse un panel el botón nuevo queda fijo antes de que se pinte la pantalla (sin saltos)
  new MutationObserver(() => { if (!queued) pick(); }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'class', 'open'] });
  window.addEventListener('resize', later);
})();
