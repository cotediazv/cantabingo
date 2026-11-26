// Emisor de la pantalla vertical de Mercado Kennedy (pedido de Cote, 25 nov, por el Registro): un navegador sin pantalla
// abre la pantalla vertical real (la misma de la vista previa del GC Master), se captura a sí mismo y la envía en tiempo
// real por WebRTC (WHIP) al canal propio de Cloudflare. Solo envía mientras la pantalla vertical muestra un juego de la
// sala; el resto del tiempo el decodificador sigue con la cartelera (pv.html) y aquí no se gasta nada.
// Corre como «Cron Job» de Render (se cobra solo el tiempo que corre). Variables de entorno:
//   WHIP_URL   dirección de publicación del canal en Cloudflare (es secreta: solo en Render, nunca en el repositorio)
//   SITIO      por defecto https://cantabingo.onrender.com
//   PANTALLA   por defecto kennedy
//   RES        1080 (1080x1920) o 720 (720x1280); por defecto 1080
//   SIN_JUEGO  minutos sin juego para terminar (por defecto 10). Lo arranca solo el servidor de la Sala cuando empieza un
//              juego en el local (pedido de Cote, 25 nov: «que parta solo cuando empieza un juego, sin Trigger Run ni horario»);
//              como máximo corre 6 horas seguidas
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');

const SITIO = (process.env.SITIO || 'https://cantabingo.onrender.com').replace(/\/$/, '');
const PANTALLA = process.env.PANTALLA || 'kennedy';
const WHIP_URL = process.env.WHIP_URL || '';
const RES = Number(process.env.RES) === 720 ? 720 : 1080;
const W = RES, H = Math.round((RES * 16) / 9);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const inicio = Date.now();
const MAX_MS = 6 * 3600000;
const IDLE_MS = (Number(process.env.SIN_JUEGO) || 10) * 60000;
let ultimoJuego = Date.now(); // al partir se cuenta como si recién hubiera un juego (lo arrancó el servidor por eso)
// Avisa al servidor de la Sala que está corriendo (así no lo vuelve a arrancar, lo que lo reiniciaría)
const latido = () => fetch(`${SITIO}/api/emisor/latido`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pantalla: PANTALLA }) }).catch(() => {});

// Hay juego cuando la pantalla vertical muestra la sala de juegos (no la cartelera ni la información del local) y en la
// sala no está el karaoke ni el show (no son juegos: esos los sigue mostrando el decodificador)
const pedir = async (ruta) => { try { const r = await fetch(`${SITIO}${ruta}`, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };
const estado = async () => {
  // modo prueba (se enciende en el Centro de control de la Sala): transmite siempre, haya o no juego
  const e = await pedir('/api/emisor/estado');
  if (e && e.prueba) return { juego: true, que: 'modo prueba' };
  const v = await pedir(`/api/vertical/${PANTALLA}`);
  if (!v || v.show !== 'sala' || !v.activity) return { juego: false };
  const st = await pedir('/api/stage');
  return { juego: !!st && !['karaoke', 'show', 'none'].includes(st.show), que: st && st.show };
};

// Dentro de la página: captura la propia pestaña y la publica por WHIP. Devuelve cuando la conexión quedó arriba.
const publicar = async (page) => page.evaluate(async ({ whip, w, h }) => {
  const s = await navigator.mediaDevices.getDisplayMedia({ video: { width: w, height: h, frameRate: 30 }, audio: false, preferCurrentTab: true });
  const track = s.getVideoTracks()[0];
  track.contentHint = 'detail'; // texto y números nítidos: antes baja cuadros que resolución
  const pc = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
  const tx = pc.addTransceiver(track, { direction: 'sendonly', sendEncodings: [{ maxBitrate: w >= 1080 ? 4500000 : 2500000, maxFramerate: 30 }] });
  // H.264 primero: los decodificadores lo decodifican en el chip (Cloudflare acepta H.264, VP8 y VP9)
  try {
    const caps = RTCRtpSender.getCapabilities('video').codecs;
    const h264 = caps.filter((c) => /h264/i.test(c.mimeType) && /packetization-mode=1/.test(c.sdpFmtpLine || '') && /42e01f|42001f/.test(c.sdpFmtpLine || ''));
    if (h264.length) tx.setCodecPreferences([...h264, ...caps.filter((c) => !h264.includes(c))]);
  } catch (e) { /* sin preferencia */ }
  await pc.setLocalDescription(await pc.createOffer());
  await new Promise((r) => { if (pc.iceGatheringState === 'complete') return r(); const t = setTimeout(r, 3000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); r(); } }); });
  const res = await fetch(whip, { method: 'POST', headers: { 'content-type': 'application/sdp' }, body: pc.localDescription.sdp });
  if (!res.ok) throw new Error(`WHIP ${res.status}`);
  window.__whipDel = res.headers.get('location'); window.__whipUrl = whip;
  await pc.setRemoteDescription({ type: 'answer', sdp: await res.text() });
  window.__pc = pc;
  const st = track.getSettings(); window.__cap = `${st.width}x${st.height} (página ${innerWidth}x${innerHeight})`;
  await new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error('sin conexión')), 15000); pc.addEventListener('connectionstatechange', () => { if (pc.connectionState === 'connected') { clearTimeout(t); ok(); } if (pc.connectionState === 'failed') { clearTimeout(t); bad(new Error('falló')); } }); });
  return window.__cap;
}, { whip: WHIP_URL, w: W, h: H });

