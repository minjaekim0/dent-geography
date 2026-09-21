export const SEXES=['전체','남자','여자'];
export const isLocal=code=>/^\d{10}$/.test(code)&&!code.endsWith('00000');
export function ageCount(record,min=0,max=100,sex=0){
  if(!record||!Number.isInteger(min)||!Number.isInteger(max)||min<0||max>100||min>max||!record.ages?.[sex])return null;
  const values=record.ages[sex].slice(min,max+1);
  return values.length===max-min+1&&values.every(Number.isFinite)?values.reduce((a,b)=>a+b,0):null;
}
export function metricValue(record,{min=0,max=100,sex=0,metric='count'},area){
  const count=ageCount(record,min,max,sex);
  if(count==null)return null;
  if(metric==='share')return record.totals[0]>0?count/record.totals[0]*100:null;
  if(metric==='density')return Number.isFinite(area)&&area>0?count/area:null;
  return count;
}
export function polygons(geometry){return geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];}
// Spherical area of the supplied, already simplified geographic boundary. Not an official land area.
export function areaKm2(geometry){
  const rad=Math.PI/180,R=6371008.8;
  const ringArea=ring=>{
    let sum=0;
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];
      sum+=(b[0]-a[0])*rad*(2+Math.sin(a[1]*rad)+Math.sin(b[1]*rad));
    }
    return Math.abs(sum)*R*R/2/1e6;
  };
  return polygons(geometry).reduce((sum,rings)=>sum+Math.max(0,ringArea(rings[0])-rings.slice(1).reduce((a,r)=>a+ringArea(r),0)),0);
}
export const COLORS=['#eff6ff','#dbeafe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#172554'];
export function thresholds(metric){return metric==='share'?[5,10,20,30,40,60,80]:metric==='density'?[100,500,1000,3000,5000,10000,20000]:[500,1000,3000,5000,10000,30000,50000];}
export function color(value,metric){if(value==null||!Number.isFinite(value))return '#cbd5e1';return COLORS[thresholds(metric).filter(t=>value>=t).length];}
export function ageLabel(min,max){return min===0&&max===100?'전체 연령':max===100?`${min}세 이상`:min===max?`${min}세`:`${min}~${max}세`;}
export function delta(current,previous){if(!Number.isFinite(current)||!Number.isFinite(previous))return null;return {count:current-previous,percent:previous>0?(current-previous)/previous*100:null};}
// Missing endpoints are unknown, never assumed zero. Compare identical codes only.
export function populationChange(start,end,{min=0,max=100,sex=0}={}){
  const before=ageCount(start,min,max,sex),after=ageCount(end,min,max,sex);
  return {before,after,...(delta(after,before)||{count:null,percent:null})};
}
export function changeColor(value,metric='change'){
  if(!Number.isFinite(value))return '#cbd5e1';
  if(value===0)return '#f8fafc';
  const cuts=metric==='growth'?[1,5,10]:[100,1000,5000];
  const index=cuts.filter(t=>Math.abs(value)>=t).length;
  return (value<0?['#fee2e2','#fca5a5','#ef4444','#991b1b']:['#dcfce7','#86efac','#22c55e','#166534'])[index];
}
