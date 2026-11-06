import {PopulationHeatLayer} from './population-heat-layer.mjs?v=distance-blur-1';

const toggle=document.querySelector('#population-heat-toggle');
const opacity=document.querySelector('#population-heat-opacity');
const blur=document.querySelector('#population-heat-blur');
const status=document.querySelector('#population-heat-status');
const age=document.querySelector('#population-heat-age');
function selection(){return age.value==='all'?null:age.value.split(':').map(Number);}
const layers=new Map();
function render(controller){
  if(!controller.map||controller.el.closest('[hidden]')||!toggle.checked){clear(controller);return;}
  let layer=layers.get(controller);
  if(!layer){
    const legend=document.createElement('div');legend.className='population-heat-legend';
    legend.innerHTML='<strong>거주 인구 · 2024</strong><div class="population-heat-ramp"></div><div class="population-heat-scale">색상 기준을 불러오는 중</div><div class="population-heat-unit">명 / 100m × 100m</div><small>100m 셀 기준 · 모든 확대 수준 공통</small>';
    controller.el.append(legend);
    layer=new PopulationHeatLayer(controller.map,controller.canvas,{onScale:reference=>{
      const format=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:0});
      const scale=legend.querySelector('.population-heat-scale');
      scale.replaceChildren(...[0,reference/2,reference].map((value,i)=>{
        const tick=document.createElement('div');tick.textContent=format(value)+(i===2?' 이상':'');return tick;
      }));
    },onStatus:text=>{if(!controller.el.closest('[hidden]')){status.textContent=text;if(layer?.legend)layer.legend.querySelector('small').textContent=text;}}});
    layer.legend=legend;layers.set(controller,layer);
  }
  layer.legend.hidden=false;
  const range=selection();
  layer.legend.querySelector('strong').textContent=range?`${age.selectedOptions[0].textContent} · 추정 인구 · 2024`:'전체 · 거주 인구 · 2024';
  document.querySelector('#population-heat-age-note').hidden=!range;
  layer.setAgeRange(range);
  layer.setStyle({opacity:Number(opacity.value)/100,blur:Number(blur.value)/4});layer.setEnabled(true);
}
function clear(controller){const layer=layers.get(controller);if(layer){layer.setEnabled(false);layer.legend.hidden=true;}}
function refresh(){
  for(const controller of globalThis.clinicMapControllers?.values()||[])render(controller);
  if(!toggle.checked)status.textContent='인구 히트맵 꺼짐';
}
toggle.addEventListener('change',refresh);
age.addEventListener('change',refresh);
opacity.addEventListener('input',()=>{document.querySelector('#population-heat-opacity-value').value=opacity.value+'%';refresh();});
blur.addEventListener('input',refresh);
globalThis.populationHeatLayer={render,clear};refresh();
