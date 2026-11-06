export const intersects = (a,b) => a[0]<=b[2] && a[2]>=b[0] && a[1]<=b[3] && a[3]>=b[1];
export const levelSize = () => 100;
export const contains = (bbox,p,scale=100000) => p[0]/scale>=bbox[0]&&p[0]/scale<=bbox[2]&&p[1]/scale>=bbox[1]&&p[1]/scale<=bbox[3];
export const weight = (population,reference) => population>0 ? Math.min(1, population/Math.max(1,reference)) : 0;
export const covers = (outer,inner) => Boolean(outer)&&outer[0]<=inner[0]&&outer[1]<=inner[1]&&outer[2]>=inner[2]&&outer[3]>=inner[3];
export const reusableRaster = (painted,{bbox,level,zoom,files}) => Boolean(painted)&&painted.level===level&&painted.zoom===zoom&&painted.files===files&&covers(painted.bbox,bbox);

// Binary cells preserve each square's transformed footprint without eight large
// absolute coordinates repeated in JSON. Decoded vertices are WGS84 degrees.
export function decodeCells(buffer){
  const v=new DataView(buffer);
  if(v.byteLength<16||v.getUint32(0,false)!==0x53474332)throw Error('인구 격자 파일 형식이 올바르지 않습니다.');
  const count=v.getUint32(4,true),scale=v.getUint32(8,true),cornerScale=v.getUint32(12,true);
  if(scale!==100000||![100000,1000000].includes(cornerScale)||v.byteLength!==16+count*28)throw Error('인구 격자 파일 크기가 올바르지 않습니다.');
  const cells=new Array(count);
  for(let i=0,offset=16;i<count;i++,offset+=28){
    const x=v.getInt32(offset,true),y=v.getInt32(offset+4,true),cell=[x,y,v.getUint32(offset+8,true)];
    for(let vertex=0;vertex<4;vertex++)cell.push(x/scale+v.getInt16(offset+12+vertex*4,true)/cornerScale,y/scale+v.getInt16(offset+14+vertex*4,true)/cornerScale);
    cells[i]=cell;
  }
  return cells;
}

export function cellBounds(cell){
  return [Math.min(cell[3],cell[5],cell[7],cell[9]),Math.min(cell[4],cell[6],cell[8],cell[10]),Math.max(cell[3],cell[5],cell[7],cell[9]),Math.max(cell[4],cell[6],cell[8],cell[10])];
}

export function paintCellSurface(context,cells,reference,project,bbox){
  let rendered=0;
  for(const cell of cells){
    if(cell[2]<=0||!intersects(cellBounds(cell),bbox))continue;
    const t=weight(cell[2],reference);
    context.fillStyle=`rgba(${Math.round(255-91*t)},${Math.round(144-136*t)},${Math.round(129-94*t)},${Math.min(.9,t*1.2)})`;
    context.beginPath();
    for(let vertex=0;vertex<4;vertex++){
      const xy=project(cell[3+vertex*2],cell[4+vertex*2]);
      if(vertex===0)context.moveTo(xy.x,xy.y);else context.lineTo(xy.x,xy.y);
    }
    context.closePath();context.fill();rendered++;
  }
  return rendered;
}

// Bounded cache, shared in-flight requests, and HTTP failures that remain retryable.
export class TileStore {
  constructor(base, {fetcher=fetch,limit=36}={}) {this.base=base;this.fetcher=fetcher;this.limit=limit;this.cache=new Map();this.pending=new Map();this.running=0;this.waiters=[];}
  peek(files) {return files.flatMap(file=>this.cache.get(file)||[]);}
  hasAll(files) {return files.every(file=>this.cache.has(file));}
  async get(file) {
    if(this.cache.has(file)){const value=this.cache.get(file);this.cache.delete(file);this.cache.set(file,value);return value;}
    if(this.pending.has(file))return this.pending.get(file);
    const request=(async()=>{
      if(this.running>=4)await new Promise(resolve=>this.waiters.push(resolve));
      else this.running++;
      try{
        const fetcher=this.fetcher;
        const response=await fetcher(new URL(file,this.base));
        if(!response.ok)throw Error('인구 자료를 불러오지 못했습니다.');
        const points=file.endsWith('.bin')?decodeCells(await response.arrayBuffer()):await response.json();
        this.cache.set(file,points);
        while(this.cache.size>this.limit)this.cache.delete(this.cache.keys().next().value);
        return points;
      }finally{
        if(this.waiters.length)this.waiters.shift()();else this.running--;
      }
    })();
    this.pending.set(file,request);
    try{return await request;}finally{this.pending.delete(file);}
  }
  async load(files,isCurrent=()=>true) {
    let cursor=0;const out=[];
    await Promise.all(Array.from({length:Math.min(4,files.length)},async()=>{
      while(cursor<files.length&&isCurrent()){
        const index=cursor++;out[index]=await this.get(files[index]);
      }
    }));
    return isCurrent()?out.flat():[];
  }
}
