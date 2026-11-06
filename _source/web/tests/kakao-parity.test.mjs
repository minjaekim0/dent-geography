import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const read = name => readFileSync(resolve(dist,name),'utf8');
const source = readFileSync(resolve(dist, '../legacy/index.html'),'utf8');
const original = source.slice(source.indexOf('</main><script>')+'</main><script>'.length,source.lastIndexOf('</script>'));
const migrated = read('kakao-core.js');
const data = Object.fromEntries(['district-boundaries','eupmyeondong-boundaries','specialties','facility-history','api-yearly-events','daytime_population_2020'].map(name=>[name,JSON.parse(read('data/'+name+'.json'))]));

function node() {
  return {textContent:'',innerHTML:'',hidden:false,disabled:false,value:'range',dataset:{},style:{},
    setAttribute(){},insertAdjacentHTML(){},insertAdjacentText(){},replaceChildren(){},
    querySelector(){return node()},querySelectorAll(){return []},prepend(){}};
}
function analysis(script) {
  const nodes=new Map();
  const document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)},querySelectorAll(){return []}};
  const context=vm.createContext({document,Intl,console,fetch:()=>new Promise(()=>{}),requestAnimationFrame:()=>0,cancelAnimationFrame(){},__data:structuredClone(data)});
  vm.runInContext(script,context);
  vm.runInContext(`
    D=__data['district-boundaries'].features; L=__data['eupmyeondong-boundaries'].features;
    FH=__data['facility-history']; SP=__data.specialties; Y=__data['api-yearly-events'];
    D.forEach(f=>f.properties.daytimePopulation=__data.daytime_population_2020.districts[f.properties.code]?.daytimePopulation);
    applySpecialties();
    globalThis.api={
      run(settings){
        Object.assign(S,settings);facilityScale=settings.scale||'count';S.specialtyScale=settings.scale||'count';facilityYear=settings.year||2026;
        year=settings.first||2025;yearEnd=settings.last||year;
        if(isEvent()){E=aggregateYears(year,yearEnd);O=E;applyEvents();applyLocalOpenings()}
        const features=settings.level==='local'?L:D;
        panel(settings.level||'district',features,'곳');
        const max=scaleMax(features);
        return {values:features.map(f=>[f.properties.code,v(f.properties),rate(f.properties)]),max,colors:features.map(f=>paint(rate(f.properties),max)),aggregate:isEvent()?E:null};
      },
      aggregate:aggregateYears,normalize:normalizePeriod,
      legend(){const el={innerHTML:'',querySelector(){return {style:{}}}};paintLegend(el,scaleMax(D));return el.innerHTML}
    };
  `,context);
  // Sorting and color values are compared without DOM layout or a live map API dependency.
  return {api:context.api,panel(level){return ['count','label','total','rate-label','rate','title','ranking'].map(x=>{const n=nodes.get('#'+level+'-'+x);return [x,n.textContent,n.innerHTML]})}};
}
const baseline=analysis(original),kakao=analysis(migrated);
const plain=value=>JSON.parse(JSON.stringify(value));

test('all facility years, population denominators, dentists and 13 specialty choices retain exact values/colors/rankings',()=>{
  let configurations=0;
  for(const level of ['district','local']){
    const choices=[];
    for(const year of [2023,2024,2025,2026])for(const scale of ['count','rate'])for(const denom of level==='local'?['resident']:['resident','daytime'])choices.push({metric:'dentalFacilities',year,scale,denom});
    for(const denom of level==='local'?['resident']:['resident','daytime'])choices.push({metric:'dentalDentists',denom});
    for(const specialty of ['__TOTAL__','__WITHOUT_GENERAL__',...data.specialties.specialties])for(const scale of ['count','rate'])for(const denom of level==='local'?['resident']:['resident','daytime'])choices.push({metric:'specialty',specialty,scale,denom});
    for(const settings of choices){
      settings.level=level;
      assert.deepEqual(plain(kakao.api.run(settings)),plain(baseline.api.run(settings)),JSON.stringify(settings));
      assert.deepEqual(kakao.panel(level),baseline.panel(level),JSON.stringify(settings));
      configurations++;
    }
  }
  console.log('Analytical configurations compared:',configurations);
});

