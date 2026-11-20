// Compatibilidad con navegadores antiguos (pedido de Cote: el Chrome del decodificador de Kennedy no mostraba nada):
// si el navegador no trae estas funciones, se agregan aquí. Va primero porque este archivo se carga antes que los demás.
(function () {
  function at(n) { n = Math.trunc(n) || 0; if (n < 0) n += this.length; return n < 0 || n >= this.length ? undefined : this[n]; }
  if (!Array.prototype.at) Object.defineProperty(Array.prototype, 'at', { value: at, writable: true, configurable: true });
  if (!String.prototype.at) Object.defineProperty(String.prototype, 'at', { value: at, writable: true, configurable: true });
  if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
    AbortSignal.timeout = function (ms) { var c = new AbortController(); setTimeout(function () { c.abort(); }, ms); return c.signal; };
  }
})();
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
    one('cruz', 'Cruz', ['..X..', '..X..', 'XXXXX', '..X..', '..X..']),
    one('marco', 'Marco', ['XXXXX', 'X...X', 'X...X', 'X...X', 'XXXXX']),
    one('cuadro', 'Cuadro central', ['.....', '.XXX.', '.X.X.', '.XXX.', '.....']),
    one('diamante', 'Diamante', ['..X..', '.X.X.', 'X...X', '.X.X.', '..X..']),
    one('piramide', 'Pirámide', ['.....', '.....', '..X..', '.XXX.', 'XXXXX']),
    // Más figuras (pedido de Cote, 20 nov)
    one('piramide-inv', 'Pirámide invertida', ['XXXXX', '.XXX.', '..X..', '.....', '.....']),
    one('reloj', 'Reloj de arena', ['XXXXX', '.XXX.', '..X..', '.XXX.', 'XXXXX']),
    one('rombo', 'Rombo lleno', ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..']),
    one('corazon', 'Corazón', ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..']),
    one('estrella', 'Estrella', ['..X..', 'XXXXX', '.XXX.', '.X.X.', 'X...X']),
    one('flecha', 'Flecha', ['..X..', '.XXX.', 'X.X.X', '..X..', '..X..']),
    one('casa', 'Casa', ['..X..', '.X.X.', 'XXXXX', 'X...X', 'XXXXX']),
    one('arbol', 'Árbol', ['..X..', '.XXX.', 'XXXXX', '..X..', '..X..']),
    one('copa', 'Copa', ['XXXXX', 'X...X', '.XXX.', '..X..', '.XXX.']),
    one('avion', 'Avión', ['..X..', '.XXX.', 'XXXXX', '..X..', '.XXX.']),
    one('barco', 'Barco', ['..X..', '..XX.', '..X..', 'XXXXX', '.XXX.']),
    one('escalera', 'Escalera', ['X....', 'XX...', 'XXX..', 'XXXX.', 'XXXXX']),
    one('mas', 'Cruz chica', ['.....', '..X..', '.XXX.', '..X..', '.....']),
    one('ajedrez', 'Ajedrez', ['X.X.X', '.X.X.', 'X.X.X', '.X.X.', 'X.X.X']),
    one('lleno', 'Cartón lleno', ['XXXXX', 'XXXXX', 'XXXXX', 'XXXXX', 'XXXXX']),
    // Abecedario en mayúsculas
    one('a', 'Figura A', ['.XXX.', 'X...X', 'XXXXX', 'X...X', 'X...X']),
    one('b', 'Figura B', ['XXXX.', 'X...X', 'XXXX.', 'X...X', 'XXXX.']),
    one('c', 'Figura C', ['XXXXX', 'X....', 'X....', 'X....', 'XXXXX']),
    one('d', 'Figura D', ['XXXX.', 'X...X', 'X...X', 'X...X', 'XXXX.']),
    one('e', 'Figura E', ['XXXXX', 'X....', 'XXXX.', 'X....', 'XXXXX']),
    one('f', 'Figura F', ['XXXXX', 'X....', 'XXXX.', 'X....', 'X....']),
    one('g', 'Figura G', ['XXXXX', 'X....', 'X.XXX', 'X...X', 'XXXXX']),
    one('h', 'Figura H', ['X...X', 'X...X', 'XXXXX', 'X...X', 'X...X']),
    one('i', 'Figura I', ['XXXXX', '..X..', '..X..', '..X..', 'XXXXX']),
    one('j', 'Figura J', ['XXXXX', '...X.', '...X.', 'X..X.', '.XX..']),
    one('k', 'Figura K', ['X...X', 'X..X.', 'XXX..', 'X..X.', 'X...X']),
    one('l', 'Figura L', ['X....', 'X....', 'X....', 'X....', 'XXXXX']),
    one('m', 'Figura M', ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X']),
    one('n', 'Figura N', ['X...X', 'XX..X', 'X.X.X', 'X..XX', 'X...X']),
    one('o', 'Figura O', ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.']),
    one('p', 'Figura P', ['XXXX.', 'X...X', 'XXXX.', 'X....', 'X....']),
    one('q', 'Figura Q', ['.XXX.', 'X...X', 'X.X.X', 'X..X.', '.XX.X']),
    one('r', 'Figura R', ['XXXX.', 'X...X', 'XXXX.', 'X..X.', 'X...X']),
    one('s', 'Figura S', ['XXXXX', 'X....', 'XXXXX', '....X', 'XXXXX']),
    one('t', 'Figura T', ['XXXXX', '..X..', '..X..', '..X..', '..X..']),
    one('u', 'Figura U', ['X...X', 'X...X', 'X...X', 'X...X', 'XXXXX']),
    one('v', 'Figura V', ['X...X', 'X...X', 'X...X', '.X.X.', '..X..']),
    one('w', 'Figura W', ['X...X', 'X...X', 'X.X.X', 'XX.XX', 'X...X']),
    one('x', 'Figura X', ['X...X', '.X.X.', '..X..', '.X.X.', 'X...X']),
    one('y', 'Figura Y', ['X...X', '.X.X.', '..X..', '..X..', '..X..']),
    one('z', 'Figura Z', ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX']),
  ];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  // Devuelve la variante completada por `m` (máscara de casillas), o 0.
  const completed = (id, m) => (byId[id] ? byId[id].variants.find((v) => (m & v) === v) || 0 : 0);
  const api = { list, byId, completed, lines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PATTERNS = api;
})(this);
