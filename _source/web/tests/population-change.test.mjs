import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {populationChange,changeColor,ageCount} from '../dist/population-model.mjs';
const load=year=>JSON.parse(readFileSync(new URL(`../dist/data/population/${year}.json`,import.meta.url),'utf8'));
test('population change compares same filtered age/sex endpoints, missing is not zero',()=>{
  const start={ages:[Array(101).fill(5),Array(101).fill(2),Array(101).fill(3)]};
  const end={ages:[Array(101).fill(8),Array(101).fill(3),Array(101).fill(5)]};
  assert.deepEqual(populationChange(start,end,{min:20,max:29,sex:2}),{before:30,after:50,count:20,percent:20/30*100});
  assert.equal(populationChange(start,start).count,0);
  assert.equal(populationChange(start,undefined).count,null);
  assert.equal(populationChange(undefined,end).count,null);
  const zero={ages:[Array(101).fill(0)]};
  assert.deepEqual(populationChange(zero,end),{before:0,after:808,count:808,percent:null});
  assert.equal(populationChange(end,start).count,-303);
  assert.equal(populationChange(zero,zero).count,0);
});
test('diverging map distinguishes decline, growth, zero and missing with symmetric thresholds',()=>{
  assert.equal(changeColor(null),'#cbd5e1');assert.equal(changeColor(NaN),'#cbd5e1');
  assert.equal(changeColor(0),'#f8fafc');assert.equal(changeColor(-5000),'#991b1b');assert.equal(changeColor(5000),'#166534');
  assert.equal(changeColor(-10,'growth'),'#991b1b');assert.equal(changeColor(10,'growth'),'#166534');
});
test('2024 to 2025 official national change and every paired record match direct subtraction',()=>{
  const a=load('2024-12'),b=load('2025-12');
  assert.equal(populationChange(a.records['0000000000'],b.records['0000000000']).count,-99843);
  for(const code of new Set([...Object.keys(a.records),...Object.keys(b.records)])){
    for(const sex of [0,1,2]){
      const before=ageCount(a.records[code],65,100,sex),after=ageCount(b.records[code],65,100,sex);
      assert.equal(populationChange(a.records[code],b.records[code],{min:65,max:100,sex}).count,before==null||after==null?null:after-before);
    }
  }
});
