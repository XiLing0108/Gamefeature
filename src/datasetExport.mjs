const encoder = new TextEncoder();

export function safeFilename(value) {
  return String(value).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(0, 100) || "dataset";
}

// ZIP STORE entries keep image bytes intact; JPEGs need no further compression.
export function createZip(files) {
  const parts = [];
  const directory = [];
  let offset = 0;
  if (files.length > 65535) throw new Error("图片数量过多，请拆分数据集后导出");
  for (const { name, bytes } of files) {
    const filename = encoder.encode(name);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + filename.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, filename.length, true);
    header.set(filename, 30);
    const central = new Uint8Array(46 + filename.length);
    const entry = new DataView(central.buffer);
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    central.set(header.subarray(4, 26), 6);
    entry.setUint16(28, filename.length, true);
    entry.setUint32(42, offset, true);
    central.set(filename, 46);
    parts.push(header, bytes);
    directory.push(central);
    offset += header.length + bytes.length;
    if (offset > 0xffffffff) throw new Error("数据集过大，请拆分后导出");
  }
  const directorySize = directory.reduce((sum, entry) => sum + entry.length, 0);
  if (offset + directorySize > 0xffffffff) throw new Error("数据集过大，请拆分后导出");
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: "application/zip" });
}

function selectedFrameIndex(item, source) {
  const clip = source?.clips?.find((entry) => entry.label === item.label?.match(/A-\d+/)?.[0]);
  return Number.isInteger(item.frameIndex) ? item.frameIndex : clip?.frames?.[0]?.frameIndex;
}

async function readFrame(datasetId, frameIndex) {
  const response = await fetch(`/hires-frames/${datasetId}/frame_${String(frameIndex).padStart(6, "0")}.jpg`);
  if (!response.ok) throw new Error(`${datasetId} 第 ${frameIndex} 帧下载失败（${response.status}）`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error(`${datasetId} 第 ${frameIndex} 帧格式无效`);
  return blob;
}

export async function decodeFramePixels(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: context.getImageData(0, 0, bitmap.width, bitmap.height).data };
  } finally {
    bitmap.close();
  }
}

export function identicalPixels(a, b) {
  return !!a && a.width === b.width && a.height === b.height
    && a.data.length === b.data.length && a.data.every((value, index) => value === b.data[index]);
}

// Compare decoded full-resolution pixels, not filenames or JPEG file metadata.
// Retain only the previous decoded image so a long video does not fill memory.
export async function collapseDuplicateFrames(dataset, sources, onProgress, decode = decodeFramePixels) {
  const ids = [...new Set(dataset.items.map(item => item.datasetId))];
  const sequences = new Map();
  for (const id of ids) {
    if (!sources[id]) throw new Error(`“${id}”没有可用的源视频帧信息，无法组成三元组`);
    sequences.set(id, [...new Map(sources[id].clips.flatMap(clip => clip.frames ?? [])
      .map(frame => [frame.frameIndex, frame])).values()].sort((a, b) => a.frameIndex - b.frameIndex));
  }
  const total = [...sequences.values()].reduce((sum, frames) => sum + frames.length, 0);
  const normalized = {};
  const mappings = new Map();
  let completed = 0;
  onProgress(0, total, "checking");
  for (const [id, frames] of sequences) {
    const effective = [];
    const mapping = new Map();
    let previousPixels;
    let previousIndex;
    let logicalIndex = -1;
    for (const frame of frames) {
      const pixels = await decode(await readFrame(id, frame.frameIndex));
      const adjacent = previousIndex !== undefined && frame.frameIndex === previousIndex + 1;
      if (adjacent && identicalPixels(previousPixels, pixels)) {
        effective.at(-1).mergedFrameIndices.push(frame.frameIndex);
      } else {
        logicalIndex += previousIndex === undefined || adjacent ? 1 : 3;
        effective.push({ frameIndex: logicalIndex, originalFrameIndex: frame.frameIndex, mergedFrameIndices: [frame.frameIndex] });
      }
      mapping.set(frame.frameIndex, logicalIndex);
      previousIndex = frame.frameIndex;
      previousPixels = pixels;
      onProgress(++completed, total, "checking");
    }
    normalized[id] = { clips: [{ frames: effective }] };
    mappings.set(id, mapping);
  }
  const items = dataset.items.map(item => {
    const original = selectedFrameIndex(item, sources[item.datasetId]);
    const frameIndex = mappings.get(item.datasetId).get(original);
    if (frameIndex === undefined) throw new Error(`“${item.label ?? original}”没有可用的源视频帧信息`);
    return { ...item, frameIndex };
  });
  return { dataset: { ...dataset, items }, sources: normalized };
}

