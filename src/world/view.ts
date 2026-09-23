import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { FIELD_M } from '../fdm/aircraft';
import { readAirdata } from '../fdm/fdm';
import { rotateBodyToNed } from '../fdm/math';
import { aircraft } from '../sim/session';

function runwayTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 1024;
  const g = c.getContext('2d');
  if (!g) return new CanvasTexture(c);
  g.fillStyle = '#3c4148';
  g.fillRect(0, 0, 128, 1024);
  g.fillStyle = '#f2f2f0';
  g.fillRect(6, 0, 4, 1024);
  g.fillRect(118, 0, 4, 1024);
  g.fillStyle = '#e2c14a';
  for (let y = 16; y < 1024; y += 56) g.fillRect(60, y, 8, 28);
  g.fillStyle = '#f7f7f5';
  g.fillRect(18, 40, 92, 10);
  g.fillRect(18, 58, 92, 10);
  g.font = '700 78px sans-serif';
  g.textAlign = 'center';
  g.save();
  g.translate(64, 200);
  g.rotate(Math.PI);
  g.fillText('36', 0, 0);
  g.restore();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function grassTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) return new CanvasTexture(c);
  g.fillStyle = '#3f6a38';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    g.fillStyle = i % 3 === 0 ? '#4e7c43' : '#345a30';
    g.fillRect(x, y, 2, 3);
  }
  const tex = new CanvasTexture(c);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function nedToThree(n: [number, number, number]): Vector3 {
  return new Vector3(n[1], -n[2], -n[0]);
}

