// Keep the analytical UI/calculations in sync with the original page; replace only its renderer.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

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
  '<span class="kakao-version-link" aria-label="카카오맵 기반 지도">카카오맵</span>');
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
  'function redraw(live=false){if(globalThis.populationPanel?.render(S.metric))return;eventLabels();');
const eventSwitch = '<div class="switch" aria-label="개원·폐업 표시"><button data-event-kind="openings" aria-pressed="false">개원만 보기</button><button data-event-kind="closures" aria-pressed="false">폐업만 보기</button><button data-event-kind="net" aria-pressed="true">동시에 보기 (+/−)</button></div>';
page = replaceOnce(page, eventSwitch, '');
page = replaceOnce(page, '<section class="bar period-controls" data-panel="events" hidden aria-label="개업·폐업 기간 선택">',
  `<section class="bar" id="event-metric-bar" data-panel="events" hidden aria-label="개원·폐업 지도 지표"><span class="label">지도 지표</span>${eventSwitch.replace('</div>', '<button data-event-kind="populationChange" aria-pressed="false" aria-controls="population-change-panel">인구 증감</button><button data-event-kind="daytimeChange" aria-pressed="false" aria-controls="daytime-change-panel">주간인구 증감</button></div>')}</section><section class="bar period-controls" data-panel="events" hidden aria-label="개업·폐업 기간 선택">`);
// Global SVG rules from the old renderer must never resize SDK-owned shapes.
page = page.replace(/\.map svg:focus,\.map \.area:focus\{[^}]*\}\s*\.map \.area\{[^}]*\}\s*\.map \.area:focus-visible\{[^}]*\}/, '');
page = page.replace(/svg\{display:block;[\s\S]*?pointer-events:none\}\#local-map \.context\{[^}]*\}/, '');
page = replaceOnce(page, '</style><body>', '</style><link rel="stylesheet" href="kakao.css?v=daytime-change-1"><body>');
const mapToolbar = `
<section class="bar kakao-tools" aria-label="카카오 지도 도구">
  <form id="place-search" role="search"><label class="sr-only" for="place-query">카카오 장소·주소 검색</label><input id="place-query" type="search" placeholder="지역·역·주소 검색" maxlength="120" required><button type="submit">검색</button></form>
  <label for="region-picker" class="sr-only">분석 지역 선택</label><select id="region-picker"><option value="">분석 지역 선택</option></select>
  <label class="fill-control" for="fill-opacity">통계 색상 <input id="fill-opacity" type="range" min="0" max="100" value="65"><output id="fill-value" for="fill-opacity">65%</output></label>
  <span class="map-provider">지도·검색 © Kakao</span>
  <div id="search-results" hidden aria-live="polite"></div>
</section>
`;
page = replaceOnce(page, '<section id="district"', mapToolbar + '<section id="district"');
page = replaceOnce(page, '<section id="district"', `<section id="population-panel" hidden aria-label="인구 분포 지도 지표"><p id="population-panel-status" role="status">인구 지도를 불러오는 중입니다. <a href="population.html">별도 화면으로 열기</a></p><iframe id="population-frame" title="연령·성별·연도별 읍면동 인구 분포" data-src="population.html?embed=1"></iframe></section><section id="district"`);
page = replaceOnce(page, '<section id="district"', `<section id="population-change-panel" hidden aria-label="인구 증감 지도 지표"><p id="population-change-panel-status" role="status">인구 증감을 불러오는 중입니다. <a href="population.html?mode=change">별도 화면으로 열기</a></p><iframe id="population-change-frame" title="연령·성별·기간별 읍면동 인구 증감" data-src="population.html?embed=1&amp;mode=change"></iframe></section><section id="district"`);
page = replaceOnce(page, '<section id="district"', `<section id="daytime-panel" hidden aria-label="공식 주간인구 지도 지표"><p id="daytime-panel-status" role="status">공식 주간인구를 불러오는 중입니다. <a href="daytime.html">별도 화면으로 열기</a></p><iframe id="daytime-frame" title="조사연도별 시군구 공식 주간인구" data-src="daytime.html?embed=1"></iframe></section><section id="district"`);
page = replaceOnce(page, '<footer id="foot">', `<p class="map-source-note">배경지도·지명·도로·장소/주소 검색: Kakao. 통계 색상은 기존 분석 지도와 동일한 값입니다. 행정구역 경계는 기존 원자료를 카카오 지도에 표시합니다. 카카오 배경의 최신 지명·경계와 분석 기준 시점이 다를 수 있습니다. <a href="https://apis.map.kakao.com/web/documentation/" target="_blank" rel="noopener">지도 API 안내</a></p><footer id="foot">`);
page = replaceOnce(page, '<section id="district"', `<section id="daytime-change-panel" hidden aria-label="공식 주간인구 증감 지도 지표"><p id="daytime-change-panel-status" role="status">주간인구 증감을 불러오는 중입니다. <a href="daytime.html?mode=change">별도 화면으로 열기</a></p><iframe id="daytime-change-frame" title="연령·성별·조사기간별 시군구 주간인구 증감" data-src="daytime.html?embed=1&amp;mode=change"></iframe></section><section id="district"`);
const coreVersion = createHash('sha256').update(core).digest('hex').slice(0,12);
const panelVersion = createHash('sha256').update(readFileSync(resolve(root,'kakao-population-panel.js'))).digest('hex').slice(0,12);
page += `\n<script src="kakao-map.js"></script>\n<script src="kakao-population-panel.js?v=${panelVersion}"></script>\n<script src="kakao-core.js?v=${coreVersion}"></script>\n</body></html>\n`;
if (/createSVGPoint|createElementNS|Math\.cos\(36\.5/.test(core)) throw new Error('Legacy renderer remains');
const output = {
  'index.html': '<!-- Generated by scripts/build-kakao.mjs from legacy/index.html. Kakao-only public entry. -->\n' + page,
  'kakao.html': '<!-- Generated compatibility entry; the default page is now Kakao-only. -->\n' + page,
  'kakao-core.js': '// Generated from legacy/index.html. The analytical calculations are shared; map rendering is Kakao-only.\n' + core.trimEnd() + '\n'
};
for (const [name, content] of Object.entries(output)) {
  if (process.argv.includes('--check')) {
    if (readFileSync(resolve(root,name),'utf8') !== content) throw new Error(`${name} is stale; run node web/scripts/build-kakao.mjs`);
  } else writeFileSync(resolve(root,name),content);
}
console.log(process.argv.includes('--check') ? 'Kakao analytical UI and calculations are in sync.' : 'Built Kakao-only index.html, kakao.html and kakao-core.js from the archived analytical page.');
