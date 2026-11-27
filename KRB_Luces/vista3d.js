/* =====================================================================
   LUCES KRB - Vista previa 3D realista (three.js, funciona sin internet)
   Usa la misma geometria y la misma punteria que el resto de la suite
   (definidas en ipad.html): deSalon, mesasSalon, colsSalon, posCabeza,
   direccion, choque, colorGrupo... asi el mapa, la 3D y el DMX coinciden.
   Si este archivo o WebGL fallan, la pagina sigue con la vista simple.
   ===================================================================== */
import * as THREE from './lib/three.module.min.js';

let renderer, scene, camera, construido = false;
const focos = [];            // un foco por equipo: { g, tipo, pos, spot, haz, lente, cuerpo }
let anilloMarca, animadorObj, artistaObj, roskoObj, techoObj, desafioObj;
const PANT = { tv:null, vert:[], h42:[] };   // pantallas del escenario (para mostrar las de la Sala en el demo)

/* ---------- utilidades ---------- */
function azar(semilla){ let s = semilla >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function textura(w, h, dibujar, rep){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  dibujar(c.getContext('2d'), w, h, azar(w * 7 + h));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
function grano(ctx, w, h, fuerza, r){
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4){ const n = (r() - 0.5) * fuerza; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
}
const v3 = a => new THREE.Vector3(a[0], a[1], a[2]);

/* ---------- texturas (dibujadas, no se descargan) ---------- */
function texMadera(base, oscura){
  return textura(256, 256, (c, w, h, r) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    const tablas = 6;
    for (let i = 0; i < tablas; i++){
      const y = i * h / tablas, tono = (r() - 0.5) * 30;
      c.fillStyle = `rgba(${tono > 0 ? 255 : 0},${tono > 0 ? 220 : 0},${tono > 0 ? 160 : 0},${Math.abs(tono) / 255})`;
      c.fillRect(0, y, w, h / tablas);
      for (let k = 0; k < 14; k++){                                  // vetas
        c.strokeStyle = `rgba(0,0,0,${0.08 + r() * 0.12})`; c.lineWidth = 1;
        c.beginPath(); const yy = y + r() * h / tablas; c.moveTo(0, yy);
        for (let x = 0; x <= w; x += 16) c.lineTo(x, yy + Math.sin(x / 30 + k) * 2);
        c.stroke();
      }
      c.fillStyle = oscura; c.fillRect(0, y, w, 2);                   // junta entre tablas
    }
    grano(c, w, h, 18, r);
  });
}
const texPiedra = () => textura(256, 256, (c, w, h, r) => {
  c.fillStyle = '#3b3e44'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64){
    const t = 50 + r() * 22; c.fillStyle = `rgb(${t},${t + 2},${t + 6})`; c.fillRect(x + 2, y + 2, 60, 28);
  }
  grano(c, w, h, 34, r);
}, [1, 3]);
const texListones = () => textura(128, 128, (c, w, h, r) => {
  c.fillStyle = '#1f3f6c'; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16){ c.fillStyle = '#3468ad'; c.fillRect(x + 2, 0, 11, h); c.fillStyle = '#4a7cc0'; c.fillRect(x + 2, 0, 2, h); }
  grano(c, w, h, 10, r);
}, [2, 6]);
const texParedFondo = () => textura(1024, 512, (c, w, h, r) => {
  c.fillStyle = '#17191e'; c.fillRect(0, 0, w, h);
  c.strokeStyle = '#2f6f78'; c.lineWidth = 5;                          // dibujo de X turquesa
  [-0.33, 0, 0.33].forEach(cx => {
    const X = (cx + 0.5) * w;
    [[-160, 330, 160, 0], [160, 330, -160, 0], [-160, 410, 160, 80], [160, 410, -160, 80]].forEach(([x0, y0, x1, y1]) => {
      c.beginPath(); c.moveTo(X + x0, y0 + 60); c.lineTo(X + x1, y1 + 60); c.stroke();
    });
  });
  c.lineWidth = 3; [0.32, 0.335, 0.665, 0.68].forEach(f => { c.beginPath(); c.moveTo(f * w, 40); c.lineTo(f * w, h); c.stroke(); });
  grano(c, w, h, 12, r);
});
const texAzulejos = () => textura(256, 256, (c, w, h, r) => {
  c.fillStyle = '#5b6168'; c.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32){
    const t = 88 + r() * 14; c.fillStyle = `rgb(${t},${t + 6},${t + 12})`; c.fillRect(x + 1, y + 1, 30, 30);
    c.strokeStyle = 'rgba(30,35,45,.55)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x + 16, y + 16, 7 + r() * 4, 0, Math.PI * 1.4); c.stroke(); // dibujo de mariscos
  }
}, [4, 2]);
const texPiso = () => textura(512, 512, (c, w, h, r) => {
  c.fillStyle = '#2a2b30'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 2;
  for (let i = 0; i <= w; i += 128){ c.beginPath(); c.moveTo(i, 0); c.lineTo(i, h); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(w, i); c.stroke(); }
  grano(c, w, h, 16, r);
}, [12, 40]);
function texLetrero(lineas, color){
  const t = textura(256, 160, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.font = 'bold 62px system-ui, sans-serif'; c.textAlign = 'center';
    c.shadowColor = color; c.shadowBlur = 22; c.fillStyle = '#e8feff';
    lineas.forEach((l, i) => c.fillText(l, w / 2, 66 + i * 64));
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}

/* ---------- lo que muestran las pantallas: imagenes de muestra de la Sala de juegos ----------
   Solo es decoracion de la vista previa (dibujada aqui); no se conecta ni toca el sistema de Code 1. */
function pantalla(w, h, dibujar){
  const t = textura(w, h, dibujar); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function qrMuestra(c, x, y, tam, r){                         // dibujo con aspecto de QR (no es un codigo real)
  const n = 21, m = tam / n;
  c.fillStyle = '#fff'; c.fillRect(x - m, y - m, tam + 2 * m, tam + 2 * m); c.fillStyle = '#111';
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (r() < 0.48) c.fillRect(x + i * m, y + j * m, m, m);
  [[0, 0], [n - 7, 0], [0, n - 7]].forEach(([a, b]) => {
    c.fillStyle = '#111'; c.fillRect(x + a * m, y + b * m, 7 * m, 7 * m); c.fillStyle = '#fff'; c.fillRect(x + (a + 1) * m, y + (b + 1) * m, 5 * m, 5 * m);
    c.fillStyle = '#111'; c.fillRect(x + (a + 2) * m, y + (b + 2) * m, 3 * m, 3 * m);
  });
}
const texBingo = () => pantalla(1024, 560, (c, w, h, r) => {
  const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#13204a'); g.addColorStop(1, '#3a0f4a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f5c542'; c.font = 'bold 44px system-ui'; c.fillText('SALA DE JUEGOS · KRB', 40, 70);
  c.fillStyle = '#fff'; c.font = 'bold 120px system-ui'; c.fillText('BINGO', 40, 200);
  for (let i = 0; i < 75; i++){                               // tablero de numeros, algunos ya cantados
    const x = 46 + (i % 15) * 42, y = 250 + Math.floor(i / 15) * 52, sale = r() < 0.3;
    c.fillStyle = sale ? '#f5c542' : 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(x, y, 18, 0, Math.PI * 2); c.fill();
    c.fillStyle = sale ? '#1a1030' : 'rgba(255,255,255,.6)'; c.font = 'bold 16px system-ui'; c.textAlign = 'center'; c.fillText(i + 1, x, y + 6); c.textAlign = 'left';
  }
  qrMuestra(c, 740, 170, 230, r);
  c.fillStyle = '#fff'; c.font = 'bold 22px system-ui'; c.textAlign = 'center';
  c.fillText('Escanea el código QR', 855, 450); c.fillText('con tu celular', 855, 480); c.textAlign = 'left';
});
const texRosko = () => pantalla(256, 512, (c, w, h) => {
  c.fillStyle = '#0d1a3a'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#fff'; c.font = 'bold 34px system-ui'; c.textAlign = 'center'; c.fillText('EL ROSKO', w / 2, 60);
  const letras = 'ABCDEFGHIJLMNÑOPQRSTUVXYZ';
  [...letras].forEach((l, i) => {
    const a = i / letras.length * Math.PI * 2 - Math.PI / 2, x = w / 2 + Math.cos(a) * 95, y = 250 + Math.sin(a) * 95;
    c.fillStyle = i < 9 ? '#3ecf8e' : (i === 9 ? '#ff5c5c' : '#2b55ff'); c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 14px system-ui'; c.fillText(l, x, y + 5);
  });
  c.font = 'bold 22px system-ui'; c.fillStyle = '#f5c542'; c.fillText('¡Juega en la sala!', w / 2, 420);
  c.font = '16px system-ui'; c.fillStyle = '#cfd8e8'; c.fillText('Escanea el código QR', w / 2, 455); c.fillText('con tu celular', w / 2, 477);
});
const texKaraoke = () => pantalla(512, 288, (c, w, h) => {
  c.fillStyle = '#1b1238'; c.fillRect(0, 0, w, h);
  c.fillStyle = '#f5c542'; c.font = 'bold 30px system-ui'; c.textAlign = 'center'; c.fillText('KARAOKE', w / 2, 60);
  c.fillStyle = '#fff'; c.font = 'bold 26px system-ui'; c.fillText('Ahora canta', w / 2, 125);
  c.font = 'bold 36px system-ui'; c.fillStyle = '#7fdcff'; c.fillText('¡Pide tu canción!', w / 2, 180);
  c.font = '20px system-ui'; c.fillStyle = '#cfd8e8'; c.fillText('Desde el celular', w / 2, 230);
});

/* ---------- haz de luz con humo (cono aditivo) ---------- */
const geoHaz = new THREE.ConeGeometry(1, 1, 40, 1, true).translate(0, -0.5, 0); // punta en 0, base en y = -1
function materialHaz(){
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uI: { value: 0 } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float borde = pow(abs(dot(normalize(vN), normalize(-vV))), 1.6);
        float caida = pow(1.0 - vT, 1.4) * 0.8 + 0.2 * (1.0 - vT);
        float a = uI * borde * caida; gl_FragColor = vec4(uColor * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
}

/* ---------- construccion de la escena (una vez, cuando ya esta la configuracion) ---------- */
function construir(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0e12);
  scene.fog = new THREE.FogExp2(0x0c0e12, 0.0045);
  // luz de ambiente del local (tenue, calida) para que se vea el lugar aunque las luces de show esten apagadas
  scene.add(new THREE.HemisphereLight(0x6a7590, 0x2a2016, 1.7));
  const amb = new THREE.DirectionalLight(0xffd9a8, 0.6); amb.position.set(-10, 20, 25); scene.add(amb);
  const amb2 = new THREE.DirectionalLight(0xb8c4ff, 0.25); amb2.position.set(15, 12, -10); scene.add(amb2);
  const gs = giroSalon(), L = SALON.largo;

  const mat = {
    piso: new THREE.MeshStandardMaterial({ map: texPiso(), roughness: 0.85 }),
    pasillo: new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.9 }),
    fondo: new THREE.MeshStandardMaterial({ map: texParedFondo(), roughness: 0.9 }),
    madera: new THREE.MeshStandardMaterial({ map: texMadera('#7a5530', '#3a2412'), roughness: 0.7 }),
    tarima: new THREE.MeshStandardMaterial({ map: texMadera('#3a2a1c', '#140c06'), roughness: 0.6 }),
    mesa: new THREE.MeshStandardMaterial({ map: texMadera('#8a6640', '#4a3018'), roughness: 0.55 }),
    piedra: new THREE.MeshStandardMaterial({ map: texPiedra(), roughness: 0.95 }),
    listones: new THREE.MeshStandardMaterial({ map: texListones(), roughness: 0.6 }),
    azul: new THREE.MeshStandardMaterial({ color: 0x3a6fb5, roughness: 0.4, metalness: 0.4 }),
    azulejos: new THREE.MeshStandardMaterial({ map: texAzulejos(), roughness: 0.35 }),
    muro: new THREE.MeshStandardMaterial({ color: 0x3e4048, roughness: 0.9 }),
    negro: new THREE.MeshStandardMaterial({ color: 0x0e0f12, roughness: 0.5 }),
    gris: new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.6, metalness: 0.3 }),
    amarillo: new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.55 }),
    patas: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, metalness: 0.6 }),
    sillon: new THREE.MeshStandardMaterial({ color: 0x5b3a32, roughness: 0.95 }),
    macetero: new THREE.MeshStandardMaterial({ color: 0x3a3430, roughness: 0.9 }),
    planta: new THREE.MeshStandardMaterial({ color: 0x2f5d34, roughness: 0.8 }),
    cuerda: new THREE.LineBasicMaterial({ color: 0xb8a27a }),
    lampara: new THREE.MeshStandardMaterial({ map: texMadera('#b08a52', '#6a4a22'), roughness: 0.7, emissive: 0x5a3a10, emissiveIntensity: 0.35,
      transparent: true, opacity: 0.4, depthWrite: false }),            // lamparas colgantes algo transparentes (Cote)
    piel: new THREE.MeshStandardMaterial({ color: 0xc68e6a, roughness: 0.7 }),
    ropa: new THREE.MeshStandardMaterial({ color: 0x8a1c1c, roughness: 0.8 }),
    ropaPublico: new THREE.MeshStandardMaterial({ color: 0x4a5060, roughness: 0.85 }),
    vela: new THREE.MeshBasicMaterial({ color: 0xffb25a })
  };
  const sombra = m => { m.castShadow = true; m.receiveShadow = true; return m; };
  const caja = (w, h, d, m, x, y, z, ry) => { const o = sombra(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)); o.position.set(x, y, z); if (ry) o.rotation.y = ry; scene.add(o); return o; };
  const enSalon = (o, u, v, y) => { const p = deSalon(u, v, y); o.position.set(p[0], p[1], p[2]); o.rotation.y = gs; return o; };

  // --- piso del salon y pasillo del mall (alineados al salon) ---
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(SALON.cocinas + 0.6 - SALON.pasillo + 6, L + 12), mat.piso);
  piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true;
  const gp = new THREE.Group(); gp.add(piso); enSalon(gp, (SALON.cocinas + 0.6 + SALON.pasillo - 6) / 2, (L - 12) / 2 + 3, 0); scene.add(gp);
  // techo oscuro (7 m): ahi se ve la luz que pintan las cabezas y las mini hacia arriba (Standby del DJ, Cote 25 nov).
  // Se oculta cuando la camara esta por encima (vista del salon desde arriba).
  const techo = new THREE.Mesh(new THREE.PlaneGeometry(SALON.cocinas + 0.6 - SALON.pasillo + 6, L + 12), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95 }));
  techo.rotation.x = Math.PI / 2;
  const gt = new THREE.Group(); gt.add(techo); enSalon(gt, (SALON.cocinas + 0.6 + SALON.pasillo - 6) / 2, (L - 12) / 2 + 3, 7); scene.add(gt); techoObj = gt;

  // --- escenario ---
  const forma = new THREE.Shape(TARIMA.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geoT = new THREE.ExtrudeGeometry(forma, { depth: 0.45, bevelEnabled: false }); geoT.rotateX(-Math.PI / 2);
  scene.add(sombra(new THREE.Mesh(geoT, [mat.tarima, mat.madera])));
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.6), mat.fondo); fondo.position.set(0, 2.3, -4); fondo.receiveShadow = true; scene.add(fondo);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.25), new THREE.MeshBasicMaterial({ map: texBingo(), color: 0xc8c8c8 }));   // muestra: Bingo
  tv.position.set(0, 1.97, -3.93); scene.add(tv); PANT.tv = tv;
  // bateria electronica armada, delante de la pantalla (Cote, 24 nov)
  {
    const bat = new THREE.Group(), cromo = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 });
    const pad = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.9 }), platillo = new THREE.MeshStandardMaterial({ color: 0x26282d, metalness: 0.6, roughness: 0.4 });
    const tubo = (a, b) => { const d = v3(b).sub(v3(a)), m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, d.length(), 8), cromo);
      m.position.copy(v3(a).add(d.clone().multiplyScalar(0.5))); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); bat.add(m); };
    tubo([-0.7, 0, 0], [-0.7, 1.0, 0]); tubo([0.7, 0, 0], [0.7, 1.0, 0]); tubo([-0.7, 0.85, 0], [0.7, 0.85, 0]);   // rack
    const tambor = (x, y, z, r, inc) => { const t = sombra(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.07, 24), pad)); t.position.set(x, y, z); t.rotation.x = inc; bat.add(t); };
    tambor(-0.3, 0.92, 0.18, 0.16, 0.35); tambor(0.3, 0.92, 0.18, 0.16, 0.35);   // toms
    tambor(-0.45, 0.62, 0.45, 0.17, 0.2);                                       // caja
    tambor(0.55, 0.55, 0.4, 0.2, 0.25);                                         // tom de piso
    const bombo = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.22), pad)); bombo.position.set(0, 0.19, 0.1); bat.add(bombo);
    [[-0.75, 1.25, 0.05, 0.22], [0.8, 1.3, 0.0, 0.24], [-0.85, 0.95, 0.45, 0.17]].forEach(([x, y, z, r]) => {  // platillos y hi-hat
      const p = sombra(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.015, 28), platillo)); p.position.set(x, y, z); p.rotation.x = 0.15; bat.add(p); tubo([x, 0, z], [x, y, z]);
    });
    const modulo = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x1a3a6a, emissiveIntensity: 0.8 })); modulo.position.set(0.72, 1.0, 0.08); bat.add(modulo);
    const banqueta = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 20), pad)); banqueta.position.set(0, 0.5, 0.75); bat.add(banqueta); tubo([0, 0, 0.75], [0, 0.46, 0.75]);
    bat.position.set(0, 0.45, -3.25); scene.add(bat);
    // alfombra bajo la bateria: unos 1,5 m de profundidad
    const alf = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.5), new THREE.MeshStandardMaterial({ map: textura(128, 96, (c, w, h, r) => {
      c.fillStyle = '#3c3a3e'; c.fillRect(0, 0, w, h); c.strokeStyle = '#55525a'; c.lineWidth = 3; c.strokeRect(6, 6, w - 12, h - 12); grano(c, w, h, 22, r);
    }), roughness: 1 }));
    alf.rotation.x = -Math.PI / 2; alf.position.set(0, 0.452, -2.95); alf.receiveShadow = true; scene.add(alf);
  }
  caja(0.9, 1.3, 0.6, mat.gris, ESC_X - 0.55, 1.1, -2.05);                                    // case: al borde, detras de la columna azul derecha
  caja(0.7, 0.75, 0.5, mat.negro, -2.25, 0.82, -3.15);                               // parlante
  // columnas azules del escenario con su pantalla vertical (y la TV en la derecha)
  // columnas azules del escenario: SIEMPRE visibles (Cote). Las casi invisibles son solo los pilares del salon.
  [-COL_X, COL_X].forEach(x => {
    caja(1.0, 4.3, 1.2, mat.listones, x, 2.15, 0);
    const pant = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshBasicMaterial({ map: texRosko(), color: 0xc8c8c8 }));   // muestra: El Rosko
    pant.position.set(x, 3.0, 0.61); scene.add(pant); PANT.vert.push(pant);
    // debajo, en las DOS columnas: pantalla de 42" (unos 93 x 52 cm), del ancho del pilar
    const marco = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.56, 0.05), mat.negro); marco.position.set(x, 1.95, 0.625); scene.add(marco);
    const t2 = new THREE.Mesh(new THREE.PlaneGeometry(0.93, 0.52), new THREE.MeshBasicMaterial({ map: texKaraoke(), color: 0xc8c8c8 }));  // muestra: Karaoke
    t2.position.set(x, 1.95, 0.652); scene.add(t2); PANT.h42.push(t2);
  });
  // marco azul, red de cuerdas y lamparas hexagonales
  const barra = (a, b) => { const d = v3(b).sub(v3(a)), m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, d.length(), 10), mat.azul);
    m.position.copy(v3(a).add(d.clone().multiplyScalar(0.5))); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); scene.add(m); };
  barra([-COL_X, 4.5, 0.3], [COL_X, 4.5, 0.3]); barra([-COL_X, 4.5, 0.3], [-COL_X, 4.5, -3.6]); barra([COL_X, 4.5, 0.3], [COL_X, 4.5, -3.6]); barra([-COL_X, 4.5, -2.6], [COL_X, 4.5, -2.6]);
  const pts = [];
  for (let x = -(COL_X - 0.4); x <= COL_X - 0.4; x += 0.42){
    const largo = 1.0 + 0.5 * Math.abs(Math.sin(x * 1.7));
    pts.push(x, 4.5, 0.3, x + 0.15, 4.5 - largo, -0.6);
    pts.push(x, 4.5, 0.3, x, 4.35, -2.6);
  }
  for (let z = 0; z >= -2.4; z -= 0.6) pts.push(-COL_X, 4.42, z, COL_X, 4.42, z);
  const gc = new THREE.BufferGeometry(); gc.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); scene.add(new THREE.LineSegments(gc, mat.cuerda));
  [[-1.5, 3.6], [0, 3.45], [1.5, 3.6]].forEach(([x, y]) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.45, 6), mat.lampara); h.rotation.x = Math.PI / 2; h.position.set(x, y, -1.1); scene.add(h); });
  [[-2.5, 5], [1.5, 6.5], [-1, 9.5], [3, 11], [-3.5, 13], [1, 15.5]].forEach(([u, v]) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.35, 6), mat.lampara); enSalon(h, u, v, 4.3); scene.add(h); });

  // --- costados: cocinas (azulejos al principio, ventanas) y locales del mall ---
  const uc = SALON.cocinas + 0.6;
  const muro = new THREE.Mesh(new THREE.PlaneGeometry(L, 3.4), mat.muro); const gm = new THREE.Group(); muro.rotation.y = -Math.PI / 2; muro.receiveShadow = true; gm.add(muro); enSalon(gm, uc, L / 2, 1.7); scene.add(gm);
  const az = new THREE.Mesh(new THREE.PlaneGeometry(7, 2.9), mat.azulejos); const ga = new THREE.Group(); az.rotation.y = -Math.PI / 2; ga.add(az); enSalon(ga, uc - 0.02, 4.5, 1.75); scene.add(ga);
  const neon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), new THREE.MeshBasicMaterial({ color: 0x6fa8ff })); enSalon(neon, uc - 0.08, 4.5, 2.3); scene.add(neon);
  for (let v = 9; v < L - 1; v += 4.5){ const w = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x2a251c, emissive: 0x6e5a36, emissiveIntensity: 0.45 })); const g = new THREE.Group(); w.rotation.y = -Math.PI / 2; g.add(w); enSalon(g, uc - 0.02, v + 1.8, 1.7); scene.add(g); }
  ['#6d685e', '#7a5f38', '#64666a', '#5c6470', '#73653f'].forEach(() => {});
  for (let i = 0, v = 1; v < L - 4; v += 5.5, i++){
    const col = [0x6d685e, 0x7a5f38, 0x64666a, 0x5c6470, 0x73653f][i % 5];
    const l = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 0.55 }));
    const g = new THREE.Group(); l.rotation.y = Math.PI / 2; g.add(l); enSalon(g, SALON.pasillo - 4, v + 2.1, 1.5); scene.add(g);
  }
  const acceso = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), new THREE.MeshStandardMaterial({ color: 0x14181e })); acceso.position.set(-7.3, 1.3, -1.2); scene.add(acceso);

  // --- pilares de piedra (alineados al salon), letrero EAT FISH ---
  // pilares del salon casi invisibles (Cote: para ver bien donde esta parada la persona y seguirla)
  const piedraTransp = mat.piedra.clone(); piedraTransp.transparent = true; piedraTransp.opacity = 0.08; piedraTransp.depthWrite = false;
  const bordePilar = new THREE.LineBasicMaterial({ color: 0x8a8f98, transparent: true, opacity: 0.35 });
  colsSalon().forEach(([u, v], n) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.5, 1.2), piedraTransp); enSalon(p, u, v, 2.75); scene.add(p);
    const borde = new THREE.LineSegments(new THREE.EdgesGeometry(p.geometry), bordePilar); enSalon(borde, u, v, 2.75); scene.add(borde);   // solo el contorno
    if (n === 0){
      const l = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), new THREE.MeshBasicMaterial({ map: texLetrero(['EAT', 'FISH'], '#7ff6ff'), transparent: true }));
      const g = new THREE.Group(); l.rotation.y = Math.PI / 2; l.position.x = 0.62; g.add(l); enSalon(g, u, v, 3.2); scene.add(g);
    }
  });

  // --- mobiliario con instancias (rapido aunque sean cientos) ---
  const inst = (geo, m, lista) => {
    const im = new THREE.InstancedMesh(geo, m, Math.max(1, lista.length)); im.count = lista.length;
    const o = new THREE.Object3D();
    lista.forEach(([u, v, y], i) => { const p = deSalon(u, v, y); o.position.set(p[0], p[1], p[2]); o.rotation.set(0, gs, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); });
    im.castShadow = true; im.receiveShadow = true; scene.add(im); return im;
  };
  const { mesas, sillones } = mesasSalon();
  inst(new THREE.BoxGeometry(0.8, 0.05, 0.8), mat.mesa, mesas.map(m => [m.u, m.v, 0.745]));
  inst(new THREE.BoxGeometry(0.08, 0.72, 0.08), mat.patas, mesas.map(m => [m.u, m.v, 0.36]));
  const asientos = [], respaldos = [];
  mesas.forEach(m => m.sillas.forEach(s => { asientos.push([m.u + s * 0.62, m.v, 0.445]); respaldos.push([m.u + s * 0.82, m.v, 0.68]); }));
  inst(new THREE.BoxGeometry(0.4, 0.05, 0.4), mat.amarillo, asientos);
  inst(new THREE.BoxGeometry(0.04, 0.45, 0.4), mat.amarillo, respaldos);
  inst(new THREE.BoxGeometry(0.06, 0.42, 0.06), mat.amarillo, asientos.map(([u, v]) => [u, v, 0.21]));
  inst(new THREE.BoxGeometry(0.6, 0.42, 2.2), mat.sillon, sillones.map(v => [FILAS.sillon - 0.7, v, 0.21]));
  inst(new THREE.BoxGeometry(0.14, 0.55, 2.2), mat.sillon, sillones.map(v => [FILAS.sillon - 0.95, v, 0.69]));
  const velas = inst(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), mat.vela, mesas.map(m => [m.u, m.v, 0.81])); velas.castShadow = false;
  const macetas = [], plantas = [];
  tramosMaceteros().forEach(([a, b]) => { for (let v = a + 0.3; v <= b; v += 0.6){ macetas.push([U_MACETEROS, v, 0.3]); plantas.push([U_MACETEROS, v, 0.78]); } });
  inst(new THREE.BoxGeometry(0.56, 0.6, 0.6), mat.macetero, macetas);
  inst(new THREE.DodecahedronGeometry(0.33, 0), mat.planta, plantas);

  // --- personas: artista en el escenario y publico sentado (para ver como los ilumina la luz) ---
  const art = new THREE.Group();
  const cuerpo = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.85, 6, 12), mat.ropa)); cuerpo.position.y = 0.45 + 0.62; art.add(cuerpo);
  const cab = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat.piel)); cab.position.y = 0.45 + 1.33; art.add(cab);
  art.position.set(0.3, 0, -1.6); scene.add(art); artistaObj = art;
  const rnd = azar(42), sentados = [];
  mesas.filter(m => m.v < 28).forEach(m => m.sillas.forEach(s => { if (rnd() < 0.45) sentados.push([m.u + s * 0.6, m.v]); }));
  inst(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), mat.ropaPublico, sentados.map(([u, v]) => [u, v, 0.85]));
  inst(new THREE.SphereGeometry(0.11, 12, 10), mat.piel, sentados.map(([u, v]) => [u, v, 1.3]));

  // --- los equipos de luz: un foco real + un haz con humo + el lente encendido ---
  conf.grupos.forEach(g => {
    const def = POS3D[g.id] || {};
    const posiciones = g.vista3d || (def.columna != null ? [posCabeza(g.id)] : (def.pos || []));
    posiciones.forEach(pos => {
      const tipo = def.columna != null || g.id === 'mini' || g.igual_que === 'mini' ? 'cabeza' : g.id;
      const spot = new THREE.SpotLight(0xffffff, 0, 0, 0.3, 0.5, 2);
      spot.position.copy(v3(pos)); scene.add(spot); scene.add(spot.target);
      if (tipo === 'cabeza' && def.columna != null || g.id === 'frontales'){
        spot.castShadow = true; spot.shadow.mapSize.set(512, 512); spot.shadow.bias = -0.0006; spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 80;
      }
      const haz = new THREE.Mesh(geoHaz, materialHaz()); haz.frustumCulled = false; scene.add(haz);
      const cuerpoF = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), mat.gris); cuerpoF.position.copy(v3(pos)); scene.add(cuerpoF);
      const lente = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color: 0x222222 })); lente.position.copy(v3(pos)); scene.add(lente);
      focos.push({ g, def, tipo, pos, spot, haz, lente });
    });
  });

  // animador virtual (para practicar el seguimiento): chaqueta amarilla, aparece solo cuando se activa en Seguir
  animadorObj = new THREE.Group();
  const chaqueta = new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.6 });
  const tronco = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 6, 12), chaqueta)); tronco.position.y = 1.1; animadorObj.add(tronco);
  const cabeza = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat.piel)); cabeza.position.y = 1.62; animadorObj.add(cabeza);
  const pierna = (x) => { const p = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.6, 4, 8), mat.negro)); p.position.set(x, 0.42, 0); animadorObj.add(p); return p; };
  animadorObj.userData.piernas = [pierna(-0.1), pierna(0.1)];
  const micro = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8), mat.negro); micro.position.set(0.18, 1.45, 0.15); micro.rotation.x = 0.6; animadorObj.add(micro);
  animadorObj.visible = false; scene.add(animadorObj);

  // --- El Rosko en el escenario (Cote, 24 nov): concursante al centro mirando adelante, atril de microfono,
  //     pantalla de 20" en un atril con sus preguntas y piso alto del animador al costado derecho (mirando desde el frente) ---
  roskoObj = new THREE.Group();
  const conc = new THREE.Group();
  const ropaC = new THREE.MeshStandardMaterial({ color: 0x17305a, roughness: 0.9 });
  const cC = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.85, 6, 12), ropaC)); cC.position.y = 0.62; conc.add(cC);
  const hC = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat.piel)); hC.position.y = 1.33; conc.add(hC);
  conc.position.set(0, 0.45, -1.2); roskoObj.add(conc);
  const palo = (x, z, alto, r) => { const m = sombra(new THREE.Mesh(new THREE.CylinderGeometry(r || 0.015, r || 0.015, alto, 10), mat.negro)); m.position.set(x, 0.45 + alto / 2, z); roskoObj.add(m); return m; };
  // atril del microfono: recto y vertical (Cote, rev 196), delante del concursante, con el microfono arriba apuntando a la boca
  palo(0, -0.9, 1.17);
  const tramo = (a, b, r) => { const d = v3(b).sub(v3(a)), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), mat.negro);
    m.position.copy(v3(a).add(d.clone().multiplyScalar(0.5))); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); roskoObj.add(m); };
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 20), mat.negro); base.position.set(0, 0.46, -0.9); roskoObj.add(base);
  tramo([0, 0.45 + 1.17, -0.9], [0, 0.45 + 1.27, -0.98], 0.021);                          // microfono
  palo(0.55, -0.85, 1.0);                                                                  // atril de la pantalla de 20"
  const p20 = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.28, 0.03), mat.negro);
  // la pantalla de 20" va derecha en su atril recto (Cote, rev 204), mirando al concursante
  p20.position.set(0.55, 0.45 + 1.14, -0.85); p20.rotation.y = Math.atan2(-0.55, -0.35); roskoObj.add(p20);
  const luzP = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.24), new THREE.MeshBasicMaterial({ color: 0x3b6fd8 }));
  luzP.position.set(0, 0, 0.016); p20.add(luzP);
  const asiento = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 20), mat.negro)); asiento.position.set(3.0, 0.45 + 0.76, -1.3); roskoObj.add(asiento);
  palo(3.0, -1.3, 0.74, 0.03);                                                             // piso alto del animador
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 6, 20), mat.negro); aro.position.set(3.0, 0.45 + 0.3, -1.3); aro.rotation.x = Math.PI / 2; roskoObj.add(aro);
  roskoObj.visible = false; scene.add(roskoObj);

  // --- «¿Quien quiere ser ganador?» (Cote, rev 308): concursante sentado a la izquierda (mirando de frente), en diagonal,
  //     con su pantalla al frente; animador a la derecha en un sillon bajo, con una tablet en un atril vertical ---
  desafioObj = new THREE.Group();
  const dPersona = (ropa, alto) => { const g = new THREE.Group();
    const torso = sombra(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 6, 12), ropa)); torso.position.y = alto + 0.42; g.add(torso);
    const cabeza = sombra(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat.piel)); cabeza.position.y = alto + 0.88; g.add(cabeza);
    const muslos = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.45), ropa)); muslos.position.set(0, alto + 0.07, 0.2); g.add(muslos);
    const piernas = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.3, alto, 0.12), mat.negro)); piernas.position.set(0, alto / 2, 0.4); g.add(piernas);
    return g; };
  const dSilla = (alto, ancho) => { const g = new THREE.Group();
    const asientoS = sombra(new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.1, 0.5), mat.negro)); asientoS.position.y = alto - 0.05; g.add(asientoS);
    const resp = sombra(new THREE.Mesh(new THREE.BoxGeometry(ancho, 0.6, 0.08), mat.negro)); resp.position.set(0, alto + 0.3, -0.22); g.add(resp);
    const pata = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, alto, 8), mat.negro)); pata.position.y = alto / 2; g.add(pata);
    return g; };
  // concursante: dSilla alta, mirando en diagonal hacia el centro y el publico; pantalla al frente
  const dConc = new THREE.Group(); dConc.add(dSilla(0.65, 0.5)); dConc.add(dPersona(new THREE.MeshStandardMaterial({ color: 0x17305a, roughness: 0.9 }), 0.65));
  const dMonitor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.04), mat.negro); dMonitor.position.set(0, 1.05, 0.85); dMonitor.rotation.y = Math.PI; dConc.add(dMonitor);
  const dBrillo = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), new THREE.MeshBasicMaterial({ color: 0x3b6fd8 })); dBrillo.position.set(0, 0, -0.025); dBrillo.rotation.y = Math.PI; dMonitor.add(dBrillo);
  const dPieM = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.85, 8), mat.negro)); dPieM.position.set(0, 0.43, 0.85); dConc.add(dPieM);
  dConc.position.set(-2.2, 0.45, -1.7); dConc.rotation.y = Math.PI / 4; desafioObj.add(dConc);
  // animador: sillon bajo, mirando en diagonal hacia el concursante y el publico; dTablet en un dAtril vertical
  const dAnim = new THREE.Group(); dAnim.add(dSilla(0.42, 0.7)); dAnim.add(dPersona(new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 }), 0.42));
  const dAtril = sombra(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.0, 8), mat.negro)); dAtril.position.set(0.25, 0.5, 0.6); dAnim.add(dAtril);
  const dTablet = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.19, 0.015), mat.negro); dTablet.position.set(0.25, 1.02, 0.6); dTablet.rotation.y = Math.PI; dAnim.add(dTablet);
  const dPantT = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.16), new THREE.MeshBasicMaterial({ color: 0x9ec2ff })); dPantT.position.z = -0.009; dPantT.rotation.y = Math.PI; dTablet.add(dPantT);
  dAnim.position.set(2.4, 0.45, -1.7); dAnim.rotation.y = -Math.PI / 4; desafioObj.add(dAnim);
  desafioObj.visible = false; scene.add(desafioObj);
  if (VIVO.activo) prepararPantallasVivo();

  // anillo del punto tocado en el mapa de Seguir
  anilloMarca = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.58, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  anilloMarca.rotation.x = -Math.PI / 2; anilloMarca.visible = false; scene.add(anilloMarca);
  construido = true;
}

