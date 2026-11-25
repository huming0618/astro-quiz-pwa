import * as THREE from './vendor/three.module.min.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {
  C, T_END, EVENTS, PHASES, PLANE, STATION_PERIOD_SEC,
  stateAt, sourceLabel, groundTrack, orbitRing, ascentPolyline,
  rendezvousPolyline, nowSimulationTime, formatT, attitudeBasis
} from './mission.mjs';
import {
  eciToThree, latLonToLocal, createEarth, createStarfield,
  lineFromLatLon, lineFromEci, markerPin
} from './earth.mjs';
import {createRocket, createShenzhou, createTiangong, applyRocketConfig, setForwardXFromY} from './models.mjs';

const $ = id => document.getElementById(id);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  t: 0,
  playing: false,
  speed: 'auto',
  view: 'pad',
  userOrbit: false,
  lastTs: 0,
  ready: false
};

let renderer, globalScene, dockScene, globalCam, dockCam, controls;
let earth, stars, rocket, freeCraft, stationGlobal, sunLight, fillLight;
let dockStation, dockCraft, dockStars, dockEarth, dockLight;
let labelWorld = {};
let geojson = null;

const dir3 = p => new THREE.Vector3(p.x, p.z, -p.y).normalize();

function autoRate(t) {
  if (t < 12) return 4;
  if (t < 220) return 16;
  if (t < C.insertSec) return 24;
  if (t < 10800) return 240;
  if (t < 11700) return 60;
  if (t < C.contactSec) return 24;
  return 8;
}

function currentRate() {
  return state.speed === 'auto' ? autoRate(state.t) : Number(state.speed);
}

function formatAlt(km) {
  if (km < 1.5) return `${(km * 1000).toFixed(0)} m`;
  if (km < 20) return `${km.toFixed(2)} km`;
  return `${km.toFixed(1)} km`;
}

function formatSpeed(v) {
  if (v < 1) return `${(v * 1000).toFixed(0)} m/s`;
  return `${v.toFixed(2)} km/s`;
}

function formatRange(km) {
  if (km >= 100) return `${km.toFixed(0)} km`;
  if (km >= 1) return `${km.toFixed(2)} km`;
  if (km >= 0.01) return `${(km * 1000).toFixed(0)} m`;
  return `${(km * 1000).toFixed(1)} m`;
}

function sourceClass(src) {
  return `tag tag-${src}`;
}

function buildEventList() {
  const ul = $('eventList');
  ul.innerHTML = '';
  for (const ev of EVENTS) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.t = String(ev.t);
    btn.innerHTML = `<span class="t">${ev.clock}</span><span><span class="ttl">${ev.title}</span><br><span class="src">${sourceLabel(ev.source)}</span></span>`;
    btn.addEventListener('click', () => {
      setTime(ev.t);
      if (ev.id === 'contact' || ev.id === 'latch' || ev.id === 'vbar') setView('dock');
    });
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function updateEventUI(sim) {
  const ev = sim.event;
  $('eventDetail').innerHTML = `<p><span class="${sourceClass(ev.source)}">${sourceLabel(ev.source)}</span> ${ev.sourceNote}</p><p style="margin-top:8px">${ev.detail}</p>`;
  const buttons = $('eventList').querySelectorAll('button');
  buttons.forEach((btn, i) => btn.setAttribute('aria-current', EVENTS[i] === ev ? 'true' : 'false'));
  document.querySelectorAll('[data-phase]').forEach(btn => {
    const t = Number(btn.dataset.phase);
    const ph = PHASES.find(p => t >= p.t0 && t <= p.t1) || PHASES[0];
    btn.classList.toggle('active', sim.phase.id === ph.id && Math.abs(t - ev.t) < 1 ? true : (t <= sim.t && (EVENTS.findLast?.(e => e.t <= sim.t) || ev).t === t));
  });
  // Highlight the phase button whose t is the latest one already reached.
  let currentPhaseT = 0;
  document.querySelectorAll('[data-phase]').forEach(btn => {
    const t = Number(btn.dataset.phase);
    btn.classList.toggle('active', false);
    if (t <= sim.t + 0.5 && t >= currentPhaseT) currentPhaseT = t;
  });
  document.querySelectorAll('[data-phase]').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.phase) === currentPhaseT);
  });
}

