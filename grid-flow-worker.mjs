import {TileStore,intersects} from './heatmap-model.mjs';
import {decodeClinicIndex} from './clinic-model.mjs';
import {bounds} from './catchment-model.mjs?v=adaptive3-1';
import {cellContains,gridDistribution} from './grid-flow-model.mjs?v=separate-modes-1';
import {profileForCell} from './catchment-policy.mjs?v=adaptive3-1';
let clinics,latest=0;const sources=new Map();
async function json(url){const response=await fetch(url);if(!response.ok)throw Error('격자 분산 자료를 불러오지 못했습니다.');return response.json();}
async function source(key){
  if(!sources.has(key)){const root=new URL(key==='workers'?'data/sgis-workers/':'data/sgis-population/',import.meta.url);sources.set(key,json(new URL('manifest.json',root)).then(meta=>({meta,store:new TileStore(root)})).catch(e=>{sources.delete(key);throw e;}));}
  return sources.get(key);
}
async function run({id,point,ringsOnly=false}){
  latest=id;
  if(!clinics)clinics=json(new URL('data/current-clinics-index.json',import.meta.url)).then(decodeClinicIndex).catch(e=>{clinics=null;throw e;});
  const all=await clinics,query=bounds(point,150),rows={};
  if(id!==latest)return;
  if(ringsOnly){self.postMessage({id,cell:{lat:point.lat,lng:point.lng},profile:profileForCell(point,all.locations),destinations:[],reference:true});return;}
  for(const key of ['population','workers']){
    const {meta,store}=await source(key),level=meta.levels.find(l=>l.cellSizeM===100);
    const files=level.tiles.filter(t=>intersects(t.bbox,query)).map(t=>t.file);
    rows[key]=(await Promise.all(files.map(f=>store.get(f)))).flat();if(id!==latest)return;
  }
  const geometry=rows.population.find(row=>cellContains(point,row))||rows.workers.find(row=>cellContains(point,row));
  if(!geometry){self.postMessage({id,missing:true});return;}
  const cell={lng:geometry[0]/1e5,lat:geometry[1]/1e5,geometry:geometry.slice(3,11)};
  for(const key of ['population','workers']){const row=rows[key].find(r=>r[0]===geometry[0]&&r[1]===geometry[1]);cell[key]=row?row[2]:null;}
  const profile=profileForCell(cell,all.locations);
  self.postMessage({id,cell,profile,destinations:gridDistribution(cell,all.locations,{profile}),reference:false});
}
self.onmessage=({data})=>{run(data).catch(e=>{if(data.id===latest)self.postMessage({id:data.id,error:e.message});});};
