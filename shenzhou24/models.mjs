import * as THREE from './vendor/three.module.min.js';

const white = () => new THREE.MeshStandardMaterial({color: 0xf3efe6, roughness: 0.55, metalness: 0.18});
const offwhite = () => new THREE.MeshStandardMaterial({color: 0xd9d3c6, roughness: 0.62, metalness: 0.12});
const dark = () => new THREE.MeshStandardMaterial({color: 0x1c2028, roughness: 0.55, metalness: 0.35});
const red = () => new THREE.MeshStandardMaterial({color: 0x9a3328, roughness: 0.5, metalness: 0.15});
const gold = () => new THREE.MeshStandardMaterial({color: 0xc9a24a, roughness: 0.35, metalness: 0.4, emissive: 0x3a2a08, emissiveIntensity: 0.2});
const blue = () => new THREE.MeshStandardMaterial({color: 0x2e6d9c, roughness: 0.45, metalness: 0.25});
const foil = () => new THREE.MeshStandardMaterial({color: 0x8f9aa8, roughness: 0.3, metalness: 0.6});

function cyl(r, h, mat, segs = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segs), mat);
  m.castShadow = false;
  return m;
}

function disk(r, mat) {
  return new THREE.Mesh(new THREE.CircleGeometry(r, 22), mat);
}

function solarWing(width, height, mat) {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, height), mat);
  g.add(panel);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width * 0.02, 0.06, height), dark());
  frame.position.x = -width * 0.5;
  g.add(frame);
  return g;
}

// Built in meters. +Y is up / toward the nose during ascent.
export function createRocket() {
  const root = new THREE.Group();
  root.name = 'CZ2F';

  const stage1 = new THREE.Group();
  stage1.name = 'stage1';
  const core = cyl(1.675, 23.2, white(), 24);
  core.position.y = 11.6;
  stage1.add(core);
  const band = cyl(1.69, 0.6, red(), 24);
  band.position.y = 2.2;
  stage1.add(band);
  const engine = cyl(0.7, 1.6, dark(), 12);
  engine.position.y = -0.3;
  stage1.add(engine);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.55, 1.8, 14), dark());
  nozzle.position.y = -1.6;
  stage1.add(nozzle);
  root.add(stage1);

  const boosters = new THREE.Group();
  boosters.name = 'boosters';
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const body = cyl(1.125, 16.1, white(), 16);
    body.position.y = 8.05;
    b.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(1.125, 1.8, 14), white());
    tip.position.y = 17.0;
    b.add(tip);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.45, 1.3, 12), dark());
    n.position.y = -0.5;
    b.add(n);
    const stripe = cyl(1.13, 0.4, red(), 16);
    stripe.position.y = 3;
    b.add(stripe);
    const ang = (i / 4) * Math.PI * 2;
    b.position.set(Math.cos(ang) * 2.8, 0, Math.sin(ang) * 2.8);
    boosters.add(b);
  }
  root.add(boosters);

  const stage2 = new THREE.Group();
  stage2.name = 'stage2';
  const s2 = cyl(1.675, 13.2, offwhite(), 24);
  s2.position.y = 23.2 + 6.6;
  stage2.add(s2);
  const inter = cyl(1.68, 0.5, dark(), 24);
  inter.position.y = 23.2;
  stage2.add(inter);
  root.add(stage2);

  const fairing = new THREE.Group();
  fairing.name = 'fairing';
  const shell = cyl(1.9, 8.4, white(), 24);
  shell.position.y = 23.2 + 13.2 + 4.2;
  fairing.add(shell);
  const ogive = new THREE.Mesh(new THREE.ConeGeometry(1.9, 4.2, 24), white());
  ogive.position.y = 23.2 + 13.2 + 8.4 + 2.1;
  fairing.add(ogive);
  root.add(fairing);

  const tower = new THREE.Group();
  tower.name = 'tower';
  const pole = cyl(0.22, 7.2, dark(), 8);
  pole.position.y = 23.2 + 13.2 + 12.6 + 3.6;
  tower.add(pole);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.4, 10), red());
  head.position.y = 23.2 + 13.2 + 12.6 + 7.2 + 0.5;
  tower.add(head);
  for (let i = 0; i < 4; i++) {
    const motor = cyl(0.18, 1.6, dark(), 8);
    motor.rotation.z = Math.PI / 2;
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const y = 23.2 + 13.2 + 12.6 + 5.4;
    motor.position.set(Math.cos(ang) * 0.55, y, Math.sin(ang) * 0.55);
    motor.rotation.y = -ang;
    tower.add(motor);
  }
  root.add(tower);

  const plume = new THREE.Group();
  plume.name = 'plume';
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 14, 16, 1, true),
    new THREE.MeshBasicMaterial({color: 0xffc46b, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false})
  );
  flame.position.y = -8;
  flame.rotation.x = Math.PI;
  plume.add(flame);
  const coreFlame = new THREE.Mesh(
    new THREE.ConeGeometry(0.6, 10, 12, 1, true),
    new THREE.MeshBasicMaterial({color: 0xfff4d0, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false})
  );
  coreFlame.position.y = -6;
  coreFlame.rotation.x = Math.PI;
  plume.add(coreFlame);
  root.add(plume);

  root.userData.parts = {stage1, boosters, stage2, fairing, tower, plume};
  // Pivot near mid so scaling looks decent; pad sits at y=0.
  return root;
}

