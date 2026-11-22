import {findEvents,parseStartDate,validateLocation,kindLabel,worldFrame,gridAltitude,localSky,localCoverage,phaseAt,cst,utc} from './forecast-core.mjs';
const $=id=>document.getElementById(id),canvas=$('fc-map'),ctx=canvas.getContext('2d');
let events=[],index=0,selectedMs=0,location={lat:30.57,lon:104.07},coverage,land=null,mapTimer;
const M={x:42,y:20,w:928,h:464};
const project=(lon,lat)=>[M.x+(lon+180)/360*M.w,M.y+(90-lat)/180*M.h];
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
function error(message){$('fc-error').textContent=message;$('fc-error').hidden=!message;}
function setBusy(busy){$('fc-loading').hidden=!busy;$('fc-search').disabled=busy;$('fc-more').disabled=busy;}
const event=()=>events[index];
const duration=minutes=>minutes>0?`${Math.round(minutes)} 分钟`:'不发生';
function drawMap(frame){
  if(!ctx)return;
  const off=document.createElement('canvas');off.width=360;off.height=180;const oc=off.getContext('2d'),im=oc.createImageData(360,180);
  const heights=new Float32Array(361*181);
  for(let j=0;j<=180;j++)for(let i=0;i<=360;i++)heights[j*361+i]=gridAltitude(frame,90-j,i-180);
  for(let j=0;j<180;j++)for(let i=0;i<360;i++){
    const h=(heights[j*361+i]+heights[j*361+i+1]+heights[(j+1)*361+i]+heights[(j+1)*361+i+1])/4;
    const night=gridAltitude(frame,89.5-j,i-179.5,'sun')<0;
    const rgb=h>0?(night?[28,113,112]:[97,176,125]):(night?[12,23,43]:[40,53,71]);
    const n=(j*360+i)*4;im.data[n]=rgb[0];im.data[n+1]=rgb[1];im.data[n+2]=rgb[2];im.data[n+3]=255;
  }
  oc.putImageData(im,0,0);ctx.clearRect(0,0,1000,548);ctx.fillStyle='#0a1322';ctx.fillRect(0,0,1000,548);ctx.imageSmoothingEnabled=false;ctx.drawImage(off,M.x,M.y,M.w,M.h);
  ctx.save();ctx.beginPath();ctx.rect(M.x,M.y,M.w,M.h);ctx.clip();
  ctx.strokeStyle='#d4e3f266';ctx.lineWidth=1;
  if(land){
    ctx.beginPath();for(const feature of land.features){const polys=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
      for(const polygon of polys)for(const ring of polygon){let prev=null;for(const [lon,lat]of ring){const p=project(lon,lat);if(!prev||Math.abs(p[0]-prev[0])>M.w/2)ctx.moveTo(...p);else ctx.lineTo(...p);prev=p;}}
    }ctx.stroke();
  }
  ctx.strokeStyle='#acc2dc30';ctx.lineWidth=1;ctx.beginPath();
  for(let lon=-180;lon<=180;lon+=30){ctx.moveTo(...project(lon,-90));ctx.lineTo(...project(lon,90));}
  for(let lat=-60;lat<=60;lat+=30){ctx.moveTo(...project(-180,lat));ctx.lineTo(...project(180,lat));}ctx.stroke();
  // Marching squares on a one-degree topocentric height grid. No geocentric boundary shortcut.
  ctx.strokeStyle='#f3fcffe0';ctx.lineWidth=1.8;ctx.beginPath();
  for(let j=0;j<180;j++)for(let i=0;i<360;i++){
    const corners=[[i,j,heights[j*361+i]],[i+1,j,heights[j*361+i+1]],[i+1,j+1,heights[(j+1)*361+i+1]],[i,j+1,heights[(j+1)*361+i]]],hits=[];
    for(let k=0;k<4;k++){const a=corners[k],b=corners[(k+1)%4];if((a[2]>0)!==(b[2]>0)){const f=a[2]/(a[2]-b[2]);hits.push([M.x+(a[0]+f*(b[0]-a[0]))/360*M.w,M.y+(a[1]+f*(b[1]-a[1]))/180*M.h]);}}
    for(let k=0;k+1<hits.length;k+=2){ctx.moveTo(...hits[k]);ctx.lineTo(...hits[k+1]);}
  }ctx.stroke();
  const [sx,sy]=project(frame.subLon,frame.subLat);ctx.fillStyle='#fff1a9';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText('✦',sx,sy+9);
  const [lx,ly]=project(location.lon,location.lat);ctx.fillStyle='#ffffff';ctx.strokeStyle='#081220';ctx.lineWidth=3;ctx.beginPath();ctx.arc(lx,ly,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.restore();ctx.strokeStyle='#415772';ctx.lineWidth=1;ctx.strokeRect(M.x,M.y,M.w,M.h);
  ctx.fillStyle='#b3c6df';ctx.font='18px system-ui';ctx.textAlign='center';
  for(let lon=-180;lon<=180;lon+=60){let [x]=project(lon,0);x=Math.max(42,Math.min(960,x));ctx.fillText(lon===0?'0°':`${Math.abs(lon)}°${lon<0?'W':'E'}`,x,511);}
  ctx.textAlign='right';for(let lat=-60;lat<=60;lat+=30){const [,y]=project(0,lat);ctx.fillText(lat===0?'0°':`${Math.abs(lat)}${lat>0?'N':'S'}`,36,y+6);}
  ctx.font='16px system-ui';ctx.fillStyle='#8ca2bf';ctx.textAlign='center';ctx.fillText('等经纬投影 · 不是面积等比例地图',500,538);
  canvas.setAttribute('aria-label',`${cst(selectedMs)} 北京时间，${phaseAt(event(),selectedMs)}。青绿区域为月球在几何地平线上方，白线为边界，暗色为夜区。所选地点纬度${location.lat.toFixed(2)}，经度${location.lon.toFixed(2)}。具体高度见下方文字。`);
}
function selectTime(ms,immediate=false){
  selectedMs=Math.max(event().start,Math.min(event().end,ms));
  const f=worldFrame(selectedMs),s=localSky(selectedMs,location.lat,location.lon);
  $('fc-time').value=(selectedMs-event().start)/(event().end-event().start)*1000;
  $('fc-time-value').textContent=`${cst(selectedMs)} 北京时间`;$('fc-phase').textContent=phaseAt(event(),selectedMs);
  $('fc-sky-now').textContent=`所选地：月心高度 ${s.altitude.toFixed(1)}° · 方位角 ${s.azimuth.toFixed(0)}°（北 0°、东 90°） · ${s.visible?'月球在地平线上方':'月球在地平线下方'}；太阳高度 ${s.sunAltitude.toFixed(1)}°。`;
  $('fc-ephemeris').replaceChildren();
  for(const [key,value]of [['世界时（分钟显示）',utc(selectedMs)],['JD（UT ≈ UTC）',f.jdUT.toFixed(6)],['JD（TT）',f.jdTT.toFixed(6)],['地心月球赤经 / 赤纬（当日真赤道）',`${f.ra.toFixed(5)} h / ${f.dec.toFixed(5)}°`],['GAST（格林尼治视恒星时）',`${f.sidereal.toFixed(5)} h`],['月下方向（近似）',`${f.subLat.toFixed(2)}° 纬度，${f.subLon.toFixed(2)}° 东经`]])$('fc-ephemeris').append(el('dt',key),el('dd',value));
  document.querySelectorAll('[data-contact]').forEach(b=>b.setAttribute('aria-pressed',String(Math.abs(Number(b.dataset.time)-selectedMs)<1000)));
  clearTimeout(mapTimer);if(immediate)drawMap(f);else mapTimer=setTimeout(()=>drawMap(f),110);
}
function updateLocation(){
  error('');coverage=localCoverage(event(),location.lat,location.lon);
  $('fc-rise').textContent=coverage.rise===null?'附近无月出（极区可能不升）':cst(coverage.rise);
  $('fc-set').textContent=coverage.set===null?'附近无月落（极区可能不落）':cst(coverage.set);
  const total=2*event().sd_penum;
  const prefix=coverage.minutes<.05?'本场月食全过程，月球都在此地地平线下。':coverage.minutes>total-.05?'本场月食全过程，月球均在此地地平线上方。':'月出 / 月落截断了此地能看到的过程。';
  const windows=coverage.windows.map(([a,b])=>`${cst(a)} 至 ${cst(b)}`).join('；');
  $('fc-local-summary').replaceChildren(el('strong',prefix),el('p',`含半影的地平线上方覆盖约 ${Math.round(coverage.minutes)} 分钟。${windows?`北京时间：${windows}。`:''}`));
  $('fc-contacts').replaceChildren();
  for(const contact of coverage.altitudes){const row=document.createElement('tr');if(contact.key==='MAX')row.className='peak-row';
    const sky=contact.sky;
    row.append(el('th',`${contact.key} · ${contact.label}`),el('td',cst(contact.ms)),el('td',sky?`${sky.altitude.toFixed(1)}°`:'—'),el('td',sky?(sky.visible?'在地平线上方':'地平线下'):'不发生'));
    row.firstElementChild.scope='row';if(sky&&sky.visible)row.lastElementChild.className='above-horizon';$('fc-contacts').append(row);
  }
  selectTime(selectedMs,true);
}
function chooseEvent(i){
  index=i;selectedMs=event().peakMs;$('fc-event').value=String(i);
  $('fc-event-kind').textContent=kindLabel(event().kind);$('fc-event-title').textContent=cst(event().peakMs);
  $('fc-duration-pen').textContent=duration(2*event().sd_penum);$('fc-duration-part').textContent=duration(2*event().sd_partial);$('fc-duration-total').textContent=duration(2*event().sd_total);
  $('fc-time-start').textContent=`P1 ${cst(event().start)}`;$('fc-time-end').textContent=`P4 ${cst(event().end)}`;
  $('fc-phase-buttons').replaceChildren();
  for(const c of event().contacts){const b=el('button',`${c.key} ${c.label}`);b.type='button';b.disabled=c.ms===null;b.dataset.contact=c.key;if(c.ms!==null){b.dataset.time=c.ms;b.addEventListener('click',()=>selectTime(c.ms,true));}else b.title='这场月食不发生此阶段';b.setAttribute('aria-pressed','false');$('fc-phase-buttons').append(b);}
  updateLocation();
}
async function search(start){
  error('');setBusy(true);
  try{await new Promise(resolve=>setTimeout(resolve,20));events=findEvents(start);$('fc-event').replaceChildren(...events.map((e,i)=>{const o=el('option',`${cst(e.peakMs)} · ${kindLabel(e.kind)}`);o.value=i;return o;}));$('fc-results').hidden=false;chooseEvent(0);}
  catch(e){error(`计算未完成：${e.message||String(e)}。请检查日期后重试。`);}
  finally{setBusy(false);window.eclipseForecastReady=true;}
}
$('fc-search-form').addEventListener('submit',e=>{e.preventDefault();try{search(parseStartDate($('fc-date').value));}catch(err){error(err.message);}});
$('fc-more').addEventListener('click',()=>{if(events.length){const start=new Date(events.at(-1).peakMs+86400000);$('fc-date').value=new Date(+start+8*3600000).toISOString().slice(0,10);try{search(parseStartDate($('fc-date').value));}catch(err){error(err.message);}}});
$('fc-event').addEventListener('change',e=>chooseEvent(Number(e.target.value)));
$('fc-time').addEventListener('input',e=>selectTime(event().start+Number(e.target.value)/1000*(event().end-event().start)));
$('fc-location-form').addEventListener('submit',e=>{e.preventDefault();try{location=validateLocation($('fc-lat').value,$('fc-lon').value);updateLocation();}catch(err){error(err.message);}});
function setLocation(lat,lon){lat=Math.round(lat*100)/100;lon=Math.round(lon*100)/100;location=validateLocation(lat,lon);$('fc-lat').value=lat.toFixed(2);$('fc-lon').value=lon.toFixed(2);updateLocation();}
$('fc-chengdu').addEventListener('click',()=>setLocation(30.57,104.07));
$('fc-subpoint').addEventListener('click',()=>{const f=worldFrame(selectedMs);setLocation(f.subLat,f.subLon);});
document.querySelectorAll('[data-reference]').forEach(b=>b.addEventListener('click',()=>{$('fc-date').value=b.dataset.reference;search(parseStartDate(b.dataset.reference));}));
let down=null;canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>8||!events.length){down=null;return;}down=null;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*1000/r.width,y=(e.clientY-r.top)*548/r.height;if(x<M.x||x>M.x+M.w||y<M.y||y>M.y+M.h)return;setLocation(Math.round((90-(y-M.y)/M.h*180)*100)/100,Math.round(((x-M.x)/M.w*360-180)*100)/100);});
canvas.addEventListener('pointercancel',()=>{down=null;});
fetch('./vendor/ne_110m_land.geojson').then(r=>{if(!r.ok)throw Error('land');return r.json();}).then(data=>{land=data;if(events.length)drawMap(worldFrame(selectedMs));}).catch(()=>{document.querySelector('.map-caption').append(' 底图轮廓加载失败，几何计算和经纬网仍可用。');});
fetch('./research/validation.json').then(r=>{if(!r.ok)throw Error('validation');return r.json();}).then(data=>{
 const table=document.createElement('table');table.className='validation-table';const head=document.createElement('thead'),hr=document.createElement('tr');for(const name of ['核验场次（北京时间）','食甚差值','各接触最大绝对差'])hr.append(el('th',name));head.append(hr);table.append(head);const body=document.createElement('tbody');
 for(const r of data.results){const row=document.createElement('tr');row.append(el('td',`${r.dateCST} ${kindLabel(r.kind)}`),el('td',`${r.peakErrorMinutes>=0?'+':''}${r.peakErrorMinutes.toFixed(2)} 分钟`),el('td',`${r.maxContactErrorMinutes.toFixed(2)} 分钟`));body.append(row);}table.append(body);$('fc-validation').replaceChildren(table,el('p','差值 = 本站计算 − NASA UT；正值表示本站稍晚。详细可复核数据与测试脚本随网页本地提供。'));const a=el('a','查看核验数据 JSON ↗');a.href='./research/validation.json';$('fc-validation').append(a);
}).catch(()=>{$('fc-validation').textContent='核验表暂未载入，请查看上方 NASA 原始接触图与本站开源测试。';});
search(parseStartDate($('fc-date').value));
