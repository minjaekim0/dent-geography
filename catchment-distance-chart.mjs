import {DISTANCE_STEP,DISTANCE_MAX} from './catchment-distance-model.mjs';
import {distanceCurve} from './catchment-distance-curve.mjs';
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(text!=null)node.textContent=text;return node;}
export function distanceChart(datasets){
  const box=document.createElement('figure');box.className='catchment-chart catchment-distance-chart';
  const heading=document.createElement('h3');heading.textContent='거리별 배후인구';box.append(heading);
  const series=[['population','거주인구','#eb3769'],['workers','종사인구','#2891f0']].map(([key,label,color])=>({label,color,available:datasets[key].records>0,values:datasets[key].distancePopulation}));
  const svg=el('svg',{viewBox:'0 0 420 250',role:'img','aria-label':'거리별 배후인구. 가로축 직선거리 0~3km, 세로축 100m 거리 구간별 인원수.',tabindex:0});
  const left=64,right=402,top=24,bottom=202,width=right-left,height=bottom-top;
  const peak=Math.max(1,...series.filter(s=>s.available).flatMap(s=>s.values));
  const magnitude=10**Math.floor(Math.log10(peak)),maximum=Math.ceil(peak/magnitude)*magnitude;
  const x=d=>left+width*d/DISTANCE_MAX,y=n=>bottom-height*n/maximum,fmt=n=>Math.round(n).toLocaleString('ko-KR');
  svg.append(el('text',{x:left,y:13,'font-size':11,fill:'#647785'},'인원수 (명 / 100m 구간)'));
  for(let i=0;i<=4;i++){
    const value=maximum*i/4,py=y(value);
    svg.append(el('line',{x1:left,x2:right,y1:py,y2:py,stroke:'#e2e8ee'}),el('text',{x:left-7,y:py+4,'text-anchor':'end','font-size':10,fill:'#647785'},fmt(value)));
  }
  for(const d of [0,500,1000,1500,2000,2500,3000])svg.append(el('text',{x:x(d),y:bottom+18,'text-anchor':'middle','font-size':10,fill:'#647785'},fmt(d)));
  svg.append(el('text',{x:(left+right)/2,y:244,'text-anchor':'middle','font-size':12,fill:'#34485f'},'직선거리 (m)'));
  for(const s of series){
    if(!s.available)continue;
    const points=distanceCurve(s.values).map(([d,n])=>`${x(d)},${y(n)}`).join(' ');
    svg.append(el('polygon',{points:`${left},${bottom} ${points} ${right},${bottom}`,fill:s.color,'fill-opacity':.12}));
    svg.append(el('polyline',{points,fill:'none',stroke:s.color,'stroke-width':2,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}));
  }
  const cursor=el('rect',{x:left,y:top,width:width*DISTANCE_STEP/DISTANCE_MAX,height,fill:'#34485f','fill-opacity':.09,visibility:'hidden'});svg.append(cursor);
  const legend=document.createElement('figcaption');legend.className='catchment-chart-legend';
  for(const s of series){const span=document.createElement('span');span.style.color=s.color;span.textContent='━ '+s.label+(s.available?'':' (자료 없음)');legend.append(span);}
  const readout=document.createElement('div');readout.className='catchment-chart-readout';readout.setAttribute('aria-live','polite');readout.hidden=true;
  let index=0;
  function show(value){
    index=Math.max(0,Math.min(DISTANCE_MAX/DISTANCE_STEP-1,Math.floor(value)));
    cursor.setAttribute('x',x(index*DISTANCE_STEP));cursor.setAttribute('visibility','visible');readout.hidden=false;
    readout.textContent=`${fmt(index*DISTANCE_STEP)}~${fmt((index+1)*DISTANCE_STEP)}m · `+series.map(s=>s.label+' '+(s.available?fmt(s.values[index])+'명':'자료 없음')).join(' · ');
  }
  function point(event){const rect=svg.getBoundingClientRect();show(((event.clientX-rect.left)*420/rect.width-left)/width*DISTANCE_MAX/DISTANCE_STEP);}
  svg.addEventListener('pointermove',point);svg.addEventListener('pointerdown',point);
  svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?0:event.key==='End'?DISTANCE_MAX/DISTANCE_STEP-1:index+(event.key==='ArrowRight'?1:-1));}});
  box.append(svg,legend,readout);return box;
}
