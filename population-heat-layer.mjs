import {intersects,TileStore,reusableRaster,paintCellSurface} from './heatmap-model.mjs';
import {AgeHeatRenderer,loadAgeMetadata} from './age-heatmap-renderer.mjs';
import {ageReference,ageRangeLabel,validAgeRange} from './age-heatmap-model.mjs';

const dataRoot=new URL('data/sgis-population/',import.meta.url);
const rasterRoot=new URL('data/sgis-heat-tiles/',import.meta.url);
const sharedStore=new TileStore(dataRoot);
let metadata;
async function loadMetadata(){
  if(!metadata)metadata=Promise.all([dataRoot,rasterRoot].map(root=>fetch(new URL('manifest.json',root)).then(r=>{if(!r.ok)throw Error('인구 자료를 불러오지 못했습니다.');return r.json();}))).then(([cells,rasters])=>({cells,rasters})).catch(e=>{metadata=null;throw e;});
  return metadata;
}
const imageCache=new Map();
function loadImage(file){
  if(imageCache.has(file)){const image=imageCache.get(file);imageCache.delete(file);imageCache.set(file,image);return image;}
  const promise=new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{imageCache.delete(file);reject(Error('인구 타일을 불러오지 못했습니다.'));};image.src=new URL(file,rasterRoot).href;
  });
  imageCache.set(file,promise);while(imageCache.size>32)imageCache.delete(imageCache.keys().next().value);
  return promise;
}

export function chooseRasterLevel(levels,metresPerPixel){
  return levels.reduce((chosen,level)=>level.resolutionM<=metresPerPixel*1.5?level:chosen,levels[0]);
}

// One slider unit represents 5 metres, independent of map zoom.
export const blurRadiusPixels=(blur,metresPerPixel)=>blur*5/Math.max(.001,metresPerPixel);

