export const MISSING_AGE=0xffffffff;
export function validAgeRange(range){return Array.isArray(range)&&range.length===2&&range.every(Number.isInteger)&&range[0]>=0&&range[1]<=20&&range[0]<=range[1];}
export function ageRangeLabel(range){return range[1]===20?(range[0]===20?'100세 이상':`${range[0]*5}세 이상`):`${range[0]*5}–${range[1]*5+4}세`;}
export function ageReference(manifest,range){
  if(!validAgeRange(range))throw Error('연령 범위가 올바르지 않습니다.');
  // Fixed nationwide normalisation for this selection, never a viewport maximum.
  return Math.max(.5,manifest.totalWeightReference*manifest.ageValueSums.slice(range[0],range[1]+1).reduce((a,b)=>a+b,0)/manifest.populationSum);
}
export function decodeAgeTile(buffer){
  const view=new DataView(buffer);
  if(buffer.byteLength<16||view.getUint32(0,false)!==0x53414731)throw Error('연령 자료 형식 오류');
  const parents=view.getUint32(4,true),cells=view.getUint32(8,true),offset=16+parents*88;
  if(view.getUint32(12,true)!==32||buffer.byteLength!==offset+cells*32)throw Error('연령 자료 크기 오류');
  // Check parent references once, rather than accepting malformed out-of-bounds data.
  for(let i=0;i<cells;i++)if(view.getUint32(offset+i*32+24,true)>=parents)throw Error('연령 격자 연결 오류');
  return {view,parents,cells,offset};
}
export function parentAgeValues(tile,range){
  if(!validAgeRange(range))throw Error('연령 범위가 올바르지 않습니다.');
  const values=new Float64Array(tile.parents),{view}=tile;
  for(let i=0;i<tile.parents;i++){
    const start=16+i*88,denom=view.getUint32(start,true);let sum=0;
    if(!denom){values[i]=-1;continue;}
    for(let j=range[0];j<=range[1];j++){
      const value=view.getUint32(start+4+j*4,true);
      if(value===MISSING_AGE){sum=-1;break;}
      sum+=value;
    }
    values[i]=sum<0?-1:sum/denom;
  }
  return values;
}
export function ageColour(bucket){
  const t=bucket/63;
  return `rgba(${Math.round(255-20*t)},${Math.round(170-115*t)},${Math.round(185-80*t)},${Math.min(.9,t*1.2)})`;
}
