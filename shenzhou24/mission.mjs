// Mission timeline and schematic trajectory for Shenzhou-24.
// Official facts, typical CZ-2F times, and teaching approximations are tagged on each event.

export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;
export const C = Object.freeze({
  // Spherical Earth, mean radius. Not a WGS-84 ellipsoid.
  earthRadiusKm: 6371,
  muKm3s2: 398600.4418,
  omegaEarth: 7.2921159e-5,
  // Jiuquan Satellite Launch Center Pad 91. Approximate pad elevation.
  jiuquan: Object.freeze({lat: 40.958, lon: 100.291, altKm: 1.1, name: '酒泉 91 号工位'}),
  chengdu: Object.freeze({lat: 30.67, lon: 104.066, altKm: 0.5, name: '成都'}),
  // Order-of-magnitude station orbit, not a measured two-line element.
  stationInclinationDeg: 41.5,
  stationAltKm: 400,
  // Launch: 2026-11-25 08:18 Beijing (UTC+8) = 00:18 UTC.
  launchUtcMs: Date.UTC(2026, 10, 25, 0, 18, 0),
  // 3.5-hour autonomous rendezvous. Contact and latch times are schematic.
  contactSec: 12600, // 11:48 CST, exactly 3.5 h
  latchSec: 12720,   // 11:50 CST
  insertSec: 585,
  // Schematic insertion and rendezvous geometry.
  insertAltKm: 200,
  insertPhaseDeg: 18, // station is this many degrees ahead at insertion
  portOffsetKm: 0.016
});

export const T_END = C.latchSec;

const A_STATION = C.earthRadiusKm + C.stationAltKm;
export const STATION_PERIOD_SEC = 2 * Math.PI * Math.sqrt((A_STATION ** 3) / C.muKm3s2);
export const STATION_N = Math.sqrt(C.muKm3s2 / (A_STATION ** 3));

export function julianDate(ms) {
  return ms / 86400000 + 2440587.5;
}

export function gmstRad(ms) {
  const d = julianDate(ms) - 2451545.0;
  let deg = 280.46061837 + 360.98564736629 * d;
  deg = ((deg % 360) + 360) % 360;
  return deg * D2R;
}

export function sunEci(ms) {
  const d = julianDate(ms) - 2451545.0;
  const L = 280.460 + 0.9856474 * d;
  const g = (357.528 + 0.9856003 * d) * D2R;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * D2R;
  const eps = (23.439 - 0.0000004 * d) * D2R;
  return unit({
    x: Math.cos(lambda),
    y: Math.cos(eps) * Math.sin(lambda),
    z: Math.sin(eps) * Math.sin(lambda)
  });
}

