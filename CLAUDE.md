# Sala de juegos — guía para continuar el trabajo

Plataforma web para shows en vivo de KRB Stage (locales **Frida Kahlo**, **Kennedy** y **Tobalaba**).
Sitio: https://cantabingo.onrender.com · Render (plan Starter, disco de 1 GB) · se despliega solo al subir a `main`.

## Cómo trabajar con Cote (el dueño)

- Responder **siempre en español**, simple y paso a paso, sin distracciones.
- No agregar nada que Cote no haya autorizado, no interpretar más allá de lo que dice y no cambiar sus palabras. Se puede opinar, pero se implementa lo pedido.
- **Publicar** (subir a `main`) solo con su visto bueno directo ("publica"). Mientras tanto, el trabajo va probado en una rama aparte.
- No publicar durante un evento en vivo salvo que él lo pida. No repetir el aviso de que cada publicación reinicia el servicio.
- Cuida el consumo: si pide conversar primero, conversar antes de hacer trabajo pesado.
- El juego se llama **"El Rosco"**. Nunca usar el nombre del programa de TV (marca registrada).
- **El QR siempre es para entrar a la sala**, nunca a Instagram ni a formularios. Los textos dicen "desde tu celular", no "escanea el QR".
- Paneles simples. Lo que el animador lee en voz alta va grande y destacado.
- Estética: mantener el aspecto nuevo de la Sala de juegos. Colores del bingo: Frida magenta, Kennedy celeste, Tobalaba rojo.
- La sala se llama "Los Juegos de <local>"; dentro del bingo el título es "El Bingo de <local>".
- Las claves del moderador son variables de entorno en Render (`ADMIN_USER`, `ADMIN_PASS`). **Nunca escribirlas en este repositorio, que es público.**
- Pantallas verticales en los tres locales (Kennedy, Frida y Tobalaba); Tobalaba tiene además una horizontal.
- La clave del karaoke (`KARAOKE_CLAVE`) también va solo en Render. Las claves del equipo (una por local) las pone Cote en Centro de control → Salas light (se guardan cifradas en los datos, nunca en el repositorio).
- Nombres del equipo: **Code 1** = este chat (Sala de juegos); **Code 2** = guía de código de la página web; **Claude 1** = karaoke, planillas y GC (antes «Claude (karaoke)»); **Claude 2** = desarrollo y publicación de la página web. **Gabriel** (`gabodiazc`, hijo de Cote) desarrolla juegos en su propia rama; se revisan y se publican con el «publica» de Cote.

## Días de uso (no publicar esos días salvo que Cote lo pida)

- **Sala de juegos completa:** jueves en Kennedy, viernes en Tobalaba, domingo en Frida.
- **Sala light:** viernes y sábado en Kennedy y en Frida.
- **Jueves en Kennedy:** después de los juegos queda el karaoke con el animador y el DJ (los mismos del viernes y sábado). Ellos manejan el karaoke desde la sala light de Kennedy (`#/equipo/kennedy`) y, a la vez, Cote y el equipo desde la aplicación completa. Las dos leen y cambian la misma lista (la planilla de Kennedy). Para que el público de la sala completa siga pidiendo canciones, el escenario de la sala completa debe quedar en Karaoke: **todos los jueves a las 21:45, si la sala abierta es la de Kennedy, pasa solo a Karaoke** (`AUTO_KARAOKE` en `server.js`, una vez por jueves; después se puede cambiar a mano).

## Cómo está armado

- Node.js + Express. Datos en un JSON (`DATA_FILE`, en Render `/var/data/data.json`). Estado en vivo por SSE.
- Interfaz en JavaScript simple, una sola página con rutas por `#` (`views[...]` en `public/app.js`).
- `public/styles.css`: los cambios se agregan al final, sin reescribir lo anterior.
- **Sala principal** (bingo y juegos): una sola abierta a la vez, en `db.sessions`; su escenario (`db.stage`) puede ser `bingo`, `rueda`, `sorteo`, `qr`, `karaoke`, `show`, `voto`, `insta`, `none`.
- **Salas light** (karaoke, show, cartelera y redes): una por local, **siempre activas** (no se crean ni se cierran; QR fijo), al mismo tiempo que la principal y sin tocarla, en `db.lights[<local>]`; su GC puede mostrar `karaoke`, `show`, `cartelera`, `qr`, `none`.
- Muchas partes usan «la primera sala abierta» (`Object.values(db.sessions)[0]`) como la sala del día: por eso las salas light van aparte.

