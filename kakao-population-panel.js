/* Isolated, lazy same-page demographic panels preserve their own filters/maps. */
(() => {
  const dentalBar=document.querySelector('[aria-label="치과 현황 지표"]');
  const eventBar=document.querySelector('#event-metric-bar');
  const configs=[['population','population','dental','인구 분포'],['populationChange','population-change','events','인구 증감'],['daytime','daytime','dental','공식 주간인구']].map(([metric,id,section,title])=>({
    metric,section,panel:document.querySelector(`#${id}-panel`),frame:document.querySelector(`#${id}-frame`),status:document.querySelector(`#${id}-panel-status`),
    ready:false,subtitle:`${metric==='daytime'?'시군구':'읍면동'}별 연령·성별·연도별 ${title}`,date:'인구 자료 불러오는 중'
  }));
  const saved=new Map();let active=null;
  const hiddenTargets=['#district','#local','.kakao-tools','#data-notes','header .actions .switch','[aria-label="지도 분류"] .filter','[data-panel="facilities"]','[data-panel="specialty"]','[data-panel="events"]','[data-panel="dental"]'];
  function hide(el){if(!saved.has(el))saved.set(el,el.hidden);el.hidden=true;}
  function notify(config,visible){if(config.frame.getAttribute('src'))config.frame.contentWindow.postMessage({type:'population-visibility',visible},location.origin);}
  function updateHeader(config){document.querySelector('#subtitle').textContent=config.subtitle;document.querySelector('.asof').textContent=config.date;}
  window.populationPanel={render(metric){
    const next=configs.find(c=>c.metric===metric);
    if(active&&active!==next){
      notify(active,false);active.panel.hidden=true;active=null;
      for(const[el,hidden]of saved)el.hidden=hidden;saved.clear();
    }
    if(!next)return false;
    if(!active){
      active=next;
      for(const selector of hiddenTargets)document.querySelectorAll(selector).forEach(hide);
      dentalBar.querySelectorAll('.switch')[1]&&hide(dentalBar.querySelectorAll('.switch')[1]);
      dentalBar.querySelectorAll('.label')[1]&&hide(dentalBar.querySelectorAll('.label')[1]);
      if(typeof kakaoControllers!=='undefined')for(const controller of kakaoControllers.values())controller.suspend();
      next.panel.hidden=false;
      if(!next.frame.getAttribute('src'))next.frame.src=next.frame.dataset.src;
      else notify(next,true);
    }
    dentalBar.hidden=next.section!=='dental';eventBar.hidden=next.section!=='events';
    document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.section===next.section)));
    document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.metric===metric)));
    document.querySelectorAll('[data-event-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.eventKind===metric)));
    next.status.hidden=next.ready;updateHeader(next);return true;
  }};
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.data?.type!=='population-layout')return;
    const config=configs.find(c=>c.frame.contentWindow===event.source);if(!config)return;
    const {height,subtitle,date,loaded}=event.data;
    if(Number.isFinite(height)&&height>=200&&height<=300000)config.frame.style.height=Math.ceil(height)+'px';
    if(typeof subtitle==='string')config.subtitle=subtitle;
    if(typeof date==='string')config.date=date;
    config.ready=Boolean(loaded);config.status.hidden=config.ready;
    if(active===config)updateHeader(config);else notify(config,false);
  });
})();
