/* Kakao owns map projection, camera gestures, tiles and every geographic shape.
 * Public APIs do not supply analytical boundary polygons or a standalone subway line layer.
 * Those geometries retain the original data provenance and are passed to Polygon/Polyline.
 */
'use strict';
const kakaoControllers = new Map();
let kakaoReady;
let fillOpacity = .65;
let pickerFeatures;
let searchSequence = 0;

function loadKakao() {
  if (kakaoReady) return kakaoReady;
  kakaoReady = new Promise((resolve, reject) => {
    if (window.kakao?.maps?.Map && window.kakao.maps.services) { resolve(); return; }
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => finish(new Error('지도 연결 시간이 초과되었습니다.')), 20000);
    const script = document.createElement('script');
    script.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=440a28249d3bdcd6a1d191a152435823&autoload=false&libraries=services';
    script.onerror = () => finish(new Error('카카오 지도를 불러오지 못했습니다.'));
    script.onload = () => {
      if (!window.kakao?.maps?.load) { finish(new Error('지도 서비스 설정을 확인해 주세요.')); return; }
      kakao.maps.load(() => finish());
    };
    document.head.append(script);
  });
  return kakaoReady;
}

function showMapMessage(el, message, retry = false) {
  let status = el.querySelector('.map-message');
  if (!status) {
    status = document.createElement('div');
    status.className = 'map-message';
    status.setAttribute('role', 'status');
    el.append(status);
  }
  status.replaceChildren(document.createTextNode(message));
  status.hidden = false;
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = '다시 불러오기';
    button.onclick = () => location.reload();
    status.append(button);
  }
}

// This is the renderer contract used by the shared analytical code.
function draw(el, features, context = [], state) {
  regionInfo(el, features, state);
  let controller = kakaoControllers.get(el.id);
  if (!controller) {
    controller = new KakaoAnalysisMap(el);
    kakaoControllers.set(el.id, controller);
  }
  controller.features = features;
  controller.context = context;
  controller.state = state;
  if (el.closest('[hidden]')) { controller.suspend(); return; }
  updateRegionPicker(features, state);
  controller.render();
}
function refreshMap(el, features, context, state) { draw(el, features, context, state); }

function activeController() {
  return kakaoControllers.get(document.querySelector('#local').hidden ? 'map' : 'local-map');
}
function fullRegionName(feature) {
  const p = feature.properties;
  if (String(p.code).length !== 5) return globalThis.adminDisplayName?.(p.name)??p.name;
  const prefix = Object.entries(SIDO_PREFIX).find(([,code]) => String(p.code).startsWith(code))?.[0];
  const name=(prefix ? prefix + ' ' : '') + p.name;
  return globalThis.adminDisplayName?.(name)??name;
}
globalThis.refreshAdministrativeNames=()=>{
  pickerFeatures=null;
  for(const controller of kakaoControllers.values())if(controller.features?.length&&!controller.el.closest('[hidden]')){
    updateRegionPicker(controller.features,controller.state);
    regionInfo(controller.el,controller.features,controller.state);
  }
};
function updateRegionPicker(features, state) {
  const picker = document.querySelector('#region-picker');
  if (pickerFeatures !== features) {
    pickerFeatures = features;
    const fragment = document.createDocumentFragment();
    fragment.append(new Option('분석 지역 선택', ''));
    [...features].sort((a,b) => fullRegionName(a).localeCompare(fullRegionName(b), 'ko')).forEach(f => {
      fragment.append(new Option(fullRegionName(f), String(f.properties.code)));
    });
    picker.replaceChildren(fragment);
  }
  picker.value = state.selected || '';
}

// Bounding boxes only decide which original geometries need SDK objects. No projection,
// boundary simplification, sampling or statistical filtering happens here.
function boundingBox(rings) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) for (const [x,y] of ring) {
    b[0] = Math.min(b[0],x); b[1] = Math.min(b[1],y);
    b[2] = Math.max(b[2],x); b[3] = Math.max(b[3],y);
  }
  return b;
}
function intersects(a,b) { return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]; }
function prepareFeatures(features) {
  return features.flatMap(feature => polys(feature.geometry).map(rings => ({
    feature, rings, bbox: boundingBox(rings), shape: null, attached: false
  })));
}
function kakaoPath(rings) {
  // Separate polygon parts; retain interior rings as holes in the official API format.
  return rings.map(ring => ring.map(([lng,lat]) => new kakao.maps.LatLng(lat,lng)));
}