export function vec(x, y, z) { return {x, y, z}; }
export function add(a, b) { return vec(a.x + b.x, a.y + b.y, a.z + b.z); }
export function sub(a, b) { return vec(a.x - b.x, a.y - b.y, a.z - b.z); }
export function smul(a, s) { return vec(a.x * s, a.y * s, a.z * s); }
export function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross(a, b) {
  return vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
export function norm(a) { return Math.hypot(a.x, a.y, a.z); }
export function unit(a) {
  const n = norm(a);
  return n > 0 ? smul(a, 1 / n) : vec(0, 0, 0);
}

export function eciOfLatLon(latDeg, lonDeg, altKm, unixMs) {
  const r = C.earthRadiusKm + altKm;
  const lat = latDeg * D2R;
  const theta = gmstRad(unixMs) + lonDeg * D2R;
  const cl = Math.cos(lat);
  return vec(r * cl * Math.cos(theta), r * cl * Math.sin(theta), r * Math.sin(lat));
}

export function ecefOfLatLon(latDeg, lonDeg, altKm = 0) {
  const r = C.earthRadiusKm + altKm;
  const lat = latDeg * D2R;
  const lon = lonDeg * D2R;
  const cl = Math.cos(lat);
  return vec(r * cl * Math.cos(lon), r * cl * Math.sin(lon), r * Math.sin(lat));
}

export function eciToGeodetic(p, unixMs) {
  const gm = gmstRad(unixMs);
  const x = p.x * Math.cos(gm) + p.y * Math.sin(gm);
  const y = -p.x * Math.sin(gm) + p.y * Math.cos(gm);
  const z = p.z;
  const rxy = Math.hypot(x, y);
  return {
    lat: Math.atan2(z, rxy) * R2D,
    lon: ((Math.atan2(y, x) * R2D + 540) % 360) - 180,
    altKm: Math.hypot(x, y, z) - C.earthRadiusKm
  };
}

function enuBasis(r) {
  const up = unit(r);
  const east = unit(vec(-r.y, r.x, 0));
  const north = cross(up, east);
  return {up, east, north};
}

function azimuthDeg(east, north, dir) {
  const e = dot(dir, east);
  const n = dot(dir, north);
  return (Math.atan2(e, n) * R2D + 360) % 360;
}

function setupPlane() {
  const t0 = C.launchUtcMs;
  const r0 = eciOfLatLon(C.jiuquan.lat, C.jiuquan.lon, C.jiuquan.altKm, t0);
  const i = C.stationInclinationDeg * D2R;
  const theta = gmstRad(t0) + C.jiuquan.lon * D2R;
  const s = (-Math.cos(i) / Math.sin(i)) * Math.tan(C.jiuquan.lat * D2R);
  const sClamped = Math.min(1, Math.max(-1, s));
  const candidates = [Math.asin(sClamped), Math.PI - Math.asin(sClamped)];
  let best = null;
  for (const delta of candidates) {
    const Omega = theta + delta;
    const N = vec(Math.sin(i) * Math.sin(Omega), -Math.sin(i) * Math.cos(Omega), Math.cos(i));
    // In-plane horizontal heading, prograde (east/north-east).
    const {up, east, north} = enuBasis(r0);
    let dir = unit(cross(N, r0));
    if (dot(dir, up) < 0) dir = smul(dir, -1);
    // Remove vertical, get heading.
    const horiz = unit(sub(dir, smul(up, dot(dir, up))));
    const az = azimuthDeg(east, north, horiz);
    // Prefer the east-northeast opportunity (0–90° from north).
    if (!best || (az > 0 && az < 90 && (best.az < 0 || best.az >= 90 || Math.abs(az - 80) < Math.abs(best.az - 80)))) {
      best = {N: unit(N), Omega, az, r0, east, north, up, horiz};
    }
  }
  return best;
}

export const PLANE = setupPlane();

// Schematic ascent waypoints. Altitude at T+120 s (~39 km) is the publicly
// cited typical value; other altitudes and downrange distances are teaching fits.
const ASCENT = [
  {t: 0, h: C.jiuquan.altKm, s: 0},
  {t: 12, h: 2.2, s: 0.4},
  {t: 60, h: 14, s: 18},
  {t: 120, h: 39, s: 80},
  {t: 152, h: 58, s: 130},
  {t: 156, h: 61, s: 138},
  {t: 210, h: 112, s: 280},
  {t: 300, h: 150, s: 560},
  {t: 463, h: 185, s: 1200},
  {t: 585, h: C.insertAltKm, s: 1850}
];

function interpTable(table, t, key) {
  if (t <= table[0].t) return table[0][key];
  if (t >= table[table.length - 1].t) return table[table.length - 1][key];
  let i = 1;
  while (table[i].t < t) i++;
  const a = table[i - 1], b = table[i];
  const u = (t - a.t) / (b.t - a.t);
  const s = u * u * (3 - 2 * u);
  return a[key] + (b[key] - a[key]) * s;
}

function rotateAround(axis, angle, p) {
  const k = unit(axis);
  const c = Math.cos(angle), s = Math.sin(angle);
  // Rodrigues
  return add(add(smul(p, c), smul(cross(k, p), s)), smul(k, dot(k, p) * (1 - c)));
}

function insertionPose() {
  // Downrange along the launch-site inertial plane heading, but the pad meridian
  // rotates during ascent. Use the Earth-fixed azimuth great-circle, evaluated
  // at insertion time, then lift to insertion altitude — a schematic gravity turn.
  const t = C.insertSec;
  const ms = C.launchUtcMs + t * 1000;
  const pad = eciOfLatLon(C.jiuquan.lat, C.jiuquan.lon, 0, ms);
  const {up, east, north} = enuBasis(pad);
  const az = PLANE.az * D2R;
  const horiz = unit(add(smul(east, Math.sin(az)), smul(north, Math.cos(az))));
  const angle = interpTable(ASCENT, t, 's') / C.earthRadiusKm;
  const axis = cross(up, horiz);
  const surface = rotateAround(axis, angle, smul(up, C.earthRadiusKm));
  const pos = smul(unit(surface), C.earthRadiusKm + C.insertAltKm);
  // Horizontal in-plane prograde.
  const radial = unit(pos);
  let prograde = unit(cross(PLANE.N, pos));
  if (dot(prograde, horiz) < 0) prograde = smul(prograde, -1);
  // Insertion into a schematic 200 × 330 km ellipse (vis-viva at 200 km).
  const rp = C.earthRadiusKm + C.insertAltKm;
  const ra = C.earthRadiusKm + 330;
  const a = 0.5 * (rp + ra);
  const v = Math.sqrt(C.muKm3s2 * (2 / rp - 1 / a));
  const vel = smul(prograde, v);
  return {pos, vel, radial, prograde, a, rp, ra};
}

export const INSERT = insertionPose();

// Inertial speed along the schematic gravity turn. Insertion speed is vis-viva;
// earlier values are teaching approximations, not telemetry.
const ASCENT_SPEED = [
  {t: 0, v: 0.36},
  {t: 12, v: 0.50},
  {t: 60, v: 0.95},
  {t: 120, v: 1.55},
  {t: 152, v: 2.05},
  {t: 156, v: 2.15},
  {t: 210, v: 3.05},
  {t: 300, v: 4.60},
  {t: 463, v: 7.05},
  {t: 585, v: norm(INSERT.vel)}
];

function stationArgAtInsert() {
  // Argument of latitude of the insertion point, plus the catch-up phase lag.
  const r = INSERT.pos;
  const eq = unit(vec(PLANE.N.y, -PLANE.N.x, 0)); // toward ascending node? node vector = k × N
  const node = unit(cross(vec(0, 0, 1), PLANE.N));
  const arg = Math.atan2(dot(PLANE.N, cross(node, r)), dot(node, r));
  return arg + C.insertPhaseDeg * D2R;
}

const U_STATION_INSERT = stationArgAtInsert();
export const U_STATION_LAUNCH = U_STATION_INSERT - STATION_N * C.insertSec;

function stationState(t) {
  const u = U_STATION_LAUNCH + STATION_N * t;
  const node = unit(cross(vec(0, 0, 1), PLANE.N));
  const q = unit(cross(PLANE.N, node));
  const pos = add(smul(node, A_STATION * Math.cos(u)), smul(q, A_STATION * Math.sin(u)));
  const vel = smul(unit(cross(PLANE.N, pos)), Math.sqrt(C.muKm3s2 / A_STATION));
  return {pos, vel, u, radius: A_STATION, altKm: C.stationAltKm};
}

function ascentPosition(t) {
  const ms = C.launchUtcMs + t * 1000;
  const pad = eciOfLatLon(C.jiuquan.lat, C.jiuquan.lon, 0, ms);
  const {up, east, north} = enuBasis(pad);
  const az = PLANE.az * D2R;
  const horiz = unit(add(smul(east, Math.sin(az)), smul(north, Math.cos(az))));
  const angle = interpTable(ASCENT, Math.max(0, t), 's') / C.earthRadiusKm;
  const h = interpTable(ASCENT, Math.max(0, t), 'h');
  const surface = rotateAround(cross(up, horiz), angle, smul(up, C.earthRadiusKm));
  return smul(unit(surface), C.earthRadiusKm + h);
}

// Close-range LVLH keyframes after insertion. x>0 is ahead (V-bar), z>0 is toward Earth (nadir).
// This is a teaching fly-around to the forward port, not an official burn timeline.
const LVLH = [
  {t: C.insertSec, x: -arcKm(C.insertPhaseDeg), z: C.stationAltKm - C.insertAltKm},
  {t: 2400, x: -1400, z: 160},
  {t: 5400, x: -420, z: 85},
  {t: 8800, x: -40, z: 22},
  {t: 10200, x: -6, z: 8},
  {t: 10800, x: 0, z: 5},       // schematic R-bar hold
  {t: 11400, x: 1.2, z: 0.6},   // fly-around toward +V-bar
  {t: 11700, x: 0.40, z: 0},
  {t: 12000, x: 0.20, z: 0},
  {t: 12300, x: 0.040, z: 0},
  {t: C.contactSec, x: C.portOffsetKm, z: 0},
  {t: C.latchSec, x: C.portOffsetKm - 0.002, z: 0}
];

function arcKm(deg) {
  return A_STATION * deg * D2R;
}

function interpLvlh(t) {
  const x = interpTable(LVLH, t, 'x');
  const z = interpTable(LVLH, t, 'z');
  return {x, z, y: 0};
}

function craftFromLvlh(station, lvlh) {
  const vbar = unit(station.vel);
  const nadir = smul(unit(station.pos), -1);
  const pos = add(add(station.pos, smul(vbar, lvlh.x)), smul(nadir, lvlh.z));
  return pos;
}

function pathTangent(positionFn, t, tMin, tMax) {
  const dt = 0.5;
  const t0 = Math.max(tMin, Math.min(tMax, t) - dt);
  const t1 = Math.min(tMax, Math.max(tMin, t) + dt);
  if (t1 <= t0) return vec(0, 0, 0);
  return unit(sub(positionFn(t1), positionFn(t0)));
}

function ascentVelocity(t) {
  const speed = interpTable(ASCENT_SPEED, Math.max(0, Math.min(C.insertSec, t)), 'v');
  const tangent = pathTangent(ascentPosition, t, 0, C.insertSec);
  const dir = (tangent.x || tangent.y || tangent.z) ? tangent : INSERT.prograde;
  const u = Math.max(0, Math.min(1, (t - 500) / 85));
  const blended = unit(add(smul(dir, 1 - u), smul(INSERT.prograde, u)));
  return smul(blended, speed);
}

function finiteVel(positionFn, t) {
  const dt = 0.5;
  const t0 = Math.max(0, t - dt);
  const t1 = t + dt;
  return smul(sub(positionFn(t1), positionFn(t0)), 1 / (t1 - t0));
}

function rocketConfig(t) {
  return {
    tower: t < 120,
    boosters: t < 152,
    stage1: t < 156,
    fairing: t < 210,
    stage2: t < C.insertSec,
    spacecraft: true,
    plume: t >= 0 && t < C.insertSec
  };
}

export const EVENT_SOURCE = Object.freeze({
  official: 'official',
  typical: 'typical',
  schematic: 'schematic'
});

export const EVENTS = Object.freeze([
  {t: 0, id: 'liftoff', title: '点火起飞', clock: '08:18',
    detail: '长征二号F遥二十四火箭在酒泉卫星发射中心 91 号工位点火。新华社于北京时间 08:19 左右发布点火快讯。',
    source: EVENT_SOURCE.official, sourceNote: '官方发射时间；新华社点火快讯'},
  {t: 12, id: 'pitch', title: '程序转弯', clock: '08:18:12',
    detail: '起飞约 12 秒后开始程序转弯，转向入轨方位。此为同型火箭通常时序，不是本次正式公报的精确秒数。',
    source: EVENT_SOURCE.typical, sourceNote: '长二F通常时序（常武权 / 神舟十四号介绍）'},
  {t: 120, id: 'tower', title: '逃逸塔分离', clock: '08:20:00',
    detail: '通常约 T+120 秒抛逃逸塔，高度约 39 公里。正常飞行时由塔上分离发动机将塔抛离。此节点之后至抛整流罩前，如再遇故障改由整流罩上的高空逃逸发动机救生。',
    source: EVENT_SOURCE.typical, sourceNote: '长二F通常时序；39 公里为公开典型高度'},
  {t: 152, id: 'boosters', title: '助推器分离', clock: '08:20:32',
    detail: '通常约 T+152 秒，四个助推器分离。同型火箭通常时序，不是本次精确秒数。',
    source: EVENT_SOURCE.typical, sourceNote: '长二F通常时序（常武权：152 秒抛 4 个助推器）'},
  {t: 156, id: 'stage', title: '一、二级分离', clock: '08:20:36',
    detail: '通常约 T+156 秒一、二级分离，随后由二级继续加速。同型火箭通常时序。',
    source: EVENT_SOURCE.typical, sourceNote: '长二F通常时序（常武权：156 秒）'},
  {t: 210, id: 'fairing', title: '抛整流罩', clock: '08:21:30',
    detail: '通常约 T+210 秒抛整流罩，高度大约在 110 公里量级。大气层已足够稀薄，飞船不再需要整流罩保护。',
    source: EVENT_SOURCE.typical, sourceNote: '长二F通常时序；高度为典型量级，非本次实测'},
  {t: 585, id: 'insert', title: '船箭分离、入轨', clock: '08:27:45',
    detail: '通常约 T+585 秒船箭分离，飞船进入初始轨道。入轨高度、速度在本页为示意值（约 200 公里量级），以飞控中心为准。',
    source: EVENT_SOURCE.typical, sourceNote: '分离时刻为通常时序；入轨轨道为教学示意'},
  {t: 2400, id: 'far', title: '远距离导引（示意）', clock: '08:58',
    detail: '入轨后飞船在较低的过渡轨道上逐步追近空间站。3.5 小时快速交会的具体脉冲与圈次未见到官方弹道，这里用多圈过渡示意。',
    source: EVENT_SOURCE.schematic, sourceNote: '教学示意，非官方弹道'},
  {t: 8800, id: 'near', title: '近距离导引（示意）', clock: '10:44:40',
    detail: '进入几十公里到数公里的近距离段，逐步降低相对速度。路径为示意。',
    source: EVENT_SOURCE.schematic, sourceNote: '教学示意'},
  {t: 10800, id: 'rbar', title: '径向停泊并绕飞（示意）', clock: '11:18',
    detail: '示意从下方径向靠近，再绕飞到天和核心舱前向（速度方向）一侧，准备沿前向端口对接近。',
    source: EVENT_SOURCE.schematic, sourceNote: '绕飞路径为教学示意'},
  {t: 11700, id: 'vbar', title: '前向最终逼近（示意）', clock: '11:33',
    detail: '沿前向（+V-bar）逐步靠近天和核心舱前向端口，距离从数百米收到接触。相对运动为示意。',
    source: EVENT_SOURCE.schematic, sourceNote: '教学示意'},
  {t: C.contactSec, id: 'contact', title: '接触捕获（预计）', clock: '11:48',
    detail: '按 3.5 小时策略，接触约在发射后 3.5 小时（11:48）前后。官方此前称对接约 11:50 前后，精确时刻以北京航天飞行控制中心为准。',
    source: EVENT_SOURCE.schematic, sourceNote: '按 3.5 小时策略推算，不是飞控宣布的接触秒数'},
  {t: C.latchSec, id: 'latch', title: '拉拢锁紧（示意）', clock: '11:50',
    detail: '接触后还要捕获、拉拢并锁紧，形成三船三舱组合体。本页将锁紧示意在 11:50。发射前公布的组合体状态是天舟十号在后向、神舟二十三号在径向、神舟二十四号停靠前向。',
    source: EVENT_SOURCE.schematic, sourceNote: '拉拢锁紧时序为示意；组合体构型取发射前公布'}
]);

export const PHASES = Object.freeze([
  {id: 'pad', title: '待发', t0: 0, t1: 0, hint: '酒泉 91 号工位'},
  {id: 'ascent', title: '上升段', t0: 0, t1: C.insertSec, hint: '通常时序'},
  {id: 'phasing', title: '轨道过渡', t0: C.insertSec, t1: 10800, hint: '示意追近'},
  {id: 'proximity', title: '近距离交会', t0: 10800, t1: C.contactSec, hint: '示意绕飞'},
  {id: 'dock', title: '对接锁紧', t0: C.contactSec, t1: T_END, hint: '预计约 11:50'}
]);

export function sourceLabel(source) {
  if (source === EVENT_SOURCE.official) return '官方公布';
  if (source === EVENT_SOURCE.typical) return '同型通常时序';
  return '教学示意';
}

export function clampTime(t) {
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(T_END, t));
}

