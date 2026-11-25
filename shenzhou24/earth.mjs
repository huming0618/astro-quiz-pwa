import * as THREE from './vendor/three.module.min.js';
import {C} from './mission.mjs';

const SCALE = 1 / C.earthRadiusKm;

export function eciToThree(p, extraScale = 1) {
  return new THREE.Vector3(p.x * SCALE * extraScale, p.z * SCALE * extraScale, -p.y * SCALE * extraScale);
}

export function ecefToThree(p, radius = 1) {
  const n = Math.hypot(p.x, p.y, p.z) || 1;
  const s = radius / n;
  // ECEF (X Greenwich, Z north) -> Three.js Y-up, matching SphereGeometry UVs.
  return new THREE.Vector3(p.x * s, p.z * s, -p.y * s);
}

export function latLonToLocal(lat, lon, radius = 1.004) {
  const phi = lat * Math.PI / 180;
  const theta = (lon + 180) * Math.PI / 180;
  const cl = Math.cos(phi);
  return new THREE.Vector3(
    -radius * cl * Math.cos(theta),
    radius * Math.sin(phi),
    radius * cl * Math.sin(theta)
  );
}

function lonLatToUV(lon, lat, w, h) {
  const x = ((lon + 180) / 360) * w;
  const y = ((90 - lat) / 180) * h;
  return [x, y];
}

function drawRing(ctx, ring, w, h) {
  let started = false;
  let prev = null;
  for (const [lon, lat] of ring) {
    const p = lonLatToUV(lon, lat, w, h);
    if (!started) {
      ctx.moveTo(p[0], p[1]);
      started = true;
    } else if (prev && Math.abs(p[0] - prev[0]) > w * 0.5) {
      ctx.moveTo(p[0], p[1]);
    } else {
      ctx.lineTo(p[0], p[1]);
    }
    prev = p;
  }
}

export function makeEarthTexture(geojson, width = 2048, height = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#0b1c33');
  ocean.addColorStop(0.5, '#0e2a4a');
  ocean.addColorStop(1, '#0b1c33');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(90,140,180,0.12)';
  ctx.lineWidth = 1;
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const x = ((lon + 180) / 360) * width;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }

  ctx.fillStyle = '#3d6a52';
  ctx.strokeStyle = 'rgba(180,220,190,0.25)';
  ctx.lineWidth = 0.6;
  for (const feature of geojson.features) {
    const geom = feature.geometry;
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const polygon of polys) {
      ctx.beginPath();
      for (const ring of polygon) drawRing(ctx, ring, width, height);
      ctx.closePath();
      ctx.fill('evenodd');
      ctx.stroke();
    }
  }

  // A slightly warmer wash over East Asia so China is easier to find, not a border.
  const [cx, cy] = lonLatToUV(104, 35, width, height);
  const wash = ctx.createRadialGradient(cx, cy, 8, cx, cy, width * 0.12);
  wash.addColorStop(0, 'rgba(190,170,90,0.18)');
  wash.addColorStop(1, 'rgba(190,170,90,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function makeBumpHint(width = 1024, height = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 18;
    const v = 128 + n;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createEarth(geojson) {
  const group = new THREE.Group();
  group.name = 'Earth';
  const map = makeEarthTexture(geojson);
  const mat = new THREE.MeshStandardMaterial({
    map,
    roughness: 0.92,
    metalness: 0.04,
    color: 0xffffff
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat);
  globe.name = 'globe';
  group.add(globe);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.028, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0x4c91dc,
      transparent: true,
      opacity: 0.11,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  group.add(atmo);

  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(1.006, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0xcfe7ff,
      transparent: true,
      opacity: 0.05,
      depthWrite: false
    })
  );
  clouds.name = 'clouds';
  group.add(clouds);
  return group;
}

export function createStarfield(count = 1800, radius = 40) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const z = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    positions[i * 3] = radius * r * Math.cos(a);
    positions[i * 3 + 1] = radius * z;
    positions[i * 3 + 2] = radius * r * Math.sin(a);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(geom, new THREE.PointsMaterial({
    color: 0xe8f0ff,
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  }));
}

export function lineFromLatLon(track, color, radius = 1.008, opacity = 0.9) {
  const segments = [];
  let current = [];
  const flush = () => {
    if (current.length > 1) {
      const geom = new THREE.BufferGeometry().setFromPoints(current);
      const mat = new THREE.LineBasicMaterial({color, transparent: opacity < 1, opacity});
      segments.push(new THREE.Line(geom, mat));
    }
    current = [];
  };
  let prevLon = null;
  for (const p of track) {
    if (prevLon !== null && Math.abs(p.lon - prevLon) > 180) flush();
    current.push(latLonToLocal(p.lat, p.lon, radius));
    prevLon = p.lon;
  }
  flush();
  const group = new THREE.Group();
  for (const line of segments) group.add(line);
  return group;
}

export function lineFromEci(points, color, opacity = 0.95) {
  const pts = points.map(p => eciToThree(p));
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({color, transparent: opacity < 1, opacity})
  );
}

export function markerPin(color, height = 0.03) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({color, emissive: color, emissiveIntensity: 0.35, roughness: 0.4});
  const cone = new THREE.Mesh(new THREE.ConeGeometry(height * 0.18, height, 10), mat);
  cone.position.y = height * 0.5;
  g.add(cone);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(height * 0.12, 10, 8),
    new THREE.MeshBasicMaterial({color, transparent: true, opacity: 0.7})
  );
  glow.position.y = height;
  g.add(glow);
  return g;
}
