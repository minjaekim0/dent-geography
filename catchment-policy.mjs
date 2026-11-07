import {distance,bounds,marketWeights,distanceWeight} from './catchment-model.mjs?v=adaptive3-1';
export function densityProfile(nearbyClinics){
  return nearbyClinics>=30?{key:'dense',label:'밀집',radius:1000,halfLife:100,nearbyClinics}:
    nearbyClinics>=10?{key:'medium',label:'중간',radius:2000,halfLife:300,nearbyClinics}:
      {key:'sparse',label:'일반',radius:3000,halfLife:500,nearbyClinics};
}
export function profileForCell(cell,existingClinics){
  return densityProfile(existingClinics.filter(p=>!p.candidate&&distance(cell,p)<1000).length);
}
// This index contains existing clinics only. The candidate never changes a
// cell's policy, so before/after comparisons use the same distance function.
export function createAdaptiveMarket(index){
  const profiles=new Map();
  function profile(cell){
    const key=cell.lng+':'+cell.lat;
    if(!profiles.has(key))profiles.set(key,profileForCell(cell,index.query(bounds(cell,1000))));
    return profiles.get(key);
  }
  const get=cell=>{
    const policy=profile(cell),market=marketWeights(cell,index.query(bounds(cell,policy.radius)),policy.halfLife,policy.radius);
    return {profile:policy,market,total:market.reduce((sum,r)=>sum+r.weight,0)};
  };
  get.profile=profile;return get;
}
export function targetShare(cell,target,{profile,total}){
  const weight=distanceWeight(distance(cell,target),profile.halfLife,profile.radius);
  return weight?weight/(total+(target.id==null?weight:0)):0;
}
