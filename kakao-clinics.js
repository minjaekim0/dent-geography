import {visibleClinics, placeLink} from './clinic-model.mjs';

const toggle = document.querySelector('#clinic-toggle');
const filter = document.querySelector('#clinic-source');
const status = document.querySelector('#clinic-status');
const states = new Map();
let data, loading, failed = false;
const count = n => n.toLocaleString('ko-KR');

function tell(message) { status.textContent = message; }
function stateFor(controller) {
  if (states.has(controller)) return states.get(controller);
  const cluster = new kakao.maps.MarkerClusterer({map: controller.map, averageCenter: true, minLevel: 6,
    gridSize: 55, styles: [{width: '42px', height: '42px', background: '#123f68e8', color: '#fff',
      textAlign: 'center', lineHeight: '42px', borderRadius: '50%', fontWeight: '700', border: '2px solid white'}]});
  const state = {cluster, markers: new Map(), info: new kakao.maps.InfoWindow({zIndex: 30}), signature: ''};
  const image = color => new kakao.maps.MarkerImage('data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><circle cx="9" cy="9" r="7" fill="${color}" stroke="white" stroke-width="2"/></svg>`), new kakao.maps.Size(18, 18));
  state.images = {kakao: image('#176cc1'), hira_unverified: image('#d98120')};
  states.set(controller, state);
  return state;
}
function openClinic(state, marker, p) {
  state.openId = p.id;
  const card = document.createElement('div'); card.className = 'clinic-card';
  const title = document.createElement('strong'); title.textContent = p.name;
  const close = document.createElement('button'); close.type = 'button'; close.className = 'clinic-close';
  close.textContent = '닫기'; close.onclick = () => { state.openId = null; state.info.close(); };
  const address = document.createElement('p'); address.textContent = p.address;
  const source = document.createElement('p');
  source.textContent = p.source === 'kakao' ? '주소·위치: 카카오맵 · ' + data.kakaoQueriedOn + ' 조회' : '주소·위치: 심평원 · 카카오 연결 보류';
  const date = document.createElement('small'); date.textContent = '기관 목록: ' + data.hiraAsOf + ' · 현재 영업 여부는 별도 확인';
  card.append(title, close, address, source, date);
  if (p.kakaoName && p.kakaoName !== p.name) { const name = document.createElement('p'); name.textContent = '카카오 명칭: ' + p.kakaoName; card.append(name); }
  if (p.addressPriorityApplied) { const note = document.createElement('p'); note.textContent = '심평원 주소와 달라 카카오 주소·위치를 우선 적용'; card.append(note); }
  if (p.largeDifference) { const note = document.createElement('p'); note.textContent = '심평원 원본 좌표와 100m 초과 차이 · 카카오 위치 우선'; card.append(note); }
  const href = placeLink(p.placeUrl);
  if (href) { const link = document.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '카카오맵에서 보기 ↗'; card.append(link); }
  state.info.setContent(card); state.info.open(marker.getMap(), marker);
}
async function loadData() {
  if (data) return data;
  if (loading) return loading;
  tell('치과 위치를 불러오는 중입니다…');
  loading = fetch('data/current-clinics.json?v=incheon-names-4').then(response => {
    if (!response.ok) throw new Error('위치 데이터를 불러오지 못했습니다.');
    return response.json();
  }).then(value => { data = value; failed = false; return data; }).catch(error => {
    failed = true; tell(error.message + ' 치과 위치를 껐다 켜면 다시 시도합니다.');
  }).finally(() => { loading = null; });
  return loading;
}
function clear(controller) {
  const state = states.get(controller);
  if (state) { state.cluster.clear(); state.info.close(); state.openId = null; state.signature = ''; }
}
async function render(controller) {
  if (!toggle.checked || controller.el.closest('[hidden]')) { clear(controller); return; }
  if (!data) {
    if (failed) return;
    await loadData();
    if (!data || !toggle.checked || controller.el.closest('[hidden]')) return;
  }
  const state = stateFor(controller);
  const bounds = controller.viewport();
  const signature = [filter.value, controller.map.getLevel(), ...bounds].join(':');
  if (signature === state.signature) return;
  state.signature = signature;
  const points = visibleClinics(data.locations, bounds, filter.value);
  state.cluster.clear();
  const markers = [], current = new Set();
  for (const p of points) {
    current.add(p.id);
    let marker = state.markers.get(p.id);
    if (!marker) {
      marker = new kakao.maps.Marker({position: new kakao.maps.LatLng(p.lat, p.lng), title: p.name,
        image: state.images[p.source], zIndex: 15});
      kakao.maps.event.addListener(marker, 'click', () => openClinic(state, marker, p));
      state.markers.set(p.id, marker);
    }
    markers.push(marker);
  }
  state.cluster.addMarkers(markers);
  if (state.openId && !current.has(state.openId)) { state.info.close(); state.openId = null; }
  if (state.markers.size > 2500) for (const id of state.markers.keys()) if (!current.has(id)) state.markers.delete(id);
  const blue = points.filter(p => p.source === 'kakao').length;
  tell('화면 안 ' + count(points.length) + '곳 · 카카오 ' + count(blue) + ' / 심평원 ' + count(points.length - blue) + ' · 숫자를 누르면 확대');
}
globalThis.clinicLayer = {render, clear};
function refresh() {
  for (const controller of globalThis.clinicMapControllers?.values() || []) {
    if (!toggle.checked) clear(controller);
    else if (controller.map && !controller.el.closest('[hidden]')) render(controller);
  }
  if (!toggle.checked) tell('치과 위치 표시 꺼짐');
}
toggle.addEventListener('change', () => { failed = false; refresh(); });
filter.addEventListener('change', () => { for (const state of states.values()) state.signature = ''; refresh(); });
refresh();
