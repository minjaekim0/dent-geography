import {distanceRing} from './grid-flow-model.mjs?v=separate-modes-1';
import {bounds} from './catchment-model.mjs?v=adaptive3-1';
const number=n=>Math.round(n).toLocaleString('ko-KR');
const people=n=>n==null?'자료 없음':n>0&&n<1?'1명 미만':number(n)+'명';
const percent=p=>p>0&&p<.001?'0.1% 미만':(p*100).toLocaleString('ko-KR',{maximumFractionDigits:1})+'%';
export class GridFlow {
  constructor(controller,container,{point,showDestinations=true}){
    Object.assign(this,{controller,container,showDestinations});this.map=controller.map;this.sequence=0;this.limit=10;this.enabled=true;
    container.className='grid-flow-panel';
    const title=document.createElement('h3');title.textContent=showDestinations?'선택한 격자':'선택 지점의 거리';container.append(title);
    const tools=document.createElement('div');tools.className='grid-flow-tools';container.append(tools);
    const label=document.createElement('label'),toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=true;label.append(toggle,document.createTextNode(showDestinations?'화살표·거리 원 표시':'거리 원 표시'));tools.append(label);
    toggle.onchange=()=>{this.enabled=toggle.checked;this.canvas.hidden=!this.enabled;this.key.hidden=!this.enabled;this.queue();};
    if(showDestinations){
    const limitLabel=document.createElement('label');limitLabel.textContent='표시 치과 ';const limit=document.createElement('select');limit.setAttribute('aria-label','분산 화살표 표시 치과 수');
    for(const n of [10,20,50]){const option=document.createElement('option');option.value=n;option.textContent='상위 '+n+'곳';limit.append(option);}limitLabel.append(limit);tools.append(limitLabel);
    const all=document.createElement('option');all.value='all';all.textContent='전체';limit.append(all);
    limit.onchange=()=>{this.limit=limit.value==='all'?Infinity:Number(limit.value);this.renderList();this.queue();};
    const fit=document.createElement('button');fit.type='button';fit.textContent='화살표 범위 보기';fit.onclick=()=>this.fit();tools.append(fit);
    }
    const rings=document.createElement('button');rings.type='button';rings.textContent='거리 원 전체 보기';rings.onclick=()=>this.fitRings();tools.append(rings);
    this.status=document.createElement('p');this.status.setAttribute('role','status');container.append(this.status);
    this.list=document.createElement('div');if(showDestinations)container.append(this.list);

    this.canvas=document.createElement('canvas');this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label',showDestinations?'선택한 100m 격자에서 기존 치과로 향하는 선택확률 화살표와 거리 원':'선택 지점의 최대거리 실선과 반감거리 점선');
    Object.assign(this.canvas.style,{position:'absolute',pointerEvents:'none',zIndex:50});
    const owner=this;
    class Overlay extends kakao.maps.AbstractOverlay {
      onAdd(){this.getPanels().overlayLayer.append(owner.canvas);}
      onRemove(){owner.canvas.remove();}
      draw(){owner.anchor();}
    }
    this.overlay=new Overlay();this.overlay.setMap(this.map);
    this.key=document.createElement('div');this.key.className='grid-flow-map-key';this.key.textContent='거리 기준을 계산 중…';controller.el.append(this.key);
    this.events=[['idle',()=>this.queue()],['zoom_changed',()=>{this.canvas.hidden=true;this.queue();}]];
    for(const [name,fn] of this.events)kakao.maps.event.addListener(this.map,name,fn);
    this.resize=new ResizeObserver(()=>this.queue());this.resize.observe(controller.canvas);
    this.worker=new Worker(new URL('./grid-flow-worker.mjs?v=separate-modes-1',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      if(data.id!==this.sequence)return;
      this.data=data;this.list.replaceChildren();
      if(data.error||data.missing){this.status.textContent=data.error||'이 지점에 수록된 100m 격자 자료가 없습니다. 다른 격자를 선택해 주세요. 미수록·비공개는 0명이 아닙니다.';this.key.textContent='선택 격자 자료 없음';this.queue();return;}
      this.rings=[{points:distanceRing(data.cell,data.profile.radius),label:'최대거리 '+data.profile.radius/1000+'km',dash:[]},{points:distanceRing(data.cell,data.profile.halfLife),label:'반감거리 '+data.profile.halfLife+'m',dash:[6,5]}];
      this.status.textContent=showDestinations?'거주인구 '+people(data.cell.population)+' · 종사인구 '+people(data.cell.workers):'';
      if(showDestinations)this.renderList();
      this.key.textContent='최대 '+data.profile.radius/1000+'km (실선) · 반감 '+data.profile.halfLife+'m (점선)';
      this.queue();
    };
    this.worker.onerror=()=>{this.status.textContent='격자 분산 계산을 시작하지 못했습니다. 다른 지점을 다시 선택해 주세요.';};
    this.select(point);
  }
  select(point){
    this.status.textContent=this.showDestinations?'선택 격자의 인구와 주변 치과를 계산 중…':'선택 지점의 거리를 계산 중…';this.data=null;this.rings=null;this.list.replaceChildren();this.queue();
    this.worker.postMessage({id:++this.sequence,point:{lat:point.lat,lng:point.lng},ringsOnly:!this.showDestinations});
  }
  renderList(){
    if(!this.data?.cell)return;
    const shown=this.data.destinations.slice(0,this.limit),remainder=this.data.destinations.slice(this.limit),list=document.createElement('ol');list.className='grid-flow-destinations';
    for(const [i,row] of shown.entries()){
      const item=document.createElement('li'),heading=document.createElement('div'),name=document.createElement('strong'),probability=document.createElement('b');
      name.textContent=(i+1)+'. '+row.clinic.name;probability.textContent=percent(row.probability);heading.append(name,probability);item.append(heading);
      const counts=document.createElement('div');counts.className='grid-flow-counts';
      for(const [key,label] of [['population','거주'],['workers','종사']]){const text=document.createElement('span');text.className=key;text.textContent=label+' '+people(row[key]);counts.append(text);}item.append(counts);list.append(item);
    }
    const rest=document.createElement('p');rest.className='grid-flow-remainder';rest.textContent='총 '+this.data.destinations.length+'곳 중 '+shown.length+'곳 표시 · 나머지 '+remainder.length+'곳 '+percent(remainder.reduce((s,r)=>s+r.probability,0));
    if(!this.data.destinations.length)rest.textContent='이 격자의 선택 반경('+this.data.profile.radius/1000+'km) 미만에 분석할 치과가 없어 분산하지 않습니다.';
    this.list.replaceChildren(rest,list);
    this.key.textContent='최대 '+this.data.profile.radius/1000+'km (실선) · 반감 '+this.data.profile.halfLife+'m (점선)';
  }
  fit(){
    if(!this.data?.cell)return;
    const bounds=new kakao.maps.LatLngBounds();
    for(const p of [this.data.cell,...this.data.destinations.slice(0,this.limit).map(r=>r.clinic)])bounds.extend(new kakao.maps.LatLng(p.lat,p.lng));
    this.map.setBounds(bounds,60,60,110,60);
  }
  fitRings(){
    if(!this.data?.cell)return;
    const box=bounds(this.data.cell,this.data.profile.radius),view=new kakao.maps.LatLngBounds(new kakao.maps.LatLng(box[1],box[0]),new kakao.maps.LatLng(box[3],box[2]));
    this.map.setBounds(view,45,35,45,35);
  }
  anchor(){
    if(!this.painted)return;const p=this.overlay.getProjection(),nw=p.pointFromCoords(this.painted.nw),se=p.pointFromCoords(this.painted.se);
    Object.assign(this.canvas.style,{left:nw.x+'px',top:nw.y+'px',width:(se.x-nw.x)+'px',height:(se.y-nw.y)+'px'});
  }
  queue(){if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.draw();});}
  draw(){
    if(!this.enabled){this.canvas.hidden=true;return;}
    const w=this.controller.canvas.clientWidth,h=this.controller.canvas.clientHeight;if(!w||!h)return;
    const ratio=Math.min(devicePixelRatio||1,2),ctx=this.canvas.getContext('2d'),p=this.map.getProjection(),project=c=>p.containerPointFromCoords(new kakao.maps.LatLng(c.lat,c.lng));
    this.canvas.width=Math.round(w*ratio);this.canvas.height=Math.round(h*ratio);ctx.scale(ratio,ratio);
    if(this.data?.cell){
      const cell=this.data.cell,start=project(cell),geometry=cell.geometry;
      if(geometry){ctx.beginPath();for(let i=0;i<4;i++){const q=project({lat:geometry[i*2+1],lng:geometry[i*2]});i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);}ctx.closePath();ctx.fillStyle='#ffffffb3';ctx.fill();ctx.strokeStyle='#243448';ctx.lineWidth=2;ctx.stroke();}
      const rows=this.showDestinations?this.data.destinations.slice(0,this.limit):[];
      for(let i=rows.length-1;i>=0;i--){
        const row=rows[i],end=project(row.clinic),dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy),ux=length?dx/length:1,uy=length?dy/length:0;
        const bend=(i%2?-1:1)*(10+i*2),control={x:(start.x+end.x)/2-uy*bend,y:(start.y+end.y)/2+ux*bend};
        const stroke='#243e58',width=1+9*Math.sqrt(row.probability);
        ctx.lineWidth=width+2;ctx.strokeStyle='#ffffffe6';ctx.beginPath();ctx.moveTo(start.x,start.y);ctx.quadraticCurveTo(control.x,control.y,end.x,end.y);ctx.stroke();
        ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();
        const angle=Math.atan2(end.y-control.y,end.x-control.x),size=7+width;
        ctx.fillStyle=stroke;ctx.beginPath();ctx.moveTo(end.x,end.y);ctx.lineTo(end.x-size*Math.cos(angle-.45),end.y-size*Math.sin(angle-.45));ctx.lineTo(end.x-size*Math.cos(angle+.45),end.y-size*Math.sin(angle+.45));ctx.closePath();ctx.fill();
        if(i<10){
          const text=(i+1)+' · '+percent(row.probability),tx=end.x+7,ty=end.y-10;
          ctx.font='bold 11px system-ui';const tw=ctx.measureText(text).width;ctx.fillStyle='#fffffff5';ctx.fillRect(tx-3,ty-12,tw+6,17);ctx.fillStyle=stroke;ctx.fillText(text,tx,ty);
        }
      }
      ctx.beginPath();ctx.arc(start.x,start.y,3,0,Math.PI*2);ctx.fillStyle='#243448';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=1.5;ctx.stroke();
      for(const ring of this.rings||[]){
        const points=ring.points.map(project);ctx.beginPath();points.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));
        ctx.setLineDash(ring.dash);ctx.strokeStyle='#fffffff2';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#263849';ctx.lineWidth=3;ctx.stroke();ctx.setLineDash([]);
        const label=points[0];ctx.font='bold 12px system-ui';const tw=ctx.measureText(ring.label).width,tx=label.x-tw/2,ty=label.y-8;
        ctx.fillStyle='#fffffff5';ctx.fillRect(tx-4,ty-13,tw+8,19);ctx.fillStyle='#263849';ctx.fillText(ring.label,tx,ty);
      }
    }
    this.painted={nw:p.coordsFromContainerPoint(new kakao.maps.Point(0,0)),se:p.coordsFromContainerPoint(new kakao.maps.Point(w,h))};this.anchor();this.canvas.hidden=false;
  }
  destroy(){
    this.worker.terminate();cancelAnimationFrame(this.frame);this.resize.disconnect();
    for(const [name,fn] of this.events)kakao.maps.event.removeListener(this.map,name,fn);
    this.overlay.setMap(null);this.key.remove();
  }
}
