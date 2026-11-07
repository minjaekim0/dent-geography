export const RADIUS = 3000;
export const BANDS = [100,300,500,1000,2000,3000];
export function distance(a,b){
  const r=Math.PI/180,dy=(b.lat-a.lat)*r,dx=(b.lng-a.lng)*r;
  const h=Math.sin(dy/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dx/2)**2;
  return 6371008.8*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
export function bounds(p,radius){
  const dy=radius/110000,dx=dy/Math.cos((Math.abs(p.lat)+dy)*Math.PI/180);
  return [p.lng-dx,p.lat-dy,p.lng+dx,p.lat+dy];
}
export const distanceWeight=(metres,halfLife=500,radius=RADIUS)=>metres>=0&&metres<radius?2**(-metres/halfLife):0;
export function allocationShare(cell,target,competitors,halfLife=500,radius=RADIUS){
  const w=distanceWeight(distance(cell,target),halfLife,radius);
  if(!w)return 0;
  let denominator=w;
  for(const clinic of competitors){
    if(target.id!=null&&clinic.id===target.id)continue;
    denominator+=distanceWeight(distance(cell,clinic),halfLife,radius);
  }
  return w/denominator;
}
export function bandIndex(metres){return BANDS.findIndex(limit=>metres<limit);}

// Compare the same grid before/after adding exactly one candidate clinic.
export function marketWeights(cell,clinics,halfLife=500,radius=RADIUS){
  return clinics.map(clinic=>({clinic,weight:distanceWeight(distance(cell,clinic),halfLife,radius)})).filter(r=>r.weight>0);
}
export function expectedChange(population,weight,total,candidateWeight){
  if(!(total>0))return {before:0,after:0,loss:0};
  const before=population*weight/total,after=population*weight/(total+candidateWeight);
  return {before,after,loss:before-after};
}

// Each grid contributes its full count to one weight bucket for this clinic.
// The same grid can belong to another clinic's catchment with a different weight.
export const CHOICE_BANDS = ['50% 이상', '20% 이상 ~ 50% 미만', '0% 초과 ~ 20% 미만'];
export function choiceBandIndex(share){
  if(!(share>0&&share<=1))return -1;
  return share>=.5?0:share>=.2?1:2;
}
export function addChoicePopulation(buckets,share,population){
  const band=choiceBandIndex(share);
  if(band>=0)buckets[band]+=population;
}
