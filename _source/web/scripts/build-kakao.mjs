// Keep the analytical UI/calculations in sync with the original page; replace only its renderer.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { redesignPage } from './redesign-page.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputArg = process.argv.find(arg => arg.startsWith('--output-dir='));
const root = outputArg ? resolve(outputArg.slice('--output-dir='.length)) : resolve(project, 'dist');
const source = readFileSync(resolve(project, 'legacy/index.html'), 'utf8');
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Source changed: expected one ${before.slice(0, 70)}`);
  return text.replace(before, after);
}
const scriptStart = source.indexOf('</main><script>');
const scriptEnd = source.lastIndexOf('</script>');
if (scriptStart < 0 || scriptEnd < scriptStart) throw new Error('Cannot locate analytical script');
let page = source.slice(0, scriptStart) + '</main>';
let core = source.slice(scriptStart + '</main><script>'.length, scriptEnd);

// Drop the custom projection, SVG paths and pointer/zoom implementation completely.
const drawStart = core.indexOf('function draw(');
const legendStart = core.indexOf('function paintLegend(');
const refreshStart = core.indexOf('function refreshMap(');
const panelStart = core.indexOf('function panel(');
if (!(drawStart >= 0 && legendStart > drawStart && refreshStart > legendStart && panelStart > refreshStart)) {
  throw new Error('Renderer boundaries changed');
}
core = core.slice(0, drawStart) + core.slice(legendStart, refreshStart) + core.slice(panelStart);
core = replaceOnce(core,
  "state.selected=null;el.querySelector('.selection-outline')?.remove();el.querySelectorAll('.area[aria-pressed=\"true\"]').forEach(p=>p.setAttribute('aria-pressed','false'));regionInfo(el,F,state)",
  'state.selected=null;draw(el,F,[],state)');
// Data lives next to both HTML files, including under the GitHub Pages project prefix.
core = core.replaceAll("fetch('/data/", "fetch('data/");
page = page.replaceAll('href="/data/', 'href="data/');

// Messages must not destroy an existing Kakao map or its SDK-managed DOM.
core = replaceOnce(core,
  "document.querySelector(k==='district'?'#map':'#local-map').textContent=eventError?'연도별 데이터를 불러오지 못했습니다. 새로고침해 주세요.':'연도별 데이터를 불러오는 중입니다.';",
  "showMapMessage(document.querySelector(k==='district'?'#map':'#local-map'),eventError?'연도별 데이터를 불러오지 못했습니다. 새로고침해 주세요.':'연도별 데이터를 불러오는 중입니다.');");
for (const [selector, message] of [
  ['#local-map', '읍면동 지도 데이터를 불러오는 중입니다.'],
  ['#local-map', '읍면동 지도 데이터를 불러오지 못했습니다.'],
  ['#map', '시군구 지도 데이터를 불러오지 못했습니다. 새로고침 후에도 계속되면 잠시 뒤 다시 시도해 주세요.'],
]) {
  core = replaceOnce(core, `document.querySelector('${selector}').textContent='${message}'`,
    `showMapMessage(document.querySelector('${selector}'),'${message}')`);
}
// Prevent a stale tooltip/fill if the denominator finishes loading after a user switches it.
core = replaceOnce(core,
  "document.querySelector('#foot').insertAdjacentText('beforeend',' 주간인구: 통계청 2020 인구주택총조사 표본(20%) 통근·통학.')}})",
  "document.querySelector('#foot').insertAdjacentText('beforeend',' 주간인구: 통계청 2020 인구주택총조사 표본(20%) 통근·통학.');redraw()}})");

page = replaceOnce(page, '<a class="kakao-version-link" href="kakao.html">카카오 ver.</a>',
  '<span class="kakao-version-link" aria-label="카카오맵 기반 지도">카카오맵</span><a class="kakao-version-link" href="admin-history.html" target="_blank" rel="noopener">행정구역 변경 내역</a>');
// Retire the optional transit overlay without changing the archived original map.
page = replaceOnce(page, '<label class="filter"><input id="metro" type="checkbox">지하철 노선</label>', '');
core = replaceOnce(core, "document.querySelector('#metro').onchange=e=>{S.metro=e.target.checked;\nredraw()};", '');
core = replaceOnce(core, "fetch('data/transport-network.json').then(r=>r.ok?r.json():null).then(x=>{T=x;\nif(T)redraw()}).catch(()=>{})", '');
// Population is a dental-status metric in this page, with an isolated same-page
// panel so the two analytical engines retain their state without global collisions.
page = replaceOnce(page, '<a class="kakao-version-link" href="population.html" style="background:#e8f0ff;color:#235bc0">인구 지도</a>', '');
page = replaceOnce(page, '<button data-metric="specialty" aria-pressed="false" disabled>치과전문의 수</button>',
  '<button data-metric="specialty" aria-pressed="false" disabled>치과전문의 수</button><button data-metric="population" aria-pressed="false" aria-controls="population-panel">인구 분포</button><button data-metric="daytime" aria-pressed="false" aria-controls="daytime-panel">주간인구</button>');
core = replaceOnce(core, 'function redraw(live=false){eventLabels();',
  'function redraw(live=false){globalThis.refreshWorkspace?.(S.metric);if(globalThis.populationPanel?.render(S.metric))return;eventLabels();');
core = replaceOnce(core,
  "const p=f.properties,fullName=level==='district'?((Object.entries(SIDO_PREFIX).find(([,code])=>String(p.code).startsWith(code))||[])[0]||'')+' '+p.name:p.name;",
  "const p=f.properties,sourceName=level==='district'?((Object.entries(SIDO_PREFIX).find(([,code])=>String(p.code).startsWith(code))||[])[0]||'')+' '+p.name:p.name,fullName=globalThis.adminDisplayName?.(sourceName)??sourceName;");
const eventSwitch = '<div class="switch" aria-label="개원·폐업 표시"><button data-event-kind="openings" aria-pressed="false">개원만 보기</button><button data-event-kind="closures" aria-pressed="false">폐업만 보기</button><button data-event-kind="net" aria-pressed="true">동시에 보기 (+/−)</button></div>';
page = replaceOnce(page, eventSwitch, '');
page = replaceOnce(page, '<section class="bar period-controls" data-panel="events" hidden aria-label="개업·폐업 기간 선택">',
  `<section class="bar" id="event-metric-bar" data-panel="events" hidden aria-label="개원·폐업 지도 지표"><span class="label">지도 지표</span>${eventSwitch.replace('</div>', '<button data-event-kind="populationChange" aria-pressed="false" aria-controls="population-change-panel">인구 증감</button><button data-event-kind="daytimeChange" aria-pressed="false" aria-controls="daytime-change-panel">주간인구 증감</button></div>')}</section><section class="bar period-controls" data-panel="events" hidden aria-label="개업·폐업 기간 선택">`);
// Global SVG rules from the old renderer must never resize SDK-owned shapes.
page = page.replace(/\.map svg:focus,\.map \.area:focus\{[^}]*\}\s*\.map \.area\{[^}]*\}\s*\.map \.area:focus-visible\{[^}]*\}/, '');
page = page.replace(/svg\{display:block;[\s\S]*?pointer-events:none\}\#local-map \.context\{[^}]*\}/, '');
const cssVersion = createHash('sha256').update(readFileSync(resolve(root,'kakao.css'))).digest('hex').slice(0,12);
page = replaceOnce(page, '</style><body>', `</style><link rel="stylesheet" href="kakao.css?v=${cssVersion}"><body>`);
const mapToolbar = `
<section class="bar kakao-tools" aria-label="카카오 지도 도구">
  <form id="place-search" role="search"><label class="sr-only" for="place-query">카카오 장소·주소 검색</label><input id="place-query" type="search" placeholder="지역·역·주소 검색" maxlength="120" required><button type="submit">검색</button></form>
  <label for="region-picker" class="sr-only">분석 지역 선택</label><select id="region-picker"><option value="">분석 지역 선택</option></select>
  <label class="fill-control" for="fill-opacity">통계 색상 <input id="fill-opacity" type="range" min="0" max="100" value="65"><output id="fill-value" for="fill-opacity">65%</output></label>
  <span class="map-provider">지도·검색 © Kakao</span>
  <div class="clinic-tools"><label><input id="clinic-toggle" type="checkbox" checked> 치과 위치 표시</label>
  <label for="clinic-source" class="sr-only">치과 좌표 출처 선택</label><select id="clinic-source"><option value="all">모든 치과 위치</option><option value="kakao">카카오 연결 위치만</option><option value="hira_unverified">심평원 위치만</option></select>
  <span class="clinic-key"><i class="clinic-dot kakao"></i>카카오 <i class="clinic-dot hira"></i>심평원(연결 보류)</span>
  <span id="clinic-status" role="status">치과 위치를 불러오는 중입니다…</span>
  <small>기관 목록 2026.06 · 카카오 일괄 조회 2026.11.03 · 웹 재검수 2026.11.06–07 · 대학·부속 포함 전체 위치(통계 집계 범위와 다름) · 좌표 미확인 기관 제외</small></div>
  <div id="search-results" hidden aria-live="polite"></div>
