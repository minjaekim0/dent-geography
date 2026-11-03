import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {decodeClinicIndex,createClinicIndex,clinicDisplayPlan,visibleClinics} from '../dist/clinic-model.mjs';
const path=name=>new URL('../dist/data/'+name,import.meta.url);
const read=name=>JSON.parse(readFileSync(path(name),'utf8'));
const full=read('current-clinics.json');
const compact=decodeClinicIndex(read('current-clinics-index.json'));
const index=createClinicIndex(compact.locations);
const ids=points=>points.map(p=>p.id).sort();
test('initial compact data and lazy detail chunks retain every exact selected point and address',()=>{
  assert.ok(statSync(path('current-clinics-index.json')).size<statSync(path('current-clinics.json')).size*.25);
  const chunks=compact.detailChunks.map(read);
  assert.equal(Object.values(chunks).reduce((n,c)=>n+Object.keys(c).length,0),full.locations.length);
  const originals=new Map(full.locations.map(p=>[p.id,p]));
  for(const point of compact.locations){
    const original=originals.get(point.id);
    for(const key of ['id','name','lng','lat','source'])assert.equal(point[key],original[key]);
    assert.deepEqual(chunks[point.detailChunk][point.id],original);
  }
});
test('spatial index matches exhaustive bounds and source filtering including cell edges',()=>{
  const boxes=[[124,33,132,40],[126.95,37.45,127.05,37.55],[127,37,127,37]];
  for(let i=0;i<80;i++){const x=124+(i*173%700)/100,y=33+(i*97%600)/100;boxes.push([x,y,x+.13,y+.17]);}
  for(const bounds of boxes)for(const source of ['all','kakao','hira_unverified'])assert.deepEqual(ids(index.query(bounds,source)),ids(visibleClinics(compact.locations,bounds,source)));
});
test('nationwide and dense view groups cap SDK objects without losing, duplicating or relocating institutions',()=>{
  for(const bounds of [[124,33,132,40],[126.8,37.3,127.2,37.7]])for(const source of ['all','kakao','hira_unverified']){
    const {points,entries}=clinicDisplayPlan(index,bounds,source);
    assert.ok(entries.length<=240);
    assert.equal(entries.reduce((n,g)=>n+g.count,0),points.length);
    assert.deepEqual(ids(entries.flatMap(g=>g.members)),ids(points));
    assert.equal(entries.reduce((n,g)=>n+g.kakaoCount,0),points.filter(p=>p.source==='kakao').length);
    for(const g of entries)for(const p of g.members)assert.equal(compact.locations.includes(p),true);
  }
  const country=clinicDisplayPlan(index,[124,33,132,40]);
  assert.equal(country.points.length,19623);
  assert.equal(country.entries.reduce((n,g)=>n+g.kakaoCount,0),17771);
});
test('coincident clinics remain individually available through a full membership list',()=>{
  const points=Array.from({length:800},(_,id)=>({id,lng:127,lat:37,source:'kakao'}));
  for(const n of [2,200,800]){
    const plan=clinicDisplayPlan(createClinicIndex(points.slice(0,n)),[126,36,128,38]);
    assert.equal(plan.entries.length,1);assert.equal(plan.entries[0].members.length,n);
  }
});