export function createShenzhou(options = {}) {
  const {solar = true, colorHint = 0x2e6d9c} = options;
  const root = new THREE.Group();
  root.name = 'Shenzhou';

  // Service module at the back (-Y if +Y is docking / forward in this build).
  // We'll orient: +Z is docking forward for LVLH later; start with +Y forward to match rocket.
  const service = cyl(1.25, 3.0, foil(), 18);
  service.position.y = 1.5;
  root.add(service);
  const rear = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.25, 0.6, 18), dark());
  rear.position.y = -0.1;
  root.add(rear);
  for (let i = 0; i < 4; i++) {
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.7, 8), dark());
    const ang = (i / 4) * Math.PI * 2;
    n.position.set(Math.cos(ang) * 0.7, -0.6, Math.sin(ang) * 0.7);
    root.add(n);
  }

  const reentry = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), offwhite());
  reentry.position.y = 3.0 + 0.55;
  reentry.rotation.x = Math.PI;
  root.add(reentry);
  const belt = cyl(1.26, 0.18, red(), 18);
  belt.position.y = 3.15;
  root.add(belt);

  const orbital = cyl(1.25, 2.6, white(), 18);
  orbital.position.y = 3.0 + 1.4 + 1.3;
  root.add(orbital);
  const hatch = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), dark());
  hatch.rotation.y = Math.PI / 2;
  hatch.position.set(1.26, 5.3, 0);
  root.add(hatch);
  const probe = cyl(0.12, 0.9, dark(), 8);
  probe.position.y = 3.0 + 1.4 + 2.6 + 0.45;
  root.add(probe);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 8, 18), dark());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 3.0 + 1.4 + 2.6;
  root.add(ring);
  const banner = cyl(1.26, 0.22, new THREE.MeshStandardMaterial({color: colorHint, roughness: 0.45, metalness: 0.2}), 18);
  banner.position.y = 5.1;
  root.add(banner);

  if (solar) {
    const wingMat = gold();
    const left = solarWing(4.6, 2.0, wingMat);
    left.position.set(-2.55, 1.5, 0);
    const right = solarWing(4.6, 2.0, wingMat);
    right.position.set(2.55, 1.5, 0);
    root.add(left, right);
    root.userData.wings = [left, right];
  }

  // Length from nozzle to probe ~ 8.6 m; docking plane near y≈7.0
  root.userData.dockY = 7.0;
  root.userData.length = 8.6;
  return root;
}

function moduleBody(length, radius, mat) {
  const g = new THREE.Group();
  const body = cyl(radius, length, mat, 22);
  g.add(body);
  return g;
}