test('every 2000–2025 cumulative interval has identical totals, region assignments and coverage',()=>{
  let intervals=0;
  for(let first=2000;first<=2025;first++)for(let last=first;last<=2025;last++){
    const actual=kakao.api.aggregate(first,last);
    assert.deepEqual(plain(actual),plain(baseline.api.aggregate(first,last)));
    for(const kind of ['openings','closures']){
      let expected=0;for(let year=first;year<=last;year++)expected+=data['api-yearly-events'].years[year].totals[kind];
      assert.equal(actual.totals[kind],expected);
    }
    intervals++;
  }
  console.log('Cumulative intervals compared:',intervals);
});

test('each event metric retains colors, zero/missing treatment and ranking at both levels',()=>{
  for(const level of ['district','local'])for(const metric of ['openings','closures','net'])for(const [first,last] of [[2000,2000],[2025,2025],[2018,2022],[2016,2025],[2000,2025]]){
    const settings={level,metric,first,last};
    assert.deepEqual(plain(kakao.api.run(settings)),plain(baseline.api.run(settings)),JSON.stringify(settings));
    assert.deepEqual(kakao.panel(level),baseline.panel(level));
  }
});

test('period clamping and 3/5/10-year windows retain their boundary behavior',()=>{
  for(const size of [0,3,5,10])for(const first of [1990,2000,2010,2025,2030])for(const last of [1999,2010,2025,2040])assert.deepEqual(plain(kakao.api.normalize(first,last,2000,2025,size)),plain(baseline.api.normalize(first,last,2000,2025,size)));
});

function renderer(page) {
  const events=[];
  const controls = new Map();
  for (const selector of ['#stat-fill-toggle', '#fill-opacity', '#fill-value']) {
    if (page === 'home') continue;
    controls.set(selector, {checked:false, addEventListener(type, listener){this[type] = listener;}});
  }
  const document = {querySelector(selector){
    if (!page) return {addEventListener(){}};
    if (selector === 'main') return {dataset:page === 'home' ? {statFill:'off'} : {}};
    return controls.get(selector) ?? (selector.startsWith('#fill-') || selector === '#stat-fill-toggle' ? null : {addEventListener(){}});
  }};
  class LatLng {constructor(lat,lng){this.lat=lat;this.lng=lng}}
  class Shape {constructor(options){this.options=options}setOptions(options){this.updates=(this.updates||0)+1;Object.assign(this.options,options)}setMap(map){this.map=map}}
  const ctx=vm.createContext({document,Map,Set,console,performance,
    requestAnimationFrame:fn=>{fn();return 1},cancelAnimationFrame(){},
    kakao:{maps:{LatLng,Polygon:Shape,Polyline:Shape,event:{addListener(...args){events.push(args)}}}},
    polys:g=>g.type==='Polygon'?[g.coordinates]:g.coordinates,
    rate:p=>p.value,paint:(value,max)=>'color:'+value+'/'+max,S:{metric:'net',metro:false},T:null,mc:()=>'',D:[]});
  vm.runInContext(read('kakao-map.js')+'\nglobalThis.api={boundingBox,intersects,prepareFeatures,kakaoPath,KakaoAnalysisMap};',ctx);
  return {api:ctx.api,ctx,events,controls};
}

