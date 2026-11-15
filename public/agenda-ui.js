/* global views, app, $, esc, api */
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
      const s = JSON.stringify([a.venue, a.show, a.current, a.date]);
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
      if (!$('#sg')) return;
      $('#sg').className = `th-${a.venue}`;
      $('#sg').innerHTML = p ? `<div class="sg-bar"><div class="sg-tag"><small>${esc(a.name)}</small><b>${esc(a.date)}</b></div>
        <div class="sg-main">${p.kind ? `<small>${esc(p.kind)}</small>` : ''}<b style="--n:${p.name.length}">${esc(p.name)}</b></div></div>` : '';
    });
    return () => { stop(); document.body.classList.remove('obs', 'gc-screen'); };
  };

  views.showFull = async () => {
    app.innerHTML = '<div id="sf"></div>';
    const stop = follow((a) => {
      const p = parts(a);
      if (!$('#sf')) return;
      const block = a.blocks.find((b) => b.isShow);
      $('#sf').className = `th-${a.venue}`;
      $('#sf').innerHTML = p ? `<div class="sf-card"><small>${esc(a.name)} · ${esc(a.date)}</small>${p.kind ? `<i>${esc(p.kind)}</i>` : ''}<b style="--n:${p.name.length}">${esc(p.name)}</b>${block ? `<span>${block.time} horas</span>` : ''}</div>`
        : `<div class="sf-card"><small>${esc(a.name)}</small><b style="--n:14">KRB Stage</b><span>Hoy no hay show en cartelera</span></div>`;
    });
    return () => stop();
  };
})();
