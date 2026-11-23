// Recorre las pantallas con los datos fijos de fixture.json y compara contra las capturas de referencia.
// Sirve para reordenar el código sin cambiar nada visible: si una captura cambia, la prueba falla y muestra la diferencia.
// Si el cambio visible fue pedido, se actualizan las referencias con: npm run test:e2e -- --update-snapshots
const { test, expect } = require('@playwright/test');
const { startServer } = require('../helpers');
const fixture = require('./fixture.json');

const PORT = 3311; // fijo: el QR lleva la dirección del sitio y debe salir igual en cada captura
const { sid, projectId, wheelId, phone } = fixture.fixture;
const STAGES = ['bingo', 'qr', 'rueda', 'sorteo', 'voto', 'desafio', 'insta', 'show', 'juego', 'votojuego', 'enpie', 'karaoke', 'none'];
const TV = { width: 1920, height: 1080 };
const CEL = { width: 390, height: 844 };
const PANEL = { width: 1280, height: 900 };

let srv;
test.beforeAll(async () => {
  srv = await startServer({ port: PORT, data: fixture, env: { GLOSA_TEST_URL: 'http://127.0.0.1:9/glosa', AGENDA_NOW: '2026-11-18T20:00:00-03:00' } });
});
test.afterAll(async () => { await srv.stop(); });

// Cada página: azar repetible, sin el fondo animado, sin avisos que aparecen por tiempo y sin videos externos.
// Además se anotan los errores de la página: cualquier error hace fallar la prueba.
async function open(page, hash, { size = TV, admin = false, phoneToken = false } = {}) {
  const errors = [];
  page.on('pageerror', (e) => { if (!/getLayoutMap/.test(e.message)) errors.push(e.message); });
  await page.setViewportSize(size);
  await page.addInitScript(({ adminToken, tok, sidKey }) => {
    let seed = 42;
    Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    try {
      localStorage.clear();
      if (adminToken) localStorage.setItem('adminToken', adminToken);
      if (tok) localStorage.setItem(sidKey, tok);
    } catch { /* nada */ }
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '#neural-bg,#kids-ad,#phone-howto{display:none!important} iframe,video{visibility:hidden!important}';
      document.head.appendChild(st);
    });
  }, { adminToken: admin ? srv.adminToken() : '', tok: phoneToken ? phone.token : '', sidKey: `tok_${sid}` });
  await page.goto(`${srv.url}/${hash}`);
  await page.waitForTimeout(1500);
  return errors;
}
const setStage = (show) => srv.admin.post('/api/stage', { show });
// El nombre del juego sorteado se redibuja con una animación cada 2 s: se tapa para que la captura sea estable
const masks = (page, stage) => (stage === 'juego' ? [page.locator('.jd-win')] : []);

for (const stage of STAGES) {
  test(`tablero · ${stage}`, async ({ page }) => {
    await setStage(stage);
    const errors = await open(page, '#/tablero');
    await expect(page).toHaveScreenshot(`tablero-${stage}.png`, { mask: masks(page, stage) });
    expect(errors).toEqual([]);
  });
  test(`escena (OBS) · ${stage}`, async ({ page }) => {
    await setStage(stage);
    const errors = await open(page, '#/escena');
    await expect(page).toHaveScreenshot(`escena-${stage}.png`, { mask: masks(page, stage) });
    expect(errors).toEqual([]);
  });
}

