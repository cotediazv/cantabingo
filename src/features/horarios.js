// Lo que pasa solo según el día y la hora de Chile (pedidos de Cote). La hora sale de core/clock.js,
// así las pruebas pueden simular cualquier día (variable KRB_FECHA).
const clock = require('../core/clock');

module.exports = function horarios(ctx) {
  const { db, save } = ctx;
  // Pedido de Cote: todos los jueves a las 21:45 (hora de Chile), si la sala abierta es la de Kennedy, el escenario
  // pasa solo a Karaoke, para que el público siga pidiendo canciones desde su celular. Una vez por jueves; después
  // se puede cambiar a mano. Si el servicio estaba reiniciándose justo a esa hora, se hace apenas vuelve (hasta las 22:00).
  const AUTO_KARAOKE = { venue: 'kennedy', dow: 'Thu', from: 21 * 60 + 45, until: 22 * 60 };
  setInterval(() => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(clock.date()).map((x) => [x.type, x.value]));
    const min = +p.hour * 60 + +p.minute;
    const day = `${p.year}-${p.month}-${p.day}`;
    if (p.weekday !== AUTO_KARAOKE.dow || min < AUTO_KARAOKE.from || min >= AUTO_KARAOKE.until || db.autoKaraoke === day) return;
    const s = Object.values(db.sessions)[0];
    if (!s || s.theme !== AUTO_KARAOKE.venue) return;
    if (ctx.stageLocked('karaoke')) return; // con El Rosko en juego se espera a que termine (hasta las 22:00)
    db.autoKaraoke = day;
    if (db.stage !== 'karaoke') { ctx.setStage('karaoke'); ctx.karaoke.refresh(); console.log('Escenario a Karaoke automático (jueves 21:45, Mercado Kennedy)'); }
    save();
  }, 20e3);

  // Salas de juegos automáticas (pedido de Cote, 20 nov): a la hora de cada local la sala de juegos queda creada sola
  // (hora de Chile): jueves desde las 18:30 Kennedy, viernes desde las 18:00 Tobalaba y domingo desde las 13:00 Frida.
  // Una vez por día: si después se cierra a mano, no se vuelve a crear. Si ya hay una sala abierta de ese local, se deja;
  // si la abierta es de otro local, se cierra y se crea la que toca. Usa los cartones del último bingo de ese local (si no
  // hay, crea 320) y dura hasta las 4 de la mañana siguiente (para que no se cierre en medio de los juegos).
  const AUTO_SALAS_FROM = '2026-11-21'; // la creación automática empieza el sábado 21 de noviembre (pedido de Cote)
  const AUTO_SALAS = [
    { dow: 'Thu', from: 18 * 60 + 30, venue: 'kennedy', name: 'Los Juegos de Mercado Kennedy' }, // el local se llama Mercado Kennedy (pedido de Cote, 21 nov)
    { dow: 'Fri', from: 18 * 60, until: 22 * 60 + 45, venue: 'tobalaba', name: 'Los Juegos de Tobalaba' },
    { dow: 'Sun', from: 13 * 60, until: 17 * 60, venue: 'frida', name: 'Los Juegos de Frida' },
  ];
  // Fin de los juegos (pedido de Cote, 20 nov): Tobalaba a las 22:45 y Frida (domingo) a las 17:00 la sala del local se
  // cierra sola, aunque se haya creado a mano. Kennedy (21:30) no se cierra: los jueves a las 21:45 pasa sola a Karaoke
  // para que el público siga pidiendo canciones. Si a esa hora hay un rosko en juego, se espera a que termine.
  function autoSala() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(clock.date()).map((x) => [x.type, x.value]));
    const min = +p.hour * 60 + +p.minute;
    const a = AUTO_SALAS.find((x) => x.dow === p.weekday && min >= x.from);
    if (!a) return;
    if (a.until && min >= a.until) {
      const endKey = `${p.year}-${p.month}-${p.day} ${a.venue}`;
      const open = Object.values(db.sessions)[0];
      if (db.autoEnd === endKey || !open || (open.theme || 'frida') !== a.venue || ctx.stageLocked('none')) return;
      db.autoEnd = endKey;
      ctx.closeSession(open);
      console.log(`Fin de los juegos: se cerró ${open.name}`);
      return;
    }
    const key = `${p.year}-${p.month}-${p.day} ${a.venue}`;
    if (`${p.year}-${p.month}-${p.day}` < AUTO_SALAS_FROM) return; // pedido de Cote: hoy (20 nov) la sala se inicia a mano
    if (db.autoSala === key) return;
    db.autoSala = key;
    const open = Object.values(db.sessions)[0];
    if (open && (open.theme || 'frida') === a.venue) { save(); return; } // ya estaba creada (a mano): se deja
    if (open) ctx.closeSession(open);
    let proj = Object.values(db.projects).filter((x) => x.theme === a.venue && x.format === 'numbers').sort((x, y) => y.created - x.created)[0];
    if (!proj) {
      proj = { id: ctx.newId(), created: Date.now(), format: 'numbers', values: 75, items: null, name: a.name, theme: a.venue, headers: 'BINGO', freeCenter: false, startNumber: 1, sessionId: null };
      proj.cards = ctx.makeCards(320, 75, false);
      db.projects[proj.id] = proj;
    }
    const s = ctx.startSession(proj, { name: a.name, theme: a.venue, cardsPerPlayer: 1, isPublic: true, showName: true, patterns: ['linea'] });
    s.expires = Date.now() + ((24 * 60 - min) + 4 * 60) * 60e3; // hasta las 4 de la mañana
    save();
    console.log(`Sala de juegos automática: ${a.name}`);
  }
  setInterval(autoSala, 30e3);
  setTimeout(autoSala, 5e3);
};
