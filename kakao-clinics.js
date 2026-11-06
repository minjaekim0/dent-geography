import {decodeClinicIndex, createClinicIndex, clinicDisplayPlan, placeLink} from './clinic-model.mjs?v=compact-1';

const toggle = document.querySelector('#clinic-toggle');
const filter = document.querySelector('#clinic-source');
const status = document.querySelector('#clinic-status');
const states = new Map(), chunks = new Map();
let data, index, loading, failed = false;
const count = n => n.toLocaleString('ko-KR');
const tell = message => { status.textContent = message; };
const position = p => new kakao.maps.LatLng(p.lat, p.lng);

function stateFor(controller) {
  if (states.has(controller)) return states.get(controller);
  const state = {controller, overlays:new Map(), info:new kakao.maps.InfoWindow({zIndex:30}), signature:'', token:0};
  const image = color => new kakao.maps.MarkerImage('data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="7" fill="${color}" stroke="white" stroke-width="2"/></svg>`), new kakao.maps.Size(18,18));
  state.images = {kakao:image('#176cc1'), hira_unverified:image('#d98120')};
  states.set(controller, state);
  return state;
}
function closeInfo(state) {
  state.token++; state.openPoint = null; state.info.close();
  state.selectedMarker?.setMap(null); state.selectedMarker = null;
}
function cardFor(state, title) {
  const card=document.createElement('div'); card.className='clinic-card';
  const heading=document.createElement('strong'); heading.textContent=title;
  const close=document.createElement('button'); close.type='button'; close.className='clinic-close';
  close.textContent='닫기'; close.onclick=()=>closeInfo(state);
  card.append(heading,close);
  return card;
}
function addText(card, text, tag='p') {
  const el=document.createElement(tag); el.textContent=text; card.append(el);
}
async function detail(point) {
  const path=data.detailChunks[point.detailChunk];
  if (!chunks.has(path)) {
    const promise=fetch('data/'+path+'?v='+data.dataVersion).then(r=>{
      if(!r.ok)throw new Error('상세 주소를 불러오지 못했습니다.');
      return r.json();
    }).catch(error=>{chunks.delete(path);throw error;});
    chunks.set(path,promise);
    if(chunks.size>6)chunks.delete(chunks.keys().next().value);
  }
  const result=chunks.get(path); chunks.delete(path); chunks.set(path,result);
  const rows=await result;
  if(!rows[point.id])throw new Error('상세 자료를 확인해 주세요.');
  return rows[point.id];
}
async function openClinic(state, point, marker) {
  closeInfo(state);
  state.openPoint=point;
  const token=state.token, map=state.controller.map;
  if(!marker) {
    marker=new kakao.maps.Marker({map,position:position(point),image:state.images[point.source],zIndex:25});
    state.selectedMarker=marker;
  }
  const card=cardFor(state,point.name);
  addText(card,'상세 주소를 불러오는 중입니다…');
  state.info.setContent(card); state.info.open(map,marker);
  try {
    const p=await detail(point);
    if(token!==state.token)return;
    const loaded=cardFor(state,p.name);
    addText(loaded,p.address);
    const observed=p.queriedAt ? p.queriedAt.slice(0,10) : data.kakaoQueriedOn;
    addText(loaded,p.source==='kakao'?'주소·위치: 카카오맵 · '+observed+' 조회':'주소·위치: 심평원 · 카카오 연결 보류');
    addText(loaded,'기관 목록: '+data.hiraAsOf+' · 현재 영업 여부는 별도 확인','small');
    if(p.kakaoName && p.kakaoName!==p.name)addText(loaded,'카카오 명칭: '+p.kakaoName);
    if(p.addressPriorityApplied)addText(loaded,'심평원 주소와 달라 카카오 주소·위치를 우선 적용');
    if(p.largeDifference)addText(loaded,'심평원 원본 좌표와 100m 초과 차이 · 카카오 위치 우선');
    const href=placeLink(p.placeUrl);
    if(href){const link=document.createElement('a');link.href=href;link.target='_blank';link.rel='noopener noreferrer';link.textContent='카카오맵에서 보기 ↗';loaded.append(link);}
    state.info.setContent(loaded);
  } catch(error) {
    if(token!==state.token)return;
    const failedCard=cardFor(state,point.name);addText(failedCard,error.message);
    const retry=document.createElement('button');retry.type='button';retry.textContent='다시 시도';retry.onclick=()=>openClinic(state,point);
    failedCard.append(retry);state.info.setContent(failedCard);
  }
}
function groupList(state, entry, page=0) {
  closeInfo(state);
  // Keep the popup open while the SDK pans to make room for it.
  state.openPoint={...entry.members[0],lng:entry.lng,lat:entry.lat};
  const card=cardFor(state,'이 위치 주변 치과 '+count(entry.count)+'곳');
  const list=document.createElement('div');list.className='clinic-group-list';
  for(const p of entry.members.slice(page*50,(page+1)*50)) {
    const button=document.createElement('button');button.type='button';button.textContent=p.name;
    button.onclick=()=>openClinic(state,p);list.append(button);
  }
  card.append(list);
  if(entry.count>50){
    const nav=document.createElement('div');nav.className='clinic-group-pages';
    for(const [label,next] of [['이전',page-1],['다음',page+1]]){
      const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=next<0||next*50>=entry.count;
      b.onclick=()=>groupList(state,entry,next);nav.append(b);
    }
    card.append(nav);
  }
  state.info.setContent(card);state.info.setPosition(position(entry));state.info.open(state.controller.map);
}
function openGroup(state, entry) {
  const b=entry.bounds;
  if(state.controller.map.getLevel()<=3 || (b[2]-b[0]<.0002 && b[3]-b[1]<.0002))return groupList(state,entry);
  closeInfo(state);
  const bounds=new kakao.maps.LatLngBounds();
  bounds.extend(new kakao.maps.LatLng(b[1],b[0]));bounds.extend(new kakao.maps.LatLng(b[3],b[2]));
  state.controller.map.setBounds(bounds,50,50,50,50);
}
function makeOverlay(state,entry) {
  const record={entry};
  if(entry.count===1){
    const p=entry.members[0];
    record.overlay=new kakao.maps.Marker({position:position(p),title:p.name,image:state.images[p.source],zIndex:15});
    kakao.maps.event.addListener(record.overlay,'click',()=>openClinic(state,record.entry.members[0],record.overlay));
  } else {
    record.button=document.createElement('button');record.button.type='button';record.button.className='clinic-cluster';
    record.button.onclick=event=>{event.stopPropagation();kakao.maps.event.preventMap();openGroup(state,record.entry);};
    record.overlay=new kakao.maps.CustomOverlay({position:position(entry),content:record.button,yAnchor:.5,zIndex:16,clickable:true});
  }
  updateOverlay(record,entry);
  record.overlay.setMap(state.controller.map);
  return record;
}
function updateOverlay(record,entry) {
  if(record.entry.lng!==entry.lng || record.entry.lat!==entry.lat)record.overlay.setPosition(position(entry));
  record.entry=entry;
  if(record.button){
    const text=count(entry.count);
    if(record.button.textContent!==text)record.button.textContent=text;
    record.button.setAttribute('aria-label','치과 '+text+'곳 · 확대 또는 목록 보기');
    record.button.classList.toggle('hira-only',entry.kakaoCount===0);
  }
}
async function loadData() {
  if(data)return data;
  if(loading)return loading;
  tell('치과 위치를 불러오는 중입니다…');
  loading=fetch('data/current-clinics-index.json?v=dongtan-20261106').then(r=>{
    if(!r.ok)throw new Error('치과 위치를 불러오지 못했습니다.');return r.json();
  }).then(value=>{data=decodeClinicIndex(value);index=createClinicIndex(data.locations);failed=false;return data;})
    .catch(error=>{failed=true;tell(error.message+' 치과 위치를 껐다 켜면 다시 시도합니다.');})
    .finally(()=>{loading=null;});
  return loading;
}
function clear(controller) {
  const state=states.get(controller);
  if(!state)return;
  clearTimeout(state.timer);state.timer=null;state.signature='';closeInfo(state);
  for(const record of state.overlays.values())record.overlay.setMap(null);
  state.overlays.clear();
}
async function renderNow(controller) {
  if(!toggle.checked || controller.el.closest('[hidden]')){clear(controller);return;}
  if(!data){if(failed)return;await loadData();if(!data||!toggle.checked||controller.el.closest('[hidden]'))return;}
  const started=performance.now(),state=stateFor(controller),bounds=controller.viewport();
  const width=controller.el.clientWidth||900,height=controller.el.clientHeight||520;
  const signature=[filter.value,controller.map.getLevel(),width,height,...bounds].join(':');
  if(signature===state.signature)return;
  state.signature=signature;
  const {points,entries}=clinicDisplayPlan(index,bounds,filter.value,width,height);
  const current=new Set(entries.map(e=>e.key));let created=0;
  for(const [key,record] of state.overlays)if(!current.has(key)){record.overlay.setMap(null);state.overlays.delete(key);}
  for(const entry of entries){
    const record=state.overlays.get(entry.key);
    if(record)updateOverlay(record,entry);
    else{state.overlays.set(entry.key,makeOverlay(state,entry));created++;}
  }
  const p=state.openPoint;
  if(p && (!points.some(v=>v.id===p.id) || p.lng<bounds[0]||p.lng>bounds[2]||p.lat<bounds[1]||p.lat>bounds[3]))closeInfo(state);
  const blue=points.reduce((n,p)=>n+(p.source==='kakao'),0);
  status.dataset.renderMs=(performance.now()-started).toFixed(1);
  status.dataset.createdMarkers=String(created);
  status.dataset.overlayCount=String(entries.length);
  tell('화면 안 '+count(points.length)+'곳 · 카카오 '+count(blue)+' / 심평원 '+count(points.length-blue)+' · 숫자를 누르면 확대');
}
function render(controller) {
  if(!toggle.checked||controller.el.closest('[hidden]')){clear(controller);return;}
  const state=stateFor(controller);clearTimeout(state.timer);
  state.timer=setTimeout(()=>{state.timer=null;renderNow(controller);},50);
}
globalThis.clinicLayer={render,clear};
function refresh(){
  for(const controller of globalThis.clinicMapControllers?.values()||[]){
    if(!toggle.checked)clear(controller);
    else if(controller.map&&!controller.el.closest('[hidden]'))render(controller);
  }
  if(!toggle.checked)tell('치과 위치 표시 꺼짐');
}
toggle.addEventListener('change',()=>{failed=false;refresh();});
filter.addEventListener('change',()=>{for(const state of states.values()){state.signature='';closeInfo(state);}refresh();});
refresh();
