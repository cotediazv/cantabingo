// Revisión del código del servidor (npm test): sobre todo, que no haya variables sin definir, el error típico
// al mover código de un archivo a otro. El código del navegador (public/) lo revisa test/compat.test.js.
module.exports = [{
  files: ['server.js', 'src/**/*.js', 'test/**/*.js', 'eslint.config.js', 'playwright.config.js'],
  languageOptions: {
    ecmaVersion: 2024,
    sourceType: 'commonjs',
    globals: Object.fromEntries(['require', 'module', 'process', 'console', '__dirname', 'Buffer', 'setTimeout', 'clearTimeout', 'setInterval',
      'clearInterval', 'fetch', 'AbortSignal', 'AbortController', 'URL', 'URLSearchParams', 'TextDecoder', 'document', 'localStorage'].map((g) => [g, 'readonly'])),
  },
  rules: { 'no-undef': 'error' },
}];
