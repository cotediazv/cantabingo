// Pruebas de pantalla (npm run test:e2e). Usan el Chrome instalado en el computador.
// Las capturas de referencia están en test/e2e/pantallas.spec.js-snapshots/ y son del Mac de desarrollo:
// en otro sistema las letras cambian un poco, por eso estas pruebas no corren en GitHub.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test/e2e',
  testMatch: '*.spec.js',
  workers: 1, // un solo servidor con un solo escenario: las pruebas van una tras otra
  timeout: 60000,
  reporter: [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide' } },
  use: { channel: 'chrome', headless: true, locale: 'es-CL', timezoneId: 'America/Santiago' },
});
