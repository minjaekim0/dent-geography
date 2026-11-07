import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probabilityDensity,expectedPopulation} from '../dist/catchment-distribution.mjs';
function integrate(values){const dx=100/(values.length-1);return values.reduce((s,v,i)=>s+v*dx*(i===0||i===values.length-1?.5:1),0);}
test('continuous density preserves full population at interior and boundary probabilities',()=>{
  const observations=[[.000001,100],[.57,100],[1,100]];
  const density=probabilityDensity(observations);
  assert.ok(density.every(v=>Number.isFinite(v)&&v>=0));
  assert.ok(Math.abs(integrate(density)-300)<1e-8);
});
test('each dataset retains its own population and expected count',()=>{
  const population=[[.57,100],[.28,200],[.14,300]],workers=[[.57,20]];
  assert.ok(Math.abs(integrate(probabilityDensity(population))-600)<1e-8);
  assert.ok(Math.abs(integrate(probabilityDensity(workers))-20)<1e-8);
  assert.equal(expectedPopulation(population),155);
  assert.ok(Math.abs(expectedPopulation(workers)-11.4)<1e-10);
});
test('empty data and excluded zero-probability records are not smoothed into the graph',()=>{
  assert.deepEqual(probabilityDensity([]),new Array(401).fill(0));
  assert.equal(integrate(probabilityDensity([[0,100]])),0);
  assert.equal(expectedPopulation([[0,100]]),0);
});
