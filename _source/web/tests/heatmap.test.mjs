import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {TileStore,contains,intersects,levelSize,weight,reusableRaster,decodeCells,cellBounds,paintCellSurface} from '../dist/heatmap-model.mjs';
const data=new URL('../dist/data/sgis-population/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',data)));

test('nationwide heatmap retains source cells including explicit zero and conserves population at every zoom level',()=>{
  const raw=new URL('../../data/raw/2026-11-06/sgis/',import.meta.url);
  const report=JSON.parse(readFileSync(new URL('validation-report.json',raw)));
  const files=JSON.parse(readFileSync(new URL('file-manifest.json',raw)));
  const source=files.find(f=>f.kind==='population');
  assert.equal(manifest.rawPopulationSha256,source.sha256);
  assert.equal(createHash('sha256').update(readFileSync(new URL(source.filename,raw))).digest('hex'),source.sha256);
  assert.equal(manifest.populationYear,2024);assert.equal(manifest.boundaryYear,2025);
  assert.equal(manifest.schemaVersion,2);assert.equal(manifest.format.recordBytes,28);
  assert.equal(manifest.sourcePopulationCells,report.totals.population_grids);
  assert.equal(manifest.joinAudit.length,30);
  assert.equal(manifest.joinAudit.reduce((sum,t)=>sum+t.matched_cells,0),report.totals.population_grids);
  for(const level of manifest.levels){
    let count=0,sum=0,zeros=0;
    for(const tile of level.tiles){
      const file=new URL(tile.file,data),bytes=readFileSync(file),points=decodeCells(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
      assert.ok(statSync(file).size<1500000,'viewport shards should remain small');
      assert.equal(points.length,tile.count);
      for(const p of points){
        assert.equal(p.length,11);assert.ok(contains(tile.bbox,p));
        assert.ok(p[0]>123e5&&p[0]<133e5&&p[1]>32e5&&p[1]<40e5);
        assert.ok(contains(cellBounds(p),p),'centre must lie inside its full footprint');
        assert.ok(p.slice(3).every(Number.isFinite));
        assert.ok(Number.isInteger(p[2])&&p[2]>=0);sum+=p[2];zeros+=p[2]===0;
      }
      count+=points.length;
    }
    assert.equal(count,level.count);assert.equal(sum,report.totals.total_population_value_sum);
    if(level.cellSizeM===100){assert.equal(count,report.totals.population_grids);assert.equal(zeros,report.totals.zero_total_population_records);}
  }
});

test('viewport, zoom and intensity handle zero without creating a population observation',()=>{
  for(const zoom of [2,6,7,10,12,14])assert.equal(levelSize(zoom),100);
  assert.ok(intersects([126,37,127,38],[127,38,128,39]));
  assert.equal(intersects([126,37,127,38],[128,38,129,39]),false);
  assert.equal(contains([126,37,127,38],[127e5,38e5,0]),true);
  assert.equal(weight(0,100),0);assert.ok(weight(5,100)<weight(50,100));assert.equal(weight(200,100),1);
});

test('tile loading shares requests, bounds concurrency and cache, retries failed requests, and stops stale queues',async()=>{
  let running=0,maxRunning=0,calls=0,fail=true;
  const store=new TileStore(new URL('https://example.test/data/'),{limit:2,fetcher:async function(url){
    assert.equal(this,undefined,'native browser fetch cannot be invoked as a store method');
    calls++;running++;maxRunning=Math.max(maxRunning,running);await new Promise(resolve=>setTimeout(resolve,1));running--;
    if(url.pathname.endsWith('fail')&&fail){fail=false;return {ok:false};}
    return {ok:true,json:async()=>[[1,2,3]]};
  }});
  await Promise.all([store.get('one'),store.get('one')]);assert.equal(calls,1);
  await store.load(['two','three','four','five','six','seven']);assert.ok(maxRunning<=4);assert.equal(store.cache.size,2);
  await assert.rejects(store.get('fail'));assert.deepEqual(await store.get('fail'),[[1,2,3]]);
  const before=calls;assert.deepEqual(await store.load(['never'],()=>false),[]);assert.equal(calls,before);
  assert.equal(store.hasAll(['fail']),true);assert.deepEqual(store.peek(['fail','missing']),[[1,2,3]]);
  assert.equal(store.hasAll(['fail','missing']),false);
  await Promise.all(Array.from({length:12},(_,i)=>store.get('parallel-'+i)));
  assert.ok(maxRunning<=4,'global limit also covers overlapping viewport queues');
});

test('buffered cell image survives pans but invalidates for edges, zoom or newly loaded tiles',()=>{
  const painted={bbox:[126,37,128,39],level:100,zoom:6,files:'a|b'};
  const view={bbox:[126.2,37.1,127.8,38.7],level:100,zoom:6,files:'a|b'};
  assert.equal(reusableRaster(painted,view),true);
  assert.equal(reusableRaster(painted,{...view,bbox:[126.1,37.2,127.9,38.8]}),true);
  assert.equal(reusableRaster(painted,{...view,bbox:[125.9,37.2,127.9,38.8]}),false);
  for(const changed of [{zoom:5},{level:500},{files:'a|b|c'}])assert.equal(reusableRaster(painted,{...view,...changed}),false);
  assert.equal(reusableRaster(null,view),false);
});

test('cell surface fills all four corners with proportional intensity, includes partial edge cells and preserves zero',()=>{
  const cell=(x,y,pop)=>[Math.round(x*1e5),Math.round(y*1e5),pop,x-.0005,y-.0005,x+.0005,y-.0005,x+.0005,y+.0005,x-.0005,y+.0005];
  const a=cell(126,37,25),b=cell(126.001,37,100),zero=cell(126.002,37,0),outside=cell(127,38,100);
  const fills=[];let path;
  const ctx={beginPath(){path=[];},moveTo(x,y){path.push([x,y]);},lineTo(x,y){path.push([x,y]);},closePath(){path.push('closed');},fill(){fills.push({path,style:this.fillStyle});}};
  const project=(lng,lat)=>({x:lng*100,y:lat*100});
  assert.equal(paintCellSurface(ctx,[a,b,zero,outside],100,project,[126.00025,36.999,126.003,37.001]),2);
  assert.deepEqual(fills[0].path,[...Array.from({length:4},(_,i)=>[a[3+i*2]*100,a[4+i*2]*100]),'closed']);
  const alpha=style=>Number(style.match(/,([.\d]+)\)$/)[1]);
  assert.equal(alpha(fills[0].style),.3);assert.equal(alpha(fills[1].style),.9);
});

