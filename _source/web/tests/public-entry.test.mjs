import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('default and compatibility entries expose only the Kakao renderer', () => {
  const main = read('../dist/index.html'), alias = read('../dist/kakao.html');
  assert.equal(main.slice(main.indexOf('\n')), alias.slice(alias.indexOf('\n')));
  for (const html of [main, alias]) {
    assert.match(html, /src="kakao-map.js\?v=[a-f0-9]+"/);
    assert.match(html, /data-metric="daytime"/);
    assert.match(html, /data-event-kind="populationChange"/);
    assert.doesNotMatch(html, /기존 지도|original-link|createSVGPoint|createElementNS/);
    assert.doesNotMatch(html, /id="metro"|지하철 노선/);
  }
  for (const page of ['population','daytime']) assert.doesNotMatch(read(`../dist/${page}.html`), /기존 지도/);
  assert.doesNotMatch(read('../dist/kakao-core.js'), /querySelector\('#metro'\)|fetch\('data\/transport-network.json'\)/);
});

test('legacy renderer is preserved outside the public directory', () => {
  assert.match(read('../legacy/index.html'), /createSVGPoint/);
  assert.equal(existsSync(new URL('../dist/legacy/index.html', import.meta.url)), false);
  assert.match(read('../scripts/build-kakao.mjs'), /legacy\/index.html/);
});

test('home has no statistical fill controls; laboratory retains them and links back', () => {
  for (const entry of ['index.html', 'kakao.html']) {
    const html = read('../dist/' + entry);
    assert.match(html, /data-stat-fill="off"/);
    assert.doesNotMatch(html, /id="stat-fill-toggle"|id="fill-opacity"|id="fill-value"/);
    assert.match(html, /href="lab.html">실험실<\/a>/);
    assert.match(html, /id="clinic-toggle"/);
    assert.match(html, /id="population-heat-toggle"/);
  }
  const lab = read('../dist/lab.html');
  assert.doesNotMatch(lab, /data-stat-fill="off"/);
  assert.match(lab, /id="stat-fill-toggle"/);
  assert.match(lab, /id="fill-opacity"/);
  assert.match(lab, /href="index.html">기본 홈으로<\/a>/);
});
