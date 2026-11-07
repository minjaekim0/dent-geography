import {selectInflowGroups} from './catchment-inflow-model.mjs';
import {inflowArrow} from './catchment-inflow-arrow.mjs';
const COLORS={population:'#eb3769',workers:'#2891f0'};
const LABELS={population:'거주인구',workers:'종사인구'};
const percent=n=>Math.round(n*100)+'%';
export class CatchmentInflow {
  constructor(controller,container,target,datasets){
    Object.assign(this,{controller,container,target});this.map=controller.map;this.enabled=true;this.active={population:true,workers:true};
    this.series=Object.entries(LABELS).map(([key,label])=>({key,label,color:COLORS[key],available:datasets[key].records>0,...selectInflowGroups(datasets[key].inflowGroups,datasets[key].expectedPopulation)}));
    container.className='catchment-inflow';
    const heading=document.createElement('h3');heading.textContent='배후인구 유입';container.append(heading);
    const tools=document.createElement('div');tools.className='catchment-inflow-tools';container.append(tools);
    for(const [key,label] of [['enabled','유입 화살표'],...Object.entries(LABELS)]){
      const field=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=true;
      if(COLORS[key])field.style.color=COLORS[key];field.append(toggle,document.createTextNode(label));tools.append(field);
      toggle.onchange=()=>{key==='enabled'?this.enabled=toggle.checked:this.active[key]=toggle.checked;this.sync();};
    }
    const fit=document.createElement('button');fit.type='button';fit.textContent='화살표 범위 보기';fit.onclick=()=>this.fit();tools.append(fit);
    this.summary=document.createElement('div');this.summary.className='catchment-inflow-summary';container.append(this.summary);
    this.canvas=document.createElement('canvas');this.canvas.className='catchment-inflow-canvas';this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label','500m 묶음별 거주인구·종사인구의 선택 지점으로 향하는 유입 기댓값 화살표');
    Object.assign(this.canvas.style,{position:'absolute',pointerEvents:'none',zIndex:20});
    const owner=this;
    class Overlay extends kakao.maps.AbstractOverlay {
      onAdd(){this.getPanels().overlayLayer.append(owner.canvas);}
      onRemove(){owner.canvas.remove();}
      draw(){owner.anchor();}
    }
    this.overlay=new Overlay();this.overlay.setMap(this.map);
    this.key=document.createElement('div');this.key.className='grid-flow-map-key catchment-inflow-key';controller.el.append(this.key);
    this.events=[['idle',()=>this.queue()],['zoom_changed',()=>{this.canvas.hidden=true;this.queue();}]];
    for(const [name,fn] of this.events)kakao.maps.event.addListener(this.map,name,fn);
    this.resize=new ResizeObserver(()=>this.queue());this.resize.observe(controller.canvas);this.sync();
  }
  sync(){
    // Keep the coverage denominator equal to the full expected population, not
    // the visible viewport or a renormalized top-ten subset.
    this.summary.replaceChildren();this.key.replaceChildren();
    const title=document.createElement('strong');title.textContent='유입 기댓값 · 약 500m 묶음';this.key.append(title);
    for(const s of this.series){
      const text=!s.available?'자료 없음':!s.total?'유입 기댓값 없음':`${s.rows.length===10?'상위 10':s.rows.length}곳 · 전체 기댓값의 ${percent(s.coverage)}`;
      const line=document.createElement('div');line.style.color=s.color;line.textContent=s.label+' '+text;this.summary.append(line);
      if(this.active[s.key]){const keyLine=line.cloneNode(true);this.key.append(keyLine);}
    }
    this.canvas.hidden=!this.enabled;this.key.hidden=!this.enabled;this.queue();
  }
  fit(){
    const box=new kakao.maps.LatLngBounds();box.extend(new kakao.maps.LatLng(this.target.lat,this.target.lng));
    for(const s of this.series)if(this.active[s.key])for(const row of s.rows)box.extend(new kakao.maps.LatLng(row.lat,row.lng));
    this.map.setBounds(box,85,70,100,70);
  }
  anchor(){
    if(!this.painted)return;
    const p=this.overlay.getProjection(),nw=p.pointFromCoords(this.painted.nw),se=p.pointFromCoords(this.painted.se);
    Object.assign(this.canvas.style,{left:nw.x+'px',top:nw.y+'px',width:(se.x-nw.x)+'px',height:(se.y-nw.y)+'px'});
  }
  queue(){if(this.frame||this.destroyed)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  draw(){
    if(!this.enabled){this.canvas.hidden=true;return;}
    const w=this.controller.canvas.clientWidth,h=this.controller.canvas.clientHeight;if(!w||!h)return;
    const ratio=Math.min(devicePixelRatio||1,2),ctx=this.canvas.getContext('2d'),p=this.map.getProjection(),project=c=>p.containerPointFromCoords(new kakao.maps.LatLng(c.lat,c.lng));
    this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);ctx.scale(ratio,ratio);
    const target=project(this.target),rows=this.series.filter(s=>this.active[s.key]).flatMap(s=>s.rows.map(row=>({...row,key:s.key,color:s.color})));
    const maximum=Math.max(1,...this.series.flatMap(s=>s.rows.map(r=>r.expected)));
    for(const row of rows.sort((a,b)=>b.expected-a.expected)){
      const start=project(row);
      const width=.75+19.25*(row.expected/maximum);
      const arrow=inflowArrow(start,target,width,row.key==='population'?-1:1);
      if(arrow){
        ctx.beginPath();arrow.outline.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=row.color;ctx.fill();
      }
      ctx.beginPath();ctx.arc(start.x,start.y,2+width*.3,0,Math.PI*2);ctx.fillStyle=row.color;ctx.fill();
    }
    ctx.beginPath();ctx.arc(target.x,target.y,7,0,Math.PI*2);ctx.fillStyle='#34485f';ctx.fill();
    this.painted={nw:p.coordsFromContainerPoint(new kakao.maps.Point(0,0)),se:p.coordsFromContainerPoint(new kakao.maps.Point(w,h))};this.anchor();this.canvas.hidden=false;
  }
  destroy(){
    this.destroyed=true;cancelAnimationFrame(this.frame);this.resize.disconnect();
    for(const [name,fn] of this.events)kakao.maps.event.removeListener(this.map,name,fn);
    this.overlay.setMap(null);this.key.remove();
  }
}
