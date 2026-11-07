import {impactPanel} from './catchment-impact.mjs?v=clean-ui-1';
import {probabilityChart} from './catchment-chart.mjs?v=distance-1';
import {distanceChart} from './catchment-distance-chart.mjs?v=distance-smooth-1';
import {GridFlow} from './grid-flow.mjs?v=clean-ui-1';
import {CatchmentInflow} from './catchment-inflow.mjs?v=inflow-shape-5';
const host=document.querySelector('#catchment-panel');
if(host){
  host.innerHTML=`<div class="catchment-modes" role="group" aria-label="분석 모드"><button type="button" data-mode="location" aria-pressed="true">치과 입지 분석</button><button type="button" data-mode="flow" aria-pressed="false">치과 방문 시뮬레이션</button></div><div id="catchment-body"><h2 id="catchment-selected-name" hidden></h2><section id="catchment-clinic-details" aria-label="치과 상세정보"></section><p id="catchment-status" role="status" aria-live="polite">지도에서 치과나 후보 지점을 선택하세요.</p><div id="catchment-result"></div><details id="catchment-method"><summary>계산 기준·출처</summary><p id="catchment-source-date">SGIS 2024년 100m 거주인구·종사인구</p><table><thead><tr><th>격자 주변 치과 / 1km</th><th>최대거리</th><th>반감거리</th></tr></thead><tbody><tr><td>30곳 이상</td><td>1km</td><td>100m</td></tr><tr><td>10~29곳</td><td>2km</td><td>300m</td></tr><tr><td>10곳 미만</td><td>3km</td><td>500m</td></tr></tbody></table><p>격자 중심의 직선거리로 계산하며, 신규 치과 추가 전·후에 같은 거리 기준을 적용합니다. 모든 치과의 매력도는 같다고 가정합니다.</p><p>기댓값은 격자별 인구 × 선택확률의 합계입니다. 방문 실측값이 아니며 두 인구는 중복될 수 있습니다. 연령 선택과 별개로 전체 인구를 분석합니다.</p><p>선택확률 그래프는 원래 인구의 확률별 분포(명/1%p)입니다. 거리 그래프는 같은 배후인구를 100m 거리 구간별로 집계합니다. 25% 초과 인구가 거주·종사 중 한쪽이라도 1% 이상이면 100%까지 표시합니다.</p><p>카카오 연결 좌표와 미검증 좌표를 포함합니다. 미수록·비공개 격자는 0명이 아닙니다.</p></details></div>`;
  const status=host.querySelector('#catchment-status'),output=host.querySelector('#catchment-result'),name=host.querySelector('#catchment-selected-name');
  let worker,sequence=0,selection,marker,gridFlow,inflow,flowSelection,mode='location';
  const attached=new WeakSet(),format=n=>Math.round(n).toLocaleString('ko-KR');
  function showStatus(text){status.textContent=text;status.hidden=!text;}
  function calculate(){
    if(!selection||mode!=='location')return;
    gridFlow?.destroy();gridFlow=null;
    inflow?.destroy();inflow=null;
    output.replaceChildren();showStatus('분석 중…');
    try{
      if(!worker){
        worker=new Worker(new URL('./catchment-worker.mjs?v=inflow-1',import.meta.url),{type:'module'});
        worker.onmessage=({data})=>{
          if(data.id!==sequence||mode!=='location')return;
          if(data.phase){showStatus(data.phase);return;}
          if(data.error){showStatus(data.error);return;}
          const display=(dataset,value)=>data.datasets[dataset].records?format(value):'자료 없음';
          showStatus('');
          host.querySelector('#catchment-source-date').textContent='SGIS 2024년 100m 인구 · 치과 목록 '+data.clinicAsOf;
          const title=document.createElement('p');title.className='catchment-total';
          title.textContent='배후인구 · 거주 '+display('population',data.datasets.population.bands.reduce((s,b)=>s+b.nearby,0))+'명 · 종사인구 '+display('workers',data.datasets.workers.bands.reduce((s,b)=>s+b.nearby,0))+'명';output.append(title);
          const expected=document.createElement('div');expected.className='catchment-expected';
          const heading=document.createElement('strong');heading.textContent='인구 기댓값';expected.append(heading);
          for(const [key,label] of [['population','거주인구'],['workers','종사인구']]){
            const line=document.createElement('div');line.className=key;line.textContent=label+' '+display(key,data.datasets[key].expectedPopulation)+'명';expected.append(line);
          }
          output.append(expected);
          const incoming=document.createElement('section');output.append(incoming);
          inflow=new CatchmentInflow(selection.controller,incoming,data.target,data.datasets);
          if(data.impact)output.append(impactPanel(data.impact));
          output.append(probabilityChart(data.datasets));
          output.append(distanceChart(data.datasets));
          const distances=document.createElement('details'),summary=document.createElement('summary');summary.textContent='거리별 배후인구 보기';distances.append(summary);
          const distanceTable=document.createElement('table');distanceTable.innerHTML='<caption>거리별 배후인구 · 명</caption><thead><tr><th>거리</th><th>거주</th><th>종사인구</th></tr></thead>';
          const distanceBody=document.createElement('tbody'),limits=[100,300,500,1000,2000,3000];let pop=0,workers=0;
          limits.forEach((limit,i)=>{
            const p=data.datasets.population.bands[i].nearby,w=data.datasets.workers.bands[i].nearby;pop+=p;workers+=w;
            const tr=document.createElement('tr');
            for(const text of [(i?limits[i-1]:0)+'~'+limit+'m',display('population',p)+'\n누적 '+display('population',pop),display('workers',w)+'\n누적 '+display('workers',workers)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}distanceBody.append(tr);
          });
          distanceTable.append(distanceBody);distances.append(distanceTable);output.append(distances);
          if(!data.datasets.population.records||!data.datasets.workers.records)showStatus('일부 인구 자료가 없습니다.');
        };
        worker.onerror=()=>{if(mode==='location')showStatus('계산을 시작하지 못했습니다. 다시 선택해 주세요.');worker.terminate();worker=null;};
      }
      worker.postMessage({id:++sequence,target:selection.target});
    }catch(e){showStatus('분석을 시작하지 못했습니다. 새로고침 후 다시 시도해 주세요.');}
  }
  function syncMode(){
    for(const button of host.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  }
  function clearScene(){gridFlow?.destroy();gridFlow=null;inflow?.destroy();inflow=null;marker?.setMap(null);marker=null;output.replaceChildren();host.querySelector('#catchment-clinic-details').replaceChildren();name.textContent='';name.hidden=true;host.querySelector('#catchment-body').scrollTop=0;}
  function cancelCalculation(){worker?.postMessage({id:++sequence,cancel:true});}
  function select(target,controller){
    mode='location';syncMode();selection={target,controller};clearScene();
    name.textContent=target.id==null?'선택한 신규 입지':target.name;name.hidden=false;
    if(target.id==null)globalThis.clinicLayer?.closeInfo?.();
    const position=new kakao.maps.LatLng(target.lat,target.lng);
    marker=new kakao.maps.Marker({map:controller.map,position,zIndex:40});
    calculate();
  }
  function selectFlow(point,controller){
    mode='flow';syncMode();flowSelection={point,controller};cancelCalculation();clearScene();
    globalThis.clinicLayer?.closeInfo?.();
    showStatus('');
    const panel=document.createElement('div');output.append(panel);gridFlow=new GridFlow(controller,panel,{point});
  }
  for(const button of host.querySelectorAll('[data-mode]'))button.onclick=()=>{
    if(mode===button.dataset.mode)return;
    mode=button.dataset.mode;syncMode();cancelCalculation();clearScene();
    if(mode==='location'){
      if(selection)select(selection.target,selection.controller);
      else showStatus('치과 또는 빈 곳을 선택해 입지를 분석하세요.');
    }else{
      globalThis.clinicLayer?.closeInfo?.();
      if(flowSelection)selectFlow(flowSelection.point,flowSelection.controller);
      else showStatus('지도에서 출발 격자를 선택하세요.');
    }
  };
  syncMode();
  window.addEventListener('clinic-list',()=>{mode='location';syncMode();selection=null;cancelCalculation();clearScene();showStatus('');});
  window.addEventListener('clinic-catchment',({detail})=>{select(detail.point,detail.controller);host.querySelector('#catchment-body').scrollTop=0;});
  function attach(){for(const controller of globalThis.clinicMapControllers?.values()||[]){if(!controller.map||attached.has(controller))continue;attached.add(controller);kakao.maps.event.addListener(controller.map,'click',event=>{const point={lat:event.latLng.getLat(),lng:event.latLng.getLng(),name:'선택 지점'};if(mode==='flow')selectFlow(point,controller);else select(point,controller);});}}
  setInterval(attach,1000);attach();
}
