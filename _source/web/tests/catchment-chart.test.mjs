import {test} from 'node:test';
import assert from 'node:assert/strict';
import {linearProbabilityAxis,densityAt,formatProbability} from '../dist/catchment-chart-model.mjs';
test('linear axis displays 0 to 25 percent with equal intervals',()=>{
  const axis=linearProbabilityAxis();
  assert.equal(axis.minimum,0);assert.equal(axis.maximum,.25);
  assert.equal(axis.position(0),0);assert.equal(axis.position(.25),1);assert.equal(axis.position(.125),.5);
  assert.deepEqual(axis.ticks.map(formatProbability),['0%','5%','10%','15%','20%','25%']);
  for(const p of [0,.005,.1,.25])assert.ok(Math.abs(axis.probability(axis.position(p))-p)<1e-12);
});
test('pointer and keyboard positions are clamped to the visible probability range',()=>{
  const axis=linearProbabilityAxis();
  assert.equal(axis.position(-1),0);assert.equal(axis.position(1),1);
  assert.equal(axis.probability(-1),0);assert.equal(axis.probability(2),.25);
});
test('25 percent is inclusive; either population series can expand the axis to 100 percent',()=>{
  assert.equal(linearProbabilityAxis([[[.25,100]],[[.1,200]]]).maximum,.25);
  for(const groups of [[[[.250001,100]],[]],[[],[[1,200]]]]){
    const axis=linearProbabilityAxis(groups);
    assert.equal(axis.maximum,1);assert.equal(axis.position(1),1);assert.equal(axis.probability(1),1);
    assert.deepEqual(axis.ticks.map(formatProbability),['0%','25%','50%','75%','100%']);
  }
});
test('the 25 percent tail needs at least one percent of either population, independently',()=>{
  assert.equal(linearProbabilityAxis([[[.1,9901],[.5,99]]]).maximum,.25);
  assert.equal(linearProbabilityAxis([[[.1,9900],[.5,100]]]).maximum,1);
  assert.equal(linearProbabilityAxis([[[.1,9900],[.25,100]]]).maximum,.25);
  assert.equal(linearProbabilityAxis([[[.1,1000000]],[[.1,99],[.5,1]]]).maximum,1);
  // One high-population grid matters more than the number of rows.
  assert.equal(linearProbabilityAxis([[[.1,1],[.1,1],[.1,1],[.5,100]]]).maximum,1);
  assert.equal(linearProbabilityAxis([[[.1,100000],[.5,1],[.5,1],[.5,1]]]).maximum,.25);
});
test('invalid or empty population records do not expand the display range',()=>{
  assert.equal(linearProbabilityAxis([[[.9,0],[2,100],[NaN,100],[.9,Infinity],[-1,100]],[]]).maximum,.25);
});
test('rendering interpolates the existing density without changing its units',()=>{
  assert.equal(densityAt([0,10,20],.25),5);assert.equal(densityAt([0,10,20],1),20);
  assert.equal(formatProbability(.0001),'0.01%');assert.equal(formatProbability(.1),'10%');
});