export function createView(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  const scene = new Scene();
  scene.background = new Color(0x8ec8ee);
  scene.fog = new Fog(0xb7d6f2, 500, 5200);

  const camera = new PerspectiveCamera(48, 1, 0.2, 12000);
  const camPos = new Vector3(0, 8, 30);
  const look = new Vector3();
  const desired = new Vector3();
  const basis = new Matrix4();

  scene.add(new HemisphereLight(0xd7ecff, 0x3a5a30, 0.85));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const sun = new DirectionalLight(0xfff4dd, 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 400;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  scene.add(sun, sun.target);

  const ground = new Mesh(
    new PlaneGeometry(8000, 8000),
    new MeshStandardMaterial({ map: grassTexture(), roughness: 1, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const runway = new Mesh(
    new PlaneGeometry(30, 1100),
    new MeshStandardMaterial({ map: runwayTexture(), roughness: 0.92, metalness: 0 }),
  );
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(0, 0.02, -550);
  runway.receiveShadow = true;
  scene.add(runway);

  const concrete = new MeshStandardMaterial({ color: 0xc5c8cc, roughness: 0.8 });
  const hangarGeo = new BoxGeometry(28, 8, 18);
  for (const z of [-180, -280]) {
    const hangar = new Mesh(hangarGeo, concrete);
    hangar.position.set(48, 4, z);
    hangar.castShadow = true;
    hangar.receiveShadow = true;
    scene.add(hangar);
    const roof = new Mesh(new BoxGeometry(30, 0.4, 20), new MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.2 }));
    roof.position.set(48, 8.2, z);
    scene.add(roof);
  }

  const pole = new Mesh(new CylinderGeometry(0.08, 0.08, 5, 8), new MeshStandardMaterial({ color: 0x22262b }));
  pole.position.set(-22, 2.5, -80);
  scene.add(pole);
  const sock = new Mesh(new ConeGeometry(0.35, 2.2, 10), new MeshStandardMaterial({ color: 0xe07020, roughness: 0.6 }));
  sock.rotation.x = Math.PI / 2;
  sock.position.set(-22, 4.6, -78.2);
  scene.add(sock);

  const lampMat = new MeshStandardMaterial({ color: 0xffe1a3, emissive: 0xffb03a, emissiveIntensity: 0.9, roughness: 0.4 });
  for (let n = 40; n < 1080; n += 70) {
    for (const side of [-16.5, 16.5]) {
      const lamp = new Mesh(new SphereGeometry(0.28, 10, 8), lampMat);
      lamp.position.set(side, 0.7, -n);
      scene.add(lamp);
    }
  }

  const white = new MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.42, metalness: 0.04 });
  const blue = new MeshStandardMaterial({ color: 0x1b4e86, roughness: 0.38, metalness: 0.06 });
  const dark = new MeshStandardMaterial({ color: 0x23272c, roughness: 0.55 });
  const glass = new MeshStandardMaterial({ color: 0xb7e4f5, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.72 });

  const ship = new Group();

  const fuse = new Mesh(new SphereGeometry(0.5, 22, 16), white);
  fuse.scale.set(0.92, 0.78, 6.4);
  fuse.position.set(0, 0.02, 0.35);
  fuse.castShadow = true;
  ship.add(fuse);

  const stripe = new Mesh(new BoxGeometry(0.16, 0.08, 5.4), blue);
  stripe.position.set(0, 0.42, 0.2);
  ship.add(stripe);

  const nose = new Mesh(new ConeGeometry(0.22, 0.55, 16), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.02, -2.95);
  nose.castShadow = true;
  ship.add(nose);

  const canopy = new Mesh(new SphereGeometry(0.38, 16, 12), glass);
  canopy.scale.set(0.85, 0.7, 1.3);
  canopy.position.set(0, 0.38, -0.85);
  ship.add(canopy);

  const wing = new Mesh(new BoxGeometry(11, 0.1, 1.45), white);
  wing.position.set(0, 0.52, 0.15);
  wing.castShadow = true;
  ship.add(wing);
  const wingPaint = new Mesh(new BoxGeometry(11.02, 0.03, 0.18), blue);
  wingPaint.position.set(0, 0.58, 0.15);
  ship.add(wingPaint);

  const hstab = new Mesh(new BoxGeometry(3.5, 0.07, 0.85), white);
  hstab.position.set(0, 0.18, 3.15);
  hstab.castShadow = true;
  ship.add(hstab);
  const vstab = new Mesh(new BoxGeometry(0.07, 1.25, 0.9), white);
  vstab.position.set(0, 0.85, 3.2);
  vstab.castShadow = true;
  ship.add(vstab);
  const rudderPaint = new Mesh(new BoxGeometry(0.08, 1.05, 0.12), blue);
  rudderPaint.position.set(0, 0.85, 3.55);
  ship.add(rudderPaint);

  const prop = new Mesh(new BoxGeometry(1.7, 0.08, 0.05), dark);
  prop.position.set(0, 0.02, -3.15);
  ship.add(prop);
  const hub = new Mesh(new SphereGeometry(0.08, 10, 8), dark);
  hub.position.copy(prop.position);
  ship.add(hub);

  for (const x of [-1.15, 1.15]) {
    const strut = new Mesh(new CylinderGeometry(0.04, 0.05, 1.15, 8), dark);
    strut.position.set(x, -0.45, 0.35);
    ship.add(strut);
    const wheel = new Mesh(new CylinderGeometry(0.22, 0.22, 0.14, 14), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, -1.05, 0.35);
    ship.add(wheel);
  }
  const noseStrut = new Mesh(new CylinderGeometry(0.035, 0.04, 1.05, 8), dark);
  noseStrut.position.set(0, -0.42, -1.55);
  ship.add(noseStrut);
  const noseWheel = new Mesh(new CylinderGeometry(0.16, 0.16, 0.1, 12), dark);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -0.98, -1.55);
  ship.add(noseWheel);

  scene.add(ship);

  const shadow = new Mesh(
    new CircleGeometry(4.2, 20),
    new MeshStandardMaterial({ color: 0x1a2418, transparent: true, opacity: 0.28, roughness: 1 }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.04;
  scene.add(shadow);

  let propSpeed = 0;

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function render(dt: number, cockpit: boolean, throttle: number, engine: boolean) {
    const air = readAirdata(aircraft, throttle);
    const q = aircraft.q;
    const fwd = nedToThree(rotateBodyToNed(q, [1, 0, 0]));
    const right = nedToThree(rotateBodyToNed(q, [0, 1, 0]));
    const down = nedToThree(rotateBodyToNed(q, [0, 0, 1]));
    basis.makeBasis(right, down.clone().multiplyScalar(-1), fwd.clone().multiplyScalar(-1));
    ship.position.set(air.eastM, air.altFt * 0.3048 - FIELD_M, -air.northM);
    ship.setRotationFromMatrix(basis);

    const target = engine ? ((520 + throttle * 2200) / 60) * Math.PI * 2 : 0;
    propSpeed += (target - propSpeed) * Math.min(1, dt * 0.8);
    prop.rotation.z += propSpeed * dt;

    shadow.position.x = ship.position.x;
    shadow.position.z = ship.position.z;
    const height = Math.max(0, ship.position.y - 1.1);
    const s = Math.max(0.35, 1 - height / 80);
    shadow.scale.setScalar(s);
    (shadow.material as MeshStandardMaterial).opacity = 0.15 + 0.2 * s;

    sun.position.set(ship.position.x + 50, 90, ship.position.z + 24);
    sun.target.position.copy(ship.position);
    sun.target.updateMatrixWorld();

    if (cockpit) {
      desired.copy(ship.position).addScaledVector(fwd, 0.9);
      desired.y += 0.45;
      look.copy(ship.position).addScaledVector(fwd, 30);
      look.y = desired.y - fwd.y * 2;
      camPos.copy(desired);
    } else {
      desired.copy(ship.position).addScaledVector(fwd, -14);
      desired.y += 5.2 + height * 0.02;
      look.copy(ship.position).addScaledVector(fwd, 10);
      look.y = ship.position.y + 1.2;
      const blend = 1 - Math.exp(-dt * 3.2);
      camPos.lerp(desired, blend);
    }
    camera.position.copy(camPos);
    camera.lookAt(look);
    renderer.render(scene, camera);
  }

  resize();
  return { render, resize };
}
