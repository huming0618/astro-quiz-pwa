import assert from 'node:assert/strict';
import {
  C, PLANE, INSERT, STATION_PERIOD_SEC, T_END, EVENTS, EVENT_SOURCE,
  stateAt, gmstRad, sunEci, eciOfLatLon, eciToGeodetic, beijingClock, formatT,
  nowSimulationTime, inclinationOf, planeNormalFrom, clampTime, sourceLabel,
  orbitRing, eventAt
} from '../mission.mjs';

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b} ±${eps}`);

// Official launch clock.
assert.equal(C.launchUtcMs, Date.UTC(2026, 10, 25, 0, 18, 0));
assert.equal(beijingClock(0), '2026-11-25 08:18:00');
assert.equal(beijingClock(C.contactSec), '2026-11-25 11:48:00');
assert.equal(beijingClock(C.latchSec), '2026-11-25 11:50:00');
assert.equal(formatT(120), 'T+2:00');
assert.equal(formatT(585), 'T+9:45');
assert.equal(formatT(12600), 'T+3:30:00');
assert.equal(clampTime(-5), 0);
assert.equal(clampTime(999999), T_END);

// Coordinates.
near(C.jiuquan.lat, 40.958, 1e-6);
near(C.jiuquan.lon, 100.291, 1e-6);
near(C.chengdu.lat, 30.67, 1e-6);
assert.equal(C.stationAltKm, 400);
near(C.stationInclinationDeg, 41.5, 1e-9);

// Events tagged by source; official facts are not mixed into typical seconds.
const byId = Object.fromEntries(EVENTS.map(e => [e.id, e]));
assert.equal(byId.liftoff.t, 0);
assert.equal(byId.liftoff.source, EVENT_SOURCE.official);
assert.equal(byId.tower.t, 120);
assert.equal(byId.boosters.t, 152);
assert.equal(byId.stage.t, 156);
assert.equal(byId.fairing.t, 210);
assert.equal(byId.insert.t, 585);
assert.equal(byId.tower.source, EVENT_SOURCE.typical);
assert.equal(byId.far.source, EVENT_SOURCE.schematic);
assert.equal(byId.contact.source, EVENT_SOURCE.schematic);
assert.equal(sourceLabel(EVENT_SOURCE.official), '官方公布');
assert.match(byId.tower.detail, /通常/);
assert.match(byId.insert.detail, /示意/);
assert.doesNotMatch(EVENTS.filter(e => e.source === EVENT_SOURCE.official).map(e => e.title).join(), /逃逸塔|助推器/);

// Do not hard-code Tiangong-2's 393 km as the current station altitude.
assert.notEqual(C.stationAltKm, 393);

// Station period is LEO-like (~92 min) at 400 km.
near(STATION_PERIOD_SEC / 60, 92.4, 1.5);

// At T=0 the vehicle is at Jiuquan.
const s0 = stateAt(0);
near(s0.craft.lat, C.jiuquan.lat, 0.03);
near(s0.craft.lon, C.jiuquan.lon, 0.03);
near(s0.craft.altKm, C.jiuquan.altKm, 0.2);
assert.equal(s0.craft.config.tower, true);
assert.equal(s0.docked, false);

// Inverse geodetic of the pad.
const pad = eciOfLatLon(C.jiuquan.lat, C.jiuquan.lon, C.jiuquan.altKm, C.launchUtcMs);
const geo = eciToGeodetic(pad, C.launchUtcMs);
near(geo.lat, C.jiuquan.lat, 1e-6);
near(geo.lon, C.jiuquan.lon, 1e-6);

// Launch heading is east-northeast into a 41.5° plane, not a 45° "northeast" cartoon.
near(PLANE.az, 80, 8);
assert.ok(PLANE.az > 60 && PLANE.az < 90, `azimuth ${PLANE.az} should be ENE`);
near(inclinationOf(PLANE.N), C.stationInclinationDeg, 0.05);

// Typical ascent altitude and configuration changes.
const s120 = stateAt(120);
near(s120.craft.altKm, 39, 2);
assert.equal(s120.craft.config.tower, false);
assert.equal(s120.craft.config.boosters, true);
assert.equal(stateAt(151.9).craft.config.boosters, true);
assert.equal(stateAt(152).craft.config.boosters, false);
assert.equal(stateAt(156).craft.config.stage1, false);
assert.equal(stateAt(209).craft.config.fairing, true);
assert.equal(stateAt(210).craft.config.fairing, false);
assert.equal(stateAt(584).craft.config.stage2, true);
assert.equal(stateAt(585).craft.config.stage2, false);

// Insertion: about 200 km, near-orbital speed, in the station plane.
const ins = stateAt(C.insertSec);
near(ins.craft.altKm, 200, 8);
assert.ok(ins.craft.speedKmS > 7.3 && ins.craft.speedKmS < 8.1, `insert speed ${ins.craft.speedKmS}`);
near(inclinationOf(planeNormalFrom(ins.craft.pos, ins.craft.vel)), C.stationInclinationDeg, 1.5);
near(inclinationOf(planeNormalFrom(ins.station.pos, ins.station.vel)), C.stationInclinationDeg, 0.2);
// Still behind the station at insertion (catch-up geometry).
assert.ok(ins.rangeKm > 1000 && ins.rangeKm < 4000, `insert range ${ins.rangeKm}`);

// After insertion the vehicle stays roughly in plane (cross-track small vs range).
const mid = stateAt(6000);
const n = PLANE.N;
const xt = Math.abs(n.x * mid.craft.pos.x + n.y * mid.craft.pos.y + n.z * mid.craft.pos.z);
assert.ok(xt < 30, `cross-track ${xt} km`);

// Docking: nearly coincident, at ~400 km, latch at 11:50 schematic.
const contact = stateAt(C.contactSec);
const latch = stateAt(C.latchSec);
assert.ok(contact.rangeKm < 0.05, `contact range ${contact.rangeKm}`);
assert.ok(latch.rangeKm < 0.05, `latch range ${latch.rangeKm}`);
near(latch.station.altKm, 400, 1e-6);
near(latch.craft.altKm, 400, 0.05);
assert.equal(latch.docked, true);
assert.equal(contact.contacted, true);
assert.equal(eventAt(C.latchSec).id, 'latch');

// Dawn check: Jiuquan at 08:18 is near the terminator (geometric sunrise).
const sun = sunEci(C.launchUtcMs);
const sunEl = Math.asin((sun.x * pad.x + sun.y * pad.y + sun.z * pad.z) / Math.hypot(pad.x, pad.y, pad.z)) * 180 / Math.PI;
assert.ok(sunEl > -5 && sunEl < 8, `Jiuquan sun elevation ${sunEl}° should be near sunrise`);

// Chengdu is east-south of Jiuquan, already a bit more sunlit.
const cd = eciOfLatLon(C.chengdu.lat, C.chengdu.lon, C.chengdu.altKm, C.launchUtcMs);
const cdEl = Math.asin((sun.x * cd.x + sun.y * cd.y + sun.z * cd.z) / Math.hypot(cd.x, cd.y, cd.z)) * 180 / Math.PI;
assert.ok(cdEl > sunEl, `Chengdu elevation ${cdEl} should exceed Jiuquan ${sunEl}`);

// GMST is a finite angle; orbit ring closed.
assert.ok(gmstRad(C.launchUtcMs) >= 0 && gmstRad(C.launchUtcMs) < 2 * Math.PI);
const ring = orbitRing(32);
assert.equal(ring.length, 33);
near(ring[0].x, ring[32].x, 1e-6);

// "Now" helper is just a time mapping.
near(nowSimulationTime(C.launchUtcMs + 120000), 120, 1e-6);

console.log('PASS mission model', {
  az: PLANE.az.toFixed(2),
  periodMin: (STATION_PERIOD_SEC / 60).toFixed(2),
  insertAlt: ins.craft.altKm.toFixed(1),
  insertSpeed: ins.craft.speedKmS.toFixed(3),
  insertRange: ins.rangeKm.toFixed(0),
  contactRangeM: (contact.rangeKm * 1000).toFixed(1),
  jiuquanSunEl: sunEl.toFixed(2),
  chengduSunEl: cdEl.toFixed(2)
});
