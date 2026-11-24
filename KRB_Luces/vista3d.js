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
let anilloMarca;

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
    lampara: new THREE.MeshStandardMaterial({ map: texMadera('#b08a52', '#6a4a22'), roughness: 0.7, emissive: 0x5a3a10, emissiveIntensity: 0.35 }),
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

  // --- escenario ---
  const forma = new THREE.Shape(TARIMA.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geoT = new THREE.ExtrudeGeometry(forma, { depth: 0.45, bevelEnabled: false }); geoT.rotateX(-Math.PI / 2);
  scene.add(sombra(new THREE.Mesh(geoT, [mat.tarima, mat.madera])));
  const fondo = new THREE.Mesh(new THREE.PlaneGeometry(10, 4.6), mat.fondo); fondo.position.set(0, 2.3, -4); fondo.receiveShadow = true; scene.add(fondo);
  const tv = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.25), new THREE.MeshStandardMaterial({ color: 0x05070c, emissive: 0x0b1a33, emissiveIntensity: 1, roughness: 0.2 }));
  tv.position.set(0, 1.97, -3.93); scene.add(tv);
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
  caja(0.9, 1.3, 0.6, mat.gris, 2.15, 1.1, -3.0);                                     // case (a la derecha de la mini cabeza)
  caja(0.7, 0.75, 0.5, mat.negro, -2.25, 0.82, -3.15);                               // parlante
  // columnas azules del escenario con su pantalla vertical (y la TV en la derecha)
  [-5.8, 5.8].forEach(x => {
    caja(1.0, 4.3, 1.2, mat.listones, x, 2.15, 0);
    const pant = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshStandardMaterial({ color: 0x101826, emissive: 0x3a5a90, emissiveIntensity: 0.6 }));
    pant.position.set(x, 3.0, 0.61); scene.add(pant);
    if (x > 0){ const t2 = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.8), new THREE.MeshStandardMaterial({ color: 0x101826, emissive: 0x2c4a7a, emissiveIntensity: 0.6 })); t2.position.set(x, 1.65, 0.66); scene.add(t2); }
  });
  // marco azul, red de cuerdas y lamparas hexagonales
  const barra = (a, b) => { const d = v3(b).sub(v3(a)), m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, d.length(), 10), mat.azul);
    m.position.copy(v3(a).add(d.clone().multiplyScalar(0.5))); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); scene.add(m); };
  barra([-5.8, 4.5, 0.3], [5.8, 4.5, 0.3]); barra([-5.8, 4.5, 0.3], [-5.8, 4.5, -3.6]); barra([5.8, 4.5, 0.3], [5.8, 4.5, -3.6]); barra([-5.8, 4.5, -2.6], [5.8, 4.5, -2.6]);
  const pts = [];
  for (let x = -5.4; x <= 5.4; x += 0.42){
    const largo = 1.0 + 0.5 * Math.abs(Math.sin(x * 1.7));
    pts.push(x, 4.5, 0.3, x + 0.15, 4.5 - largo, -0.6);
    pts.push(x, 4.5, 0.3, x, 4.35, -2.6);
  }
  for (let z = 0; z >= -2.4; z -= 0.6) pts.push(-5.8, 4.42, z, 5.8, 4.42, z);
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
  colsSalon().forEach(([u, v], n) => {
    const p = sombra(new THREE.Mesh(new THREE.BoxGeometry(1.2, 5.5, 1.2), mat.piedra)); enSalon(p, u, v, 2.75); scene.add(p);
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
  art.position.set(0.3, 0, -1.6); scene.add(art);
  const rnd = azar(42), sentados = [];
  mesas.filter(m => m.v < 28).forEach(m => m.sillas.forEach(s => { if (rnd() < 0.45) sentados.push([m.u + s * 0.6, m.v]); }));
  inst(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), mat.ropaPublico, sentados.map(([u, v]) => [u, v, 0.85]));
  inst(new THREE.SphereGeometry(0.11, 12, 10), mat.piel, sentados.map(([u, v]) => [u, v, 1.3]));

  // --- los equipos de luz: un foco real + un haz con humo + el lente encendido ---
  conf.grupos.forEach(g => {
    const def = POS3D[g.id] || {};
    const posiciones = g.vista3d || (def.columna != null ? [posCabeza(g.id)] : (def.pos || []));
    posiciones.forEach(pos => {
      const tipo = def.columna != null || g.id === 'mini' ? 'cabeza' : g.id;
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

  // anillo del punto tocado en el mapa de Seguir
  anilloMarca = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.58, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
  anilloMarca.rotation.x = -Math.PI / 2; anilloMarca.visible = false; scene.add(anilloMarca);
  construido = true;
}

/* ---------- cada cuadro: luces segun lo que sale por el cable ---------- */
const BRILLO = { cabeza: 1400, frontales: 420, perimetrales: 110, fondo: 420 };
function actualizarFocos(){
  focos.forEach(f => {
    const c = colorGrupo(f.g);
    const on = c && c.i > 0.01;
    f.spot.visible = !!on; f.haz.visible = !!on;
    f.lente.material.color.setRGB(on ? c.r / 255 : 0.12, on ? c.g / 255 : 0.12, on ? c.b / 255 : 0.12);
    if (!on) return;
    const m = Math.max(c.r, c.g, c.b) || 1, col = new THREE.Color(c.r / m, c.g / m, c.b / m);
    let destino, ang, fuerzaHaz;
    if (f.g.id === 'perimetrales'){ destino = [f.pos[0], 2.8, -3.95]; ang = 0.42; fuerzaHaz = 0.25; }
    else if (f.g.id === 'fondo'){ destino = [Math.sign(f.pos[0]) * 2.4, 2.4, -3.97]; ang = 0.45; fuerzaHaz = 0.18; }
    else if (f.g.id === 'frontales'){ destino = [f.pos[0] * 0.25, 0.45, -1.4]; ang = 0.32; fuerzaHaz = 0.14; }
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
  if (s.x !== W || s.y !== H){ renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
  // camara: misma orbita que la vista simple (V.yaw, V.pitch, V.dist, V.objetivo)
  const cp = Math.cos(V.pitch), sp = Math.sin(V.pitch);
  camera.position.set(V.objetivo[0] + Math.sin(V.yaw) * cp * V.dist, V.objetivo[1] + sp * V.dist, V.objetivo[2] + Math.cos(V.yaw) * cp * V.dist);
  camera.lookAt(v3(V.objetivo));
  actualizarFocos();
  const enSeguir = document.body.classList.contains('en-seguir');
  anilloMarca.visible = !!(V.marca && enSeguir);
  if (anilloMarca.visible) anilloMarca.position.set(V.marca[0], V.marca[1] + 0.02, V.marca[2]);
  renderer.render(scene, camera);
}

try {
  const cv = document.getElementById('cv3dgl');
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.1, 400);
  window.Vista3D = { ok: true, render };
  document.getElementById('vista').classList.add('gl');
  try { V.sucio = true; } catch (e) {}
} catch (e) {
  console.warn('Vista 3D realista no disponible, se usa la vista simple:', e);
}
