const RAD=Math.PI/180,R=6371008.8,REFERENCE_LAT=38,REFERENCE_LNG=127;
export const INFLOW_GROUP_METRES=500;
// Fixed geographic buckets, approximately 500m wide across Korea. These only
// simplify the display; every contribution was calculated on its original 100m grid.
export function inflowGroupKey({lat,lng}){
  const x=R*(lng-REFERENCE_LNG)*RAD*Math.cos(REFERENCE_LAT*RAD),y=R*(lat-REFERENCE_LAT)*RAD;
  return Math.floor(x/INFLOW_GROUP_METRES)+':'+Math.floor(y/INFLOW_GROUP_METRES);
}
export function createInflowGroups(){
  const groups=new Map();
  return {
    add(cell,population,probability){
      const expected=population*probability;
      if(!(population>0&&probability>0&&probability<=1&&Number.isFinite(expected)&&Number.isFinite(cell.lat)&&Number.isFinite(cell.lng)))return;
      const id=inflowGroupKey(cell);
      let row=groups.get(id);
      if(!row){row={id,expected:0,latSum:0,lngSum:0,cells:0};groups.set(id,row);}
      row.expected+=expected;row.latSum+=cell.lat*expected;row.lngSum+=cell.lng*expected;row.cells++;
    },
    rows(){return [...groups.values()].map(r=>({id:r.id,expected:r.expected,lat:r.latSum/r.expected,lng:r.lngSum/r.expected,cells:r.cells}));},
  };
}
export function selectInflowGroups(rows,total,limit=10){
  const sorted=rows.filter(r=>r.expected>0&&Number.isFinite(r.expected)).sort((a,b)=>b.expected-a.expected||a.id.localeCompare(b.id));
  const shown=sorted.slice(0,limit),displayed=shown.reduce((s,r)=>s+r.expected,0);
  return {rows:shown,total,displayed,coverage:total>0?Math.min(1,displayed/total):0,groups:sorted.length};
}
