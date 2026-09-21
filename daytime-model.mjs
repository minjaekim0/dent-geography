export const PROVINCES={'11':'서울특별시','21':'부산광역시','22':'대구광역시','23':'인천광역시','24':'광주광역시','25':'대전광역시','26':'울산광역시','29':'세종특별자치시','31':'경기도','32':'강원도','33':'충청북도','34':'충청남도','35':'전라북도','36':'전라남도','37':'경상북도','38':'경상남도','39':'제주특별자치도'};
export const identity=name=>name.replace(/강원특별자치도/g,'강원도').replace(/전북특별자치도/g,'전라북도').replace(/\s/g,'');
export function observation(record,sex='0',age='합계'){return record?.values[`${sex}:${age}`]??null;}
export function metricValue(row,metric){
  if(!row)return null;
  if(metric==='index')return row.resident>0&&row.daytime!=null?row.daytime/row.resident*100:null;
  if(metric==='net')return row.inflow!=null&&row.outflow!=null?row.inflow-row.outflow:null;
  return row[metric]??null;
}
export function difference(start,end){return start==null||end==null?null:end-start;}
export function regionKey(feature){const p=feature.properties;return identity(p.code==='29010'?'세종특별자치시 세종시':`${PROVINCES[String(p.code).slice(0,2)]} ${p.name}`);}