export function createTiangong() {
  const root = new THREE.Group();
  root.name = 'Tiangong';

  // Construction frame (meters):
  // Tianhe along +X (forward / V-bar), aft is -X (Tianzhou), nadir is -Y (Shenzhou-23),
  // Wentian -Z, Mengtian +Z. This matches the close-up scene where +X is approach axis
  // and Earth is below (-Y).
  const tianhe = moduleBody(16.6, 2.1, white());
  tianhe.rotation.z = Math.PI / 2;
  root.add(tianhe);
  const node = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 16), offwhite());
  node.position.x = 0;
  root.add(node);
  // Shift Tianhe so the node is a bit forward of center? Keep CM at origin:
  // Tianhe extends from x=-8.3 to +8.3, ports at both ends.

  const fwdPort = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 20), dark());
  fwdPort.rotation.y = Math.PI / 2;
  fwdPort.position.x = 8.4;
  root.add(fwdPort);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 1.2, 18), dark());
  collar.rotation.z = Math.PI / 2;
  collar.position.x = 8.9;
  root.add(collar);
  const drogue = new THREE.Mesh(new THREE.CircleGeometry(0.85, 18), new THREE.MeshStandardMaterial({color: 0x111318, roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide}));
  drogue.rotation.y = Math.PI / 2;
  drogue.position.x = 9.5;
  root.add(drogue);
  const aftPort = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 20), dark());
  aftPort.rotation.y = Math.PI / 2;
  aftPort.position.x = -8.4;
  root.add(aftPort);
  const radPort = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.1, 8, 18), dark());
  radPort.rotation.x = Math.PI / 2;
  radPort.position.y = -2.2;
  root.add(radPort);

  const wentian = moduleBody(17.9, 2.1, offwhite());
  wentian.rotation.x = Math.PI / 2;
  wentian.position.z = -2.1 - 8.95;
  root.add(wentian);
  const mengtian = moduleBody(17.9, 2.1, offwhite());
  mengtian.rotation.x = Math.PI / 2;
  mengtian.position.z = 2.1 + 8.95;
  root.add(mengtian);

  const tianzhou = moduleBody(10.6, 1.67, foil());
  tianzhou.rotation.z = Math.PI / 2;
  tianzhou.position.x = -8.3 - 5.3;
  root.add(tianzhou);

  const sz23 = createShenzhou({solar: true, colorHint: 0x3a7a4a});
  // Point docking probe toward the radial port: probe is +Y in the Shenzhou model.
  sz23.rotation.z = Math.PI; // probe toward -Y (up toward station)
  sz23.position.y = -2.2 - 7.0;
  root.add(sz23);

  const wingMat = gold();
  function addWings(parentX, parentZ, along = 'z') {
    for (const sign of [-1, 1]) {
      const w = solarWing(18, 3.2, wingMat);
      if (along === 'x') {
        w.rotation.z = Math.PI / 2;
        w.position.set(parentX, 0, parentZ + sign * 12);
      } else {
        w.position.set(parentX + sign * 12, 0, parentZ);
      }
      root.add(w);
    }
  }
  // Tianhe arrays roughly along ±Z near the aft
  const w1 = solarWing(16, 3.0, wingMat);
  w1.position.set(-4, 0, -12);
  const w2 = solarWing(16, 3.0, wingMat);
  w2.position.set(-4, 0, 12);
  root.add(w1, w2);
  // Experiment cabin arrays
  const w3 = solarWing(14, 2.6, wingMat);
  w3.rotation.y = Math.PI / 2;
  w3.position.set(-12, 0, -11);
  const w4 = solarWing(14, 2.6, wingMat);
  w4.rotation.y = Math.PI / 2;
  w4.position.set(12, 0, -11);
  const w5 = solarWing(14, 2.6, wingMat);
  w5.rotation.y = Math.PI / 2;
  w5.position.set(-12, 0, 11);
  const w6 = solarWing(14, 2.6, wingMat);
  w6.rotation.y = Math.PI / 2;
  w6.position.set(12, 0, 11);
  root.add(w3, w4, w5, w6);

  const tianzhouWings = solarWing(10, 2.2, wingMat);
  tianzhouWings.position.set(-16, 0, 0);
  tianzhouWings.rotation.y = Math.PI / 2;
  // two sides
  const tzL = solarWing(8, 2.0, wingMat);
  tzL.position.set(-16, 0, -7);
  const tzR = solarWing(8, 2.0, wingMat);
  tzR.position.set(-16, 0, 7);
  root.add(tzL, tzR);

  const truss = cyl(0.15, 20, dark(), 8);
  truss.rotation.x = Math.PI / 2;
  root.add(truss);

  root.userData.forwardPort = new THREE.Vector3(8.5, 0, 0);
  return root;
}

export function createPlumeSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const c = canvas.getContext('2d');
  const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,250,220,0.9)');
  g.addColorStop(0.4, 'rgba(255,180,70,0.5)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  return new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false}));
}

export function applyRocketConfig(rocket, config) {
  const p = rocket.userData.parts;
  if (!p) return;
  p.tower.visible = !!config.tower;
  p.boosters.visible = !!config.boosters;
  p.stage1.visible = !!config.stage1;
  p.fairing.visible = !!config.fairing;
  p.stage2.visible = !!config.stage2;
  p.plume.visible = !!config.plume;
}

export function setForwardXFromY(object) {
  // Convert a +Y-forward model so +X is forward (for the docking scene).
  object.rotation.z = -Math.PI / 2;
  return object;
}
