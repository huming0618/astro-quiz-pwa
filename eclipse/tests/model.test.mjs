import assert from 'node:assert/strict';
import {C,evaluate,fullMoonAngle,advance,nextFull} from '../model.mjs';
let checks=0;
function check(label,fn){fn();checks++;console.log(`PASS ${label}`);}
const close=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} not close to ${b}`);
check('ordinary full moon misses shadow above ecliptic',()=>{const r=evaluate(90,90);assert.equal(r.kind,'none');assert.equal(r.nearFull,true);close(r.latitude,C.inclination);assert.ok(r.separation>5.4);});
check('full moon at ascending node is total eclipse',()=>{const r=evaluate(0,0);assert.equal(r.kind,'total');close(r.separation,0);assert.ok(r.umbra>.72&&r.umbra<.73);assert.ok(r.penumbra>1.28&&r.penumbra<1.29);});
check('descending node full moon also eclipses',()=>assert.equal(evaluate(180,180).kind,'total'));
check('ordinary full moon passes below at other season',()=>{const r=evaluate(270,270);assert.equal(r.kind,'none');assert.ok(r.latitude<0);});
check('new moon on sunward side never eclipses',()=>{for(let a=0;a<360;a+=5){const r=evaluate(a,fullMoonAngle(a)+180);assert.equal(r.kind,'none');assert.equal(r.behind,false);}});
check('partial and penumbral overlaps derived from axis distance',()=>{assert.equal(evaluate(0,.7).kind,'partial');assert.equal(evaluate(0,1.1).kind,'penumbral');assert.equal(evaluate(0,2).kind,'none');});
check('zero inclination eclipses at every full moon, not throughout month',()=>{for(let a=0;a<360;a+=5){assert.equal(evaluate(a,fullMoonAngle(a,0),0).kind,'total');assert.equal(evaluate(a,a+90,0).kind,'none');assert.equal(evaluate(a,a+180,0).kind,'none');}});
check('projected full-moon solver across all annual directions',()=>{for(let a=0;a<360;a+=.5){const r=evaluate(a,fullMoonAngle(a));close(r.phaseOffset,0);assert.ok(r.behind);}});
check('moon distance constant; nodes fixed in inertial frame',()=>{for(let u=0;u<360;u++){const r=evaluate(23,u);close(Math.hypot(...r.moon),C.distance);}close(evaluate(100,0).moon[1],0);close(evaluate(250,180).moon[1],0);});
check('physical rates produce synodic, not sidereal, full-moon interval',()=>{const t=nextFull(0,0);const days=t.annual*C.year/360;assert.ok(days>29.4&&days<29.7);close(evaluate(t.annual,t.orbital).phaseOffset,0,1e-6);assert.equal(evaluate(t.annual,t.orbital).kind,'none');});
check('next-full solver works with realistic / counterfactual tilt and wrapped angles',()=>{for(const i of [0,C.inclination])for(const a of [0,85,180,359])for(const u of [0,66,180,359]){const t=nextFull(a,u,i);close(evaluate(t.annual,t.orbital,i).phaseOffset,0,1e-6);}});
check('eclipses only near full moon, behind Earth, with physical overlap',()=>{let total=0,partial=0,penumbral=0;for(let a=0;a<360;a+=2)for(let u=0;u<360;u+=.25){const r=evaluate(a,u);if(r.kind!=='none'){assert.ok(r.behind);assert.ok(Math.abs(r.phaseOffset)<2);assert.ok(r.separation<r.penumbra+C.moonRadius);if(r.kind==='total')total++;if(r.kind==='partial')partial++;if(r.kind==='penumbral')penumbral++;}}assert.ok(total>0&&partial>0&&penumbral>0);console.log({total,partial,penumbral});});
check('continuous orbital advance preserves rates and angle bounds',()=>{const s=advance(359,359,2);assert.ok(s.annual>=0&&s.annual<360);assert.ok(s.orbital>=0&&s.orbital<360);});
console.log(`All ${checks} geometry test groups passed.`);
