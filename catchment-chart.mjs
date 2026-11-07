import {probabilityDensity} from './catchment-distribution.mjs';
import {linearProbabilityAxis,densityAt,formatProbability} from './catchment-chart-model.mjs?v=tail-one-percent-1';
const NS='http://www.w3.org/2000/svg';
function el(tag,attrs={},text){const node=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);if(text!=null)node.textContent=text;return node;}
export function probabilityChart(datasets){
  const box=document.createElement('figure');box.className='catchment-chart';
  const heading=document.createElement('h3');heading.textContent='선택확률별 배후인구';box.append(heading);
  const series=[['population','거주인구','#eb3769'],['workers','종사인구','#2891f0']].map(([key,label,color])=>({key,label,color,available:datasets[key].records>0,values:probabilityDensity(datasets[key].probabilityPopulation)}));
  const axis=linearProbabilityAxis(Object.values(datasets).filter(d=>d.records>0).map(d=>d.probabilityPopulation));
  const svg=el('svg',{viewBox:'0 0 420 250',role:'img','aria-label':`선택확률별 거주인구와 종사인구 분포. 가로축 선택확률 선형축 0~${formatProbability(axis.maximum)}, 세로축 인원수, 1%p 폭 환산.`});
  const left=64,right=402,top=24,bottom=202,width=right-left,height=bottom-top;
  const peak=Math.max(1,...series.filter(s=>s.available).flatMap(s=>s.values.slice(0,Math.floor(axis.maximum*(s.values.length-1))+1)));
  const magnitude=10**Math.floor(Math.log10(peak)),maximum=Math.ceil(peak/magnitude)*magnitude;
  const x=p=>left+width*axis.position(p),y=n=>bottom-height*n/maximum;
  const fmt=n=>Math.round(n).toLocaleString('ko-KR');
  svg.append(el('text',{x:left,y:13,'font-size':11,fill:'#647785'},'인원수 (명 / 1%p)'));
  for(let i=0;i<=4;i++){
    const value=maximum*i/4,py=y(value);
    svg.append(el('line',{x1:left,x2:right,y1:py,y2:py,stroke:'#e2e8ee'}),el('text',{x:left-7,y:py+4,'text-anchor':'end','font-size':10,fill:'#647785'},fmt(value)));
  }
  for(const value of axis.ticks)svg.append(el('line',{x1:x(value),x2:x(value),y1:top,y2:bottom,stroke:'#e2e8ee','stroke-dasharray':'2 4'}),el('text',{x:x(value),y:bottom+18,'text-anchor':'middle','font-size':10,fill:'#647785'},formatProbability(value)));
  svg.append(el('text',{x:(left+right)/2,y:244,'text-anchor':'middle','font-size':12,fill:'#34485f'},'선택확률'));
  for(const s of series){
    if(!s.available)continue;
    const points=Array.from({length:601},(_,i)=>{const p=axis.probability(i/600);return `${x(p)},${y(densityAt(s.values,p))}`;}).join(' ');
    svg.append(el('polygon',{points:`${left},${bottom} ${points} ${right},${bottom}`,fill:s.color,'fill-opacity':.12}));
    svg.append(el('polyline',{points,fill:'none',stroke:s.color,'stroke-width':2,'stroke-linejoin':'round','vector-effect':'non-scaling-stroke'}));
  }
  const cursor=el('line',{x1:left,x2:left,y1:top,y2:bottom,stroke:'#647785','stroke-dasharray':'3 3',visibility:'hidden'});svg.append(cursor);
  const caption=document.createElement('figcaption');caption.className='catchment-chart-legend';
  for(const s of series){const span=document.createElement('span');span.style.color=s.color;span.textContent='━ '+s.label+(s.available?'':' (자료 없음)');caption.append(span);}
  const readout=document.createElement('div');readout.className='catchment-chart-readout';readout.setAttribute('aria-live','polite');readout.hidden=true;
  let probability=axis.minimum;
  function show(p){probability=Math.max(axis.minimum,Math.min(axis.maximum,p));cursor.setAttribute('x1',x(probability));cursor.setAttribute('x2',x(probability));cursor.setAttribute('visibility','visible');readout.hidden=false;readout.textContent=`${formatProbability(probability)} · `+series.map(s=>s.label+' '+(s.available?fmt(densityAt(s.values,probability))+'명 / 1%p':'자료 없음')).join(' · ');}
  function point(event){const rect=svg.getBoundingClientRect();show(axis.probability(((event.clientX-rect.left)*420/rect.width-left)/width));}
  svg.setAttribute('tabindex','0');svg.addEventListener('pointermove',point);svg.addEventListener('pointerdown',point);
  svg.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();show(event.key==='Home'?axis.minimum:event.key==='End'?axis.maximum:axis.probability(axis.position(probability)+(event.key==='ArrowRight'?.01:-.01)));}});
  box.append(svg,caption,readout);
  if(axis.maximum===.25&&axis.tailShares.some(share=>share>0)){
    const note=document.createElement('small');note.textContent='인구 비중이 1% 미만인 25% 초과 구간은 그래프에서 생략했습니다.';box.append(note);
  }
  return box;
}
