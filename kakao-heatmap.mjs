import {PopulationHeatLayer} from './population-heat-layer.mjs?v=rose-azure-1';

const toggle=document.querySelector('#population-heat-toggle');
const workersToggle=document.querySelector('#workers-heat-toggle');
const opacity=document.querySelector('#population-heat-opacity');
const blur=document.querySelector('#population-heat-blur');
const status=document.querySelector('#population-heat-status');
const age=document.querySelector('#population-heat-age');
const description=document.querySelector('#population-heat-description');
const groups=[{dataset:'population',toggle,layers:new Map()},{dataset:'workers',toggle:workersToggle,layers:new Map()}];
function selection(){return age.value==='all'?null:age.value.split(':').map(Number);}
function syncControls(){
  document.querySelector('#population-heat-age-note').hidden=!toggle.checked||!selection();
  document.querySelector('label[for="population-heat-age"]').hidden=!toggle.checked;
  document.querySelector('#population-heat-heading').textContent='100m 거주인구 · 종사자 히트맵';
  if(description)description.innerHTML='출처: <a href="https://sgis.mods.go.kr/view/pss/openDataIntrcn" target="_blank" rel="noopener">국가데이터처 SGIS</a>. 2024년 거주인구는 선홍색, 사업체 소재지 기준 종사자는 밝은 파란색입니다. 100m 셀 전체를 채색하고 실제 거리 기준으로 번짐 처리합니다. 두 수치는 별도이며 합산하지 않습니다. 종사자는 유동인구·방문자 수가 아닙니다. 미수록 구역은 0명으로 처리하지 않습니다.';
}
function render(controller){
  syncControls();
  if(!controller.map||controller.el.closest('[hidden]')){clear(controller);return;}
  for(const group of groups){
    const workers=group.dataset==='workers';
    let layer=group.layers.get(controller);
    if(!group.toggle.checked){if(layer){layer.setEnabled(false);layer.legend.hidden=true;}continue;}
    if(!layer){
      const legend=document.createElement('div');legend.className='population-heat-legend'+(workers?' workers-heat-legend':'');
      legend.innerHTML='<strong></strong><div class="population-heat-ramp"></div><div class="population-heat-scale">색상 기준을 불러오는 중</div><div class="population-heat-unit">명 / 100m × 100m</div><small>100m 셀 기준 · 모든 확대 수준 공통</small>';
      controller.el.append(legend);
      layer=new PopulationHeatLayer(controller.map,controller.canvas,{dataset:group.dataset,onScale:reference=>{
        const format=n=>n.toLocaleString('ko-KR',{maximumFractionDigits:0});
        legend.querySelector('.population-heat-scale').replaceChildren(...[0,reference/2,reference].map((value,i)=>{
          const tick=document.createElement('div');tick.textContent=format(value)+(i===2?' 이상':'');return tick;
        }));
      },onStatus:text=>{if(group.toggle.checked&&!controller.el.closest('[hidden]')){legend.querySelector('small').textContent=text;status.textContent=groups.filter(g=>g.toggle.checked).map(g=>g.dataset==='workers'?'종사자':'거주인구').join(' · ')+' · 2024 · 100m 셀';}}});
      layer.legend=legend;group.layers.set(controller,layer);
    }
    layer.legend.hidden=false;
    layer.legend.style.left=workers&&toggle.checked?'var(--workers-legend-left,214px)':'';
    const range=workers?null:selection();
    layer.legend.querySelector('strong').textContent=workers?'종사자 · 2024':range?`${age.selectedOptions[0].textContent} · 추정 인구 · 2024`:'전체 · 거주인구 · 2024';
    layer.setAgeRange(range);
    layer.setStyle({opacity:Number(opacity.value)/100,blur:Number(blur.value)/4});layer.setEnabled(true);
  }
}
function clear(controller){for(const group of groups){const layer=group.layers.get(controller);if(layer){layer.setEnabled(false);layer.legend.hidden=true;}}}
function refresh(){
  for(const controller of globalThis.clinicMapControllers?.values()||[])render(controller);
  if(!toggle.checked&&!workersToggle.checked)status.textContent='히트맵 꺼짐';
}
toggle.addEventListener('change',refresh);
workersToggle.addEventListener('change',refresh);
age.addEventListener('change',refresh);
opacity.addEventListener('input',()=>{document.querySelector('#population-heat-opacity-value').value=opacity.value+'%';refresh();});
blur.addEventListener('input',refresh);
globalThis.populationHeatLayer={render,clear};refresh();
