import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('workspace navigation restores dental, event and demographic choices independently', () => {
  const button = section => ({dataset:{section},attributes:{},setAttribute(k,v){this.attributes[k]=v;}});
  const dental=button('dental'), events=button('events'), population=button();
  const document={body:{dataset:{}},addEventListener(){},querySelectorAll:selector=>selector==='[data-section]'?[dental,events]:[],querySelector:selector=>selector==='#population-nav'?population:{contains(){return false;}}};
  const context=vm.createContext({document,window:{},S:{metric:'dentalFacilities'}});
  context.globalThis=context;
  context.redraw=()=>context.refreshWorkspace(context.S.metric);
  vm.runInContext(readFileSync(new URL('../dist/workspace.js',import.meta.url),'utf8'),context);
  context.S.metric='specialty';context.redraw();
  population.onclick();assert.equal(context.S.metric,'population');
  assert.equal(dental.attributes['aria-pressed'],'false');assert.equal(population.attributes['aria-pressed'],'true');
  context.S.metric='daytimeChange';context.redraw();
  events.onclick();assert.equal(context.S.metric,'net');
  context.S.metric='closures';context.redraw();
  dental.onclick();assert.equal(context.S.metric,'specialty');
  population.onclick();assert.equal(context.S.metric,'daytimeChange');
  events.onclick();assert.equal(context.S.metric,'closures');
  assert.equal(context.document.body.dataset.workspace,'events');
  context.S.metric='populationHeatmap';context.redraw();
  assert.equal(context.document.body.dataset.workspace,'population');
  dental.onclick();population.onclick();assert.equal(context.S.metric,'populationHeatmap');
});