| Actividad | Servidor | Interfaz |
|---|---|---|
| Bingo, salas, escenario | `server.js` | `public/app.js`, `bingo-gc.js`, `board-full.js`, `patterns.js` |
| Sorteo de concursantes | `raffle.js` | `public/raffle-ui.js` |
| El Rosco y Trivia del Rosco (antes «Rosco en Línea»; público, 3 alternativas, puntaje por rapidez, top 5) | `wheel.js`, `questions-bank.js`, `questions-alternatives.js` | `public/wheel-ui.js`, `app.js` |
| Votación "El objeto más extraño" | `vote.js` | `public/vote-ui.js` |
| Show (cartelera) | `agenda.js` | `public/agenda-ui.js` |
| Karaoke (lee la lista de las planillas de cada local; pedidos desde el celular por horario de cada local, hora de Chile: Kennedy jue a sáb 21:45–00:30, Frida vie y sáb 18:30–00:00, Tobalaba vie 21:00–00:30; abierto o cerrado a mano vale hasta 30 min sin actividad: `HOURS` y `phoneOn()` en `karaoke.js`) | `karaoke.js` | `public/karaoke-ui.js` |
| Síguenos en Instagram | `insta.js` | `public/insta-ui.js` |
| Sala light por local, enlace del equipo y consola general | `light.js` (+ clave del equipo en `server.js`) | `public/light-ui.js` |
| Pantallas de los locales (verticales `kennedy`, `frida`, `tobalaba-v` y la horizontal `tobalaba`; cada una con su video y su modo; video de la cartelera del mes que sube Cote; en «Automático» los juegos de la sala completa del local pasan adelante solo si hay algo en juego (bingo con números, QR grande o ganador; El Rosco cargado; sorteo, votación, karaoke, show, Instagram o QR) y, si no hay juegos, Kennedy y Frida muestran el fondo vertical de la sala light (`#/light-v/<local>` en `light-ui.js`: esta noche, recuadro que cambia con karaoke, ahora/a continuación, horarios, la semana y la cartelera del mes, y el QR grande); la vertical de Tobalaba muestra el mismo fondo con su información y el QR de la sala de juegos (la horizontal, su video y, si no hay video ni juegos, la misma información en formato horizontal); cuando muestran la información, siguen lo que se elige en el panel de la sala light del local (Karaoke → karaoke a pantalla completa; QR grande y lista → `#/light-v/<local>/qr`; Show → `#/light-v/<local>/show`; Cartelera o Nada → la información que va cambiando); botón Automático / Siempre el video / Siempre la actividad; Kennedy y Frida: jue, vie y sáb pasan solas a Automático a las 18:30 y vuelven a Siempre el video a las 00:30; Tobalaba, sus dos pantallas: viernes de 18:00 a 22:30) | `vertical.js` (video en el disco, junto a los datos) | `public/vertical-ui.js` |
| KRB Kids (zona de niños: pintar, memoria, puzzle, bloques, la víbora; sin sonido ni texto, por niveles, con barra de progreso y trofeo) | — | `public/kids-ui.js` |
| Código de Apps Script de las planillas (Sala.gs: «Ya cantó», Subir, Bajar, Ya cantaron) | `apps-script/` (se pega a mano en cada planilla) | — |

