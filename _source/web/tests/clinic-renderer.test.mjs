import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {decodeClinicIndex,createClinicIndex,clinicDisplayPlan,placeLink} from '../dist/clinic-model.mjs';
const source=readFileSync(new URL('../dist/kakao-clinics.js',import.meta.url),'utf8').replace(/^import .*;\n/,'');
const payload=JSON.parse(readFileSync(new URL('../dist/data/current-clinics-index.json',import.meta.url),'utf8'));
function setup({docked=false}={}){
  const nodes=new Map(),events=new Map(),created=[],requests=[],dispatched=[];
  const el=()=>({checked:true,value:'all',dataset:{},style:{},textContent:'',children:[],classList:{toggle(){}},append(...children){for(const child of children){child.parent=this;this.children.push(child);}},replaceChildren(...children){this.children.forEach(c=>c.parent=null);this.children=[];this.append(...children);},remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}},setAttribute(){},addEventListener(){},closest(){return null;}});
  const document={createElement:el,querySelector(key){if(key==='#catchment-clinic-details'&&!docked)return null;if(!nodes.has(key))nodes.set(key,el());return nodes.get(key);}};
  class Overlay {constructor(options){this.options=options;created.push(this);this.attaches=0;}setMap(map){this.map=map;if(map)this.attaches++;}setPosition(p){this.options.position=p;}setImage(image){this.options.image=image;}}
  class Info {setContent(content){this.content=content;}open(){this.opened=true;}close(){this.opened=false;}setPosition(){}}
  const ctx=vm.createContext({document,decodeClinicIndex,createClinicIndex,clinicDisplayPlan,placeLink,Map,Set,URL,performance,clearTimeout,setTimeout,
    window:{dispatchEvent:event=>dispatched.push(event)},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
    fetch:async url=>{requests.push(url);return {ok:true,json:async()=>url.includes('current-clinics-index')?payload:{fixture:{id:'fixture',name:'테스트치과',address:'서울 테스트로 1',source:'kakao',placeUrl:'https://place.map.kakao.com/123'}}};},
    kakao:{maps:{Marker:Overlay,CustomOverlay:Overlay,InfoWindow:Info,MarkerImage:class{constructor(src,size){this.size=size;this.src=src;}},Size:class{constructor(width,height){this.width=width;this.height=height;}},LatLng:class{constructor(lat,lng){this.lat=lat;this.lng=lng;}},event:{addListener(target,type,fn){events.set(target,fn)},preventMap(){}}}}});
  vm.runInContext(source+'\nglobalThis.testApi={renderNow,clear,states,openClinic,closeInfo,groupList};',ctx);
  const controller={el:{clientWidth:900,clientHeight:520,closest(){return null;}},map:{getLevel(){return 13;}},viewport:()=>[124,33,132,40]};
  return {api:ctx.testApi,controller,nodes,created,requests,dispatched};
}
test('renderer bounds live SDK objects, reuses a stable view, handles filters, and detaches on toggle',async()=>{
  const {api,controller,nodes,created,requests}=setup();
  await api.renderNow(controller);
  const state=api.states.get(controller),initial=created.length;
  assert.ok(initial<=240);assert.equal(requests.length,1);assert.match(requests[0],/current-clinics-index/);
  assert.equal(nodes.get('#clinic-status').textContent.includes('19,623'),true);
  await api.renderNow(controller);
  assert.equal(created.length,initial);assert.ok(created.every(o=>o.attaches===1));
  nodes.get('#clinic-source').value='hira_unverified';await api.renderNow(controller);
  assert.equal(nodes.get('#clinic-status').textContent.includes('606'),true);
  assert.ok(state.overlays.size<=240);
  nodes.get('#clinic-toggle').checked=false;await api.renderNow(controller);
  assert.equal(state.overlays.size,0);assert.ok(created.every(o=>!o.map));
});

test('displayed 16x switches dense clinics to dots, sizes and borders grow on zoom, and 8x restores clusters',async()=>{
  const {api,controller}=setup();
  controller.homeLevel=13;let level=10;controller.map.getLevel=()=>level;
  controller.viewport=()=>[126.95,37.45,127.1,37.6];
  await api.renderNow(controller);
  const state=api.states.get(controller);
  assert.ok([...state.overlays.values()].some(r=>r.button&&r.button.textContent));
  level=9;await api.renderNow(controller);
  assert.ok(state.overlays.size>240);
  assert.ok([...state.overlays.values()].every(r=>r.entry.count===1||(r.entry.displayAsDot&&r.button.textContent==='')));
  let marker=[...state.overlays.values()].find(r=>r.entry.count===1);
  assert.equal(marker.overlay.options.image.size.width,6);
  const overlay=marker.overlay;
  assert.match(decodeURIComponent(marker.overlay.options.image.src),/stroke-width="0.5"/);
  level=8;await api.renderNow(controller);
  assert.equal(marker.overlay,overlay);assert.equal(marker.overlay.options.image.size.width,8);
  assert.match(decodeURIComponent(marker.overlay.options.image.src),/stroke-width="0.75"/);
  level=7;await api.renderNow(controller);
  assert.equal(marker.overlay.options.image.size.width,10);
  level=6;await api.renderNow(controller);
  assert.equal(marker.overlay.options.image.size.width,12);
  level=10;await api.renderNow(controller);
  assert.ok(state.overlays.size<=240);
  assert.ok([...state.overlays.values()].some(r=>r.button&&r.button.textContent));
});

test('home map docks clinic details, keeps them when panning, replaces them with grouped lists, and closes cleanly',async()=>{
  const {api,controller,nodes,dispatched}=setup({docked:true});
  await api.renderNow(controller);const state=api.states.get(controller);
  const point={id:'fixture',name:'테스트치과',lat:37.5,lng:127,source:'kakao',detailChunk:0};
  await api.openClinic(state,point);
  const dock=nodes.get('#catchment-clinic-details');
  assert.equal(dock.children.length,1);assert.equal(state.info.opened,false);
  assert.ok(dock.children[0].children.some(c=>c.textContent==='서울 테스트로 1'));
  assert.equal(dispatched[0].type,'clinic-catchment');
  controller.viewport=()=>[128,35,129,36];await api.renderNow(controller);
  assert.equal(dock.children.length,1);assert.equal(state.openPoint.id,'fixture');
  api.groupList(state,{members:[point],count:1,lat:37.5,lng:127});
  assert.equal(dispatched.at(-1).type,'clinic-list');assert.equal(dock.children.length,1);
  assert.match(dock.children[0].className,/clinic-group-card/);assert.equal(state.info.opened,false);
  api.closeInfo(state);assert.equal(dock.children.length,0);assert.equal(state.openPoint,null);
});
test('analytical pages without a detail dock retain the map popup',async()=>{
  const {api,controller}=setup();await api.renderNow(controller);const state=api.states.get(controller);
  await api.openClinic(state,{id:'fixture',name:'테스트치과',lat:37.5,lng:127,source:'kakao',detailChunk:0});
  assert.equal(state.info.opened,true);assert.ok(state.info.content.children.some(c=>c.textContent==='서울 테스트로 1'));
});
