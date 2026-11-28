import assert from 'node:assert/strict';
import fs from 'node:fs';
import {A,parseStartDate,parseYear,todayCSTDate,validateLocation,findEvents,findEclipseEvents,findPreviousEclipseEvents,listYearEclipses,localSolarCircumstances,worldFrame,localSky,gridAltitude,localCoverage,phaseAt,cst} from '../forecast-core.mjs';
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
let count=0;function test(label,fn){fn();count++;console.log('PASS',label);}
const references=JSON.parse(fs.readFileSync(new URL('../research/nasa-reference.json',import.meta.url))),results=[];
test('NASA independent total / partial contact verification (no more than 2 minutes)',()=>{
 for(const reference of references.references){const e=findEvents(parseStartDate(reference.start),1)[0];assert.equal(e.kind,reference.kind);const errors={};
  for(const [key,iso]of Object.entries(reference.contactsUTC)){const computed=e.contacts.find(c=>c.key===key).ms;assert.notEqual(computed,null);const error=(computed-Date.parse(iso))/60000;assert.ok(Math.abs(error)<2,`${reference.date} ${key}: ${error} min`);errors[key]={nasaCST:cst(Date.parse(iso)),computedCST:cst(computed),errorMinutes:error};}
  const maxContactErrorMinutes=Math.max(...Object.entries(errors).filter(([k])=>k!=='MAX').map(([,v])=>Math.abs(v.errorMinutes)));
  const result={dateCST:cst(e.peakMs).slice(0,10),kind:e.kind,source:reference.source,peakErrorMinutes:errors.MAX.errorMinutes,maxContactErrorMinutes,errors};results.push(result);console.log(JSON.stringify(result,null,2));
 }
});
test('date parsing is Shanghai midnight; invalid rollover/range rejected',()=>{assert.equal(parseStartDate('2026-11-22').toISOString(),'2026-11-21T16:00:00.000Z');for(const d of ['','2026-02-30','2026-2-3','1899-12-31','2100-01-01','not-a-date'])assert.throws(()=>parseStartDate(d));});
test('location validation handles extremes, empty, nonfinite and out of range',()=>{assert.deepEqual(validateLocation('-90','180'),{lat:-90,lon:180});for(const [lat,lon]of [[null,0],[true,0],['',20],[30,''],[91,0],[0,-181],[NaN,0],[0,Infinity],['x',0]])assert.throws(()=>validateLocation(lat,lon));});
const upcoming=findEvents(parseStartDate('2026-11-22'));
test('default search: real 2027 February penumbral eclipse, increasing list',()=>{assert.equal(upcoming.length,4);assert.equal(upcoming[0].kind,'penumbral');assert.equal(cst(upcoming[0].peakMs),'2027-02-21 07:13');for(let i=1;i<upcoming.length;i++)assert.ok(upcoming[i].peakMs>upcoming[i-1].peakMs);});
test('absent umbral/total contacts never appear as spurious peak dates',()=>{const e=upcoming[0];for(const key of ['U1','U2','U3','U4'])assert.equal(e.contacts.find(c=>c.key===key).ms,null);assert.equal(phaseAt(e,e.peakMs),'半影阶段');const partial=findEvents(parseStartDate('2026-08-01'),1)[0];for(const key of ['U2','U3'])assert.equal(partial.contacts.find(c=>c.key===key).ms,null);});
test('all present contacts are chronological with symmetric semi-duration reconstruction',()=>{for(const e of [...upcoming,...findEvents(parseStartDate('2026-01-01'),2)]){let last=-Infinity;for(const c of e.contacts.filter(c=>c.ms!==null)){assert.ok(c.ms>=last);last=c.ms;}close((e.start+e.end)/2,e.peakMs,.001);assert.equal(phaseAt(e,e.start-1),'月食之外');}});
let maxAltitudeError=0;
test('ellipsoid map altitude agrees with independent Equator/Horizon at 651 positions and times',()=>{for(const e of upcoming.slice(0,3)){const f=worldFrame(e.peakMs);for(let lat=-90;lat<=90;lat+=30)for(let lon=-180;lon<=180;lon+=12){const alt=gridAltitude(f,lat,lon),direct=localSky(e.peakMs,lat,lon).altitude;const error=Math.abs(alt-direct);maxAltitudeError=Math.max(maxAltitudeError,error);close(alt,direct,1e-5);}}});
test('sub-lunar point is above and antipode below; seam +/-180 continuous',()=>{for(const e of upcoming){const f=worldFrame(e.peakMs);assert.ok(gridAltitude(f,f.subLat,f.subLon)>89.9);assert.ok(gridAltitude(f,-f.subLat,f.subLon+180)<-89.9);for(const lat of [-90,-60,0,60,90])close(gridAltitude(f,lat,-180),gridAltitude(f,lat,180));}});
test('geometric h=0 boundary and parallax: geocentric horizon is below topocentric horizon',()=>{const f=worldFrame(upcoming[0].peakMs),ra=f.ra*15-f.sidereal*15;assert.ok(gridAltitude(f,0,ra+90)<-.8);let lo=ra,hi=ra+90;for(let n=0;n<40;n++){const mid=(lo+hi)/2;if(gridAltitude(f,0,mid)>0)lo=mid;else hi=mid;}close(gridAltitude(f,0,(lo+hi)/2),0,1e-7);});
test('moon visible mask differs from night hemisphere and is slightly smaller than half Earth',()=>{const f=worldFrame(upcoming[0].peakMs);let different=0,visible=0,weight=0;for(let lat=-89;lat<=89;lat+=2)for(let lon=-179;lon<=179;lon+=2){const w=Math.cos(lat*Math.PI/180),v=gridAltitude(f,lat,lon)>0,n=gridAltitude(f,lat,lon,'sun')<0;weight+=w;if(v)visible+=w;if(v!==n)different++;}assert.ok(different>0);assert.ok(visible/weight>.47&&visible/weight<.5);console.log('visible Earth fraction',visible/weight,'different mask cells',different);});
test('Chengdu penumbral eclipse coverage ends at geometric moonset',()=>{const e=upcoming[0],c=localCoverage(e,30.57,104.07);assert.equal(c.windows.length,1);assert.ok(c.minutes>130&&c.minutes<150);close(c.windows[0][0],e.start,.001);close(localSky(c.windows[0][1],30.57,104.07).altitude,0,1e-4);assert.ok(c.set>e.start&&c.set<e.end);});
test('full coverage at sub-lunar point; no coverage near opposite longitude',()=>{const e=upcoming[0],f=worldFrame(e.peakMs);const yes=localCoverage(e,f.subLat,f.subLon),no=localCoverage(e,-f.subLat,f.subLon>0?f.subLon-180:f.subLon+180);assert.ok(yes.minutes>2*e.sd_penum-.01);assert.equal(no.minutes,0);});
test('polar no-rise/no-set handled without invalid dates',()=>{const e=upcoming[0],north=localCoverage(e,90,180),south=localCoverage(e,-90,-180);assert.equal(north.rise,null);assert.equal(north.set,null);close(north.minutes,2*e.sd_penum,.001);assert.equal(south.minutes,0);});
test('search filters by peak rather than a nearby full-moon instant',()=>{const peak=upcoming[0].peakMs;assert.equal(findEvents(new Date(peak-60000),1)[0].peakMs,peak);assert.ok(findEvents(new Date(peak+60000),1)[0].peakMs>peak);});

