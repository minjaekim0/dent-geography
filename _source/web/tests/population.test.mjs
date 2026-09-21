import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ageCount,metricValue,areaKm2,isLocal,ageLabel,color,thresholds} from '../dist/population-model.mjs';
import {parsePopulation,csvRows} from '../scripts/build-population.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const dist=resolve(root,'web/dist');
const read=name=>JSON.parse(readFileSync(resolve(dist,name),'utf8'));
const manifest=read('data/population/manifest.json');
const boundaries=read('data/eupmyeondong-boundaries.json');
const codes=new Set(boundaries.features.map(f=>f.properties.code));
const datasets=manifest.periods.map(meta=>({meta,...read(meta.file)}));

test('19 snapshots retain official source data, national controls, and every single-age/sex total',()=>{
  assert.equal(datasets.length,19);assert.equal(datasets[0].period,'2008-12');assert.equal(datasets.at(-1).period,'2026-08');
  let tested=0;
  for(const{meta,records,period}of datasets){
    const raw=readFileSync(resolve(root,`data/incoming/population/age/${period}.csv`));
    const nationalRaw=readFileSync(resolve(root,`data/incoming/population/age/${period}-national.csv`));
    assert.equal(createHash('sha256').update(raw).digest('hex'),meta.sourceSha256);
    assert.equal(createHash('sha256').update(nationalRaw).digest('hex'),meta.nationalSourceSha256);
    const original=parsePopulation(raw,period).records,controls=parsePopulation(nationalRaw,period).records;
    assert.deepEqual(records,{...original,...controls});
    assert.deepEqual(meta.national,controls['0000000000']);
    const local=Object.keys(records).filter(isLocal);
    assert.equal(local.length,meta.localCount);
    assert.equal(local.filter(c=>codes.has(c)).length,meta.mappedCount);
    assert.equal(local.reduce((s,c)=>s+records[c].totals[0],0),meta.localTotal);
    assert.equal(meta.nationalTotal-meta.localTotal,meta.localGap);
    if(meta.localGap===0)for(let sex=0;sex<3;sex++)for(let age=0;age<=100;age++)assert.equal(local.reduce((sum,c)=>sum+records[c].ages[sex][age],0),controls['0000000000'].ages[sex][age]);
    for(const record of Object.values(records)){
      for(let sex=0;sex<3;sex++){
        assert.equal(record.ages[sex].length,101);
        assert.equal(ageCount(record,0,100,sex),record.totals[sex]);
        assert.equal(ageCount(record,20,39,sex),record.ages[sex].slice(20,40).reduce((a,b)=>a+b,0));
        assert.equal(ageCount(record,65,100,sex),record.ages[sex].slice(65).reduce((a,b)=>a+b,0));
      }
      for(let age=0;age<=100;age++)assert.equal(record.ages[0][age],record.ages[1][age]+record.ages[2][age]);
      tested++;
    }
  }
  assert.equal(datasets[0].meta.localGap,2216); // Exposed source discrepancy, never silently allocated.
  assert.ok(datasets.slice(1).every(d=>d.meta.localGap===0));
  console.log(`Validated ${tested.toLocaleString()} records against official CSVs, 303 age/sex cells per record.`);
});

test('population/share/density use matched filters, preserve zero and reject absent values',()=>{
  const r=datasets.at(-1).records['1111053000'];
  assert.equal(ageCount(r,100,100,2),r.ages[2][100]);
  assert.equal(ageLabel(65,100),'65세 이상');assert.equal(ageLabel(100,100),'100세 이상');
  assert.equal(metricValue(r,{min:27,max:43,sex:2,metric:'share'}),r.ages[2].slice(27,44).reduce((a,b)=>a+b,0)/r.totals[0]*100);
  assert.equal(metricValue(r,{min:27,max:43,sex:2,metric:'density'},2),ageCount(r,27,43,2)/2);
  assert.equal(metricValue(r,{metric:'density'},0),null);
  assert.equal(metricValue(undefined,{metric:'count'}),null);
  assert.equal(ageCount(r,50,20),null);assert.equal(ageCount(r,-1,20),null);assert.equal(ageCount(r,0,101),null);
  const zero={totals:[0,0,0],ages:Array.from({length:3},()=>Array(101).fill(0))};
  assert.equal(ageCount(zero),0);assert.equal(metricValue(zero,{metric:'share'}),null);assert.equal(metricValue(zero,{metric:'density'},2),0);
  assert.notEqual(color(0,'count'),color(null,'count'));
  assert.equal(color(500,'count'),'#dbeafe');assert.equal(color(499,'count'),'#eff6ff');
  assert.deepEqual(thresholds('share'),[5,10,20,30,40,60,80]);
});

