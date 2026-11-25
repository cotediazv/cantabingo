# Emisor de la pantalla vertical (Cron Job de Render). Imagen oficial de Playwright con el mismo Chrome que se probó
# (Playwright 1.63.0). La captura necesita un navegador con ventana: corre dentro de una pantalla virtual (xvfb-run).
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
RUN command -v xvfb-run || (apt-get update && apt-get install -y --no-install-recommends xvfb && rm -rf /var/lib/apt/lists/*)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY emisor.js ./
CMD ["xvfb-run", "-a", "-s", "-screen 0 1200x2200x24", "node", "emisor.js"]
