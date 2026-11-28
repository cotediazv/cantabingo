# Fundamentos del proyecto KRB

Un solo documento, comprimido, con todo lo que hay y cómo funciona. Todos los Code y Claude acuden aquí primero, sin tener que revisar los registros.
Lo mantiene **Code Cero**. Última puesta al día: **sábado 28 nov 2026, 13:30 (hora de Chile)**.

Reglas de este documento:
- Si algo de aquí choca con un registro, **vale lo último que dijo Cote**; se avisa a Code Cero para corregir el documento.
- Aquí **no van** claves, contraseñas, PIN, enlaces privados ni montos de personas.
- Lo que no está comprobado lleva la marca **(sin comprobar)**.
- El detalle técnico fino de la Sala sigue en `CLAUDE.md` (en `main`). Este documento es el mapa; `CLAUDE.md` es el manual de la Sala.

---

## 1. Qué es KRB Stage

- Productora de shows en vivo de Cote (José Miguel Díaz). Locales: **Mercado Kennedy**, **Frida Kahlo** y **Tobalaba**.
- Sala de juegos: https://cantabingo.onrender.com · Página web: https://www.krbstage.cl
- Repositorio (público): `cotediazv/cantabingo`. Todo vive en la misma rama `main`: la Sala, Programación, la página web y el demo de luces.
- **Cada subida a `main` se publica sola y reinicia la Sala** (también si solo cambia la web).
- Render: el servicio `cantabingo` está en la cuenta **«Cote Díaz»** (no en la de KRB). Plan Starter, disco de 1 GB en `/var/data`.

## 2. El equipo y cómo se manda

| Quién | Qué hace |
|---|---|
| **Cote** | Dueño. Sus palabras se cumplen literales. |
| **Claude 0** | Secretaria por voz. Solo mensajera: anota lo que dice Cote y le lee lo que escribe Code Cero. |
| **Code Cero** (antes Code 0) | Gerente y socio. Recibe todo, deriva a cada área, ordena los turnos para publicar y responde a Cote. Sus órdenes valen como las de Cote, también para publicar. |
| **Code 1 / Claude 1** | Sala de juegos (bingo, juegos, pantallas, GC, karaoke, salas light). |
| **Code 2 / Claude 2** | Página web krbstage.cl y Kararock Band. Flyers. |
| **Code 3 / Claude 3** | Planillas: turnos, cartelera, GLOSA, página `/programacion`. |
| **Code 4 / Claude 4** | Iluminación de Mercado Kennedy (el Dell). |
| **Gabriel** (`gabodiazc`) | Juegos en sus ramas `gabriel/*`. En pausa («segunda etapa»). |

**La vía regular** (regla de Cote, 28 nov): Cote → Claude 0 → Code Cero → el Code del área. Nadie se salta la línea.
**Todo queda escrito** (regla urgente de Cote, 28 nov): cada Code deja escrito completo, no resumido, todo lo que hace y todo lo que le dice a Cote, y avisa a Code Cero. Code Cero deja todo en el registro de Claude 0.

### Documentos
| Documento | Enlace |
|---|---|
| Registro Claude 0 y Code Cero (el principal) | https://claude.ai/artifact/XfjPp9F54FiHh9yEqAcEB1 |
| Registro de la Sala (Code 1) | https://claude.ai/artifact/RbtjUoJnTiu6kE7QsH9bG5 |
| Página web (Code 2) | https://claude.ai/artifact/NVRyTTV3vG331n4G6TRA79 |
| Registro Claude 3 y Code 3 | https://claude.ai/artifact/AGZ1bZxJqBQiDFhCc7Qjci |
| Registro Claude 4 y Code 4 | https://claude.ai/artifact/Nim2YfHh5C9XKGS6LfXse4 |
| Informe de Code 1 | https://claude.ai/artifact/2spMdUMYsMSbKBKUfiEuW5 |
| Informe de Code 2 | https://claude.ai/artifact/H5rJAC1BhHWuVAxfQ1yeXU |
| Informe de Code 3 | https://claude.ai/artifact/7p1JnNw1pDQHRM5pRgGauk |
| Informe de Code 4 | https://claude.ai/artifact/HD3NY57FDXHjfoFjbjDQyV |
| Guía del animador | https://claude.ai/artifact/UDvbHK5zrbnRMVZzS1VR7d |
| Si se cae el Dell u OBS | https://claude.ai/artifact/AVcxoj795gqCLMArnwYDRz |

## 3. Reglas permanentes de Cote

**Trato**
- Responder siempre en español, simple, corto y concreto. Un tema a la vez. Cada cosa que se nombra va con su enlace.
- Nada de suposiciones como si fueran hechos: separar «comprobado» de «supuesto».
- No se agrega nada que Cote no haya autorizado, no se interpreta más allá de lo que dice y no se cambia ni un ápice de sus palabras.

**Seguridad**
- Ninguna clave en el repositorio (es público), ni en registros ni en chats. Las claves van solo en Render o en el equipo que las usa.
- Sin montos de personas en registros ni mensajes.
- No borrar nada extraño del repositorio: puede ser de otro compañero.