function updateHud(sim) {
  $('hudClock').textContent = sim.beijing;
  $('hudT').textContent = `${sim.tLabel} · 北京时间 UTC+8`;
  $('hudAlt').textContent = formatAlt(sim.craft.altKm);
  $('hudVel').textContent = formatSpeed(sim.craft.speedKmS);
  $('hudRange').textContent = formatRange(sim.rangeKm);
  $('hudRangeLabel').textContent = sim.t >= C.insertSec ? '与天宫距离（示意）' : '与天宫距离';
  $('altNote').textContent = '';
  $('scrub').value = String(Math.round(sim.t));
  const play = $('playBtn');
  play.setAttribute('aria-pressed', state.playing ? 'true' : 'false');
  play.textContent = state.playing ? '暂停' : '播放';
  updateEventUI(sim);
}

function setTime(t, opts = {}) {
  state.t = Math.max(0, Math.min(T_END, t));
  if (opts.pause) state.playing = false;
  const sim = stateAt(state.t);
  applySimulation(sim);
  updateHud(sim);
  if (!state.userOrbit) applyCamera(sim, true);
}

function vehicleScale(camera, target, modelMeters, minKm, maxKm) {
  const distKm = camera.position.distanceTo(target) * C.earthRadiusKm;
  const desiredKm = Math.min(maxKm, Math.max(minKm, distKm * 0.055));
  return (desiredKm / C.earthRadiusKm) / modelMeters;
}

function orientGroup(group, origin, xDir, yDir) {
  const x = dir3(xDir);
  const y = dir3(yDir);
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  y.crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  group.quaternion.setFromRotationMatrix(m);
  group.position.copy(origin);
}

function applySimulation(sim) {
  if (!state.ready) return;
  earth.rotation.y = sim.gmst;
  sunLight.position.copy(dir3(sim.sun)).multiplyScalar(20);
  fillLight.position.copy(dir3(sim.sun)).multiplyScalar(-8);

  const craftPos = eciToThree(sim.craft.pos);
  const stationPos = eciToThree(sim.station.pos);
  const att = attitudeBasis(sim.t);
  const rocketOn = sim.t < C.insertSec;

  rocket.visible = rocketOn;
  freeCraft.visible = !rocketOn;
  stationGlobal.visible = true;

  if (rocketOn) {
    const scale = vehicleScale(globalCam, craftPos, 58, 28, 280);
    rocket.scale.setScalar(scale);
    const up = {x: sim.craft.pos.x, y: sim.craft.pos.y, z: sim.craft.pos.z};
    orientGroup(rocket, craftPos, att.forward, up);
    // orientGroup uses X=forward, but the rocket model is +Y forward. Fix with extra rotation.
    rocket.rotateZ(Math.PI / 2);
    applyRocketConfig(rocket, sim.craft.config);
    if (rocket.userData.parts?.plume) {
      const pulse = 0.85 + 0.15 * Math.sin(sim.t * 18);
      rocket.userData.parts.plume.scale.set(1, pulse, 1);
    }
  } else {
    const scale = vehicleScale(globalCam, craftPos, 9, 22, 220);
    freeCraft.scale.setScalar(scale);
    const toStation = {
      x: sim.station.pos.x - sim.craft.pos.x,
      y: sim.station.pos.y - sim.craft.pos.y,
      z: sim.station.pos.z - sim.craft.pos.z
    };
    const fwd = (toStation.x || toStation.y || toStation.z) ? toStation : {x: -sim.station.vel.x, y: -sim.station.vel.y, z: -sim.station.vel.z};
    const radial = sim.craft.pos;
    orientGroup(freeCraft, craftPos, fwd, radial);
    freeCraft.rotateZ(Math.PI / 2);
  }

  const stScale = vehicleScale(globalCam, stationPos, 40, 30, 300);
  stationGlobal.scale.setScalar(stScale);
  const vbar = sim.station.vel;
  const zenith = sim.station.pos;
  orientGroup(stationGlobal, stationPos, vbar, zenith);

  // Docking scene in meters along V-bar.
  const rangeM = Math.max(sim.rangeKm * 1000, C.portOffsetKm * 1000);
  dockCraft.position.set(rangeM, 0, 0);
  setForwardXFromY(dockCraft);
  // setForwardXFromY sets rotation every call; the model +Y becomes +X, but we need probe toward -X (toward station).
  dockCraft.rotation.set(0, 0, Math.PI / 2);

  labelWorld = {
    jiuquan: earth.localToWorld(latLonToLocal(C.jiuquan.lat, C.jiuquan.lon, 1.02).clone()),
    chengdu: earth.localToWorld(latLonToLocal(C.chengdu.lat, C.chengdu.lon, 1.02).clone()),
    craft: craftPos.clone(),
    station: stationPos.clone()
  };
}

