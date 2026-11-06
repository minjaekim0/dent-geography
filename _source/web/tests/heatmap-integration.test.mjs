import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {intersects,reusableRaster,paintCellSurface} from '../dist/heatmap-model.mjs';
import {chooseRasterLevel,blurRadiusPixels} from '../dist/population-heat-layer.mjs';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('blur preserves its ground distance as the map zoom changes',()=>{
  const metres=30;
  for(const mpp of [.5,2,8,32,128])assert.equal(blurRadiusPixels(6,mpp)*mpp,metres);
  assert.equal(blurRadiusPixels(0,8),0);
});

test('all overview images derive from the original 100m surface with a single fixed colour reference',()=>{
  const raw=readFileSync(new URL('../dist/data/sgis-population/manifest.json',import.meta.url));
  const cells=JSON.parse(raw),rasters=JSON.parse(read('../dist/data/sgis-heat-tiles/manifest.json'));
  assert.equal(rasters.sourceCellSizeM,100);assert.equal(rasters.populationCells,cells.sourcePopulationCells);
  assert.equal(rasters.populationValueSum,cells.populationValueSum);
  assert.equal(rasters.weightReference,cells.levels[0].weightReference);
  assert.equal(rasters.sourceManifestSha256,createHash('sha256').update(raw).digest('hex'));
  assert.equal(rasters.sourcePopulationSha256,cells.rawPopulationSha256);
  for(const level of rasters.levels)for(const tile of level.tiles){
    const png=readFileSync(new URL('../dist/data/sgis-heat-tiles/'+tile.file,import.meta.url));
    assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
    assert.equal(png[25],6,'transparent RGBA tiles');
    assert.ok(tile.nw.every(Number.isFinite)&&tile.se.every(Number.isFinite));
  }
  assert.equal(chooseRasterLevel(rasters.levels,8).resolutionM,20);
  assert.equal(chooseRasterLevel(rasters.levels,1000).resolutionM,1280);
});

test('heat layer attaches to the existing map, uses images for overview and exact 100m cells up close',async()=>{
  const children=[],frames=[],statuses=[];let level=13,imageLoads=0,cellReads=0,drawImages=0,fills=0;
  const context2d={clearRect(){},drawImage(){drawImages++;},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills++;}};
  const canvas={style:{},dataset:{},setAttribute(){},getContext:()=>context2d,remove(){}};
  const host={clientWidth:1000,clientHeight:600,closest:()=>null};
  class LatLng{constructor(lat,lng){this.lat=lat;this.lng=lng;}getLat(){return this.lat;}getLng(){return this.lng;}}
  const projection={containerPointFromCoords:p=>({x:(p.getLng()-126)*1000,y:(38-p.getLat())*600}),pointFromCoords:p=>({x:p.getLng()*1000,y:-p.getLat()*600}),coordsFromContainerPoint:p=>new LatLng(38-p.y/600,126+p.x/1000)};
  const map={getLevel:()=>level,getCenter:()=>new LatLng(37.5,126.5),getProjection:()=>projection,getBounds:()=>({getSouthWest:()=>new LatLng(37,126),getNorthEast:()=>new LatLng(38,127)})};
  class AbstractOverlay{setMap(m){this.map=m;if(m)this.onAdd();else this.onRemove();}getPanels(){return {overlayLayer:{append:c=>children.push(c)}};}getProjection(){return projection;}}
  const source=read('../dist/population-heat-layer.mjs').replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',"'http://test.local/population-heat-layer.mjs'").replaceAll('export ','');
  const context=vm.createContext({document:{createElement:()=>canvas},URL,Map,Image:class{},performance,setTimeout,clearTimeout,
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},ResizeObserver:class{observe(){}},
    intersects,reusableRaster,paintCellSurface,TileStore:class{},loadAgeMetadata:()=>{},AgeHeatRenderer:class{},
    kakao:{maps:{AbstractOverlay,LatLng,Point:class{constructor(x,y){this.x=x;this.y=y;}},event:{addListener(){}}}}});
  vm.runInContext(source+'\nglobalThis.Layer=PopulationHeatLayer;',context);
  const cell=[12650000,3750000,100,126.4995,37.4995,126.5005,37.4995,126.5005,37.5005,126.4995,37.5005];
  const data={cells:{levels:[{cellSizeM:100,weightReference:100,tiles:[{file:'one.bin',bbox:[126,37,127,38]}]}]},rasters:{levels:[{resolutionM:20,tiles:[{file:'one.png',bbox:[126,37,127,38],nw:[126,38],se:[127,37]}]}]}};
  const layer=new context.Layer(map,host,{onStatus:text=>statuses.push(text),loadData:async()=>data,
    store:{hasAll(){cellReads++;return true;},peek:()=>[cell]},imageLoader:async()=>{imageLoads++;return {};}});
  assert.equal(layer.map,map);assert.equal(children.length,1);
  layer.setEnabled(true);await layer.refresh();while(frames.length)frames.shift()();
  assert.equal(cellReads,0);assert.ok(imageLoads>0&&drawImages>0);assert.equal(canvas.dataset.sourceCellSizeM,'100');assert.equal(canvas.dataset.renderMode,'tiles');
  level=6;await layer.refresh();while(frames.length)frames.shift()();
  assert.ok(cellReads>0&&fills>0);assert.equal(canvas.dataset.renderMode,'cells');assert.equal(canvas.dataset.sourceCellSizeM,'100');
  const paints=canvas.dataset.drawCount;layer.setStyle({opacity:.4,blur:0});assert.equal(canvas.dataset.drawCount,paints);assert.equal(canvas.style.opacity,'0.4');assert.equal(canvas.style.filter,'none');
  layer.setEnabled(false);assert.equal(canvas.hidden,true);assert.match(statuses.at(-1),/100m/);
});

