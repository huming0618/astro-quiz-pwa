import * as A from './vendor/astronomy-engine.mjs';
export { A };
export const DEG=Math.PI/180, AU_KM=149597870.7;
const F=0.996647180302104, R=6378.1366;
const SUN_R=695700, MOON_R=1737.4, EARTH_MEAN=6371;
export const kindLabel=(k,body='lunar')=>body==='solar'
  ?({partial:'日偏食',annular:'日环食',total:'日全食',hybrid:'日食（混合食）'}[k]||k)
  :({penumbral:'半影月食',partial:'月偏食',total:'月全食'}[k]||k);
export const bodyLabel=body=>body==='solar'?'日食':'月食';
export const signedLongitude=x=>((x+180)%360+360)%360-180;
export function parseStartDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('请输入完整的起始日期。');
  const y=Number(value.slice(0,4));if(y<1900||y>2099)throw new Error('请选择 1900—2099 年的日期。');
  const d=new Date(value+'T00:00:00+08:00');
  if(!Number.isFinite(+d)||new Date(+d+8*3600000).toISOString().slice(0,10)!==value)throw new Error('日期不存在，请重新选择。');
  return d;
}
export function parseYear(value){
  const y=Number(value);
  if(!Number.isInteger(y)||y<1900||y>2099)throw new Error('请选择 1900—2099 年。');
  return y;
}
export function yearBounds(year){
  year=parseYear(year);
  return {start:new Date(`${year}-01-01T00:00:00+08:00`),end:new Date(`${year+1}-01-01T00:00:00+08:00`)};
}
export function todayCSTDate(now=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function validateLocation(lat,lon){
  if(!['number','string'].includes(typeof lat)||!['number','string'].includes(typeof lon))throw new Error('请填写数值经纬度。');
  if(typeof lat==='string'&&!lat.trim()||typeof lon==='string'&&!lon.trim())throw new Error('请填写纬度与经度。');
  lat=Number(lat);lon=Number(lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat< -90||lat>90||lon< -180||lon>180)throw new Error('纬度范围 −90～90°，经度范围 −180～180°（东经为正）。');
  return {lat,lon};
}
export function buildEvent(e){
  const peak=+e.peak.date;
  const contact=(key,label,minutes)=>({key,label,ms:minutes===null?null:peak+minutes*60000});
  return {body:'lunar',...e,peakMs:peak,contacts:[contact('P1','半影食始',-e.sd_penum),contact('U1','初亏',e.sd_partial>0?-e.sd_partial:null),contact('U2','食既',e.sd_total>0?-e.sd_total:null),contact('MAX','食甚',0),contact('U3','生光',e.sd_total>0?e.sd_total:null),contact('U4','复圆',e.sd_partial>0?e.sd_partial:null),contact('P4','半影食终',e.sd_penum)],start:peak-e.sd_penum*60000,end:peak+e.sd_penum*60000};
}
export function findEvents(start,count=4){
  if(!Number.isFinite(+start)||count<1||count>8)throw new Error('无效的搜索参数。');
  let e=A.SearchLunarEclipse(new Date(+start-86400000));const list=[];
  // Greatest eclipse and astronomical full moon are not the same instant.
  // Look back one day, then filter by peak so a midnight crossing is not lost.
  while(+e.peak.date < +start)e=A.NextLunarEclipse(e.peak);
  for(let i=0;i<count;i++){list.push(buildEvent(e));if(i+1<count)e=A.NextLunarEclipse(e.peak);}
  return list;
}
function firstLunar(start){
  let e=A.SearchLunarEclipse(new Date(+start-86400000));
  while(+e.peak.date < +start)e=A.NextLunarEclipse(e.peak);
  return e;
}
function firstSolar(start){
  let e=A.SearchGlobalSolarEclipse(new Date(+start-86400000));
  while(+e.peak.date < +start)e=A.NextGlobalSolarEclipse(e.peak);
  return e;
}
export function buildSolarEvent(e){
  const peak=+e.peak.date;
  const window=solarWindow(peak);
  return {
    body:'solar',kind:e.kind,engineKind:e.kind,obscuration:e.obscuration,peak:e.peak,peakMs:peak,
    latitude:e.latitude,longitude:e.longitude,distance:e.distance,
    start:window.start,end:window.end,
    contacts:[
      {key:'P1',label:'地球半影食始',ms:window.start},
      {key:'MAX',label:'食甚（最大食）',ms:peak},
      {key:'P4',label:'地球半影食终',ms:window.end}
    ]
  };
}
function validateSearch(start,count,types){
  if(!Number.isFinite(+start)||count<1||count>12)throw new Error('无效的搜索参数。');
  if(!['all','solar','lunar'].includes(types))throw new Error('请选择全部、只日食或只月食。');
}
function collectForward(start,limit,types){
  const wantSolar=types!=='lunar',wantLunar=types!=='solar';
  let solar=wantSolar?firstSolar(start):null,lunar=wantLunar?firstLunar(start):null;
  const list=[];
  while(list.length<limit){
    const s=solar?+solar.peak.date:Infinity,l=lunar?+lunar.peak.date:Infinity;
    if(!Number.isFinite(s)&&!Number.isFinite(l))break;
    if(s<=l){list.push(buildSolarEvent(solar));solar=A.NextGlobalSolarEclipse(solar.peak);}
    else{list.push(buildEvent(lunar));lunar=A.NextLunarEclipse(lunar.peak);}
  }
  return list;
}
export function findEclipseEvents(start,count=6,types='all'){
  validateSearch(start,count,types);
  return collectForward(start,count,types);
}
export function collectEclipses(start,end,types='all'){
  if(!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw new Error('无效的搜索区间。');
  if(!['all','solar','lunar'].includes(types))throw new Error('请选择全部、只日食或只月食。');
  const list=collectForward(start,12,types).filter(e=>e.peakMs<+end);
  if(!list.length)return list;
  // Continue until we pass the end; years have at most 7 eclipses, but stay defensive.
  let more=list.at(-1);
  while(true){
    const next=collectForward(new Date(more.peakMs+60000),4,types);
    let added=0;
    for(const e of next){
      if(e.peakMs>=+end)return list;
      if(list.some(x=>x.body===e.body&&x.peakMs===e.peakMs))continue;
      list.push(e);more=e;added++;
    }
    if(!added)return list;
  }
}
export function listYearEclipses(year,types='all'){
  const {start,end}=yearBounds(year);
  return collectEclipses(start,end,types);
}
export function findPreviousEclipseEvents(start,count=6,types='all'){
  validateSearch(start,count,types);
  const floor=+parseStartDate('1900-01-01');
  let lookback=Math.max(240,count*90)*86400000;
  for(let attempt=0;attempt<6;attempt++){
    const from=new Date(Math.max(floor,+start-lookback));
    const list=collectEclipses(from,start,types);
    if(list.length>=count||+from<=floor)return list.slice(-count);
    lookback*=2;
  }
  return collectEclipses(new Date(floor),start,types).slice(-count);
}
export function localSky(ms,lat,lon){
  validateLocation(lat,lon);const date=new Date(ms),obs=new A.Observer(lat,lon,0);
  const moon=A.Equator(A.Body.Moon,date,obs,true,true),sun=A.Equator(A.Body.Sun,date,obs,true,true);
  const mh=A.Horizon(date,obs,moon.ra,moon.dec),sh=A.Horizon(date,obs,sun.ra,sun.dec);
  return {altitude:mh.altitude,azimuth:mh.azimuth,sunAltitude:sh.altitude,visible:mh.altitude>0};
}
export function worldFrame(ms){
  const t=new A.AstroTime(new Date(ms)),rot=A.Rotation_EQJ_EQD(t);
  const moon=A.RotateVector(rot,A.GeoVector(A.Body.Moon,t,true));
  const sun=A.RotateVector(rot,A.GeoVector(A.Body.Sun,t,true));
  const eq=A.EquatorFromVector(moon),sunEq=A.EquatorFromVector(sun),sidereal=A.SiderealTime(t);
  return {
    ms,moon:[moon.x*AU_KM,moon.y*AU_KM,moon.z*AU_KM],sun:[sun.x*AU_KM,sun.y*AU_KM,sun.z*AU_KM],
    sidereal,ra:eq.ra,dec:eq.dec,subLat:eq.dec,subLon:signedLongitude(15*(eq.ra-sidereal)),
    sunRa:sunEq.ra,sunDec:sunEq.dec,sunSubLat:sunEq.dec,sunSubLon:signedLongitude(15*(sunEq.ra-sidereal)),
    jdUT:t.ut+2451545,jdTT:t.tt+2451545
  };
}
export function observerVector(lat,lon,sidereal){
  const p=lat*DEG,theta=(sidereal*15+lon)*DEG,cp=Math.cos(p),sp=Math.sin(p),ct=Math.cos(theta),st=Math.sin(theta);
  const n=R/Math.hypot(cp,F*sp);
  return {n:[cp*ct,cp*st,sp],r:[n*cp*ct,n*cp*st,n*F*F*sp]};
}
// Topocentric geometric altitude from a geodetic sea-level ellipsoid observer.
// The vector and GAST are both true-equator/equinox-of-date, never mixed J2000.
export function gridAltitude(frame,lat,lon,body='moon'){
  const o=observerVector(lat,lon,frame.sidereal),v=frame[body];
  const dx=v[0]-o.r[0],dy=v[1]-o.r[1],dz=v[2]-o.r[2];
  return Math.asin(Math.max(-1,Math.min(1,(dx*o.n[0]+dy*o.n[1]+dz*o.n[2])/Math.hypot(dx,dy,dz))))/DEG;
}
function clamp(x){return Math.max(-1,Math.min(1,x));}
function angle(ax,ay,az,bx,by,bz){
  const da=Math.hypot(ax,ay,az),db=Math.hypot(bx,by,bz);
  return Math.acos(clamp((ax*bx+ay*by+az*bz)/(da*db)));
}
function diskObscuration(rs,rm,sep){
  if(sep>=rs+rm)return 0;
  if(sep<=Math.abs(rs-rm))return rm>=rs?1:(rm*rm)/(rs*rs);
  const r1=rs*rs,r2=rm*rm;
  const a1=Math.acos(clamp((sep*sep+r1-r2)/(2*sep*rs)));
  const a2=Math.acos(clamp((sep*sep+r2-r1)/(2*sep*rm)));
  const overlap=r1*a1+r2*a2-0.5*Math.sqrt(Math.max(0,(-sep+rs+rm)*(sep+rs-rm)*(sep-rs+rm)*(sep+rs+rm)));
  return overlap/(Math.PI*r1);
}
export function solarCircumstancesAt(frame,lat,lon){
  const o=observerVector(lat,lon,frame.sidereal);
  const sx=frame.sun[0]-o.r[0],sy=frame.sun[1]-o.r[1],sz=frame.sun[2]-o.r[2];
  const mx=frame.moon[0]-o.r[0],my=frame.moon[1]-o.r[1],mz=frame.moon[2]-o.r[2];
  const ds=Math.hypot(sx,sy,sz),dm=Math.hypot(mx,my,mz);
  const sunAlt=Math.asin(clamp((sx*o.n[0]+sy*o.n[1]+sz*o.n[2])/ds))/DEG;
  const sep=angle(sx,sy,sz,mx,my,mz);
  const rs=Math.asin(clamp(SUN_R/ds)),rm=Math.asin(clamp(MOON_R/dm));
  let type='none';
  if(sep<rs+rm){
    if(sep<=Math.abs(rs-rm))type=rm>=rs?'total':'annular';
    else type='partial';
  }
  const magnitude=type==='none'?0:(rs+rm-sep)/(2*rs);
  const obscuration=type==='none'?0:type==='total'?1:diskObscuration(rs,rm,sep);
  return {sunAlt,sep,rs,rm,type,magnitude,obscuration,sunAbove:sunAlt>0};
}
export function solarShadow(frame){
  const S=frame.sun,M=frame.moon,D=[M[0]-S[0],M[1]-S[1],M[2]-S[2]],d=Math.hypot(...D);
  const cx=M[1]*D[2]-M[2]*D[1],cy=M[2]*D[0]-M[0]*D[2],cz=M[0]*D[1]-M[1]*D[0];
  const dist=Math.hypot(cx,cy,cz)/d;
  const hx=D[0]/d,hy=D[1]/d,hz=D[2]/d;
  const tClosest=-(M[0]*hx+M[1]*hy+M[2]*hz);
  const p=MOON_R+tClosest*(SUN_R+MOON_R)/d;
  const k=MOON_R-tClosest*(SUN_R-MOON_R)/d;
  return {dist,p,k,tClosest,touches:dist<p+EARTH_MEAN};
}
function equatorPoint(frame,vx,vy,vz){
  const dec=Math.atan2(vz,Math.hypot(vx,vy))/DEG;
  const ra=Math.atan2(vy,vx)/DEG/15; // hours, range could be negative
  const raH=((ra%24)+24)%24;
  return {lat:dec,lon:signedLongitude(15*(raH-frame.sidereal))};
}
export function shadowAxisPoint(frame){
  const sh=solarShadow(frame);
  const S=frame.sun,M=frame.moon,D=[M[0]-S[0],M[1]-S[1],M[2]-S[2]],d=Math.hypot(...D);
  const hx=D[0]/d,hy=D[1]/d,hz=D[2]/d;
  // Closest point on axis to Earth center, then if inside the sphere the dayside intersection;
  // if outside, the surface point toward the axis.
  const cx=M[0]+sh.tClosest*hx,cy=M[1]+sh.tClosest*hy,cz=M[2]+sh.tClosest*hz;
  const scale=sh.dist>1e-6?Math.min(1,R/sh.dist):1;
  // Prefer the dayside intersection when the axis meets the Earth.
  if(sh.dist<R){
    const half=Math.sqrt(Math.max(0,R*R-sh.dist*sh.dist));
    const px=cx-half*hx,py=cy-half*hy,pz=cz-half*hz;
    return {...sh,...equatorPoint(frame,px,py,pz),intersects:true};
  }
  const px=cx*scale,py=cy*scale,pz=cz*scale;
  return {...sh,...equatorPoint(frame,px,py,pz),intersects:false};
}
export function solarWindow(peakMs){
  const span=6*3600000,step=180000;
  let first=null,last=null;
  for(let t=peakMs-span;t<=peakMs+span;t+=step){
    if(solarShadow(worldFrame(t)).touches){if(first===null)first=t;last=t;}
  }
  if(first===null)return {start:peakMs-3*3600000,end:peakMs+3*3600000};
  const edge=(lo,hi,insideLo)=>{
    for(let i=0;i<24;i++){
      const mid=(lo+hi)/2;
      if(solarShadow(worldFrame(mid)).touches===insideLo)lo=mid;else hi=mid;
    }
    return (lo+hi)/2;
  };
  return {start:edge(first-step,first,false),end:edge(last,last+step,true)};
}
export function localSolarCircumstances(event,lat,lon){
  validateLocation(lat,lon);
  const start=event.start,end=event.end;
  let bestT=event.peakMs,bestSep=Infinity;
  for(let t=start;t<=end;t=Math.min(t+180000,end)){
    const c=solarCircumstancesAt(worldFrame(t),lat,lon);
    if(c.sep<bestSep){bestSep=c.sep;bestT=t;}
    if(t===end)break;
  }
  let lo=Math.max(start,bestT-180000),hi=Math.min(end,bestT+180000);
  for(let i=0;i<24;i++){
    const a=lo+(hi-lo)/3,b=hi-(hi-lo)/3;
    if(solarCircumstancesAt(worldFrame(a),lat,lon).sep<=solarCircumstancesAt(worldFrame(b),lat,lon).sep)hi=b;else lo=a;
  }
  bestT=(lo+hi)/2;
  const peak=solarCircumstancesAt(worldFrame(bestT),lat,lon);
  const inEclipse=peak.sep<peak.rs+peak.rm-1e-10;
  const root=(target,left,right,startInside)=>{
    let lo=left,hi=right;
    for(let i=0;i<28;i++){
      const mid=(lo+hi)/2,c=solarCircumstancesAt(worldFrame(mid),lat,lon);
      const inside=c.sep<target(c);
      if(inside===startInside)lo=mid;else hi=mid;
    }
    return (lo+hi)/2;
  };
  const contacts=[];
  if(inEclipse){
    const p1=root(c=>c.rs+c.rm,start,bestT,false);
    const p4=root(c=>c.rs+c.rm,bestT,end,true);
    contacts.push({key:'P1',label:'初亏',ms:p1});
    if(peak.type==='total'||peak.type==='annular'){
      const inner=c=>Math.abs(c.rs-c.rm);
      const u2=root(inner,p1,bestT,false);
      const u3=root(inner,bestT,p4,true);
      contacts.push({key:'U2',label:peak.type==='total'?'食既':'环食始',ms:u2});
      contacts.push({key:'MAX',label:'食甚',ms:bestT});
      contacts.push({key:'U3',label:peak.type==='total'?'生光':'环食终',ms:u3});
    }else contacts.push({key:'MAX',label:'食甚',ms:bestT});
    contacts.push({key:'P4',label:'复圆',ms:p4});
  }else contacts.push({key:'MAX',label:'最近时刻',ms:bestT});
  const withSky=contacts.map(c=>{
    const sky=solarCircumstancesAt(worldFrame(c.ms),lat,lon);
    return {...c,sky};
  });
  let previous=inEclipse?withSky[0].ms:start,prevSun=solarCircumstancesAt(worldFrame(previous),lat,lon).sunAlt,roots=[];
  const scanStart=inEclipse?withSky[0].ms:start,scanEnd=inEclipse?withSky.at(-1).ms:end;
  for(let t=Math.min(previous+180000,scanEnd);t<=scanEnd;){
    const a=solarCircumstancesAt(worldFrame(t),lat,lon).sunAlt;
    if((a>0)!==(prevSun>0)){
      let lo=previous,hi=t,initial=prevSun>0;
      for(let k=0;k<24;k++){const mid=(lo+hi)/2;if((solarCircumstancesAt(worldFrame(mid),lat,lon).sunAlt>0)===initial)lo=mid;else hi=mid;}
      roots.push((lo+hi)/2);
    }
    if(t===scanEnd)break;previous=t;prevSun=a;t=Math.min(t+180000,scanEnd);
  }
  const bounds=[scanStart,...roots,scanEnd],windows=[];
  if(inEclipse){
    for(let j=0;j<bounds.length-1;j++)if(solarCircumstancesAt(worldFrame((bounds[j]+bounds[j+1])/2),lat,lon).sunAlt>0)windows.push([bounds[j],bounds[j+1]]);
  }
  const visible=inEclipse&&windows.length>0;
  return {
    visible,inEclipse,reason:!inEclipse?'outside':visible?'visible':'below-horizon',
    kind:inEclipse?peak.type:'none',obscuration:peak.obscuration,magnitude:peak.magnitude,
    peakMs:bestT,peak,contacts:withSky,windows,
    minutes:windows.reduce((s,[a,b])=>s+(b-a)/60000,0)
  };
}
export function phaseAt(event,ms){
  if(event.body==='solar'){
    if(ms<event.start||ms>event.end)return '日食之外';
    const sh=solarShadow(worldFrame(ms));
    if(!sh.touches)return '日食之外';
    if(sh.dist<Math.abs(sh.k)+EARTH_MEAN)return sh.k>0?'本影在地球上':'伪本影在地球上';
    return '仅半影在地球上';
  }
  const at=key=>event.contacts.find(c=>c.key===key).ms;
  if(ms<event.start||ms>event.end)return '月食之外';
  if(at('U2')!==null&&ms>=at('U2')&&ms<=at('U3'))return '全食阶段';
  if(at('U1')!==null&&ms>=at('U1')&&ms<=at('U4'))return '偏食阶段';
  return '半影阶段';
}
export function localCoverage(event,lat,lon){
  validateLocation(lat,lon);const obs=new A.Observer(lat,lon,0),start=new Date(event.start-12*3600000);
  const rise=A.SearchAltitude(A.Body.Moon,obs,+1,start,1.5,0);
  const set=A.SearchAltitude(A.Body.Moon,obs,-1,start,1.5,0);
  const altitude=ms=>localSky(ms,lat,lon).altitude;
  let previous=event.start,pa=altitude(previous);const roots=[];
  for(let t=Math.min(previous+180000,event.end);t<=event.end;){
    const a=altitude(t);
    if((a>0)!==(pa>0)){
      let lo=previous,hi=t,initial=pa>0;
      for(let k=0;k<24;k++){const mid=(lo+hi)/2;if((altitude(mid)>0)===initial)lo=mid;else hi=mid;}
      roots.push((lo+hi)/2);
    }
    if(t===event.end)break;previous=t;pa=a;t=Math.min(t+180000,event.end);
  }
  const bounds=[event.start,...roots,event.end],windows=[];
  for(let j=0;j<bounds.length-1;j++)if(altitude((bounds[j]+bounds[j+1])/2)>0)windows.push([bounds[j],bounds[j+1]]);
  return {rise:rise?+rise.date:null,set:set?+set.date:null,windows,minutes:windows.reduce((s,[a,b])=>s+(b-a)/60000,0),altitudes:event.contacts.map(c=>({...c,sky:c.ms===null?null:localSky(c.ms,lat,lon)}))};
}
const cstFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export const cst=ms=>ms===null?'不发生':cstFormat.format(new Date(Math.round(ms/60000)*60000));
export const utc=ms=>new Date(Math.round(ms/60000)*60000).toISOString().slice(0,16).replace('T',' ')+' UTC';
export function formatLatLon(lat,lon){
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return '无中心食点（偏食）';
  const ns=lat>=0?'N':'S',ew=lon>=0?'E':'W';
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`;
}