function projectLabel(el, world, camera) {
  if (!el || !world) return;
  const v = world.clone().project(camera);
  const visible = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
  if (!visible) {
    el.style.opacity = '0';
    return;
  }
  const w = $('scene').clientWidth;
  const h = $('scene').clientHeight;
  const x = (v.x * 0.5 + 0.5) * w;
  const y = (-v.y * 0.5 + 0.5) * h;
  el.style.opacity = '1';
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-120%)`;
}

function updateLabels(sim) {
  const dock = state.view === 'dock';
  $('label-jiuquan').style.display = dock ? 'none' : '';
  $('label-chengdu').style.display = dock ? 'none' : '';
  if (dock) {
    $('label-craft').textContent = '神舟二十四号';
    $('label-station').textContent = '天和前向端口';
    const port = new THREE.Vector3(8.5, 0, 0);
    const craft = dockCraft.position.clone();
    projectLabel($('label-craft'), craft, dockCam);
    projectLabel($('label-station'), port, dockCam);
  } else {
    $('label-craft').textContent = sim.t < C.insertSec ? '长征二号F / 神舟二十四号' : '神舟二十四号';
    $('label-station').textContent = '天宫空间站';
    projectLabel($('label-chengdu'), labelWorld.chengdu, globalCam);
    projectLabel($('label-craft'), labelWorld.craft, globalCam);
    projectLabel($('label-station'), labelWorld.station, globalCam);
    if (labelWorld.jiuquan && labelWorld.craft && sim.t < C.insertSec && labelWorld.jiuquan.distanceTo(labelWorld.craft) < 0.04) {
      $('label-jiuquan').style.opacity = '0';
    } else {
      projectLabel($('label-jiuquan'), labelWorld.jiuquan, globalCam);
    }
  }
}

function placePadCamera(sim, snap) {
  const pad = eciToThree(sim.jiuquan);
  const up = dir3(sim.jiuquan);
  const az = PLANE.az * Math.PI / 180;
  // Look from south-west of the pad, a few hundred km out and up, toward the northeast flight.
  const east = new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 1, 0)).normalize();
  if (east.lengthSq() < 0.1) east.set(1, 0, 0);
  const north = new THREE.Vector3().crossVectors(east, up).normalize();
  // Our ENU in three-space is approximate; offset by a camera boom.
  const back = east.clone().multiplyScalar(-0.048).add(north.multiplyScalar(-0.03)).add(up.multiplyScalar(0.02));
  const pos = pad.clone().add(back);
  setCamera(pos, pad, snap);
}

function setCamera(position, target, snap) {
  const cam = state.view === 'dock' ? dockCam : globalCam;
  if (snap) {
    cam.position.copy(position);
    controls.target.copy(target);
  } else {
    cam.position.lerp(position, 0.08);
    controls.target.lerp(target, 0.08);
  }
  controls.update();
}

function applyCamera(sim, snap = false) {
  if (state.view === 'dock') {
    const rangeM = Math.max(sim.rangeKm * 1000, C.portOffsetKm * 1000);
    const portX = 8.5;
    const mid = new THREE.Vector3((rangeM + portX) * 0.5, 0, 0);
    const span = Math.max(24, Math.abs(rangeM - portX));
    const fov = dockCam.fov * Math.PI / 180;
    const fit = (span * 0.58) / Math.tan(Math.max(0.2, fov * 0.5));
    const dist = Math.max(32, Math.min(1200, fit * 1.4));
    const pos = new THREE.Vector3(mid.x - dist * 0.18, dist * 0.34, dist * 0.82);
    setCamera(pos, mid, snap);
    return;
  }
  const craft = eciToThree(sim.craft.pos);
  if (state.view === 'pad') {
    if (sim.t < 45) placePadCamera(sim, snap);
    else {
      const up = dir3(sim.craft.pos).multiplyScalar(0.02);
      const back = dir3(sim.craft.vel).multiplyScalar(-0.06);
      const side = dir3(PLANE.N).multiplyScalar(0.035);
      setCamera(craft.clone().add(back).add(side).add(up), craft, snap);
    }
  } else if (state.view === 'follow') {
    const back = dir3(sim.craft.vel).multiplyScalar(-0.05);
    const side = dir3(PLANE.N).multiplyScalar(0.028);
    const up = dir3(sim.craft.pos).multiplyScalar(0.018);
    setCamera(craft.clone().add(back).add(side).add(up), craft, snap);
  } else {
    const radial = craft.clone().normalize();
    const n = dir3(PLANE.N);
    const pos = n.multiplyScalar(2.2).add(radial.multiplyScalar(1.7)).add(new THREE.Vector3(0, 0.55, 0));
    if (pos.length() < 0.2) pos.set(2.2, 2.0, 1.4);
    pos.setLength(3.15);
    setCamera(pos, new THREE.Vector3(0, 0, 0), snap);
  }
}

function setView(view, {fromUser = true} = {}) {
  state.view = view;
  if (fromUser) state.userOrbit = false;
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.view === view ? 'true' : 'false');
  });
  const cam = view === 'dock' ? dockCam : globalCam;
  controls.object = cam;
  controls.minDistance = view === 'dock' ? 12 : 1.15;
  controls.maxDistance = view === 'dock' ? 600 : 12;
  controls.enablePan = view === 'dock';
  const sim = stateAt(state.t);
  applyCamera(sim, true);
  updateLabels(sim);
}

function onUserOrbit() {
  state.userOrbit = true;
  document.querySelectorAll('[data-view]').forEach(btn => {
    if (btn.dataset.view !== state.view) btn.setAttribute('aria-pressed', 'false');
  });
}

function resize() {
  if (!renderer) return;
  const host = $('scene');
  const w = host.clientWidth || 1;
  const h = host.clientHeight || 1;
  renderer.setSize(w, h, false);
  for (const cam of [globalCam, dockCam]) {
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  }
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function bindUi() {
  buildEventList();
  $('playBtn').addEventListener('click', () => {
    state.playing = !state.playing;
    state.lastTs = 0;
    if (state.t >= T_END && state.playing) state.t = 0;
    updateHud(stateAt(state.t));
  });
  $('nowBtn').addEventListener('click', () => {
    const now = nowSimulationTime();
    if (now < 0) {
      setTime(0, {pause: true});
      $('eventDetail').innerHTML = `<p>现在还没到 08:18 点火时刻。已回到待发状态。按北京时间还差 ${formatT(-now).replace('T+','')}。</p>`;
      return;
    }
    if (now > T_END) {
      setTime(T_END, {pause: true});
      $('eventDetail').innerHTML = `<p>已过本页示意的锁紧时刻（11:50）。画面停在对接完成状态；真实对接是否已经宣布，请以飞控中心和官方报道为准。</p>`;
      return;
    }
    setTime(now);
    if (now >= 11700) setView('dock', {fromUser: false});
    else if (now >= C.insertSec) setView('follow', {fromUser: false});
  });
  $('speedSelect').addEventListener('change', e => { state.speed = e.target.value; });
  $('scrub').addEventListener('input', e => {
    state.playing = false;
    setTime(Number(e.target.value));
  });
  document.querySelectorAll('[data-phase]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = Number(btn.dataset.phase);
      setTime(t);
      if (t >= 11700) setView('dock');
      else if (t >= C.insertSec) setView('follow');
      else setView('pad');
    });
  });
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  window.addEventListener('keydown', e => {
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      $('playBtn').click();
    } else if (e.code === 'ArrowRight') {
      setTime(state.t + (e.shiftKey ? 60 : 5), {pause: true});
    } else if (e.code === 'ArrowLeft') {
      setTime(state.t - (e.shiftKey ? 60 : 5), {pause: true});
    }
  });
}

function initScenes() {
  globalScene = new THREE.Scene();
  globalScene.background = new THREE.Color('#070d18');
  dockScene = new THREE.Scene();
  dockScene.background = new THREE.Color('#070b14');

  globalCam = new THREE.PerspectiveCamera(42, 1, 0.01, 80);
  dockCam = new THREE.PerspectiveCamera(50, 1, 0.5, 4000);

  renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('scene').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '神舟二十四号发射与对接三维画面；单指旋转，双指缩放。');
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    $('fallback').hidden = false;
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    $('fallback').hidden = true;
  });

  controls = new OrbitControls(globalCam, renderer.domElement);
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.15;
  controls.maxDistance = 12;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
  controls.addEventListener('start', onUserOrbit);

  earth = createEarth(geojson);
  globalScene.add(earth);
  stars = createStarfield();
  globalScene.add(stars);

  const jq = markerPin(0xe7b76d, 0.035);
  jq.position.copy(latLonToLocal(C.jiuquan.lat, C.jiuquan.lon, 1.002));
  const upJ = jq.position.clone().normalize();
  jq.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upJ);
  earth.add(jq);
  const cd = markerPin(0x7eb6ff, 0.028);
  cd.position.copy(latLonToLocal(C.chengdu.lat, C.chengdu.lon, 1.002));
  cd.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cd.position.clone().normalize());
  earth.add(cd);

  earth.add(lineFromLatLon(groundTrack('station', 30), 0xf0d48a, 1.007, 0.7));
  earth.add(lineFromLatLon(groundTrack('craft', 25), 0x63ead9, 1.009, 0.85));

  globalScene.add(lineFromEci(orbitRing(), 0xf0d48a, 0.55));
  globalScene.add(lineFromEci(ascentPolyline(), 0xe7b76d, 0.95));
  globalScene.add(lineFromEci(rendezvousPolyline(), 0x63ead9, 0.7));

  rocket = createRocket();
  freeCraft = createShenzhou({colorHint: 0x2e6d9c});
  stationGlobal = createTiangong();
  globalScene.add(rocket, freeCraft, stationGlobal);

  globalScene.add(new THREE.AmbientLight(0x8fb0d0, 0.34));
  sunLight = new THREE.DirectionalLight(0xfff4e0, 2.35);
  sunLight.position.set(10, 4, 2);
  globalScene.add(sunLight);
  fillLight = new THREE.DirectionalLight(0x6a8bb8, 0.58);
  globalScene.add(fillLight);

  dockStars = createStarfield(1200, 800);
  dockScene.add(dockStars);
  dockStation = createTiangong();
  dockCraft = createShenzhou({colorHint: 0x2e6d9c});
  dockScene.add(dockStation, dockCraft);
  dockEarth = new THREE.Mesh(
    new THREE.SphereGeometry(90, 48, 32),
    new THREE.MeshStandardMaterial({color: 0x1a4a7a, roughness: 1, metalness: 0})
  );
  if (earth?.children[0]?.material?.map) {
    dockEarth.material.map = earth.children[0].material.map;
    dockEarth.material.needsUpdate = true;
  }
  dockEarth.position.set(0, -118, 0);
  dockScene.add(dockEarth);
  dockScene.add(new THREE.AmbientLight(0x99aacc, 0.35));
  dockLight = new THREE.DirectionalLight(0xfff2d8, 2.0);
  dockLight.position.set(-40, 60, 80);
  dockScene.add(dockLight);
  const rim = new THREE.DirectionalLight(0x88b4ff, 0.5);
  rim.position.set(50, -20, -40);
  dockScene.add(rim);
}

function tick(ts) {
  requestAnimationFrame(tick);
  if (!state.ready) return;
  if (state.playing) {
    const dt = state.lastTs ? Math.min(0.1, (ts - state.lastTs) / 1000) : 0;
    state.lastTs = ts;
    state.t = Math.min(T_END, state.t + dt * currentRate());
    if (state.t >= T_END) state.playing = false;
    const sim = stateAt(state.t);
    applySimulation(sim);
    updateHud(sim);
    if (!state.userOrbit) applyCamera(sim, false);
    else controls.update();
    updateLabels(sim);
  } else {
    state.lastTs = 0;
    controls.update();
    updateLabels(stateAt(state.t));
  }
  const activeScene = state.view === 'dock' ? dockScene : globalScene;
  const activeCam = state.view === 'dock' ? dockCam : globalCam;
  renderer.render(activeScene, activeCam);
}

async function main() {
  bindUi();
  if (!webglOk()) {
    $('fallback').hidden = false;
    setTime(0);
    return;
  }
  try {
    const res = await fetch(new URL('./vendor/ne_110m_land.geojson', import.meta.url));
    geojson = await res.json();
  } catch (err) {
    console.warn('陆地轮廓加载失败，改用素地球', err);
    geojson = {type: 'FeatureCollection', features: []};
  }
  initScenes();
  resize();
  window.addEventListener('resize', resize);
  state.ready = true;
  setTime(0);
  setView('pad', {fromUser: false});
  requestAnimationFrame(tick);
}

main().catch(err => {
  console.error(err);
  $('fallback').hidden = false;
  setTime(0);
});