class KakaoAnalysisMap {
  constructor(el) {
    this.el = el;
    this.map = null;
    this.ready = null;
    this.revision = 0;
    this.frame = null;
    this.parts = [];
    this.contextParts = [];
    this.lines = [];
    this.cache = new Set();
    this.lastSize = '';
  }
  async ensureMap() {
    if (this.map) return;
    if (this.ready) return this.ready;
    showMapMessage(this.el, '카카오 지도를 불러오는 중입니다.');
    this.ready = loadKakao().then(() => {
      if (this.el.closest('[hidden]')) { this.ready = null; return; }
      this.el.replaceChildren();
      this.canvas = document.createElement('div');
      this.canvas.className = 'kakao-canvas';
      this.canvas.setAttribute('aria-label', this.el.id === 'map' ? '카카오 시군구 분석 지도' : '카카오 읍면동 분석 지도');
      this.el.append(this.canvas);
      this.map = new kakao.maps.Map(this.canvas, {
        center: new kakao.maps.LatLng(36.0,127.8), level: 13
      });
      this.map.addControl(new kakao.maps.MapTypeControl(), kakao.maps.ControlPosition.TOPRIGHT);
      this.tip = document.createElement('div');
      this.tip.className = 'tooltip';
      this.legend = document.createElement('div'); this.legend.className = 'legend';
      this.progress = document.createElement('div'); this.progress.className = 'map-render-status';
      this.progress.setAttribute('role','status');
      const controls = document.createElement('div'); controls.className = 'zoom';
      controls.innerHTML = '<button type="button" aria-label="지도 확대">+</button><button type="button" aria-label="지도 축소">−</button><button type="button" aria-label="지도 초기화">↺</button><span class="zoom-level" aria-label="확대 배율"></span>';
      this.zoomLabel = controls.querySelector('span');
      controls.children[0].onclick = () => this.map.setLevel(this.map.getLevel()-1);
      controls.children[1].onclick = () => this.map.setLevel(this.map.getLevel()+1);
      controls.children[2].onclick = () => this.reset();
      this.el.append(this.tip, controls, this.legend, this.progress);
      kakao.maps.event.addListener(this.map,'idle',() => this.schedule());
      kakao.maps.event.addListener(this.map,'zoom_changed',() => this.updateZoom());
      kakao.maps.event.addListener(this.map,'dragstart',() => this.hideTip());
      this.resize = new ResizeObserver(() => {
        if (this.el.closest('[hidden]')) return;
        const size = this.el.clientWidth + ':' + this.el.clientHeight;
        if (size === this.lastSize) return;
        this.lastSize = size;
        const center = this.map.getCenter();
        this.map.relayout(); this.map.setCenter(center);
        this.schedule();
      });
      this.resize.observe(this.el);
      this.reset();
    });
    return this.ready;
  }
  async render() {
    try {
      await this.ensureMap();
      if (!this.map || this.el.closest('[hidden]')) return;
      this.el.querySelector('.map-message')?.remove();
      if (this.prepared !== this.features) {
        this.parts = prepareFeatures(this.features);
        this.prepared = this.features;
      }
      // Administrative context is a non-clickable outline above the local polygons.
      const context = this.el.id === 'local-map' ? (D || []) : [];
      if (this.preparedContext !== context) {
        this.contextParts = prepareFeatures(context);
        this.preparedContext = context;
      }
      this.max = scaleMax(this.features);
      paintLegend(this.legend, this.max);
      this.hideTip();
      this.map.relayout();
      this.updateZoom();
      this.schedule();
    } catch (error) {
      showMapMessage(this.el, error.message + ' 네트워크 연결과 허용 도메인을 확인해 주세요.', true);
    }
  }
  updateZoom() {
    this.zoomLabel.textContent = (2 ** (this.homeLevel - this.map.getLevel())).toFixed(1) + '×';
  }
  reset() {
    const bounds = new kakao.maps.LatLngBounds(new kakao.maps.LatLng(33.05,124.5),new kakao.maps.LatLng(38.65,131.95));
    this.map.setBounds(bounds,35,35,65,35);
    this.homeLevel = this.map.getLevel(); this.updateZoom(); this.schedule();
  }
  suspend() {
    this.revision++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null; this.hideTip();
  }
  schedule() {
    if (!this.map || !this.prepared || this.el.closest('[hidden]')) return;
    this.revision++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => { this.frame = null; this.renderVisible(); });
  }
  viewport() {
    const bounds = this.map.getBounds(),sw = bounds.getSouthWest(),ne = bounds.getNorthEast();
    return [sw.getLng(),sw.getLat(),ne.getLng(),ne.getLat()];
  }
  options(part, context = false) {
    const selected = String(part.feature.properties.code) === this.state.selected;
    const value = rate(part.feature.properties);
    return {
      strokeColor: context ? '#536d7e' : selected ? '#ff9c24' : '#8193a0',
      strokeWeight: context ? 1.1 : selected ? 3 : this.el.id === 'local-map' ? .55 : .8,
      strokeOpacity: .9,
      fillColor: value == null ? '#c8d8de' : paint(value,this.max),
      fillOpacity: context ? 0 : fillOpacity,
      zIndex: context ? 3 : selected ? 5 : 1
    };
  }
  select(code, focus = false) {
    this.state.selected = code || null;
    regionInfo(this.el,this.features,this.state);
    updateRegionPicker(this.features,this.state);
    if (focus && code) {
      const feature = this.features.find(f => String(f.properties.code) === code);
      const bounds = new kakao.maps.LatLngBounds();
      for (const polygon of polys(feature.geometry)) for (const [lng,lat] of polygon[0]) bounds.extend(new kakao.maps.LatLng(lat,lng));
      this.map.setBounds(bounds,60,50,100,50);
    }
    this.schedule();
  }
  hideTip() { this.tip?.classList.remove('on'); }
  showTip(part,event) {
    const p = part.feature.properties, value = rate(p);
    this.tip.innerHTML = typeof window.populationTooltip === 'function' ? window.populationTooltip(part.feature) : '<strong>' + escapeHTML(fullRegionName(part.feature)) + '</strong><br>' +
      (S.metric === 'net' ? '개원 <b>+' + nf(p.openings||0) + '</b> · 폐업 <b>−' + nf(p.closures||0) + '</b><br>순증감 <b>' + signed(v(p)) + '곳</b>' :
        isCount() ? escapeHTML(M[S.metric][0]) + ' <b>' + nf(v(p)) + M[S.metric][1] + '</b>' :
        '인구 1만 명당 <b>' + (value == null ? '–' : value.toFixed(2)+M[S.metric][1]) + '</b><br>' + escapeHTML(M[S.metric][0]) + ' ' + nf(v(p)) + M[S.metric][1] + ' · ' + dname() + ' ' + nf(base(p)) + '명');
    const point = this.map.getProjection().containerPointFromCoords(event.latLng);
    this.tip.classList.add('on');
    this.tip.style.left = Math.max(8,Math.min(point.x+12,this.el.clientWidth-this.tip.offsetWidth-8))+'px';
    this.tip.style.top = Math.max(8,Math.min(point.y+12,this.el.clientHeight-this.tip.offsetHeight-35))+'px';
  }
  attachPolygon(part, context) {
    if (!part.shape) {
      part.shape = new kakao.maps.Polygon({path:kakaoPath(part.rings),...this.options(part,context)});
      this.cache.add(part);
      if (!context) {
        kakao.maps.event.addListener(part.shape,'click',() => this.select(String(part.feature.properties.code)));
        kakao.maps.event.addListener(part.shape,'mousemove',event => this.showTip(part,event));
        kakao.maps.event.addListener(part.shape,'mouseout',() => this.hideTip());
      }
    }
    part.shape.setOptions(this.options(part,context));
    if (!part.attached) { part.shape.setMap(this.map); part.attached = true; }
  }
  renderVisible() {
    const revision = this.revision, bounds = this.viewport();
    const work = [];
    for (const [parts,context] of [[this.parts,false],[this.contextParts,true]]) {
      for (const part of parts) {
        if (intersects(part.bbox,bounds)) work.push([part,context]);
        else if (part.attached) { part.shape.setMap(null); part.attached = false; }
      }
    }
    this.progress.textContent = '경계 표시 중…';
    let index = 0;
    const batch = () => {
      if (revision !== this.revision || this.el.closest('[hidden]')) return;
      const start = performance.now();
      while (index < work.length && performance.now()-start < 9) {
        this.attachPolygon(...work[index++]);
      }
      if (index < work.length) this.frame = requestAnimationFrame(batch);
      else {
        this.frame = null;
        this.renderMetro(bounds);
        this.progress.textContent = '표시 지역 ' + new Set(work.filter(([,ctx])=>!ctx).map(([p])=>p.feature.properties.code)).size.toLocaleString('ko-KR') + '곳';
        // Off-screen shapes can be rebuilt from the original coordinates; bound memory after long exploration.
        if (this.cache.size > 12000) for (const part of this.cache) {
          if (!part.attached) { part.shape = null; this.cache.delete(part); }
        }
      }
    };
    batch();
  }
  renderMetro(bounds) {
    if (T && this.transport !== T) {
      this.transport = T;
      this.lines = T.features.flatMap(feature => {
        const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        return lines.map(line => ({line,color:mc(feature.properties.lineId),bbox:boundingBox([line]),shape:null,attached:false}));
      });
    }
    for (const part of this.lines) {
      const visible = S.metro && intersects(part.bbox,bounds);
      if (visible && !part.shape) part.shape = new kakao.maps.Polyline({
        path:part.line.map(([lng,lat])=>new kakao.maps.LatLng(lat,lng)),strokeColor:part.color,strokeWeight:3,strokeOpacity:.95,zIndex:6
      });
      if (visible && !part.attached) { part.shape.setMap(this.map); part.attached = true; }
      else if (!visible && part.attached) { part.shape.setMap(null); part.attached = false; }
    }
  }
}

