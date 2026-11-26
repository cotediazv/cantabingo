// Presentación de los juegos antes de votar (pedido de Cote, 21 nov): al entrar en «Por votación», primero salen las
// reglas para el público y después cada juego, uno por uno, con un dibujo simple de cómo funciona; al final, «¡A votar!».
// Las pasa el animador, paso a paso (pedido de Cote, 24 nov), con «Siguiente»; después de la última parte la votación.
// Escrito en JavaScript antiguo (ES5): lo usan la plataforma completa y la pantalla liviana (pv.html) de los navegadores
// antiguos. Los dibujos son SVG; en la plataforma completa se mueven con las animaciones de styles.css (.gi …).
(function (root) {
  var MS = 10000;
  var C = { bingo: '#ff2e93', rosco: '#9b6bff', festival: '#ffc400', objeto: '#19d6b0' };
  function slides(venueShort) {
    return [
      { key: 'reglas', icon: '🗳️', title: '¡Tú eliges el próximo juego!', lines: ['Entra a la sala escaneando el código QR', 'Cuando parta la votación, toca en tu celular el juego que quieres', 'Tienes 30 segundos y puedes cambiar tu voto', 'Gana el que tenga más de la mitad de los votos. Si ninguno completa el quórum, habrá segunda vuelta entre los dos más votados.'] },
      { key: 'bingo', icon: '🎱', title: 'Bingo', lines: ['Cada uno tiene su cartón en el celular', 'Marca los números que van saliendo', 'Gana quien completa primero la figura: línea, cruz, corazón…'] },
      { key: 'rosco', icon: '🎡', title: 'El Rosko', lines: ['Sorteamos 3 concursantes entre los conectados', 'Una pregunta por cada letra, contra el reloj: 2 minutos cada uno', 'Gana quien acierta más letras. Tú juegas la Trivia del Rosko desde el celular'] },
      { key: 'festival', icon: '🎤', title: 'El Festival de ' + (venueShort || 'Frida'), lines: ['Concurso de karaoke: te inscribes desde el celular con tu canción', 'Cantas una canción corta y el público pone nota del 1 al 10', 'Gana el mejor promedio'] },
      { key: 'objeto', icon: '🗳️', title: 'El objeto más extraño', lines: ['Te inscribes desde el celular con el objeto más raro que tengas a mano', 'Lo muestras en el escenario y el público pone nota del 1 al 10', 'Los 2 mejores van a la gran final y el público elige al ganador'] },
      { key: 'votar', icon: '🗳️', title: '¡A votar!', lines: ['La votación dura 30 segundos', 'Toca en tu celular el juego que quieres jugar'] },
    ];
  }
  // Dibujos (SVG de 220 x 140)
  function cells(marked) {
    var o = '';
    for (var r = 0; r < 5; r++) {
      for (var c = 0; c < 5; c++) {
        var x = 18 + c * 21; var y = 14 + r * 21; var on = marked(r, c);
        o += '<rect x="' + x + '" y="' + y + '" width="18" height="18" rx="3" fill="#ffffff" opacity=".92"/>';
        if (on) o += '<rect class="gi-mark" style="animation-delay:' + (on * 0.5).toFixed(1) + 's" x="' + x + '" y="' + y + '" width="18" height="18" rx="3" fill="' + C.bingo + '"/>';
      }
    }
    return o;
  }
  function art(key) {
    var s = '<svg viewBox="0 0 220 140" xmlns="http://www.w3.org/2000/svg" font-family="Fredoka, Arial, sans-serif" font-weight="700">';
    if (key === 'reglas') {
      s += '<rect x="22" y="6" width="74" height="128" rx="13" fill="#1b1838" stroke="#ffffff" stroke-width="3"/><rect x="48" y="12" width="22" height="4" rx="2" fill="#ffffff" opacity=".5"/>' +
        '<rect x="32" y="26" width="25" height="30" rx="6" fill="' + C.bingo + '"/><rect class="gi-pulse" x="61" y="26" width="25" height="30" rx="6" fill="' + C.rosco + '"/>' +
        '<rect x="32" y="62" width="25" height="30" rx="6" fill="' + C.festival + '"/><rect x="61" y="62" width="25" height="30" rx="6" fill="' + C.objeto + '"/>' +
        '<circle class="gi-ring" cx="73.5" cy="41" r="17" fill="none" stroke="#ffffff" stroke-width="3"/>' +
        '<text x="59" y="118" text-anchor="middle" font-size="17" fill="#ffc400">0:30</text>' +
        '<circle cx="160" cy="62" r="40" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="13"/>' +
        '<circle class="gi-grow" cx="160" cy="62" r="40" fill="none" stroke="#ffc400" stroke-width="13" stroke-dasharray="151 252" transform="rotate(-90 160 62)"/>' +
        '<text x="160" y="69" text-anchor="middle" font-size="19" fill="#ffffff">+50%</text><text x="160" y="124" text-anchor="middle" font-size="13" fill="#ffffff">para ganar</text>';
    } else if (key === 'bingo') {
      s += cells(function (r, c) { return r === 2 ? c + 1 : 0; }) +
        '<circle class="gi-bounce" cx="170" cy="62" r="36" fill="#ffffff" stroke="#ffc400" stroke-width="6"/><text x="170" y="52" text-anchor="middle" font-size="14" fill="#c4175e">N</text><text x="170" y="80" text-anchor="middle" font-size="30" fill="#1a1a1a">42</text>';
    } else if (key === 'rosco') {
      var L = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'L', 'M'];
      for (var i = 0; i < L.length; i++) {
        var a = (i / L.length) * 2 * Math.PI - Math.PI / 2; var cx = 110 + Math.cos(a) * 54; var cy = 70 + Math.sin(a) * 54;
        var fill = i < 5 ? '#2fbf71' : i === 5 ? '#e5484d' : i === 6 ? '#2b6fff' : '#3a3466';
        s += '<circle' + (i === 6 ? ' class="gi-pulse"' : '') + ' cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="12" fill="' + fill + '" stroke="#ffffff" stroke-width="2"/><text x="' + cx.toFixed(1) + '" y="' + (cy + 5).toFixed(1) + '" text-anchor="middle" font-size="13" fill="#ffffff">' + L[i] + '</text>';
      }
      s += '<text x="110" y="66" text-anchor="middle" font-size="12" fill="#ffd76a">quedan</text><text x="110" y="86" text-anchor="middle" font-size="22" fill="#ffffff">2:00</text>';
    } else if (key === 'festival') {
      s += '<rect x="44" y="18" width="34" height="50" rx="17" fill="#d8d3ff" stroke="#ffffff" stroke-width="3"/><path d="M38 52 a23 23 0 0 0 46 0" fill="none" stroke="#ffffff" stroke-width="4"/><rect x="58" y="76" width="6" height="34" fill="#ffffff"/><rect x="44" y="110" width="34" height="6" rx="3" fill="#ffffff"/>' +
        '<text class="gi-up" x="92" y="40" font-size="22" fill="#ffc400">♪</text><text class="gi-up" style="animation-delay:.8s" x="104" y="64" font-size="18" fill="#ff2e93">♫</text>' +
        '<rect x="128" y="34" width="78" height="60" rx="14" fill="#ffc400"/><text x="167" y="72" text-anchor="middle" font-size="26" fill="#1a1a1a">9,2</text>' +
        '<text x="167" y="114" text-anchor="middle" font-size="16" fill="#ffc400">★★★★★</text><text x="167" y="132" text-anchor="middle" font-size="11" fill="#ffffff">nota del 1 al 10</text>';
    } else if (key === 'objeto') {
      s += '<path d="M30 70 L110 70 L110 128 L30 128 Z" fill="#8a5a2b" stroke="#ffffff" stroke-width="3"/><path d="M30 70 L50 50 L130 50 L110 70 Z" fill="#b07a42" stroke="#ffffff" stroke-width="3"/>' +
        '<text x="70" y="112" text-anchor="middle" font-size="34" fill="#ffffff">?</text>' +
        '<circle class="gi-up" cx="60" cy="40" r="8" fill="' + C.objeto + '"/><rect class="gi-up" style="animation-delay:.7s" x="78" y="30" width="14" height="14" rx="3" fill="' + C.bingo + '"/><path class="gi-up" style="animation-delay:1.4s" d="M104 42 l8 -14 l8 14 z" fill="' + C.festival + '"/>' +
        '<rect x="140" y="34" width="66" height="54" rx="14" fill="' + C.objeto + '"/><text x="173" y="69" text-anchor="middle" font-size="24" fill="#1a1a1a">8,7</text><text x="173" y="112" text-anchor="middle" font-size="12" fill="#ffffff">gran final</text><text x="173" y="128" text-anchor="middle" font-size="12" fill="#ffffff">los 2 mejores</text>';
    } else {
      var ks = ['bingo', 'rosco', 'festival', 'objeto']; var hs = [62, 96, 48, 30];
      for (var k = 0; k < 4; k++) s += '<rect class="gi-bar" style="animation-delay:' + (k * 0.2).toFixed(1) + 's" x="' + (30 + k * 44) + '" y="' + (120 - hs[k]) + '" width="30" height="' + hs[k] + '" rx="6" fill="' + C[ks[k]] + '"/>';
      s += '<rect x="20" y="120" width="180" height="3" fill="#ffffff" opacity=".6"/><text x="110" y="18" text-anchor="middle" font-size="15" fill="#ffc400">30 segundos</text>';
    }
    return s + '</svg>';
  }
  // Lámina que toca según el tiempo: parte en «step» y avanza sola cada MS; la última queda hasta que parte la votación
  function stepOf(intro, now) {
    if (!intro) return 0;
    if (intro.current != null) return intro.current; // paso a paso: la que eligió el animador (Cote, 24 nov)
    var n = (intro.step || 0) + Math.floor(Math.max(0, now - intro.at) / MS);
    return Math.min(n, 5);
  }
  root.GAME_INTRO = { ms: MS, count: 6, slides: slides, art: art, stepOf: stepOf };
})(this);
