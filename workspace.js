/* Workspace navigation coordinates the existing analytical engines without changing values. */
(() => {
  const populationMetrics = new Set(['population','populationHeatmap','populationChange','daytime','daytimeChange']);
  const events = new Set(['openings','closures','net']);
  let dental = 'dentalFacilities', event = 'net', demographic = 'population';
  globalThis.refreshWorkspace = metric => {
    const workspace = populationMetrics.has(metric) ? 'population' : events.has(metric) ? 'events' : 'dental';
    document.body.dataset.workspace = workspace;
    document.body.dataset.metric = metric;
    if (workspace === 'population') demographic = metric;
    else if (workspace === 'events') event = metric;
    else dental = metric;
    document.querySelectorAll('[data-section]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.section === workspace)));
    document.querySelector('#population-nav').setAttribute('aria-pressed', String(workspace === 'population'));
  };
  for (const button of document.querySelectorAll('[data-section]')) button.onclick = () => {
    S.metric = button.dataset.section === 'events' ? event : dental;
    redraw();
  };
  document.querySelector('#population-nav').onclick = () => { S.metric = demographic; redraw(); };
  const settings = document.querySelector('.map-settings');
  document.addEventListener('keydown', e => {if(e.key === 'Escape' && settings.open){settings.open=false;settings.querySelector('summary').focus();}});
  // Changes in disclosure panels affect available map space.
  document.querySelectorAll('.trend-details').forEach(el => el.addEventListener('toggle', () => window.dispatchEvent(new Event('resize'))));
  refreshWorkspace(S.metric);
})();