/* ---------- cada cuadro: luces segun lo que sale por el cable ---------- */
const BRILLO = { cabeza: 1400, frontales: 420, perimetrales: 110, bateria: 110, fondo: 420 };
function actualizarFocos(){
  focos.forEach(f => {
    const c = colorGrupo(f.g);
    const on = c && c.i > 0.01;
    f.spot.visible = !!on; f.haz.visible = !!on;
    f.lente.material.color.setRGB(on ? c.r / 255 : 0.12, on ? c.g / 255 : 0.12, on ? c.b / 255 : 0.12);
    if (!on) return;
    const m = Math.max(c.r, c.g, c.b) || 1, col = new THREE.Color(c.r / m, c.g / m, c.b / m);
    let destino, ang, fuerzaHaz;
    if (f.g.id === 'perimetrales' || f.g.id === 'bateria'){ destino = [f.pos[0], 2.8, -3.95]; ang = 0.42; fuerzaHaz = 0.25; }
    else if (f.g.id === 'fondo'){ destino = [Math.sign(f.pos[0]) * 2.4, 2.4, -3.97]; ang = 0.45; fuerzaHaz = 0.18; }
    // frontales: cruzados y a la cara de la persona en el escenario (color parejo), no a los pies (Cote, 24 nov)
    else if (f.g.id === 'frontales'){ destino = [-Math.sign(f.pos[0]) * 0.6, 2.0, -1.5]; ang = 0.22; fuerzaHaz = 0.14; }
    else if (c.pan != null && c.tilt != null){
      const d = direccion(f.pos, c.pan, c.tilt, f.def.piso, f.g.id);
      destino = choque(f.pos, d).p;
      const z = (c.zoom != null ? c.zoom : 50) / 100;                 // foco angosto = mas potente
      ang = 0.05 + 0.22 * z; fuerzaHaz = 0.55 - 0.3 * z;
    } else return;
    const k = BRILLO[f.tipo] || BRILLO[f.g.id] || 400;
    const concentracion = f.tipo === 'cabeza' ? 0.12 / Math.max(0.05, ang) : 1;
    f.spot.color.copy(col); f.spot.intensity = k * c.i * Math.min(3, concentracion);
    f.spot.angle = ang; f.spot.penumbra = f.tipo === 'cabeza' ? 0.35 : 0.6;
    f.spot.target.position.copy(v3(destino)); f.spot.target.updateMatrixWorld();
    // haz con humo: cono desde el equipo hasta donde pega la luz
    const a = v3(f.pos), b = v3(destino), dir = b.clone().sub(a), largo = Math.min(dir.length(), 60);
    f.haz.position.copy(a);
    f.haz.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    const r = Math.tan(ang) * largo; f.haz.scale.set(r, largo, r);
    f.haz.material.uniforms.uColor.value.copy(col);
    f.haz.material.uniforms.uI.value = fuerzaHaz * c.i;
  });
}

