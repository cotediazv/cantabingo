# Cantabingo

App web para crear cartones de bingo y dirigir sesiones en vivo.

## Uso

```bash
npm install
npm start
```

Abre http://localhost:3000 (cambia el puerto con `PORT=8080 npm start`).

## Qué incluye

- **Proyectos**: de 25 a 3.000 cartones virtuales únicos con números (25–150 valores), palabras/frases o emojis; encabezado de 5 letras, casilla central libre, numeración inicial.
- **Sesión en vivo**: contraseña, 1–4 cartones por participante, hasta 6 patrones por ronda, generador manual/automático (5–60 s) con voz, selección manual, lista de resultados con validación automática, reinicio de ronda, selección final, 3 horas de duración.
- **Participantes**: entran desde el celular por lista pública, enlace o QR, sin cuenta; sus cartones se restauran al recargar. El valor actual queda fijo arriba mientras se desplazan por sus cartones.
- **Tablero para TV**: `#/tablero/<sesión>`.
- **Herramientas gratis**: generador de números y cartón virtual independientes.

No hay cartones impresos: todos los cartones se juegan en pantalla.

## Estructura

- `server.js` — API, generación de cartones, lógica de sesión y eventos en tiempo real (SSE). Los datos se guardan en `data.json`.
- `public/patterns.js` — catálogo de patrones (compartido servidor/navegador).
- `public/app.js`, `styles.css`, `index.html` — interfaz.
