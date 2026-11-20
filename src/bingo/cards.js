// Generación de cartones de bingo (lógica pura, sin estado)
const { shuffle } = require('../core/util');

// ---------- Generación de cartones ----------
// Los valores van de 1 a N. La columna c usa el rango floor(c*N/5)+1 .. floor((c+1)*N/5).
const columnRange = (c, n) => [Math.floor((c * n) / 5) + 1, Math.floor(((c + 1) * n) / 5)];
function makeCard(n, freeCenter) {
  const card = new Array(25);
  for (let c = 0; c < 5; c++) {
    const [lo, hi] = columnRange(c, n);
    const pool = shuffle(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
    for (let r = 0; r < 5; r++) card[r * 5 + c] = pool[r];
  }
  if (freeCenter) card[12] = 0; // 0 = casilla libre
  return card;
}
function makeCards(count, n, freeCenter) {
  const seen = new Set();
  const cards = [];
  while (cards.length < count) {
    const card = makeCard(n, freeCenter);
    const key = card.join(',');
    if (!seen.has(key)) { seen.add(key); cards.push(card); }
  }
  return cards;
}

module.exports = { columnRange, makeCard, makeCards };