// Group by source video and real frame number, never by display label.
export function buildFrameTriplets(dataset, sources) {
  const selections = new Map();
  for (const item of dataset.items) {
    const source = sources[item.datasetId];
    const frameIndex = selectedFrameIndex(item, source);
    if (!source || !Number.isInteger(frameIndex)) {
      throw new Error(`“${item.label ?? "图片"}”没有可用的源视频帧信息，无法组成三元组`);
    }
    if (!selections.has(item.datasetId)) selections.set(item.datasetId, new Set());
    selections.get(item.datasetId).add(frameIndex);
  }
  const triplets = [];
  for (const [datasetId, selected] of selections) {
    const available = new Map(sources[datasetId].clips.flatMap((clip) => clip.frames ?? [])
      .map((frame) => [frame.frameIndex, frame]));
    const ordered = [...selected].sort((a, b) => a - b);
    // Solve from the end so a choice is accepted only if the remaining selected
    // frames can also be covered without overlap. This avoids greedy dead ends
    // near the end of a video. Each state has at most three candidate triplets.
    const plans = Array.from({ length: ordered.length + 1 }, () => []);
    for (let i = ordered.length - 1; i >= 0; i--) {
      const anchor = ordered[i];
      const candidates = [anchor - 1, anchor, anchor - 2].map((start) => {
        const indices = [start, start + 1, start + 2];
        let next = i + 1;
        while (next < ordered.length && ordered[next] <= start + 2) next++;
        return { indices, next, covered: next - i };
      }).filter(({ indices }) => indices.every((index) => available.has(index)));
      candidates.sort((a, b) => b.covered - a.covered);
      for (const candidate of candidates) {
        const tail = plans[candidate.next].find((plan) => plan.indices[0] > candidate.indices[2]);
        if (candidate.next === ordered.length || tail) {
          plans[i].push({ indices: candidate.indices, tail });
        }
      }
    }
    let plan = plans[0][0];
    if (!plan) throw new Error(`${datasetId} 没有足够的连续邻帧，无法在整个数据集中不重复地覆盖所有选定帧，请调整选择`);
    while (plan) {
      const frames = plan.indices.map((frameIndex) => ({
        datasetId,
        frameIndex: available.get(frameIndex).originalFrameIndex ?? frameIndex,
        mergedFrameIndices: available.get(frameIndex).mergedFrameIndices ?? [frameIndex],
        selected: selected.has(frameIndex),
        coverSrc: `/hires-frames/${datasetId}/frame_${String(available.get(frameIndex).originalFrameIndex ?? frameIndex).padStart(6, "0")}.jpg`,
      }));
      plan = plan.tail;
      triplets.push({ datasetId, frames });
    }
  }
  return triplets;
}

export async function exportDataset(dataset, onProgress = () => {}, sources = {}, decode = decodeFramePixels) {
  const normalized = await collapseDuplicateFrames(dataset, sources, onProgress, decode);
  const triplets = buildFrameTriplets(normalized.dataset, normalized.sources);
  const files = [];
  const cache = new Map();
  const total = triplets.length * 3;
  let completed = 0;
  onProgress(0, total, "exporting");
  for (const [index, triplet] of triplets.entries()) {
    triplet.folder = `triplet_${String(index + 1).padStart(5, "0")}`;
    for (const frame of triplet.frames) {
      let image = cache.get(frame.coverSrc);
      if (!image) {
        const response = await fetch(frame.coverSrc);
        if (!response.ok) throw new Error(`${frame.datasetId} 第 ${frame.frameIndex} 帧下载失败（${response.status}）`);
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error(`${frame.datasetId} 第 ${frame.frameIndex} 帧格式无效`);
        const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[blob.type] ?? "img";
        image = { bytes: new Uint8Array(await blob.arrayBuffer()), extension };
        cache.set(frame.coverSrc, image);
      }
      frame.filename = `${triplet.folder}/frame_${String(frame.frameIndex).padStart(6, "0")}.${image.extension}`;
      files.push({ name: frame.filename, bytes: image.bytes });
      onProgress(++completed, total, "exporting");
    }
  }
  files.push({ name: "manifest.json", bytes: encoder.encode(JSON.stringify({ ...dataset, version: 4, triplets }, null, 2)) });
  return createZip(files);
}