// Cuánta luz tiene lo que se está enviando (0 = negro, 255 = blanco): se mide un cuadro de la captura misma
const luzCaptura = (page) => page.evaluate(async () => {
  try {
    const tr = window.__pc && window.__pc.getSenders()[0] && window.__pc.getSenders()[0].track; if (!tr) return -1;
    const v = window.__probe || (window.__probe = document.createElement('video'));
    v.muted = true; v.srcObject = new MediaStream([tr]); await v.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
    const c = document.createElement('canvas'); c.width = 36; c.height = 64; const x = c.getContext('2d');
    x.drawImage(v, 0, 0, 36, 64); const d = x.getImageData(0, 0, 36, 64).data; let t = 0;
    for (let i = 0; i < d.length; i += 4) t += (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11);
    return Math.round(t / (d.length / 4));
  } catch (e) { return -2; }
}).catch(() => -3);
// Foto de la página para el Centro de control de la Sala (cada minuto mientras transmite)
let ultimaLuz = -1; let ultimoError = ''; let blancas = 0; let modoNav = 'normal';
const mandarFoto = async (page) => {
  try {
    const img = await page.screenshot({ type: 'jpeg', quality: 35, scale: 'css' });
    const luz = await luzCaptura(page);
    const cap = await page.evaluate(() => { const t = window.__pc && window.__pc.getSenders()[0].track.getSettings(); return t ? `${t.width}x${t.height} (página ${innerWidth}x${innerHeight})` : ''; }).catch(() => '');
    // Qué ve el navegador del emisor (26 nov: en Render la captura y la foto salían blancas, aquí no): la vista, el fondo,
    // cuánto texto tiene y el último error de la página
    const diag = await page.evaluate(() => { const b = document.body; return `${location.hash || location.pathname} · ${b ? (b.className || 'sin clase') : 'sin body'} · fondo ${b ? getComputedStyle(b).backgroundColor : '-'} · ${b ? b.innerText.replace(/\s+/g, ' ').trim().slice(0, 60) : ''}`; }).catch((e) => `sin respuesta de la página: ${e.message}`);
    ultimaLuz = luz;
    await fetch(`${SITIO}/api/emisor/foto`, { method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-luz': String(luz), 'x-cap': encodeURIComponent(`${cap} · navegador ${modoNav} · ${diag}${ultimoError ? ` · error: ${ultimoError}` : ''}`.slice(0, 300)) }, body: img });
    log('Foto enviada · luz de la captura:', luz, '·', cap, '·', diag);
  } catch (e) { log('No se pudo mandar la foto:', e.message); }
};
const vivo = (page) => page.evaluate(() => !!(window.__pc && ['connected', 'connecting'].includes(window.__pc.connectionState))).catch(() => false);
const cortar = (page) => page.evaluate(async () => {
  try { const loc = window.__whipDel; if (window.__pc) window.__pc.close(); if (loc) await fetch(new URL(loc, window.__whipUrl).href, { method: 'DELETE' }); } catch (e) { /* nada */ }
  window.__pc = null;
}).catch(() => {});

// Pantalla virtual propia (26 nov): «xvfb-run» se queda pegado cuando es el primer proceso del contenedor, que es como
// lo corre Render (en los registros solo salía «Cron job run started»). Por eso el emisor abre Xvfb él mismo.
let xvfb = null;
const pantallaVirtual = async () => {
  if (process.env.DISPLAY) return;
  const n = 99;
  xvfb = spawn('Xvfb', [`:${n}`, '-screen', '0', '1200x2200x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
  xvfb.on('error', (e) => log('No se pudo abrir la pantalla virtual:', e.message));
  for (let i = 0; i < 100 && !fs.existsSync(`/tmp/.X11-unix/X${n}`); i++) await sleep(100);
  process.env.DISPLAY = `:${n}`;
};
// Render detiene un turno con SIGTERM: se corta la emisión y se termina ordenado (siendo el primer proceso, sin esto no
// se detendría)
let parar = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { log('Detenido:', sig); parar = true; setTimeout(() => process.exit(0), 8000).unref(); });

(async () => {
  latido(); // de inmediato: así la Sala sabe que ya partió y no pide otro turno (pedirlo de nuevo cancela este)
  if (!WHIP_URL) { log('Falta WHIP_URL (la dirección de publicación del canal de Cloudflare).'); process.exit(1); }
  log(`Emisor de la pantalla ${PANTALLA}: ${W}x${H} a 30 cuadros; termina tras ${IDLE_MS / 60000} min sin juego`);
  await pantallaVirtual();
  log('Pantalla virtual lista:', process.env.DISPLAY);
  // sinGpu: si la página sale blanca aun después de volver a abrirla, el navegador se reinicia dibujando sin tarjeta
  // gráfica (26 nov: en Render la captura salía blanca; aquí con y sin tarjeta gráfica sale bien)
  const lanzar = (sinGpu) => chromium.launch({
    ignoreDefaultArgs: ['--enable-automation'], // sin el aviso «controlado por software», que le quita alto a la página
    headless: false, // la captura de la pestaña necesita un navegador con ventana: en Render corre dentro de una pantalla virtual (xvfb-run)
    executablePath: process.env.CHROMIUM || undefined,
    args: ['--auto-accept-this-tab-capture', `--window-size=${W},${H + 100}`, '--window-position=0,0', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--force-color-profile=srgb', '--hide-scrollbars',
      ...(sinGpu || process.env.SIN_GPU ? ['--disable-gpu', '--use-angle=swiftshader'] : [])],
  });
  let browser = await lanzar(false);
  let reaperturas = 0;
  let ctx = null, page = null, enviando = false;
  const abrir = async () => {
    if (ctx) await ctx.close().catch(() => {});
    ctx = await browser.newContext({ viewport: null }); // la página mide lo que mide la ventana (la captura toma lo que se ve)
    page = await ctx.newPage();
    page.on('pageerror', (e) => { ultimoError = String(e.message).slice(0, 80); log('error en la página:', e.message); });
    page.on('crash', () => { ultimoError = 'la página se cayó'; log('La página se cayó'); });
    page.on('console', (m) => { if (m.type() === 'error') log('consola:', m.text().slice(0, 160)); });
    page.on('requestfailed', (r) => log('no cargó:', r.url().slice(0, 100), r.failure() ? r.failure().errorText : ''));
    // La pantalla vertical tal cual (sin girar), en silencio: es lo que muestra la vista previa del GC Master
    await page.goto(`${SITIO}/?mudo=1&emisor=1#/vertical-in/${PANTALLA}`, { waitUntil: 'domcontentloaded' });
  };
  // La ventana tiene la barra del navegador: se agranda justo lo necesario para que la página mida exactamente W x H
  const ajustar = async () => {
    const cdp = await ctx.newCDPSession(page);
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    for (let i = 0; i < 4; i++) {
      const [iw, ih] = await page.evaluate(() => [innerWidth, innerHeight]);
      if (iw === W && ih === H) break;
      const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
      await cdp.send('Browser.setWindowBounds', { windowId, bounds: { left: 0, top: 0, width: bounds.width + W - iw, height: bounds.height + H - ih } });
      await sleep(500);
    }
    await cdp.detach().catch(() => {});
  };
  try {
    let tLat = 0; let tFoto = 0;
    while (!parar && Date.now() - inicio < MAX_MS && Date.now() - ultimoJuego < IDLE_MS) {
      if (Date.now() - tLat > 30000) { tLat = Date.now(); latido(); }
      if (enviando && page && Date.now() - tFoto > 60000) {
        tFoto = Date.now(); await mandarFoto(page);
        // Captura toda blanca dos veces seguidas: la página no se está dibujando; se vuelve a abrir (26 nov)
        blancas = ultimaLuz >= 250 ? blancas + 1 : 0;
        if (blancas >= 2) {
          blancas = 0; reaperturas++; await cortar(page); enviando = false; tFoto = Date.now() - 45000;
          if (reaperturas === 1) log('La captura sale blanca: se vuelve a abrir la página');
          else {
            log('Sigue blanca: se reinicia el navegador sin tarjeta gráfica');
            if (ctx) await ctx.close().catch(() => {}); ctx = null; page = null;
            await browser.close().catch(() => {}); browser = await lanzar(true); modoNav = 'sin tarjeta gráfica';
          }
        }
      }
      const st = await estado();
      const juego = st.juego;
      if (juego) ultimoJuego = Date.now();
      if (juego && !enviando) {
        try {
          await abrir(); await sleep(4000); await ajustar(); // que cargue con el juego a la vista
          await publicar(page); enviando = true;
          // al empezar la captura Chrome agrega la barra «Compartiendo esta pestaña»: se vuelve a ajustar la ventana
          await sleep(1000); await ajustar(); await sleep(1500);
          log('En vivo:', st.que, '· captura', await page.evaluate(() => { const t = window.__pc.getSenders()[0].track.getSettings(); return `${t.width}x${t.height} (página ${innerWidth}x${innerHeight})`; }));
        } catch (e) { log('No se pudo partir:', e.message); await sleep(10000); }
      } else if (!juego && enviando) {
        await cortar(page); enviando = false; log('Sin juego: se corta la emisión'); if (ctx) { await ctx.close().catch(() => {}); ctx = null; page = null; }
      } else if (enviando && !(await vivo(page))) {
        log('Se cayó la conexión: se vuelve a partir'); await cortar(page); enviando = false;
      }
      await sleep(3000);
    }
  } finally {
    if (enviando && page) await cortar(page);
    await browser.close().catch(() => {});
    if (xvfb) xvfb.kill();
    log('Fin del turno del emisor');
    process.exit(0);
  }
})().catch((e) => { log(e); process.exit(1); });