test('binary cell decoder retains corner precision and population and rejects invalid data',()=>{
  const bytes=new ArrayBuffer(44),v=new DataView(bytes);
  v.setUint32(0,0x53474332,false);v.setUint32(4,1,true);v.setUint32(8,100000,true);v.setUint32(12,1000000,true);
  v.setInt32(16,12700000,true);v.setInt32(20,3700000,true);v.setUint32(24,123,true);
  [-500,-450,500,-450,500,450,-500,450].forEach((n,i)=>v.setInt16(28+i*2,n,true));
  const [cell]=decodeCells(bytes);assert.deepEqual(cell.slice(0,3),[12700000,3700000,123]);
  assert.ok(Math.abs(cell[3]-126.9995)<1e-10);assert.ok(Math.abs(cell[8]-37.00045)<1e-10);
  assert.throws(()=>decodeCells(bytes.slice(0,43)));v.setUint32(0,0);assert.throws(()=>decodeCells(bytes));
});

test('heatmap is an independent lazy demographic panel and preserves public project-relative paths',()=>{
  const main=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  assert.match(main,/data-metric="populationHeatmap"/);assert.match(main,/data-src="heatmap.html\?embed=1"/);
  const html=readFileSync(new URL('../dist/heatmap.html',import.meta.url),'utf8');
  assert.match(html,/heat-visible/);assert.match(html,/heat-opacity/);assert.match(html,/heat-blur/);
  assert.match(html,/2024/);assert.match(html,/2025/);assert.match(html,/파일에 없는 격자를 0명으로 채우지/);
  const js=readFileSync(new URL('../dist/population-heat-layer.mjs',import.meta.url),'utf8');
  assert.match(js,/new URL\('data\/sgis-population\/',import.meta.url\)/);
  assert.doesNotMatch(js,/fetch\(['"]\/data/);
});
