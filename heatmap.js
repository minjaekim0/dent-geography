import {PopulationHeatLayer} from './population-heat-layer.mjs';
const $=s=>document.querySelector(s),embedded=new URLSearchParams(location.search).has('embed');
if(embedded)document.body.classList.add('embedded');
let map,layer,active=true,searchSequence=0;
function notify(loaded=Boolean(map)){
 if(embedded)parent.postMessage({type:'population-layout',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height),subtitle:'SGIS 100m 격자 · 거주인구 히트맵',date:'2024년 인구 · 2025년 격자 경계',loaded},location.origin);
}
new ResizeObserver(()=>notify()).observe(document.querySelector('main'));
new ResizeObserver(()=>{if(map){map.relayout();layer?.refresh();}}).observe($('.map-shell'));
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='population-visibility')return;
 active=Boolean(event.data.visible);layer?.setEnabled(active&&$('#heat-visible').checked);if(active&&map)map.relayout();
});
function style(){layer?.setStyle({opacity:Number($('#heat-opacity').value)/100,blur:Number($('#heat-blur').value)/4});}
function loadKakao(){return new Promise((resolve,reject)=>{
  if(window.kakao?.maps?.services){resolve();return;}
  const script=document.createElement('script');
  const timeout=setTimeout(()=>reject(Error('카카오 지도 연결 시간이 초과되었습니다. 새로고침해 주세요.')),20000);
  script.src='https://dapi.kakao.com/v2/maps/sdk.js?appkey=440a28249d3bdcd6a1d191a152435823&autoload=false&libraries=services';
  script.onload=()=>{if(!window.kakao?.maps?.load){clearTimeout(timeout);reject(Error('카카오 지도 설정을 확인해 주세요.'));return;}kakao.maps.load(()=>{clearTimeout(timeout);resolve();});};
  script.onerror=()=>{clearTimeout(timeout);reject(Error('카카오 지도를 불러오지 못했습니다.'));};document.head.append(script);
});}
async function start(){
 try{
  await loadKakao();
  map=new kakao.maps.Map($('#heat-map'),{center:new kakao.maps.LatLng(37.535,127.015),level:6});
  map.setMinLevel(2);map.setMaxLevel(14);map.addControl(new kakao.maps.MapTypeControl(),kakao.maps.ControlPosition.TOPRIGHT);
  $('#heat-canvas').remove();
  layer=new PopulationHeatLayer(map,$('#heat-map'),{onStatus:text=>{$('#heat-status').textContent=text;$('#heat-retry').hidden=!text.includes('실패');notify();}});
  layer.canvas.id='heat-canvas';style();layer.setEnabled(active&&$('#heat-visible').checked);
  $('#heat-plus').onclick=()=>map.setLevel(map.getLevel()-1);
  $('#heat-minus').onclick=()=>map.setLevel(map.getLevel()+1);
  $('#heat-national').onclick=()=>map.setBounds(new kakao.maps.LatLngBounds(new kakao.maps.LatLng(33.1,124.5),new kakao.maps.LatLng(38.7,131.9)),40);
  notify(true);
 }catch(error){$('#heat-error').hidden=false;$('#heat-error').textContent=error.message;notify(false);}
}
$('#heat-visible').onchange=e=>{layer?.setEnabled(active&&e.target.checked);$('.legend').hidden=!e.target.checked;};
$('#heat-opacity').oninput=e=>{$('#heat-opacity-value').value=e.target.value+'%';style();};
$('#heat-blur').oninput=style;
$('#heat-retry').onclick=()=>layer?.refresh();
$('#heat-search').onsubmit=event=>{
  event.preventDefault();if(!map)return;
  const query=$('#heat-query').value.trim();if(!query)return;
  const run=++searchSequence,results=$('#heat-results');results.hidden=false;results.textContent='검색 중입니다.';
  function display(items,result){
    if(run!==searchSequence)return;
    results.replaceChildren();const close=document.createElement('button');close.className='close';close.textContent='닫기';close.onclick=()=>{searchSequence++;results.hidden=true;};results.append(close);
    if(result!==kakao.maps.services.Status.OK||!items.length){results.append(document.createTextNode('검색 결과가 없습니다.'));notify();return;}
    for(const item of items){const button=document.createElement('button'),detail=document.createElement('small');button.textContent=item.place_name||item.address_name;detail.textContent=item.road_address_name||item.address_name;button.append(detail);button.onclick=()=>{map.setLevel(5);map.setCenter(new kakao.maps.LatLng(Number(item.y),Number(item.x)));results.hidden=true;notify();};results.append(button);}
    notify();
  }
  new kakao.maps.services.Places().keywordSearch(query,(items,result)=>{
    if(run!==searchSequence)return;
    if(result===kakao.maps.services.Status.ZERO_RESULT)new kakao.maps.services.Geocoder().addressSearch(query,display);
    else display(items,result);
  },{size:5});
};
start();
