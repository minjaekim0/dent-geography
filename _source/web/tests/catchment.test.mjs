import {test} from 'node:test';
import assert from 'node:assert/strict';
import {distanceWeight,allocationShare,distance,bandIndex} from '../dist/catchment-model.mjs';
import {choiceBandIndex,addChoicePopulation} from '../dist/catchment-model.mjs';
const point=(id,lat,lng)=>({id,lat,lng});
test('full population is retained separately for each clinic probability',()=>{
  for(const probability of [.57,.28,.14]){
    const buckets=[0,0,0];addChoicePopulation(buckets,probability,100);
    assert.equal(buckets.reduce((a,b)=>a+b,0),100);
    assert.equal(buckets[choiceBandIndex(probability)],100);
  }
});
test('probability intervals are disjoint, and zero is excluded',()=>{
  assert.equal(choiceBandIndex(1),0);assert.equal(choiceBandIndex(.5),0);
  assert.equal(choiceBandIndex(.2),1);assert.equal(choiceBandIndex(.199),2);
  assert.equal(choiceBandIndex(0),-1);
  const buckets=[0,0,0];
  for(const p of [.5,.2,.001,0])addChoicePopulation(buckets,p,100);
  assert.deepEqual(buckets,[100,100,100]);
});
test('3km cutoff is exclusive and does not affect closer cells',()=>{
  assert.equal(distanceWeight(3000),0);assert.equal(distanceWeight(3001),0);
  assert.equal(distanceWeight(500),.5);assert.ok(distanceWeight(2999)>0);
  assert.equal(bandIndex(3000),-1);assert.equal(bandIndex(100),1);
});
test('shares across competing clinics conserve the grid population',()=>{
  const cell={lat:37.5,lng:127},clinics=[point('a',37.501,127),point('b',37.503,127),point('c',37.51,127)];
  const shares=clinics.map(t=>allocationShare(cell,t,clinics));
  assert.ok(Math.abs(shares.reduce((a,b)=>a+b,0)-1)<1e-12);
  assert.ok(shares[0]>shares[1]&&shares[1]>shares[2]);
});
test('isolated village allocates fully to its sole clinic even at 2km',()=>{
  const cell={lat:37.5,lng:127},target=point('a',37.518,127);
  assert.ok(distance(cell,target)>1900);assert.equal(allocationShare(cell,target,[target]),1);
});
test('candidate adds one competitor, existing clinic is not double counted',()=>{
  const cell={lat:37.5,lng:127},clinic=point('a',37.5,127);
  assert.equal(allocationShare(cell,clinic,[clinic]),1);
  assert.equal(allocationShare(cell,{lat:37.5,lng:127},[clinic]),.5);
});
test('clinic beyond cutoff receives nothing; no nearby clinic means no allocation',()=>{
  const cell={lat:37.5,lng:127},far=point('a',37.53,127);
  assert.equal(allocationShare(cell,far,[far]),0);
});
test('competitors outside target 3km may still compete for an eligible cell',()=>{
  const target=point('a',37.5,127),cell={lat:37.52,lng:127},other=point('b',37.54,127);
  assert.ok(distance(target,other)>3000);assert.ok(distance(cell,other)<3000);
  assert.ok(allocationShare(cell,target,[target,other])<.51);
});
