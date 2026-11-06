import {decodeAgeTile,parentAgeValues,ageColour} from './age-heatmap-model.mjs';

const cache=new Map(),pending=new Map(),waiters=[];let running=0,latest=0;
const root=new URL('data/sgis-age/',import.meta.url),colours=Array.from({length:64},(_,i)=>ageColour(i));
async function load(file){
  if(cache.has(file))return cache.get(file);
  if(pending.has(file))return pending.get(file);
  const promise=(async()=>{
    if(running>=4)await new Promise(resolve=>waiters.push(resolve));else running++;
    try{
      const response=await fetch(new URL(file,root));if(!response.ok)throw Error('연령 인구 파일을 불러오지 못했습니다.');
      const tile=decodeAgeTile(await response.arrayBuffer());cache.set(file,tile);return tile;
    }finally{if(waiters.length)waiters.shift()();else running--;}
  })();
  pending.set(file,promise);try{return await promise;}finally{pending.delete(file);}
}
async function render(request){
  const {id,files,bounds,width,height,range,reference}=request;latest=id;
  const tiles=await Promise.all(files.map(load));if(id!==latest)return;
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');
  const [left,bottom,right,top]=bounds,sx=width/(right-left),sy=height/(top-bottom);
  let valid=0,missing=0,rendered=0;
  for(const tile of tiles){
    const ratios=parentAgeValues(tile,range),{view,offset,cells}=tile;
    for(let start=0;start<cells;start+=8192){
      if(id!==latest)return;
      const paths=Array.from({length:64},()=>new Path2D()),used=new Set();
      for(let i=start;i<Math.min(cells,start+8192);i++){
        const at=offset+i*32,x=view.getInt32(at,true)/10,y=view.getInt32(at+4,true)/10;
        if(x+100<left||x-100>right||y+100<bottom||y-100>top)continue;
        const points=[];let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
        for(let v=0;v<4;v++){
          const px=x+view.getInt16(at+8+v*4,true)/10,py=y+view.getInt16(at+10+v*4,true)/10;
          points.push([(px-left)*sx,(top-py)*sy]);xmin=Math.min(xmin,px);xmax=Math.max(xmax,px);ymin=Math.min(ymin,py);ymax=Math.max(ymax,py);
        }
        if(xmax<left||xmin>right||ymax<bottom||ymin>top)continue;
        const ratio=ratios[view.getUint32(at+24,true)];
        if(ratio<0){missing++;continue;}valid++;
        const pop=view.getUint32(at+28,true)*ratio;
        if(pop<=0)continue;
        const bucket=Math.max(1,Math.round(Math.min(1,pop/reference)*63)),path=paths[bucket];used.add(bucket);
        path.moveTo(...points[0]);for(let v=1;v<4;v++)path.lineTo(...points[v]);path.closePath();rendered++;
      }
      for(const bucket of used){ctx.fillStyle=colours[bucket];ctx.fill(paths[bucket]);}
      // Accept a newer selection or viewport before doing more raster work.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  if(id!==latest)return;
  const bitmap=canvas.transferToImageBitmap();self.postMessage({id,bitmap,valid,missing,rendered},[bitmap]);
}
self.onmessage=({data})=>{
  if(data.type==='cancel'){latest=data.id;return;}
  render(data).catch(error=>{if(data.id===latest)self.postMessage({id:data.id,error:error.message});});
};
