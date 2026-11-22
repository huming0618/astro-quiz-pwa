import * as A from './vendor/astronomy-engine.mjs';
export { A };
export const DEG=Math.PI/180, AU_KM=149597870.7;
const F=0.996647180302104, R=6378.1366;
export const kindLabel=k=>({penumbral:'半影月食',partial:'月偏食',total:'月全食'}[k]||k);
export const signedLongitude=x=>((x+180)%360+360)%360-180;
export function parseStartDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('请输入完整的起始日期。');
  const y=Number(value.slice(0,4));if(y<1900||y>2099)throw new Error('请选择 1900—2099 年的日期。');
  const d=new Date(value+'T00:00:00+08:00');
  if(!Number.isFinite(+d)||new Date(+d+8*3600000).toISOString().slice(0,10)!==value)throw new Error('日期不存在，请重新选择。');
  return d;
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
  return {...e,peakMs:peak,contacts:[contact('P1','半影食始',-e.sd_penum),contact('U1','初亏',e.sd_partial>0?-e.sd_partial:null),contact('U2','食既',e.sd_total>0?-e.sd_total:null),contact('MAX','食甚',0),contact('U3','生光',e.sd_total>0?e.sd_total:null),contact('U4','复圆',e.sd_partial>0?e.sd_partial:null),contact('P4','半影食终',e.sd_penum)],start:peak-e.sd_penum*60000,end:peak+e.sd_penum*60000};
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
  const eq=A.EquatorFromVector(moon),sidereal=A.SiderealTime(t);
  return {ms,moon:[moon.x*AU_KM,moon.y*AU_KM,moon.z*AU_KM],sun:[sun.x*AU_KM,sun.y*AU_KM,sun.z*AU_KM],sidereal,ra:eq.ra,dec:eq.dec,subLat:eq.dec,subLon:signedLongitude(15*(eq.ra-sidereal)),jdUT:t.ut+2451545,jdTT:t.tt+2451545};
}
// Topocentric geometric altitude from a geodetic sea-level ellipsoid observer.
// The vector and GAST are both true-equator/equinox-of-date, never mixed J2000.
export function gridAltitude(frame,lat,lon,body='moon'){
  const p=lat*DEG,theta=(frame.sidereal*15+lon)*DEG,cp=Math.cos(p),sp=Math.sin(p),ct=Math.cos(theta),st=Math.sin(theta);
  const n=R/Math.hypot(cp,F*sp),v=frame[body];
  const dx=v[0]-n*cp*ct,dy=v[1]-n*cp*st,dz=v[2]-n*F*F*sp;
  return Math.asin(Math.max(-1,Math.min(1,(dx*cp*ct+dy*cp*st+dz*sp)/Math.hypot(dx,dy,dz))))/DEG;
}
export function phaseAt(event,ms){
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
