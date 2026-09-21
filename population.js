import {ageCount,metricValue,areaKm2,polygons,isLocal,ageLabel,SEXES,COLORS,thresholds,color,populationChange,changeColor} from './population-model.mjs';

const $=selector=>document.querySelector(selector);
const fmt=(n,d=0)=>n==null||!Number.isFinite(n)?'자료 없음':n.toLocaleString('ko-KR',{maximumFractionDigits:d});
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const changeMode=new URLSearchParams(location.search).get('mode')==='change';
const state={period:'',startPeriod:'',min:0,max:100,sex:0,metric:changeMode?'change':'count',province:'',selected:null};
let manifest,data,startData,features=[],geometryByCode=new Map(),areas=new Map(),revision=0,trendRevision=0,visibleRows=100,playTimer=null;
const yearCache=new Map(),seriesCache=new Map();
const units=()=>['share','growth'].includes(state.metric)?'%':state.metric==='density'?'명/㎢':'명';
const metricLabel=()=>state.metric==='change'?'인구 증감':state.metric==='growth'?'인구 증감률':state.metric==='share'?'전체 주민 중 비중':state.metric==='density'?'밀도 · 보유 경계면적 기준 참고':'인구수';
const comparison=code=>populationChange(startData?.records[code],data?.records[code],state);
const value=code=>changeMode?comparison(code)[state.metric==='growth'?'percent':'count']:metricValue(data?.records[code],state,areas.get(code));
const signed=(n,d=0)=>n==null?'비교 불가':`${n>0?'+':''}${fmt(n,d)}`;
const displayValue=n=>changeMode?signed(n,state.metric==='growth'?2:0):fmt(n,state.metric==='count'?0:1);
const currentMeta=()=>manifest?.periods.find(p=>p.period===state.period);
const periodLabel=period=>`${period.slice(0,4)}년 ${Number(period.slice(5))}월${period.endsWith('-12')?' 말':' · 연말 아님'}`;
const choiceLabel=()=>`${ageLabel(state.min,state.max)} · ${SEXES[state.sex]}`;
const dateLabel=()=>changeMode?`${periodLabel(state.startPeriod)} → ${periodLabel(state.period)}`:periodLabel(state.period);
if(changeMode){
  document.title='인구 증감 지도';$('h1').innerHTML='인구 증감 지도 <span>카카오맵</span>';
  $('header p').textContent='두 시점 사이의 인구 증가·감소를 연령·성별로 비교하세요.';
  $('#start-period-control').hidden=false;$('#period-heading').textContent='종료 시점';
  $('.timeline').hidden=true;$('#change-order-control').hidden=false;
  $('#metric').replaceChildren(new Option('인구 증감 (명)','change'),new Option('인구 증감률 (%)','growth'));
  const cards=document.querySelectorAll('.summary .card');
  cards[1].querySelector('small').textContent='인구 증감률';cards[1].querySelector('span').textContent='시작 시점의 선택 인구 대비 · 시작이 0명이면 산출 불가';
  cards[2].querySelector('small').textContent='지도 연결 · 양 시점 비교 가능';
  $('#population-table').closest('table').querySelectorAll('th')[2].textContent='시작 → 종료 인구 (명)';
  $('#boundary-note').textContent='종료 인구 − 시작 인구를 비교합니다(기간 누적 합산 아님). 동일 코드의 양 시점 자료가 있는 지역만 비교하며, 자료 누락은 0명으로 처리하지 않습니다. 분동·합동·경계 변경은 미보정이므로 실제 인구 변화와 행정구역 개편 효과가 섞일 수 있습니다. 최신 월과 연말을 비교하면 1년 변화가 아닙니다.';
}
const embedded=document.documentElement.classList.contains('embedded')&&parent!==window;
let embedFrame;
function reportParent(){
  if(!embedded)return;
  cancelAnimationFrame(embedFrame);
  embedFrame=requestAnimationFrame(()=>parent.postMessage({type:'population-layout',height:Math.ceil(document.querySelector('main').getBoundingClientRect().height),subtitle:`읍면동별 ${changeMode?'인구 증감':'인구 분포'} · ${choiceLabel()}`,date:state.period?dateLabel():'인구 자료 불러오는 중',loaded:Boolean(data)},location.origin));
}
if(embedded){
  new ResizeObserver(reportParent).observe(document.querySelector('main'));
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='population-visibility')return;
    if(!event.data.visible)stopPlayback();
    else {redrawMap();renderTrend();reportParent();}
  });
}

