import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {csvRows} from '../scripts/build-population.mjs';
import {identity,observation,metricValue,difference,regionKey} from '../dist/daytime-model.mjs';
const data=JSON.parse(readFileSync(new URL('../dist/data/daytime-history.json',import.meta.url)));
test('all four official snapshots preserve every original age/sex cell and source hash',()=>{
  assert.deepEqual(data.years,[2005,2010,2015,2020]);let checked=0;
  for(const year of data.years){
    const zip=new URL(`../../data/incoming/population/daytime/${year}.zip`,import.meta.url);
    assert.equal(createHash('sha256').update(readFileSync(zip)).digest('hex'),data.periods[year].sha256);
    const source=csvRows(new TextDecoder('euc-kr').decode(execFileSync('unzip',['-p',zip.pathname],{maxBuffer:20*1024*1024}))).filter(r=>r.length===16).slice(1);
    assert.equal(source.length,data.periods[year].rows);
    for(const r of source){const record=data.periods[year].records[r[0].slice(1)],value=observation(record,r[2].slice(1),r[5].trim());
      assert.equal(record.name,r[1].trim());
      for(const [key,col]of [['resident',7],['inflow',8],['outflow',11],['daytime',14]])assert.equal(value[key],r[col]===''?null:Number(r[col]));checked++;
    }
    const names=Object.values(data.periods[year].records).map(r=>identity(r.fullName));assert.equal(new Set(names).size,names.length);
  }
  assert.equal(checked,52416);
});
test('national controls, signed change, proper index denominator, and missing observations',()=>{
  for(const[y,total]of [[2005,46392589],[2010,47485389],[2015,49425626],[2020,50161816]]){
    const row=observation(data.periods[y].records['00']);assert.equal(row.daytime,total);assert.equal(metricValue(row,'index'),100);
  }
  assert.equal(difference(49425626,50161816),736190);
  assert.equal(metricValue({resident:0,daytime:0},'index'),null);
  assert.equal(metricValue({inflow:null,outflow:5},'net'),null);
  assert.equal(difference(null,5),null);assert.equal(difference(5,0),-5);
  assert.equal(observation(data.periods[2020].records['00'],'0','70세이상'),null);
  assert.equal(metricValue(observation(data.periods[2020].records['00'],'0','12세미만'),'net'),null);
});
test('province-qualified mapping avoids duplicate district names and does not allocate Bucheon',()=>{
  assert.notEqual(regionKey({properties:{code:'11020',name:'중구'}}),regionKey({properties:{code:'21010',name:'중구'}}));
  assert.equal(regionKey({properties:{code:'31011',name:'수원시 장안구'}}),'경기도수원시장안구');
  const records=Object.values(data.periods[2020].records),names=new Set(records.map(r=>identity(r.fullName)));
  assert.ok(names.has('경기도부천시'));assert.ok(!names.has('경기도부천시원미구'));
  assert.ok(!names.has('대구광역시군위군'));assert.ok(names.has('경상북도군위군'));
  for(const period of Object.values(data.periods))for(const r of Object.values(period.records))assert.equal(r.estimatedFrom,undefined);
});
test('2020 existing direct district values match original deployed census (excluding allocated rows)',()=>{
  const old=JSON.parse(readFileSync(new URL('../dist/data/daytime_population_2020.json',import.meta.url)));
  const boundaries=JSON.parse(readFileSync(new URL('../dist/data/district-boundaries.json',import.meta.url))).features;
  const records=new Map(Object.values(data.periods[2020].records).map(r=>[identity(r.fullName),r]));let matched=0;
  for(const f of boundaries){const r=observation(records.get(regionKey(f))),v=old.districts[f.properties.code];if(!r||!v||v.estimatedFrom)continue;
    assert.equal(r.daytime,v.daytimePopulation);assert.equal(r.resident,v.censusResidentPopulation);matched++;
  }
  assert.ok(matched>240);
});