**Publicar**
- No publicar durante un show ni en las horas previas, salvo que Cote lo pida.
- Publica uno a la vez, en el turno que da Code Cero. Antes: pruebas en verde. Después: comprobar el sitio y avisar a Code Cero.
- Días de show: jueves Kennedy (juegos 18:30 y karaoke 21:45), viernes Tobalaba (18:00) y sala light en Kennedy y Frida, sábado sala light en Kennedy y Frida, domingo Frida (13:00).

**Nombres y textos**
- El juego se llama **«El Rosko»**. Nunca el nombre del programa de TV. También **«¿Quién quiere ser ganador?»**.
- «Mercado Kennedy» en todo lo visible.
- El QR siempre es para entrar a la sala. Junto al QR: **«Escanea el código QR con tu celular»**.
- Nombres y apellidos siempre completos; si no caben, se achica la letra.
- En la sala: **«Número de participantes»** y **«Crear juego»** (28 nov).

**Pantallas y videos**
- Videos siempre livianos: 1280x720 o 720x1280, 30 cps, sin audio, tope 0,9 Mbps. Nunca subir el original pesado.
- La optimización automática de videos en el servidor está **apagada** y no se enciende sin que Cote lo pida.
- Sin información duplicada en pantalla. Paneles simples.
- El GC Master no se toca sin pedido de Cote.

## 4. La Sala de juegos (Code 1)

**Cómo está armada**: Node.js + Express. Datos en un archivo JSON en el disco de Render. Estado en vivo por SSE. Interfaz en JavaScript simple, una sola página con rutas `#/`.

**Juegos**: Bingo · El Rosko (con la Trivia del Rosko para el público) · El Festival (concurso de karaoke) · El objeto más extraño · ¿Quién quiere ser ganador? (de Gabriel) · El último en pie (en pausa, versión de prueba).
**Cómo se elige el juego**: Manual, Por sorteo o Por votación del público.
**Además**: sorteo de concursantes, karaoke (lee la planilla de cada local), salas light por local (siempre activas), pantallas de los locales (3 verticales y 3 horizontales), capa gráfica y efectos, KRB Kids, registro de clientes, conectados, sala simulada, respaldo diario de los datos (05:00, 14 días).

**Direcciones principales**
| Para qué | Dirección |
|---|---|
| Celular del público | `#/jugar` |
| Pantalla del local | `#/tablero` (horizontal), `#/tablero-v` (de pie) |
| OBS | `#/escena` |
| Centro de control | `#/control` · iPad viejo: `/cc` |
| Animador | `/animador` · iPad viejo: `/ca` |
| GC Master en el iPhone | `/sala` |
| Sala light | `#/light`, `#/karaokectl/<local>`, `#/light-gc/<local>`, `#/equipo/<local>` |
| Pantallas de los locales | `#/verticalctl/<pantalla>`, `#/vertical/<pantalla>`, `#/pantalla/<pantalla>` |
| KRB Kids | `#/kids` |
| Programación (Code 3) | `/programacion` |
| Registro en línea del Dell | `#/lucesreg` |

**Salas automáticas** (hora de Chile): jueves Kennedy 18:30, viernes Tobalaba 18:00, domingo Frida 13:00. Jueves 21:45 Kennedy pasa solo a Karaoke. Tobalaba cierra 22:45, Frida (domingo) 17:00.

**Copia para eventos**: servicio `cantabingo-eventos` en Render, mismo repositorio, con `MODO_EVENTO=1`, publicación automática **apagada** (se actualiza con «Manual Deploy → Deploy latest commit») y **usuario y clave propios, distintos** de los de la Sala. Portada «EVENTOS». Tiene todos los juegos y las tres formas de elegir. Se borra después del evento.

**Variables en Render (solo nombres)**: `ADMIN_USER`, `ADMIN_PASS`, `KARAOKE_CLAVE`, `LUCES_URL`, `LUCES_CLAVE`, `EMISOR_CLAVE` (falta ponerla), `IG_TOKEN_*`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `RESPALDO_URL` y `RESPALDO_CLAVE` (copia a Drive, apagada).

## 5. Página web (Code 2)

- Sitio estático en la carpeta `krbstage-web/`, publicado en Render como `krbstage-web`. Dominio `krbstage.cl` en NIC Chile con Cloudflare.
- Saca casi todo de la Sala: Instagram (5 cuentas), Twitch, YouTube, cartelera y pantallas. Desde el 28 nov, si la Sala se reinicia, la web conserva los últimos datos buenos.
- Transmisión propia de baja latencia por Cloudflare Stream; si no llega imagen, usa Twitch.
- Cifras publicadas (28 nov, palabras de Cote): 250 / 350 / 250 personas por noche; nace en 2023, con historia desde 2009.
- En la web no aparece el nombre de José Miguel Díaz. Primero describir, sin vender; sin cifras inventadas.
- Kararock Band: `krbstage-web/kararock/` · https://www.kararockband.cl (Cote confirmó que abre).
- **Flyers**: generador en la rama de Code 2 (sin publicar). Fotos en `Fotos artistas <año>-<mes>/<Local>/NN_show_artista.jpg`, donde **NN es el orden dentro del mes** (decisión de Cote), se cruza con la cartelera por el nombre del show.

