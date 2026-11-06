import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import {decodeAgeTile,parentAgeValues,ageReference,validAgeRange,ageRangeLabel,MISSING_AGE} from '../dist/age-heatmap-model.mjs';
import {AgeHeatRenderer} from '../dist/age-heatmap-renderer.mjs';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const bytes=file=>{const b=readFileSync(new URL(file,import.meta.url));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
function fixture(){
  const buffer=new ArrayBuffer(16+3*88+2*32),v=new DataView(buffer);
  v.setUint32(0,0x53414731,false);v.setUint32(4,3,true);v.setUint32(8,2,true);v.setUint32(12,32,true);
  for(let p=0;p<3;p++)for(let a=0;a<22;a++)v.setUint32(16+p*88+a*4,a===0?100:MISSING_AGE,true);
  v.setUint32(20,7,true);v.setUint32(24,3,true);v.setUint32(28,0,true);v.setUint32(16+88,0,true);
  v.setUint32(16+3*88+28,25,true);v.setUint32(16+3*88+32+28,75,true);
  return buffer;
}
test('age allocation preserves explicit zero, excludes missing bins and zero denominators, and conserves source counts',()=>{
  const tile=decodeAgeTile(fixture());
  assert.equal(parentAgeValues(tile,[0,1])[0],.1);
  assert.equal(parentAgeValues(tile,[2,2])[0],0);
  assert.equal(parentAgeValues(tile,[0,3])[0],-1,'missing bin cannot be dropped from a sum');
  assert.equal(parentAgeValues(tile,[0,0])[1],-1,'zero denominator');
  assert.equal(parentAgeValues(tile,[0,0])[2],-1,'all age values missing');
  const ratio=parentAgeValues(tile,[0,1])[0];assert.equal(ratio*25+ratio*75,10);
  const bad=fixture();new DataView(bad).setUint32(16+3*88+24,3,true);assert.throws(()=>decodeAgeTile(bad),/연결/);
  assert.throws(()=>decodeAgeTile(fixture().slice(1)),/형식/);
  assert.throws(()=>decodeAgeTile(fixture().slice(0,-1)),/크기/);
});
test('age bounds include 100+ and use one nationwide reference independent of viewport or zoom',()=>{
  assert.equal(validAgeRange([0,20]),true);assert.equal(validAgeRange([20,20]),true);
  for(const bad of [[-1,0],[0,21],[5,4],[1.2,3],[],null])assert.equal(validAgeRange(bad),false);
  assert.equal(ageRangeLabel([0,2]),'0–14세');assert.equal(ageRangeLabel([13,20]),'65세 이상');assert.equal(ageRangeLabel([20,20]),'100세 이상');
  assert.equal(ageReference({totalWeightReference:100,populationSum:1000,ageValueSums:[10,20,30]},[0,2]),6);
});
test('all nationwide binary age cells retain published totals, denominators, counts and source provenance',()=>{
  const manifest=JSON.parse(read('../dist/data/sgis-age/manifest.json'));
  const sourceBytes=readFileSync(new URL('../../data/processed/sgis-age-100m/manifest.json',import.meta.url));
  const source=JSON.parse(sourceBytes);assert.equal(manifest.sourceManifestSha256,createHash('sha256').update(sourceBytes).digest('hex'));
  assert.equal(manifest.sourceAgeSha256,source.sourceAge1km.sha256);
  const csv=gunzipSync(readFileSync(new URL('../../data/processed/sgis-age-100m/sgis-2024-age-1km.csv.gz',import.meta.url))).toString('utf8').replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const header=csv.shift().split(','),codeIndex=header.indexOf('grid_cd_1km'),denomIndex=header.indexOf('population_sum_100m');
  const ageIndices=Array.from({length:21},(_,i)=>header.indexOf(`in_age_${String(i+1).padStart(3,'0')}`));
  const originalParents=new Map(csv.map(line=>{const row=line.split(',');return [row[codeIndex],[Number(row[denomIndex]),...ageIndices.map(i=>row[i]===''?MISSING_AGE:Number(row[i]))]];}));
  let cellCount=0,parentCount=0,populationSum=0;
  const allocatedSums=new Float64Array(21),validCounts=new Uint32Array(21);
  for(const entry of manifest.tiles){
    const buffer=bytes('../dist/data/sgis-age/'+entry.file),tile=decodeAgeTile(buffer);
    assert.equal(createHash('sha256').update(new Uint8Array(buffer)).digest('hex'),entry.sha256);
    assert.equal(tile.cells,entry.cells);assert.equal(tile.parents,entry.parents);assert.equal(tile.parents,entry.parentCodes.length);
    const denoms=new Float64Array(tile.parents);
    for(let i=0;i<tile.cells;i++){
      const at=tile.offset+i*32,parent=tile.view.getUint32(at+24,true),pop=tile.view.getUint32(at+28,true);
      denoms[parent]+=pop;populationSum+=pop;
      // All vertices span a genuine ~100m footprint in the Kakao metre projection.
      const xs=[],ys=[];for(let j=0;j<4;j++){xs.push(tile.view.getInt16(at+8+j*4,true)/10);ys.push(tile.view.getInt16(at+10+j*4,true)/10);}
      assert.ok(Math.max(...xs)-Math.min(...xs)>99&&Math.max(...xs)-Math.min(...xs)<104);
      assert.ok(Math.max(...ys)-Math.min(...ys)>99&&Math.max(...ys)-Math.min(...ys)<104);
    }
    for(let p=0;p<tile.parents;p++){
      assert.equal(denoms[p],tile.view.getUint32(16+p*88,true));
      const expected=originalParents.get(entry.parentCodes[p]);assert.ok(expected);
      for(let i=0;i<22;i++)assert.equal(tile.view.getUint32(16+p*88+i*4,true),expected[i]);
    }
    for(let age=0;age<21;age++){
      const ratios=parentAgeValues(tile,[age,age]);
      for(let i=0;i<tile.cells;i++){
        const at=tile.offset+i*32,parent=tile.view.getUint32(at+24,true),ratio=ratios[parent];
        if(ratio>=0){allocatedSums[age]+=tile.view.getUint32(at+28,true)*ratio;validCounts[age]++;}
      }
    }
    cellCount+=tile.cells;parentCount+=tile.parents;
  }
  assert.equal(cellCount,1088760);assert.equal(parentCount,75070);assert.equal(populationSum,52926835);
  for(let age=0;age<21;age++){
    const info=source.ageAudit[`in_age_${String(age+1).padStart(3,'0')}`];
    assert.ok(Math.abs(allocatedSums[age]-info.allocatable_value_sum)<.0001);
    assert.equal(validCounts[age],cellCount-info.missing_cells_100m);
  }
});
test('background renderer cancels obsolete selections, closes stale bitmaps and can retry worker errors',async()=>{
  const Original=globalThis.Worker;let worker,closed=0;
  globalThis.Worker=class{constructor(){worker=this;this.messages=[];}postMessage(message){this.messages.push(message);}terminate(){this.terminated=true;}};
  try{
    const renderer=new AgeHeatRenderer();const first=renderer.render({range:[0,2]});
    const stale=first.catch(error=>error.name);
    const second=renderer.render({range:[13,20]});assert.equal(await stale,'AbortError');
    worker.onmessage({data:{id:1,bitmap:{close(){closed++;}}}});assert.equal(closed,1);
    worker.onmessage({data:{id:2,bitmap:{close(){}},valid:4}});assert.equal((await second).valid,4);
    const failed=renderer.render({range:[0,0]}).catch(error=>error.message);worker.onerror();assert.match(await failed,/실패/);assert.equal(worker.terminated,true);
    const retry=renderer.render({range:[0,0]});worker.onmessage({data:{id:4,valid:1}});assert.equal((await retry).valid,1);
  }finally{globalThis.Worker=Original;}
});
test('home age UI defaults to all population and restores the seven age groups across map switches',()=>{
  const nodes=new Map(),created=[];
  const node=()=>({checked:true,value:'24',selectedOptions:[{textContent:'19세 이하'}],handlers:{},querySelector:()=>({textContent:''}),addEventListener(type,fn){this.handlers[type]=fn;}});
  const document={querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},createElement:node};
  document.querySelector('#population-heat-age').value='all';document.querySelector('#population-heat-opacity').value='65';
  let active=0;const controllers=[0,1].map(id=>({map:{id},canvas:{},el:{closest:()=>active!==id,append(){}}}));
  class Layer{constructor(){created.push(this);}setAgeRange(value){this.range=value;}setStyle(){}setEnabled(value){this.enabled=value;}}
  const context=vm.createContext({document,PopulationHeatLayer:Layer,ageRangeLabel,clinicMapControllers:new Map(controllers.map((c,i)=>[i,c]))});
  vm.runInContext(read('../dist/kakao-heatmap.mjs').replace(/^import .*;\n/gm,''),context);
  const age=nodes.get('#population-heat-age');
  assert.equal(created[0].range,null);
  age.value='4:5';age.handlers.change();assert.deepEqual(Array.from(created[0].range),[4,5]);
  active=1;nodes.get('#population-heat-toggle').handlers.change();assert.deepEqual(Array.from(created[1].range),[4,5]);
  assert.equal(created[0].enabled,false);
  age.value='14:20';age.handlers.change();assert.deepEqual(Array.from(created[1].range),[14,20]);
  for(const file of ['index.html','kakao.html','lab.html']){
    const html=read('../dist/'+file);assert.match(html,/id="population-heat-age"/);assert.match(html,/1km 자료를 100m 인구 비중으로 배분한 추정치/);
    const choices=[...html.match(/<select id="population-heat-age"[^>]*>(.*?)<\/select>/s)[1].matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m=>[m[1],m[2]]);
    assert.deepEqual(choices,[['all','전체'],['0:3','19세 이하'],['4:5','20대'],['6:7','30대'],['8:9','40대'],['10:11','50대'],['12:13','60대'],['14:20','70대 이상']]);
    assert.doesNotMatch(html,/id="population-heat-age-(?:min|max)"/);
  }
});
