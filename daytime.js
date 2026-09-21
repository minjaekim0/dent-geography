import {PROVINCES,observation,metricValue,difference,regionKey} from './daytime-model.mjs';
import {polygons,changeColor,COLORS} from './population-model.mjs';
import {createAdminHistory,censusComparable} from './admin-history-model.mjs?v=admin-1';
const $=s=>document.querySelector(s),fmt=(v,d=0)=>v==null?'자료 없음':v.toLocaleString('ko-KR',{maximumFractionDigits:d});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const signed=v=>v==null?'비교 불가':`${v>0?'+':''}${fmt(v)}`;
const changeMode=new URLSearchParams(location.search).get('mode')==='change';
const state={year:2020,baseline:2015,sex:'0',age:'합계',metric:changeMode?'change':'daytime',key:'전국'};
if(changeMode){
  document.title='공식 주간인구 증감';
  $('header h1').innerHTML='공식 주간인구 증감 <span>카카오맵</span>';
  $('#year-label').textContent='종료 조사연도';$('#baseline-label').textContent='시작 조사연도';
  $('#metric').replaceChildren(new Option('주간인구 증감 (명)','change'));
  $('#map').setAttribute('aria-label','시군구 주간인구 증감 지도');
}
const mapState={selected:null};let admin,dataset,features=[],byYear={},mapKeys=new Map(),resize;
const labels={daytime:'주간인구',index:'주간인구지수',net:'통근·통학 순유입',change:'주간인구 증감'};
const row=(year,key=state.key)=>observation(byYear[year]?.get(key),state.sex,state.age);
const comparable=(a,b,key)=>censusComparable(byYear[a]?.get(key),byYear[b]?.get(key),admin);
const deltaValue=key=>comparable(state.baseline,state.year,key)?difference(row(state.baseline,key)?.daytime,row(state.year,key)?.daytime):null;
const val=key=>state.metric==='change'?deltaValue(key):metricValue(row(state.year,key),state.metric);
const nameHistory=key=>admin?.registry.events.filter(e=>e.pairs.some(p=>admin.nameKey(p.beforeName)===key)||e.names?.some(p=>admin.nameKey(p[0])===key))||[];
function mapValue(feature){
  const key=mapKeys.get(String(feature.properties.code));
  // Boundary and KOSIS codes are DIFFERENT coding systems (many county codes
  // differ by 200). Compare continuity within KOSIS, never across namespaces.
  const reference=byYear[dataset.years.at(-1)]?.get(key);
  if(!censusComparable(byYear[state.year]?.get(key),reference,admin))return null;
  if(state.metric==='change'&&!censusComparable(byYear[state.baseline]?.get(key),reference,admin))return null;
  return val(key);
}
const display=v=>['change','net'].includes(state.metric)?signed(v):fmt(v,state.metric==='index'?1:0);
const unit=()=>state.metric==='index'?'%':'명';
const choice=()=>`${state.age==='합계'?'전체 연령':state.age} · ${['전체','남자','여자'][Number(state.sex)]}`;
const cuts=()=>state.metric==='index'?[50,75,90,100,110,125,150]:[10000,30000,50000,100000,200000,500000,1000000];
const paint=v=>v==null?'#cbd5e1':['net','change'].includes(state.metric)?changeColor(v):COLORS[cuts().filter(t=>v>=t).length];
function report(){if(parent!==window)requestAnimationFrame(()=>parent.postMessage({type:'population-layout',height:Math.ceil($('main').getBoundingClientRect().height),loaded:Boolean(dataset),subtitle:`시군구별 공식 ${labels[state.metric]} · ${choice()} · 조사연도별 비교`,date:state.metric==='change'?`${state.baseline}년 → ${state.year}년 조사`:`${state.year}년 조사`},location.origin));}
Object.assign(window,{D:[],T:null,S:{metric:'daytime',metro:false},SIDO_PREFIX:Object.fromEntries(Object.entries(PROVINCES).map(([k,v])=>[v,k])),polys:polygons,escapeHTML:esc,nf:fmt,
  rate:p=>mapValue({properties:p}),scaleMax:()=>1,paint,
  paintLegend(el){
    if(['net','change'].includes(state.metric)){el.innerHTML=`<div class="legend-title">${labels[state.metric]} (명) · 고정 구간</div><div class="legend-row">${[-5000,-1000,-100,-1,0,1,100,1000,5000].map(v=>`<span class="legend-item"><i style="background:${paint(v)}"></i>${v===0?'변화 없음':`${v<0?'감소':'증가'} ${fmt(Math.abs(v))}${Math.abs(v)===1?'~99':Math.abs(v)===100?'~999':Math.abs(v)===1000?'~4,999':' 이상'}`}</span>`).join('')}<span>회색: 비교 불가</span></div>`;return;}
    const t=cuts();el.innerHTML=`<div class="legend-title">${labels[state.metric]} (${unit()}) · 연도 공통 구간</div><div class="legend-row">${COLORS.map((c,i)=>`<span class="legend-item"><i style="background:${c}"></i>${i===0?`${fmt(t[0])} 미만`:i===t.length?`${fmt(t[i-1])} 이상`:`${fmt(t[i-1])}~${fmt(t[i])} 미만`}</span>`).join('')}<span>회색: 자료 없음</span></div>`;
  },
  regionInfo(el,fs,ms){if(ms.selected&&mapKeys.get(ms.selected)!==state.key){state.key=mapKeys.get(ms.selected);$('#stat-region').value=state.key;renderStats();}renderDetail();},
  populationTooltip(f){const value=mapValue(f);return `<strong>${esc(f.properties.name)}</strong><br>${state.year}년 · ${esc(choice())}<br>${labels[state.metric]} ${display(value)}${value==null?'':unit()}<br>현재 보유 경계 · 과거 경계 미보정`;}
});
async function json(path){const r=await fetch(path);if(!r.ok)throw Error(`${r.status} ${path}`);return r.json();}
function renderDetail(){
  const r=row(state.year),record=byYear[state.year]?.get(state.key),name=record?.fullName||state.key;
  $('#detail').innerHTML=`<span class="pill">${state.year}년 인구총조사</span><h2 style="margin-top:12px">${esc(name)}</h2><p>${esc(choice())}</p><dl>${[['주간인구',r?.daytime],['상주인구',r?.resident],['통근·통학 유입',r?.inflow],['통근·통학 유출',r?.outflow]].map(([name,v])=>`<dt>${name}</dt><dd>${fmt(v)}${v==null?'':'명'}</dd>`).join('')}</dl><p class="muted">${record?`원자료 지역코드 ${esc(record.sourceCode)}. `:'이 시점의 지역명 또는 연령 구간 자료가 없습니다. '}상하위 지역 중복 합산 금지. 과거 경계는 미보정입니다.</p>`;
  const changes=nameHistory(state.key);
  if(changes.length)$('#detail').insertAdjacentHTML('beforeend',`<p class="notice">행정구역 변경 연결: ${changes.map(e=>`${esc(e.effective)} ${esc(e.title)}`).join(' / ')}<br><a href="admin-history.html" target="_blank" rel="noopener">공식 변경 근거 보기</a></p>`);
  if(row(state.baseline)&&r&&!comparable(state.baseline,state.year,state.key))$('#detail').insertAdjacentHTML('beforeend','<p class="notice">양 시점의 지역 코드는 다르지만 동일 구역의 명칭 변경으로 확인되지 않았습니다. 분할·통합 또는 구역 변경의 가능성이 있어 증감을 계산하지 않습니다.</p>');
}
function renderTrend(){
  const points=dataset.years.map(year=>({year,row:row(year)})),W=800,H=210,max=Math.max(1,...points.map(p=>p.row?.daytime??0)),x=i=>85+i*220,y=n=>175-n/max*145;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="조사연도별 주간인구. 아래 표에 상세 수치.">`;
  for(let i=0;i<=3;i++)svg+=`<line x1="75" x2="760" y1="${y(max*i/3)}" y2="${y(max*i/3)}" stroke="#dbe3ec"/><text x="65" y="${y(max*i/3)+4}" text-anchor="end">${fmt(max*i/3)}</text>`;
  points.forEach((p,i)=>{const n=p.row?.daytime;svg+=`<text x="${x(i)}" y="202" text-anchor="middle">${p.year}</text>`;if(n==null)return;
    if(i&&points[i-1].row?.daytime!=null&&comparable(points[i-1].year,p.year,state.key))svg+=`<line x1="${x(i-1)}" x2="${x(i)}" y1="${y(points[i-1].row.daytime)}" y2="${y(n)}" stroke="#2563eb" stroke-dasharray="5 4"/>`;
    svg+=`<circle cx="${x(i)}" cy="${y(n)}" r="5" fill="#2563eb"><title>${p.year}: ${fmt(n)}명</title></circle>`;
  });
  $('#trend-chart').innerHTML=svg+'</svg>';
  $('#trend-title').textContent=`${byYear[state.year]?.get(state.key)?.fullName||state.key} · ${choice()} 주간인구 추이`;
  $('#trend-table').innerHTML=points.map(p=>`<tr><td>${p.year}년</td>${['resident','inflow','outflow','daytime'].map(k=>`<td>${fmt(p.row?.[k])}</td>`).join('')}<td>${fmt(metricValue(p.row,'index'),1)}</td></tr>`).join('');
}
function renderStats(){
  const r=row(state.year);$('#scope').textContent=byYear[state.year]?.get(state.key)?.fullName||state.key;
  $('#count').textContent=`${fmt(r?.daytime)}${r?.daytime==null?'':'명'}`;$('#choice').textContent=`${state.year}년 · ${choice()}`;
  $('#index').textContent=metricValue(r,'index')==null?'자료 없음':`${fmt(metricValue(r,'index'),1)}%`;
  const delta=deltaValue(state.key);$('#delta').textContent=signed(delta)+(delta==null?'':'명');
  $('#delta-label').textContent=`${state.baseline} → ${state.year}년 주간인구 증감`;
  const count=features.filter(f=>mapValue(f)!=null).length;
  $('#coverage').textContent=`지도 연결 ${count} / ${features.length}곳 · 경계 미보정`;
  renderDetail();renderTrend();report();
}
function select(key,focus=false){
  state.key=key;$('#stat-region').value=key;
  mapState.selected=[...mapKeys].find(([,k])=>k===key)?.[0]??null;
  renderStats();
  const controller=activeController();if(controller?.map)controller.select(mapState.selected,focus);else redraw();
}
function renderTable(){
  const query=$('#query').value.trim(),records=[...byYear[state.year]].filter(([key,r])=>!query||r.fullName.includes(query)||nameHistory(key).some(e=>e.title.includes(query)));
  $('#table-count').textContent=`${records.length}개 공식 지역 · ${labels[state.metric]} (${unit()})`;
  const fragment=document.createDocumentFragment();
  const visibleKeys=new Set(features.filter(f=>mapValue(f)!=null).map(f=>mapKeys.get(String(f.properties.code))));
  for(const[key,r]of records){const tr=document.createElement('tr'),v=val(key);tr.innerHTML=`<td><button>${esc(r.fullName)}</button></td><td>${display(v)}</td><td>${fmt(row(state.year,key)?.daytime)}</td><td>${visibleKeys.has(key)?'명칭 연결 · 경계 미보정':'지도 미표시 (통계·추이 확인)'}</td>`;tr.querySelector('button').onclick=()=>select(key,true);fragment.append(tr);}
  $('#rows').replaceChildren(fragment);report();
}
function redraw(){if(features.length)draw($('#map'),features,[],mapState);}
function render(){renderStats();renderTable();redraw();$('#status').textContent=`${state.metric==='change'?`${state.baseline}년 → ${state.year}년 · 종료 주간인구 − 시작 주간인구`:`${state.year}년 공식 관측값`} · ${choice()} · 중간 연도 보간 없음`;}
function sync(){
  if(state.baseline>state.year)state.baseline=state.year;$('#baseline').value=state.baseline;
  const ages=dataset.periods[state.year].ages;
  if(!ages.includes(state.age))state.age='합계';
  $('#age').replaceChildren(...ages.map(a=>new Option(a==='합계'?'전체 연령':a,a)));$('#age').value=state.age;
  // Keep missing historical names selectable so a graph never silently changes region.
  const all=new Map(dataset.years.flatMap(y=>[...byYear[y]]));
  $('#stat-region').replaceChildren(...[...all].sort(([a],[b])=>a==='전국'?-1:b==='전국'?1:a.localeCompare(b,'ko')).map(([key,r])=>new Option(r.fullName,key)));
  $('#stat-region').value=state.key;
}
$('#year').onchange=()=>{state.year=Number($('#year').value);sync();render();};
$('#baseline').onchange=()=>{state.baseline=Number($('#baseline').value);if(state.baseline>state.year){state.year=state.baseline;$('#year').value=state.year;}sync();render();};
for(const id of ['metric','sex','age'])$('#'+id).onchange=()=>{state[id]=$('#'+id).value;render();};
$('#stat-region').onchange=()=>select($('#stat-region').value,true);$('#query').oninput=renderTable;
window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='population-visibility'&&e.data.visible&&dataset){redraw();report();}});
new ResizeObserver(()=>{clearTimeout(resize);resize=setTimeout(report,80);}).observe($('main'));
async function init(){
  try{
    const [stats,registry]=await Promise.all([json('data/daytime-history.json'),json('data/admin-history.json?v=admin-1')]);
    dataset=stats;admin=createAdminHistory(registry);
    for(const y of dataset.years){
      byYear[y]=new Map(Object.entries(dataset.periods[y].records).map(([code,r])=>[admin.nameKey(r.fullName),{...r,sourceCode:code}]));
      if(byYear[y].size!==Object.keys(dataset.periods[y].records).length)throw Error('중복 지역명');
    }
    for(const id of ['year','baseline'])$('#'+id).replaceChildren(...dataset.years.map(y=>new Option(`${y}년`,y)));
    state.year=dataset.years.at(-1);state.baseline=dataset.years.at(-2)??state.year;$('#year').value=state.year;
    sync();$('#filters').disabled=false;
    $('#sources').innerHTML=dataset.years.map(y=>`<a href="${dataset.periods[y].url}" target="_blank" rel="noopener">${y}년 KOSIS 원표</a>`).join(' · ');
    $('#audit').textContent=`공식 원표 ${dataset.years.length}개, ${Object.values(dataset.periods).reduce((n,p)=>n+p.rows,0).toLocaleString()}개 지역·성별·연령 관측값. 2005년 구성항목 산식과 주간인구가 다른 원자료 ${dataset.periods[2005].identityDifferences}행(최대 ${dataset.periods[2005].maxIdentityDifference}명)은 원값을 유지했습니다. 2025년 자료는 이 데이터셋에 포함되어 있지 않습니다.`;
    render();
    try{features=(await json('data/district-boundaries.json')).features;mapKeys=new Map(features.map(f=>[String(f.properties.code),admin.nameKey(regionKey(f))]));render();}
    catch{$('#map').textContent='지도 경계를 불러오지 못했습니다. 통계표와 시계열은 이용할 수 있습니다.';}
  }catch(error){$('#status').textContent=`주간인구 자료를 불러오지 못했습니다. 새로고침해 주세요. (${error.message})`;}
}
init();
