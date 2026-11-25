# Emisor de la pantalla vertical

Pedido de Cote (25 nov): la pantalla vertical de Mercado Kennedy se ve en el decodificador en tiempo real y con la
imagen completa, sin depender de un computador del local.

- `emisor.js` abre la pantalla vertical real (`#/vertical-in/kennedy`, la misma de la vista previa del GC Master) en un
  Chrome con pantalla virtual, se captura a sí mismo y la envía por WebRTC (WHIP) a un canal propio de Cloudflare Stream.
  Solo envía mientras hay un juego de la sala de juegos en pantalla (no el karaoke ni el show).
- El decodificador (`pv.html`) la recibe por WHEP y la pone encima durante los juegos; si no llega, sigue con su propia
  vista. La dirección de reproducción va en la variable `EMISION_KENNEDY` del servicio principal.
- Corre como **Cron Job** de Render con Docker (`emisor/Dockerfile`): los jueves parte a las 18:20 de Chile y termina
  sola a las 21:45 (otros días, «Trigger Run» lo deja 4 horas). Se cobra solo el tiempo que corre.
- Variables del Cron Job: `WHIP_URL` (dirección de publicación del canal: **secreta**, solo en Render), `RES`
  (`1080` o `720`), y opcionales `PANTALLA` (por defecto `kennedy`), `SITIO` y `HASTA` (hora de término, ej. `21:45`).
- Probado en local con Chrome 153 (Playwright 1.63.0): 1080x1920 a unos 25 cuadros por segundo, H.264, 1,6 núcleos.
