import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allocationShare,expectedChange} from '../dist/catchment-model.mjs';
test('candidate gains equal incumbent losses for an already served grid',()=>{
  const a=expectedChange(100,.5,.75,.5),b=expectedChange(100,.25,.75,.5);
  assert.ok(Math.abs(a.before-100*2/3)<1e-10);
  assert.equal(a.after,40);assert.equal(b.after,20);
  assert.ok(Math.abs(a.loss+b.loss-40)<1e-10);
  assert.equal(expectedChange(100,.5,.75,0).loss,0);
});
test('worker computes full incumbent baselines outside candidate circle, with distant competitors',async()=>{
  const target={lat:37.5,lng:127,name:'신규 후보'},clinics=[
    {id:'a',name:'A',lat:37.52,lng:127},
    {id:'b',name:'B',lat:37.55,lng:127},
    {id:'c',name:'C',lat:37.59,lng:127},
  ];
  const cells=[[12700000,3751000,100],[12700000,3752500,200],[12700000,3754700,300],[12700000,3757200,400]];
  const originalFetch=globalThis.fetch,originalSelf=globalThis.self;
  let resolve;const done=new Promise(r=>resolve=r);
  globalThis.self={postMessage:r=>{if(!r.phase)resolve(r);}};
  globalThis.fetch=async url=>{
    const path=new URL(url).pathname;
    const payload=path.endsWith('current-clinics-index.json')?{formatVersion:1,hiraAsOf:'test',locations:clinics.map(c=>[c.id,c.name,c.lng,c.lat,1,0])}:path.endsWith('manifest.json')?{populationYear:2024,levels:[{cellSizeM:100,tiles:[{file:'fixture.json',bbox:[126,37,128,38]}]}]}:cells;
    return {ok:true,json:async()=>payload};
  };
  try{
    await import('../dist/catchment-worker.mjs?impact-test');
    self.onmessage({data:{id:1,target,halfLife:500}});
    const result=await done;assert.equal(result.error,undefined);
    const candidate={...target,id:'new'};
    for(const dataset of ['population','workers']){
      for(const row of result.impact.rows){
        let before=0,after=0;
        for(const [lng,lat,n] of cells){const cell={lng:lng/1e5,lat:lat/1e5};before+=n*allocationShare(cell,row.clinic,clinics,500);after+=n*allocationShare(cell,row.clinic,[...clinics,candidate],500);}
        assert.ok(Math.abs(row[dataset].before-before)<1e-8);
        assert.ok(Math.abs(row[dataset].after-after)<1e-8);
      }
      const loss=result.impact.rows.reduce((s,r)=>s+r[dataset].loss,0);
      assert.ok(Math.abs(result.datasets[dataset].expectedPopulation-loss-result.impact.newlyCovered[dataset])<1e-8);
    }
    assert.ok(result.impact.rows.find(r=>r.clinic.id==='b').population.before>300);
  }finally{globalThis.fetch=originalFetch;globalThis.self=originalSelf;}
});