// Adapter to the same Kakao-only renderer; no dental data or analytical core is loaded.
Object.assign(window,{
  D:[],T:null,S:{metric:'population',metro:false},polys:polygons,escapeHTML:esc,nf:fmt,
  rate:p=>!state.province||String(p.code).startsWith(state.province)?value(String(p.code)):null,
  scaleMax:()=>1,paint:v=>changeMode?changeColor(v,state.metric):color(v,state.metric),
  paintLegend(el){
    if(changeMode){
      const cuts=state.metric==='growth'?[1,5,10]:[100,1000,5000];
      const ranges=[`0 초과~${cuts[0]} 미만`,`${cuts[0]} 이상~${cuts[1]} 미만`,`${cuts[1]} 이상~${cuts[2]} 미만`,`${cuts[2]} 이상`];
      el.innerHTML=`<div class="legend-title">${metricLabel()} (${units()}) · 고정 구간</div><div class="legend-row">${[-1,1].map(sign=>[0,...cuts].map((n,i)=>`<span class="legend-item"><i style="background:${changeColor(sign*(n||.1),state.metric)}"></i>${sign<0?'감소':'증가'} ${ranges[i]}</span>`).join('')).join('')}<span class="legend-item"><i style="background:#f8fafc;border:1px solid #cbd5e1"></i>변화 없음</span><span class="legend-item"><i style="background:#cbd5e1"></i>비교 불가 / 범위 밖</span></div>`;
      return;
    }
    const cuts=thresholds(state.metric);
    el.innerHTML=`<div class="legend-title">${esc(metricLabel())} (${units()}) · 연도 공통 구간</div><div class="legend-row">${COLORS.map((c,i)=>`<span class="legend-item"><i style="background:${c}"></i>${i===0?`0~${fmt(cuts[0])} 미만`:i===cuts.length?`${fmt(cuts[i-1])} 이상`:`${fmt(cuts[i-1])}~${fmt(cuts[i])} 미만`}</span>`).join('')}<span class="legend-item"><i style="background:#cbd5e1"></i>자료 없음 / 범위 밖</span></div>`;
  },
  regionInfo(el,fs,mapState){
    if(state.selected!==mapState.selected){
      state.selected=mapState.selected;
      if(state.selected&&state.province&&!state.selected.startsWith(state.province)){state.province='';$('#province').value='';renderTable();}
      renderSummary();renderTrend();
    }
    renderDetail();
  },
  populationTooltip(f){
    const code=String(f.properties.code),record=data?.records[code];
    return `<strong>${esc(record?.name||f.properties.name)}</strong><br>${esc(dateLabel())}<br>${esc(choiceLabel())}<br>${esc(metricLabel())} <b>${displayValue(value(code))}${value(code)==null?'':units()}</b><br><small>동일 코드 연결 · 과거 경계 미보정</small>`;
  }
});
const mapState={selected:null};
async function getJSON(url){const response=await fetch(url);if(!response.ok)throw Error(`${response.status}: ${url}`);return response.json();}
function getYear(meta){
  if(!yearCache.has(meta.period)){
    const promise=getJSON(meta.file).then(json=>{
      if(json.period!==meta.period||!json.records?.['0000000000'])throw Error('인구 자료의 시점 또는 전국 합계가 맞지 않습니다.');
      return json;
    }).catch(error=>{yearCache.delete(meta.period);throw error;});
    yearCache.set(meta.period,promise);
    if(yearCache.size>3)yearCache.delete(yearCache.keys().next().value);
  }
  return yearCache.get(meta.period);
}
function stopPlayback(){if(playTimer)clearTimeout(playTimer);playTimer=null;$('#play').textContent='연도 재생';$('#play').setAttribute('aria-pressed','false');}
function syncTimeline(){
  const index=manifest.periods.findIndex(p=>p.period===state.period);
  $('#period').value=state.period;$('#year-slider').value=index;
  $('#period-label').textContent=periodLabel(state.period);
  $('#prev-year').disabled=index===0;$('#next-year').disabled=index===manifest.periods.length-1;
}
async function setPeriod(period){
  const token=++revision;state.period=period;
  // Keep start <= end, including when a historical chart point changes the end.
  if(changeMode&&state.startPeriod>period)state.startPeriod=period;
  data=null;startData=null;syncTimeline();$('#start-period').value=state.startPeriod;
  $('#status').textContent=`${dateLabel()} 자료를 불러오는 중입니다…`;
  $('#download').disabled=true;$('#population-table').replaceChildren();$('#table-count').textContent='불러오는 중…';
  renderSummary();renderDetail();renderTrend();redrawMap();
  try{
    const [result,start]=await Promise.all([getYear(currentMeta()),changeMode?getYear(manifest.periods.find(p=>p.period===state.startPeriod)):null]);if(token!==revision)return false;
    data=result;startData=start;populateProvinces();visibleRows=100;render();
    $('#status').textContent=`${dateLabel()} · ${choiceLabel()} · 읍면동 공식 통계${changeMode?' · 동일 연령 구간 비교 (출생 코호트 추적 아님)':''}`;
    $('#download').disabled=false;return true;
  }catch(error){
    if(token!==revision)return false;
    stopPlayback();$('#status').replaceChildren(document.createTextNode('해당 시점의 인구 자료를 불러오지 못했습니다. '));
    const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=()=>setPeriod(period);$('#status').append(retry);
    $('#table-count').textContent='자료 없음 — 불러오기에 실패했습니다.';return false;
  }
}
function populateProvinces(){
  const provinces=Object.entries({...startData?.records,...data.records}).filter(([c])=>c!=='0000000000'&&c.endsWith('00000000'));
  if(state.province&&!provinces.some(([c])=>c.slice(0,2)===state.province))state.province='';
  $('#province').replaceChildren(new Option('전국',''),...provinces.map(([c,r])=>new Option(r.name,c.slice(0,2))));
  $('#province').value=state.province;
}
function baseCode(){return state.selected||(state.province?state.province+'00000000':'0000000000');}
function allLocalRows(){return Object.entries({...startData?.records,...data?.records}).filter(([code])=>isLocal(code)&&(!state.province||code.startsWith(state.province)));}
function renderSummary(){
  reportParent();
  const code=baseCode(),record=data?.records[code];
  $('#scope-label').textContent=record?.name||(code==='0000000000'?'전국':geometryByCode.get(code)?.properties.name||`${code} · 해당 시점 자료 없음`);
  $('#population-count').textContent=data?`${fmt(ageCount(record,state.min,state.max,state.sex))}${record?'명':''}`:'—';
  $('#population-label').textContent=choiceLabel();
  const share=metricValue(record,{...state,metric:'share'});
  $('#population-share').textContent=data?share==null?'자료 없음':`${fmt(share,1)}%`:'—';
  const rows=allLocalRows(),mapped=rows.filter(([c])=>geometryByCode.has(c));
  $('#coverage').textContent=data?`${fmt(mapped.length)} / ${fmt(rows.length)}곳`:'—';
  $('#coverage-note').textContent=`${state.province?'선택 시도':'전국'} 통계 지역 중 보유 경계와 코드가 같은 지역`;
  $('#density-note').hidden=state.metric!=='density';
  const meta=currentMeta();
  $('#source-audit').textContent=meta?`${periodLabel(state.period)} 공식 전국 총인구 ${fmt(meta.nationalTotal)}명. 읍면동 원자료 합계 ${fmt(meta.localTotal)}명${meta.localGap?` (차이 ${fmt(meta.localGap)}명: 원자료 차이를 임의 배분하지 않았습니다)`:' (전국 합계 일치)'}. 전국값은 공식 전국 행을 사용합니다.`:'';
  if(changeMode){
    const change=comparison(code),comparable=mapped.filter(([c])=>comparison(c).count!=null);
    $('#scope-label').textContent=record?.name||startData?.records[code]?.name||$('#scope-label').textContent;
    $('#population-count').textContent=data?`${signed(change.count)}${change.count==null?'':'명'}`:'—';
    $('#population-label').textContent=`${choiceLabel()} · ${fmt(change.before)} → ${fmt(change.after)}명`;
    $('#population-share').textContent=data?`${signed(change.percent,2)}${change.percent==null?'':'%'}`:'—';
    $('#coverage').textContent=data?`${fmt(comparable.length)} / ${fmt(rows.length)}곳`:'—';
    $('#coverage-note').textContent='양 시점 통계 지역 합집합 중 지도 경계 연결 및 양 시점 자료 보유';
    const baseline=manifest?.periods.find(p=>p.period===state.startPeriod);
    if(baseline)$('#source-audit').textContent+=` 시작 ${periodLabel(state.startPeriod)} 공식 전국 총인구 ${fmt(baseline.nationalTotal)}명, 읍면동 원자료 합계 ${fmt(baseline.localTotal)}명 (차이 ${fmt(baseline.localGap)}명). 증감률 = (종료 − 시작) ÷ 시작 × 100. 전국·시도는 각 공식 합계 행을 사용하며 지도에 연결된 읍면동만의 합계가 아닙니다.`;
  }
}
function renderDetail(){
  if(!state.selected){$('#region-info').innerHTML=`<h2>지역을 선택해 보세요</h2><p>지도나 아래 목록에서 읍면동을 선택하면 상세 인구와 연도별 변화를 볼 수 있습니다.</p><p class="muted">${changeMode?'초록은 증가, 빨강은 감소, 흰색은 변화 없음입니다. 회색은 양 시점 비교 불가·증감률 산출 불가·선택 범위 밖인 지역입니다.':'회색은 0명이 아니라 해당 시점 자료가 없거나 선택 범위 밖인 지역입니다.'}</p>`;return;}
  const code=state.selected,record=data?.records[code],name=record?.name||geometryByCode.get(code)?.properties.name||code;
  if(changeMode){
    const change=comparison(code),start=startData?.records[code];
    $('#region-info').innerHTML=`<span class="pill">${esc(dateLabel())}</span><h2 style="margin-top:12px">${esc(record?.name||start?.name||name)}</h2><p>${esc(choiceLabel())}</p><dl><dt>시작 인구</dt><dd>${fmt(change.before)}${change.before==null?'':'명'}</dd><dt>종료 인구</dt><dd>${fmt(change.after)}${change.after==null?'':'명'}</dd><dt>인구 증감</dt><dd>${signed(change.count)}${change.count==null?'':'명'}</dd><dt>인구 증감률</dt><dd>${signed(change.percent,2)}${change.percent==null?'':'%'}</dd></dl><p class="muted">행정기관코드 ${esc(code)} · ${geometryByCode.has(code)?'지도 코드 연결':'경계 미연결'}<br>동일 코드 비교 · 과거 경계 미보정</p>${change.count==null?'<p class="notice">한쪽 시점의 자료가 없어 비교할 수 없습니다. 0명으로 처리하지 않습니다.</p>':change.before===0?'<p class="notice">시작 인구가 0명이므로 증감률을 산출하지 않습니다.</p>':''}${start&&record&&start.name!==record.name?`<p class="notice">명칭 변경: ${esc(start.name)} → ${esc(record.name)}. 행정구역 개편 영향을 확인하세요.</p>`:''}<button id="clear-selection">선택 해제</button>`;
    $('#clear-selection').onclick=()=>selectRegion(null);return;
  }
  const count=ageCount(record,state.min,state.max,state.sex),share=metricValue(record,{...state,metric:'share'}),density=metricValue(record,{...state,metric:'density'},areas.get(code));
  $('#region-info').innerHTML=`<span class="pill">${esc(periodLabel(state.period))}</span><h2 style="margin-top:12px">${esc(name)}</h2><p>${esc(choiceLabel())}</p><dl><dt>선택 인구</dt><dd>${fmt(count)}${count==null?'':'명'}</dd><dt>전체 주민 중 비중</dt><dd>${fmt(share,1)}${share==null?'':'%'}</dd><dt>전체 주민</dt><dd>${fmt(record?.totals[0])}${record?'명':''}</dd><dt>밀도 · 보유 경계면적 기준 참고</dt><dd>${fmt(density,1)}${density==null?'':'명/㎢'}</dd></dl><p class="muted">행정기관코드 ${esc(code)}<br>${geometryByCode.has(code)?'보유 경계와 동일 코드 연결. 과거 경계와 일치 여부는 미확인.':'이 지역 코드에 연결되는 보유 경계가 없습니다. 표와 시계열에서만 표시합니다.'}</p>${!record?'<p class="notice">이 시점에 해당 코드의 원자료가 없습니다. 분동·합동·코드 변경 등의 가능성이 있으며, 0명으로 처리하지 않습니다.</p>':''}<button id="clear-selection">선택 해제</button>`;
  $('#clear-selection').onclick=()=>selectRegion(null);
}
function redrawMap(){if(features.length)draw($('#local-map'),features,[],mapState);}
function selectRegion(code,focus=false){
  state.selected=code;mapState.selected=code;
  if(code&&state.province&&!code.startsWith(state.province)){state.province='';$('#province').value='';}
  renderSummary();renderDetail();renderTrend();
  const controller=activeController();
  if(controller?.map&&(!code||geometryByCode.has(code)))controller.select(code,focus);
  else redrawMap();
}
function filteredRows(){
  const query=$('#region-query').value.trim().toLocaleLowerCase('ko-KR');
  return allLocalRows().filter(([c,r])=>!query||r.name.toLocaleLowerCase('ko-KR').includes(query)||c.includes(query))
    .sort(([ca,ra],[cb,rb])=>{const a=value(ca),b=value(cb),direction=changeMode&&$('#change-order').value==='asc'?-1:1;return a==null?b==null?ra.name.localeCompare(rb.name,'ko'):1:b==null?-1:direction*(b-a)||ra.name.localeCompare(rb.name,'ko');});
}
function renderTable(){
  const rows=filteredRows();$('#metric-heading').textContent=`${metricLabel()} (${units()})`;
  $('#table-count').textContent=`${fmt(rows.length)}곳 · ${Math.min(rows.length,visibleRows)}곳 표시 · ${dateLabel()} · ${choiceLabel()}`;
  const fragment=document.createDocumentFragment();
  for(const[code,record]of rows.slice(0,visibleRows)){
    const tr=document.createElement('tr');
    const change=changeMode?comparison(code):null;
    tr.innerHTML=`<td><button type="button" data-code="${code}">${esc(record.name)}</button></td><td>${displayValue(value(code))}</td><td>${change?`${fmt(change.before)} → ${fmt(change.after)}`:fmt(ageCount(record,state.min,state.max,state.sex))}</td><td>${geometryByCode.has(code)?'코드 연결 · 경계 미보정':'경계 미연결'}</td>`;
    tr.querySelector('button').onclick=()=>selectRegion(code,true);fragment.append(tr);
  }
  $('#population-table').replaceChildren(fragment);$('#more').hidden=rows.length<=visibleRows;
}
async function seriesFor(code){
  if(code==='0000000000')return Object.fromEntries(manifest.periods.map(p=>[p.period,p.national]));
  const group=code.endsWith('00000000')?code.slice(0,2):code.slice(0,5);
  if(!seriesCache.has(group)){
    seriesCache.set(group,getJSON(`data/population/series-${group}.json`).catch(e=>{seriesCache.delete(group);throw e;}));
    if(seriesCache.size>2)seriesCache.delete(seriesCache.keys().next().value);
  }
  return (await seriesCache.get(group))[code]||{};
}
async function renderTrend(){
  if(!manifest)return;
  const token=++trendRevision,code=baseCode();
  $('#trend-status').textContent='연도별 인구를 불러오는 중입니다…';$('#trend-chart').replaceChildren();$('#trend-table').replaceChildren();
  const name=data?.records[code]?.name||geometryByCode.get(code)?.properties.name||(code==='0000000000'?'전국':code);
  $('#trend-title').textContent=`${name} · ${choiceLabel()} 인구 추이`;
  $('#trend-note').textContent=`각 연도 12월 말, 최신 월은 별도 표시. ${code==='0000000000'?'2010·2015년 집계 범위 변경에 유의하세요.':'동일 코드의 원자료 시계열입니다. 경계 변경 미보정, 코드가 없는 연도는 끊어 표시합니다.'}`;
  try{
    const series=await seriesFor(code);if(token!==trendRevision)return;
    const points=manifest.periods.map(p=>({period:p.period,record:series[p.period],count:ageCount(series[p.period],state.min,state.max,state.sex)}));
    $('#trend-status').textContent=changeMode?'추이는 인구수(명), 지도는 두 시점의 차이입니다. 점을 선택하면 종료 시점이 바뀌며 시작보다 이르면 시작도 같은 시점으로 맞춥니다.':'점을 선택하면 해당 연도의 지도로 이동합니다. 추이는 인구수(명) 기준입니다.';
    paintTrend(points);
    $('#trend-table').innerHTML=points.map(p=>`<tr><td>${esc(periodLabel(p.period))}</td><td>${fmt(p.count)}</td><td>${fmt(metricValue(p.record,{...state,metric:'share'}),1)}</td><td>${esc(p.record?.name||'해당 코드 자료 없음')}</td></tr>`).join('');
  }catch{
    if(token!==trendRevision)return;
    $('#trend-status').replaceChildren(document.createTextNode('연도별 자료를 불러오지 못했습니다. '));
    const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=renderTrend;$('#trend-status').append(retry);
  }
}
function paintTrend(points){
  const values=points.map(p=>p.count).filter(v=>v!=null),max=Math.max(1,...values);
  const W=Math.max(320,$('#trend-chart').clientWidth||1000),H=220,left=70,right=35,top=20,bottom=40;
  const x=i=>left+i*(W-left-right)/Math.max(1,points.length-1),y=n=>H-bottom-n/max*(H-top-bottom);
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc($('#trend-title').textContent)}. 세부 수치는 아래 표에서 확인할 수 있습니다.">`;
  for(let i=0;i<4;i++){const n=max*i/3;svg+=`<line x1="${left}" x2="${W-right}" y1="${y(n)}" y2="${y(n)}" stroke="#e6ecf3"/><text x="${left-8}" y="${y(n)+4}" text-anchor="end">${fmt(n)}</text>`;}
  let previous=null;
  points.forEach((p,i)=>{
    if(p.count!=null){
      if(previous!==null)svg+=`<line x1="${x(previous)}" y1="${y(points[previous].count)}" x2="${x(i)}" y2="${y(p.count)}" stroke="#2563eb" stroke-width="2.5" ${p.period.endsWith('-12')?'':'stroke-dasharray="5 4"'}/>`;
      svg+=`<g class="chart-point ${p.period===state.period?'selected':''}" tabindex="0" role="button" data-period="${p.period}" aria-label="${esc(periodLabel(p.period))}, ${fmt(p.count)}명"><title>${esc(periodLabel(p.period))}: ${fmt(p.count)}명</title><circle cx="${x(i)}" cy="${y(p.count)}" r="11" fill="transparent"/><circle cx="${x(i)}" cy="${y(p.count)}" r="4" fill="#2563eb"/></g>`;previous=i;
    }else previous=null;
    if(i%(W<600?5:2)===0||i===points.length-1)svg+=`<text x="${x(i)}" y="${H-14}" text-anchor="middle">${p.period.endsWith('-12')?p.period.slice(0,4):p.period.replace('-','.')}</text>`;
  });
  if(!values.length)svg+=`<text x="500" y="105" text-anchor="middle">해당 코드의 인구 자료가 없습니다.</text>`;
  $('#trend-chart').innerHTML=svg+'</svg>';
  $('#trend-chart').querySelectorAll('[data-period]').forEach(el=>{
    const select=()=>{stopPlayback();setPeriod(el.dataset.period);};el.onclick=select;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}};
  });
}
function render(){renderSummary();renderDetail();renderTable();renderTrend();redrawMap();}
function updateFilters(){
  state.sex=Number($('#sex').value);state.metric=$('#metric').value;
  if($('#age-preset').value!=='custom') [state.min,state.max]=$('#age-preset').value.split(',').map(Number);
  else {state.min=Number($('#age-min').value);state.max=Number($('#age-max').value);}
  $('#age-min').value=state.min;$('#age-max').value=state.max;$('#custom-ages').hidden=$('#age-preset').value!=='custom';
  visibleRows=100;render();if(data)$('#status').textContent=`${dateLabel()} · ${choiceLabel()} · 읍면동 공식 통계${changeMode?' · 동일 연령 구간 비교 (출생 코호트 추적 아님)':''}`;
}
for(let age=0;age<=100;age++){const label=age===100?'100세 이상':`${age}세`;$('#age-min').add(new Option(label,age));$('#age-max').add(new Option(label,age));}$('#age-max').value=100;
['#age-preset','#sex','#metric'].forEach(id=>$(id).onchange=updateFilters);
$('#age-min').onchange=()=>{if(Number($('#age-min').value)>Number($('#age-max').value))$('#age-max').value=$('#age-min').value;updateFilters();};
$('#age-max').onchange=()=>{if(Number($('#age-max').value)<Number($('#age-min').value))$('#age-min').value=$('#age-max').value;updateFilters();};
$('#period').onchange=()=>{stopPlayback();setPeriod($('#period').value);};
$('#start-period').onchange=()=>{state.startPeriod=$('#start-period').value;setPeriod(state.period<state.startPeriod?state.startPeriod:state.period);};
$('#change-order').onchange=()=>{visibleRows=100;renderTable();};
$('#year-slider').oninput=()=>{stopPlayback();setPeriod(manifest.periods[Number($('#year-slider').value)].period);};
for(const[id,offset]of [['#prev-year',-1],['#next-year',1]])$(id).onclick=()=>{stopPlayback();const index=manifest.periods.findIndex(p=>p.period===state.period);if(manifest.periods[index+offset])setPeriod(manifest.periods[index+offset].period);};
$('#play').onclick=()=>{
  if(playTimer){stopPlayback();return;}
  $('#play').textContent='재생 중지';$('#play').setAttribute('aria-pressed','true');
  const next=async()=>{let index=manifest.periods.findIndex(p=>p.period===state.period)+1;if(index>=manifest.periods.length)index=0;const ok=await setPeriod(manifest.periods[index].period);if(ok&&$('#play').getAttribute('aria-pressed')==='true')playTimer=setTimeout(next,1800);};
  playTimer=setTimeout(next,100);
};
$('#province').onchange=()=>{state.province=$('#province').value;state.selected=null;mapState.selected=null;visibleRows=100;render();};
$('#region-query').oninput=()=>{visibleRows=100;renderTable();};$('#more').onclick=()=>{visibleRows+=100;renderTable();};
$('#clear-region').onclick=()=>{state.province='';$('#province').value='';selectRegion(null);renderTable();redrawMap();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPlayback();});
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(renderTrend,120);});
let exportURL;
$('#download').onclick=()=>{
  if(!data)return;
  const payload={source:manifest.source,boundary:manifest.boundary,period:state.period,filters:{...state,query:$('#region-query').value},shareDenominator:'전체 주민 (남녀 전체·전 연령)',densityBasis:'보유 단순화 경계의 구면 계산 면적 · 과거 경계 미보정 참고값',rows:filteredRows().map(([code,r])=>({code,name:r.name,population:ageCount(r,state.min,state.max,state.sex),totalPopulation:r.totals[0],value:value(code),unit:units(),mapped:geometryByCode.has(code)}))};
  if(changeMode){
    delete payload.shareDenominator;delete payload.densityBasis;
    payload.startPeriod=state.startPeriod;payload.endPeriod=state.period;
    payload.formula='종료 인구 − 시작 인구; 증감률 = (종료 − 시작) / 시작 × 100';
    payload.comparisonBasis='동일 코드·동일 연령 구간. 과거 경계 미보정; 누락은 null, 시작이 0명이면 증감률 null.';
    payload.rows=filteredRows().map(([code,r])=>({code,name:r.name,startName:startData?.records[code]?.name??null,endName:data?.records[code]?.name??null,...comparison(code),value:value(code),unit:units(),mapped:geometryByCode.has(code)}));
  }
  const text=JSON.stringify(payload,null,2);
  if(exportURL)URL.revokeObjectURL(exportURL);
  exportURL=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  $('#export-text').value=text;
  $('#export-description').textContent=`${dateLabel()} · ${choiceLabel()} · ${metricLabel()} · ${payload.rows.length}개 지역 · 생성 시점의 선택 조건입니다.`;
  const link=$('#export-link');link.href=exportURL;link.download=`population-${changeMode?state.startPeriod+'-to-':''}${state.period}-${state.min}-${state.max}-${state.sex}-${state.metric}.json`;
  $('#export-panel').hidden=false;$('#export-panel').scrollIntoView({behavior:'smooth',block:'nearest'});
};
async function init(){
  try{
    manifest=await getJSON('data/population/manifest.json');
    if(!manifest.periods?.length)throw Error('등록된 인구 자료가 없습니다.');
    $('#period').replaceChildren(...manifest.periods.map(p=>new Option(periodLabel(p.period),p.period)));
    $('#start-period').replaceChildren(...manifest.periods.map(p=>new Option(periodLabel(p.period),p.period)));
    $('#year-slider').max=manifest.periods.length-1;$('#year-slider').disabled=false;$('#filters').disabled=false;$('#play').disabled=false;
    // Render statistics independently if the larger map boundary request fails.
    const yearEnds=manifest.periods.filter(p=>p.period.endsWith('-12'));
    state.startPeriod=(yearEnds.at(-2)||manifest.periods[0]).period;
    const periodLoad=setPeriod((changeMode?(yearEnds.at(-1)||manifest.periods.at(-1)):manifest.periods.at(-1)).period);
    try{
      const boundaries=await getJSON(manifest.boundary.file);features=boundaries.features;
      geometryByCode=new Map(features.map(f=>[String(f.properties.code),f]));areas=new Map(features.map(f=>[String(f.properties.code),areaKm2(f.geometry)]));
      render();
    }catch{$('#local-map').textContent='읍면동 경계를 불러오지 못했습니다. 통계와 시계열은 계속 이용할 수 있습니다. 새로고침하면 다시 시도합니다.';}
    await periodLoad;
  }catch{ $('#status').innerHTML='인구 자료 목록을 불러오지 못했습니다. <button id="reload">새로고침</button>';$('#reload').onclick=()=>location.reload(); }
}
init();
