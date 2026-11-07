import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDistanceHistogram,addDistancePopulation} from '../dist/catchment-distance-model.mjs';
import {distanceCurve} from '../dist/catchment-distance-curve.mjs';
test('100m distance intervals preserve full population and put boundaries in the next interval',()=>{
  const bins=createDistanceHistogram();
  for(const [d,n] of [[0,100],[99.9,200],[100,300],[2999.9,400]])addDistancePopulation(bins,d,n);
  assert.equal(bins.length,30);assert.equal(bins[0],300);assert.equal(bins[1],300);assert.equal(bins[29],400);
  assert.equal(bins.reduce((a,b)=>a+b,0),1000);
});
test('exclusive 3km cutoff and invalid values do not create histogram entries',()=>{
  const bins=createDistanceHistogram();
  for(const [d,n] of [[3000,100],[-1,100],[Infinity,100],[NaN,100],[1,NaN],[1,Infinity],[1,-1],[1,0]])addDistancePopulation(bins,d,n);
  assert.deepEqual(bins,Array(30).fill(0));
});
test('smooth distance curve passes through bin centres and never overshoots adjacent totals',()=>{
  const bins=createDistanceHistogram();bins.splice(0,6,10,100,20,0,0,80);
  const original=[...bins],curve=distanceCurve(bins);
  for(let i=0;i<bins.length;i++)assert.equal(curve.find(([d])=>d===i*100+50)[1],bins[i]);
  for(const [d,n] of curve){
    const index=Math.max(0,Math.min(bins.length-1,d/100-.5)),i=Math.floor(index),next=Math.min(i+1,bins.length-1);
    assert.ok(n>=Math.min(bins[i],bins[next])-1e-10&&n<=Math.max(bins[i],bins[next])+1e-10);
    if(d>=350&&d<=450)assert.equal(n,0);
  }
  assert.deepEqual(bins,original);assert.equal(curve.length,601);
  assert.ok(curve.some(([d,n])=>d>50&&d<150&&n>10&&n<100));
  assert.ok(distanceCurve(createDistanceHistogram()).every(([,n])=>n===0));
});
