import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(){
  const messages=[];
  const node=(hidden=false,dataset={})=>({hidden,dataset,style:{},attributes:{},textContent:'',setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return k==='src'?this.src:this.attributes[k];}});
  const panel=node(true),frame=node(false,{src:'population.html?embed=1'}),status=node(),subtitle=node(),date=node();
  const changePanel=node(true),changeFrame=node(false,{src:'population.html?embed=1&mode=change'}),changeStatus=node(),eventBar=node(true),eventKinds=['net','populationChange'].map(eventKind=>node(false,{eventKind}));
  changeFrame.contentWindow={postMessage:m=>messages.push({...m,change:true})};
  frame.contentWindow={postMessage:m=>messages.push(m)};
  const switches=[node(),node()],labels=[node(),node()],bar=node();
  bar.querySelectorAll=s=>s==='.switch'?switches:labels;
  const sectionButtons=['dental','events'].map(section=>node(false,{section}));
  const metrics=['dentalFacilities','population'].map(metric=>node(false,{metric}));
  const targetSelectors=['#district','#local','.kakao-tools','#data-notes','header .actions .switch','[aria-label="지도 분류"] .filter','[data-panel="facilities"]','[data-panel="specialty"]','[data-panel="events"]'];
  const targets=Object.fromEntries(targetSelectors.map((s,i)=>[s,[node(i===1||i>=7)]]));
  const nodes={'#population-panel':panel,'#population-frame':frame,'#population-panel-status':status,'[aria-label="치과 현황 지표"]':bar,'#subtitle':subtitle,'.asof':date};
  Object.assign(nodes,{'#population-change-panel':changePanel,'#population-change-frame':changeFrame,'#population-change-panel-status':changeStatus,'#event-metric-bar':eventBar});
  const daytimeFrame=node(false,{src:'daytime.html?embed=1'});daytimeFrame.contentWindow={postMessage:m=>messages.push(m)};
  Object.assign(nodes,{'#daytime-panel':node(true),'#daytime-frame':daytimeFrame,'#daytime-panel-status':node()});
  targets['[data-panel="events"]'].push(eventBar);
  let handler,suspended=0;
  const context=vm.createContext({document:{querySelector:s=>nodes[s],querySelectorAll:s=>s==='[data-section]'?sectionButtons:s==='[data-metric]'?metrics:s==='[data-event-kind]'?eventKinds:s==='[data-panel="dental"]'?[bar]:targets[s]||[]},location:{origin:'http://test.local'},kakaoControllers:new Map([['map',{suspend(){suspended++;}}]]),window:{addEventListener(type,fn){handler=fn;}}});
  vm.runInContext(readFileSync(new URL('../dist/kakao-population-panel.js',import.meta.url),'utf8'),context);
  return {api:context.window.populationPanel,panel,frame,status,subtitle,date,switches,labels,bar,targets,metrics,sectionButtons,messages,changePanel,changeFrame,changeStatus,eventBar,eventKinds,daytimeFrame,daytimePanel:nodes['#daytime-panel'],get suspended(){return suspended;},send:data=>handler(data)};
}

test('population selection is inline and lazy, hides dental-only controls, and restores prior view',()=>{
  const f=fixture();
  assert.equal(f.api.render('dentalFacilities'),false);assert.equal(f.frame.src,undefined);
  assert.equal(f.api.render('population'),true);assert.equal(f.frame.src,'population.html?embed=1');
  assert.equal(f.panel.hidden,false);assert.equal(f.bar.hidden,false);assert.equal(f.suspended,1);
  for(const nodes of Object.values(f.targets))assert.ok(nodes.every(n=>n.hidden));
  assert.ok(f.switches[1].hidden&&f.labels[1].hidden);
  assert.equal(f.metrics[1].attributes['aria-pressed'],'true');
  assert.equal(f.sectionButtons[0].attributes['aria-pressed'],'true');
  f.api.render('population');assert.equal(f.suspended,1); // Async redraw does not reset filters or iframe.
  assert.equal(f.api.render('net'),false);
  assert.equal(f.panel.hidden,true);assert.equal(f.targets['#district'][0].hidden,false);assert.equal(f.targets['#local'][0].hidden,true);
  assert.equal(f.switches[1].hidden,false);assert.equal(f.messages.at(-1).visible,false);
  f.api.render('population');assert.equal(f.messages.at(-1).visible,true);
});

