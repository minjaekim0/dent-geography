import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cellContains,gridDistribution,distanceRing} from '../dist/grid-flow-model.mjs';
import {allocationShare,distance} from '../dist/catchment-model.mjs';
import {topImpacts} from '../dist/catchment-impact-model.mjs';
const geometry=[126.9995,37.4995,127.0005,37.4995,127.0005,37.5005,126.9995,37.5005];
const cell={lat:37.5,lng:127,population:100,workers:200};
const clinics=[{id:'a',name:'A',lat:37.501,lng:127},{id:'b',name:'B',lat:37.51,lng:127},{id:'far',name:'Far',lat:37.54,lng:127}];
test('visible rings follow the actual geodesic radius at every density tier',()=>{
  for(const radius of [100,300,500,1000,2000,3000]){
    const points=distanceRing(cell,radius);assert.equal(points.length,97);
    for(const point of points)assert.ok(Math.abs(distance(cell,point)-radius)<.0001);
    assert.ok(distance(points[0],points.at(-1))<.0001);
  }
});
test('top five impact cards respect selected population, break ties by distance, and never mutate data',()=>{
  const rows=Array.from({length:9},(_,i)=>({distance:i,population:{loss:i},workers:{loss:9-i}}));
  assert.deepEqual(topImpacts(rows).map(r=>r.distance),[8,7,6,5,4]);
  assert.deepEqual(topImpacts(rows,'workers').map(r=>r.distance),[0,1,2,3,4]);
  assert.equal(rows[0].distance,0);assert.equal(topImpacts(rows.slice(0,2)).length,2);
});
test('grid distribution uses all eligible clinics and conserves each population independently',()=>{
  const rows=gridDistribution(cell,clinics);
  assert.equal(rows.length,2);assert.ok(rows[0].probability>rows[1].probability);
  assert.ok(Math.abs(rows.reduce((s,r)=>s+r.probability,0)-1)<1e-12);
  assert.ok(Math.abs(rows.reduce((s,r)=>s+r.population,0)-100)<1e-10);
  assert.ok(Math.abs(rows.reduce((s,r)=>s+r.workers,0)-200)<1e-10);
  for(const row of rows)assert.equal(row.probability,allocationShare(cell,row.clinic,clinics));
});
test('grid distribution never adds a hypothetical target and missing counts stay missing',()=>{
  assert.equal(gridDistribution(cell,clinics,{target:clinics[0]}).length,2);
  const target={lat:37.5,lng:127},rows=gridDistribution({...cell,workers:null},clinics,{target});
  assert.equal(rows.length,2);assert.ok(rows.every(r=>!r.clinic.candidate&&r.workers===null));
  assert.deepEqual(rows.map(r=>r.probability),gridDistribution(cell,clinics).map(r=>r.probability));
  assert.deepEqual(gridDistribution(cell,[clinics[2]]),[]);
});
test('grid selection uses its footprint, includes exact edges, and excludes nearby non-containing cells',()=>{
  const row=[12700000,3750000,100,...geometry];
  assert.equal(cellContains(cell,row),true);assert.equal(cellContains({lng:127.0005,lat:37.5},row),true);
  assert.equal(cellContains({lng:127.0006,lat:37.5},row),false);
});
test('grid worker uses only existing clinics even when a legacy hypothetical target is supplied',async()=>{
  const oldFetch=globalThis.fetch,oldSelf=globalThis.self;let resolve;
  const done=new Promise(r=>resolve=r);
  globalThis.self={postMessage:resolve};
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;
    const value=path.endsWith('current-clinics-index.json')?{formatVersion:1,locations:clinics.map(c=>[c.id,c.name,c.lng,c.lat,1,0])}:path.endsWith('manifest.json')?{levels:[{cellSizeM:100,tiles:[{file:'fixture.json',bbox:[126,37,128,38]}]}]}:[[12700000,3750000,path.includes('sgis-workers')?200:100,...geometry]];
    return {ok:true,json:async()=>value};
  };
  try{
    await import('../dist/grid-flow-worker.mjs?test');self.onmessage({data:{id:1,point:cell,target:{lat:37.5,lng:127},halfLife:500}});
    const data=await done;assert.equal(data.error,undefined);assert.equal(data.cell.population,100);assert.equal(data.cell.workers,200);
    assert.equal(data.destinations.length,2);assert.ok(data.destinations.every(r=>!r.clinic.candidate));
    assert.ok(Math.abs(data.destinations.reduce((s,r)=>s+r.probability,0)-1)<1e-12);
  }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;}
});
test('location reference rings do not fetch population or return visit rankings',async()=>{
  const oldFetch=globalThis.fetch,oldSelf=globalThis.self;let resolve;const done=new Promise(r=>resolve=r);
  globalThis.self={postMessage:resolve};
  globalThis.fetch=async url=>{
    assert.ok(new URL(url).pathname.endsWith('current-clinics-index.json'));
    return {ok:true,json:async()=>({formatVersion:1,locations:clinics.map(c=>[c.id,c.name,c.lng,c.lat,1,0])})};
  };
  try{
    await import('../dist/grid-flow-worker.mjs?rings-test');self.onmessage({data:{id:1,point:cell,ringsOnly:true}});
    const data=await done;assert.equal(data.error,undefined);assert.equal(data.reference,true);assert.deepEqual(data.destinations,[]);assert.equal(data.profile.radius,3000);
  }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;}
});