test('main workspace toggle preserves map instances and independently hides/resumes each heat layer',()=>{
  const nodes=new Map(),created=[];
  const node=()=>({style:{},checked:true,value:'24',selectedOptions:[{textContent:'19세 이하'}],handlers:{},append(){},querySelector:()=>({textContent:''}),addEventListener(type,fn){this.handlers[type]=fn;}});
  const document={querySelector:selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},createElement:node};
  document.querySelector('#population-heat-opacity').value='65';
  document.querySelector('#population-heat-age').value='0:3';
  document.querySelector('#workers-heat-toggle').checked=false;
  let active=0;const controllers=[0,1].map(id=>({map:{id},canvas:{id},el:{closest:()=>active!==id,append(){}}}));
  class Layer{constructor(map,host,options){Object.assign(this,{map,host,options});created.push(this);}setAgeRange(value){this.ageRange=value;}setStyle(style){this.style=style;}setEnabled(value){this.enabled=value;}}
  const context=vm.createContext({document,PopulationHeatLayer:Layer,clinicMapControllers:new Map(controllers.map((c,i)=>[i,c]))});
  vm.runInContext(read('../dist/kakao-heatmap.mjs').replace(/^import .*;\n/gm,''),context);
  assert.equal(created.length,1);assert.equal(created[0].map,controllers[0].map);assert.equal(created[0].enabled,true);
  const toggle=nodes.get('#population-heat-toggle');toggle.checked=false;toggle.handlers.change();assert.equal(created[0].enabled,false);
  toggle.checked=true;toggle.handlers.change();assert.equal(created.length,1);assert.equal(created[0].enabled,true);
  active=1;toggle.handlers.change();assert.equal(created.length,2);assert.equal(created[0].enabled,false);assert.equal(created[1].map,controllers[1].map);
  nodes.get('#population-heat-opacity').value='40';nodes.get('#population-heat-opacity').handlers.input();assert.equal(created[1].style.opacity,.4);
  const resident=created[1],workers=nodes.get('#workers-heat-toggle');
  workers.checked=true;workers.handlers.change();
  assert.equal(created.length,3);assert.equal(created[2].options.dataset,'workers');
  assert.equal(resident.enabled,true);assert.equal(created[2].enabled,true);
  assert.equal(created[2].ageRange,null);assert.equal(created[2].style.opacity,.4);
  assert.equal(nodes.get('label[for="population-heat-age"]').hidden,false);
  toggle.checked=false;toggle.handlers.change();
  assert.equal(resident.enabled,false);assert.equal(created[2].enabled,true);
  toggle.checked=true;toggle.handlers.change();
  workers.checked=false;workers.handlers.change();
  assert.equal(created.length,3,'reuse both overlays without recreating maps');
  assert.equal(created[2].enabled,false);assert.equal(resident.enabled,true);
  assert.deepEqual(Array.from(resident.ageRange),[0,3]);
  const html=read('../dist/index.html');assert.match(html,/id="population-heat-toggle" type="checkbox" checked/);assert.match(html,/src="kakao-heatmap.mjs\?v=[a-f0-9]+"/);
});