export function beijingClock(t) {
  const ms = C.launchUtcMs + clampTime(t) * 1000;
  const d = new Date(ms + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function formatT(t) {
  const s = Math.floor(clampTime(t));
  const sign = '+';
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `T${sign}${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `T${sign}${mm}:${String(ss).padStart(2, '0')}`;
}

export function eventAt(t) {
  let current = EVENTS[0];
  for (const ev of EVENTS) {
    if (t + 1e-6 >= ev.t) current = ev;
  }
  return current;
}

export function phaseAt(t) {
  let current = PHASES[0];
  for (const ph of PHASES) {
    if (t + 1e-6 >= ph.t0) current = ph;
  }
  return current;
}

function craftPosition(t) {
  if (t <= C.insertSec) return ascentPosition(t);
  const st = stationState(t);
  return craftFromLvlh(st, interpLvlh(t));
}

export function attitudeBasis(t) {
  const st = stationState(Math.max(t, C.insertSec));
  if (t < C.insertSec) {
    const pos = ascentPosition(t);
    const vel = finiteVel(ascentPosition, t);
    const axis = unit(vel.x || vel.y || vel.z ? vel : sub(INSERT.pos, pos));
    const nadir = smul(unit(pos), -1);
    return {forward: axis, nadir, pos};
  }
  return {forward: unit(st.vel), nadir: smul(unit(st.pos), -1), pos: craftPosition(t)};
}

export function stateAt(tRaw) {
  const t = clampTime(tRaw);
  const ms = C.launchUtcMs + t * 1000;
  const station = stationState(t);
  const pos = craftPosition(t);
  const vel = t <= C.insertSec ? ascentVelocity(t) : finiteVel(craftPosition, t);
  const geo = eciToGeodetic(pos, ms);
  const range = sub(pos, station.pos);
  const rangeKm = norm(range);
  const closing = -dot(range, sub(vel, station.vel)) / Math.max(rangeKm, 1e-6);
  const ev = eventAt(t);
  const ph = phaseAt(t);
  const jiuquan = eciOfLatLon(C.jiuquan.lat, C.jiuquan.lon, C.jiuquan.altKm, ms);
  const chengdu = eciOfLatLon(C.chengdu.lat, C.chengdu.lon, C.chengdu.altKm, ms);
  const sun = sunEci(ms);
  return {
    t,
    ms,
    beijing: beijingClock(t),
    tLabel: formatT(t),
    event: ev,
    phase: ph,
    craft: {
      pos, vel,
      altKm: geo.altKm,
      lat: geo.lat,
      lon: geo.lon,
      speedKmS: norm(vel),
      config: rocketConfig(t)
    },
    station: {
      pos: station.pos,
      vel: station.vel,
      altKm: station.altKm,
      u: station.u
    },
    rangeKm,
    closingKmS: closing,
    jiuquan,
    chengdu,
    sun,
    gmst: gmstRad(ms),
    docked: t >= C.latchSec,
    contacted: t >= C.contactSec,
    schematic: t >= C.insertSec || ev.source !== EVENT_SOURCE.official
  };
}

export function groundTrack(kind, stepSec = 20) {
  const points = [];
  if (kind === 'station') {
    const period = STATION_PERIOD_SEC;
    for (let t = 0; t <= period + 1; t += stepSec) {
      const st = stationState(t);
      points.push(eciToGeodetic(st.pos, C.launchUtcMs + t * 1000));
    }
  } else {
    for (let t = 0; t <= T_END; t += (t < C.insertSec ? 5 : stepSec)) {
      const p = craftPosition(t);
      points.push(eciToGeodetic(p, C.launchUtcMs + t * 1000));
    }
  }
  return points;
}

export function orbitRing(samples = 256) {
  const node = unit(cross(vec(0, 0, 1), PLANE.N));
  const q = unit(cross(PLANE.N, node));
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const u = (i / samples) * Math.PI * 2;
    pts.push(add(smul(node, A_STATION * Math.cos(u)), smul(q, A_STATION * Math.sin(u))));
  }
  return pts;
}

export function ascentPolyline(step = 2) {
  const pts = [];
  for (let t = 0; t <= C.insertSec; t += step) pts.push(ascentPosition(t));
  pts.push(ascentPosition(C.insertSec));
  return pts;
}

export function rendezvousPolyline(step = 15) {
  const pts = [];
  for (let t = C.insertSec; t <= T_END; t += step) pts.push(craftPosition(t));
  pts.push(craftPosition(T_END));
  return pts;
}

export function nowSimulationTime(nowMs = Date.now()) {
  return (nowMs - C.launchUtcMs) / 1000;
}

export function inclinationOf(normal) {
  return Math.acos(Math.min(1, Math.max(-1, normal.z / norm(normal)))) * R2D;
}

export function planeNormalFrom(pos, vel) {
  return unit(cross(pos, vel));
}
