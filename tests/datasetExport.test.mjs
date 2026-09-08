import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFrameTriplets, exportDataset, collapseDuplicateFrames, identicalPixels } from '../src/datasetExport.mjs';
const sources = Object.fromEntries(['a', 'b'].map(id => [id, { clips: [{ label: 'A-01', frames: Array.from({ length: 20 }, (_, frameIndex) => ({ frameIndex })) }] }]));
const dataset = indices => ({ name: '测试', items: indices.map(frameIndex => ({ datasetId: 'a', frameIndex })) });
const groups = indices => buildFrameTriplets(dataset(indices), sources).map(t => t.frames.map(f => f.frameIndex));
test('four selected frames become two triplets', () => {
  assert.deepEqual(groups([10,11,12,13]), [[10,11,12],[13,14,15]]);
  assert.deepEqual(groups([16,17,18,19]), [[14,15,16],[17,18,19]]);
});
test('single frames and video boundaries', () => {
  assert.deepEqual(groups([10]), [[9,10,11]]);
  assert.deepEqual(groups([0]), [[0,1,2]]);
  assert.deepEqual(groups([19]), [[17,18,19]]);
});
test('deduplicates selections and keeps videos separate', () => {
  assert.deepEqual(groups([12,10,11,10]), [[10,11,12]]);
  const result = buildFrameTriplets({ items: [...dataset([10]).items, { datasetId: 'b', frameIndex: 10 }] }, sources);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(t => t.datasetId), ['a','b']);
});
test('all selected frames are covered with three distinct consecutive frames per folder', () => {
  for (let mask = 1; mask < 256; mask++) {
    const selected = Array.from({ length: 8 }, (_, i) => i).filter(i => mask & (1 << i));
    const result = groups(selected);
    assert.ok(selected.every(i => result.some(g => g.includes(i))));
    assert.equal(new Set(result.flat()).size, result.length * 3);
    for (const g of result) {
      assert.equal(new Set(g).size, 3);
      assert.equal(g[2] - g[0], 2);
    }
  }
});
test('clip selections resolve to a real frame; unknown sources and gaps fail', () => {
  assert.equal(buildFrameTriplets({ items: [{ datasetId: 'a', label: 'a / A-01' }] }, sources)[0].frames[0].frameIndex, 0);
  assert.throws(() => buildFrameTriplets({ items: [{ datasetId: 'unknown' }] }, sources), /源视频帧信息/);
  assert.throws(() => buildFrameTriplets(dataset([10]), { a: { clips: [{ frames: [{ frameIndex: 10 }] }] } }), /连续邻帧/);
});
test('export reports expanded frame count without reusing frames', async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async url => { requests.push(url); return new Response(new Uint8Array([Number(url.match(/frame_(\d+)/)[1])]), { headers: { 'Content-Type': 'image/jpeg' } }); };
  try {
    const progress = [];
    const zip = await exportDataset(dataset([16,17,18,19]), (...p) => progress.push(p), sources, async blob => ({ width: 1, height: 1, data: new Uint8Array(await blob.arrayBuffer()) }));
    assert.equal(zip.type, 'application/zip');
    assert.equal(requests.length, 26);
    assert.equal(new Set(requests.slice(20)).size, 6);
    assert.deepEqual(progress.at(-1), [6,6,"exporting"]);
    globalThis.fetch = async () => new Response('', { status: 404 });
    await assert.rejects(exportDataset(dataset([10]), undefined, sources), /下载失败/);
  } finally { globalThis.fetch = original; }
});

test('rejects an impossible selection instead of reusing or omitting frames', () => {
  const limited = { a: { clips: [{ frames: Array.from({ length: 4 }, (_, frameIndex) => ({ frameIndex })) }] } };
  assert.throws(() => buildFrameTriplets(dataset([0,1,2,3]), limited), /不重复/);
});
test('global uniqueness and coverage also hold near the video end', () => {
  for (let mask = 1; mask < 256; mask++) {
    const selected = Array.from({ length: 8 }, (_, i) => i + 12).filter((_, i) => mask & (1 << i));
    const result = groups(selected);
    assert.ok(selected.every(i => result.flat().includes(i)));
    assert.equal(new Set(result.flat()).size, result.length * 3);
  }
});

test('pixel comparison requires exact dimensions and every pixel to match', () => {
  const a = { width: 1, height: 1, data: new Uint8Array([1,2,3,255]) };
  assert.equal(identicalPixels(a, { ...a, data: new Uint8Array(a.data) }), true);
  assert.equal(identicalPixels(a, { ...a, data: new Uint8Array([1,2,4,255]) }), false);
  assert.equal(identicalPixels(a, { ...a, width: 2 }), false);
});
test('adjacent duplicate runs collapse before grouping and selected aliases share one frame', async () => {
  const original = globalThis.fetch;
  const pixels = [7,7,7,8,9,9,10,7,11];
  const source = { a: { clips: [{ frames: pixels.map((_, frameIndex) => ({ frameIndex })) }] } };
  globalThis.fetch = async url => new Response(new Uint8Array([pixels[Number(url.match(/frame_(\d+)/)[1])]]), { headers: { 'Content-Type': 'image/jpeg' } });
  const decode = async blob => ({ width: 1, height: 1, data: new Uint8Array(await blob.arrayBuffer()) });
  try {
    const normalized = await collapseDuplicateFrames(dataset([0,1,2,3,4,5,6,7,8]), source, () => {}, decode);
    const result = buildFrameTriplets(normalized.dataset, normalized.sources);
    assert.deepEqual(result.map(t => t.frames.map(f => f.frameIndex)), [[0,3,4],[6,7,8]]);
    assert.deepEqual(result[0].frames[0].mergedFrameIndices, [0,1,2]);
    assert.deepEqual(result[0].frames[2].mergedFrameIndices, [4,5]);
    assert.equal(new Set(result.flatMap(t => t.frames.flatMap(f => f.mergedFrameIndices))).size, 9);
    // Same pixels separated by different frames are not collapsed.
    assert.equal(result[1].frames[1].frameIndex, 7);
    const identicalSource = { a: { clips: [{ frames: [0,1,2].map(frameIndex => ({ frameIndex })) }] } };
    const insufficient = await collapseDuplicateFrames(dataset([0,1,2]), identicalSource, () => {}, decode);
    assert.throws(() => buildFrameTriplets(insufficient.dataset, insufficient.sources), /连续邻帧/);
  } finally { globalThis.fetch = original; }
});