/** One reusable overlay on an existing Kakao map; never creates a second map. */
export class PopulationHeatLayer {
  constructor(map,host,{onStatus=()=>{},onScale=()=>{},store=sharedStore,loadData=loadMetadata,imageLoader=loadImage,loadAges=loadAgeMetadata,createAgeRenderer=()=>new AgeHeatRenderer()}={}){
    Object.assign(this,{map,host,onStatus,onScale,store,loadData,imageLoader,loadAges,createAgeRenderer});
    this.ageRange=null;
    this.enabled=false;this.opacity=.65;this.blur=6;this.sequence=0;this.frame=0;this.timer=0;this.lastRefresh=0;this.drawCount=0;this.painted=null;
    this.canvas=document.createElement('canvas');this.canvas.className='population-heat-canvas';
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','2024년 100m 거주인구 히트맵');
    Object.assign(this.canvas.style,{position:'absolute',pointerEvents:'none',zIndex:'0',opacity:String(this.opacity),filter:'none'});
    this.ctx=this.canvas.getContext('2d');
    const owner=this;
    class Overlay extends kakao.maps.AbstractOverlay {
      onAdd(){this.getPanels().overlayLayer.append(owner.canvas);}
      onRemove(){owner.canvas.remove();}
      draw(){owner.anchor();}
    }
    this.overlay=new Overlay();this.overlay.setMap(map);
    this.canvas.hidden=true;
    kakao.maps.event.addListener(map,'bounds_changed',()=>this.queue());
    kakao.maps.event.addListener(map,'idle',()=>{clearTimeout(this.timer);this.timer=0;this.refresh();});
    this.resize=new ResizeObserver(()=>{if(this.enabled)this.refresh();});this.resize.observe(host);
  }
  setStyle({opacity=this.opacity,blur=this.blur}={}){
    this.opacity=opacity;this.blur=blur;
    this.canvas.style.opacity=String(opacity);this.updateBlur();
  }
  setAgeRange(range){
    if(range!==null&&!validAgeRange(range))throw Error('연령 범위가 올바르지 않습니다.');
    if(String(this.ageRange)===String(range))return;
    this.ageRange=range&&[...range];this.sequence++;this.ageRenderer?.cancel();
    this.content=null;this.painted=null;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.canvas.setAttribute('aria-label',range?`2024년 ${ageRangeLabel(range)} 100m 추정 인구 히트맵`:'2024년 100m 거주인구 히트맵');
    this.canvas.dataset.ageRange=range?range.join(':'):'all';
    this.canvas.dataset.renderMode='loading';
    if(this.enabled)this.refresh();
  }
  setEnabled(enabled){
    if(this.enabled===enabled)return;
    this.enabled=enabled;this.canvas.hidden=!enabled;
    if(enabled)this.refresh();
    else {this.sequence++;this.ageRenderer?.cancel();clearTimeout(this.timer);this.timer=0;if(this.frame)cancelAnimationFrame(this.frame);this.frame=0;}
  }
  box(){const b=this.map.getBounds(),sw=b.getSouthWest(),ne=b.getNorthEast();return [sw.getLng(),sw.getLat(),ne.getLng(),ne.getLat()];}
  updateBlur(){
    const pixels=blurRadiusPixels(this.blur,this.metresPerPixel());
    this.canvas.style.filter=pixels?`blur(${pixels}px)`:'none';
    this.canvas.dataset.blurPx=String(pixels);
    this.canvas.dataset.blurMetres=String(this.blur*5);
  }
  anchor(){
    this.updateBlur();
    if(!this.painted)return;
    const p=this.overlay.getProjection(),nw=p.pointFromCoords(this.painted.nw),se=p.pointFromCoords(this.painted.se);
    Object.assign(this.canvas.style,{left:nw.x+'px',top:nw.y+'px',width:(se.x-nw.x)+'px',height:(se.y-nw.y)+'px'});
  }
  queue(){
    if(!this.enabled||this.timer)return;
    this.timer=setTimeout(()=>{this.timer=0;this.refresh();},Math.max(0,120-(performance.now()-this.lastRefresh)));
  }
  schedule(){if(this.frame||!this.enabled)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  metresPerPixel(){
    const c=this.map.getCenter(),p=this.map.getProjection(),a=p.containerPointFromCoords(c),b=p.containerPointFromCoords(new kakao.maps.LatLng(c.getLat(),c.getLng()+.01));
    return 1113.2*Math.cos(c.getLat()*Math.PI/180)/Math.max(.001,Math.abs(b.x-a.x));
  }
  async refresh(){
    if(!this.enabled||!this.host.clientWidth||this.host.closest('[hidden]'))return;
    const run=++this.sequence;this.lastRefresh=performance.now();
    const current=()=>this.enabled&&run===this.sequence&&!this.host.closest('[hidden]');
    try{
      if(this.ageRange){await this.refreshAge(current);return;}
      if(!this.data){this.onStatus('인구 자료를 불러오는 중입니다.');this.data=await this.loadData();}
      if(!current())return;
      this.onScale(this.data.cells.levels[0].weightReference);
      const box=this.box(),pad=Math.max((box[3]-box[1])*.65,.02),query=[box[0]-pad*1.3,box[1]-pad,box[2]+pad*1.3,box[3]+pad];
      if(this.map.getLevel()<=6){
        const level=this.data.cells.levels.find(level=>level.cellSizeM===100);
        const files=level.tiles.filter(t=>intersects(t.bbox,query)).map(t=>t.file),key='cells:'+files.join('|');
        const accept=(cells,ready)=>{this.content={mode:'cells',cells,key:key+(ready?'':':'+cells.length)};this.schedule();};
        if(this.store.hasAll(files))accept(this.store.peek(files),true);
        else{
          const cached=this.store.peek(files);if(cached.length)accept(cached,false);
          this.onStatus('주변 인구 자료를 불러오는 중입니다.');
          const cells=await this.store.load(files,current);if(!current())return;accept(cells,true);
        }
      }else{
        const level=chooseRasterLevel(this.data.rasters.levels,this.metresPerPixel());
        const tiles=level.tiles.filter(tile=>intersects(tile.bbox,query));
        this.onStatus('100m 인구 타일을 불러오는 중입니다.');
        const images=await Promise.all(tiles.map(async tile=>({tile,image:await this.imageLoader(tile.file)})));
        if(!current())return;
        this.content={mode:'tiles',images,key:'tiles:'+tiles.map(t=>t.file).join('|')};this.schedule();
      }
      if(current())this.onStatus('2024 거주인구 · 100m 셀 기준');
    }catch(error){if(current()&&error.name!=='AbortError'){console.error('Population heat layer',error);this.onStatus('인구 자료 연결 실패 · 다시 켜 주세요.');}}
  }
  async refreshAge(current){
    const range=[...this.ageRange],key='age:'+range.join(':');
    if(reusableRaster(this.painted,{bbox:this.box(),level:100,zoom:this.map.getLevel(),files:key})){
      this.anchor();this.onScale(ageReference(this.ageData,range));this.onStatus(`${ageRangeLabel(range)} · 100m 추정${Number(this.canvas.dataset.missingCells)?' · 미수록 구역 제외':''}`);return;
    }
    this.onStatus(`${ageRangeLabel(range)} 추정 인구를 불러오는 중입니다.`);
    if(!this.ageData)this.ageData=await this.loadAges();
    if(!current())return;
    this.onScale(ageReference(this.ageData,range));
    if(!this.ageRenderer)this.ageRenderer=this.createAgeRenderer();
    const pad=Math.max(192,Math.ceil(blurRadiusPixels(this.blur,this.metresPerPixel())*4)),w=this.host.clientWidth,h=this.host.clientHeight,p=this.map.getProjection(),zoom=this.map.getLevel();
    const nw=p.coordsFromContainerPoint(new kakao.maps.Point(-pad,-pad)),se=p.coordsFromContainerPoint(new kakao.maps.Point(w+pad,h+pad));
    const a=nw.toCoords(),b=se.toCoords(),bounds=[a.getX()/2.5,b.getY()/2.5,b.getX()/2.5,a.getY()/2.5];
    const files=this.ageData.tiles.filter(tile=>intersects(tile.bboxNative,bounds)).map(tile=>tile.file),start=performance.now();
    const result=await this.ageRenderer.render({files,bounds,width:w+pad*2,height:h+pad*2,range,reference:ageReference(this.ageData,range)});
    if(!current()){result.bitmap.close();return;}
    this.canvas.width=w+pad*2;this.canvas.height=h+pad*2;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    this.ctx.drawImage(result.bitmap,0,0);result.bitmap.close();
    this.painted={bbox:[nw.getLng(),se.getLat(),se.getLng(),nw.getLat()],nw,se,level:100,zoom,files:key};this.anchor();
    Object.assign(this.canvas.dataset,{sourceCellSizeM:'100',renderMode:'age-cells',ageRange:range.join(':'),
      renderedItems:String(result.rendered),missingCells:String(result.missing),validCells:String(result.valid),
      drawCount:String(++this.drawCount),paintMs:(performance.now()-start).toFixed(1)});
    this.onStatus(`${ageRangeLabel(range)} · 100m 추정${result.missing?' · 미수록 구역 제외':''}`);
  }
  draw(){
    if(!this.enabled||!this.content||!this.host.clientWidth||this.host.closest('[hidden]'))return;
    const box=this.box(),zoom=this.map.getLevel(),files=this.content.key;
    if(reusableRaster(this.painted,{bbox:box,level:100,zoom,files})){this.anchor();return;}
    const start=performance.now(),pad=Math.max(192,Math.ceil(blurRadiusPixels(this.blur,this.metresPerPixel())*4)),w=this.host.clientWidth,h=this.host.clientHeight,p=this.map.getProjection();
    if(!w||!h)return;
    this.canvas.width=w+pad*2;this.canvas.height=h+pad*2;
    this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
    const nw=p.coordsFromContainerPoint(new kakao.maps.Point(-pad,-pad)),se=p.coordsFromContainerPoint(new kakao.maps.Point(w+pad,h+pad));
    const rasterBox=[nw.getLng(),se.getLat(),se.getLng(),nw.getLat()];
    let rendered=0;
    if(this.content.mode==='cells')rendered=paintCellSurface(this.ctx,this.content.cells,this.data.cells.levels[0].weightReference,(lng,lat)=>{
      const xy=p.containerPointFromCoords(new kakao.maps.LatLng(lat,lng));return {x:xy.x+pad,y:xy.y+pad};
    },rasterBox);
    else for(const {tile,image} of this.content.images){
      if(!intersects(tile.bbox,rasterBox))continue;
      const a=p.containerPointFromCoords(new kakao.maps.LatLng(tile.nw[1],tile.nw[0])),b=p.containerPointFromCoords(new kakao.maps.LatLng(tile.se[1],tile.se[0]));
      this.ctx.drawImage(image,a.x+pad,a.y+pad,b.x-a.x,b.y-a.y);rendered++;
    }
    this.painted={bbox:rasterBox,nw,se,level:100,zoom,files};this.anchor();
    Object.assign(this.canvas.dataset,{sourceCellSizeM:'100',renderMode:this.content.mode,renderedItems:String(rendered),drawCount:String(++this.drawCount),paintMs:(performance.now()-start).toFixed(1)});
  }
}