/* ---------- API para la pagina ---------- */
function render(){
  const cv = document.getElementById('cv3dgl');
  if (!conf || !cv) return;
  if (!construido) construir();
  const W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  if (renderer.getPixelRatio() !== dpr) renderer.setPixelRatio(dpr);
  const s = renderer.getSize(new THREE.Vector2());
  if (s.x !== W || s.y !== H) renderer.setSize(W, H, false);
  // V.aspecto: el salon estirado para llenar el recuadro (pagina Cabezas del DJ, Cote 26 nov)
  const asp = V.aspecto || W / H, fov = V.fov * 180 / Math.PI;
  if (camera.aspect !== asp || camera.fov !== fov){ camera.aspect = asp; camera.fov = fov; camera.updateProjectionMatrix(); }
  // camara: misma orbita que la vista simple (V.yaw, V.pitch, V.dist, V.objetivo)
  const cp = Math.cos(V.pitch), sp = Math.sin(V.pitch);
  camera.position.set(V.objetivo[0] + Math.sin(V.yaw) * cp * V.dist, V.objetivo[1] + sp * V.dist, V.objetivo[2] + Math.cos(V.yaw) * cp * V.dist);
  camera.lookAt(v3(V.objetivo));
  actualizarFocos();
  const enSeguir = document.body.classList.contains('en-seguir') || document.body.classList.contains('dj-cabezas');
  const an = V.animador;
  // mientras camina el animador, la artista fija no se muestra; en el panel del DJ hay alguien en el escenario en Previa y Show
  animadorObj.visible = !!an && !V.escenarioVacio && !V.desafio; artistaObj.visible = !an && !V.escenarioVacio && !V.desafio;
  roskoObj.visible = !!V.rosko && !V.desafio;
  if (desafioObj) desafioObj.visible = !!V.desafio;
  if (an){                                                     // camina: posicion, rumbo y piernas en movimiento
    animadorObj.position.set(an.p[0], an.p[1] + Math.abs(Math.sin(an.t * 6)) * 0.03, an.p[2]);
    animadorObj.rotation.y = an.rumbo;
    const sw = an.quieto ? 0 : Math.sin(an.t * 6) * 0.4;            // quieto (hablando en una mesa o en el escenario): piernas juntas
    const [pi, pd] = animadorObj.userData.piernas;
    if (an.sentado){                                            // sentado en el piso alto (El Rosko): muslos hacia adelante
      animadorObj.position.y = an.p[1] + 0.19;
      pi.position.set(-0.1, 0.62, 0.26); pd.position.set(0.1, 0.62, 0.26); pi.rotation.x = pd.rotation.x = Math.PI / 2;
    } else {
      pi.position.set(-0.1, 0.42, 0); pd.position.set(0.1, 0.42, 0); pi.rotation.x = sw; pd.rotation.x = -sw;
      if (an.quieto) animadorObj.position.y = an.p[1];
    }
  }
  anilloMarca.visible = !!(V.marca && enSeguir);
  if (anilloMarca.visible) anilloMarca.position.set(V.marca[0], V.marca[1] + 0.02, V.marca[2]);
  if (techoObj) techoObj.visible = camera.position.y < 6.8;
  renderer.render(scene, camera);
  if (VIVO.activo) moverPantallasVivo(cv);
}