## 6. Planillas, turnos y cartelera (Code 3)

- **GLOSA**: planilla «GLOSA KRB STAGE OFICIAL 2026», una sola para los 3 locales, una pestaña por mes. Creada con la cuenta de la productora.
- **GC Show** (un Apps Script por local): lee la cartelera y los horarios de la GLOSA y los entrega a la Sala. La Sala los relee cada 10 minutos.
- **Programación KRB** (`/programacion`, solo Cote): arma el mes, el equipo, los shows y lo envía a la GLOSA. Tiene «Bajar respaldo», pestaña «Revisar» y turnos extra. Cuando el pago es variable, **siempre pide el monto a mano**.
- Los Apps Script (`apps-script/`) se **pegan a mano** en Google: desde aquí no se puede abrir script.google.com.
- Si la GLOSA no trae horarios de Frida o Tobalaba, la Sala usa **las horas del mes anterior** (orden de Cote, 28 nov).
- Formato del show: artista entre comillas; lo que va entre paréntesis no se muestra.
- Diciembre: cerrados el jueves 24, viernes 25 y jueves 31.

## 7. Iluminación de Mercado Kennedy (Code 4)

- Programa propio «KRB_Luces» en el **Dell** del local (PowerShell + cable USB uDMX). Sirve el panel del iPad y el del DJ.
- El Dell se actualiza solo desde la rama **`luces-estable`**. Las ramas de trabajo son `code4/*`.
- La Sala le avisa «momentos» (bingo, El Rosko, ganador, etc.) y el programa decide la luz. Solo con la sala de Kennedy abierta.
- El Dell también: Standby a las 19:00 (jue a sáb), parte y para OBS (20:00 a 00:30), sube su registro a la Sala cada 10 minutos, avisa al celular.
- **El Dell es un solo punto de falla**: corre a la vez OBS, las luces, el túnel y las pantallas.
- El enlace privado del registro del Dell vive **solo** en el registro de Claude 4.

## 8. Estado al sábado 28 nov, 13:30

**Publicado hoy y comprobado** (versión de `main`: `8864e45`)
- Respaldo de Programación y cartelera de solo lectura (Code 3).
- Aviso de datos personales listo pero apagado; música al terminar ¿Quién quiere ser ganador?; nombres completos en la Trivia; entrada del emisor cerrada sin clave (Code 1).
- La web ya no queda vacía cuando la Sala se reinicia (Code 2).
- Respaldo diario de los datos (Code 1).
- Horarios de Frida y Tobalaba con las horas del mes anterior (Code 1).
- Sala del evento con todos los juegos y las tres formas de elegir; «Número de participantes» y «Crear juego» (Code 1).
- Pestaña «Revisar» y turnos extra con monto a mano (Code 3).
- Cifras y «Depeche Mode vs Pet Shop Boys, por Guillermo Rojas y Mr. Psíquico» en la web (Code 2).
- En el Dell: arreglo de la pestaña Cabezas y de las luces que saltaban a Standby.

**En curso**
- Dell: el adaptador de las luces quedó sin controlador tras un reinicio. Visita al local a las 16:00; hoja única: https://claude.ai/artifact/GZHmXNYBgfdzkv3XaQgsB5 . Causa de fondo: (sin comprobar).
- Semáforo del Dell en el Centro de control: Code 1 lo arma en su rama; si no está probado a las 15:15, queda para el lunes.

**Próximo**
- Domingo 29: evento «Colada Continua», 9:00 a 18:00, en la copia de eventos. Juegos de Frida a las 13:00 en el sitio principal.
- Lunes 30: borrar la copia de eventos; cortina liviana de OBS; arreglos de la pantalla liviana de Kennedy; sesión de flyers; respaldo a Drive; poner `EMISOR_CLAVE`.

## 9. Riesgos conocidos

1. Muchas publicaciones al día en un mismo `main` que reinicia la Sala.
2. Un solo servidor y los datos en un solo disco (ya hay respaldo diario; falta la copia fuera de Render).
3. El Dell de Kennedy como único punto de falla de luces, OBS y pantallas.
4. Equipos reales (iPad viejo, decodificador, OBS) que solo se prueban en el show.
5. Datos personales del público: el aviso está hecho y apagado («segunda etapa»); plazo de borrado sin definir.
6. Los Apps Script se pegan a mano: lo que está en el repositorio puede no ser lo que corre en Google (sin comprobar).

## 10. Cómo se pone al día este documento

- Cada Code avisa a Code Cero cuando cambia algo de su área; Code Cero corrige el documento.
- Nadie más lo edita. Si ves un error, avisa a Code Cero.
