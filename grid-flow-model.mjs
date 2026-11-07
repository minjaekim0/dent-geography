import {marketWeights,distance} from './catchment-model.mjs?v=adaptive3-1';
import {profileForCell} from './catchment-policy.mjs?v=adaptive3-1';
// Geodesic ring, using the same spherical Earth radius as distance().
export function distanceRing(center,metres,segments=96){
  const radians=Math.PI/180,lat=center.lat*radians,lng=center.lng*radians,angle=metres/6371008.8;
  return Array.from({length:segments+1},(_,i)=>{
    const bearing=i/segments*2*Math.PI;
    const y=Math.asin(Math.sin(lat)*Math.cos(angle)+Math.cos(lat)*Math.sin(angle)*Math.cos(bearing));
    const x=lng+Math.atan2(Math.sin(bearing)*Math.sin(angle)*Math.cos(lat),Math.cos(angle)-Math.sin(lat)*Math.sin(y));
    return {lat:y/radians,lng:x/radians};
  });
}
export function cellContains(point,row){
  if(row.length<11)return false;
  const x=point.lng,y=point.lat;let inside=false;
  for(let i=0,j=3;i<4;j=i++){
    const a=row[3+i*2],b=row[4+i*2],c=row[3+j*2],d=row[4+j*2];
    const cross=(x-a)*(d-b)-(y-b)*(c-a);
    if(Math.abs(cross)<1e-13&&x>=Math.min(a,c)-1e-10&&x<=Math.max(a,c)+1e-10&&y>=Math.min(b,d)-1e-10&&y<=Math.max(b,d)+1e-10)return true;
    if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)inside=!inside;
  }
  return inside;
}
export function gridDistribution(cell,clinics,{profile=profileForCell(cell,clinics)}={}){
  // Preserve every competitor in the denominator, even when only top arrows are drawn.
  const destinations=clinics.filter(clinic=>!clinic.candidate);
  const weights=marketWeights(cell,destinations,profile.halfLife,profile.radius),total=weights.reduce((s,r)=>s+r.weight,0);
  return weights.map(({clinic,weight})=>({clinic,distance:distance(cell,clinic),probability:weight/total,
    population:cell.population==null?null:cell.population*weight/total,
    workers:cell.workers==null?null:cell.workers*weight/total,
  })).sort((a,b)=>b.probability-a.probability||a.distance-b.distance);
}