/* ---------- Pantallas de la Sala en vivo dentro de la 3D (solo demo) ----------
   Cote (24 nov): pantalla del fondo = pantalla 2; pantallas verticales de las columnas azules = pantalla 3;
   pantallas de 42" debajo = la transmision (pantalla 1: esta misma vista + el GC encima).
   Las paginas van en iframes detras del lienzo 3D; la pantalla 3D "abre un hueco" transparente donde se ven,
   asi lo que esta delante (personas, columnas) las tapa bien. Las direcciones llegan en la direccion de la pagina:
   ?demo=tv&p2=<pagina pantalla 2>&p3=<pagina pantalla 3>&gc=<pagina del GC> (cada una es opcional). */
const PQ = new URLSearchParams(location.search);
// Dentro de la Sala (/demo-luces/) se usan sus paginas (Code 1, rev 188): pantalla 2 y 3 = /#/tablero, GC = /#/escena.
// "p2=no" (o p3/gc) deja la imagen de muestra.
const EN_SALA = location.pathname.indexOf('/demo-luces/') >= 0;
const pag = (k, def) => { const v = PQ.get(k); return v === 'no' ? null : (v || (EN_SALA ? def : null)); };
const VIVO = { activo: PQ.has('demo'), p2: pag('p2', '/#/tablero'), p3: pag('p3', '/#/tablero'), gc: pag('gc', '/#/escena'), lista: [], cuadro: 0, feeds: [] };
function prepararPantallasVivo(){
  const cv = document.getElementById('cv3dgl');
  const capa = document.createElement('div'); capa.className = 'capa3d'; cv.parentNode.insertBefore(capa, cv);
  const hueco = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, fog: false, toneMapped: false });
  const marco = (mesh, el, w, h) => {
    el.style.position = 'absolute'; el.style.left = '0'; el.style.top = '0'; el.style.width = w + 'px'; el.style.height = h + 'px';
    el.style.transformOrigin = '0 0'; el.style.display = 'none';
    capa.appendChild(el); mesh.material = hueco; VIVO.lista.push({ mesh, el, w, h });
  };
  const iframe = (url, w, h) => { const f = document.createElement('iframe'); f.src = url; f.setAttribute('allowtransparency', 'true'); f.tabIndex = -1;
    f.style.border = '0'; f.style.background = 'transparent'; f.style.width = w + 'px'; f.style.height = h + 'px'; return f; };
  if (VIVO.p2) marco(PANT.tv, iframe(VIVO.p2, 1920, 1043), 1920, 1043);
  if (VIVO.p3) PANT.vert.forEach(m => marco(m, iframe(VIVO.p3, 720, 1280), 720, 1280));      // tablero en vertical (720x1280)
  PANT.h42.forEach(m => {                                     // la transmision: esta vista (copiada cada pocos cuadros) + el GC encima
    const caja = document.createElement('div'); caja.style.background = '#000'; caja.style.overflow = 'hidden';
    const c = document.createElement('canvas'); c.width = 384; c.height = 216; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; caja.appendChild(c);
    if (VIVO.gc){ const f = iframe(VIVO.gc, 1920, 1080); f.style.position = 'absolute'; f.style.left = '0'; f.style.top = '0';
      f.style.transform = 'scale(' + (640 / 1920) + ')'; f.style.transformOrigin = '0 0'; caja.appendChild(f);
      // el GC va ENCIMA de la transmision: su fondo tiene que ser transparente (Cote, rev 198: se veia el GC sobre negro).
      // Ojo: si la pagina del GC dice color-scheme "dark" y esta no, el navegador le pinta un fondo opaco detras;
      // por eso se iguala el color-scheme, ademas de quitarle el fondo a html y body.
      const transparente = () => { try { const d = f.contentDocument; if (!d || !d.body) return;
        const cs = getComputedStyle(document.documentElement).colorScheme || 'normal';
        [d.documentElement, d.body].forEach(e => e.style.setProperty('background', 'transparent', 'important'));
        d.documentElement.style.setProperty('color-scheme', cs, 'important'); } catch (e) {} };
      f.addEventListener('load', () => { transparente(); setTimeout(transparente, 1000); setTimeout(transparente, 4000); }); }
    VIVO.feeds.push(c.getContext('2d')); marco(m, caja, 640, 360);
  });
}
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
function moverPantallasVivo(cv){
  if (VIVO.feeds.length && ++VIVO.cuadro % 3 === 0){            // copia de la transmision para las pantallas de 42"
    VIVO.feeds.forEach(x => { x.fillStyle = '#000'; x.fillRect(0, 0, 384, 216); x.drawImage(renderer.domElement, 0, 0, 384, 216); });
  }
  const W = cv.clientWidth, H = cv.clientHeight, ox = cv.offsetLeft, oy = cv.offsetTop;
  VIVO.lista.forEach(v => {
    const g = v.mesh.geometry.parameters, w2 = g.width / 2, h2 = g.height / 2, pts = [];
    _n.set(0, 0, 1).transformDirection(v.mesh.matrixWorld); v.mesh.getWorldPosition(_c);
    let ver = _n.dot(_v.copy(camera.position).sub(_c)) > 0;     // de frente a la camara
    for (const [x, y] of [[-w2, h2], [w2, h2], [w2, -h2], [-w2, -h2]]){
      if (!ver) break;
      _v.set(x, y, 0).applyMatrix4(v.mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      if (_v.z > -0.05){ ver = false; break; }                  // detras de la camara
      _v.applyMatrix4(camera.projectionMatrix);
      pts.push([ox + (_v.x + 1) / 2 * W, oy + (1 - _v.y) / 2 * H]);
    }
    if (!ver){ v.el.style.display = 'none'; return; }
    v.el.style.display = '';
    v.el.style.transform = homografia(v.w, v.h, pts);
  });
}
// Transformacion CSS que lleva el rectangulo (0,0)-(w,h) a los 4 puntos de la pantalla vista por la camara
function homografia(w, h, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]){
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / den, k = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3, d = y1 - y0 + g * y1, e = y3 - y0 + k * y3;
  return 'matrix3d(' + [a / w, d / w, 0, g / w, b / h, e / h, 0, k / h, 0, 0, 1, 0, x0, y0, 0, 1].join(',') + ')';
}

try {
  const cv = document.getElementById('cv3dgl');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: VIVO.activo, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 400);
  window.Vista3D = { ok: true, render, focos };                    // focos: para revisar desde la consola
  document.getElementById('vista').classList.add('gl');
  try { V.sucio = true; } catch (e) {}
} catch (e) {
  console.warn('Vista 3D realista no disponible, se usa la vista simple:', e);
}
