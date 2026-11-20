// Sala de juegos de KRB Stage. El código está en src/ (ver src/app.js y CLAUDE.md).
const { createApp } = require('./src/app');

createApp().listen(process.env.PORT || 3000);
