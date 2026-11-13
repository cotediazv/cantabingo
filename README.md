# Cantabingo

App web para crear cartones de bingo y dirigir sesiones en vivo.

## Uso

```bash
npm install
npm start
```

Abre http://localhost:3000 (cambia el puerto con `PORT=8080 npm start`).

## Qué incluye

- **Moderador**: el panel pide usuario y contraseña, definidos en las variables de entorno `ADMIN_USER` y `ADMIN_PASS` (sin ellas nadie puede moderar).
- **Enlace fijo**: `#/jugar` y su QR llevan siempre a la sesión activa.
- **Proyectos**: de 25 a 3.000 cartones virtuales únicos con números (25–150 valores), palabras/frases o emojis; encabezado de 5 letras, casilla central libre, numeración inicial.
- **Sesión en vivo**: contraseña, 1–4 cartones por participante, un patrón por ronda (con su sombra en el cartón), generador manual/automático (5–60 s) con voz, selección manual, lista de resultados con validación automática, reinicio de ronda, selección final, 3 horas de duración.
- **Participantes**: entran desde el celular por lista pública, enlace o QR, sin cuenta; sus cartones se restauran al recargar. El valor actual queda fijo arriba mientras se desplazan por sus cartones.
- **Tablero para TV**: `#/tablero/<sesión>`.

No hay cartones impresos: todos los cartones se juegan en pantalla.

## Estructura

- `server.js` — API, generación de cartones, lógica de sesión y eventos en tiempo real (SSE). Los datos se guardan en `/var/data/data.json` si existe ese disco permanente; si no, en `data.json` junto al código (se pierde al reiniciar en hostings sin disco).
- `public/bingo-gc.js` — gráfica del bingo para OBS (`#/gc`): franjas con título, QR, sorteo actual y figura, sobre fondo transparente.
- `raffle.js` y `public/raffle-ui.js` — sorteo de concursantes del rosco entre quienes se unieron al bingo.
- `wheel.js` y `public/wheel-ui.js` — juego «El Rosco» (servidor e interfaz).
- `questions-bank.js` — banco de preguntas de la rueda (cultura general, música y arte; fácil y medio). Se amplía agregando líneas.
- `public/patterns.js` — catálogo de patrones (compartido servidor/navegador).
- `public/app.js`, `styles.css`, `index.html` — interfaz.
