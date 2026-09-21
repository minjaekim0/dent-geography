// Generated from legacy/index.html. The analytical calculations are shared; map rendering is Kakao-only.


let FH=null,facilityYear=2026,facilityScale='count',facilityDrag=null,facilityFrame=null,facilityPending=null;
const isFacilityHistory=()=>S.metric==='dentalFacilities'&&!!FH;
const facilitySnapshot=()=>FH?.years[facilityYear];
const facilityDateLabel=()=>{const date=facilitySnapshot()?.asOf;return date?date.slice(0,4)+'년 '+Number(date.slice(5,7))+'월':'2026년 6월'};
const facilityValue=p=>facilitySnapshot()?.[String(p.code).length===5?'district':'local']?.[p.code]??0;
function renderFacilityHistory(){
if(!FH)return;
document.querySelector('#facility-selection').textContent=facilityDateLabel()+' 현황';
document.querySelectorAll('[data-facility-year]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.facilityYear)===facilityYear));
const years=Object.keys(FH.years).map(Number);
document.querySelector('#facility-prev').disabled=facilityYear===Math.min(...years);
document.querySelector('#facility-next').disabled=facilityYear===Math.max(...years);
const d=facilitySnapshot();
document.querySelector('#facility-note').textContent=FH.notes+' '+facilityDateLabel()+' 전체 '+nf(d.total)+'곳, 시군구 연결 '+nf(d.coverage.district)+'곳, 읍면동 연결 '+nf(d.coverage.local)+'곳. 위치 미연결 기관은 지역 집계에서 제외합니다.';
document.querySelector('#facility-rate-note').hidden=facilityScale!=='rate';
}
function selectFacilityYear(value){
if(!FH?.years[value])return;
facilityYear=Number(value);renderFacilityHistory();redraw(true);
}
function cancelFacilityFrame(){if(facilityFrame!==null)cancelAnimationFrame(facilityFrame);facilityFrame=null;facilityPending=null}
function queueFacilityYear(value){
facilityPending=value;if(facilityFrame!==null)return;
facilityFrame=requestAnimationFrame(()=>{facilityFrame=null;const target=facilityPending;facilityPending=null;if(target!==facilityYear)selectFacilityYear(target)});
}
function setupFacilityChart(){
const chart=document.querySelector('#facility-trend'),entries=Object.entries(FH.years),max=Math.max(...entries.map(([,d])=>d.total));
chart.innerHTML=entries.map(([year,d])=>'<button class="trend-year" data-facility-year="'+year+'" aria-pressed="false" title="'+d.asOf+' · '+nf(d.total)+'곳"><span class="facility-chart-total">'+nf(d.total)+'곳</span><span class="trend-bar" style="height:'+d.total/max*65+'px;background:#0b5277"></span><small>'+year+(d.asOf.slice(5,7)==='12'?'년 말':'년 '+Number(d.asOf.slice(5,7))+'월')+'</small></button>').join('');
const atX=x=>{const buttons=[...chart.querySelectorAll('[data-facility-year]')];return +buttons.reduce((a,b)=>Math.abs(b.getBoundingClientRect().x+b.getBoundingClientRect().width/2-x)<Math.abs(a.getBoundingClientRect().x+a.getBoundingClientRect().width/2-x)?b:a).dataset.facilityYear};
chart.onpointerdown=e=>{if(e.button!==0)return;const b=e.target.closest('[data-facility-year]');if(!b)return;facilityDrag={id:e.pointerId,last:+b.dataset.facilityYear};chart.setPointerCapture(e.pointerId);selectFacilityYear(facilityDrag.last)};
chart.onpointermove=e=>{if(!facilityDrag||facilityDrag.id!==e.pointerId)return;facilityDrag.last=atX(e.clientX);queueFacilityYear(facilityDrag.last)};
chart.onpointerup=e=>{if(!facilityDrag||facilityDrag.id!==e.pointerId)return;const value=facilityDrag.last;facilityDrag=null;cancelFacilityFrame();chart.releasePointerCapture(e.pointerId);selectFacilityYear(value)};
chart.onpointercancel=()=>{facilityDrag=null;cancelFacilityFrame()};
chart.onclick=e=>{const b=e.target.closest('[data-facility-year]');if(b&&e.detail===0)selectFacilityYear(+b.dataset.facilityYear)};
for(const [id,delta] of [['facility-prev',-1],['facility-next',1]])document.querySelector('#'+id).onclick=()=>{const years=entries.map(([y])=>+y);selectFacilityYear(years[years.indexOf(facilityYear)+delta])};
document.querySelector('#facility-scale').onchange=e=>{facilityScale=e.target.value;renderFacilityHistory();redraw()};
document.querySelector('#facility-scale').disabled=false;
document.querySelector('#facility-help').textContent='연도를 클릭하거나 드래그하세요. 2023–2025년은 연말, 2026년은 6월 현황입니다.';
renderFacilityHistory();
}

const S={metric:'dentalFacilities',eventKind:'net',denom:'resident',specialty:'__TOTAL__',specialtyScale:'count'},M={net:['개원 − 폐업 순증감','곳',null],specialty:['전체 과목 전문의 수 (복수자격 포함)','명',null],dentalFacilities:['치과기관 수','곳','orthodonticFacilities'],dentalDentists:['치과의사 수','명','orthodonticDentists'],openings:['신규개원','곳',null],closures:['폐업','곳',null]},nf=n=>new Intl.NumberFormat('ko-KR').format(n||0),key=s=>(s||'').replace(/\s+/g,''),isEvent=()=>['openings','closures','net'].includes(S.metric),isSpecialty=()=>S.metric==='specialty',isCount=()=>isEvent()||(isFacilityHistory()&&facilityScale==='count')||(isSpecialty()&&S.specialtyScale==='count'),v=p=>isFacilityHistory()?facilityValue(p):S.metric==='net'?(p.openings||0)-(p.closures||0):isSpecialty()?(p.specialties?.counts?.[S.specialty]||0):(p[S.metric]||0),base=p=>S.denom==='daytime'?p.daytimePopulation:p.population,dname=()=>S.denom==='daytime'?'주간인구 (2020)':'주민등록 인구',rate=p=>isCount()?v(p):(base(p)?v(p)/base(p)*1e4:null),polys=g=>g.type==='Polygon'?[g.coordinates]:g.coordinates,coords=g=>polys(g).flatMap(x=>x.flat());

const signed=n=>n>0?'+'+nf(n):n<0?'−'+nf(-n):'0';
const COLOR_MIN=0,scaleMax=F=>{let values=F.map(f=>S.metric==='net'?Math.abs(rate(f.properties)):rate(f.properties)).filter(x=>x!=null&&x>0).sort((a,b)=>a-b);if(!values.length)return 1;let value=values[Math.floor((values.length-1)*(isEvent()?.95:.9))];return value>=10?Math.ceil(value):Math.ceil(value*2)/2},paint=(x,max)=>{if(x===0)return '#ffffff';if(S.metric==='net'){const t=Math.min(1,Math.abs(x)/max),a=[255,255,255],b=x<0?[181,43,43]:[17,112,54];return 'rgb('+a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')+')'}let t=Math.max(0,Math.min(1,(x-COLOR_MIN)/(max-COLOR_MIN)))*2,i=Math.min(1,Math.floor(t)),stops=isEvent()?(S.metric==='openings'?[[255,255,255],[89,190,120],[17,112,54]]:[[255,255,255],[238,127,127],[181,43,43]]):[[255,255,255],[79,174,195],[7,61,98]],a=stops[i],b=stops[i+1];
return'rgb('+a.map((n,j)=>Math.round(n+(b[j]-n)*(t-i))).join(',')+')'},mc=n=>({서울1호선:'#0052a4',서울2호선:'#00a84d',서울3호선:'#ef7c1c',서울4호선:'#00a5de',서울5호선:'#996cac',서울6호선:'#cd7c2f',서울7호선:'#747f00',서울8호선:'#e6186c',서울9호선:'#bb8336',부산1호선:'#f06a00',부산2호선:'#7ac143',부산3호선:'#bb8cce',부산4호선:'#1d9bb7',대구1호선:'#d93a46',대구2호선:'#00a54f',대구3호선:'#f5a900',대전1호선:'#007448',광주1호선:'#009088',인천1호선:'#7ca8d6',인천2호선:'#f06a2e',부산김해경전철:'#7c5db6',경강선:'#003da5',경의중앙선:'#77c4a3',경춘선:'#00a4e3',공항철도:'#0090d8',김포골드라인:'#a17800',서해선:'#8fc31f',수인분당선:'#f5c700',신분당선:'#d4003b',용인에버라인:'#6fb245',우이신설선:'#b7c452',의정부경전철:'#f58b39'}[n]||'#586b78');


const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function regionInfo(el,F,state){
const level=el.id==='local-map'?'local':'district',aside=document.querySelector('#'+level+' aside');
let card=aside.querySelector('.region-info');
if(!card){card=document.createElement('section');card.className='region-info';card.setAttribute('aria-label','선택 지역 정보');card.setAttribute('aria-live','polite');aside.prepend(card)}
const f=F.find(f=>String(f.properties.code)===state.selected);
if(!f){card.innerHTML='<h2>지역 정보</h2><p>지도에서 행정구역을 클릭하면<br>해당 지역의 현황을 볼 수 있습니다.</p>';return}
const p=f.properties,sourceName=level==='district'?((Object.entries(SIDO_PREFIX).find(([,code])=>String(p.code).startsWith(code))||[])[0]||'')+' '+p.name:p.name,fullName=globalThis.adminDisplayName?.(sourceName)??sourceName;
const row=(label,value)=>'<div><dt>'+escapeHTML(label)+'</dt><dd>'+escapeHTML(value)+'</dd></div>';
const number=(value,unit)=>value==null?'자료 없음':nf(value)+unit;
const per=(value,pop)=>value==null||!pop?'산출 불가':(value/pop*1e4).toFixed(2)+M[S.metric][1];
let rows='';
if(isEvent()){
rows+=row('신규개원','+'+nf(p.openings)+'곳')+row('폐업','−'+nf(p.closures)+'곳')+row('순증감',signed((p.openings||0)-(p.closures||0))+'곳');
}else if(isFacilityHistory()){
rows+=row('치과기관 ('+facilityDateLabel()+')',nf(v(p))+'곳')+row('주민등록 인구 1만 명당',per(v(p),p.population));
if(level==='district')rows+=row('주간인구 1만 명당',per(v(p),p.daytimePopulation));
}else{
rows+=row('치과기관',number(p.dentalFacilities,'곳'))+row('치과의사',number(p.dentalDentists,'명'));
if(SP&&p.specialties)rows+=row('전문자격 합계 (중복 포함)',nf(p.specialties.counts.__TOTAL__)+'명')+row('통합치의학과 제외',nf(p.specialties.counts.__WITHOUT_GENERAL__)+'명');
rows+=row('주민등록 인구 1만 명당',per(v(p),p.population));
if(level==='district')rows+=row('주간인구 1만 명당',per(v(p),p.daytimePopulation));
}
rows+=row(isFacilityHistory()?'주민등록 인구 (2026.6)':'주민등록 인구',number(p.population,'명'));
if(level==='district')rows+=row('주간인구 (2020)',number(p.daytimePopulation,'명'));
const selectedValue=rate(p),headline=isEvent()?(S.metric==='net'?signed(v(p)):nf(v(p)))+'곳':isCount()?nf(v(p))+M[S.metric][1]:selectedValue==null?'산출 불가':selectedValue.toFixed(2)+M[S.metric][1];
card.innerHTML='<div class="region-heading"><h2>'+escapeHTML(fullName.trim())+'</h2><button type="button" aria-label="지역 선택 해제">×</button></div><p class="region-period">'+escapeHTML(isEvent()?periodLabel()+' · 지도 연결 기록':isFacilityHistory()?facilityDateLabel()+' 현황':'2026년 6월 기관 목록 기준')+'</p><div class="region-primary"><span>'+escapeHTML((isCount()?'':'인구 1만 명당 · ')+M[S.metric][0])+'</span><strong>'+headline+'</strong></div><dl>'+rows+'</dl>'+
(isSpecialty()&&SP?'<details class="region-specialties"><summary>과목별 전문의 수</summary><dl>'+SP.specialties.map(s=>row(s,nf(p.specialties?.counts?.[s]||0)+'명')).join('')+'</dl></details>':'')+
'<p class="region-footnote">'+(isEvent()?'선택 기간에 이 지역으로 연결된 기록입니다. 미배정 기록은 포함하지 않습니다.':isFacilityHistory()?'개원가 기준. 현재 배포 경계에 연결한 현황이며, 인구 대비 값은 당시 인구가 아닌 고정 인구 기준입니다.':'개원가 기준입니다. 전문자격 합계는 복수자격을 중복 포함하며 고유 인원수가 아닙니다.')+'</p>';
card.querySelector('button').onclick=()=>{state.selected=null;draw(el,F,[],state)};
}

function paintLegend(l,max){
l.innerHTML='<b>'+(isEvent()?periodLabel()+' '+M[S.metric][0]+' (확인 기록)':isCount()?(isFacilityHistory()?facilityDateLabel()+' ':'')+M[S.metric][0]+' ('+M[S.metric][1]+')':'인구 1만 명당 '+M[S.metric][0])+'</b><div class="scale"></div><div class="lr"><span>'+COLOR_MIN+'</span><span>'+max+' 이상</span></div>';
if(S.metric==='net'){l.innerHTML='<b>'+periodLabel()+' 순증감 (개원 − 폐업)</b><div class="scale" style="background:linear-gradient(90deg,#b52b2b,#ffffff,#117036)"></div><div class="lr"><span>−'+max+' 이하</span><span>0</span><span>+'+max+' 이상</span></div>'}else if(isEvent())l.querySelector('.scale').style.background=S.metric==='openings'?'linear-gradient(90deg,rgb(255,255,255),rgb(89,190,120),rgb(17,112,54))':'linear-gradient(90deg,rgb(255,255,255),rgb(238,127,127),rgb(181,43,43))';
}
function panel(k,F,s){let p=F.reduce((x,f)=>x+(base(f.properties)||0),0),n=F.reduce((x,f)=>x+v(f.properties),0),u=M[S.metric];
if(S.metric==='net'){
const active=F.filter(f=>(f.properties.openings||0)+(f.properties.closures||0)>0),ranked=[...active].sort((a,b)=>Math.abs(v(b.properties))-Math.abs(v(a.properties)));
document.querySelector('#'+k+'-count').textContent=nf(active.length)+s;
document.querySelector('#'+k+'-label').textContent=periodLabel()+' 순증감 · 지도 연결분';
document.querySelector('#'+k+'-total').textContent=signed(n)+'곳';
document.querySelector('#'+k+'-rate-label').textContent='개원 / 폐업 · 지도 연결분';
document.querySelector('#'+k+'-rate').textContent='+'+nf(F.reduce((n,f)=>n+(f.properties.openings||0),0))+' / −'+nf(F.reduce((n,f)=>n+(f.properties.closures||0),0))+'곳';
document.querySelector('#'+k+'-title').textContent='순증감 규모 상위 10곳';
document.querySelector('#'+k+'-ranking').innerHTML=ranked.slice(0,10).map((f,i)=>'<li><span class="rank">'+(i+1)+'</span><span>'+f.properties.name+'</span><b>'+signed(v(f.properties))+'곳</b></li>').join('');return}
if(isCount()){let active=F.filter(f=>v(f.properties)>0),top=active.sort((a,b)=>v(b.properties)-v(a.properties))[0];
document.querySelector('#'+k+'-count').textContent=nf(active.length)+s;
document.querySelector('#'+k+'-label').textContent=(isEvent()?periodLabel()+' ':isFacilityHistory()?facilityDateLabel()+' ':'')+u[0]+' · 지도 연결분';
document.querySelector('#'+k+'-total').textContent=nf(n)+u[1];
document.querySelector('#'+k+'-rate-label').textContent=isEvent()?'최다 발생 지역':isFacilityHistory()?'치과기관 수 최다 지역':'전문의 수 최다 지역';
document.querySelector('#'+k+'-rate').textContent=top?top.properties.name+' '+nf(v(top.properties))+u[1]:'–';
document.querySelector('#'+k+'-title').textContent=(isEvent()?periodLabel()+' ':isFacilityHistory()?facilityDateLabel()+' ':'')+u[0]+' 상위 10곳';
document.querySelector('#'+k+'-ranking').innerHTML=active.slice(0,10).map((f,i)=>'<li><span class="rank">'+(i+1)+'</span><span>'+f.properties.name+'</span><b>'+nf(v(f.properties))+u[1]+'</b></li>').join('');
return}
document.querySelector('#'+k+'-count').textContent=nf(F.length)+s;
document.querySelector('#'+k+'-label').textContent=u[0]+' 합계';
document.querySelector('#'+k+'-total').textContent=nf(n)+u[1];
document.querySelector('#'+k+'-rate-label').textContent='전국 평균 · '+dname()+' 1만 명당';
document.querySelector('#'+k+'-rate').textContent=p?(n/p*1e4).toFixed(2)+u[1]:'–';
document.querySelector('#'+k+'-title').textContent=dname()+' 대비 '+u[0]+' 상위 10곳';
document.querySelector('#'+k+'-ranking').innerHTML=F.filter(f=>rate(f.properties)!=null).sort((a,b)=>rate(b.properties)-rate(a.properties)).slice(0,10).map((f,i)=>'<li><span class="rank">'+(i+1)+'</span><span>'+f.properties.name+'</span><b>'+rate(f.properties).toFixed(2)+u[1]+'</b></li>').join('')}
function eventPanel(d){let p=d.period,start=p.start.slice(0,7).replace('-','년 ')+'월',end=p.end.slice(0,7).replace('-','년 ')+'월',rank=(type,target)=>document.querySelector(target).innerHTML=d.regions.filter(x=>x[type]).sort((a,b)=>b[type]-a[type]||a.name.localeCompare(b.name,'ko')).slice(0,10).map(x=>'<li><span>'+x.name+'</span><b>'+nf(x[type])+'곳</b></li>').join('');
document.querySelector('#events-period').textContent=start+' ~ '+end+' 기준';
document.querySelector('.event-list.opening').hidden=S.metric==='closures';document.querySelector('.event-list.closure').hidden=S.metric==='openings';
document.querySelector('#event-totals').innerHTML=(S.metric!=='closures'?'<span class="event-total opening">개원 +'+nf(d.totals.openings)+'곳</span>':'')+(S.metric!=='openings'?'<span class="event-total closure">폐업 −'+nf(d.totals.closures)+'곳</span>':'')+(S.metric==='net'?'<span class="event-total">순증감 '+signed(d.totals.openings-d.totals.closures)+'곳</span>':'');
rank('openings','#opening-ranking');rank('closures','#closure-ranking')}
let D,L,T,E,O,Y,SP,year=2025,yearEnd=2025,eventError=false,localLoad,V={district:{z:1,px:0,py:0},local:{z:1,px:0,py:0}};
function applySpecialties(){if(!SP)return;for(let [features,level] of [[D,'district'],[L,'local']])if(features)features.forEach(f=>{let p=SP[level][f.properties.code]||{counts:{},orthodontic:{}};for(let field of ['counts','orthodontic']){p[field].__TOTAL__=SP.specialties.reduce((n,s)=>n+(p[field][s]||0),0);p[field].__WITHOUT_GENERAL__=p[field].__TOTAL__-(p[field]['통합치의학과']||0);}f.properties.specialties=p})}
fetch('data/specialties.json').then(r=>{if(!r.ok)throw Error('과목 데이터 요청 실패');return r.json()}).then(d=>{SP=d;applySpecialties();let select=document.querySelector('#specialty');select.innerHTML='<option value="__TOTAL__">전체 과목 합계 (복수자격 포함)</option><option value="__WITHOUT_GENERAL__">전체 과목 합계 (통합치의학과 제외)</option>'+d.specialties.map(s=>'<option>'+s+'</option>').join('');select.disabled=false;document.querySelector('[data-metric="specialty"]').disabled=false;document.querySelector('#specialty-note').textContent='과목별 집계는 개원가 치과의원·일반 치과병원 기준입니다. 기관명 기준으로 대학·부속치과, 군 의료기관, 장애인치과병원, 교정시설 등을 제외합니다. 2026년 6월 기관 목록에 심평원 상세페이지 수집 당시 인원을 연결했습니다. 전체 과목 합계는 11개 과목의 합산값이며, 통합치의학과 제외 합계는 나머지 10개 과목의 합산값입니다. 두 합계 모두 복수 전문자격을 중복 포함하므로 고유 인원수가 아닙니다. 인구 1만 명당 표시에서는 상단 비교 기준으로 주민등록·주간인구를 선택합니다. 주간인구는 시군구 자료이므로 선택 시 시군구 지도로 전환됩니다. 원문 미확인 '+nf(d.coverage.unverifiedFacilities)+'개 기관 제외 · 위치 미연결: 시군구 '+nf(d.coverage.districtUnmatched)+'곳, 읍면동 '+nf(d.coverage.localUnmatched)+'곳.';redraw()}).catch(()=>{document.querySelector('#specialty').innerHTML='<option value="">불러오기 실패</option>';document.querySelector('#specialty-note').textContent='과목별 전문의 데이터를 불러오지 못했습니다. 새로고침해 주세요.'});
document.querySelector('#specialty').onchange=e=>{S.specialty=e.target.value;S.metric='specialty';M.specialty[0]=S.specialty==='__TOTAL__'?'전체 과목 전문의 수 (복수자격 포함)':S.specialty==='__WITHOUT_GENERAL__'?'전문의 합계 (통합치의학과 제외·복수자격 포함)':S.specialty+' 전문의 수';redraw()};
document.querySelector('#specialty-scale').onchange=e=>{S.specialtyScale=e.target.value;redraw()};
const SIDO_PREFIX={서울:'11',부산:'21',대구:'22',인천:'23',광주:'24',대전:'25',울산:'26',세종시:'29',경기:'31',강원:'32',충북:'33',충남:'34',전북:'35',전남:'36',경북:'37',경남:'38',제주:'39'};
function eventKey(name){return key(name).replace(/시(?=[가-힣]+구$)/,'')}
function applyEvents(){if(!D||!E)return;
D.forEach(f=>{let n=E.districts[f.properties.code];f.properties.openings=n?.openings||0;f.properties.closures=n?.closures||0})}
function applyLocalOpenings(){if(!L||!O)return;
L.forEach(f=>{f.properties.openings=O.openingsByCode[f.properties.code]||0;f.properties.closures=O.closuresByCode?.[f.properties.code]||0});
}
function eventLabels(){renderTrend();renderFacilityHistory();
document.querySelectorAll('[data-panel="facilities"]').forEach(el=>el.hidden=S.metric!=='dentalFacilities');if(isEvent()&&E)eventPanel(E);let local=!document.querySelector('#local').hidden;
let specialtyVisible=isSpecialty();
document.querySelectorAll('[data-panel="dental"]').forEach(el=>el.hidden=isEvent());
document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.section===(isEvent()?'events':'dental')));
document.querySelectorAll('[data-panel="specialty"]').forEach(el=>el.hidden=!specialtyVisible);
document.querySelectorAll('[data-panel="events"]').forEach(el=>el.hidden=!isEvent());
document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.metric===S.metric));
document.querySelectorAll('[data-event-kind]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.eventKind===S.metric));
document.querySelector('#specialty').value=isSpecialty()?S.specialty:'';
document.querySelector('#specialty-scale').disabled=!isSpecialty();
if(!isEvent())document.querySelector('#subtitle').textContent=(local?'읍면동':'시군구')+'별 '+(isCount()?'':dname()+' 대비 ')+M[S.metric][0];
document.querySelector('.note').textContent='개업·폐업은 선택 연도의 확인 기록 건수이며, 인구 대비 값이 아닙니다.';
document.querySelector('.asof').textContent=isEvent()?periodLabel()+' 개업·폐업':isFacilityHistory()?facilityDateLabel()+' 기준':'2026년 6월 기준';
document.querySelectorAll('[data-denom]').forEach(b=>b.disabled=isCount()||(b.dataset.denom==='daytime'&&(!b.dataset.ready)));
if(isFacilityHistory())document.querySelector('#subtitle').textContent=(local?'읍면동':'시군구')+'별 '+facilityDateLabel()+' 치과기관 수'+(isCount()?'':' · '+dname()+' 고정 인구 대비');
if(isEvent())document.querySelector('#subtitle').textContent=(local?'읍면동':'시군구')+'별 '+periodLabel()+' '+M[S.metric][0]+' 확인 기록';
if(Y&&E){let c=E.coverage,t=E.totals;
document.querySelector('#event-note').textContent=periodLabel()+' · 신규개원 전체 '+nf(t.openings)+'건 / 읍면동 연결 '+nf(c.localOpenings)+'건 / 미배정 '+nf(t.openings-c.localOpenings)+'건. 폐업 전체 '+nf(t.closures)+'건 / 읍면동 연결 '+nf(c.localClosures)+'건 / 미배정 '+nf(t.closures-c.localClosures)+'건. 시군구 연결: 신규개원 '+nf(c.districtOpenings)+'건, 폐업 '+nf(c.districtClosures)+'건. '+Y.notes.locations;
document.querySelector('#recovery-summary').textContent=Y.source+' · 수집 '+Y.collectedAt+'. '+Y.notes.openings+' '+Y.notes.closures+' '+Y.notes.range}}
function redraw(live=false){if(globalThis.populationPanel?.render(S.metric))return;eventLabels();if(isEvent()&&!E){for(let k of ['district','local']){showMapMessage(document.querySelector(k==='district'?'#map':'#local-map'),eventError?'연도별 데이터를 불러오지 못했습니다. 새로고침해 주세요.':'연도별 데이터를 불러오는 중입니다.');for(let suffix of ['count','total','rate'])document.querySelector('#'+k+'-'+suffix).textContent='–';document.querySelector('#'+k+'-ranking').replaceChildren()}return}if(D){(live?refreshMap:draw)(document.querySelector('#map'),D,[],V.district);
panel('district',D,'곳')}if(L){(live?refreshMap:draw)(document.querySelector('#local-map'),L,D||[],V.local);
panel('local',L,'곳')}}function loadLocal(){if(localLoad)return localLoad;
showMapMessage(document.querySelector('#local-map'),'읍면동 지도 데이터를 불러오는 중입니다.');
localLoad=fetch('data/eupmyeondong-boundaries.json').then(r=>{if(!r.ok)throw Error('읍면동 경계 데이터 요청 실패');
return r.json()}).then(d=>{L=d.features;
applySpecialties();
applyLocalOpenings();
redraw()}).catch(()=>{showMapMessage(document.querySelector('#local-map'),'읍면동 지도 데이터를 불러오지 못했습니다.')});
return localLoad}function view(local){if(local&&S.denom==='daytime')S.denom='resident';
let b=document.querySelector('[data-denom="daytime"]');
b.disabled=!b.dataset.ready;
document.querySelectorAll('[data-denom]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.denom===S.denom));
document.querySelector('#district').hidden=local;
document.querySelector('#local').hidden=!local;
document.querySelector('#subtitle').textContent=local?(S.metric==='openings'?'읍면동별 최근 12개월 신규개원 현황':'읍면동별 주민등록 인구 대비 치과 지표 분포'):(isEvent()?'시군구별 최근 12개월 '+M[S.metric][0]+' 현황':'시군구별 '+dname()+' 대비 치과 지표 분포');
document.querySelectorAll('[data-view]').forEach(x=>x.setAttribute('aria-pressed',(x.dataset.view==='local')===local));
if(local)loadLocal();
redraw()}
fetch('data/district-boundaries.json').then(r=>{if(!r.ok)throw Error('시군구 경계 데이터 요청 실패');
return r.json()}).then(d=>{D=d.features;
applySpecialties();
applyEvents();
redraw();
fetch('data/daytime_population_2020.json').then(r=>r.ok?r.json():null).then(d=>{if(!d)return;
let n=0;
D.forEach(f=>{let r=d.districts[f.properties.code]||d.districts[key(f.properties.name)];
if(r){f.properties.daytimePopulation=r.daytimePopulation;
n++}});
if(n>=200){let b=document.querySelector('[data-denom="daytime"]');
b.disabled=isCount();
b.dataset.ready='true';
b.title='통계청 2020 인구주택총조사 통근·통학 기반 주간인구';
document.querySelector('#foot').insertAdjacentText('beforeend',' 주간인구: 통계청 2020 인구주택총조사 표본(20%) 통근·통학.');redraw()}}).catch(()=>{});
}).catch(()=>showMapMessage(document.querySelector('#map'),'시군구 지도 데이터를 불러오지 못했습니다. 새로고침 후에도 계속되면 잠시 뒤 다시 시도해 주세요.'));

function aggregateYears(first,last){
const out={period:{start:first+'-01-01',end:last+'-12-31'},totals:{openings:0,closures:0},districts:{},regions:[],openingsByCode:{},closuresByCode:{},coverage:{districtOpenings:0,districtClosures:0,localOpenings:0,localClosures:0}},regions={};
for(let y=first;y<=last;y++){const d=Y.years[y];if(!d)continue;
for(const k of ['openings','closures'])out.totals[k]+=d.totals[k]||0;
for(const k of Object.keys(out.coverage))out.coverage[k]+=d.coverage[k]||0;
for(const [code,p] of Object.entries(d.districts)){const q=out.districts[code]??={openings:0,closures:0};q.openings+=p.openings||0;q.closures+=p.closures||0}
for(const k of ['openingsByCode','closuresByCode'])for(const [code,n] of Object.entries(d[k]||{}))out[k][code]=(out[k][code]||0)+n;
for(const p of d.regions){const q=regions[p.name]??={name:p.name,openings:0,closures:0};q.openings+=p.openings||0;q.closures+=p.closures||0}}
out.regions=Object.values(regions);return out}
function periodLabel(){return year===yearEnd?year+'년':year+'–'+yearEnd+'년 누적'}
function renderTrend(){
if(!Y||!isEvent())return;
if(chartDrag){previewChart(year,yearEnd);return}
const entries=Object.entries(Y.years).sort((a,b)=>Number(a[0])-Number(b[0])),both=S.metric==='net';
const max=Math.max(1,...entries.flatMap(([,d])=>both?[d.totals.openings,d.totals.closures]:[d.totals[S.metric]||0]));
document.querySelector('#event-trend').innerHTML=entries.map(([y,d])=>{
const selected=Number(y)>=year&&Number(y)<=yearEnd,op=d.totals.openings||0,cl=d.totals.closures||0,n=d.totals[S.metric]||0;
const bars=both?'<span class="signed-trend"><span class="positive-half"><span style="height:'+Math.max(1,op/max*50)+'px"></span></span><span class="negative-half"><span style="height:'+Math.max(1,cl/max*50)+'px"></span></span></span>':'<span class="trend-bar" style="height:'+Math.max(2,n/max*70)+'px;background:'+(S.metric==='openings'?'#278552':'#c04e4e')+'"></span>';
return '<button class="trend-year" aria-pressed="'+selected+'" data-year="'+y+'" title="'+y+'년 '+(both?'개원 +'+nf(op)+' / 폐업 −'+nf(cl)+' / 순증감 '+signed(op-cl):M[S.metric][0]+' '+nf(n))+'건">'+bars+'<small>'+y+'</small></button>'}).join('');
document.querySelector('#trend-title').textContent=both?'연도별 개원(위 +) · 폐업(아래 −) · 지도는 순증감':'전국 연도별 '+M[S.metric][0]+' · 막대를 누르면 해당 연도 선택';
chartHint();
}
let rangeAnchor=null,chartDrag=null,suppressChartClick=false,chartFrame=null,pendingChartPeriod=null;
function cancelChartUpdate(){if(chartFrame!==null)cancelAnimationFrame(chartFrame);chartFrame=null;pendingChartPeriod=null}
function queueChartPeriod(first,last){
pendingChartPeriod=[first,last];
if(chartFrame!==null)return;
chartFrame=requestAnimationFrame(()=>{
chartFrame=null;const period=pendingChartPeriod;pendingChartPeriod=null;
if(!chartDrag||!period)return;
const years=Object.keys(Y.years).map(Number),[a,b]=normalizePeriod(...period,Math.min(...years),Math.max(...years),windowYears());
if(a!==year||b!==yearEnd)selectPeriod(a,b,true);
});
}
function chartHint(){
const mode=document.querySelector('#event-mode').value;
document.querySelector('#chart-help').textContent=mode==='window'?'막대를 클릭하거나 드래그하면 고정 기간이 이동합니다.':mode==='single'?'조회할 연도를 클릭하거나 드래그하세요.':rangeAnchor===null?'시작 연도와 종료 연도를 차례로 클릭하거나, 원하는 구간을 드래그하세요.':rangeAnchor+'년 선택됨 · 종료 연도를 클릭하세요. (Esc: 취소)';
}
function previewChart(first,last){
const years=Object.keys(Y.years).map(Number),[a,b]=normalizePeriod(first,last,Math.min(...years),Math.max(...years),windowYears());
document.querySelectorAll('.trend-year').forEach(el=>el.setAttribute('aria-pressed',+el.dataset.year>=a&&+el.dataset.year<=b));
document.querySelector('#event-selection').textContent=(a===b?a+'년':a+'–'+b+'년 누적')+(windowYears()?' · '+windowYears()+'년 창':'');
}
function chooseChartYear(value){
if(document.querySelector('#event-mode').value==='range'){
if(rangeAnchor===null){rangeAnchor=value;previewChart(value,value);chartHint();return}
const start=Math.min(rangeAnchor,value),end=Math.max(rangeAnchor,value);rangeAnchor=null;selectPeriod(start,end);
}else selectPeriod(value,value);
}
function setupChart(){
const chart=document.querySelector('#event-trend');
const atX=x=>{const buttons=[...chart.querySelectorAll('.trend-year')];return Number(buttons.reduce((best,b)=>Math.abs(b.getBoundingClientRect().x+b.getBoundingClientRect().width/2-x)<Math.abs(best.getBoundingClientRect().x+best.getBoundingClientRect().width/2-x)?b:best).dataset.year)};
chart.onclick=e=>{if(suppressChartClick){suppressChartClick=false;return}const b=e.target.closest('[data-year]');if(b)chooseChartYear(+b.dataset.year)};
chart.onpointerdown=e=>{if(e.button!==0)return;const b=e.target.closest('[data-year]');if(!b)return;suppressChartClick=false;chartDrag={id:e.pointerId,start:+b.dataset.year,last:+b.dataset.year,x:e.clientX,moved:false};chart.setPointerCapture(e.pointerId)};
chart.onpointermove=e=>{if(!chartDrag||chartDrag.id!==e.pointerId)return;const target=atX(e.clientX);chartDrag.last=target;if(Math.abs(e.clientX-chartDrag.x)>5)chartDrag.moved=true;if(chartDrag.moved){const range=document.querySelector('#event-mode').value==='range';const first=range?Math.min(chartDrag.start,target):target,last=range?Math.max(chartDrag.start,target):target;previewChart(first,last);queueChartPeriod(first,last)}};
chart.onpointerup=e=>{if(!chartDrag||chartDrag.id!==e.pointerId)return;const d=chartDrag;cancelChartUpdate();chartDrag=null;chart.releasePointerCapture(e.pointerId);if(d.moved){suppressChartClick=true;rangeAnchor=null;const range=document.querySelector('#event-mode').value==='range';selectPeriod(range?Math.min(d.start,d.last):d.last,range?Math.max(d.start,d.last):d.last,true)}else{chooseChartYear(d.start);suppressChartClick=true}};
chart.onpointercancel=()=>{cancelChartUpdate();chartDrag=null;rangeAnchor=null;renderTrend();previewChart(year,yearEnd)};
chart.onkeydown=e=>{if(e.key==='Escape'){rangeAnchor=null;renderTrend();document.querySelector('#event-selection').textContent=periodLabel()}};
}

let selectedWindowYears=3;
function windowYears(){return document.querySelector('#event-mode').value==='window'?selectedWindowYears:0}
function normalizePeriod(first,last,min,max,size=0){
first=Math.round(Number(first));last=Math.round(Number(last));
if(size){const start=Math.max(min,Math.min(max-size+1,first));return [start,start+size-1]}
const start=Math.max(min,Math.min(max,first));return [start,Math.max(start,Math.min(max,last))]}
function selectPeriod(first,last,live=false){
if(!Y)return;const years=Object.keys(Y.years).map(Number),min=Math.min(...years),max=Math.max(...years),size=windowYears();
[year,yearEnd]=normalizePeriod(first,last,min,max,size);
document.querySelector('#event-selection').textContent=periodLabel()+(size?' · '+size+'년 창':'');
document.querySelector('#window-hint').hidden=!size;
document.querySelector('#window-options').hidden=!size;
document.querySelectorAll('[data-window]').forEach(b=>b.setAttribute('aria-pressed',Number(b.dataset.window)===size));
E=aggregateYears(year,yearEnd);O=E;applyEvents();applyLocalOpenings();redraw(live);
document.querySelector('#event-prev').disabled=year===min;document.querySelector('#event-next').disabled=yearEnd===max;
}
function setupPeriods(){
const years=Object.keys(Y.years).map(Number);
setupChart();
document.querySelector('#event-mode').disabled=false;
document.querySelectorAll('[data-window]').forEach(b=>{b.disabled=false;b.onclick=()=>{rangeAnchor=null;selectedWindowYears=Number(b.dataset.window);document.querySelector('#event-mode').value='window';selectPeriod(year,yearEnd)}});
document.querySelector('#event-mode').onchange=e=>{rangeAnchor=null;selectPeriod(year,e.target.value==='single'?year:yearEnd)};
for(const [id,delta] of [['event-prev',-1],['event-next',1]])document.querySelector('#'+id).onclick=()=>{rangeAnchor=null;selectPeriod(year+delta,yearEnd+delta)};
document.querySelector('#event-all').onclick=()=>{rangeAnchor=null;document.querySelector('#event-mode').value='range';selectPeriod(Math.min(...years),Math.max(...years))};
selectPeriod(Y.defaultYear,Y.defaultYear);
}

fetch('data/api-yearly-events.json?v=20260921-api1').then(r=>{if(!r.ok)throw Error('연도 자료 요청 실패');return r.json()}).then(d=>{Y=d;setupPeriods()}).catch(()=>{eventError=true;document.querySelector('#event-note').textContent='연도별 데이터를 불러오지 못했습니다. 새로고침해 주세요.';document.querySelector('#events-period').textContent='연도별 자료 불러오기 실패';redraw()});
document.querySelector('#foot').insertAdjacentHTML('afterbegin','<span data-panel="events" hidden>개업·폐업 지도: 행안부 인허가 API의 치과의원·치과병원 확인 기록(대학·부속치과 포함), 2000~2025년. 신규개원은 인허가일, 폐업은 폐업일·상태 기준입니다. 위치는 API 기재 위치이며 과거 당시 위치를 보장하지 않습니다. </span><span data-panel="specialty" hidden>과목별 전문의 지도는 실제 인원수 또는 인구 1만 명당 값을 선택할 수 있으며 기존 인력 지도와 같은 기관명 제외 기준을 적용한 개원가 집계입니다. </span>');

fetch('data/facility-history.json').then(r=>{if(!r.ok)throw Error('현황 요청 실패');return r.json()}).then(d=>{FH=d;facilityYear=d.defaultYear;setupFacilityChart();redraw()}).catch(()=>{document.querySelector('#facility-help').textContent='연도별 현황을 불러오지 못했습니다. 새로고침해 주세요. 현재 지도는 2026년 6월 기준입니다.'});
let dentalMetric='dentalFacilities';
document.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{S.metric=b.dataset.section==='events'?S.eventKind:dentalMetric;redraw()});
document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{dentalMetric=S.metric=b.dataset.metric;redraw()});
document.querySelectorAll('[data-denom]').forEach(b=>b.onclick=()=>{if(b.disabled)return;
S.denom=b.dataset.denom;
if(S.denom==='daytime'&&!document.querySelector('#local').hidden)view(false);
document.querySelectorAll('[data-denom]').forEach(x=>x.setAttribute('aria-pressed',x===b));
document.querySelector('#subtitle').textContent='시군구별 '+dname()+' 대비 치과 지표 분포';
redraw()});

document.querySelectorAll('[data-event-kind]').forEach(b=>b.onclick=()=>{S.eventKind=S.metric=b.dataset.eventKind;redraw()});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view==='local'));
