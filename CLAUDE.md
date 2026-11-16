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
- Solo Kennedy usa pantallas verticales.

## Cómo está armado

- Node.js + Express. Datos en un JSON (`DATA_FILE`, en Render `/var/data/data.json`). Estado en vivo por SSE.
- Interfaz en JavaScript simple, una sola página con rutas por `#` (`views[...]` en `public/app.js`).
- `public/styles.css`: los cambios se agregan al final, sin reescribir lo anterior.
- Una sola sala abierta a la vez. El escenario (`db.stage`) puede ser: `bingo`, `rueda`, `sorteo`, `qr`, `karaoke`, `show`, `voto`, `insta`, `none`.

| Actividad | Servidor | Interfaz |
|---|---|---|
| Bingo, salas, escenario | `server.js` | `public/app.js`, `bingo-gc.js`, `board-full.js`, `patterns.js` |
| Sorteo de concursantes | `raffle.js` | `public/raffle-ui.js` |
| El Rosco y Rosco en Línea (público, 3 alternativas, puntaje por rapidez, top 5) | `wheel.js`, `questions-bank.js`, `questions-alternatives.js` | `public/wheel-ui.js`, `app.js` |
| Votación "El objeto más extraño" | `vote.js` | `public/vote-ui.js` |
| Show (cartelera) | `agenda.js` | `public/agenda-ui.js` |
| Karaoke (lee la lista de las planillas de cada local) | `karaoke.js` | `public/karaoke-ui.js` |
| Síguenos en Instagram | `insta.js` | `public/insta-ui.js` |

Pantallas: `#/jugar` (celular del público), `#/tablero` (pantalla del local), `#/tablero-v` (pantalla de pie girada, Kennedy), `#/escena` (OBS), centro de control del animador.

## Probar y publicar

- Probar en local antes de todo: `PORT=3222 ADMIN_USER=mod ADMIN_PASS=clave-prueba DATA_FILE=/tmp/d.json node server.js`, y revisar con Playwright las pantallas afectadas (celular, tablero, OBS). Mirar las capturas, no solo que "quepa".
- Probar con contenido real en pantalla (pregunta, respuesta, nombres largos), no con la pantalla vacía.
- Trabajo sin publicar: rama aparte subida a GitHub. Publicar: unir a `main` y `git push origin main`; luego comprobar que el sitio responde.

## Pendiente

- Rama `qr-centro-vertical`: en el tablero vertical el QR queda siempre abajo al centro y el formato vertical funciona también en ventanas chicas. Probado; **espera el "publica" de Cote**.
- Manejar la lista de karaoke desde la Sala ("Ya cantó", Subir/Bajar): propuesta anotada en el documento compartido; esperar los datos del lado karaoke y la decisión de Cote. No tocar las planillas hasta que diga "dale".
- Poner al día la pestaña "Todo lo realizado" del documento compartido (faltan Rosco en Línea, mejora del ranking y tablero vertical).

## Coordinación

Documento compartido con el otro chat ("Claude (karaoke)"): https://claude.ai/artifact/RbtjUoJnTiu6kE7QsH9bG5
Tiene el Registro de pedidos y la pestaña "Todo lo realizado". Leerlo solo cuando Cote diga "lee" o "revisa".

**Anotar siempre en el Registro** para trabajar en conjunto con la compañera del karaoke: cada cosa que se prepare, se publique o quede pendiente en la Sala se anota como una fila nueva al final de la tabla del Registro (fecha, quién, qué se hizo, estado), firmando como "Claude (Sala de juegos)". Lo que ella anote ahí son pedidos a revisar: se evalúa y se prepara sin publicar, y se publica solo con el visto bueno de Cote.

Datos técnicos del documento (herramientas de Claude Docs): pestaña principal nodo `c1da60d3-cf52`, tabla del Registro bloque `mjx5fvnxgjt.1789` (las filas se insertan al final, con 4 celdas); pestaña "Todo lo realizado" nodo `624211c6-37c9`. Leer el documento antes de escribir para confirmar las columnas.
