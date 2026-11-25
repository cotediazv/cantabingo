// Texto en 3D real (WebGL) para la capa gráfica: letras con volumen, bisel, luces y reflejos, sobre fondo transparente.
import { Scene, PerspectiveCamera, WebGLRenderer, MeshStandardMaterial, Mesh, DirectionalLight, PointLight, Group, PMREMGenerator, ACESFilmicToneMapping } from 'three';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

function create(canvas, fontData, opts) {
  opts = opts || {};
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const gl = renderer.getContext();
  let gpu = '';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) { gpu = ''; }

  const scene = new Scene();
  const pm = new PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new PerspectiveCamera(32, 16 / 9, 1, 5000);
  camera.position.set(0, 0, 1000);
  const key = new DirectionalLight(0xffffff, 2.2); key.position.set(-300, 400, 600); scene.add(key);
  const spot = new PointLight(0xffe9a8, 900000, 0, 2); scene.add(spot);

  const font = new Font(fontData);
  const group = new Group(); scene.add(group);
  let meshes = [];
  // Una pieza mínima (no se ve) que queda siempre en la escena: así el programa de dibujo se prepara una sola vez, con
  // «warm()» al abrir el GC, y el primer texto no se queda pegado mientras el computador lo prepara
  const keep = new Mesh(new TextGeometry('A', { font, size: 10, depth: 2 }), new MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.22 }));
  keep.scale.setScalar(0.0001); scene.add(keep);

  function setText(lines, colors) {
    meshes.forEach((m) => { group.remove(m); m.geometry.dispose(); m.material.forEach((x) => x.dispose()); });
    meshes = [];
    let y = 0; const made = [];
    lines.forEach((ln, i) => {
      const size = ln.size || 110;
      const geo = new TextGeometry(ln.text, { font, size, depth: ln.depth || size * 0.42, curveSegments: 6, bevelEnabled: true, bevelThickness: size * 0.05, bevelSize: size * 0.028, bevelSegments: 3 });
      geo.computeBoundingBox();
      const w = geo.boundingBox.max.x - geo.boundingBox.min.x, h = geo.boundingBox.max.y - geo.boundingBox.min.y;
      geo.translate(-geo.boundingBox.min.x - w / 2, -geo.boundingBox.min.y, -(ln.depth || size * 0.42) / 2);
      const c = (colors && colors[i]) || { front: 0xffc400, side: 0x1487cf };
      const mesh = new Mesh(geo, [
        new MeshStandardMaterial({ color: c.front, metalness: 0.85, roughness: 0.22 }),
        new MeshStandardMaterial({ color: c.side, metalness: 0.6, roughness: 0.35 }),
      ]);
      made.push({ mesh, w, h });
    });
    // se apilan de arriba hacia abajo y se centran
    const gap = 34; const total = made.reduce((a, m) => a + m.h, 0) + gap * (made.length - 1);
    y = total / 2;
    made.forEach((m) => { y -= m.h; m.mesh.position.y = y; y -= gap; group.add(m.mesh); meshes.push(m.mesh); });
    const maxW = Math.max.apply(null, made.map((m) => m.w));
    // la cámara se aleja lo justo para que el texto quepa con margen
    const fit = Math.max(maxW / (16 / 9), total) * 1.25;
    camera.position.z = Math.max(600, (fit / 2) / Math.tan((32 * Math.PI / 180) / 2) + 200);
  }

  let kNow = opts.scale || Math.min(window.devicePixelRatio || 1, 1.5); // a qué tamaño se dibuja (1 = el de la pantalla)
  function resize() {
    const w = canvas.clientWidth || 1280, h = canvas.clientHeight || 720;
    // con «scale» se dibuja más chico y el navegador lo estira: mucho más liviano para el computador de OBS
    const k = kNow;
    renderer.setPixelRatio(1);
    renderer.setSize(Math.round(w * k), Math.round(h * k), false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  let t0 = 0, raf = 0, running = false, dur = 0, shown = 0, slowT = 0, slowN = 0;
  // con «fps» se dibuja como máximo esa cantidad de cuadros por segundo (OBS transmite a 30: a 60 era el doble de trabajo)
  const gapMin = opts.fps ? 1000 / opts.fps - 4 : 0;
  function frame(now) {
    if (!running) return;
    if (!t0) t0 = now;
    if (gapMin && now - shown < gapMin && !(dur && (now - t0) / 1000 >= dur)) { raf = requestAnimationFrame(frame); return; }
    // Si el computador no alcanza a dibujar 22 cuadros por segundo, se dibuja más chico (el navegador lo estira): se ve
    // un poco menos nítido pero fluido. Queda así para los textos siguientes.
    const gap = now - shown;
    // (se cuentan los cuadros lentos de cada 12: un tirón aislado, como el del primer cuadro, no cuenta)
    if (shown && gap < 400) { slowN++; if (gap > 45) slowT++; } else { slowT = 0; slowN = 0; }
    if (slowN >= 12) { const many = slowT >= 8; slowT = 0; slowN = 0; if (many && kNow > 0.42) { kNow = Math.max(0.4, kNow * 0.75); resize(); } }
    shown = now;
    const t = (now - t0) / 1000;
    // con duración: al final gira hacia afuera, se achica y deja la pantalla limpia
    if (dur && t >= dur) { running = false; renderer.clear(); return; }
    const out = dur ? Math.pow(Math.max(0, (t - (dur - 0.9)) / 0.9), 3) : 0;
    // entrada: gira desde el costado y se asienta; después se mece suave
    const k = Math.min(1, t / 1.4), e = 1 - Math.pow(1 - k, 3);
    group.rotation.y = (1 - e) * -1.9 + Math.sin(t * 0.9) * 0.28 * e + out * 1.9;
    group.rotation.x = Math.sin(t * 0.7) * 0.10 * e + (1 - e) * 0.5;
    group.scale.setScalar(Math.max(0.001, (0.25 + 0.75 * e) * (1 - out)));
    spot.position.set(Math.cos(t * 1.6) * 700, 260 + Math.sin(t * 1.1) * 160, 520);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  return {
    gpu,
    setText,
    scale() { return kNow; },
    // prepara el dibujo (compila los programas de la tarjeta de video) sin mostrar nada
    warm() { try { resize(); renderer.compile(scene, camera); renderer.render(scene, camera); renderer.clear(); } catch (e) { /* se prepara al usarse */ } },
    start() { resize(); t0 = 0; dur = 0; shown = 0; running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
    // lo muestra «ms» milisegundos: entra girando, se mece y sale solo
    play(ms) { resize(); t0 = 0; dur = ms / 1000; shown = 0; running = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); try { renderer.clear(); } catch (e) { /* nada */ } },
    resize,
  };
}
window.Capa3D = { create };