document.querySelector('#region-picker').addEventListener('change',event => {
  const controller = activeController();
  if (controller?.map) controller.select(event.target.value,true);
});
document.querySelector('#fill-opacity').addEventListener('input',event => {
  fillOpacity = Number(event.target.value)/100;
  document.querySelector('#fill-value').textContent = event.target.value+'%';
  activeController()?.schedule();
});

document.querySelector('#place-search').addEventListener('submit',async event => {
  event.preventDefault();
  const query = document.querySelector('#place-query').value.trim();
  if (!query) return;
  const sequence = ++searchSequence;
  const results = document.querySelector('#search-results');
  results.hidden = false; results.textContent = '카카오에서 검색 중입니다.';
  try {
    await loadKakao();
    const places = new kakao.maps.services.Places();
    const display = (items,status) => {
      if (sequence !== searchSequence) return;
      results.replaceChildren();
      const close = document.createElement('button'); close.type='button';close.className='search-close';close.textContent='닫기';
      close.onclick=()=>{searchSequence++;results.hidden=true};results.append(close);
      if (status !== kakao.maps.services.Status.OK || !items.length) {
        results.append(document.createTextNode(status === kakao.maps.services.Status.ZERO_RESULT ? '검색 결과가 없습니다.' : '검색에 실패했습니다. 잠시 뒤 다시 시도해 주세요.'));return;
      }
      const list = document.createElement('ol');results.append(list);
      for (const item of items) {
        const li=document.createElement('li'),button=document.createElement('button'),detail=document.createElement('small');
        button.type='button';button.textContent=item.place_name||item.address_name;
        detail.textContent=item.road_address_name||item.address_name;button.append(detail);li.append(button);list.append(li);
        button.onclick=async()=>{
          const controller=activeController();if(!controller)return;
          await controller.ensureMap();
          if(!controller.map||controller.el.closest('[hidden]'))return;
          const position=new kakao.maps.LatLng(Number(item.y),Number(item.x));
          controller.map.setLevel(4);controller.map.setCenter(position);
          if(!controller.searchMarker)controller.searchMarker=new kakao.maps.Marker({position});
          controller.searchMarker.setPosition(position);controller.searchMarker.setMap(controller.map);
          controller.searchMarker.setTitle(item.place_name||item.address_name);
          results.hidden=true;
        };
      }
    };
    places.keywordSearch(query,(items,status)=>{
      if(sequence!==searchSequence)return;
      if(status===kakao.maps.services.Status.ZERO_RESULT) new kakao.maps.services.Geocoder().addressSearch(query,display);
      else display(items,status);
    },{size:10});
  } catch {
    if(sequence===searchSequence)results.textContent='카카오 검색을 불러오지 못했습니다. 새로고침해 주세요.';
  }
});