test('only same-origin child messages resize the panel and update the active population header',()=>{
  const f=fixture();f.api.render('population');
  const message={type:'population-layout',height:1800,date:'2025년 12월 말',subtitle:'65세 이상 · 여자',loaded:true};
  f.send({origin:'https://other.example',source:f.frame.contentWindow,data:message});assert.equal(f.frame.style.height,undefined);
  f.send({origin:'http://test.local',source:{},data:message});assert.equal(f.frame.style.height,undefined);
  f.send({origin:'http://test.local',source:f.frame.contentWindow,data:message});
  assert.equal(f.frame.style.height,'1800px');assert.equal(f.subtitle.textContent,message.subtitle);assert.equal(f.status.hidden,true);
  f.api.render('dentalFacilities');f.subtitle.textContent='치과기관 수';
  f.send({origin:'http://test.local',source:f.frame.contentWindow,data:{...message,height:Infinity}});
  assert.equal(f.frame.style.height,'1800px');assert.equal(f.subtitle.textContent,'치과기관 수');
});

test('generated integration hook precedes dental calculations, and embedded mode retains standalone support',()=>{
  const html=readFileSync(new URL('../dist/kakao.html',import.meta.url),'utf8');
  const core=readFileSync(new URL('../dist/kakao-core.js',import.meta.url),'utf8');
  assert.match(html,/data-metric="population"/);
  assert.match(html,/data-event-kind="populationChange"/);
  assert.match(html,/data-metric="daytime"/);
  assert.ok(!/<div class="title-row">[^\n]*href="population.html"/.test(html));
  assert.match(html, /src="kakao-core\.js\?v=[a-f0-9]{12}"/);
  assert.ok(html.indexOf('src="kakao-population-panel.js"')<html.indexOf('src="kakao-core.js?v='));
  assert.match(core,/function redraw\(live=false\)\{if\(globalThis.populationPanel\?\.render\(S.metric\)\)return;eventLabels\(\);/);
});

test('official daytime census is an independent dental-status metric with lazy loading',()=>{
  const f=fixture();assert.equal(f.api.render('daytime'),true);
  assert.equal(f.daytimeFrame.src,'daytime.html?embed=1');assert.equal(f.daytimePanel.hidden,false);
  assert.equal(f.bar.hidden,false);assert.equal(f.eventBar.hidden,true);assert.equal(f.frame.src,undefined);
  f.send({origin:'http://test.local',source:f.daytimeFrame.contentWindow,data:{type:'population-layout',height:9000,subtitle:'시군구별 공식 주간인구',date:'2005년 조사',loaded:true}});
  assert.equal(f.date.textContent,'2005년 조사');assert.equal(f.daytimeFrame.style.height,'9000px');
  f.api.render('population');assert.equal(f.daytimePanel.hidden,true);
  f.api.render('daytime');assert.equal(f.date.textContent,'2005년 조사');
  f.api.render('dentalFacilities');assert.equal(f.daytimePanel.hidden,true);assert.equal(f.switches[1].hidden,false);
});

test('event population change has independent state and child messages, while event metric navigation stays visible',()=>{
  const f=fixture();f.api.render('populationChange');
  assert.equal(f.changeFrame.src,'population.html?embed=1&mode=change');
  assert.equal(f.frame.src,undefined);assert.equal(f.bar.hidden,true);assert.equal(f.eventBar.hidden,false);
  assert.equal(f.changePanel.hidden,false);assert.equal(f.eventKinds[1].attributes['aria-pressed'],'true');
  assert.equal(f.sectionButtons[1].attributes['aria-pressed'],'true');
  f.send({origin:'http://test.local',source:f.changeFrame.contentWindow,data:{type:'population-layout',height:2100,subtitle:'인구 증감',loaded:true}});
  assert.equal(f.changeFrame.style.height,'2100px');assert.equal(f.changeStatus.hidden,true);
  f.api.render('population');assert.equal(f.changePanel.hidden,true);assert.equal(f.bar.hidden,false);assert.equal(f.eventBar.hidden,true);
  f.send({origin:'http://test.local',source:f.changeFrame.contentWindow,data:{type:'population-layout',height:2200,subtitle:'숨겨진 증감'}});
  assert.notEqual(f.subtitle.textContent,'숨겨진 증감');
  f.api.render('populationChange');assert.equal(f.frame.src,'population.html?embed=1');assert.equal(f.changeFrame.src,'population.html?embed=1&mode=change');
  assert.equal(f.api.render('openings'),false);assert.equal(f.bar.hidden,false);assert.equal(f.switches[1].hidden,false);assert.equal(f.changePanel.hidden,true);
});