</section>
`;
page = replaceOnce(page, '<section id="district"', mapToolbar + '<section id="district"');
page = replaceOnce(page, '<section id="district"', `<section id="population-panel" hidden aria-label="인구 분포 지도 지표"><p id="population-panel-status" role="status">인구 지도를 불러오는 중입니다. <a href="population.html">별도 화면으로 열기</a></p><iframe id="population-frame" title="연령·성별·연도별 읍면동 인구 분포" data-src="population.html?embed=1"></iframe></section><section id="district"`);
page = replaceOnce(page, '<section id="district"', `<section id="population-change-panel" hidden aria-label="인구 증감 지도 지표"><p id="population-change-panel-status" role="status">인구 증감을 불러오는 중입니다. <a href="population.html?mode=change">별도 화면으로 열기</a></p><iframe id="population-change-frame" title="연령·성별·기간별 읍면동 인구 증감" data-src="population.html?embed=1&amp;mode=change"></iframe></section><section id="district"`);
page = replaceOnce(page, '<section id="district"', `<section id="daytime-panel" hidden aria-label="공식 주간인구 지도 지표"><p id="daytime-panel-status" role="status">공식 주간인구를 불러오는 중입니다. <a href="daytime.html">별도 화면으로 열기</a></p><iframe id="daytime-frame" title="조사연도별 시군구 공식 주간인구" data-src="daytime.html?embed=1"></iframe></section><section id="district"`);
page = replaceOnce(page, '<footer id="foot">', `<p class="map-source-note">배경지도·지명·도로·장소/주소 검색: Kakao. 통계 색상은 기존 분석 지도와 동일한 값입니다. 행정구역 경계는 기존 원자료를 카카오 지도에 표시합니다. 카카오 배경의 최신 지명·경계와 분석 기준 시점이 다를 수 있습니다. <a href="https://apis.map.kakao.com/web/documentation/" target="_blank" rel="noopener">지도 API 안내</a></p><footer id="foot">`);
page = replaceOnce(page, '<section id="district"', `<section id="daytime-change-panel" hidden aria-label="공식 주간인구 증감 지도 지표"><p id="daytime-change-panel-status" role="status">주간인구 증감을 불러오는 중입니다. <a href="daytime.html?mode=change">별도 화면으로 열기</a></p><iframe id="daytime-change-frame" title="연령·성별·조사기간별 시군구 주간인구 증감" data-src="daytime.html?embed=1&amp;mode=change"></iframe></section><section id="district"`);
page = redesignPage(page);
const ageGroups=[['all','전체'],['0:3','19세 이하'],['4:5','20대'],['6:7','30대'],['8:9','40대'],['10:11','50대'],['12:13','60대'],['14:20','70대 이상']];
const ageChoices=`<label class="population-heat-age" for="population-heat-age">연령 <select id="population-heat-age" aria-describedby="population-heat-age-note">${ageGroups.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><small id="population-heat-age-note" class="population-heat-age-note">연령별 값은 1km 자료를 100m 인구 비중으로 배분한 추정치입니다. 미수록 구역은 제외하며, 색 농도는 선택 연령 안의 상대 밀집도를 나타냅니다.</small>`;
page = replaceOnce(page, '<label><input id="stat-fill-toggle" type="checkbox"> 지역별 통계 색칠</label>', '<label><input id="stat-fill-toggle" type="checkbox"> 지역별 통계 색칠</label><label><input id="population-heat-toggle" type="checkbox" checked> 인구 히트맵 <small>2024</small></label>'+ageChoices);
page = replaceOnce(page, '<div class="clinic-tools">', `<section class="population-heat-settings" aria-label="인구 히트맵 설정"><div class="settings-heading">100m 인구 히트맵</div><label class="fill-control" for="population-heat-opacity">진하기 <input id="population-heat-opacity" type="range" min="10" max="100" step="5" value="75"><output id="population-heat-opacity-value">75%</output></label><label class="fill-control" for="population-heat-blur">번짐 <input id="population-heat-blur" type="range" min="0" max="44" value="33"><span>부드럽게</span></label><small id="population-heat-status" role="status">2024년 거주 인구 · 100m 셀 기준</small><p>출처: <a href="https://sgis.mods.go.kr/view/pss/openDataIntrcn" target="_blank" rel="noopener">국가데이터처 SGIS</a>. 100m 셀 전체를 인구수에 비례해 채색한 뒤 번짐 처리합니다. 모든 확대 수준에서 같은 2024년 자료와 색상 기준을 사용합니다. 색이 없는 곳을 0명으로 단정할 수 없습니다. 치과 지표·위치의 기준 시점과 다릅니다.</p></section><div class="clinic-tools">`);
page = replaceOnce(page, '<div class="switch"><button data-metric="population"', '<div class="switch"><button data-metric="populationHeatmap" aria-pressed="false" aria-controls="heatmap-panel">100m 인구 히트맵</button><button data-metric="population"');
page = replaceOnce(page, '<section id="population-panel"', '<section id="heatmap-panel" hidden aria-label="100m 인구 히트맵"><p id="heatmap-panel-status" role="status">인구 히트맵을 불러오는 중입니다. <a href="heatmap.html">별도 화면으로 열기</a></p><iframe id="heatmap-frame" title="SGIS 100m 거주인구 히트맵" data-src="heatmap.html?embed=1"></iframe></section><section id="population-panel"');
const workspaceVersion = createHash('sha256').update(readFileSync(resolve(root,'workspace.js'))).digest('hex').slice(0,12);
const coreVersion = createHash('sha256').update(core).digest('hex').slice(0,12);
const panelVersion = createHash('sha256').update(readFileSync(resolve(root,'kakao-population-panel.js'))).digest('hex').slice(0,12);
const mapVersion = createHash('sha256').update(readFileSync(resolve(root,'kakao-map.js'))).digest('hex').slice(0,12);
const clinicsVersion = createHash('sha256').update(readFileSync(resolve(root,'kakao-clinics.js'))).update(readFileSync(resolve(root,'clinic-model.mjs'))).digest('hex').slice(0,12);
const heatVersion = ['kakao-heatmap.mjs','population-heat-layer.mjs','age-heatmap-model.mjs','age-heatmap-renderer.mjs','age-heatmap-worker.mjs'].reduce((hash,file)=>hash.update(readFileSync(resolve(root,file))),createHash('sha256')).digest('hex').slice(0,12);
const adminVersion = createHash('sha256').update(readFileSync(resolve(root,'admin-map-labels.js'))).digest('hex').slice(0,12);
page += `\n<script src="kakao-map.js?v=${mapVersion}"></script>\n<script type="module" src="admin-map-labels.js?v=${adminVersion}"></script>\n<script src="kakao-population-panel.js?v=${panelVersion}"></script>\n<script src="kakao-core.js?v=${coreVersion}"></script>\n<script src="workspace.js?v=${workspaceVersion}"></script>\n<script type="module" src="kakao-clinics.js?v=${clinicsVersion}"></script>\n<script type="module" src="kakao-heatmap.mjs?v=${heatVersion}"></script>\n</body></html>\n`;
if (/createSVGPoint|createElementNS|Math\.cos\(36\.5/.test(core)) throw new Error('Legacy renderer remains');
// Both entries share the analytical engine; only the laboratory exposes statistical fill.
const labPage = replaceOnce(replaceOnce(replaceOnce(page,
  '<title>치과 입지 지도</title>', '<title>실험실 · 치과 입지 지도</title>'),
  '<span class="product-tag">DENTAL ATLAS</span>', '<span class="product-tag">실험실</span><a class="lab-link" href="index.html">기본 홈으로</a>'),
  '</header>', '</header><p class="lab-notice" role="note">실험실 · 치과 현황·개원·폐업·인구 분석과 지역별 통계 색칠을 시험할 수 있습니다. 지도 도구에서 ‘지역별 통계 색칠’을 켜세요.</p>');
let homePage = replaceOnce(page, '<main class="workspace">', '<main class="workspace" data-home-map data-stat-fill="off">');
// Preserve the shared engine's DOM hooks, but keep analytical navigation and
// period/metric controls out of both the home layout and keyboard navigation.
homePage = replaceOnce(homePage, '</header>', '</header><div class="home-analysis-archive" hidden inert>');
homePage = replaceOnce(homePage, '<section class="bar kakao-tools"', '</div><section class="bar kakao-tools"');
homePage = replaceOnce(homePage, '<label><input id="stat-fill-toggle" type="checkbox"> 지역별 통계 색칠</label>', '');
homePage = replaceOnce(homePage, '<label class="fill-control" for="fill-opacity">통계 색상 <input id="fill-opacity" type="range" min="0" max="100" value="65"><output id="fill-value" for="fill-opacity">65%</output></label>', '');
homePage = replaceOnce(homePage, '<span class="product-tag">DENTAL ATLAS</span>', '<span class="product-tag">DENTAL ATLAS</span><a class="lab-link" href="lab.html">실험실</a>');
homePage = replaceOnce(homePage, '통계 색상은 기존 분석 지도와 동일한 값입니다. ', '지역별 치과 통계 색칠은 실험실에서 사용할 수 있습니다. ');
// Keep data provenance reachable from settings without a footer below the map.
const notesStart = homePage.indexOf('<details id="data-notes"');
const notesEnd = homePage.indexOf('</main>', notesStart);
if (notesStart < 0 || notesEnd < notesStart) throw new Error('Cannot locate home data notes');
const homeNotes = homePage.slice(notesStart, notesEnd).trim();
homePage = homePage.slice(0, notesStart) + homePage.slice(notesEnd);
homePage = replaceOnce(homePage, '<div class="clinic-tools">', homeNotes + '<div class="clinic-tools">');
homePage = replaceOnce(homePage, '<header>', '<header id="home-sidebar-header">');
homePage = replaceOnce(homePage, '<div class="settings-heading">지도 표시</div>', '<div class="settings-heading">지도 표시</div><label class="fill-control" for="basemap-opacity">카카오맵 배경 <input id="basemap-opacity" type="range" min="0" max="100" step="5" value="100"><output id="basemap-opacity-value" for="basemap-opacity">100%</output></label>');
homePage = replaceOnce(homePage, '<section class="bar kakao-tools"', '<section id="home-sidebar-tools" class="bar kakao-tools"');
homePage = replaceOnce(homePage, '</main>', '<button id="home-sidebar-toggle" type="button" aria-label="왼쪽 메뉴 접기" aria-controls="home-sidebar-header home-sidebar-tools" aria-expanded="true">‹</button></main>');
const sidebarVersion=createHash('sha256').update(readFileSync(resolve(root,'home-sidebar.js'))).digest('hex').slice(0,12);
homePage = replaceOnce(homePage, '</body>', `<script src="home-sidebar.js?v=${sidebarVersion}"></script></body>`);
const output = {
  'index.html': '<!-- Generated by scripts/build-kakao.mjs from legacy/index.html. Kakao-only public entry. -->\n' + homePage,
  'kakao.html': '<!-- Generated compatibility entry; the default page is now Kakao-only. -->\n' + homePage,
  'lab.html': '<!-- Generated laboratory entry; statistical fill is retained here. -->\n' + labPage,
  'kakao-core.js': '// Generated from legacy/index.html. The analytical calculations are shared; map rendering is Kakao-only.\n' + core.trimEnd() + '\n'
};
for (const [name, content] of Object.entries(output)) {
  if (process.argv.includes('--check')) {
    if (readFileSync(resolve(root,name),'utf8') !== content) throw new Error(`${name} is stale; run node web/scripts/build-kakao.mjs`);
  } else writeFileSync(resolve(root,name),content);
}
console.log(process.argv.includes('--check') ? 'Kakao analytical UI and calculations are in sync.' : 'Built home, compatibility, laboratory and analytical core from the archived analytical page.');
