import {expectedPopulation} from './catchment-distribution.mjs';
import {createDistanceHistogram,addDistancePopulation} from './catchment-distance-model.mjs';
import {createInflowGroups} from './catchment-inflow-model.mjs';
import {TileStore,intersects} from './heatmap-model.mjs';
import {decodeClinicIndex,createClinicIndex} from './clinic-model.mjs';
import {RADIUS,BANDS,distance,bounds,bandIndex,distanceWeight,expectedChange} from './catchment-model.mjs?v=adaptive3-1';
import {createAdaptiveMarket,targetShare} from './catchment-policy.mjs?v=adaptive3-1';
const sources=new Map();let clinics,latest=0;
async function json(url){const r=await fetch(url);if(!r.ok)throw Error('분석 자료를 불러오지 못했습니다. 다시 시도해 주세요.');return r.json();}
async function source(dataset){
  if(!sources.has(dataset)){
    const root=new URL(dataset==='workers'?'data/sgis-workers/':'data/sgis-population/',import.meta.url);
    sources.set(dataset,json(new URL('manifest.json',root)).then(meta=>({meta,store:new TileStore(root)})).catch(e=>{sources.delete(dataset);throw e;}));
  }
  return sources.get(dataset);
}
async function candidateImpact({id,target},all){
  // Changed cells are <3km from the candidate; impacted clinics can be <6km
  // away. Their complete catchments reach 9km and their competitors 12km.
  // Computing only within the candidate circle would understate baselines.
  const impacted=all.locations.filter(p=>distance(target,p)<RADIUS*2);
  const ids=new Set(impacted.map(p=>p.id)),rows=new Map(impacted.map(clinic=>[clinic.id,{clinic,distance:distance(target,clinic)}]));
  const index=createClinicIndex(all.locations.filter(p=>distance(target,p)<RADIUS*4),.01);
  const getMarket=createAdaptiveMarket(index);
  const query=bounds(target,RADIUS*3),newlyCovered={};
  for(const dataset of ['population','workers']){
    self.postMessage({id,phase:dataset==='workers'?'주변 치과의 종사인구 기댓값 비교 중…':'주변 치과의 거주인구 기댓값 비교 중…'});
    const {meta,store}=await source(dataset),level=meta.levels.find(l=>l.cellSizeM===100);
    const files=level.tiles.filter(t=>intersects(t.bbox,query)).map(t=>t.file);
    for(const row of rows.values())row[dataset]={before:0,after:0,loss:0,records:0};
    newlyCovered[dataset]=0;
    let processed=0;
    // Load sequentially to bound memory; TileStore shares cached requests.
    for(const file of files){
      const cells=await store.get(file);if(id!==latest)return null;
      for(const cellRow of cells){
        if(++processed%1024===0){await new Promise(r=>setTimeout(r,0));if(id!==latest)return null;}
        const cell={lng:cellRow[0]/100000,lat:cellRow[1]/100000},d=distance(cell,target);
        if(d>=RADIUS*3)continue;
        const {profile,market,total}=getMarket(cell),candidateWeight=distanceWeight(d,profile.halfLife,profile.radius);
        if(!total&&candidateWeight)newlyCovered[dataset]+=cellRow[2];
        for(const {clinic,weight} of market){
          if(!ids.has(clinic.id))continue;
          const record=rows.get(clinic.id)[dataset],change=expectedChange(cellRow[2],weight,total,candidateWeight);
          record.before+=change.before;record.after+=change.after;record.loss+=change.loss;record.records++;
        }
      }
    }
  }
  return {rows:[...rows.values()].filter(r=>r.population.loss>1e-8||r.workers.loss>1e-8),newlyCovered};
}
async function run({id,target}){
  latest=id;
  if(!clinics)clinics=json(new URL('data/current-clinics-index.json',import.meta.url)).then(decodeClinicIndex).catch(e=>{clinics=null;throw e;});
  const all=await clinics;
  // A cell <3km from the target can have competitors up to 6km from the target.
  // Include all sources, independently of the map viewport and marker filters.
  const local=all.locations.filter(p=>distance(target,p)<RADIUS*2);
  const index=createClinicIndex(local,.01),query=bounds(target,RADIUS);
  const getMarket=createAdaptiveMarket(index);
  const result={id,target,policy:'adaptive3',competitors:local.length-(target.id?1:0),datasets:{},clinicAsOf:all.hiraAsOf};
  for(const dataset of ['population','workers']){
    const {meta,store}=await source(dataset),level=meta.levels.find(l=>l.cellSizeM===100);
    if(!level)throw Error('100m 원자료를 확인할 수 없습니다.');
    const files=level.tiles.filter(t=>intersects(t.bbox,query)).map(t=>t.file);
    const tiles=await Promise.all(files.map(f=>store.get(f)));
    if(id!==latest)return;
    const bands=BANDS.map(()=>({nearby:0,cells:0})),distancePopulation=createDistanceHistogram(),probabilityPopulation=[],inflow=createInflowGroups(),profiles={dense:0,medium:0,sparse:0};let records=0;
    for(const tile of tiles){
      for(const row of tile){
        const cell={lng:row[0]/100000,lat:row[1]/100000};
        const d=distance(cell,target),b=bandIndex(d);if(b<0)continue;
        const profile=getMarket.profile(cell);if(d>=profile.radius)continue;
        bands[b].cells++;bands[b].nearby+=row[2];
        addDistancePopulation(distancePopulation,d,row[2]);
        profiles[profile.key]++;
        if(row[2]>0){
          const share=targetShare(cell,target,getMarket(cell));
          probabilityPopulation.push([share,row[2]]);inflow.add(cell,row[2],share);
        }
        records++;
      }
      await new Promise(resolve=>setTimeout(resolve,0));if(id!==latest)return;
    }
    result.datasets[dataset]={bands,distancePopulation,inflowGroups:inflow.rows(),profiles,probabilityPopulation,expectedPopulation:expectedPopulation(probabilityPopulation),records,files:files.length,year:meta.populationYear};
  }
  if(!target.id){result.impact=await candidateImpact({id,target},all);if(!result.impact)return;}
  if(id===latest)self.postMessage(result);
}
self.onmessage=({data})=>{
  if(data.cancel){latest=data.id;return;}
  run(data).catch(e=>{if(data.id===latest)self.postMessage({id:data.id,error:e.message});});
};