for (const stage of ['bingo', 'rueda', 'voto', 'desafio', 'enpie', 'insta', 'karaoke']) {
  test(`celular · ${stage}`, async ({ page }) => {
    await setStage(stage);
    const errors = await open(page, `#/jugar/${sid}`, { size: CEL, phoneToken: true });
    await expect(page).toHaveScreenshot(`celular-${stage}.png`, { fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('celular · entrar a la sala (sin nombre todavía)', async ({ page }) => {
  await setStage('bingo');
  const errors = await open(page, `#/jugar/${sid}`, { size: CEL });
  await expect(page).toHaveScreenshot('celular-entrar.png');
  expect(errors).toEqual([]);
});

const PANELS = [
  ['control', '#/control'], ['bingo', `#/anfitrion/${projectId}`], ['rosco', `#/ruedactl/${wheelId}`],
  ['sorteo', '#/sorteoctl'], ['votacion', '#/votoctl'], ['desafio', '#/desafioctl'], ['instagram', '#/instactl'],
  ['juegos', '#/juegos'],
];
for (const [name, hash] of PANELS) {
  test(`panel · ${name}`, async ({ page }) => {
    await setStage('bingo');
    const errors = await open(page, hash, { size: PANEL, admin: true });
    await expect(page).toHaveScreenshot(`panel-${name}.png`, { fullPage: true });
    expect(errors).toEqual([]);
  });
}

// Pantallas que dependen de la hora real (horarios, «esta noche»): solo se revisa que abran sin errores
for (const hash of ['#/vertical/kennedy', '#/pantalla/tobalaba', '#/light-v/kennedy', '#/light', '#/karaokectl', '#/showctl', '#/kids', '#/consola',
  '#/master', '#/master/kennedy', '#/master/movil']) {
  test(`abre sin errores · ${hash}`, async ({ page }) => {
    const errors = await open(page, hash, { admin: true });
    expect(await page.locator('#app').count()).toBe(1);
    expect(errors).toEqual([]);
  });
}

// Páginas livianas para equipos antiguos (Centro de control del iPad viejo y pantalla liviana)
for (const page of ['cc.html', 'pv.html']) {
  test(`abre sin errores · ${page}`, async ({ page: p }) => {
    const errors = await open(p, page, { admin: true });
    expect(await p.locator('body').count()).toBe(1);
    expect(errors).toEqual([]);
  });
}

// Sin portada (23 nov): la dirección de siempre lleva directo al Centro de control
test('#/ lleva al Centro de control', async ({ page }) => {
  const errors = await open(page, '#/', { size: PANEL, admin: true });
  await expect(page).toHaveURL(/#\/control$/);
  await expect(page.locator('h1')).toHaveText('Centro de control');
  expect(errors).toEqual([]);
});

// Páginas que ya no existen (23 nov): sus direcciones guardadas llevan a donde quedó lo suyo
for (const [from, to] of [['#/proyectos', /#\/control$/], [`#/admin/${projectId}`, new RegExp(`#/anfitrion/${projectId}$`)], ['#/sesiones', /#\/jugar$/], ['#/ruedas', /#\/sorteoctl$/], ['#/ruedanueva', /#\/sorteoctl$/]]) {
  test(`${from} lleva a donde quedó lo suyo`, async ({ page }) => {
    const errors = await open(page, from, { size: PANEL, admin: true });
    await expect(page).toHaveURL(to);
    expect(errors).toEqual([]);
  });
}

// Entrar a la sala desde el Centro de control con un juego en curso abre directo su panel (aquí, el bingo)
test('Ir a la sala en juego abre el juego en curso', async ({ page }) => {
  await setStage('bingo');
  const errors = await open(page, '#/control', { size: PANEL, admin: true });
  await page.locator('#ctl-sala-go a').click();
  await expect(page).toHaveURL(new RegExp(`#/anfitrion/${projectId}$`));
  await expect(page.locator('#panel-bar a')).toHaveText('← Sala de juegos');
  await page.locator('#panel-bar a').click();
  await expect(page).toHaveURL(/#\/juegos$/); // volver desde el juego sí muestra la Sala de juegos
  expect(errors).toEqual([]);
});

// Crear la sala desde el Centro de control (va al final: cierra la sala de los datos fijos)
test('crear sala de juegos: local y listo', async ({ page }) => {
  await srv.admin.post(`/api/sessions/${sid}/host/close`);
  const errors = await open(page, '#/control', { size: PANEL, admin: true });
  await page.locator('#ctl-sala-go a').click();
  await expect(page).toHaveURL(/#\/nuevo$/);
  await page.locator('[data-venue="tobalaba"]').click();
  await page.getByRole('button', { name: '🎮 Crear sala de juegos' }).click();
  await expect(page).toHaveURL(/#\/juegos$/);
  const cur = await srv.ok('GET', '/api/current');
  expect(cur.sessions[0].name).toBe('Los Juegos de Tobalaba');
  expect(errors).toEqual([]);
});