test('home keeps fill and legend disabled across metric changes; laboratory can toggle and adjust it',()=>{
  const part={feature:{properties:{code:'a',value:4}}};
  const home=renderer('home');
  const map=new home.api.KakaoAnalysisMap({id:'map'});map.max=10;map.state={selected:'a'};
  for (const metric of ['dentalFacilities','specialty','net']) {
    home.ctx.S.metric=metric;
    assert.equal(map.options(part).fillOpacity,0);
    assert.equal(map.options(part).strokeColor,'#ff9c24');
  }
  const lab=renderer('lab');
  const controller=new lab.api.KakaoAnalysisMap({id:'map'});controller.max=10;controller.state={selected:null};
  controller.legend={hidden:true};controller.schedule=()=>{};
  lab.ctx.clinicMapControllers.set('map',controller);
  const toggle=lab.controls.get('#stat-fill-toggle'),opacity=lab.controls.get('#fill-opacity');
  assert.equal(controller.options(part).fillOpacity,0);
  toggle.change({target:{checked:true}});
  assert.equal(controller.options(part).fillOpacity,.65);
  assert.equal(controller.legend.hidden,false);
  opacity.input({target:{value:'40'}});
  assert.equal(controller.options(part).fillOpacity,.4);
  toggle.change({target:{checked:false}});
  assert.equal(controller.options(part).fillOpacity,0);
  assert.equal(controller.legend.hidden,true);
  toggle.change({target:{checked:true}});
  assert.equal(controller.options(part).fillOpacity,.4);
});
test('Kakao geometry preserves multipolygon islands, holes, every coordinate and lat/lng ordering',()=>{
  const {api}=renderer();
  for(const name of ['district-boundaries','eupmyeondong-boundaries']){
    const features=data[name].features,parts=api.prepareFeatures(features);
    assert.equal(parts.length,features.reduce((n,f)=>n+(f.geometry.type==='Polygon'?1:f.geometry.coordinates.length),0));
    for(const part of parts){
      const path=api.kakaoPath(part.rings);
      assert.equal(path.length,part.rings.length);
      for(let i=0;i<path.length;i++){
        assert.equal(path[i].length,part.rings[i].length);
        for(let j=0;j<path[i].length;j++)assert.deepEqual([path[i][j].lng,path[i][j].lat],part.rings[i][j]);
      }
    }
  }
});
test('viewport culling preserves intersecting boundaries; colors update in place and selected outlines clear',()=>{
  const {api,events}=renderer();
  assert.equal(api.intersects([0,0,3,3],[2,2,4,4]),true);
  assert.equal(api.intersects([0,0,3,3],[3,3,4,4]),true);
  assert.equal(api.intersects([0,0,1,1],[2,2,4,4]),false);
  const controller=new api.KakaoAnalysisMap({id:'local-map'});controller.map={};controller.max=10;controller.state={selected:'a'};
  const part={feature:{properties:{code:'a',value:4}},rings:[[[127,37],[128,37],[127,38],[127,37]]],attached:false};
  controller.attachPolygon(part,false);const shape=part.shape;
  assert.equal(shape.options.strokeColor,'#ff9c24');assert.equal(shape.map,controller.map);assert.equal(events.length,3);
  controller.attachPolygon(part,false);assert.equal(shape.updates||0,0,'unchanged pan must not restyle geometry');
  controller.state.selected=null;part.feature.properties.value=-4;controller.attachPolygon(part,false);
  assert.equal(shape.updates,1,'a real metric/selection change must update the same shape');
  assert.equal(part.shape,shape);assert.equal(shape.options.fillColor,'color:-4/10');assert.equal(shape.options.strokeColor,'#8193a0');
});

test('Kakao build is independent of legacy projection and works below a project URL prefix',()=>{
  assert.doesNotMatch(migrated,/createSVGPoint|createElementNS|setPointerCapture\(id\)|Math\.cos\(36\.5/);
  assert.doesNotMatch(read('kakao.html')+migrated,/(?:href|src)="\/data\/|fetch\('\/data\//);
  assert.match(read('kakao-map.js'),/new kakao\.maps\.Polygon/);
  assert.match(read('kakao-map.js'),/new kakao\.maps\.Polyline/);
});

test('statistical fill can be disabled independently while selection and the chosen opacity survive',()=>{
  const {api,ctx}=renderer();
  const controller=new api.KakaoAnalysisMap({id:'map'});controller.max=10;controller.state={selected:'a'};
  const part={feature:{properties:{code:'a',value:4}}};
  assert.equal(controller.options(part).fillOpacity,.65);
  vm.runInContext('statFillEnabled=false',ctx);
  assert.equal(controller.options(part).fillOpacity,0);
  assert.equal(controller.options(part).strokeColor,'#ff9c24');
  controller.state.selected=null;
  assert.equal(controller.options(part).strokeOpacity,.18);
  vm.runInContext('fillOpacity=.4;statFillEnabled=true',ctx);
  assert.equal(controller.options(part).fillOpacity,.4);
  assert.equal(controller.options(part,true).fillOpacity,0);
});
