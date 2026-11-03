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
  assert.equal(data.locations.length,19623);assert.equal(data.unlocated,1);
  assert.equal(data.locations.filter(p=>p.source==='kakao').length,17426);
  assert.equal(data.locations.filter(p=>p.source==='hira_unverified').length,2197);
  assert.equal(new Set(data.locations.map(p=>p.id)).size,data.locations.length);
  assert.ok(data.locations.every(p=>p.lng>=124&&p.lng<=132&&p.lat>=33&&p.lat<=39.5));
  assert.doesNotMatch(JSON.stringify(data),/facilityKey|암호화요양기호|KAKAO_REST_API_KEY/);
});

test('reordered brand and location name keeps the same Yeosu clinic identity',()=>{
  const data=JSON.parse(read('../dist/data/current-clinics.json'));
  const clinic=data.locations.find(p=>p.name==='유디여수치과의원');
  assert.equal(clinic.source,'kakao');assert.equal(clinic.kakaoName,'유디치과의원 여수점');
  assert.equal(clinic.address,'전남광주통합특별시 여수시 신월로 806');
});

test('relocated clinic publishes the Kakao address and coordinates together',()=>{
  const data=JSON.parse(read('../dist/data/current-clinics.json'));
  const clinic=data.locations.find(p=>p.name==='서울백운호수치과의원');
  assert.equal(clinic.source,'kakao');assert.equal(clinic.addressSource,'kakao');
  assert.equal(clinic.address,'경기 의왕시 백운중앙로3길 7');
  assert.equal(clinic.lng,127.00291837354568);assert.equal(clinic.lat,37.37151397759283);
  assert.equal(clinic.addressPriorityApplied,true);
});
