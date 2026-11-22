# Fuentes de las piezas de la capa gráfica

No se publican (lo que usa el sitio está en `public/capa/`). Sirven para volver a armar las piezas:

- `capa3d-src.js` → `public/capa/capa3d.js` (texto en 3D real con three.js). En una carpeta temporal:
  `npm i esbuild three@0.187.0` y
  `esbuild capa3d-src.js --bundle --minify --format=iife --target=chrome75 --legal-comments=none --outfile=public/capa/capa3d.js`
- `build.mjs`: convierte la tipografía Source Sans 3 Black (`@fontsource/source-sans-3`, con `opentype.js`) a
  `fuente-3d.json` y arma la animación Lottie de prueba. Las rutas de arriba del archivo se ajustan a mano.
- `frames.js`: dibuja los cuadros del video transparente (confeti y estrella) con Playwright; después, con ffmpeg:
  `ffmpeg -framerate 30 -i f%03d.png -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 800k -crf 40 -auto-alt-ref 0 -an celebracion.webm`