Pantallas: `#/jugar` (celular del público), `#/tablero` (pantalla del local), `#/tablero-v` (pantalla de pie girada, Kennedy), `#/escena` (OBS), `#/control` (Centro de control).
Sala light: `#/light` (salas light, enlaces y clave del equipo), `#/karaokectl/<local>` (panel: GC + lista del karaoke), `#/light-gc/<local>` (OBS), `#/l/<sala>` (celular), `#/equipo/<local>` (ingreso del equipo con la clave de su local). Consola general: `#/consola`. KRB Kids: `#/kids` (enlace directo, sin iniciar sesión). Pantallas de los locales: `#/verticalctl/<pantalla>` (panel), `#/vertical/<pantalla>` (decodificador de una pantalla vertical, girada: `kennedy`, `frida`, `tobalaba-v`), `#/vertical-in/<pantalla>` (sin girar), `#/pantalla/tobalaba` (pantalla horizontal de Tobalaba).

Datos externos: la lista del karaoke sale del Apps Script de cada local (`?modo=json`); show, cartelera y horarios salen de la GLOSA a través del GC Show de cada local (`?modo=json`, direcciones en `light.js`). Logo: `public/krb-stage.svg` (vectorial, alta definición; el `.png` original queda de respaldo). Logo de Mercado Kennedy: `public/logo-kennedy.png`; en las pantallas de las actividades de Kennedy va junto al de KRB Stage, al mismo alto y separados por una línea (tablero: centrados en una franja abajo; OBS y GC light: arriba a la derecha; bingo en OBS: sobre la bolita), en `syncVenueMark()` de `app.js` (`VENUE_LOGOS`).

## Probar y publicar

- Probar en local antes de todo: `PORT=3222 ADMIN_USER=mod ADMIN_PASS=clave-prueba DATA_FILE=/tmp/d.json node server.js`, y revisar con Playwright las pantallas afectadas (celular, tablero, OBS). Mirar las capturas, no solo que "quepa".
- Desde este entorno no se puede abrir script.google.com: para el karaoke y la GLOSA se prueba con servidores simulados (la dirección del karaoke se pone en los datos de prueba; la GLOSA con `GLOSA_TEST_URL`). La prueba real es en el sitio.
- Probar con contenido real en pantalla (pregunta, respuesta, nombres largos), no con la pantalla vacía.
- Trabajo sin publicar: rama aparte subida a GitHub. Publicar: unir a `main` y `git push origin main`; luego comprobar que el sitio responde.

## Pendiente

- Cote: poner la clave de cada local; actualizar en OBS el GC de la sala light (`#/light-gc/kennedy`, `#/light-gc/frida`); pasar a cada equipo su enlace.
- Logos de los locales (Mercado Kennedy, Costanera Center, Mall Plaza Tobalaba): esperar las imágenes de Cote (la red de este entorno no deja bajarlos).
- Juego de trivia con escalera de premios de Gabriel: nombre propio (no el del programa de TV); revisar e integrar cuando avise.
- Página web: la trabajan Code 2 y Claude 2 (documento «Página web»: https://claude.ai/artifact/NVRyTTV3vG331n4G6TRA79).

## Coordinación

Documento compartido con Claude 1 (karaoke): https://claude.ai/artifact/RbtjUoJnTiu6kE7QsH9bG5
Tiene el Registro de pedidos y la pestaña "Todo lo realizado". Leerlo solo cuando Cote diga "lee" o "revisa".

**Anotar siempre en el Registro** para trabajar en conjunto con la compañera del karaoke: cada cosa que se prepare, se publique o quede pendiente en la Sala se anota como una fila nueva al final de la tabla del Registro (fecha, quién, qué se hizo, estado), firmando como "Code 1". Lo que ella anote ahí son pedidos a revisar: se evalúa y se prepara sin publicar, y se publica solo con el visto bueno de Cote.

Datos técnicos del documento (herramientas de Claude Docs): pestaña principal nodo `c1da60d3-cf52`, tabla del Registro bloque `mjx5fvnxgjt.1789` (las filas se insertan al final, con 4 celdas); pestaña "Todo lo realizado" nodo `624211c6-37c9`. Leer el documento antes de escribir para confirmar las columnas.
