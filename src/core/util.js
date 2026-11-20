// Ayudas comunes del servidor
const crypto = require('crypto');

const id = (n = 8) => crypto.randomBytes(n).toString('hex');
const clamp = (v, lo, hi, def) => { v = parseInt(v, 10); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
const str = (v, max, def = '') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : def);
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const fail = (res, code, error) => res.status(code).json({ error });

module.exports = { id, clamp, str, shuffle, fail };
