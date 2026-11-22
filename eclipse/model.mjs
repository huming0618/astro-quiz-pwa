// Distances in Earth equatorial radii; ideal circular orbits, fixed nodes.
export const C = Object.freeze({distance:60.3, moonRadius:0.273, sunRadius:109.1, sunDistance:23455, inclination:5.145, siderealMonth:27.32166, year:365.25636});
export const radians = degrees => degrees * Math.PI / 180;
export const wrap = degrees => ((degrees % 360) + 360) % 360;
export function fullMoonAngle(annual, inclination=C.inclination) {
  const a=radians(annual), i=radians(inclination);
  return wrap(Math.atan2(Math.sin(a)/Math.cos(i), Math.cos(a))*180/Math.PI);
}
export function evaluate(annual, orbital, inclination=C.inclination) {
  const a=radians(annual), u=radians(orbital), i=radians(inclination);
  const axis=[Math.cos(a),0,Math.sin(a)];
  const moon=[C.distance*Math.cos(u),C.distance*Math.sin(u)*Math.sin(i),C.distance*Math.sin(u)*Math.cos(i)];
  const axial=moon[0]*axis[0]+moon[2]*axis[2];
  const lateral=-moon[0]*axis[2]+moon[2]*axis[0];
  const separation=Math.hypot(lateral,moon[1]);
  const umbra=Math.max(0,1-axial*(C.sunRadius-1)/C.sunDistance);
  const penumbra=1+axial*(C.sunRadius+1)/C.sunDistance;
  const behind=axial>0;
  let kind='none';
  if(behind && separation < penumbra+C.moonRadius) kind='penumbral';
  if(behind && separation < umbra+C.moonRadius) kind='partial';
  if(behind && separation+C.moonRadius <= umbra) kind='total';
  const longitude=Math.atan2(moon[2],moon[0])*180/Math.PI;
  const phaseOffset=wrap(longitude-annual+180)-180;
  const nearFull=Math.abs(phaseOffset)<8;
  return {axis,moon,axial,lateral,separation,umbra,penumbra,behind,kind,phaseOffset,nearFull,latitude:Math.asin(moon[1]/C.distance)*180/Math.PI};
}
export function advance(annual, orbital, days) {
  return {annual:wrap(annual+days*360/C.year), orbital:wrap(orbital+days*360/C.siderealMonth)};
}
export function nextFull(annual, orbital, inclination=C.inclination) {
  // Search forward in physical time. Projected longitude is slightly non-uniform.
  const phase = days => {const t=advance(annual,orbital,days);return evaluate(t.annual,t.orbital,inclination).phaseOffset;};
  let prev=phase(0.001), lo=0.001;
  for(let hi=0.1;hi<=35;hi+=0.1) {
    const current=phase(hi);
    if(prev<0 && current>=0 && current-prev<180) {
      let left=lo,right=hi;
      for(let n=0;n<40;n++){const mid=(left+right)/2;if(phase(mid)<0)left=mid;else right=mid;}
      return advance(annual,orbital,(left+right)/2);
    }
    prev=current;lo=hi;
  }
  throw new Error('Full moon root not found');
}
