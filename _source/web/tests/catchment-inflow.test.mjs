import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInflowGroups,inflowGroupKey,selectInflowGroups} from '../dist/catchment-inflow-model.mjs';
test('display grouping preserves per-grid expected population and weights the origin by its contribution',()=>{
  const groups=createInflowGroups(),a={lat:38.001,lng:127.001},b={lat:38.002,lng:127.002},c={lat:38.02,lng:127.02};
  assert.equal(inflowGroupKey(a),inflowGroupKey(b));assert.notEqual(inflowGroupKey(a),inflowGroupKey(c));
  groups.add(a,100,.5);groups.add(b,200,.25);groups.add(c,40,1);
  const rows=groups.rows(),local=rows.find(r=>r.id===inflowGroupKey(a));
  assert.equal(rows.length,2);assert.equal(rows.reduce((s,r)=>s+r.expected,0),140);
  assert.equal(local.expected,100);assert.equal(local.cells,2);
  assert.ok(Math.abs(local.lat-38.0015)<1e-12);assert.ok(Math.abs(local.lng-127.0015)<1e-12);
  groups.add(a,100,0);groups.add(a,Infinity,1);groups.add(a,-10,.5);groups.add(a,10,NaN);
  assert.deepEqual(groups.rows(),rows);
});
test('top ten selection reports its share of the complete expectation and never renormalizes contributions',()=>{
  const rows=Array.from({length:12},(_,i)=>({id:String(i),expected:i+1})),original=structuredClone(rows);
  const selected=selectInflowGroups(rows,78);
  assert.equal(selected.rows.length,10);assert.equal(selected.groups,12);assert.equal(selected.rows[0].expected,12);
  assert.equal(selected.displayed,75);assert.equal(selected.coverage,75/78);assert.deepEqual(rows,original);
  assert.equal(selectInflowGroups([],0).coverage,0);
  const workers=selectInflowGroups([{id:'a',expected:100}],100);
  assert.equal(workers.coverage,1);assert.equal(workers.rows.length,1);
});
