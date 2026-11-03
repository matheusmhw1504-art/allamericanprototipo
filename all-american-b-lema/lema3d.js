import * as THREE from 'https://esm.sh/three@0.170.0';
import { TextGeometry } from 'https://esm.sh/three@0.170.0/examples/jsm/geometries/TextGeometry.js';
import { Font } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/FontLoader.js';
import { TTFLoader } from 'https://esm.sh/three@0.170.0/examples/jsm/loaders/TTFLoader.js';
import { RoomEnvironment } from 'https://esm.sh/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';

const LINES = [['Dream it.', '#E3263D'], ['Learn it.', '#23308F'], ['Live it.', '#0F8A4C']];

async function loadFont() {
  try {
    const r = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/unbounded@latest/latin-800-normal.woff');
    if (!r.ok) throw new Error('font');
    return new Font(new TTFLoader().parse(await r.arrayBuffer()));
  } catch (e) {
    const r = await fetch('https://cdn.jsdelivr.net/npm/three@0.170.0/examples/fonts/helvetiker_bold.typeface.json');
    return new Font(await r.json());
  }
}

export async function start({ root, isPaused, reduced }) {
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('no webgl');
  const font = await loadFont();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '15', pointerEvents: 'none', opacity: '0' });
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-4, 6, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xfff1c8, 0.6); rim.position.set(6, -2, -4); scene.add(rim);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 14);

  const group = new THREE.Group(); scene.add(group);
  const inner = new THREE.Group(); group.add(inner);
  const meshes = LINES.map(([txt, col], i) => {
    const g = new TextGeometry(txt, { font, size: 1, depth: 0.42, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.04, bevelSegments: 5 });
    g.computeBoundingBox();
    g.translate(-g.boundingBox.min.x, 0, -0.21);
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, emissive: col, emissiveIntensity: 0.18 }));
    m.position.y = -i * 1.42;
    inner.add(m);
    return m;
  });
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
  inner.position.set(-ctr.x, -ctr.y, 0);
  const baseW = size.x;

  const cl = v => Math.max(0, Math.min(1, v)), sm = v => v * v * (3 - 2 * v), mix = (a, b, t) => a + (b - a) * t;
  let slots = [];
  let W = 0, H = 0, k = 1;
  const resize = () => {
    W = innerWidth; H = innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    k = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z / H;
  };
  resize(); addEventListener('resize', resize, { passive: true });

  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPtr = e => { ptr.tx = e.clientX / W * 2 - 1; ptr.ty = e.clientY / H * 2 - 1; };
  addEventListener('pointermove', onPtr, { passive: true });

  const cur = { x: 0, y: 0, s: 0, rx: 0.4, ry: -2.6, rz: 0.2, o: 0 };
  const lineZ = [0, 0, 0];
  let raf = 0, first = true, last = performance.now();

  const poseAt = (r, f) => {
    const right = r.left + r.width / 2 > W / 2, fin = f === slots.length - 1;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width / baseW, rx: fin ? 0.04 : 0.1, ry: fin ? (right ? -0.14 : 0.14) : right ? -0.38 : 0.38, rz: 0, o: 1, f };
  };

  const loop = now => {
    raf = requestAnimationFrame(loop);
    if (isPaused()) { last = now; return; }
    const dt = Math.min(64, now - last) / 16.67; last = now;
    const t = now / 1000, small = W < 760, sy = scrollY, c = sy + H / 2;
    slots = [...document.querySelectorAll('[data-slot]')].filter(el => el.isConnected);
    const S = slots.map((el, i) => { const r = el.getBoundingClientRect(); return { r, cy: r.top + sy + r.height / 2, i }; });
    let pose, act = -1;
    if (!S.length) return;
    if (c <= S[0].cy) { pose = poseAt(S[0].r, 0); act = 0; }
    else if (c >= S[S.length - 1].cy) { const L = S[S.length - 1]; pose = poseAt(L.r, L.i); act = L.i; }
    else {
      let i = 0; while (i < S.length - 2 && c > S[i + 1].cy) i++;
      const A = S[i], B = S[i + 1];
      const u = (c - A.cy) / (B.cy - A.cy);
      const a = sm(cl(1 - (c - A.cy) / (H * 0.55))), b = sm(cl(1 - (B.cy - c) / (H * 0.55)));
      const pa = poseAt(A.r, A.i), pb = poseAt(B.r, B.i);
      const side = small ? W - 70 : (u < 0.5 ? (pa.x > W / 2 ? W - 120 : 120) : (pb.x > W / 2 ? W - 120 : 120));
      const T = { x: side, y: H * 0.5 + Math.sin(u * Math.PI * 2) * H * 0.08, s: (small ? 120 : 220) / baseW, rx: Math.sin(sy * 0.0021) * 0.35, ry: sy * 0.0032, rz: Math.sin(sy * 0.0013) * 0.18, o: small ? 0 : 1 };
      pose = { ...T };
      for (const key of ['x', 'y', 's', 'rx', 'rz', 'o']) { pose[key] = mix(mix(T[key], pa[key], a), pb[key], b); }
      const near = (v, ref) => v - Math.PI * 2 * Math.round((v - ref) / (Math.PI * 2));
      pose.ry = mix(mix(T.ry, near(pa.ry, T.ry), a), near(pb.ry, T.ry), b);
      act = a > 0.5 ? A.i : b > 0.5 ? B.i : -1;
    }
    if (small) pose.o = 0;
    const wob = reduced ? 0 : 1;
    ptr.x += (ptr.tx - ptr.x) * 0.06; ptr.y += (ptr.ty - ptr.y) * 0.06;
    pose.y += Math.sin(t * 1.1) * 6 * wob;
    pose.rx += (Math.cos(t * 0.5) * 0.05 + ptr.y * 0.12) * wob;
    pose.ry += (Math.sin(t * 0.6) * 0.08 + ptr.x * 0.22) * wob;
    if (first) { cur.x = pose.x; cur.y = pose.y; first = false; }
    pose.ry = pose.ry - Math.PI * 2 * Math.round((pose.ry - cur.ry) / (Math.PI * 2));
    const f = reduced ? 1 : 1 - Math.pow(1 - 0.085, dt);
    for (const key of ['x', 'y', 's', 'rx', 'ry', 'rz', 'o']) cur[key] += (pose[key] - cur[key]) * f;
    meshes.forEach((m, i) => { const tz = i === act ? 0.7 : 0; lineZ[i] += (tz - lineZ[i]) * (reduced ? 1 : 1 - Math.pow(1 - (0.12 - i * 0.025), dt)); m.position.z = lineZ[i]; });
    canvas.style.opacity = cur.o.toFixed(3);
    if (cur.o < 0.01) return;
    group.position.set((cur.x - W / 2) * k, -(cur.y - H / 2) * k, 0);
    group.scale.setScalar(Math.max(0.0001, cur.s * k));
    group.rotation.set(cur.rx, cur.ry, cur.rz);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return {
    stop() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize); removeEventListener('pointermove', onPtr);
      meshes.forEach(m => { m.geometry.dispose(); m.material.dispose(); });
      pmrem.dispose(); renderer.dispose(); canvas.remove();
    }
  };
}
