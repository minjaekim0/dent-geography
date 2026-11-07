import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inflowArrow} from '../dist/catchment-inflow-arrow.mjs';
test('thin and thick incoming arrows have a sharp head, a distinct shaft junction and space around the clinic',()=>{
  for(const width of [.75,5,20])for(const side of [-1,1])for(const target of [{x:500,y:100},{x:-150,y:300},{x:0,y:60}]){
    const arrow=inflowArrow({x:0,y:0},target,width,side);
    assert.ok(arrow);assert.ok(arrow.outline.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    assert.ok(Math.abs(Math.hypot(target.x-arrow.tip.x,target.y-arrow.tip.y)-30)<1e-10);
    assert.equal(arrow.outline.filter(p=>p===arrow.tip).length,1);
    assert.ok(Math.hypot(arrow.base.x-arrow.tip.x,arrow.base.y-arrow.tip.y)>0);
    assert.ok(arrow.outline.every(p=>Math.hypot(p.x-target.x,p.y-target.y)>=30-1e-8));
  }
});
test('overlapping or too-close origins are represented by a source dot without a malformed arrow',()=>{
  for(const target of [{x:0,y:0},{x:10,y:10},{x:46,y:0},{x:NaN,y:0}])assert.equal(inflowArrow({x:0,y:0},target,20),null);
});
