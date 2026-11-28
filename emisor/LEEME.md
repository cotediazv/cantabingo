# Emisor de la pantalla vertical

Pedido de Cote (25 nov): la pantalla vertical de Mercado Kennedy se ve en el decodificador en tiempo real y con la
imagen completa, sin depender de un computador del local.

- `emisor.js` abre la pantalla vertical real (`#/vertical-in/kennedy`, la misma de la vista previa del GC Master) en un
  Chrome con pantalla virtual, se captura a sí mismo y la envía por WebRTC (WHIP) a un canal propio de Cloudflare Stream.
  Solo envía mientras hay un juego de la sala de juegos en pantalla (no el karaoke ni el show).
- El decodificador (`pv.html`) la recibe por WHEP y la pone encima durante los juegos; si no llega, sigue con su propia
  vista. La dirección de reproducción va en la variable `EMISION_KENNEDY` del servicio principal.
- Corre como **Cron Job** de Render con Docker (`emisor/Dockerfile`). Lo arranca solo el servidor de la Sala cuando
  empieza un juego en Kennedy (variables `RENDER_API_KEY` y `EMISOR_CRON` en el servicio principal) y se apaga solo tras
  10 minutos sin juego (`SIN_JUEGO`). Se cobra solo el tiempo que corre.
- **`EMISOR_CLAVE` es obligatoria** (orden de Code 0, 28 nov): el mismo valor en el servicio principal (cantabingo) y en el
  Cron Job, **solo en Render**. Sin ella la Sala no arranca el emisor y rechaza sus avisos, fotos e imágenes del plan B.
- Variables del Cron Job: `WHIP_URL` (dirección de publicación del canal: **secreta**, solo en Render), `RES`
  (`1080` o `720`), y opcionales `PANTALLA` (por defecto `kennedy`), `SITIO` y `SIN_JUEGO` (minutos).
- Probado en local con Chrome 153 (Playwright 1.63.0): 1080x1920 a unos 25 cuadros por segundo, H.264, 1,6 núcleos.
