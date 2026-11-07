(() => {
  const home=document.querySelector('main[data-home-map]');
  if(!home)return;
  const toggle=document.querySelector('#home-sidebar-toggle');
  const panels=[document.querySelector('#home-sidebar-header'),document.querySelector('#home-sidebar-tools')];
  const mapLayout=home.querySelector('.layout:not([hidden])');
  const layers=home.querySelector('.map-layers'),settings=home.querySelector('.map-settings');
  if(mapLayout&&layers&&settings){
    const controls=document.createElement('section');controls.className='home-map-controls';controls.setAttribute('aria-label','지도 표시 및 설정');
    const heading=document.createElement('h2');heading.textContent='지도 표시';controls.append(heading,layers,settings);mapLayout.append(controls);
  }
  const narrow=window.matchMedia('(max-width:700px)');
  function setOpen(open){
    if(narrow.matches)open=true;
    home.dataset.sidebar=open?'open':'closed';
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'왼쪽 메뉴 접기':'왼쪽 메뉴 열기');
    toggle.textContent=open?'‹':'›';
    for(const panel of panels)panel.inert=!open;
    window.dispatchEvent(new Event('resize'));
  }
  toggle.addEventListener('click',()=>setOpen(home.dataset.sidebar!=='open'));
  narrow.addEventListener('change',()=>setOpen(true));
  const opacity=document.querySelector('#basemap-opacity'),value=document.querySelector('#basemap-opacity-value');
  opacity.addEventListener('input',()=>{window.dispatchEvent(new Event('basemap-style'));home.style.setProperty('--basemap-opacity',Number(opacity.value)/100);value.value=opacity.value+'%';});
  home.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&panels.some(panel=>panel.contains(event.target))&&home.dataset.sidebar==='open'&&!document.querySelector('.map-settings').open){setOpen(false);toggle.focus();}
  });
  setOpen(true);
})();
