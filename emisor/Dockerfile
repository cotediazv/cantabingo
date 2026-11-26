# Emisor de la pantalla vertical (Cron Job de Render). Imagen oficial de Playwright con el mismo Chrome que se probó
# (Playwright 1.63.0). La captura necesita un navegador con ventana: emisor.js abre su propia pantalla virtual (Xvfb).
# No usar «xvfb-run» como comando: siendo el primer proceso del contenedor (así lo corre Render) se queda pegado.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
RUN command -v xvfb-run || (apt-get update && apt-get install -y --no-install-recommends xvfb && rm -rf /var/lib/apt/lists/*)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY emisor.js ./
CMD ["node", "emisor.js"]
