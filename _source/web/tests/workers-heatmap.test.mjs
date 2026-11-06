import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeCells} from '../dist/heatmap-model.mjs';

test('worker source observations and zeros survive every derived level; raster uses the same source',()=>{
  const raw=new URL('../../data/raw/2026-11-07/sgis-workers/',import.meta.url);
  const root=new URL('../dist/data/sgis-workers/',import.meta.url);
  const report=JSON.parse(readFileSync(new URL('collection-manifest.json',raw)));
  const bytes=readFileSync(new URL('manifest.json',root)),m=JSON.parse(bytes);
  assert.equal(createHash('sha256').update(readFileSync(new URL(report.filename,raw))).digest('hex'),report.sha256);
  assert.equal(m.rawPopulationSha256,report.sha256);
  assert.equal(m.metric,'workers');assert.equal(m.statisticalYear,2024);
  assert.equal(report.indicator,'to_em_020');assert.equal(report.requestedTiles,30);
  assert.equal(m.joinAudit.length,report.providedFiles);
  assert.deepEqual(m.unprovidedSourceTiles,report.unprovidedTiles);
  assert.equal(m.sourceObservedCells,report.cells);assert.equal(m.valueSum,report.valueSum);
  assert.equal(m.explicitZeroCells,report.zeros);
  for(const level of m.levels){
    let count=0,sum=0,zeros=0;
    for(const tile of level.tiles){
      const b=readFileSync(new URL(tile.file,root));
      const cells=decodeCells(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
      assert.equal(cells.length,tile.count);
      for(const p of cells){count++;sum+=p[2];zeros+=p[2]===0;}
    }
    assert.equal(count,level.count);assert.equal(sum,report.valueSum);
    if(level.cellSizeM===100){assert.equal(count,report.cells);assert.equal(zeros,report.zeros);}
  }
  const raster=JSON.parse(readFileSync(new URL('../dist/data/sgis-workers-tiles/manifest.json',import.meta.url)));
  assert.equal(raster.sourceManifestSha256,createHash('sha256').update(bytes).digest('hex'));
});
