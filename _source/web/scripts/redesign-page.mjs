// Presentation-only transformations; analytical controls retain their IDs and data attributes.
export function redesignPage(page) {
  page = page.replace('<main>', '<main class="workspace">');
  page = page.replace(/<span class="kakao-version-link" aria-label="카카오맵 기반 지도">카카오맵<\/span><a class="kakao-version-link" href="admin-history.html" target="_blank" rel="noopener">행정구역 변경 내역<\/a>/, '<span class="product-tag">DENTAL ATLAS</span>');
  page = page.replace('<section class="bar" aria-label="지도 분류">', '<section class="workspace-nav" aria-label="지도 분류">');
  page = page.replace('<button data-section="events" aria-pressed="false">개원/폐업</button>', '<button data-section="events" aria-pressed="false">개원·폐업</button><button id="population-nav" aria-pressed="false">인구 분석</button>');
  const demographics = [];
  for (const attribute of ['data-metric="population"', 'data-metric="daytime"', 'data-event-kind="populationChange"', 'data-event-kind="daytimeChange"']) {
    page = page.replace(new RegExp('<button '+attribute+'[^>]*>[\\s\\S]*?<\\/button>'), button => {demographics.push(button); return '';});
  }
  page = page.replace('<section class="bar" data-panel="dental"', '<section class="bar metric-bar" data-panel="dental"');
  page = page.replace('<section class="bar metric-bar"', `<section id="demographic-controls" class="bar"><span class="label">인구 지표</span><div class="switch">${demographics.join('')}</div></section><section class="bar metric-bar"`);
  page = page.replace('동시에 보기 (+/−)', '순증감');
  // The map settings popover retains every original input and the source/coverage notes.
  page = page.replace('<label class="fill-control"', '<details class="map-settings"><summary>지도 설정 <span aria-hidden="true">⌄</span></summary><div class="settings-content"><div class="settings-heading">지도 표시</div><label class="fill-control"');
  page = page.replace('  <span class="map-provider">지도·검색 © Kakao</span>', '');
  const clinicToggle = '<label><input id="clinic-toggle" type="checkbox" checked> 치과 위치 표시</label>';
  page = page.replace(clinicToggle, '');
  page = page.replace('<details class="map-settings">', `<div class="map-layers" aria-label="지도 표시 선택">${clinicToggle}<label><input id="stat-fill-toggle" type="checkbox"> 지역별 통계 색칠</label></div><details class="map-settings">`);
  page = page.replace('심평원(연결 보류)', '심평원(미검증)').replace('심평원 위치만', '심평원 미검증 위치만');
  page = page.replace('  <div id="search-results"', '  </div></details><span class="map-provider">지도·검색 © Kakao</span><div id="search-results"');
  // Keep a compact date/scale row; expand charts only on request.
  page = page.replace(/<div class="period-trend" style="width:100%">([\s\S]*?)<\/div>\s*<span id="facility-rate-note"/, '<details class="trend-details"><summary>연도별 추이 보기</summary><div class="period-trend">$1</div></details><span id="facility-rate-note"');
  page = page.replace(/<div class="period-trend" style="width:100%">([\s\S]*?)<\/div>\s*<\/section>/, '<details class="trend-details"><summary>연도별 추이 · 기간 선택</summary><div class="period-trend">$1</div></details></section>');
  for (const level of ['district', 'local']) {
    page = page.replace(new RegExp('<h2 id="'+level+'-title">([\\s\\S]*?)<ol id="'+level+'-ranking"><\\/ol>'), '<details class="rank-section"><summary>지역 순위 보기</summary><h2 id="'+level+'-title">$1<ol id="'+level+'-ranking"></ol></details>');
  }
  page = page.replace('<div data-panel="specialty" hidden><p id="specialty-note"', '<p class="data-links"><a href="admin-history.html" target="_blank" rel="noopener">행정구역 변경 내역 ↗</a></p><div data-panel="specialty" hidden><p id="specialty-note"');
  return page;
}
