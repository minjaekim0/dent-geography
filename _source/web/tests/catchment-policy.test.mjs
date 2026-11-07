import {test} from 'node:test';
import assert from 'node:assert/strict';
import {densityProfile,profileForCell,createAdaptiveMarket,targetShare} from '../dist/catchment-policy.mjs';
import {distanceWeight,allocationShare,expectedChange} from '../dist/catchment-model.mjs';
import {createClinicIndex} from '../dist/clinic-model.mjs';
import {gridDistribution} from '../dist/grid-flow-model.mjs';
const origin={lat:37.5,lng:127};
const cluster=(n,lat=37.5,prefix='a')=>Array.from({length:n},(_,i)=>({id:prefix+i,name:prefix+i,lat:lat+i*.000001,lng:127.0001}));
test('three density tiers switch at 10 and 30 clinics and enforce their own strict distance cutoff',()=>{
  for(const [count,radius,halfLife] of [[0,3000,500],[9,3000,500],[10,2000,300],[29,2000,300],[30,1000,100],[100,1000,100]]){
    const profile=densityProfile(count);assert.equal(profile.radius,radius);assert.equal(profile.halfLife,halfLife);
    assert.equal(distanceWeight(halfLife,halfLife,radius),.5);
    assert.equal(distanceWeight(radius,halfLife,radius),0);assert.ok(distanceWeight(radius-.1,halfLife,radius)>0);
  }
});
test('adding the thirtieth clinic does not reclassify the cell or renormalize only the displayed arrows',()=>{
  const clinics=[...cluster(29),{id:'outside-density',name:'other',lat:37.5135,lng:127}];
  const target={...origin},cell={...origin,population:100,workers:200},get=createAdaptiveMarket(createClinicIndex(clinics,.01));
  const market=get(cell),rows=gridDistribution(cell,clinics,{target});
  assert.equal(market.profile.nearbyClinics,29);assert.equal(market.profile.radius,2000);
  assert.ok(rows.some(r=>r.clinic.id==='outside-density'));assert.equal(rows.length,30);
  assert.ok(Math.abs(rows.reduce((s,r)=>s+r.population,0)-100)<1e-10);
  assert.ok(Math.abs(rows.reduce((s,r)=>s+r.workers,0)-200)<1e-10);
  const loss=market.market.reduce((s,r)=>s+expectedChange(100,r.weight,market.total,1).loss,0);
  assert.ok(Math.abs(loss-100*targetShare(cell,target,market))<1e-10);
  assert.equal(get.profile(cell).nearbyClinics,29);
});
test('all existing clinic probabilities sum to one with the same grid policy',()=>{
  const clinics=cluster(30),market=createAdaptiveMarket(createClinicIndex(clinics,.01))(origin);
  assert.equal(market.profile.radius,1000);
  assert.ok(Math.abs(clinics.reduce((s,c)=>s+targetShare(origin,c,market),0)-1)<1e-12);
  assert.equal(targetShare(origin,{lat:37.515,lng:127},market),0);
});
test('worker applies all three tiers per grid, excludes ineligible cells, and preserves before/after totals',async()=>{
  const clinics=[...cluster(30),...cluster(10,37.515,'b')],target={...origin,name:'candidate'};
  const cells=[[12700000,3750000,100],[12700000,3751500,200],[12700000,3752500,300],[12700000,3752000,400]];
  const originalFetch=globalThis.fetch,originalSelf=globalThis.self;let resolve;
  const done=new Promise(r=>resolve=r);globalThis.self={postMessage:r=>{if(!r.phase)resolve(r);}};
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;
    const payload=path.endsWith('current-clinics-index.json')?{formatVersion:1,hiraAsOf:'test',locations:clinics.map(c=>[c.id,c.name,c.lng,c.lat,1,0])}:path.endsWith('manifest.json')?{populationYear:2024,levels:[{cellSizeM:100,tiles:[{file:'fixture.json',bbox:[126,37,128,38]}]}]}:cells;
    return {ok:true,json:async()=>payload};
  };
  try{
    await import('../dist/catchment-worker.mjs?adaptive-test');self.onmessage({data:{id:1,target}});
    const data=await done;assert.equal(data.error,undefined);
    for(const key of ['population','workers']){
      const dataset=data.datasets[key];assert.deepEqual(dataset.profiles,{dense:1,medium:1,sparse:1});
      assert.equal(dataset.bands.reduce((s,b)=>s+b.nearby,0),600);
      assert.equal(dataset.distancePopulation.reduce((s,n)=>s+n,0),600);
      assert.equal(dataset.distancePopulation[0],100);
      assert.equal(dataset.distancePopulation[16],200);
      assert.equal(dataset.distancePopulation[27],300);
      assert.equal(dataset.distancePopulation[22],0); // Excluded by this grid's own maximum distance.
      assert.ok(Math.abs(dataset.inflowGroups.reduce((s,r)=>s+r.expected,0)-dataset.expectedPopulation)<1e-10);
      const candidate={...target,id:'new'};
      for(const result of data.impact.rows){
        let before=0,after=0;
        for(const [lng,lat,count] of cells){
          const cell={lng:lng/1e5,lat:lat/1e5},profile=profileForCell(cell,clinics);
          before+=count*allocationShare(cell,result.clinic,clinics,profile.halfLife,profile.radius);
          after+=count*allocationShare(cell,result.clinic,[...clinics,candidate],profile.halfLife,profile.radius);
        }
        assert.ok(Math.abs(result[key].before-before)<1e-8);assert.ok(Math.abs(result[key].after-after)<1e-8);
      }
      const loss=data.impact.rows.reduce((s,r)=>s+r[key].loss,0);
      assert.ok(Math.abs(dataset.expectedPopulation-loss-data.impact.newlyCovered[key])<1e-8);
    }
  }finally{globalThis.fetch=originalFetch;globalThis.self=originalSelf;}
});
