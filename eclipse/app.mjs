import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { C, radians, evaluate, fullMoonAngle, advance, nextFull } from './model.mjs';

const $=id=>document.getElementById(id);
const state={annual:90,orbital:90,inclination:C.inclination,playing:false};
let scene,camera,renderer,controls,moonMesh,moonMarker,earthMarker,orbitLine,shadowGroup,sunlight,moonLight,fullMarker;
let lastStatus='',frame=0,lastInclination=C.inclination;
const axis=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
const cross=$('cross').getContext('2d');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function circlePoints(radius,inclination=0){return Array.from({length:361},(_,n)=>{const u=radians(n),i=radians(inclination);return new THREE.Vector3(radius*Math.cos(u),radius*Math.sin(u)*Math.sin(i),radius*Math.sin(u)*Math.cos(i));});}
function line(points,color,opacity=1){return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));}
function halo(color){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d');
  c.strokeStyle=color;c.lineWidth=2;c.beginPath();c.arc(32,32,21,0,Math.PI*2);c.stroke();
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false,opacity:.9}));
  sprite.renderOrder=10;return sprite;
}
function init3D(){
  scene=new THREE.Scene();scene.background=new THREE.Color('#080f1c');
  camera=new THREE.PerspectiveCamera(40,1,.1,2500);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  $('scene').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','地月系统三维画面；单指旋转，双指缩放。也可使用预设视角按钮。');
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();$('fallback').hidden=false;});
  renderer.domElement.addEventListener('webglcontextrestored',()=>{$('fallback').hidden=true;});
  controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  controls.dampingFactor=.075;controls.enablePan=false;controls.minDistance=25;controls.maxDistance=480;
  controls.touches.ONE=THREE.TOUCH.ROTATE;controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
  controls.addEventListener('start',()=>{document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed','false'));});
  scene.add(new THREE.AmbientLight(0xabc5ef,.38));
  moonLight=new THREE.DirectionalLight(0xfff2db,3);scene.add(moonLight);
  const earth=new THREE.Mesh(new THREE.SphereGeometry(1,40,24),new THREE.MeshStandardMaterial({color:0x438dcb,roughness:.8,metalness:.05}));scene.add(earth);
  const eq=line(circlePoints(1.013),0x89d6fc,.7);scene.add(eq);
  earthMarker=halo('#97bce4');scene.add(earthMarker);
  moonMesh=new THREE.Mesh(new THREE.SphereGeometry(C.moonRadius,28,20),new THREE.MeshStandardMaterial({color:0xd7d6cc,roughness:1}));scene.add(moonMesh);
  moonMarker=halo('#63ead9');scene.add(moonMarker);
  fullMarker=halo('#778da9');fullMarker.material.opacity=.4;scene.add(fullMarker);
  const disk=new THREE.Mesh(new THREE.CircleGeometry(70,128),new THREE.MeshBasicMaterial({color:0x4974b9,transparent:true,opacity:.055,side:THREE.DoubleSide,depthWrite:false}));disk.rotation.x=-Math.PI/2;scene.add(disk);
  scene.add(line(circlePoints(70),0x527db4,.24));
  orbitLine=line(circlePoints(C.distance,C.inclination),0x63ead9,.85);scene.add(orbitLine);
  const nodes=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-72,0,0),new THREE.Vector3(72,0,0)]),new THREE.LineDashedMaterial({color:0xe7b76d,dashSize:1.6,gapSize:1.4,transparent:true,opacity:.8}));nodes.computeLineDistances();scene.add(nodes);
  for(const x of [-C.distance,C.distance]){
    const ring=new THREE.Mesh(new THREE.RingGeometry(.65,1,32),new THREE.MeshBasicMaterial({color:0xe7b76d,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.x=x;scene.add(ring);
  }
  shadowGroup=new THREE.Group();
  const L=86;
  for(const [radius,color,opacity] of [[1-L*(C.sunRadius-1)/C.sunDistance,0xe77766,.19],[1+L*(C.sunRadius+1)/C.sunDistance,0xb59adc,.065]]){
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,1,L,64,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide}));mesh.position.y=L/2;shadowGroup.add(mesh);
  }
  const shadowAxis=line([new THREE.Vector3(0,0,0),new THREE.Vector3(0,L,0)],0xe8b68a,.35);shadowGroup.add(shadowAxis);scene.add(shadowGroup);
  sunlight=new THREE.Group();
  for(const z of [-17,0,17])sunlight.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(-83,0,z),19,0xe7b76d,2,1));
  scene.add(sunlight);
  // Fixed seed: no network images, no flickering on updates.
  let seed=8765;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};const stars=[];
  for(let n=0;n<700;n++){const z=random()*2-1,t=random()*Math.PI*2,r=550+random()*150;const q=Math.sqrt(1-z*z);stars.push(r*q*Math.cos(t),r*z,r*q*Math.sin(t));}
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({size:.55,color:0x94abc9,transparent:true,opacity:.55,sizeAttenuation:true})));
  new ResizeObserver(resize).observe($('stage'));resize();setView('oblique');
}
function resize(){if(!renderer)return;const {width,height}=$('stage').getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}
function setView(view){
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  if(!renderer||!controls)return;
  controls.target.set(0,0,0);const d=68/(Math.tan(radians(20))*Math.min(1,camera.aspect));
  const a=radians(state.annual),s=new THREE.Vector3(Math.cos(a),0,Math.sin(a));
  let v;
  if(view==='side')v=new THREE.Vector3(0,.015,1);
  else if(view==='top')v=new THREE.Vector3(0,1,.001);
  else if(view==='shadow')v=s.multiplyScalar(-1).add(new THREE.Vector3(0,.001,0));
  else v=new THREE.Vector3(.8,.43,1);
  camera.position.copy(v.normalize().multiplyScalar(d));controls.update();
}
function update3D(result){
  if(!scene)return;
  axis.fromArray(result.axis);moonMesh.position.fromArray(result.moon);moonMarker.position.copy(moonMesh.position);
  moonMesh.material.color.set(result.kind==='total'?0xc16547:result.kind==='partial'?0xbb9988:0xd7d6cc);
  if(lastInclination!==state.inclination){orbitLine.geometry.dispose();orbitLine.geometry=new THREE.BufferGeometry().setFromPoints(circlePoints(C.distance,state.inclination));lastInclination=state.inclination;}
  shadowGroup.quaternion.setFromUnitVectors(up,axis);
  sunlight.rotation.y=-radians(state.annual);
  moonLight.position.copy(axis).multiplyScalar(-1000);
  const fp=evaluate(state.annual,fullMoonAngle(state.annual,state.inclination),state.inclination);
  fullMarker.position.fromArray(fp.moon);
}
function projectLabel(id,position,offsetX=10,offsetY=-24){
  if(!camera)return;const v=position.clone().project(camera),el=$(id),host=$('stage');
  const visible=v.z>-1&&v.z<1&&Math.abs(v.x)<.98&&Math.abs(v.y)<.93;
  el.style.opacity=visible?'1':'0';
  const left=clamp((v.x*.5+.5)*host.clientWidth+offsetX,6,host.clientWidth-el.offsetWidth-6);
  const top=clamp((-v.y*.5+.5)*host.clientHeight+offsetY,45,host.clientHeight-115);
  el.style.transform=`translate(${left}px,${top}px)`;
}
function updateMarkers(){
  if(!renderer)return;
  for(const [sprite,pixels]of [[moonMarker,18],[earthMarker,15],[fullMarker,12]]){
    const size=2*camera.position.distanceTo(sprite.position)*Math.tan(radians(camera.fov/2))*pixels/$('stage').clientHeight;
    sprite.scale.set(size,size,1);
  }
  projectLabel('label-earth',new THREE.Vector3(0,0,0),10,8);
  projectLabel('label-moon',moonMesh.position,10,-24);
  projectLabel('label-n1',new THREE.Vector3(C.distance,0,0),10,12);
  projectLabel('label-n2',new THREE.Vector3(-C.distance,0,0),10,12);
  projectLabel('label-sun',axis.clone().multiplyScalar(-73),-40,-23);
}
function drawCross(r){
  if(!cross)return;
  const c=cross,w=380,h=300,cx=190,cy=144;c.clearRect(0,0,w,h);
  const extent=Math.max(1.85,r.separation+.6),scale=122/extent;
  c.strokeStyle='#273b55';c.lineWidth=1;c.setLineDash([3,6]);c.beginPath();c.moveTo(cx,12);c.lineTo(cx,278);c.moveTo(40,cy);c.lineTo(340,cy);c.stroke();c.setLineDash([]);
  const disk=(x,y,radius,fill,stroke)=>{c.beginPath();c.arc(x,y,Math.max(.01,radius*scale),0,Math.PI*2);c.fillStyle=fill;c.fill();c.strokeStyle=stroke;c.lineWidth=1.5;c.stroke();};
  if(r.behind){disk(cx,cy,r.penumbra,'#b59adc19','#b59adc99');disk(cx,cy,r.umbra,'#b2503e55','#e77766');}
  const mx=cx+r.lateral*scale,my=cy-r.moon[1]*scale;
  const color=r.kind==='total'?'#d88968':r.kind==='partial'?'#c0a396':'#e1e6e9';disk(mx,my,C.moonRadius,color,'#ffffff99');
  c.strokeStyle='#63ead9';c.lineWidth=1.3;c.beginPath();c.arc(mx,my,Math.max(C.moonRadius*scale+6,8),0,Math.PI*2);c.stroke();
  c.fillStyle='#63ead9';c.font='19px system-ui';c.textAlign='center';c.fillText('月球',clamp(mx,34,346),clamp(my-18-C.moonRadius*scale,23,280));
  c.fillStyle='#8d9fba';c.font='17px system-ui';c.fillText(r.behind?'地影轴':'朝阳一侧 · 无地影',cx,294);
  // Accessible equivalent is updated along with the visible numeric readout.
  $('cross').setAttribute('aria-label',`${r.behind?'背太阳一侧阴影截面':'月球在朝太阳一侧'}，月心距影轴 ${r.separation.toFixed(2)} 个地球半径；${kindName(r.kind)}`);
}
function kindName(kind){return {none:'无月食',penumbral:'半影月食',partial:'月偏食',total:'月全食'}[kind];}
function phaseName(r){const d=Math.abs(r.phaseOffset);if(d<.1)return'满月位置';if(d<8)return'接近满月';if(d>172)return'接近新月';if(d>82&&d<98)return'接近弦月';return d<90?'盈凸 / 亏凸阶段':'蛾眉 / 残月阶段';}
function renderState(){
  const r=evaluate(state.annual,state.orbital,state.inclination);
  $('annual').value=state.annual;$('orbital').value=state.orbital;
  $('annual-value').textContent=`${state.annual.toFixed(1)}°`;$('orbital-value').textContent=`${state.orbital.toFixed(1)}°`;
  $('label-n1').textContent=state.inclination===0?'原升交点方向':'升交点';$('label-n2').textContent=state.inclination===0?'原降交点方向':'降交点';
  $('inclination').textContent=`${state.inclination===0?'0':C.inclination}°`;$('flat').checked=state.inclination===0;
  $('phase').textContent=`${phaseName(r)} · 黄纬 ${r.latitude.toFixed(2)}°`;
  $('distance').textContent=`${r.separation.toFixed(2)} R⊕`;$('umbra').textContent=r.behind?`${r.umbra.toFixed(2)} R⊕`:'不适用';
  let title,desc,shadowTitle,shadowDesc;
  if(r.kind==='total'){
    title='月全食 · 月球完全进入本影';desc='此时接近满月且靠近交点，整个月球圆面进入了本影。';shadowTitle='整个月球进入本影';shadowDesc='月心到地影轴的距离，加上月球半径，小于此处的本影半径。';
  }else if(r.kind==='partial'){
    title='月偏食 · 月球部分进入本影';desc='月球圆面与本影有交叠，但还没有完全进入本影。';shadowTitle='月球与本影部分交叠';shadowDesc='请缓慢拖动月球位置滑块，观察半影、偏食、全食之间的变化。';
  }else if(r.kind==='penumbral'){
    title='半影月食 · 尚未进入本影';desc='月球只与半影相交，亮度略有变化，不会出现本影缺口。';shadowTitle='只碰到外层的半影';shadowDesc='外圈是半影：太阳光只被地球遮去一部分。内圈才是本影。';
  }else if(!r.behind){
    title=`${phaseName(r)} · 不会发生月食`;desc='月球位于地球朝太阳的一侧，不在背太阳方向的地影里。';shadowTitle='月球在朝太阳的一侧';shadowDesc='阴影只出现在地球背向太阳的方向。这里不画地影截面，以免误认两侧都有影子。';
  }else if(r.nearFull){
    title='满月附近 · 无月食';desc=state.inclination===0?'轨道共面仍要等到满月对齐。继续转动月球，或点击「移到满月」。':'虽然已到满月附近，但月球从地影上方或下方经过。满月不是月食的充分条件。';shadowTitle='错过地球的影子';shadowDesc=`月球黄纬 ${r.latitude.toFixed(2)}°。小小倾角在很远的地月距离上，已造成明显的上下偏离。`;
  }else{
    title=`${phaseName(r)} · 无月食`;desc='月球虽然位于背太阳的半侧，但还没有对准地影。月食只能发生在满月附近。';shadowTitle='还没有对准地影';shadowDesc='横向偏差也会让月球错过影子。点「移到满月」排除月内位置的影响。';
  }
  $('status-label').textContent=title;$('status-box').dataset.state=r.kind;
  if(desc!==lastStatus){$('status-description').textContent=desc;lastStatus=desc;}
  $('shadow-title').textContent=shadowTitle;$('shadow-desc').textContent=shadowDesc;
  $('play').textContent=state.playing?'Ⅱ 暂停运行':'▶ 播放运行';$('play').setAttribute('aria-pressed',String(state.playing));
  update3D(r);drawCross(r);
}
function clearPresets(){document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});}
function preset(name){
  state.playing=false;state.inclination=name==='flat'?0:C.inclination;state.annual=name==='eclipse'?0:90;state.orbital=fullMoonAngle(state.annual,state.inclination);$('lock-full').checked=true;
  clearPresets();const b=document.querySelector(`[data-preset="${name}"]`);b.classList.add('active');b.setAttribute('aria-pressed','true');
  setView('oblique');renderState();
}
$('annual').addEventListener('input',e=>{state.playing=false;state.annual=Number(e.target.value);if($('lock-full').checked)state.orbital=fullMoonAngle(state.annual,state.inclination);clearPresets();renderState();});
$('orbital').addEventListener('input',e=>{state.playing=false;state.orbital=Number(e.target.value);clearPresets();renderState();});
$('flat').addEventListener('change',e=>{state.playing=false;state.inclination=e.target.checked?0:C.inclination;clearPresets();renderState();});
$('to-full').addEventListener('click',()=>{state.playing=false;state.orbital=fullMoonAngle(state.annual,state.inclination);clearPresets();renderState();});
$('play').addEventListener('click',()=>{state.playing=!state.playing;clearPresets();renderState();});
$('step-month').addEventListener('click',()=>{state.playing=false;Object.assign(state,nextFull(state.annual,state.orbital,state.inclination));clearPresets();renderState();});
$('reset').addEventListener('click',()=>preset('ordinary'));
document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>preset(b.dataset.preset)));
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.playing=false;renderState();}});
try{init3D();}catch(error){console.error('WebGL setup failed',error);$('fallback').hidden=false;document.querySelectorAll('[data-view]').forEach(b=>b.disabled=true);renderer=null;scene=null;}
window.eclipseReady=true;renderState();
let previous=performance.now();
function animate(now){
  requestAnimationFrame(animate);const seconds=Math.min((now-previous)/1000,.08);previous=now;
  if(state.playing){Object.assign(state,advance(state.annual,state.orbital,seconds*2));if(++frame%2===0)renderState();}
  if(renderer&&scene){controls.update();updateMarkers();renderer.render(scene,camera);}
}
requestAnimationFrame(animate);
