import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleClinics,placeLink} from '../dist/clinic-model.mjs';
const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
test('bounds and source filter preserve exact selected coordinates',()=>{
  const points=[{id:1,lng:127,lat:37,source:'kakao'},{id:2,lng:127.1,lat:37.1,source:'hira_unverified'},{id:3,lng:128,lat:38,source:'kakao'},{id:4,lng:NaN,lat:37,source:'kakao'}];
  assert.deepEqual(visibleClinics(points,[126,36,127.2,37.2]).map(p=>p.id),[1,2]);
  assert.deepEqual(visibleClinics(points,[126,36,127.2,37.2],'kakao').map(p=>p.id),[1]);
  assert.deepEqual(visibleClinics(points,[126,36,127.2,37.2],'hira_unverified').map(p=>p.id),[2]);
});
test('only real Kakao place links are clickable',()=>{
  assert.equal(placeLink('http://place.map.kakao.com/123'),'https://place.map.kakao.com/123');
  for(const value of [null,'javascript:alert(1)','https://evil.example/123','https://place.map.kakao.com.evil.example/123'])assert.equal(placeLink(value),null);
});
test('public data exposes selected points and no original provider identifiers',()=>{
  const data=JSON.parse(read('../dist/data/current-clinics.json'));
  assert.equal(data.locations.length,19621);assert.equal(data.unlocated,3);
  assert.equal(data.locations.filter(p=>p.source==='kakao').length,16425);
  assert.equal(data.locations.filter(p=>p.source==='hira_unverified').length,3196);
  assert.equal(new Set(data.locations.map(p=>p.id)).size,data.locations.length);
  assert.ok(data.locations.every(p=>p.lng>=124&&p.lng<=132&&p.lat>=33&&p.lat<=39.5));
  assert.doesNotMatch(JSON.stringify(data),/facilityKey|암호화요양기호|KAKAO_REST_API_KEY/);
});
