import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createAdminHistory,censusComparable,createRegionLabeler} from '../dist/admin-history-model.mjs';
import {regionKey} from '../dist/daytime-model.mjs';
import {ageCount,populationChange} from '../dist/population-model.mjs';
const read=path=>JSON.parse(readFileSync(new URL('../dist/'+path,import.meta.url)));
const registry=read('data/admin-history.json'),h=createAdminHistory(registry);
const snapshot=p=>read(`data/population/${p}.json`);
const state={min:0,max:100,sex:0};
test('official administrative-code mappings handle non-prefix recodes and chained renames',()=>{
  for(const [a,b] of [
    ['4211052000','5111052000'],['4511151000','5211151000'],
    ['2817053500','2817752000'],['4772037000','2772037000'],['4772038000','2772037000'],
    ['4159025300','4159325000'],['4159025600','4159125000'],['2814059000','2812564000'],
    ['4117158000','4117158200'],['4611051000','1211051000']
  ])assert.equal(h.code(a),b);
  assert.notEqual(h.code('2811059000'),h.code('2814059000'));
  assert.deepEqual(new Set(h.aliases('2772037000')),new Set(['4772037000','4772038000','2772037000']));
  assert.notEqual(h.code('2900000000'),h.code('4600000000')); // no province merger allocation
  assert.notEqual(h.code('2811000000'),h.code('2812500000')); // no whole-gu split alias
  assert.notEqual(h.code('4119051000'),h.code('4119251000')); // no guessed Bucheon name match
  assert.equal(registry.events.reduce((n,e)=>n+e.pairs.length,0),1022);
});
test('every snapshot retains every source row and cell without collisions or invented observations',()=>{
  const manifest=read('data/population/manifest.json');let count=0;
  const features=read('data/eupmyeondong-boundaries.json').features;
  assert.equal(new Set(features.map(f=>h.code(f.properties.code))).size,features.length);
  for(const meta of manifest.periods){
    const raw=snapshot(meta.period),normalized=h.normalizeSnapshot(raw);
    assert.equal(Object.keys(normalized.records).length,Object.keys(raw.records).length);
    for(const [code,record] of Object.entries(raw.records)){
      const result=normalized.records[h.code(code)];
      assert.equal(result.sourceCode,code);assert.equal(result.name,record.name);
      assert.deepEqual(result.ages,record.ages);assert.deepEqual(result.totals,record.totals);count++;
    }
    assert.equal(normalized.records['0000000000'].totals[0],meta.nationalTotal);
  }
  assert.equal(count,73087);
  const before=snapshot('2026-08'),after=h.normalizeSnapshot(before);
  assert.equal(features.filter(f=>before.records[f.properties.code]).length,3115);
  assert.equal(features.filter(f=>after.records[h.code(f.properties.code)]).length,3541);
});
test('age/sex changes use exact old and new observations, and source-period province remains correct',()=>{
  const a=snapshot('2017-12'),b=snapshot('2018-12'),aa=h.normalizeSnapshot(a),bb=h.normalizeSnapshot(b);
  for(const selection of [state,{min:20,max:39,sex:1},{min:65,max:100,sex:2}]){
    const delta=populationChange(aa.records['2817752000'],bb.records['2817752000'],selection);
    assert.equal(delta.count,ageCount(b.records['2817752000'],selection.min,selection.max,selection.sex)-ageCount(a.records['2817053500'],selection.min,selection.max,selection.sex));
  }
  assert.equal(h.province('4772025000'),'47');assert.equal(h.province('2772025000'),'27');
  assert.equal(h.province('4611051000'),'46');assert.equal(h.province('1211051000'),'12');
  assert.equal(h.province('4211052000'),'51');
  assert.ok(h.comparisonIssue('2700000000','2022-12','2023-12'));
  assert.equal(h.comparisonIssue('2772025000','2022-12','2023-12'),null);
  assert.ok(h.comparisonIssue('2826000000','2025-12','2026-08'));
  assert.equal(h.comparisonIssue('2826000000','2026-08','2026-08'),null);
});
test('all aliases have conflict-free lazy-series joins and exactly preserve source period names',()=>{
  const cached=new Map();let groups=0;
  for(const raw of new Set(registry.events.flatMap(e=>e.pairs.flatMap(p=>[p.before,p.after])))){
    if(h.code(raw)!==raw)continue;
    const periods=new Set();
    for(const alias of h.aliases(raw)){
      const group=alias.endsWith('00000000')?alias.slice(0,2):alias.slice(0,5);
      if(!h.seriesGroups.has(group))continue;
      if(!cached.has(group)){cached.set(group,read(`data/population/series-${group}.json`));groups++;}
      for(const period of Object.keys(cached.get(group)[alias]||{})){
        assert.ok(!periods.has(period),`${raw} ${period}`);periods.add(period);
      }
    }
  }
  assert.ok(groups>50);
  for(const group of h.seriesGroups)assert.ok(existsSync(new URL(`../dist/data/population/series-${group}.json`,import.meta.url)));
});
test('census links verified renames, not same-name reorganizations or allocated subdivisions',()=>{
  const d=read('data/daytime-history.json'),years={};
  for(const y of d.years){
    const entries=Object.entries(d.periods[y].records).map(([sourceCode,r])=>[h.nameKey(r.fullName),{...r,sourceCode}]);
    years[y]=new Map(entries);assert.equal(years[y].size,entries.length);
  }
  for(const name of ['인천광역시 미추홀구','대구광역시 군위군','경기도 여주시','충청남도 당진시']){
    const key=h.nameKey(name);assert.ok(years[2005].has(key),name);assert.ok(years[2020].has(key),name);
    assert.ok(censusComparable(years[2005].get(key),years[2020].get(key),h),name);
  }
  for(const name of ['경상남도 창원시','충청북도 청주시','충청북도 청주시 상당구']){
    const key=h.nameKey(name);assert.equal(censusComparable(years[2010].get(key),years[2020].get(key),h),!name.includes('청주'));
    if(name.includes('창원'))assert.equal(censusComparable(years[2005].get(key),years[2020].get(key),h),false);
  }
  assert.ok(!years[2020].has(h.nameKey('경기도 부천시 원미구')));
  const features=read('data/district-boundaries.json').features;
  assert.ok(features.filter(f=>years[2020].has(h.nameKey(regionKey(f)))).length>247);
});
test('ambiguous and cyclic mapping cannot silently replace records',()=>{
  assert.throws(()=>createAdminHistory({events:[{pairs:[{before:'1',after:'2'},{before:'1',after:'3'}]}]}),/Ambiguous/);
  assert.throws(()=>createAdminHistory({events:[{pairs:[{before:'1',after:'2'},{before:'2',after:'1'}]}]}),/Cyclic/);
  assert.throws(()=>h.normalizeSnapshot({period:'test',records:{'4772037000':{},'2772037000':{}}}),/Duplicate/);
});
test('main dental labels resolve province abbreviations without conflating different 남구 districts',()=>{
  const label=createRegionLabeler(h);
  assert.equal(label('인천 남구'),'인천광역시 미추홀구 (원자료: 인천 남구)');
  assert.equal(label('부산 남구'),'부산 남구');assert.equal(label('울산 남구'),'울산 남구');
  assert.equal(label('강원 춘천시'),'강원특별자치도 춘천시 (원자료: 강원 춘천시)');
  assert.equal(label('경북 군위군'),'대구광역시 군위군 (원자료: 경북 군위군)');
  assert.equal(label('충북 청주시'),'충북 청주시');
});
