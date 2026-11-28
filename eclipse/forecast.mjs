import {findEclipseEvents,findPreviousEclipseEvents,listYearEclipses,parseStartDate,parseYear,todayCSTDate,validateLocation,kindLabel,bodyLabel,worldFrame,gridAltitude,localSky,localCoverage,localSolarCircumstances,solarCircumstancesAt,shadowAxisPoint,phaseAt,cst,utc,formatLatLon} from './forecast-core.mjs?v=20261128-r8';
const $=id=>document.getElementById(id),canvas=$('fc-map'),ctx=canvas.getContext('2d');
let events=[],index=0,selectedMs=0,location={lat:30.57,lon:104.07},coverage,land=null,mapTimer,lastQuery={kind:'forward',start:null};
const M={x:42,y:20,w:928,h:464};
const project=(lon,lat)=>[M.x+(lon+180)/360*M.w,M.y+(90-lat)/180*M.h];
const el=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
function error(message){$('fc-error').textContent=message;$('fc-error').hidden=!message;}
function setBusy(busy){['fc-loading'].forEach(id=>$(id).hidden=!busy);['fc-search','fc-more','fc-prev','fc-year-search','fc-filter'].forEach(id=>{if($(id))$(id).disabled=busy;});}
const event=()=>events[index];
const duration=minutes=>minutes>0?`${Math.round(minutes)} 分钟`:'不发生';
const filter=()=>$('fc-filter')?.value||'all';
function optionLabel(e){return `${cst(e.peakMs)} · ${kindLabel(e.kind,e.body)}`;}
function rgbForSolar(cell){
  if(cell.sunAlt<=0)return [12,23,43];
  if(cell.type==='total')return [110,22,24];
  if(cell.type==='annular')return [214,176,74];
  if(cell.type==='partial'){
    const t=Math.max(0,Math.min(1,cell.magnitude));
    return [Math.round(62+170*t),Math.round(56+70*t),Math.round(46-10*t)];
  }
  return [40,53,71];
}
function drawMap(frame){
  if(!ctx)return;
  const solar=event().body==='solar';
  const off=document.createElement('canvas');off.width=360;off.height=180;const oc=off.getContext('2d'),im=oc.createImageData(360,180);
  const field=new Float32Array(361*181);
  const types=solar?new Uint8Array(361*181):null;
  const mags=solar?new Float32Array(361*181):null;
  for(let j=0;j<=180;j++)for(let i=0;i<=360;i++){
    const lat=90-j,lon=i-180;
    if(solar){
      const c=solarCircumstancesAt(frame,lat,lon);
      field[j*361+i]=c.sunAlt;
      mags[j*361+i]=c.magnitude;
      types[j*361+i]=c.type==='total'?3:c.type==='annular'?2:c.type==='partial'?1:0;
    }else field[j*361+i]=gridAltitude(frame,lat,lon);
  }
  for(let j=0;j<180;j++)for(let i=0;i<360;i++){
    const n=(j*360+i)*4;
    let rgb;
    if(solar){
      const idx=j*361+i;
      const sunAlt=(field[idx]+field[idx+1]+field[idx+361]+field[idx+362])/4;
      const code=Math.max(types[idx],types[idx+1],types[idx+361],types[idx+362]);
      const magnitude=(mags[idx]+mags[idx+1]+mags[idx+361]+mags[idx+362])/4;
      const type=code>=3?'total':code===2?'annular':code===1?'partial':'none';
      rgb=rgbForSolar({sunAlt,type,magnitude});
    }else{
      const h=(field[j*361+i]+field[j*361+i+1]+field[(j+1)*361+i]+field[(j+1)*361+i+1])/4;
      const night=gridAltitude(frame,89.5-j,i-179.5,'sun')<0;
      rgb=h>0?(night?[28,113,112]:[97,176,125]):(night?[12,23,43]:[40,53,71]);
    }
    im.data[n]=rgb[0];im.data[n+1]=rgb[1];im.data[n+2]=rgb[2];im.data[n+3]=255;
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
  const contour=(value,color,width,getter)=>{
    ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();
    for(let j=0;j<180;j++)for(let i=0;i<360;i++){
      const corners=[[i,j,getter(i,j)],[i+1,j,getter(i+1,j)],[i+1,j+1,getter(i+1,j+1)],[i,j+1,getter(i,j+1)]],hits=[];
      for(let k=0;k<4;k++){const a=corners[k],b=corners[(k+1)%4];if((a[2]>value)!==(b[2]>value)){const t=a[2]===b[2]?0:(value-a[2])/(b[2]-a[2]);hits.push([M.x+(a[0]+t*(b[0]-a[0]))/360*M.w,M.y+(a[1]+t*(b[1]-a[1]))/180*M.h]);}}
      for(let k=0;k+1<hits.length;k+=2){ctx.moveTo(...hits[k]);ctx.lineTo(...hits[k+1]);}
    }ctx.stroke();
  };
  if(solar){
    // Penumbra / umbra / antumbra outlines among the precomputed type grid.
    contour(0.5,'#f4d7a8cc',1.6,(i,j)=>types[j*361+i]);
    contour(1.5,'#ffd36acc',2,(i,j)=>types[j*361+i]);
  }else{
    // Marching squares on a one-degree topocentric height grid. No geocentric boundary shortcut.
    contour(0,'#f3fcffe0',1.8,(i,j)=>field[j*361+i]);
  }
  if(solar){
    const axis=shadowAxisPoint(frame);
    const [ax,ay]=project(axis.lon,axis.lat);ctx.fillStyle='#fff1a9';ctx.font='26px system-ui';ctx.textAlign='center';ctx.fillText('✦',ax,ay+9);
    if(Number.isFinite(event().latitude)&&Number.isFinite(event().longitude)){
      const [gx,gy]=project(event().longitude,event().latitude);
      ctx.strokeStyle='#fff1a9';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(gx,gy,7,0,Math.PI*2);ctx.stroke();
    }
  }else{
    const [sx,sy]=project(frame.subLon,frame.subLat);ctx.fillStyle='#fff1a9';ctx.font='28px system-ui';ctx.textAlign='center';ctx.fillText('✦',sx,sy+9);
  }
  const [lx,ly]=project(location.lon,location.lat);ctx.fillStyle='#ffffff';ctx.strokeStyle='#081220';ctx.lineWidth=3;ctx.beginPath();ctx.arc(lx,ly,6,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.restore();ctx.strokeStyle='#415772';ctx.lineWidth=1;ctx.strokeRect(M.x,M.y,M.w,M.h);
  ctx.fillStyle='#b3c6df';ctx.font='18px system-ui';ctx.textAlign='center';
  for(let lon=-180;lon<=180;lon+=60){let [x]=project(lon,0);x=Math.max(42,Math.min(960,x));ctx.fillText(lon===0?'0°':`${Math.abs(lon)}°${lon<0?'W':'E'}`,x,511);}
  ctx.textAlign='right';for(let lat=-60;lat<=60;lat+=30){const [,y]=project(0,lat);ctx.fillText(lat===0?'0°':`${Math.abs(lat)}${lat>0?'N':'S'}`,36,y+6);}
  ctx.font='16px system-ui';ctx.fillStyle='#8ca2bf';ctx.textAlign='center';ctx.fillText('等经纬投影 · 不是面积等比例地图',500,538);
  const aria=solar
    ? `${cst(selectedMs)} 北京时间，${phaseAt(event(),selectedMs)}。橙色为半影（偏食），深红为本影（全食），金黄为伪本影（环食）；只给太阳在几何地平线上方的区域上色。所选地点纬度${location.lat.toFixed(2)}，经度${location.lon.toFixed(2)}。`
    : `${cst(selectedMs)} 北京时间，${phaseAt(event(),selectedMs)}。青绿区域为月球在几何地平线上方，白线为边界，暗色为夜区。所选地点纬度${location.lat.toFixed(2)}，经度${location.lon.toFixed(2)}。具体高度见下方文字。`;
  canvas.setAttribute('aria-label',aria);
}
function setMapCopy(solar){
  $('fc-map-title').textContent=solar?'此刻，地球上哪里能看到这场日食？':'此刻，月球在哪些地方高于地平线？';
  $('fc-map-key').replaceChildren();
  const item=(cls,text)=>{const s=document.createElement('span');if(cls){const i=document.createElement('i');i.className=cls;s.append(i);}s.append(text);return s;};
  if(solar){
    $('fc-map-key').append(item('map-penumbra','半影 / 偏食'),item('map-umbra','本影 / 全食'),item('map-annular','伪本影 / 环食'),item('map-night','暗色：太阳在地平线下'),item(null,'✦ 此刻影轴落点　○ 食甚最大食点　● 所选地点'));
    $('fc-map-caption').textContent='颜色表示几何食分区域，不是气象预报，也不保证晴天或无遮挡。只给太阳中心在几何地平线上方的地点上色。1° 栅格是近似；靠近食带边界请看下方当地数值。可轻点地图选地点，无需定位权限。';
  }else{
    $('fc-map-key').append(item('map-visible','月球在地平线上方'),item('map-invisible','月球在地平线下方'),item('map-night','暗色叠加：太阳在地平线下'),item(null,'白线：月心 h = 0°'),item(null,'✦ 月下方向　● 所选地点'));
    $('fc-map-caption').textContent='青绿色只表示几何上能看见月球，不保证晴天、无遮挡或肉眼可见半影变化。夜区与可见区并不完全重合。地图采用地表视差修正，1° 栅格；可轻点地图选地点，无需定位权限。';
  }
}
function selectTime(ms,immediate=false){
  selectedMs=Math.max(event().start,Math.min(event().end,ms));
  const f=worldFrame(selectedMs),solar=event().body==='solar';
  $('fc-time').value=(selectedMs-event().start)/(event().end-event().start)*1000;
  $('fc-time-value').textContent=`${cst(selectedMs)} 北京时间`;$('fc-phase').textContent=phaseAt(event(),selectedMs);
  if(solar){
    const s=solarCircumstancesAt(f,location.lat,location.lon);
    const type=s.type==='none'?'未食':kindLabel(s.type,'solar');
    const extra=s.type==='none'?'':` · 食分 ${s.magnitude.toFixed(3)} · 遮挡 ${(s.obscuration*100).toFixed(1)}%`;
    $('fc-sky-now').textContent=`所选地：太阳高度 ${s.sunAlt.toFixed(1)}° · ${s.sunAbove?'太阳在地平线上方':'太阳在地平线下方'} · ${type}${extra}。这是几何计算，不是天气。`;
  }else{
    const s=localSky(selectedMs,location.lat,location.lon);
    $('fc-sky-now').textContent=`所选地：月心高度 ${s.altitude.toFixed(1)}° · 方位角 ${s.azimuth.toFixed(0)}°（北 0°、东 90°） · ${s.visible?'月球在地平线上方':'月球在地平线下方'}；太阳高度 ${s.sunAltitude.toFixed(1)}°。`;
  }
  $('fc-ephemeris').replaceChildren();
  const rows=[['世界时（分钟显示）',utc(selectedMs)],['JD（UT ≈ UTC）',f.jdUT.toFixed(6)],['JD（TT）',f.jdTT.toFixed(6)]];
  if(solar){
    const axis=shadowAxisPoint(f);
    rows.push(['地心太阳赤经 / 赤纬（当日真赤道）',`${f.sunRa.toFixed(5)} h / ${f.sunDec.toFixed(5)}°`],['GAST（格林尼治视恒星时）',`${f.sidereal.toFixed(5)} h`],['此刻影轴落点（几何近似）',formatLatLon(axis.lat,axis.lon)]);
  }else{
    rows.push(['地心月球赤经 / 赤纬（当日真赤道）',`${f.ra.toFixed(5)} h / ${f.dec.toFixed(5)}°`],['GAST（格林尼治视恒星时）',`${f.sidereal.toFixed(5)} h`],['月下方向（近似）',`${f.subLat.toFixed(2)}° 纬度，${f.subLon.toFixed(2)}° 东经`]);
  }
  for(const [key,value]of rows)$('fc-ephemeris').append(el('dt',key),el('dd',value));
  document.querySelectorAll('[data-contact]').forEach(b=>b.setAttribute('aria-pressed',String(Math.abs(Number(b.dataset.time)-selectedMs)<1000)));
  clearTimeout(mapTimer);if(immediate)drawMap(f);else mapTimer=setTimeout(()=>drawMap(f),110);
}
function updateLunarLocation(){
  coverage=localCoverage(event(),location.lat,location.lon);
  $('fc-rise-label').textContent='附近的几何月出';$('fc-set-label').textContent='附近的几何月落';
  $('fc-rise').textContent=coverage.rise===null?'附近无月出（极区可能不升）':cst(coverage.rise);
  $('fc-set').textContent=coverage.set===null?'附近无月落（极区可能不落）':cst(coverage.set);
  const total=2*event().sd_penum;
  const prefix=coverage.minutes<.05?'本场月食全过程，月球都在此地地平线下。':coverage.minutes>total-.05?'本场月食全过程，月球均在此地地平线上方。':'月出 / 月落截断了此地能看到的过程。';
  const windows=coverage.windows.map(([a,b])=>`${cst(a)} 至 ${cst(b)}`).join('；');
  $('fc-local-summary').classList.remove('not-visible');
  $('fc-local-summary').replaceChildren(el('strong',prefix),el('p',`含半影的地平线上方覆盖约 ${Math.round(coverage.minutes)} 分钟。${windows?`北京时间：${windows}。`:''}`));
  $('fc-col-alt').textContent='所选地月球高度';$('fc-col-vis').textContent='几何可见？';
  $('fc-contacts').replaceChildren();
  for(const contact of coverage.altitudes){const row=document.createElement('tr');if(contact.key==='MAX')row.className='peak-row';
    const sky=contact.sky;
    row.append(el('th',`${contact.key} · ${contact.label}`),el('td',cst(contact.ms)),el('td',sky?`${sky.altitude.toFixed(1)}°`:'—'),el('td',sky?(sky.visible?'在地平线上方':'地平线下'):'不发生'));
    row.firstElementChild.scope='row';if(sky&&sky.visible)row.lastElementChild.className='above-horizon';$('fc-contacts').append(row);
  }
  $('fc-contact-note').textContent='点阶段按钮切换地图；时刻取整到分钟。全球接触时刻相同，能否看到则因地点不同。';
}
function updateSolarLocation(){
  coverage=localSolarCircumstances(event(),location.lat,location.lon);
  $('fc-rise-label').textContent='当地初亏（几何）';$('fc-set-label').textContent='当地复圆（几何）';
  const p1=coverage.inEclipse?coverage.contacts[0].ms:null,p4=coverage.inEclipse?coverage.contacts.at(-1).ms:null;
  $('fc-rise').textContent=p1?cst(p1):'此地不进入半影';
  $('fc-set').textContent=p4?cst(p4):'此地不进入半影';
  $('fc-local-summary').classList.toggle('not-visible',!coverage.visible);
  if(!coverage.inEclipse){
    $('fc-local-summary').replaceChildren(el('strong','此地不可见'),el('p','这场日食的半影没有落到所选地点。改地点或轻点地图，可以查看其他位置的应见情况。'));
  }else if(!coverage.visible){
    $('fc-local-summary').replaceChildren(el('strong','此地不可见'),el('p',`几何上此地会进入${kindLabel(coverage.kind,'solar')}，但全过程太阳都在地平线下方（当地夜间或太阳未出）。不是天气原因。`));
  }else{
    const obsc=`遮挡约 ${(coverage.obscuration*100).toFixed(1)}%，食分 ${coverage.magnitude.toFixed(3)}`;
    const windows=coverage.windows.map(([a,b])=>`${cst(a)} 至 ${cst(b)}`).join('；');
    $('fc-local-summary').replaceChildren(el('strong',`此地可见${kindLabel(coverage.kind,'solar')}`),el('p',`食甚 ${cst(coverage.peakMs)}，太阳高度 ${coverage.peak.sunAlt.toFixed(1)}°，${obsc}。太阳在地平线上方的时段：${windows}。海拔按 0 米，不加折射，不是气象预报。`));
  }
  $('fc-col-alt').textContent='所选地太阳高度';$('fc-col-vis').textContent='太阳在地平线上方？';
  $('fc-contacts').replaceChildren();
  for(const contact of coverage.contacts){
    const row=document.createElement('tr');if(contact.key==='MAX')row.className='peak-row';
    const sky=contact.sky;
    row.append(el('th',`${contact.key} · ${contact.label}`),el('td',cst(contact.ms)),el('td',`${sky.sunAlt.toFixed(1)}°`),el('td',sky.sunAlt>0?'在地平线上方':'地平线下'));
    row.firstElementChild.scope='row';if(sky.sunAlt>0)row.lastElementChild.className='above-horizon';$('fc-contacts').append(row);
  }
  $('fc-contact-note').textContent='当地接触由日面与月面的几何相切求得，时刻取整到分钟。太阳高度不加折射。全球半影起止与当地初亏复圆不是同一回事。';
}
function updateLocation(){
  error('');
  if(event().body==='solar')updateSolarLocation();else updateLunarLocation();
  selectTime(selectedMs,true);
}
function chooseEvent(i){
  index=i;selectedMs=event().peakMs;$('fc-event').value=String(i);
  const solar=event().body==='solar';
  $('fc-event-kind').textContent=kindLabel(event().kind,event().body);
  $('fc-event-kind').dataset.body=event().body;
  $('fc-event-title').textContent=cst(event().peakMs);
  if(solar){
    $('fc-metric-1-label').textContent='类型';$('fc-duration-pen').textContent=kindLabel(event().kind,'solar');
    $('fc-metric-2-label').textContent='食甚最大食点';$('fc-duration-part').textContent=formatLatLon(event().latitude,event().longitude);
    const obsc=event().kind==='partial'||event().obscuration==null?'偏食无单一全球遮挡':event().kind==='total'?'100% 全食':`${(event().obscuration*100).toFixed(1)}% 遮挡`;
    $('fc-metric-3-label').textContent='最大食点遮挡';$('fc-duration-total').textContent=obsc;
    $('fc-time-start').textContent=`地球半影始 ${cst(event().start)}`;$('fc-time-end').textContent=`地球半影终 ${cst(event().end)}`;
    $('fc-subpoint').textContent='移到最大食点';
  }else{
    $('fc-metric-1-label').textContent='含半影全过程';$('fc-duration-pen').textContent=duration(2*event().sd_penum);
    $('fc-metric-2-label').textContent='本影阶段';$('fc-duration-part').textContent=duration(2*event().sd_partial);
    $('fc-metric-3-label').textContent='全食阶段';$('fc-duration-total').textContent=duration(2*event().sd_total);
    $('fc-time-start').textContent=`P1 ${cst(event().start)}`;$('fc-time-end').textContent=`P4 ${cst(event().end)}`;
    $('fc-subpoint').textContent='移到月下方向';
  }
  setMapCopy(solar);
  $('fc-phase-buttons').replaceChildren();
  for(const c of event().contacts){const b=el('button',`${c.key} ${c.label}`);b.type='button';b.disabled=c.ms===null;b.dataset.contact=c.key;if(c.ms!==null){b.dataset.time=c.ms;b.addEventListener('click',()=>selectTime(c.ms,true));}else b.title='这场月食不发生此阶段';b.setAttribute('aria-pressed','false');$('fc-phase-buttons').append(b);}
  updateLocation();
}
async function runSearch(fn,query){
  error('');setBusy(true);
  try{
    await new Promise(resolve=>setTimeout(resolve,20));
    events=fn();
    lastQuery=query;
    if(!events.length){
      $('fc-results').hidden=true;
      error('这一范围内没有找到符合条件的日食或月食。可改日期、年份或筛选后重试。');
      return;
    }
    $('fc-event').replaceChildren(...events.map((e,i)=>{const o=el('option',optionLabel(e));o.value=i;return o;}));
    $('fc-results').hidden=false;
    const pick=query.kind==='back'?events.length-1:0;
    chooseEvent(pick);
  }catch(e){error(`计算未完成：${e.message||String(e)}。请检查日期后重试。`);}
  finally{setBusy(false);window.eclipseForecastReady=true;}
}
function searchFromDate(start,direction='forward'){
  const types=filter();
  if(direction==='back')return runSearch(()=>findPreviousEclipseEvents(start,6,types),{kind:'back',start:+start});
  return runSearch(()=>findEclipseEvents(start,6,types),{kind:'forward',start:+start});
}
function searchYear(year){
  return runSearch(()=>listYearEclipses(year,filter()),{kind:'year',year});
}
function repeatLast(){
  if(lastQuery.kind==='year')return searchYear(lastQuery.year);
  if(lastQuery.kind==='back')return searchFromDate(new Date(lastQuery.start),'back');
  if(lastQuery.start)return searchFromDate(new Date(lastQuery.start),'forward');
  return searchFromDate(parseStartDate($('fc-date').value));
}
$('fc-search-form').addEventListener('submit',e=>{e.preventDefault();try{searchFromDate(parseStartDate($('fc-date').value));}catch(err){error(err.message);}});
$('fc-year-form').addEventListener('submit',e=>{e.preventDefault();try{const year=parseYear($('fc-year').value);$('fc-date').value=`${year}-01-01`;searchYear(year);}catch(err){error(err.message);}});
$('fc-more').addEventListener('click',()=>{if(!events.length)return;const start=new Date(events.at(-1).peakMs+60000);$('fc-date').value=new Date(+start+8*3600000).toISOString().slice(0,10);try{searchFromDate(start);}catch(err){error(err.message);}});
$('fc-prev').addEventListener('click',()=>{if(!events.length)return;const start=new Date(events[0].peakMs);$('fc-date').value=new Date(+start+8*3600000).toISOString().slice(0,10);try{searchFromDate(start,'back');}catch(err){error(err.message);}});
$('fc-filter').addEventListener('change',()=>{if(lastQuery.kind||$('fc-date').value)repeatLast();});
$('fc-event').addEventListener('change',e=>chooseEvent(Number(e.target.value)));
$('fc-time').addEventListener('input',e=>selectTime(event().start+Number(e.target.value)/1000*(event().end-event().start)));
$('fc-location-form').addEventListener('submit',e=>{e.preventDefault();try{location=validateLocation($('fc-lat').value,$('fc-lon').value);updateLocation();}catch(err){error(err.message);}});
function setLocation(lat,lon){lat=Math.round(lat*100)/100;lon=Math.round(lon*100)/100;location=validateLocation(lat,lon);$('fc-lat').value=lat.toFixed(2);$('fc-lon').value=lon.toFixed(2);updateLocation();}
$('fc-chengdu').addEventListener('click',()=>setLocation(30.57,104.07));
$('fc-subpoint').addEventListener('click',()=>{
  if(event().body==='solar'){
    if(Number.isFinite(event().latitude)&&Number.isFinite(event().longitude))setLocation(event().latitude,event().longitude);
    else{const a=shadowAxisPoint(worldFrame(selectedMs));setLocation(a.lat,a.lon);}
  }else{const f=worldFrame(selectedMs);setLocation(f.subLat,f.subLon);}
});
document.querySelectorAll('[data-reference]').forEach(b=>b.addEventListener('click',()=>{$('fc-date').value=b.dataset.reference;searchFromDate(parseStartDate(b.dataset.reference));}));
let down=null;canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
canvas.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>8||!events.length){down=null;return;}down=null;const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)*1000/r.width,y=(e.clientY-r.top)*548/r.height;if(x<M.x||x>M.x+M.w||y<M.y||y>M.y+M.h)return;setLocation(Math.round((90-(y-M.y)/M.h*180)*100)/100,Math.round(((x-M.x)/M.w*360-180)*100)/100);});
canvas.addEventListener('pointercancel',()=>{down=null;});
fetch('./vendor/ne_110m_land.geojson').then(r=>{if(!r.ok)throw Error('land');return r.json();}).then(data=>{land=data;if(events.length)drawMap(worldFrame(selectedMs));}).catch(()=>{document.querySelector('.map-caption').append(' 底图轮廓加载失败，几何计算和经纬网仍可用。');});
fetch('./research/validation.json').then(r=>{if(!r.ok)throw Error('validation');return r.json();}).then(data=>{
 const table=document.createElement('table');table.className='validation-table';const head=document.createElement('thead'),hr=document.createElement('tr');for(const name of ['核验场次（北京时间）','食甚差值','各接触最大绝对差'])hr.append(el('th',name));head.append(hr);table.append(head);const body=document.createElement('tbody');
 const rows=[...(data.results||[]),...(data.solarResults||[])];
 for(const r of rows){const row=document.createElement('tr');const label=r.body==='solar'?`${r.dateCST} ${kindLabel(r.kind,'solar')}`:`${r.dateCST} ${kindLabel(r.kind)}`;const contact=r.maxContactErrorMinutes==null?'—（只核验食甚）':`${r.maxContactErrorMinutes.toFixed(2)} 分钟`;row.append(el('td',label),el('td',`${r.peakErrorMinutes>=0?'+':''}${r.peakErrorMinutes.toFixed(2)} 分钟`),el('td',contact));body.append(row);}table.append(body);$('fc-validation').replaceChildren(table,el('p','差值 = 本站计算 − NASA UT；正值表示本站稍晚。日食目前核验食甚时刻；月食另核验各接触。详细可复核数据与测试脚本随网页本地提供。'));const a=el('a','查看核验数据 JSON ↗');a.href='./research/validation.json';$('fc-validation').append(a);
}).catch(()=>{$('fc-validation').textContent='核验表暂未载入，请查看上方 NASA 原始接触图与本站开源测试。';});
$('fc-date').value=todayCSTDate();
$('fc-year').value=todayCSTDate().slice(0,4);
searchFromDate(parseStartDate($('fc-date').value));
