/* global views, app, $, esc, api, isAdmin, viewLogin, fail */
// Programación del local: el aviso «A continuación…» que se suma a las otras gráficas, y la vista
// «Show» con el artista de la noche (zócalo para OBS y pantalla completa para el tablero del DJ).
let agendaState = null;
const loadAgenda = async () => { agendaState = await api('GET', '/api/agenda').catch(() => agendaState); return agendaState; };
// Solo las pantallas (OBS y tablero) consultan la programación; los celulares del público no la necesitan
if (/^#\/(escena|gc|obs|tablero)/.test(location.hash)) { loadAgenda(); setInterval(loadAgenda, 30000); }
// Pastilla «A continuación · 21:00 · Stand up: …»; vacía si no hay nada que anunciar o está apagada
// eslint-disable-next-line no-unused-vars
const nextUpHTML = (cls = '') => {
  const a = agendaState;
  if (!a || !a.notice || !a.next) return '';
  return `<div class="next-up ${cls}"><small>A continuación</small><b>${a.next.time}</b><span style="--n:${a.next.label.length}">${esc(a.next.label)}</span></div>`;
};

(() => {
  const follow = (paint) => {
    let last = '';
    let alive = true;
    const tick = async () => {
      const a = await loadAgenda();
      if (!alive || !a) return;
      const s = JSON.stringify([a.venue, a.show, a.current, a.date, a.blocks]);
      if (s === last) return;
      last = s;
      paint(a);
    };
    tick();
    const timer = setInterval(tick, 20000);
    return () => { alive = false; clearInterval(timer); };
  };
  // Qué mostrar: el show de la cartelera de hoy; si hoy no hay, nada
  const parts = (a) => (a.show ? { kind: a.show.kind, name: a.show.name } : null);

  views.showGC = async () => {
    document.body.classList.add('obs', 'gc-screen');
    app.innerHTML = '<div id="sg"></div>';
    const stop = follow((a) => {
      const p = parts(a);
      const block = a.blocks.find((x) => x.isShow);
      if (!$('#sg')) return;
      $('#sg').className = `th-${a.venue}`;
      $('#sg').innerHTML = p ? `<div class="sg-bar"><div class="sg-tag"><small>${esc(a.name)}</small><b>${esc(a.date)}</b></div>
        <div class="sg-main">${p.kind ? `<small>${esc(p.kind)}</small>` : ''}<b style="--n:${p.name.length}">${esc(p.name)}</b></div>
        ${block && block.upcoming ? `<div class="sg-tag sg-side"><small>Horario</small><b>${block.time} hrs</b></div>` : ''}</div>` : '';
      // Simetría: los dos bloques laterales quedan del mismo ancho, con el artista al centro
      const tags = [...document.querySelectorAll('#sg .sg-tag')];
      const wide = Math.max(0, ...tags.map((t) => t.offsetWidth));
      tags.forEach((t) => { t.style.minWidth = `${wide}px`; });
    });
    return () => { stop(); document.body.classList.remove('obs', 'gc-screen'); };
  };

  // Panel del animador: pone el show de hoy en pantalla y muestra la programación del día
  views.showctl = async () => {
    if (!(await isAdmin())) return viewLogin();
    app.innerHTML = `<div class="panel"><h1 style="margin:0">⭐ Show</h1><span class="muted" id="sc-sub"></span>
        <div id="sc-body" style="margin-top:14px"></div>
        <p class="muted small" style="margin-top:12px">La programación se edita en el <a href="#/control">Centro de control</a>.</p>
      </div>
      ${activitiesNav('show')}`;
    await api('POST', '/api/stage', { show: 'show' }).catch(fail); // al entrar, el show pasa a la pantalla
    const stop = follow((a) => {
      if (!$('#sc-body')) return;
      $('#sc-sub').textContent = `${a.name} · ${a.date}`;
      $('#sc-body').innerHTML = `${a.show ? `<div class="vc-read"><small>En pantalla</small>${a.show.kind ? `<em>${esc(a.show.kind)}</em>` : ''}<b>${esc(a.show.name)}</b></div>`
    : '<p class="muted">Hoy no hay show en cartelera: la pantalla de OBS queda sin gráfica.</p>'}
        <div class="vc-list">${a.blocks.map((x) => `<div class="vc-row ${a.current && a.current.time === x.time ? 'on' : ''}"><p><b>${x.time} · ${esc(x.label)}</b><small>${a.current && a.current.time === x.time ? 'Ahora' : x.upcoming ? 'Más tarde' : 'Ya pasó'}</small></p></div>`).join('')}</div>`;
    });
    return () => stop();
  };

  views.showFull = async () => {
    app.innerHTML = '<div id="sf"></div>';
    const stop = follow((a) => {
      const p = parts(a);
      if (!$('#sf')) return;
      const block = a.blocks.find((b) => b.isShow);
      $('#sf').className = `th-${a.venue}`;
      $('#sf').innerHTML = p ? `<div class="sf-card"><small>${esc(a.name)} · ${esc(a.date)}</small>${p.kind ? `<i>${esc(p.kind)}</i>` : ''}<b style="--n:${p.name.length}">${esc(p.name)}</b>${block && block.upcoming ? `<span>${block.time} horas</span>` : ''}</div>`
        : `<div class="sf-card"><small>${esc(a.name)}</small><b style="--n:14">KRB Stage</b><span>Hoy no hay show en cartelera</span></div>`;
    });
    return () => stop();
  };
})();

// Qué se ve en el tablero y en el GC de OBS cuando el escenario es el show (public/core/escenarios.js)
KRB.escenario('show', { full: () => views.showFull(), gc: () => views.showGC(), qrFull: 'br', qrGc: 'above' });
KRB.juego({ id: 'show', menu: 'otros', orden: 11, icon: '⭐', name: 'Show', href: '#/showctl' });
