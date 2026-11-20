// Acceso: moderador (usuario y clave en variables de entorno) y equipo de cada local (una clave por local).
const crypto = require('crypto');
const { fail } = require('./util');

module.exports = function auth({ app, db, save }) {
  // ---------- Acceso del moderador ----------
  // Usuario y contraseña se leen de variables de entorno; nunca se guardan en el código.
  const ADMIN_USER = process.env.ADMIN_USER || '';
  const ADMIN_PASS = process.env.ADMIN_PASS || '';
  const AUTH_READY = Boolean(ADMIN_USER && ADMIN_PASS);
  const AUTH_KEY = crypto.createHash('sha256').update(`cantabingo:${ADMIN_USER}:${ADMIN_PASS}`).digest();
  const TOKEN_MS = 7 * 24 * 3600e3;
  const sha = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
  const sign = (exp) => crypto.createHmac('sha256', AUTH_KEY).update(String(exp)).digest('hex');
  function validToken(token) {
    if (!AUTH_READY || typeof token !== 'string') return false;
    const [exp, sig] = token.split('.');
    return Number(exp) > Date.now() && crypto.timingSafeEqual(sha(sig), sha(sign(exp)));
  }
  const requireAdmin = (req, res, next) => (validToken(req.get('x-admin')) ? next() : fail(res, 401, 'Inicia sesión como moderador'));
  const attempts = {}; // ip -> { n, until }: frena los intentos de adivinar la contraseña

  // ---------- Acceso del equipo de cada local (sala light) ----------
  // Una clave común del equipo, que el moderador pone en el Centro de control (se guarda cifrada, nunca en el código).
  // Con ella, cada local entra por su enlace (#/equipo/<local>) y solo maneja SU sala light: no la sala principal ni otros locales.
  const STAFF_VENUES = ['frida', 'kennedy', 'tobalaba'];
  const STAFF_MS = 16 * 3600e3;
  const staffSign = (v, exp) => crypto.createHmac('sha256', AUTH_KEY).update(`staff:${v}:${exp}`).digest('hex');
  function staffVenue(token) {
    if (!AUTH_READY || typeof token !== 'string') return '';
    const [v, exp, sig] = token.split('.');
    if (!STAFF_VENUES.includes(v) || !(Number(exp) > Date.now()) || !sig) return '';
    return crypto.timingSafeEqual(sha(sig), sha(staffSign(v, exp))) ? v : '';
  }
  const reqVenue = (req) => String((req.query || {}).local || (req.body || {}).local || (req.body || {}).venue || '');
  // Moderador, o equipo del mismo local que se está manejando
  const requireLocal = (req, res, next) => {
    if (validToken(req.get('x-admin'))) return next();
    const v = staffVenue(req.get('x-staff'));
    if (v && v === reqVenue(req)) return next();
    return fail(res, 401, 'Entra con la clave del equipo de este local');
  };
  const staffHash = (clave, salt) => crypto.scryptSync(String(clave), salt, 32).toString('hex');

  app.post('/api/login', (req, res) => {
    if (!AUTH_READY) return fail(res, 503, 'El acceso de moderador aún no está configurado en el servidor (ADMIN_USER y ADMIN_PASS)');
    const a = (attempts[req.ip] ||= { n: 0, until: 0 });
    if (Date.now() < a.until) return fail(res, 429, 'Demasiados intentos. Espera 10 minutos.');
    const b = req.body || {};
    const okUser = crypto.timingSafeEqual(sha(b.user), sha(ADMIN_USER));
    const okPass = crypto.timingSafeEqual(sha(b.pass), sha(ADMIN_PASS));
    if (!(okUser && okPass)) {
      if (++a.n >= 8) { a.n = 0; a.until = Date.now() + 10 * 60e3; }
      return fail(res, 401, 'Usuario o contraseña incorrectos');
    }
    delete attempts[req.ip];
    const exp = Date.now() + TOKEN_MS;
    res.json({ token: `${exp}.${sign(exp)}` });
  });
  // Una clave por local (decisión de Cote). Si quedó guardada la clave común de antes, sirve para los 3 hasta cambiarla.
  db.staff ||= {};
  if (db.staff.hash) { const old = { salt: db.staff.salt, hash: db.staff.hash }; db.staff = {}; for (const v of STAFF_VENUES) db.staff[v] = old; }
  app.get('/api/staff/clave', requireAdmin, (_req, res) => res.json(Object.fromEntries(STAFF_VENUES.map((v) => [v, Boolean((db.staff[v] || {}).hash)]))));
  app.post('/api/staff/clave', requireAdmin, (req, res) => {
    const b = req.body || {};
    const v = String(b.local || '');
    const clave = String(b.clave || '').trim();
    if (!STAFF_VENUES.includes(v)) return fail(res, 400, 'Elige el local');
    if (clave.length < 4) return fail(res, 400, 'La clave debe tener al menos 4 caracteres');
    if (clave.toLowerCase() === 'admin') return fail(res, 400, 'Elige una clave distinta de «admin»');
    const salt = crypto.randomBytes(16).toString('hex');
    db.staff[v] = { salt, hash: staffHash(clave, salt), at: Date.now() };
    save();
    res.json({ ok: true });
  });
  app.post('/api/staff/login', (req, res) => {
    const b = req.body || {};
    const v = String(b.local || '');
    if (!STAFF_VENUES.includes(v)) return fail(res, 400, 'Local no válido');
    const k = db.staff[v] || {};
    if (!AUTH_READY || !k.hash) return fail(res, 503, 'Todavía no hay clave para este local. Pídesela a Cote.');
    const a = attempts[`staff:${req.ip || 'x'}`] ||= { n: 0, until: 0 };
    if (Date.now() < a.until) return fail(res, 429, 'Demasiados intentos. Espera 10 minutos.');
    const ok = crypto.timingSafeEqual(Buffer.from(staffHash(String(b.clave || ''), k.salt), 'hex'), Buffer.from(k.hash, 'hex'));
    if (!ok) { a.n++; if (a.n >= 8) { a.n = 0; a.until = Date.now() + 10 * 60e3; } return fail(res, 401, 'Clave incorrecta'); }
    a.n = 0;
    const exp = Date.now() + STAFF_MS;
    res.json({ token: `${v}.${exp}.${staffSign(v, exp)}`, venue: v });
  });
  app.get('/api/staff/me', (req, res) => res.json({ venue: staffVenue(req.get('x-staff')) }));
  app.get('/api/me', (req, res) => res.json({ admin: validToken(req.get('x-admin')) }));
  return { validToken, requireAdmin, requireLocal, staffVenue };
};