test('derived area retains islands and subtracts holes, with plausible national boundary areas',()=>{
  const outer=[[0,0],[1,0],[1,1],[0,1],[0,0]],hole=[[.25,.25],[.75,.25],[.75,.75],[.25,.75],[.25,.25]];
  const area=areaKm2({type:'Polygon',coordinates:[outer]});
  assert.ok(area>12300&&area<12400);
  const holeArea=areaKm2({type:'Polygon',coordinates:[hole]});
  assert.ok(Math.abs(areaKm2({type:'Polygon',coordinates:[outer,hole]})-(area-holeArea))<1e-7);
  assert.equal(areaKm2({type:'MultiPolygon',coordinates:[[outer],[outer]]}),area*2);
  for(const f of boundaries.features){const a=areaKm2(f.geometry);assert.ok(Number.isFinite(a)&&a>0&&a<2000,`${f.properties.name}: ${a}`);}
});

test('lazy district-level time series exactly preserve missing years, changing names, and source values',()=>{
  const seriesFiles=readdirSync(resolve(dist,'data/population')).filter(n=>/^series-\d+\.json$/.test(n));
  const series={};
  for(const file of seriesFiles){
    assert.ok(statSync(resolve(dist,'data/population',file)).size<5*1024*1024,`Oversized series: ${file}`);
    Object.assign(series,read(`data/population/${file}`));
  }
  let checked=0;
  for(const{records,period}of datasets)for(const[code,record]of Object.entries(records)){assert.deepEqual(series[code][period],record);checked++;}
  for(const[code,periods]of Object.entries(series))for(const period of Object.keys(periods))assert.ok(datasets.find(d=>d.period===period).records[code]);
  // Newly introduced provincial codes are not spuriously extended backwards.
  assert.equal(series['5111051000']?.['2008-12'],undefined);
  console.log(`Validated ${checked.toLocaleString()} time-series points in ${seriesFiles.length} lazy files.`);
});

test('CSV parser and decoder fail closed on invalid exports or incorrect periods',()=>{
  assert.deepEqual(csvRows('a,"b,c","d""e"\r\n1,2,3\r\n'),[['a','b,c','d"e'],['1','2','3']]);
  assert.throws(()=>csvRows('a,"broken'),/Unterminated/);
  assert.throws(()=>parsePopulation(Buffer.from('<html>network error</html>'),'2025-12'),/Unexpected/);
  const bytes=readFileSync(resolve(root,'data/incoming/population/age/2025-12.csv'));
  assert.throws(()=>parsePopulation(bytes,'2024-12'),/Missing single-age/);
});

test('population page is separate, carries boundary limitations, and loads no dental analytical dataset',()=>{
  const html=readFileSync(resolve(dist,'population.html'),'utf8'),js=readFileSync(resolve(dist,'population.js'),'utf8');
  for(const file of ['index.html','kakao.html'])assert.match(readFileSync(resolve(dist,file),'utf8'),/href="population.html"/);
  assert.ok(!html.includes('kakao-core.js'));
  assert.ok(!/specialties|facility-history|api-yearly-events|daytime_population/.test(js));
  assert.equal(manifest.boundary.historicalHarmonized,false);
  assert.match(html,/과거 경계 복원이 아니며/);
  assert.match(html,/분할·통합을 임의 연결하거나 배분하지 않습니다/);
  assert.equal(createHash('sha256').update(readFileSync(resolve(dist,manifest.boundary.file))).digest('hex'),manifest.boundary.sha256);
});