test('todayCSTDate follows Asia/Shanghai and is a valid parseable date',()=>{
 const d=todayCSTDate(new Date('2026-11-27T16:30:00Z'));
 assert.equal(d,'2026-11-28');
 assert.equal(+parseStartDate(todayCSTDate(new Date('2026-11-28T00:00:00+08:00'))),+parseStartDate('2026-11-28'));
});
const solarRefs=references.solarReferences;
const solarResults=[];
test('NASA independent solar greatest-eclipse verification (peak within 2 minutes)',()=>{
 for(const reference of solarRefs){
  const e=findEclipseEvents(parseStartDate(reference.start),1,'solar')[0];
  assert.equal(e.body,'solar');assert.equal(e.kind,reference.kind);
  const error=(e.peakMs-Date.parse(reference.peakUTC))/60000;
  assert.ok(Math.abs(error)<2,`${reference.date} peak ${error} min`);
  const result={body:'solar',dateCST:cst(e.peakMs).slice(0,10),kind:e.kind,source:reference.source,peakErrorMinutes:error,maxContactErrorMinutes:null,nasaUT:reference.peakUTC,computedUTC:new Date(e.peakMs).toISOString()};
  solarResults.push(result);console.log(JSON.stringify(result,null,2));
 }
});
test('mixed forward search is chronological and interleaves solar and lunar',()=>{
 const list=findEclipseEvents(parseStartDate('2026-01-01'),6,'all');
 assert.equal(list.length,6);
 assert.ok(list.some(e=>e.body==='solar')&&list.some(e=>e.body==='lunar'));
 for(let i=1;i<list.length;i++)assert.ok(list[i].peakMs>list[i-1].peakMs);
 assert.equal(list[0].body,'solar');assert.equal(list[0].kind,'annular');assert.equal(cst(list[0].peakMs),'2026-02-17 20:12');
 assert.equal(list[1].body,'lunar');assert.equal(list[1].kind,'total');assert.equal(cst(list[1].peakMs),'2026-03-03 19:34');
 const solarOnly=findEclipseEvents(parseStartDate('2026-01-01'),2,'solar');
 assert.ok(solarOnly.every(e=>e.body==='solar'));
 assert.equal(cst(solarOnly[1].peakMs),'2026-08-13 01:46');
 const lunarOnly=findEclipseEvents(parseStartDate('2026-01-01'),2,'lunar');
 assert.ok(lunarOnly.every(e=>e.body==='lunar'));
});
test('backward search returns earlier events in chronological order without duplicating the boundary',()=>{
 const start=parseStartDate('2026-11-22');
 const prev=findPreviousEclipseEvents(start,6,'all');
 assert.equal(prev.length,6);
 for(let i=1;i<prev.length;i++)assert.ok(prev[i].peakMs>prev[i-1].peakMs);
 assert.ok(prev.every(e=>e.peakMs<+start));
 assert.equal(cst(prev.at(-1).peakMs),'2026-08-28 12:13');
 const again=findPreviousEclipseEvents(new Date(prev[0].peakMs),4,'all');
 assert.ok(again.every(e=>e.peakMs<prev[0].peakMs));
 assert.equal(again.at(-1).peakMs,prev.length?findPreviousEclipseEvents(new Date(prev[0].peakMs),1,'all')[0].peakMs:again.at(-1).peakMs);
});
test('year list for 2026 contains both solar and lunar events in Beijing time',()=>{
 const list=listYearEclipses(2026);
 assert.equal(list.length,4);
 assert.deepEqual(list.map(e=>e.body),['solar','lunar','solar','lunar']);
 assert.equal(cst(list[0].peakMs),'2026-02-17 20:12');
 assert.equal(cst(list[2].peakMs),'2026-08-13 01:46');
 assert.equal(listYearEclipses(2026,'solar').length,2);
 assert.equal(listYearEclipses(2026,'lunar').length,2);
 assert.throws(()=>parseYear('1899'));assert.throws(()=>parseYear('2100'));assert.equal(parseYear('2026'),2026);
 const year2026=list.filter(e=>cst(e.peakMs).startsWith('2026-'));
 assert.equal(year2026.length,4);
});
test('Chengdu can see the 2020 June annular eclipse as a deep partial, but not the 2026 August total',()=>{
 const visible=localSolarCircumstances(findEclipseEvents(parseStartDate('2020-06-20'),1,'solar')[0],30.57,104.07);
 assert.equal(visible.visible,true);assert.equal(visible.reason,'visible');assert.equal(visible.kind,'partial');
 assert.ok(visible.obscuration>0.9);assert.ok(visible.peak.sunAlt>50);
 assert.equal(cst(visible.peakMs),'2020-06-21 15:43');
 const engine=A.SearchLocalSolarEclipse(new Date(Date.parse('2020-06-19T00:00:00Z')),new A.Observer(30.57,104.07,0));
 assert.ok(Math.abs(visible.peakMs-+engine.peak.time.date)<1000);
 const hidden=localSolarCircumstances(findEclipseEvents(parseStartDate('2026-08-10'),1,'solar')[0],30.57,104.07);
 assert.equal(hidden.visible,false);assert.ok(['below-horizon','outside'].includes(hidden.reason));
 assert.ok(hidden.peak.sunAlt<0);
 const outside=localSolarCircumstances(findEclipseEvents(parseStartDate('2026-02-16'),1,'solar')[0],30.57,104.07);
 assert.equal(outside.visible,false);assert.equal(outside.reason,'outside');
});
const report={engine:'Astronomy Engine 2.1.19',calculation:'Lunar contact times reconstructed symmetrically as peak +/- sd. Solar greatest-eclipse times from SearchGlobalSolarEclipse. Topocentric geometric altitude without refraction. Local solar contacts from disk geometry.',results,solarResults,maxAltitudeErrorDegrees:maxAltitudeError,testGroups:count};
if(process.argv.includes('--write'))fs.writeFileSync(new URL('../research/validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(`All ${count} forecast test groups passed; max map/direct altitude difference ${maxAltitudeError} degrees.`);
