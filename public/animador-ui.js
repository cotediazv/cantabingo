/* global views, app, $, esc, api, toast, store */
// Sesión del animador (pedido de Cote, 25 nov: «un ingreso distinto en el cual él pueda tener una plataforma… en el
// celular… el tercio inferior del teléfono, viéndolo verticalmente, corresponda a todo lo que tiene que ver con
// decisiones, avanzar, iniciar pregunta… todo lo que tiene que ser en verde… mostrar solamente lo justo y necesario»).
// Respuestas de Cote: 26.1 dirección propia (/animador) con una clave solo para animadores, que se pone en el Centro de
// control; 27.2 también elige el juego siguiente («no tiene que depender de mí»); 28.1 colores universales (verde =
// seguir, rojo = incorrecta, amarillo = pasa, gris = todavía no); los resultados del público en un solo botón verde;
// «Deshacer» pasa a llamarse «Un paso atrás»; 30.1 «¿seguro?» solo en lo que no se puede deshacer; la misma estética de
// todo (la del celular del público y las pantallas); letreros grandes que hay que cerrar para hacer la acción (por
// ejemplo, bajar al público).
// Cómo está hecho: son los mismos paneles de siempre (la misma lógica, ya probada), en modo animador: la clase
// «anim» en el body (solo en la dirección /animador) esconde lo que no es del animador (cartón al centro, refrescar,
// Centro de control, otras actividades, listas de personas, opciones avanzadas), deja el botón verde del paso que sigue y
// los botones de El Rosko fijos en el tercio de abajo, y pone el nombre del juego grande arriba (styles.css, al final).
(() => {
  const ON = /^\/animador/.test(location.pathname);
  window.ANIMADOR = ON;
  if (ON) document.documentElement.classList.add('anim');
  const sync = () => { if (ON) document.body.classList.add('anim'); };
  window.addEventListener('DOMContentLoaded', sync);
  window.addEventListener('hashchange', () => setTimeout(sync, 0));

  // ---------- Ingreso del animador ----------
  views.animador = async () => {
    const me = store.get('adminToken') ? await api('GET', '/api/me').catch(() => ({})) : {};
    if (me.admin) { location.replace(`${location.pathname}#/juegos`); return; }
    app.innerHTML = `<div class="panel an-login"><img src="krb-stage.svg" alt="KRB Stage" class="an-logo"><h1>Animador</h1>
      <p class="muted">Entra con la clave del animador.</p>
      <form id="an-f"><input type="password" id="an-k" autocomplete="current-password" placeholder="Clave" required>
      <button class="primary big" type="submit">Entrar</button></form><p class="an-err" id="an-err"></p></div>`;
    $('#an-f').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', '/api/animador/login', { clave: $('#an-k').value });
        store.set('adminToken', r.token);
        location.replace(`${location.pathname}#/juegos`);
      } catch (err) { $('#an-err').textContent = err.message; }
    };
  };
  if (!ON) return mountControl();

  // ---------- Letreros grandes que hay que cerrar para hacer la acción ----------
  // Bingo: después de los primeros números el botón verde dice «Anda al público»: en el modo animador sale un letrero
  // amarillo grande; al cerrarlo («Listo») se hace la acción
  const SIGNS = [
    { test: /Anda al público/i, title: '🚶 Baja al público', body: 'Ahora el animador baja a las mesas. Las luces te siguen.', ok: '✔ Listo, voy' },
  ];
  let shown = '';
  const sign = () => {
    const b = document.querySelector('.paso-fijo');
    const t = b && !b.disabled ? b.textContent : '';
    const s = SIGNS.find((x) => x.test.test(t));
    const key = s ? t : '';
    if (key === shown) return;
    shown = key;
    const old = document.getElementById('an-sign'); if (old) old.remove();
    if (!s) return;
    const el = document.createElement('div'); el.id = 'an-sign';
    el.innerHTML = `<div class="an-card"><b>${esc(s.title)}</b><p>${esc(s.body)}</p><button type="button" class="big">${esc(s.ok)}</button></div>`;
    el.querySelector('button').onclick = () => { el.remove(); const bb = document.querySelector('.paso-fijo'); if (bb) bb.click(); };
    document.body.appendChild(el);
  };
  setInterval(sign, 400);

  // ---------- «¿Seguro?» solo en lo que no se puede deshacer (30.1) ----------
  const SURE = [[/Confirmar ganador/i, '¿Seguro que confirmas a este ganador?'], [/Aceptar ganador/i, '¿Seguro que aceptas al ganador?']];
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button'); if (!b || b.disabled || b.dataset.sure === 'ok') return;
    const hit = SURE.find(([re]) => re.test(b.textContent));
    if (!hit) return;
    if (!confirm(hit[1])) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---------- Instrucciones como aviso que se cierra tocando cualquier parte (pedido de Cote, 25 nov) ----------
  // «las instrucciones se muestran como un pop-up, el cual él tiene que tocar en cualquier parte de la pantalla y avanza.
  // No tienen que quedar todo el tiempo en pantalla». El recuadro «📢 Instrucciones» del panel no se ve en el modo
  // animador; cuando aparece, sale encima una vez; si el recuadro se va (empezó el juego) y vuelve (otra ronda), sale otra vez.
  const seen = new Set();
  const howto = () => {
    const live = new Set();
    app.querySelectorAll('details.howto').forEach((d) => {
      // con el juego ya empezado el panel esconde el recuadro: no se vuelve a mostrar al reabrir el panel (simulación, 26 nov)
      if (d.closest('.bingo-started, .bingo-done, .rosco-started, .rosco-done')) return;
      const key = `${location.hash}|${d.textContent}`; live.add(key);
      if (seen.has(key) || document.getElementById('an-howto')) return;
      seen.add(key);
      const el = document.createElement('div'); el.id = 'an-howto';
      const t = d.querySelector('summary'); const ul = d.querySelector('ul');
      el.innerHTML = `<div class="an-card"><b>${t ? t.innerHTML : '📢 Instrucciones'}</b>${ul ? ul.outerHTML : ''}<small>Toca para seguir</small></div>`;
      el.onclick = () => el.remove();
      document.body.appendChild(el);
    });
    [...seen].forEach((k) => { if (!live.has(k)) seen.delete(k); });
  };
  setInterval(howto, 500);

  // ---------- El Rosko: al desplegar el ranking de la Trivia, los 5 primeros como aviso (pedido de Cote, 25 nov) ----------
  // «En el rosco en el control del animador al desplegar los resultados del ranking de la trivia mostrarle los 5 primeros
  // como un pop up». Se cierra tocando cualquier parte; sale de nuevo la próxima vez que se despliegue el ranking.
  let rankSeen = '';
  const rankPop = () => {
    const box = app.querySelector('#rosco-ctl #w-rankann .rank-ann');
    if (!box) { rankSeen = ''; return; }
    const items = [...box.querySelectorAll('.rank-ann-list li')].slice(0, 5);
    const key = items.map((li) => li.textContent).join('|') || 'vacio';
    if (key === rankSeen) return;
    rankSeen = key;
    const old = document.getElementById('an-rank'); if (old) old.remove();
    const el = document.createElement('div'); el.id = 'an-rank';
    el.innerHTML = `<div class="an-card"><b>🏅 Ranking de la Trivia · los 5 primeros</b>${items.length ? `<ol>${items.map((li) => li.outerHTML).join('')}</ol>` : '<p>Todavía nadie suma puntos</p>'}<small>Toca para seguir</small></div>`;
    el.onclick = () => el.remove();
    document.body.appendChild(el);
  };
  setInterval(rankPop, 500);

  // ---------- Opciones adicionales, arriba y lejos de los botones del juego (pedido de Cote, 25 nov) ----------
  // «un paso atrás, cambio de turno, reiniciar, preguntas nuevas… como en opciones adicionales, como en una pestañita,
  // cosa de que no moleste el juego». Se llevan a una pestaña arriba a la derecha (dentro de #app, para que sigan
  // funcionando los botones de cada panel).
  const OPTS = '#w-undo, #w-swap, #w-reset, #w-newq, #manual, #dc-reset, #vc-more, details.more';
  const opts = () => {
    const found = [...app.querySelectorAll(OPTS)].filter((b) => !b.closest('#an-opts'));
    let box = document.getElementById('an-opts');
    if (found.length && (!box || !app.contains(box))) {
      box = document.createElement('div'); box.id = 'an-opts';
      box.innerHTML = '<button type="button" class="an-opts-tab">⋯ Opciones</button><div class="an-opts-list"></div>';
      box.querySelector('.an-opts-tab').onclick = () => box.classList.toggle('open');
      box.querySelector('.an-opts-list').addEventListener('click', (e) => { if (e.target.closest('button') && !e.target.closest('summary')) setTimeout(() => box.classList.remove('open'), 0); });
      app.appendChild(box);
    }
    if (box) found.forEach((b) => box.querySelector('.an-opts-list').appendChild(b));
    if (box) box.hidden = !box.querySelector('.an-opts-list').children.length;
  };
  setInterval(opts, 400);
  new MutationObserver(() => opts()).observe(app, { childList: true });

  // El nombre del juego grande arriba, siempre (lo saca del título del panel)
  setInterval(() => {
    const h = app.querySelector('h1');
    document.body.classList.toggle('an-has-title', !!h);
  }, 600);

  function mountControl() {
    // Centro de control: la clave del animador (26.1)
    const mount = async () => {
      if (!/^#\/control\b/.test(location.hash) || document.getElementById('an-box')) return;
      const stage = document.getElementById('stage'); if (!stage) return;
      const r = await api('GET', '/api/animador/clave').catch(() => null); if (!r || document.getElementById('an-box')) return;
      const box = document.createElement('div'); box.className = 'panel'; box.id = 'an-box';
      const url = `${location.origin}/animador`;
      box.innerHTML = `<h2>📱 Animador</h2>
        <p class="muted small">El animador entra desde su teléfono en <b>${esc(url)}</b> (se puede guardar en el inicio como aplicación) con esta clave. Ve solo lo del juego: el botón verde abajo, para ir paso a paso.</p>
        <form class="row" id="an-kf"><input type="text" id="an-kn" minlength="4" autocomplete="off" placeholder="${r.hay ? 'Ya hay clave · escribe otra para cambiarla' : 'Escribe la clave del animador'}"><button class="primary">${r.hay ? 'Cambiar clave' : 'Guardar clave'}</button></form>`;
      const panel = stage.closest('.panel'); panel.parentNode.insertBefore(box, panel.nextSibling);
      box.querySelector('#an-kf').onsubmit = async (e) => {
        e.preventDefault();
        try { await api('POST', '/api/animador/clave', { clave: box.querySelector('#an-kn').value }); box.querySelector('#an-kn').value = ''; toast('Clave del animador guardada'); } catch (err) { toast(err.message); }
      };
    };
    window.addEventListener('hashchange', () => setTimeout(mount, 800));
    setTimeout(mount, 1200);
    setInterval(mount, 3000);
  }
})();
