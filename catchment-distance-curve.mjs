import {DISTANCE_STEP,DISTANCE_MAX} from './catchment-distance-model.mjs';

// Interpolate bin centres without overshooting population peaks or dipping below zero.
// Flat zero intervals stay zero; tooltips continue to use the original bin totals.
export function distanceCurve(values){
  const slopes=values.map((value,i)=>{
    if(i===0||i===values.length-1)return 0;
    const before=value-values[i-1],after=values[i+1]-value;
    return before*after>0?2*before*after/(before+after):0;
  });
  return Array.from({length:601},(_,j)=>{
    const metres=j*DISTANCE_MAX/600,index=metres/DISTANCE_STEP-.5;
    if(!values.length)return [metres,0];
    if(index<=0)return [metres,values[0]];
    if(index>=values.length-1)return [metres,values[values.length-1]];
    const i=Math.floor(index),t=index-i,t2=t*t,t3=t2*t;
    return [metres,(2*t3-3*t2+1)*values[i]+(t3-2*t2+t)*slopes[i]+(-2*t3+3*t2)*values[i+1]+(t3-t2)*slopes[i+1]];
  });
}
