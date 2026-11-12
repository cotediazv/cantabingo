// Catálogo de patrones, compartido entre servidor y navegador.
// Un cartón es una cuadrícula 5x5; la casilla (fila r, columna c) es el bit r*5+c.
(function (root) {
  const mask = (rows) => {
    let m = 0;
    rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'X') m |= 1 << (r * 5 + c); }));
    return m;
  };
  const rows = [0, 1, 2, 3, 4].map((r) => 31 << (r * 5));
  const cols = [0, 1, 2, 3, 4].map((c) => 1082401 << c);
  const diags = [
    mask(['X....', '.X...', '..X..', '...X.', '....X']),
    mask(['....X', '...X.', '..X..', '.X...', 'X....']),
  ];
  const lines = [...rows, ...cols, ...diags];
  const pairs = [];
  lines.forEach((a, i) => lines.slice(i + 1).forEach((b) => pairs.push(a | b)));
  const one = (id, name, r) => ({ id, name, variants: [mask(r)] });

  const list = [
    { id: 'linea', name: 'Línea (cualquiera)', variants: lines },
    { id: 'horizontal', name: 'Línea horizontal', variants: rows },
    { id: 'vertical', name: 'Línea vertical', variants: cols },
    { id: 'diagonal', name: 'Diagonal', variants: diags },
    { id: 'dos-lineas', name: 'Dos líneas', variants: pairs },
    one('esquinas', 'Cuatro esquinas', ['X...X', '.....', '.....', '.....', 'X...X']),
    { id: 'sello', name: 'Sello (2×2 en una esquina)', variants: [
      mask(['XX...', 'XX...', '.....', '.....', '.....']), mask(['...XX', '...XX', '.....', '.....', '.....']),
      mask(['.....', '.....', '.....', 'XX...', 'XX...']), mask(['.....', '.....', '.....', '...XX', '...XX']) ] },
    one('x', 'Letra X', ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X']),
    one('t', 'Letra T', ['XXXXX', '..X..', '..X..', '..X..', '..X..']),
    one('l', 'Letra L', ['X....', 'X....', 'X....', 'X....', 'XXXXX']),
    one('h', 'Letra H', ['X...X', 'X...X', 'XXXXX', 'X...X', 'X...X']),
    one('u', 'Letra U', ['X...X', 'X...X', 'X...X', 'X...X', 'XXXXX']),
    one('z', 'Letra Z', ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX']),
    one('cruz', 'Cruz', ['..X..', '..X..', 'XXXXX', '..X..', '..X..']),
    one('marco', 'Marco', ['XXXXX', 'X...X', 'X...X', 'X...X', 'XXXXX']),
    one('cuadro', 'Cuadro central', ['.....', '.XXX.', '.X.X.', '.XXX.', '.....']),
    one('diamante', 'Diamante', ['..X..', '.X.X.', 'X...X', '.X.X.', '..X..']),
    one('piramide', 'Pirámide', ['.....', '.....', '..X..', '.XXX.', 'XXXXX']),
    one('lleno', 'Cartón lleno', ['XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX']),
  ];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  // Devuelve la variante completada por `m` (máscara de casillas), o 0.
  const completed = (id, m) => (byId[id] ? byId[id].variants.find((v) => (m & v) === v) || 0 : 0);
  const api = { list, byId, completed, lines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PATTERNS = api;
})(this);
