//@ Karaoke: buscador de canciones y panel del animador. Parte de la aplicación: se carga en orden desde index.html.
// ---------- Karaoke: buscador de canciones ----------
// Mientras la persona escribe, se consulta el catálogo de iTunes y se ofrecen canciones reales;
// al tocar una, se llenan solos la canción y el artista. Es una ayuda: también se puede escribir a mano.
// La consulta sale del propio celular; si el navegador no lo permite, pasa por nuestro servidor.
const tidySongs = (results) => {
  const seen = new Set();
  return (results || []).map((x) => ({ song: (String(x.trackName || x.song || '').replace(/\s*[(（][^)）]*[)）]?/g, ' ').replace(/\s+/g, ' ').trim() || String(x.trackName || x.song || '').trim()), artist: String(x.artistName || x.artist || '').trim() }))
    .filter((x) => x.song && x.artist && !seen.has(`${x.song}|${x.artist}`.toLowerCase()) && seen.add(`${x.song}|${x.artist}`.toLowerCase())).slice(0, 5);
};
let songDirect = true; // se apaga si el celular no logra hablar directo con iTunes
async function songSearch(term) {
  if (songDirect) {
    try {
      const r = await fetch(`https://itunes.apple.com/search?media=music&entity=song&limit=10&country=CL&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(4000) });
      if (!r.ok) throw new Error('itunes');
      return tidySongs((await r.json()).results);
    } catch { songDirect = false; }
  }
  try { return tidySongs((await (await fetch(`/api/songs?q=${encodeURIComponent(term)}`)).json()).list); } catch { return []; }
}
function wireSongSearch(form) {
  const pairs = { song: 'artist', altSong: 'altArtist' };
  let timer = null;
  let turn = 0;
  form.addEventListener('input', (e) => {
    const field = e.target.name;
    if (!pairs[field]) return;
    const box = form.querySelector(`[data-sug="${field}"]`);
    const term = e.target.value.trim();
    clearTimeout(timer);
    if (term.length < 3) { box.innerHTML = ''; return; }
    const mine = ++turn;
    timer = setTimeout(async () => {
      const list = await songSearch(term);
      if (mine !== turn || !form.isConnected) return; // llegó tarde: la persona siguió escribiendo
      box.innerHTML = list.map((x) => `<button type="button" data-song="${esc(x.song)}" data-artist="${esc(x.artist)}"><b>${esc(x.song)}</b><span>${esc(x.artist)}</span></button>`).join('');
    }, 350);
  });
  form.addEventListener('click', (e) => {
    const pick = e.target.closest('.sug button');
    if (!pick) return;
    const field = pick.parentElement.dataset.sug;
    form.elements[field].value = pick.dataset.song.slice(0, 80);
    form.elements[pairs[field]].value = pick.dataset.artist.slice(0, 60);
    pick.parentElement.innerHTML = '';
    turn++;
  });
}

// ---------- Karaoke: panel del animador ----------
// Pone el karaoke en pantalla y muestra la cola. El local es el de la sala abierta.
// «Ya cantó», Subir y Bajar: cuando el local ya tiene instalado Sala.gs, se pueden usar aquí o en la app del equipo.
views.karaokectl = async (local) => {
  // Con un local (#/karaokectl/kennedy) es el karaoke de la sala light: no cambia la pantalla de la sala principal.
  // Ahí también entra el equipo de ese local con su clave (sin acceso a lo demás).
  const light = ['frida', 'kennedy', 'tobalaba'].includes(local) ? local : '';
  const admin = await isAdmin();
  const staff = !admin && light && store.get('staffToken') && (await api('GET', '/api/staff/me').catch(() => ({}))).venue === light;
  if (!admin && !staff) { if (light) { location.hash = `#/equipo/${light}`; return undefined; } return viewLogin(); }
  const lq = light ? `?local=${light}` : '';
  app.innerHTML = `${light ? '<div class="panel" id="kc-lt"></div>' : ''}<div class="panel"><div class="row between"><div><h1 id="kc-title" style="margin:0">Karaoke</h1><span class="muted" id="kc-sub"></span></div></div>
      <div id="kc-list" style="margin-top:14px"></div>
      <div id="kc-sung-box" hidden><button type="button" id="kc-sung-btn" class="kc-sung-btn">✓ Ya cantaron</button><div id="kc-sung"></div></div>
      <label class="check" style="margin-top:14px"><input type="checkbox" id="kc-phone"> Permitir pedir canciones desde el celular</label>
      <p class="muted small" style="margin:4px 0 0">Se abre y se cierra solo según el horario del local (Mercado Kennedy: jue a sáb 21:45–00:30 · Frida: vie y sáb 18:30–00:00 · Tobalaba: vie 21:00–22:10). Si lo cambias a mano, vale hasta que pasan 30 minutos sin pedidos.</p>
      <p class="muted small" id="kc-note" style="margin-top:10px"></p>
    </div>
    ${light ? `<div class="panel" id="kc-lb"></div>${staff ? '' : '<p class="back"><a href="#/light">← Salas light</a></p>'}` : activitiesNav('karaoke')}`;
  if (staff) $('#kc-phone').closest('label').hidden = true; // permitir pedidos desde el celular: solo el moderador
  const stopBar = light && views.lightBar ? views.lightBar($('#kc-lt'), $('#kc-lb'), light, staff) : null;
  if (!light) await api('POST', '/api/stage', { show: 'karaoke' }).catch(fail); // al entrar, el karaoke pasa a la pantalla
  let last = '';
  let k = null; // lo último que se mostró (la lista del servidor, o con los cambios recién tocados)
  const queue = []; // cambios tocados que todavía se están guardando en Google, en orden
  // Dibuja la lista. Los botones siguen activos mientras se guarda: los cambios se guardan uno tras otro.
  const render = () => {
    if (!k || !$('#kc-list')) return;
    $('#kc-title').textContent = light ? '🎤 Lista del karaoke' : `Karaoke ${k.name}`;
    $('#kc-sub').textContent = queue.length ? 'Guardando en la planilla…' : k.stale ? 'No se pudo leer la lista; se muestra la última conocida' : k.total ? `${k.total} ${k.total === 1 ? 'pedido' : 'pedidos'} por cantar` : 'Todavía no hay pedidos';
    $('#kc-phone').checked = !!k.phone;
    $('#kc-sung-box').hidden = !k.edit;
    $('#kc-note').textContent = k.edit ? '«Ya cantó», Subir y Bajar también se pueden usar en la app del equipo.' : 'El orden y «Ya cantó» se manejan en la app del equipo. Esta pantalla solo muestra la lista.';
    const n = k.list.length;
    $('#kc-list').innerHTML = n ? k.list.map((p, i) => `<div class="kc-row ${i === 0 ? 'now' : ''}"><em>${i === 0 ? '🎤' : i + 1}</em><p><small>${i === 0 ? 'Ahora canta' : i === 1 ? 'Sigue' : ''}</small><b>${esc(p.name)}</b><span>${esc(p.song)}${p.artist ? ` · ${esc(p.artist)}` : ''}</span></p>${k.edit && p.id ? `<div class="kc-act">
        <button type="button" class="kc-up" data-kc="subir" data-id="${esc(p.id)}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir">▲</button><button type="button" class="kc-down" data-kc="bajar" data-id="${esc(p.id)}" ${i === n - 1 ? 'disabled' : ''} title="Bajar" aria-label="Bajar">▼</button><button type="button" class="kc-done" data-kc="cantado" data-id="${esc(p.id)}">Ya cantó</button></div>` : ''}</div>`).join('')
      : '<p class="muted">Cuando alguien pida una canción, aparecerá aquí.</p>';
  };
  const paint = async () => {
    if (queue.length) return; // mientras se guarda, se deja lo que se tocó (la lista del servidor aún no lo trae)
    const r = await api('GET', `/api/karaoke/cola${lq}`).catch(() => null);
    if (!r || !$('#kc-list') || queue.length) return;
    const sig = JSON.stringify(r);
    if (sig === last) return;
    last = sig;
    k = r;
    render();
    if (k.edit && sungOpen) paintSung(); // si la lista cambió (también desde AppSheet), «Ya cantaron» se pone al día
  };
  // Aplica el cambio en pantalla al instante
  const applyLocal = (accion, id) => {
    const list = [...k.list];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return false;
    if (accion === 'cantado') list.splice(i, 1);
    else {
      const j = accion === 'subir' ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return false;
      [list[i], list[j]] = [list[j], list[i]];
    }
    k = { ...k, list, total: accion === 'cantado' ? Math.max(0, k.total - 1) : k.total };
    return true;
  };
  // Guarda los cambios en orden. Si Google rechaza uno, se descartan los que venían detrás y se vuelve a la lista real.
  let saving = false;
  const drain = async () => {
    if (saving) return;
    saving = true;
    while (queue.length) {
      const job = queue[0];
      try {
        await api('POST', '/api/karaoke/accion', { ...job, local: light || undefined });
        if (job.accion === 'cantado') toast('Marcado: ya cantó');
        queue.shift();
      } catch (err) {
        queue.length = 0;
        // Aviso claro (pedido de Cote, 21 nov): el cambio no quedó en la planilla y el pedido vuelve a la lista
        fail(new Error(`${job.accion === 'cantado' ? '«Ya cantó»' : 'El cambio'} NO quedó guardado en la planilla: ${err.message} Vuelve a apretarlo.`));
      }
    }
    saving = false;
    last = '';
    render();
    paint();
    paintSung(); // los recién marcados aparecen en «Ya cantaron»
  };
  $('#kc-list').onclick = (e) => {
    const btn = e.target.closest('[data-kc]');
    if (!btn || !k) return;
    if (!applyLocal(btn.dataset.kc, btn.dataset.id)) return;
    queue.push({ accion: btn.dataset.kc, id: btn.dataset.id });
    render();
    drain();
  };
  // «Ya cantaron»: las marcas de esta noche, para revisar y deshacer un error (igual que «Volver» en AppSheet)
  let sungOpen = true; // a la vista por defecto; se puede esconder
  const hhmm = (ms) => (ms ? new Date(ms).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' }) : '');
  const paintSung = async () => {
    if (!sungOpen) { $('#kc-sung').innerHTML = ''; $('#kc-sung-btn').textContent = '✓ Ya cantaron'; return; }
    $('#kc-sung-btn').textContent = '✓ Ya cantaron · ocultar';
    if (!$('#kc-sung').innerHTML) $('#kc-sung').innerHTML = '<p class="muted small">Cargando…</p>';
    try {
      const r = await api('GET', `/api/karaoke/cantados${lq}`);
      if (!sungOpen || !$('#kc-sung')) return;
      $('#kc-sung').innerHTML = r.list.length ? r.list.map((x) => `<div class="kc-row kc-sung-row"><em>✓</em><p><small>${x.at ? `Marcado a las ${esc(hhmm(x.at))}` : ''}</small><b>${esc(x.text)}</b></p><div class="kc-act"><button type="button" class="kc-back" data-fila="${x.fila}" data-key="${esc(x.key)}">Volver a la lista</button></div></div>`).join('')
        : '<p class="muted small">Esta noche todavía nadie aparece como «ya cantó».</p>';
    } catch (err) { if ($('#kc-sung')) $('#kc-sung').innerHTML = `<p class="muted small">⚠️ ${esc(err.message)}</p>`; }
  };
  $('#kc-sung-btn').onclick = () => { sungOpen = !sungOpen; paintSung(); };
  $('#kc-sung').onclick = async (e) => {
    const btn = e.target.closest('[data-fila]');
    if (!btn || queue.length || btn.disabled) return;
    $('#kc-sung').querySelectorAll('[data-fila]').forEach((x) => { x.disabled = true; });
    btn.closest('.kc-row').style.opacity = '.4'; // se ve al instante que se está devolviendo
    try { await api('POST', '/api/karaoke/volver', { fila: Number(btn.dataset.fila), key: btn.dataset.key, local: light || undefined }); toast('Volvió a la lista'); } catch (err) { fail(err); }
    last = '';
    paint();
    paintSung();
  };
  $('#kc-phone').onchange = async (e) => { try { await api('POST', '/api/karaoke/config', { phone: e.target.checked, local: light || undefined }); last = ''; paint(); } catch (err) { fail(err); } };
  await paint();
  if (k && k.edit) paintSung();
  const timer = setInterval(paint, 3000);
  return () => { clearInterval(timer); if (stopBar) stopBar(); };
};

