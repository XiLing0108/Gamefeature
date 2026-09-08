import { useEffect, useMemo, useRef, useState } from "react";
import { UMAP } from "umap-js";
import clipFeatureData from "./clipFeatureData.json";
import { exportDataset, safeFilename } from "./datasetExport.mjs";

const uploadedVideos = [
  ["U-01", "Boss 战斗采集", [42, 18, 21, 16]],
  ["U-02", "竞速高速采集", [18, 12, 14, 48]],
  ["U-03", "开放世界夜景", [22, 16, 42, 12]],
  ["U-04", "HUD/UI 场景", [12, 54, 10, 9]],
  ["U-05", "低亮地下城", [18, 10, 48, 12]],
  ["U-06", "技能爆发片段", [56, 14, 18, 22]],
  ["U-07", "角色近景", [24, 20, 18, 16]],
  ["U-08", "载具追踪", [14, 12, 16, 52]],
  ["U-09", "菜单转场", [10, 48, 12, 8]],
  ["U-10", "水面反射", [16, 18, 34, 20]],
  ["U-11", "雪地高亮", [28, 14, 32, 18]],
  ["U-12", "复杂遮挡", [24, 26, 18, 22]],
];

const builtInImageItems = ["apex_01", "apex_02", "cs_01", "cs_02", "cs_03", "wrc7_01"].flatMap((datasetId) =>
  Array.from({ length: 14 }, (_, index) => [datasetId, `A-${String(index + 1).padStart(2, "0")}`])
).map(([datasetId, clipLabel]) => ({
  key: `builtin:${datasetId}:${clipLabel}`,
  datasetId,
  label: `${datasetId}_${clipLabel}.jpg`,
  coverSrc: `/clip-covers/${datasetId}/${clipLabel}.jpg`,
  kind: "clip",
})).concat([
  ...Array.from({ length: 10 }, (_, index) => ["good", [7, 0, 6, 4, 3, 10, 2, 5, 8, 9][index]]),
  ...Array.from({ length: 6 }, (_, index) => ["bad", [119, 125, 122, 1, 123, 124][index]]),
].map(([quality, clipNumber]) => {
  const filename = `clip_${String(clipNumber).padStart(4, "0")}_im2_pred.png`;
  return {
    key: `builtin:rife:${quality}:${filename}`,
    datasetId: `rife_${quality}`,
    label: filename,
    coverSrc: `/rife_eval_summary/${quality}/${filename}`,
    kind: "clip",
  };
}));

const gameDatasets = [
  { id: "apex_01", video: "apex_720p_60fps_1", values: [42, 18, 21, 16] },
  { id: "apex_02", video: "apex_720p_60fps_2", values: [38, 16, 24, 18] },
  { id: "cs_01", video: "cs_720p_60fps_1", values: [30, 18, 28, 20] },
  { id: "cs_02", video: "cs_720p_60fps_2", values: [34, 20, 22, 18] },
  { id: "cs_03", video: "cs_720p_60fps_3", values: [36, 18, 26, 16] },
  { id: "wrc7_01", video: "wrc7_720p_60fps", values: [18, 12, 14, 48] },
  { id: "game_images_01", name: "精选游戏画面", kind: "image", items: builtInImageItems, values: [34, 22, 27, 25] },
];

function builtInImageDataset(datasetId) {
  const dataset = gameDatasets.find((item) => item.id === datasetId && item.kind === "image");
  return dataset ? { ...dataset, builtIn: true } : null;
}

const clipLabels = Array.from({ length: 14 }, (_, index) => `A-${String(index + 1).padStart(2, "0")}`);

function buildDatasetClips(datasetId) {
  const dataset = clipFeatureData.datasets[datasetId];
  return clipLabels.map((label, index) => ({
    label,
    startFrame: index * 60,
    endFrame: index * 60 + 59,
    coverSrc: dataset?.clips?.[index]?.coverSrc ?? `/clip-covers/${datasetId}/${label}.jpg`,
    frames: dataset?.clips?.[index]?.frames ?? [],
  }));
}

const effectColors = {
  fire: "#d9483b",
  explosion: "#f08a24",
  smoke: "#8b96a3",
  dust: "#c49a52",
  water_splash: "#3d9bd6",
  debris: "#7b6b5a",
  object_breaking: "#995f45",
  screen_flash: "#f2d65c",
  motion_blur_trail: "#7c6bd6",
  particle_light: "#40b9b0",
  other: "#b061b6",
};

const effectLabels = {
  fire: "火焰",
  explosion: "爆炸",
  smoke: "烟雾",
  dust: "尘土",
  water_splash: "水花",
  debris: "碎片",
  object_breaking: "物体破碎",
  screen_flash: "屏幕闪光",
  motion_blur_trail: "运动拖影",
  particle_light: "粒子光",
  other: "其他",
};

const projectionColors = ["#d45a50", "#3d76d1", "#37a174", "#d99a36", "#7d6db0", "#40b9b0", "#b061b6"];

const projectionCategoryStyles = {
  effect: {
    no_effect: ["无特效", "#9aa6b2"],
    fire: ["火焰", effectColors.fire],
    explosion: ["爆炸", effectColors.explosion],
    smoke: ["烟雾", "#5b3a70"],
    debris: ["碎片", effectColors.debris],
    screen_flash: ["闪光", effectColors.screen_flash],
    motion_blur_trail: ["运动拖影", effectColors.motion_blur_trail],
    particle_light: ["粒子光", effectColors.particle_light],
    other: ["其他特效", effectColors.other],
  },
  motion: {
    low_change: ["低变化", "#8fa1b2"],
    medium_change: ["中等变化", "#4f86c6"],
    noticeable_change: ["明显变化", "#d79a39"],
    high_speed_change: ["高速变化", "#d2534a"],
  },
  ui: {
    no_large_ui: ["无大面积 UI", "#8fa1b2"],
    large_ui: ["大面积 UI", "#3d76d1"],
  },
  keyframe: {
    no_keyframe: ["非关键帧", "#8fa1b2"],
    keyframe: ["关键帧", "#e05252"],
  },
};

const projectionCategoryOrder = {
  motion: ["high_speed_change", "noticeable_change", "medium_change", "low_change"],
};

function mostCommon(values, fallback) {
  if (!values.length) return fallback;
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
}

function frameProjectionCategories(frame = {}) {
  return {
    effect: primaryEffect(frame) || "no_effect",
    motion: frame.fastChange || "low_change",
    ui: frame.hasLargeUi ? "large_ui" : "no_large_ui",
    keyframe: frame.isKeyframe ? "keyframe" : "no_keyframe",
  };
}

const interpolationMetrics = [
  ["PSNR", 32.48, 42],
  ["SSIM", 0.921, 1],
  ["LPIPS", 0.083, 0.3],
  ["CGVQM", 0.874, 1],
  ["VMAF", 91.36, 100],
  ["FloLPIPS", 0.071, 0.3],
];

const interpolationSpeed = {
  frameTimeMs: 18.6,
  fps: 53.8,
};

const qualityDistribution = {
  good: 152,
  bad: 48,
  total: 200,
};

const qualitySampleFiles = {
  good: [
    "clip_0000_im2_pred.png",
    "clip_0002_im2_pred.png",
    "clip_0003_im2_pred.png",
    "clip_0004_im2_pred.png",
    "clip_0005_im2_pred.png",
    "clip_0006_im2_pred.png",
    "clip_0007_im2_pred.png",
    "clip_0008_im2_pred.png",
    "clip_0009_im2_pred.png",
    "clip_0010_im2_pred.png",
  ],
  bad: [
    "clip_0001_im2_pred.png",
    "clip_0119_im2_pred.png",
    "clip_0120_im2_pred.png",
    "clip_0121_im2_pred.png",
    "clip_0122_im2_pred.png",
    "clip_0123_im2_pred.png",
    "clip_0124_im2_pred.png",
    "clip_0125_im2_pred.png",
    "clip_0126_im2_pred.png",
    "clip_0127_im2_pred.png",
  ],
};

const qualitySamples = Object.fromEntries(
  Object.entries(qualitySampleFiles).map(([type, files]) => [
    type,
    files.map((file, index) => ({
      frameIndex: file.match(/\d+/)?.[0] ?? String(index).padStart(4, "0"),
      imageSrc: `/rife_eval_summary/${type}/${file}`,
      metrics: { PSNR: "-", SSIM: "-", LPIPS: "-" },
    })),
  ])
);

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function variance(values) {
  const avg = mean(values);
  return mean(values.map((value) => (value - avg) ** 2));
}

function normalizeVectors(vectors) {
  if (!vectors.length) return [];
  const dims = vectors[0].length;
  const means = Array.from({ length: dims }, (_, dim) => mean(vectors.map((vector) => vector[dim])));
  const stds = Array.from({ length: dims }, (_, dim) => Math.sqrt(variance(vectors.map((vector) => vector[dim]))) || 1);
  return vectors.map((vector) => vector.map((value, dim) => (value - means[dim]) / stds[dim]));
}

function covarianceMatrix(vectors) {
  const dims = vectors[0]?.length ?? 0;
  return Array.from({ length: dims }, (_, row) =>
    Array.from({ length: dims }, (_, col) => mean(vectors.map((vector) => vector[row] * vector[col])))
  );
}

function dominantEigenVector(matrix, seed = 1) {
  const size = matrix.length;
  let vector = Array.from({ length: size }, (_, index) => ((index + seed) % 3) + 1);
  for (let iter = 0; iter < 40; iter += 1) {
    const next = matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index], 0));
    const norm = Math.sqrt(next.reduce((sum, value) => sum + value * value, 0)) || 1;
    vector = next.map((value) => value / norm);
  }
  return vector;
}

function subtractRankOne(matrix, vector) {
  const eigenValue = vector.reduce(
    (sum, value, row) => sum + value * matrix[row].reduce((inner, cell, col) => inner + cell * vector[col], 0),
    0
  );
  return matrix.map((row, r) => row.map((value, c) => value - eigenValue * vector[r] * vector[c]));
}

function projectPca2(vectors) {
  const normalized = normalizeVectors(vectors);
  if (!normalized.length) return [];
  const cov = covarianceMatrix(normalized);
  const pc1 = dominantEigenVector(cov, 1);
  const pc2 = dominantEigenVector(subtractRankOne(cov, pc1), 2);
  return normalized.map((vector) => [
    vector.reduce((sum, value, index) => sum + value * pc1[index], 0),
    vector.reduce((sum, value, index) => sum + value * pc2[index], 0),
  ]);
}

function seededRandom(seed = 42) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function projectUmap2(vectors) {
  const normalized = normalizeVectors(vectors);
  if (normalized.length <= 2) return projectPca2(vectors);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(12, Math.max(2, Math.floor(normalized.length / 8))),
    minDist: 0.15,
    metric: "euclidean",
    random: seededRandom(42),
  });
  return umap.fit(normalized);
}

function normalizePoints(points) {
  if (!points.length) return [];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  return points.map(([x, y]) => [
    10 + ((x - minX) / rangeX) * 80,
    12 + ((y - minY) / rangeY) * 76,
  ]);
}

function featureVector(frame) {
  return [
    Number(frame.brightness) || 0,
    Number(frame.brightnessDelta) || 0,
    Number(frame.fastChangeScore) || 0,
    frame.hasEffect ? 1 : 0,
    frame.hasLargeUi ? 1 : 0,
    frame.isKeyframe ? 1 : 0,
  ];
}

function buildProjectionPoints(datasetId) {
  const frames = (clipFeatureData.datasets[datasetId]?.clips ?? []).flatMap((clip) => clip.frames ?? []);
  const groups = [];
  for (let index = 0; index + 4 < frames.length; index += 5) {
    const slice = frames.slice(index, index + 5);
    const vector = Array.from({ length: 6 }, (_, dim) => mean(slice.map((frame) => featureVector(frame)[dim])));
    groups.push({
      vector,
      firstFrame: slice[0],
      startFrame: slice[0].frameIndex,
      endFrame: slice[slice.length - 1].frameIndex,
      categories: {
        effect: mostCommon(slice.map((frame) => primaryEffect(frame) || "no_effect"), "no_effect"),
        motion: mostCommon(slice.map((frame) => frame.fastChange || "low_change"), "low_change"),
        ui: mostCommon(slice.map((frame) => frame.hasLargeUi ? "large_ui" : "no_large_ui"), "no_large_ui"),
        keyframe: slice.some((frame) => frame.isKeyframe) ? "keyframe" : "no_keyframe",
      },
    });
  }
  const projected = projectUmap2(groups.map((group) => group.vector));
  const coords = normalizePoints(projected);
  const rawCoords = projected;
  const normalizedVectors = normalizeVectors(groups.map((group) => group.vector));
  const distances = normalizedVectors.flatMap((a, i) =>
    normalizedVectors.slice(i + 1).map((b) => Math.sqrt(a.reduce((sum, value, dim) => sum + (value - b[dim]) ** 2, 0)))
  );
  const threshold = distances.length ? [...distances].sort((a, b) => a - b)[Math.floor(distances.length * 0.12)] : 0;
  const clusters = [];
  normalizedVectors.forEach((vector) => {
    let clusterIndex = clusters.findIndex((cluster) => {
      const distance = Math.sqrt(vector.reduce((sum, value, dim) => sum + (value - cluster.center[dim]) ** 2, 0));
      return distance <= threshold;
    });
    if (clusterIndex === -1) {
      clusterIndex = clusters.length;
      clusters.push({ center: vector.slice(), count: 0 });
    }
    const cluster = clusters[clusterIndex];
    cluster.count += 1;
    cluster.center = cluster.center.map((value, dim) => value + (vector[dim] - value) / cluster.count);
    groups[clusters.reduce((sum, item, idx) => sum + (idx < clusterIndex ? item.count : 0), 0)];
  });
  return groups.map((group, index) => ({
    ...group,
    left: coords[index]?.[0] ?? 50,
    top: coords[index]?.[1] ?? 50,
    rawX: rawCoords[index]?.[0] ?? 0,
    rawY: rawCoords[index]?.[1] ?? 0,
    cluster: (() => {
      const vector = normalizedVectors[index] ?? [];
      let bestIndex = 0;
      let bestDistance = Infinity;
      clusters.forEach((cluster, clusterIndex) => {
        const distance = Math.sqrt(vector.reduce((sum, value, dim) => sum + (value - cluster.center[dim]) ** 2, 0));
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = clusterIndex;
        }
      });
      return bestIndex;
    })(),
  }));
}

function primaryEffect(frame) {
  return frame?.effects?.[0] ?? "";
}

function buildEffectSegments(frames) {
  const segments = [];
  let current = null;
  frames.forEach((frame, index) => {
    const effect = primaryEffect(frame);
    const clipIndex = frame.clipIndex ?? 0;
    if (!effect) {
      if (current) {
        current.end = index - 1;
        segments.push(current);
        current = null;
      }
      return;
    }
    if (!current || current.effect !== effect || current.clipIndex !== clipIndex) {
      if (current) {
        current.end = index - 1;
        segments.push(current);
      }
      current = { effect, start: index, end: index, clipIndex };
    }
  });
  if (current) segments.push(current);
  return segments;
}

function buildBooleanSegments(frames, predicate) {
  const segments = [];
  let current = null;
  frames.forEach((frame, index) => {
    const clipIndex = frame.clipIndex ?? 0;
    if (!predicate(frame)) {
      if (current) {
        current.end = index - 1;
        segments.push(current);
        current = null;
      }
      return;
    }
    if (!current || current.clipIndex !== clipIndex) {
      if (current) {
        current.end = index - 1;
        segments.push(current);
      }
      current = { start: index, end: index, clipIndex };
    }
  });
  if (current) segments.push(current);
  return segments;
}

function frameLocalIndex(frame, fallbackIndex) {
  return Number.isFinite(frame?.localIndex) ? frame.localIndex : fallbackIndex;
}

function framePosition(frame, fallbackIndex, totalFrames) {
  return ((frameLocalIndex(frame, fallbackIndex) + 0.5) / totalFrames) * 100;
}

function buildCustomDatasetVisuals(customDataset) {
  return (customDataset?.items ?? []).map((item, index) => {
    const sourceClips = clipFeatureData.datasets[item.datasetId]?.clips ?? [];
    const clipLabel = item.label?.match(/A-\d+/)?.[0];
    const sourceClip = clipLabel
      ? sourceClips[clipLabels.indexOf(clipLabel)]
      : null;
    const allFrames = sourceClips.flatMap((clip) => clip.frames ?? []);
    const sourceFrame = Number.isFinite(item.frameIndex)
      ? allFrames.find((frame) => frame.frameIndex === item.frameIndex)
      : null;
    const frames = sourceFrame ? [sourceFrame] : sourceClip?.frames ?? [];
    const fallbackFrame = {
      frameIndex: item.frameIndex ?? index,
      imageSrc: item.coverSrc,
      brightness: 0,
      brightnessDelta: 0,
      fastChangeScore: 0,
      effects: [],
    };
    const representativeFrame = sourceFrame ?? frames[0] ?? fallbackFrame;
    const vectorFrames = frames.length ? frames : [fallbackFrame];
    return {
      label: "C-" + String(index + 1).padStart(2, "0"),
      sourceLabel: item.label,
      itemKey: item.key,
      datasetId: item.datasetId,
      frameIndex: item.frameIndex,
      coverSrc: item.coverSrc,
      frames,
      representativeFrame: { ...representativeFrame, imageSrc: item.coverSrc || representativeFrame.imageSrc },
      vector: Array.from({ length: 6 }, (_, dim) => mean(vectorFrames.map((frame) => featureVector(frame)[dim]))),
    };
  });
}

function buildCustomProjectionPoints(visuals) {
  if (!visuals.length) return [];
  const coordinates = normalizePoints(projectUmap2(visuals.map((item) => item.vector)));
  return visuals.map((item, index) => ({
    firstFrame: item.representativeFrame,
    datasetId: item.datasetId,
    startFrame: item.representativeFrame.frameIndex ?? index,
    endFrame: item.representativeFrame.frameIndex ?? index,
    categories: {
      ...frameProjectionCategories(item.representativeFrame),
      keyframe: item.frames.some((frame) => frame.isKeyframe) ? "keyframe" : "no_keyframe",
    },
    left: coordinates[index]?.[0] ?? 50,
    top: coordinates[index]?.[1] ?? 50,
    cluster: index % projectionColors.length,
  }));
}

function highResFrameSrc(datasetId, frame) {
  const frameIndex = Number(frame?.frameIndex);
  if (!Number.isFinite(frameIndex)) return frame?.imageSrc ?? "";
  return `/hires-frames/${datasetId}/frame_${String(frameIndex).padStart(6, "0")}.jpg`;
}

const metricLabels = {
  effectRatio: "\u7279\u6548\u5360\u6bd4",
  uiRatio: "UI\u8986\u76d6\u5360\u6bd4",
  lightingHardRatio: "\u660e\u6697\u5207\u6362",
  highSpeedRatio: "\u9ad8\u901f\u53d8\u5316",
};

function datasetData(datasetId) {
  return clipFeatureData.datasets[datasetId] ?? {};
}

function datasetMetrics(datasetId) {
  return datasetData(datasetId).metrics ?? {};
}

function customDatasetMetrics(dataset) {
  const items = dataset?.items ?? [];
  if (!items.length) return { styleLabel: "realistic", sampleCount: 0 };
  const sourceMetrics = items.map((item) => datasetMetrics(item.datasetId));
  const average = (key) => mean(sourceMetrics.map((metrics) => Number(metrics[key]) || 0));
  const realisticCount = sourceMetrics.filter((metrics) => metrics.styleLabel === "realistic").length;
  return {
    styleLabel: realisticCount >= sourceMetrics.length / 2 ? "realistic" : "cartoon",
    effectRatio: average("effectRatio"),
    uiRatio: average("uiRatio"),
    lightingHardRatio: average("lightingHardRatio"),
    highSpeedRatio: average("highSpeedRatio"),
    sampleCount: items.length,
  };
}

function pct(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function styleText(value) {
  return value === "realistic" ? "\u5199\u5b9e" : "\u5361\u901a";
}

function compareDelta(a, b) {
  const delta = Number(a || 0) - Number(b || 0);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function frameWindow(frames, selectedIndex, radius = 2) {
  const selectedFrame = frames[selectedIndex] ?? frames[0];
  if (!selectedFrame) return [];
  return Array.from({ length: radius * 2 + 1 }, (_, offset) => {
    const localIndex = selectedIndex - radius + offset;
    return frames[localIndex] ?? {
      localIndex,
      frameIndex: selectedFrame.frameIndex + localIndex - selectedIndex,
      brightnessDelta: 0,
      lighting: "",
      dominantColors: [],
    };
  });
}

const selectedSets = [
  ["A", "数据集 a", "特效占比高，光照突变集中"],
  ["B", "数据集 b", "运动样本更均衡"],
  ["C", "数据集 c", "低亮环境补充"],
];

const datasetCompare = [
  ["特效占比", "42%", "28%", "A +14"],
  ["光照突变", "21%", "14%", "A +7"],
  ["运动幅值", "0.78", "0.64", "A 高"],
  ["UI覆盖", "18%", "26%", "B +8"],
  ["时序稳定", "0.91", "0.87", "A 略优"],
];

const sampleBars = [
  ["写实", 72, "green"],
  ["卡通", 38, "blue"],
  ["UI覆盖", 58, "amber"],
  ["高速", 46, "red"],
];

const points = [
  [18, 34, "effect"], [21, 39, "effect"], [24, 31, "effect"], [28, 43, "effect"], [31, 36, "effect"],
  [66, 30, "motion"], [70, 34, "motion"], [74, 28, "motion"], [78, 39, "motion"], [82, 33, "motion"],
  [30, 66, "ui"], [34, 72, "ui"], [39, 64, "ui"], [43, 76, "ui"], [47, 69, "ui"],
  [58, 62, "lighting"], [62, 67, "lighting"], [66, 58, "lighting"], [70, 70, "lighting"],
  [16, 76, "normal"], [44, 24, "normal"], [54, 46, "normal"], [86, 56, "normal"],
  [19, 29, "effect"], [25, 46, "effect"], [34, 39, "effect"],
  [63, 36, "motion"], [76, 44, "motion"], [84, 26, "motion"],
  [27, 70, "ui"], [37, 78, "ui"], [49, 63, "ui"],
  [55, 69, "lighting"], [68, 64, "lighting"], [74, 74, "lighting"],
  [12, 58, "normal"], [52, 82, "normal"], [91, 48, "normal"],
];

const datasetAClips = [
  "A-01", "A-02", "A-03", "A-04", "A-05", "A-06",
  "A-07", "A-08", "A-09", "A-10", "A-11", "A-12",
  "A-13", "A-14",
];

const tracks = [
  {
    id: "V-102",
    name: "复合片段01",
    clips: [[0, 18, "normal", "普通"], [18, 22, "effect", "特效"], [42, 18, "motion", "高速"], [64, 16, "lighting", "强光"], [82, 12, "ui", "UI"]],
  },
  {
    id: "V-118",
    name: "爆炸场景",
    clips: [[8, 22, "effect", "粒子"], [36, 16, "lighting", "突变"], [62, 14, "effect", "爆炸"], [82, 10, "normal", "普通"]],
  },
];

const features = [
  ["明暗变化", "0.84", "hist", "高亮到阴影跳变明显"],
  ["颜色差异", "0.71", "swatch", "冷暖色域同时出现"],
  ["结构梯度", "0.66", "heat", "UI边缘与场景边缘叠加"],
  ["写实/卡通", "写实", "toggle", "材质和光照偏写实"],
];

const featureMatrix = [
  ["信息熵", "entropy", [["灰度", "0.84"], ["局部块", "0.76"], ["RGB三通道", "0.71"], ["色相分布", "0.63"]]],
  ["纹理", "texture", [["GLCM共生", "0.68"], ["Sobel梯度", "0.74"], ["拉普拉斯", "0.59"]]],
  ["特异", "saliency", [["FT显著性", "高"], ["前背景KL", "0.46"], ["高光噪声", "21%"], ["连通域", "0.38"]]],
];

const metrics = [
  ["PSNR", "+0.42", 76],
  ["SSIM", "+0.018", 82],
  ["LPIPS", "-0.021", 44],
  ["Flicker", "-8.1%", 36],
];

function Donut({ values = [42, 18, 21, 16] }) {
  const [a, b, c, d] = values;
  const bg = `conic-gradient(var(--red) 0 ${a}%, var(--blue) ${a}% ${a + b}%, var(--amber) ${a + b}% ${a + b + c}%, var(--green) ${a + b + c}% ${a + b + c + d}%, #8b96a0 ${a + b + c + d}% 100%)`;
  return <i className="donut" style={{ background: bg }} />;
}

function Thumb({ label, values, active = false, variant = "video", coverSrc = "", onClick, onRemove, draggable = false, onDragStart }) {
  return (
    <article
      className={`${active ? "thumb active" : "thumb"} ${variant === "folder" ? "folder-thumb" : ""} ${coverSrc ? "clip-thumb" : ""}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick();
        }
      }}
    >
      {coverSrc && <img src={coverSrc} alt={`${label} cover`} />}
      {variant === "folder" && <i className="folder-icon" />}
      <span>{label}</span>
      {variant !== "folder" && !coverSrc && <Donut values={values} />}
      {onRemove && (
        <button
          className="thumb-remove"
          type="button"
          aria-label={"删除" + label}
          title="从新数据集中删除"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onDragStart={(event) => event.preventDefault()}
        >
          {"\u00d7"}
        </button>
      )}
    </article>
  );
}

function LeftPanel({
  activeDatasetId,
  onSelectDataset,
  onClearDataset,
  selectedDatasets,
  onAddSelectedDataset,
  onRemoveSelectedDataset,
  customDatasets,
  activeCustomDatasetId,
  onSelectCustomDataset,
  onCreateDataset,
  onAddImageToDataset,
  onRemoveCustomDataset,
  onRenameCustomDataset,
  compareDatasetIds,
  onToggleCompareDataset,
  onStartTraining,
  hasTrainingResults,
}) {
  const [dragOverDatasetId, setDragOverDatasetId] = useState("");
  const [isSelectedDropOver, setIsSelectedDropOver] = useState(false);
  const [editingDatasetId, setEditingDatasetId] = useState("");
  const [editingDatasetName, setEditingDatasetName] = useState("");
  const [exportState, setExportState] = useState(null);
  const [exportError, setExportError] = useState("");
  const exportInProgress = useRef(false);

  async function downloadCustomDataset(dataset) {
    if (exportInProgress.current) return;
    exportInProgress.current = true;
    setExportError("");
    setExportState({ id: dataset.id, completed: 0, total: 0 });
    try {
      const blob = await exportDataset(dataset, (completed, total, phase) => setExportState({ id: dataset.id, completed, total, phase }), clipFeatureData.datasets);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeFilename(dataset.name)}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setExportError(`“${dataset.name}”导出失败：${error.message}。请重试。`);
    } finally {
      exportInProgress.current = false;
      setExportState(null);
    }
  }
  const activeData = datasetData(activeDatasetId);
  const activeCustomDataset = customDatasets.find((dataset) => dataset.id === activeCustomDatasetId) ?? builtInImageDataset(activeDatasetId);
  const activeMetrics = activeCustomDataset ? customDatasetMetrics(activeCustomDataset) : datasetMetrics(activeDatasetId);
  const compareA = compareDatasetIds[0] ?? selectedDatasets[0] ?? "";
  const compareB = compareDatasetIds[1] ?? "";
  const metricsForDataset = (datasetId) => {
    const customDataset = customDatasets.find((dataset) => dataset.id === datasetId);
    const imageDataset = builtInImageDataset(datasetId);
    return customDataset || imageDataset ? customDatasetMetrics(customDataset ?? imageDataset) : datasetMetrics(datasetId);
  };
  const labelForDataset = (datasetId) => customDatasets.find((dataset) => dataset.id === datasetId)?.name ?? builtInImageDataset(datasetId)?.name ?? datasetId;
  const compareAMetrics = metricsForDataset(compareA);
  const compareBMetrics = metricsForDataset(compareB);
  const compareRows = ["effectRatio", "uiRatio", "lightingHardRatio", "highSpeedRatio"];

  function downloadActiveVideo() {
    const link = document.createElement("a");
    link.href = activeData.downloadSrc;
    link.download = `${activeDatasetId}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <aside className={"left-panel" + (activeDatasetId ? "" : " awaiting-dataset")}>
      <section className="panel-block source-block" onClick={onClearDataset}>
        <div className="block-title"><h2>原始数据集</h2>{activeDatasetId && !activeCustomDataset?.builtIn && <button onClick={(event) => { event.stopPropagation(); downloadActiveVideo(); }}>{"\u5bfc\u51fa\u9009\u4e2d\u89c6\u9891"}</button>}</div>
        <div className="thumb-row">
          {gameDatasets.map(({ id, values }) => (
            <Thumb
              label={id}
              values={values}
              active={id === activeDatasetId}
              variant="folder"
              key={id}
              onClick={(event) => {
                event.stopPropagation();
                onSelectDataset(id);
              }}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("application/x-selected-dataset", id);
              }}
            />
          ))}
        </div>
      </section>

      <section className="panel-block custom-datasets-block">
        <div className="section-title-row"><h2>数据集</h2><button onClick={onCreateDataset}>创建新的数据集</button></div>
        <p className="drop-hint">创建后，将中间栏中的图片拖入数据集</p>
        {exportError && <p className="dataset-export-error" role="alert">{exportError}</p>}
        <div className="custom-dataset-list">
          {customDatasets.length === 0 && <div className="empty-dataset-state">还没有新数据集</div>}
          {customDatasets.map((dataset) => (
            <article
              className={"custom-dataset-card" + (dragOverDatasetId === dataset.id ? " drag-over" : "") + (activeCustomDatasetId === dataset.id ? " active" : "")}
              key={dataset.id}
              draggable={editingDatasetId !== dataset.id}
              onClick={() => onSelectCustomDataset(dataset.id)}
              onDragStart={(event) => {
                if (event.target.closest("button, input")) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("application/x-selected-dataset", dataset.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDragOverDatasetId(dataset.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setDragOverDatasetId("");
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragOverDatasetId("");
                try {
                  const batchData = event.dataTransfer.getData("application/x-gamefeature-items");
                  if (batchData) {
                    const items = JSON.parse(batchData);
                    if (Array.isArray(items)) onAddImageToDataset(dataset.id, items);
                    return;
                  }
                  const item = JSON.parse(event.dataTransfer.getData("application/x-gamefeature-item"));
                  if (item?.kind === "clip") onAddImageToDataset(dataset.id, item);
                } catch { /* Ignore unsupported external drops. */ }
              }}
            >
              <button
                className="remove-custom-dataset"
                type="button"
                aria-label={"删除" + dataset.name}
                title="删除数据集"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveCustomDataset(dataset.id);
                }}
              >
                {"\u00d7"}
              </button>
              <button
                className="rename-custom-dataset"
                type="button"
                aria-label={"重命名" + dataset.name}
                title="重命名数据集"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditingDatasetId(dataset.id);
                  setEditingDatasetName(dataset.name);
                }}
              >
                编辑
              </button>
              <i className="folder-icon" />
              <div>
                {editingDatasetId === dataset.id ? (
                  <input
                    className="custom-dataset-name-input"
                    value={editingDatasetName}
                    autoFocus
                    onChange={(event) => setEditingDatasetName(event.target.value)}
                    onBlur={(event) => {
                      if (event.currentTarget.dataset.cancelRename !== "true" && editingDatasetName.trim()) {
                        onRenameCustomDataset(dataset.id, editingDatasetName.trim());
                      }
                      setEditingDatasetId("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") {
                        event.currentTarget.dataset.cancelRename = "true";
                        event.currentTarget.blur();
                      }
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                ) : (
                  <strong>{dataset.name}</strong>
                )}
                <span>{dataset.items.length} 张图片</span>
              </div>
              <div className="dataset-image-stack">
                {dataset.items.slice(-3).map((item) => <img src={item.coverSrc} alt="" key={item.key} />)}
              </div>
              <button
                className="export-custom-dataset"
                type="button"
                disabled={!!exportState || !dataset.items.length}
                title={dataset.items.length ? "按三元组导出连续帧，整个数据集内不复用帧，附来源清单" : "添加图片后即可导出"}
                aria-label={"导出" + dataset.name}
                onClick={(event) => { event.stopPropagation(); downloadCustomDataset(dataset); }}
                onDragStart={(event) => event.preventDefault()}
              >
                {exportState?.id === dataset.id ? `${exportState.phase === "checking" ? "检查重复帧" : "导出中"} ${exportState.completed}/${exportState.total}` : "导出三元组"}
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel-block overview-block">
        <div className="section-title-row">
          <h2>{"\u6570\u636e\u96c6\u7279\u5f81"}</h2>
          <button
            onClick={() => onAddSelectedDataset(activeCustomDataset?.id ?? activeDatasetId)}
            disabled={!activeDatasetId}
          >
            {"\u9009\u62e9\u5f53\u524d\u6570\u636e\u96c6"}
          </button>
        </div>
        <h3>{activeCustomDataset ? activeCustomDataset.name + " · " + activeMetrics.sampleCount + " 张图片" : "\u6837\u672c\u5206\u5e03"}</h3>
        <div className="bar-list">
          <p className="style-row"><span>{"\u98ce\u683c"}</span><strong>{styleText(activeMetrics.styleLabel)}</strong></p>
          <p><span>{"\u7279\u6548\u5360\u6bd4"}</span><i><em className="red" style={{ width: `${activeMetrics.effectRatio ?? 0}%` }} /></i><b>{pct(activeMetrics.effectRatio)}</b></p>
          <p><span>{"UI\u8986\u76d6"}</span><i><em className="amber" style={{ width: `${activeMetrics.uiRatio ?? 0}%` }} /></i><b>{pct(activeMetrics.uiRatio)}</b></p>
          <p><span>{"\u660e\u6697\u5207\u6362"}</span><i><em className="blue" style={{ width: `${activeMetrics.lightingHardRatio ?? 0}%` }} /></i><b>{pct(activeMetrics.lightingHardRatio)}</b></p>
          <p><span>{"\u9ad8\u901f\u53d8\u5316"}</span><i><em className="green" style={{ width: `${activeMetrics.highSpeedRatio ?? 0}%` }} /></i><b>{pct(activeMetrics.highSpeedRatio)}</b></p>
        </div>
      </section>

      <section
        className={"panel-block selected-block selected-dataset-drop-zone" + (isSelectedDropOver ? " drag-over" : "")}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("application/x-selected-dataset")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsSelectedDropOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setIsSelectedDropOver(false);
        }}
        onDrop={(event) => {
          const datasetId = event.dataTransfer.getData("application/x-selected-dataset");
          if (!datasetId) return;
          event.preventDefault();
          setIsSelectedDropOver(false);
          onAddSelectedDataset(datasetId);
        }}
      >
        <div className="section-title-row"><h2>数据集对比</h2><button onClick={onStartTraining} disabled={!selectedDatasets.length}>{hasTrainingResults ? "训练结果已生成" : "开始训练"}</button></div>
        <div className="selected-dataset-strip">
          {selectedDatasets.map((id) => (
            <article
              className={`selected-dataset-card ${compareDatasetIds.includes(id) ? "active" : ""}`}
              key={id}
              onClick={() => onToggleCompareDataset(id)}
            >
              <button
                className="remove-dataset"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveSelectedDataset(id);
                }}
                aria-label={`remove ${id}`}
              >
                {"\u00d7"}
              </button>
              <i className="folder-icon" />
              <span>{labelForDataset(id)}</span>
            </article>
          ))}
        </div>
        <div className="compare-table">
          <header><b>{"\u6307\u6807"}</b><b>{compareA ? labelForDataset(compareA) : "-"}</b><b>{compareB ? labelForDataset(compareB) : "-"}</b><b>{"\u5dee\u5f02"}</b></header>
          {compareRows.map((key) => (
            <p key={key}>
              <span>{metricLabels[key]}</span>
              <span>{compareA ? pct(compareAMetrics[key]) : "-"}</span>
              <span>{compareB ? pct(compareBMetrics[key]) : "-"}</span>
              <strong>{compareB ? compareDelta(compareAMetrics[key], compareBMetrics[key]) : "-"}</strong>
            </p>
          ))}
        </div>
      </section>
    </aside>
  );
}

function CenterStage({ activeDataset, activeCustomDataset, selectedClipIndex, onSelectClip, selectedFrameIndex, onSelectFrame, onOpenImage, onRemoveCustomDatasetImage, showTrainingResults, hasDatasetSelection }) {
  const [hoverProjectionPoint, setHoverProjectionPoint] = useState(null);
  const [timelineMode, setTimelineMode] = useState("overview");
  const [projectionZoom, setProjectionZoom] = useState(1);
  const [projectionPan, setProjectionPan] = useState({ x: 0, y: 0 });
  const [isPanningProjection, setIsPanningProjection] = useState(false);
  const [projectionSelection, setProjectionSelection] = useState([]);
  const [projectionColorMode, setProjectionColorMode] = useState("effect");
  const [projectionCategoryFilter, setProjectionCategoryFilter] = useState("");
  const [selectionBox, setSelectionBox] = useState(null);
  const [collectedProjectionImages, setCollectedProjectionImages] = useState([]);
  const [scrollingPane, setScrollingPane] = useState("");
  const projectionDragRef = useRef(null);
  const selectionDragRef = useRef(null);
  const projectionSceneRef = useRef(null);
  const scrollHideTimerRef = useRef(null);
  const customVisuals = useMemo(() => buildCustomDatasetVisuals(activeCustomDataset), [activeCustomDataset]);
  const datasetClips = useMemo(() => (
    activeCustomDataset
      ? customVisuals.map((item, index) => ({
          ...item,
          startFrame: index,
          endFrame: index,
        }))
      : buildDatasetClips(activeDataset.id)
  ), [activeDataset.id, activeCustomDataset, customVisuals]);
  const projectionPoints = useMemo(() => (
    activeCustomDataset ? buildCustomProjectionPoints(customVisuals) : buildProjectionPoints(activeDataset.id)
  ), [activeDataset.id, activeCustomDataset, customVisuals]);
  const visibleProjectionCategories = useMemo(() => {
    const styles = projectionCategoryStyles[projectionColorMode];
    const categories = [...new Set(projectionPoints.map((point) => point.categories?.[projectionColorMode]))]
      .filter(Boolean)
      .sort((a, b) => {
        const order = projectionCategoryOrder[projectionColorMode];
        if (!order) return 0;
        return order.indexOf(a) - order.indexOf(b);
      });
    return categories.map((category) => ({
      category,
      label: styles[category]?.[0] ?? category,
      color: styles[category]?.[1] ?? projectionColors[0],
    }));
  }, [projectionPoints, projectionColorMode]);
  const viewKey = activeCustomDataset?.id ?? activeDataset.id;
  const viewTitle = activeCustomDataset?.name ?? activeDataset.id;
  const selectedClip = datasetClips[selectedClipIndex] ?? datasetClips[0];
  const selectedFrame = selectedClip?.frames?.[selectedFrameIndex] ?? selectedClip?.frames?.[0];

  useEffect(() => {
    setTimelineMode("overview");
    setProjectionZoom(1);
    setProjectionPan({ x: 0, y: 0 });
    setProjectionSelection([]);
    setProjectionCategoryFilter("");
    setSelectionBox(null);
  }, [viewKey]);

  useEffect(() => () => {
    if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
  }, []);

  function changeProjectionZoom(nextZoom) {
    setProjectionZoom(Math.min(3, Math.max(0.6, Number(nextZoom.toFixed(2)))));
  }

  function resetProjectionView() {
    setProjectionZoom(1);
    setProjectionPan({ x: 0, y: 0 });
  }

  function finishProjectionSelection(rect) {
    const scene = projectionSceneRef.current;
    if (!scene || !rect) return;
    const left = Math.min(rect.startX, rect.endX);
    const right = Math.max(rect.startX, rect.endX);
    const top = Math.min(rect.startY, rect.endY);
    const bottom = Math.max(rect.startY, rect.endY);
    const bounds = scene.getBoundingClientRect();
    setProjectionSelection(projectionPoints.flatMap((point, index) => {
      if (projectionCategoryFilter && point.categories?.[projectionColorMode] !== projectionCategoryFilter) return [];
      const x = bounds.width * (50 + (point.left - 50) * projectionZoom) / 100 + projectionPan.x;
      const y = bounds.height * (50 + (point.top - 50) * projectionZoom) / 100 + projectionPan.y;
      return x >= left && x <= right && y >= top && y <= bottom ? [index] : [];
    }));
  }

  function showPaneScrollbar(pane) {
    setScrollingPane(pane);
    if (scrollHideTimerRef.current) window.clearTimeout(scrollHideTimerRef.current);
    scrollHideTimerRef.current = window.setTimeout(() => {
      setScrollingPane("");
      scrollHideTimerRef.current = null;
    }, 700);
  }

  function openClipDetail(index) {
    onSelectClip(index);
    onSelectFrame(0);
    setTimelineMode("detail");
  }

  function openOverview() {
    setTimelineMode("overview");
  }

  return (
    <main className={"center-stage" + (hasDatasetSelection ? "" : " awaiting-dataset") + (activeCustomDataset ? "" : " expanded-video-timeline-layout")}>
      <section className="video-workspace">
        <div
          className={"dataset-a-list scroll-pane" + (scrollingPane === "clips" ? " is-scrolling" : "")}
          onScroll={() => showPaneScrollbar("clips")}
        >
          <h2>{viewTitle} &middot; {datasetClips.length}</h2>
          {datasetClips.map((clip, index) => (
            <Thumb
              label={clip.label}
              active={index === selectedClipIndex}
              coverSrc={clip.coverSrc}
              key={`${activeDataset.id}-${clip.label}`}
              onClick={() => {
                if (activeCustomDataset) {
                  onOpenImage({
                    src: clip.coverSrc,
                    title: clip.label,
                    subtitle: activeCustomDataset.name,
                  });
                } else {
                  openClipDetail(index);
                }
              }}
              onRemove={activeCustomDataset && !activeCustomDataset.builtIn
                ? () => onRemoveCustomDatasetImage(activeCustomDataset.id, clip.itemKey)
                : undefined}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "copy";
                event.dataTransfer.setData("application/x-gamefeature-item", JSON.stringify({
                  kind: "clip",
                  datasetId: clip.datasetId ?? activeDataset.id,
                  label: activeCustomDataset ? clip.sourceLabel : activeDataset.id + " / " + clip.label,
                  coverSrc: clip.coverSrc,
                  frameIndex: clip.frameIndex,
                }));
              }}
            />
          ))}
        </div>
        <aside
          className="projection-collection"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            try {
              const images = JSON.parse(event.dataTransfer.getData("application/x-projection-images"));
              if (!Array.isArray(images)) return;
              setCollectedProjectionImages((items) => {
                const existing = new Set(items.map((item) => item.key));
                return [...items, ...images.filter((item) => !existing.has(item.key))];
              });
            } catch { /* Ignore unsupported external drops. */ }
          }}
        >
          <header
            className={collectedProjectionImages.length ? "batch-drag-handle" : ""}
            draggable={collectedProjectionImages.length > 0}
            title={collectedProjectionImages.length ? "拖动标题栏，将全部图片加入左侧数据集" : "请先添加框选图片"}
            onDragStart={(event) => {
              if (!collectedProjectionImages.length) {
                event.preventDefault();
                return;
              }
              const items = collectedProjectionImages.map((item) => ({
                kind: "clip",
                datasetId: item.datasetId ?? activeDataset.id,
                label: item.label,
                coverSrc: item.imageSrc,
                frameIndex: item.frameIndex,
              }));
              event.dataTransfer.effectAllowed = "copy";
              event.dataTransfer.setData("application/x-gamefeature-items", JSON.stringify(items));
            }}
          >
            <h2>框选图片</h2>
            <div className="projection-collection-actions">
              <span>{collectedProjectionImages.length}</span>
              <button
                type="button"
                disabled={collectedProjectionImages.length === 0}
                onPointerDown={(event) => event.stopPropagation()}
                onDragStart={(event) => event.preventDefault()}
                onClick={(event) => {
                  event.stopPropagation();
                  setCollectedProjectionImages([]);
                }}
              >
                清空
              </button>
            </div>
          </header>
          <p>Shift + 拖动框选<br />再拖入此栏</p>
          <div
            className={"projection-collection-list scroll-pane" + (scrollingPane === "collection" ? " is-scrolling" : "")}
            onScroll={() => showPaneScrollbar("collection")}
          >
            {collectedProjectionImages.map((item) => (
              <article key={item.key}>
                <img src={item.imageSrc} alt={item.label} />
                <span>{item.label}</span>
                <button
                  type="button"
                  aria-label={"移除" + item.label}
                  onClick={() => setCollectedProjectionImages((items) => items.filter((entry) => entry.key !== item.key))}
                >
                  {"\u00d7"}
                </button>
              </article>
            ))}
          </div>
        </aside>
        <div className="stage-area">
          <div className="stage-head">{"\u964d\u7ef4\u56fe"}</div>
          <div
            ref={projectionSceneRef}
            className={"scene pannable-scene" + (isPanningProjection ? " is-panning" : "")}
            onWheel={(event) => {
              event.preventDefault();
              changeProjectionZoom(projectionZoom + (event.deltaY < 0 ? 0.15 : -0.15));
            }}
            onPointerDown={(event) => {
              if (event.button !== 0 || event.target.closest(".projection-zoom-controls, .plot-legend")) return;
              const bounds = event.currentTarget.getBoundingClientRect();
              if (event.shiftKey) {
                const rect = {
                  startX: event.clientX - bounds.left,
                  startY: event.clientY - bounds.top,
                  endX: event.clientX - bounds.left,
                  endY: event.clientY - bounds.top,
                };
                selectionDragRef.current = { pointerId: event.pointerId, ...rect };
                setSelectionBox(rect);
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }
              projectionDragRef.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                panX: projectionPan.x,
                panY: projectionPan.y,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              setIsPanningProjection(true);
            }}
            onPointerMove={(event) => {
              const selection = selectionDragRef.current;
              if (selection?.pointerId === event.pointerId) {
                const bounds = event.currentTarget.getBoundingClientRect();
                const rect = {
                  startX: selection.startX,
                  startY: selection.startY,
                  endX: event.clientX - bounds.left,
                  endY: event.clientY - bounds.top,
                };
                selectionDragRef.current = { ...selection, ...rect };
                setSelectionBox(rect);
                return;
              }
              const drag = projectionDragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              setProjectionPan({
                x: drag.panX + event.clientX - drag.startX,
                y: drag.panY + event.clientY - drag.startY,
              });
            }}
            onPointerUp={(event) => {
              if (selectionDragRef.current?.pointerId === event.pointerId) {
                finishProjectionSelection(selectionDragRef.current);
                selectionDragRef.current = null;
                setSelectionBox(null);
                event.currentTarget.releasePointerCapture(event.pointerId);
                return;
              }
              if (projectionDragRef.current?.pointerId !== event.pointerId) return;
              projectionDragRef.current = null;
              setIsPanningProjection(false);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              projectionDragRef.current = null;
              selectionDragRef.current = null;
              setSelectionBox(null);
              setIsPanningProjection(false);
            }}
          >
            {selectionBox && (
              <div
                className="projection-selection-box"
                style={{
                  left: Math.min(selectionBox.startX, selectionBox.endX),
                  top: Math.min(selectionBox.startY, selectionBox.endY),
                  width: Math.abs(selectionBox.endX - selectionBox.startX),
                  height: Math.abs(selectionBox.endY - selectionBox.startY),
                }}
              />
            )}
            {projectionPoints.map((point, index) => (
              <i
                className={"projection-point" + (projectionSelection.includes(index) ? " selected" : "")}
                draggable={projectionSelection.includes(index)}
                onPointerDown={(event) => {
                  if (projectionSelection.includes(index) && !event.shiftKey) event.stopPropagation();
                }}
                onDragStart={(event) => {
                  const indexes = projectionSelection.includes(index) ? projectionSelection : [index];
                  const images = indexes.map((pointIndex) => {
                    const selectedPoint = projectionPoints[pointIndex];
                    return {
                      key: viewKey + ":" + selectedPoint.startFrame + ":" + pointIndex,
                      datasetId: selectedPoint.datasetId ?? activeDataset.id,
                      label: "frames " + selectedPoint.startFrame + "-" + selectedPoint.endFrame,
                      imageSrc: selectedPoint.firstFrame.imageSrc,
                      frameIndex: selectedPoint.firstFrame.frameIndex,
                    };
                  });
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-projection-images", JSON.stringify(images));
                }}
                style={{
                  left: "calc(" + (50 + (point.left - 50) * projectionZoom) + "% + " + projectionPan.x + "px)",
                  top: "calc(" + (50 + (point.top - 50) * projectionZoom) + "% + " + projectionPan.y + "px)",
                  background: projectionCategoryStyles[projectionColorMode][point.categories?.[projectionColorMode]]?.[1] ?? projectionColors[0],
                  display: projectionCategoryFilter && point.categories?.[projectionColorMode] !== projectionCategoryFilter ? "none" : undefined,
                }}
                onMouseEnter={() => setHoverProjectionPoint(point)}
                onMouseLeave={() => setHoverProjectionPoint(null)}
                key={`${point.startFrame}-${index}`}
              />
            ))}
            {hoverProjectionPoint && (
              <div
                className="projection-preview"
                style={{
                  left: "calc(" + (50 + (hoverProjectionPoint.left - 50) * projectionZoom) + "% + " + projectionPan.x + "px)",
                  top: "calc(" + (50 + (hoverProjectionPoint.top - 50) * projectionZoom) + "% + " + projectionPan.y + "px)",
                }}
              >
                <img src={hoverProjectionPoint.firstFrame.imageSrc} alt={`frame ${hoverProjectionPoint.startFrame}`} />
                <p>
                  <b>frames {hoverProjectionPoint.startFrame}-{hoverProjectionPoint.endFrame}</b>
                  <span>
                    {projectionCategoryStyles[projectionColorMode][hoverProjectionPoint.categories?.[projectionColorMode]]?.[0] ?? "未分类"}
                  </span>
                </p>
              </div>
            )}
            <div className="projection-zoom-controls" aria-label="降维图缩放控件">
              <button type="button" onClick={() => changeProjectionZoom(projectionZoom - 0.2)} aria-label="缩小降维图">−</button>
              <button type="button" className="zoom-value" onClick={resetProjectionView} title="点击恢复初始视图">
                {Math.round(projectionZoom * 100)}%
              </button>
              <button type="button" onClick={() => changeProjectionZoom(projectionZoom + 0.2)} aria-label="放大降维图">+</button>
            </div>
            <div className="plot-axis x-axis">{"\u89c6\u89c9\u590d\u6742\u5ea6"}</div>
            <div className="plot-axis y-axis">{"\u65f6\u5e8f\u7a81\u53d8"}</div>
            <div className="plot-legend">
              <div className="projection-color-tabs" aria-label="选择降维图分类方式">
                {[
                  ["effect", "特效"],
                  ["motion", "运动"],
                  ["ui", "UI"],
                  ["keyframe", "关键帧"],
                ].map(([mode, label]) => (
                  <button
                    className={projectionColorMode === mode ? "active" : ""}
                    type="button"
                    onClick={() => {
                      setProjectionColorMode(mode);
                      setProjectionCategoryFilter("");
                      setProjectionSelection([]);
                      setHoverProjectionPoint(null);
                    }}
                    key={mode}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="projection-category-legend">
                {visibleProjectionCategories.map((item) => (
                  <button
                    className={projectionCategoryFilter === item.category ? "active" : ""}
                    type="button"
                    title={projectionCategoryFilter === item.category ? "再次点击恢复全部" : "只显示该类别"}
                    onClick={() => {
                      setProjectionCategoryFilter((current) => current === item.category ? "" : item.category);
                      setProjectionSelection([]);
                      setHoverProjectionPoint(null);
                    }}
                    key={item.category}
                  >
                    <i style={{ background: item.color }} />{item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className={"timeline-feature-panel" + (activeCustomDataset ? "" : " has-brightness-track")}>
        <Timeline
          activeDataset={activeDataset}
          datasetClips={datasetClips}
          selectedClipIndex={selectedClipIndex}
          selectedClip={selectedClip}
          selectedFrameIndex={selectedFrameIndex}
          onSelectFrame={onSelectFrame}
          onSelectClip={onSelectClip}
          timelineMode={timelineMode}
          onOpenClipDetail={(index) => openClipDetail(index)}
          onOpenOverview={openOverview}
          onOpenImage={onOpenImage}
          isImageDataset={Boolean(activeCustomDataset)}
          imageDatasetName={activeCustomDataset?.name}
        />
        <FeatureMap selectedClip={selectedClip} selectedFrameIndex={selectedFrameIndex} selectedFrame={selectedFrame} showTrainingResults={showTrainingResults} />
      </section>
    </main>
  );
}

function ImageSequenceTimeline({ dataset, images, selectedIndex, onSelect, onOpenImage }) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [showEffects, setShowEffects] = useState(true);
  const [showKeyframes, setShowKeyframes] = useState(true);
  const [showUi, setShowUi] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportRef = useRef(null);
  const panRef = useRef(null);
  const suppressClickRef = useRef(false);
  const cellWidth = (viewportWidth / 60) * zoom;
  const contentWidth = images.length * cellWidth;

  function clampPan(nextPan, nextZoom = zoom) {
    const nextWidth = images.length * (viewportWidth / 60) * nextZoom;
    return Math.min(0, Math.max(viewportWidth - nextWidth, nextPan));
  }

  function changeZoom(nextZoom) {
    const normalized = Math.min(6, Math.max(1, Number(nextZoom.toFixed(2))));
    setZoom(normalized);
    setPanX((current) => clampPan(current, normalized));
  }

  useEffect(() => {
    setZoom(1);
    setPanX(0);
  }, [dataset.id]);

  useEffect(() => {
    setPanX((current) => clampPan(current));
  }, [images.length]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const updateWidth = () => setViewportWidth(viewport.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="timeline-dock image-sequence-timeline">
      <div className="tool-strip">
        <button type="button">图片顺序</button>
        <button type="button" title="按图片加入数据集的先后顺序排列">{dataset.name}</button>
        <div className="feature-toggles" aria-label="选择图片顺序轴显示的特征">
          <span>全局分布 · {images.length} 张</span>
          <label><input type="checkbox" checked={showEffects} onChange={(event) => setShowEffects(event.target.checked)} />特效</label>
          <label><input type="checkbox" checked={showKeyframes} onChange={(event) => setShowKeyframes(event.target.checked)} />关键帧</label>
          <label><input type="checkbox" checked={showUi} onChange={(event) => setShowUi(event.target.checked)} />UI</label>
        </div>
        <div className="sequence-zoom-controls" aria-label="图片顺序轴缩放控件">
          <button type="button" onClick={() => changeZoom(zoom - 0.25)} aria-label="缩小图片顺序轴">−</button>
          <button type="button" onClick={() => { setZoom(1); setPanX(0); }} title="点击恢复初始视图">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => changeZoom(zoom + 0.25)} aria-label="放大图片顺序轴">+</button>
        </div>
      </div>
      <div className="image-sequence-body">
        <div className="sequence-track-labels">
          <b>关键帧轨道</b>
          <b>特效轨道</b>
          <b>UI 轨道</b>
        </div>
        <div
          ref={viewportRef}
          className={`sequence-viewport${isPanning ? " is-panning" : ""}${images.length ? "" : " is-empty"}`}
          onWheel={(event) => {
            event.preventDefault();
            changeZoom(zoom + (event.deltaY < 0 ? 0.25 : -0.25));
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            suppressClickRef.current = false;
            panRef.current = { pointerId: event.pointerId, startX: event.clientX, panX };
            event.currentTarget.setPointerCapture(event.pointerId);
            setIsPanning(true);
          }}
          onPointerMove={(event) => {
            const drag = panRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            if (Math.abs(event.clientX - drag.startX) > 3) suppressClickRef.current = true;
            setPanX(clampPan(drag.panX + event.clientX - drag.startX));
          }}
          onPointerUp={(event) => {
            if (panRef.current?.pointerId !== event.pointerId) return;
            panRef.current = null;
            setIsPanning(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { panRef.current = null; setIsPanning(false); }}
        >
          {!images.length && <span className="sequence-empty-message">将图片拖入数据集后，会按加入顺序显示在这里</span>}
          <div className="sequence-content" style={{ width: `${contentWidth}px`, transform: `translateX(${panX}px)` }}>
            {["keyframe", "effect", "ui"].map((track) => (
              <div className={`sequence-track sequence-${track}-track`} key={track}>
                {images.map((image, index) => {
                  const frame = image.representativeFrame ?? {};
                  const effect = primaryEffect(frame);
                  return (
                    <button
                      type="button"
                      className={`sequence-cell${selectedIndex === index ? " active" : ""}`}
                      style={{ width: `${cellWidth}px` }}
                      onClick={() => {
                        if (suppressClickRef.current) {
                          suppressClickRef.current = false;
                          return;
                        }
                        onSelect(index);
                      }}
                      onDoubleClick={() => onOpenImage({ src: image.coverSrc, title: image.sourceLabel ?? image.label, subtitle: dataset.name })}
                      title={`第 ${index + 1} 张 · ${image.sourceLabel ?? image.label}`}
                      key={`${track}-${image.itemKey ?? image.label}`}
                    >
                      {track === "keyframe" && showKeyframes && frame.isKeyframe && <i className="sequence-keyframe-marker" />}
                      {track === "effect" && showEffects && effect && <i className="sequence-effect-fill" style={{ background: effectColors[effect] ?? effectColors.other }} />}
                      {track === "ui" && showUi && frame.hasLargeUi && <i className="sequence-ui-fill" />}
                      {track === "keyframe" && <span className="sequence-index" style={{ opacity: zoom >= 3 ? 1 : 0 }}>{index + 1}</span>}
                      {selectedIndex === index && <i className="sequence-selected-marker" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Timeline({
  activeDataset,
  datasetClips,
  selectedClipIndex,
  selectedClip,
  selectedFrameIndex,
  onSelectFrame,
  onSelectClip,
  timelineMode,
  onOpenClipDetail,
  onOpenOverview,
  onOpenImage,
  isImageDataset = false,
  imageDatasetName = "",
}) {
  const [hoverFrameIndex, setHoverFrameIndex] = useState(null);
  const [hoverTrack, setHoverTrack] = useState("");
  const [hoverX, setHoverX] = useState(0);
  const [timelineSelection, setTimelineSelection] = useState(null);
  const [showEffects, setShowEffects] = useState(true);
  const [showKeyframes, setShowKeyframes] = useState(true);
  const [sequenceZoom, setSequenceZoom] = useState(1);
  const [sequencePan, setSequencePan] = useState(0);
  const [isSequencePanning, setIsSequencePanning] = useState(false);
  const hoverClearTimer = useRef(null);
  const timelineSelectionRef = useRef(null);
  const sequenceProgressRef = useRef(null);
  const sequencePanRef = useRef(null);
  const suppressSequenceClickRef = useRef(false);
  const overviewFrames = useMemo(
    () => datasetClips.flatMap((clip, clipIndex) => {
      const clipFrames = isImageDataset
        ? [{ ...(clip.representativeFrame ?? clip.frames?.[0] ?? {}), imageSrc: clip.coverSrc }]
        : (clip.frames ?? []);
      return clipFrames.map((frame, frameIndex) => ({
        ...frame,
        localIndex: isImageDataset ? clipIndex : clipIndex * 60 + frameIndex,
        clipIndex,
        clipLabel: clip.label,
        sourceLabel: clip.sourceLabel,
      }));
    }),
    [datasetClips, isImageDataset]
  );
  const detailFrames = selectedClip?.frames ?? [];
  const isOverview = timelineMode === "overview";
  const frames = isOverview ? overviewFrames : detailFrames;
  const totalFrames = Math.max(1, frames.length);
  const hoverStep = isImageDataset ? 1 : isOverview ? 5 : 1;
  const hoveredFrame = hoverFrameIndex === null ? null : frames[hoverFrameIndex];
  const effectSegments = useMemo(() => buildEffectSegments(frames), [frames]);
  const uiSegments = useMemo(() => buildBooleanSegments(frames, (frame) => frame.hasLargeUi), [frames]);
  const keyframes = frames.filter((frame) => frame.isKeyframe);
  const selectedGlobalIndex = isImageDataset ? selectedClipIndex : selectedClipIndex * 60 + selectedFrameIndex;
  const selectedTimelineIndex = isOverview ? selectedGlobalIndex : selectedFrameIndex;
  const selectedLeft = totalFrames ? ((selectedTimelineIndex + 0.5) / totalFrames) * 100 : 0;

  useEffect(() => {
    setTimelineSelection(null);
    timelineSelectionRef.current = null;
  }, [activeDataset.id, timelineMode, selectedClipIndex]);

  useEffect(() => {
    setSequenceZoom(1);
    setSequencePan(0);
  }, [imageDatasetName]);

  function changeSequenceZoom(nextZoom) {
    const currentWidth = sequenceProgressRef.current?.getBoundingClientRect().width ?? 0;
    const baseWidth = currentWidth / sequenceZoom;
    const baseCellWidth = baseWidth / Math.max(1, totalFrames);
    const targetCellWidth = 34 * (16 / 9);
    const maxZoom = Math.max(1, targetCellWidth / Math.max(1, baseCellWidth));
    const normalized = Math.min(maxZoom, Math.max(1, Number(nextZoom.toFixed(2))));
    setSequenceZoom(normalized);
    setSequencePan((current) => Math.min(0, Math.max(baseWidth - baseWidth * normalized, current)));
  }

  function sequenceIsAtMaxZoom() {
    const currentWidth = sequenceProgressRef.current?.getBoundingClientRect().width ?? 0;
    const baseCellWidth = (currentWidth / sequenceZoom) / Math.max(1, totalFrames);
    const maxZoom = Math.max(1, (34 * (16 / 9)) / Math.max(1, baseCellWidth));
    return sequenceZoom >= maxZoom - 0.01;
  }

  function startSequencePan(event) {
    if (!isImageDataset || event.shiftKey || event.button !== 0) return false;
    suppressSequenceClickRef.current = false;
    sequencePanRef.current = { pointerId: event.pointerId, startX: event.clientX, pan: sequencePan };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsSequencePanning(true);
    return true;
  }

  function moveSequencePan(event) {
    const drag = sequencePanRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 3) suppressSequenceClickRef.current = true;
    const contentWidth = sequenceProgressRef.current?.getBoundingClientRect().width ?? 0;
    const baseWidth = contentWidth / sequenceZoom;
    setSequencePan(Math.min(0, Math.max(baseWidth - contentWidth, drag.pan + delta)));
    return true;
  }

  function finishSequencePan(event) {
    if (sequencePanRef.current?.pointerId !== event.pointerId) return false;
    sequencePanRef.current = null;
    setIsSequencePanning(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  }

  function indexFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const rawIndex = Math.min(totalFrames - 1, Math.max(0, Math.floor((x / rect.width) * totalFrames)));
    const index = Math.min(totalFrames - 1, Math.floor(rawIndex / hoverStep) * hoverStep);
    return { index, rawIndex, x };
  }

  function handleTimelineMove(event, track) {
    cancelHoverClear();
    const { index, x } = indexFromEvent(event);
    setHoverFrameIndex(index);
    setHoverTrack(track);
    setHoverX(x);
  }

  function clearHover() {
    cancelHoverClear();
    setHoverFrameIndex(null);
    setHoverTrack("");
  }

  function cancelHoverClear() {
    if (hoverClearTimer.current) {
      window.clearTimeout(hoverClearTimer.current);
      hoverClearTimer.current = null;
    }
  }

  function scheduleClearHover() {
    cancelHoverClear();
    hoverClearTimer.current = window.setTimeout(() => {
      setHoverFrameIndex(null);
      setHoverTrack("");
      hoverClearTimer.current = null;
    }, 220);
  }

  function handleTimelineClick(event) {
    if (event.shiftKey || timelineSelectionRef.current || suppressSequenceClickRef.current) {
      suppressSequenceClickRef.current = false;
      return;
    }
    const { rawIndex } = indexFromEvent(event);
    if (isOverview) {
      const clipIndex = isImageDataset
        ? Math.min(datasetClips.length - 1, Math.max(0, rawIndex))
        : Math.min(datasetClips.length - 1, Math.max(0, Math.floor(rawIndex / 60)));
      if (isImageDataset) {
        onSelectClip(clipIndex);
        return;
      }
      onOpenClipDetail(clipIndex);
      return;
    }
    onSelectFrame(rawIndex);
  }

  function handleBackToOverview() {
    onOpenOverview();
  }

  function renderPreview(track) {
    if (!hoveredFrame || hoverTrack !== track) return null;
    const previewTitle = isImageDataset
      ? (hoveredFrame.clipLabel ?? `图片 ${hoverFrameIndex + 1}`)
      : `frame ${hoveredFrame.frameIndex}`;
    const caption = track === "ui"
      ? hoveredFrame.hasLargeUi ? "large UI overlay" : "no large UI"
      : hoveredFrame.effects.length ? hoveredFrame.effects.join(", ") : "no effect";
    return (
      <button
        className="frame-preview"
        style={{ left: hoverX }}
        onClick={(event) => {
          event.stopPropagation();
          onOpenImage({
            src: isImageDataset ? hoveredFrame.imageSrc : highResFrameSrc(activeDataset.id, hoveredFrame),
            title: previewTitle,
            subtitle: caption,
          });
        }}
        onMouseEnter={cancelHoverClear}
        onMouseLeave={scheduleClearHover}
        type="button"
      >
        <img src={hoveredFrame.imageSrc} alt={previewTitle} />
        <p>
          <b>{previewTitle}</b>
          <span>{caption}</span>
        </p>
      </button>
    );
  }

  function renderBrightnessTrack() {
    const values = frames.map((frame) => Number(frame?.brightnessDelta) || 0);
    const maxValue = Math.max(0.01, ...values);
    const points = values.map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * 100 : 50;
      const y = 27 - (value / maxValue) * 22;
      return `${x},${y}`;
    }).join(" ");
    const currentIndex = Math.min(values.length - 1, Math.max(0, selectedTimelineIndex));
    const currentX = values.length > 1 ? (currentIndex / (values.length - 1)) * 100 : 50;
    const currentY = values.length ? 27 - (values[currentIndex] / maxValue) * 22 : 27;
    return (
      <div className="feature-track brightness-feature-track">
        <div className="track-label"><b>明暗变化</b></div>
        <div className={`feature-progress brightness-progress ${isOverview ? "overview-progress" : ""}`} onClick={handleTimelineClick}>
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="明暗变化折线">
            <polyline points={points} fill="none" stroke="#d68b2c" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            {values.length > 0 && <ellipse cx={currentX} cy={currentY} rx="0.32" ry="1.8" fill="#d68b2c" stroke="#fff" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />}
          </svg>
          <i className="selected-frame-marker" style={{ left: `${selectedLeft}%` }} />
        </div>
      </div>
    );
  }

  function renderFastChangeTrack() {
    const values = frames.map((frame) => Number(frame?.fastChangeScore) || 0);
    const maxValue = Math.max(0.01, ...values);
    const points = values.map((value, index) => {
      const x = values.length > 1 ? (index / (values.length - 1)) * 100 : 50;
      const y = 27 - (value / maxValue) * 22;
      return `${x},${y}`;
    }).join(" ");
    const currentIndex = Math.min(values.length - 1, Math.max(0, selectedTimelineIndex));
    const currentX = values.length > 1 ? (currentIndex / (values.length - 1)) * 100 : 50;
    const currentY = values.length ? 27 - (values[currentIndex] / maxValue) * 22 : 27;
    return (
      <div className="feature-track fast-change-feature-track">
        <div className="track-label"><b>高速变化</b></div>
        <div className={`feature-progress fast-change-progress ${isOverview ? "overview-progress" : ""}`} onClick={handleTimelineClick}>
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-label="高速变化折线">
            <polyline points={points} fill="none" stroke="#6f63c2" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
            {values.length > 0 && <ellipse cx={currentX} cy={currentY} rx="0.32" ry="1.8" fill="#6f63c2" stroke="#fff" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />}
          </svg>
          <i className="selected-frame-marker" style={{ left: `${selectedLeft}%` }} />
        </div>
      </div>
    );
  }

  function startTimelineSelection(event) {
    if (!event.shiftKey || event.button !== 0) return false;
    event.preventDefault();
    const { rawIndex } = indexFromEvent(event);
    const selection = { pointerId: event.pointerId, start: rawIndex, end: rawIndex };
    timelineSelectionRef.current = selection;
    setTimelineSelection(selection);
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  }

  function moveTimelineSelection(event) {
    const selection = timelineSelectionRef.current;
    if (!selection || selection.pointerId !== event.pointerId) return false;
    const { rawIndex } = indexFromEvent(event);
    const nextSelection = { ...selection, end: rawIndex };
    timelineSelectionRef.current = nextSelection;
    setTimelineSelection(nextSelection);
    return true;
  }

  function finishTimelineSelection(event) {
    const selection = timelineSelectionRef.current;
    if (!selection || selection.pointerId !== event.pointerId) return false;
    const normalized = {
      start: Math.min(selection.start, selection.end),
      end: Math.max(selection.start, selection.end),
    };
    timelineSelectionRef.current = null;
    setTimelineSelection(normalized);
    event.currentTarget.releasePointerCapture(event.pointerId);
    return true;
  }

  return (
    <section className="timeline-dock">
      <div className="tool-strip">
        <button onClick={handleBackToOverview}>{isImageDataset ? "图片顺序" : "\u603b\u89c8 14s"}</button><button title="按住 Shift 在时间轴上拖动">Shift 框选</button>
        <div className="feature-toggles" aria-label={"\u9009\u62e9\u65f6\u95f4\u8f74\u663e\u793a\u7684\u7279\u5f81"}>
          <span>{isImageDataset ? `${imageDatasetName} · ${frames.length} 张` : isOverview ? "\u5168\u5c40\u5206\u5e03" : "\u7247\u6bb5\u8be6\u60c5"}</span>
          <label><input type="checkbox" checked={showEffects} onChange={(event) => setShowEffects(event.target.checked)} />{"\u7279\u6548"}</label>
          <label><input type="checkbox" checked={showKeyframes} onChange={(event) => setShowKeyframes(event.target.checked)} />{"\u5173\u952e\u5e27"}</label>
          <label><input type="checkbox" defaultChecked />UI</label>
          <label><input type="checkbox" />{"\u6bcf5\u5e27\u9884\u89c8"}</label>
          <label><input type="checkbox" />{"\u6bcf\u5e27\u9884\u89c8"}</label>
        </div>
        {isImageDataset && <div className="sequence-zoom-controls" aria-label="图片顺序轴缩放控件">
          <button type="button" onClick={() => changeSequenceZoom(sequenceZoom - 0.25)}>−</button>
          <button type="button" onClick={() => { setSequenceZoom(1); setSequencePan(0); }} title="点击恢复初始视图">{Math.round(sequenceZoom * 100)}%</button>
          <button type="button" onClick={() => changeSequenceZoom(sequenceZoom + 0.25)}>+</button>
        </div>}
      </div>
      <div className={`timeline-body${isImageDataset ? "" : " with-brightness-track"}`}>
        <div className="feature-track">
          <div className="track-label timeline-track-label">
            <b>关键帧轨道</b>
            <b>特效轨道</b>
          </div>
          <div
            ref={sequenceProgressRef}
            className={`feature-progress ${isOverview ? "overview-progress" : ""}${isImageDataset ? " image-sequence-progress" : ""}`}
            style={isImageDataset ? { width: `${sequenceZoom * 100}%`, transform: `translateX(${sequencePan}px)` } : undefined}
            onWheel={(event) => {
              if (!isImageDataset) return;
              event.preventDefault();
              changeSequenceZoom(sequenceZoom + (event.deltaY < 0 ? 0.25 : -0.25));
            }}
            onPointerDown={(event) => { if (!startSequencePan(event)) startTimelineSelection(event); }}
            onPointerMove={(event) => {
              if (!moveSequencePan(event) && !moveTimelineSelection(event)) handleTimelineMove(event, "effect");
            }}
            onPointerUp={(event) => { if (!finishSequencePan(event)) finishTimelineSelection(event); }}
            onPointerCancel={() => {
              timelineSelectionRef.current = null;
              setTimelineSelection(null);
            }}
            onClick={handleTimelineClick}
            onMouseLeave={scheduleClearHover}
          >
            {isOverview && datasetClips.map((clip, index) => (
              <i
                className="clip-second-boundary"
                style={{ left: `${(index / datasetClips.length) * 100}%`, width: `${100 / datasetClips.length}%` }}
                title={clip.label}
                key={`clip-boundary-${clip.label}`}
              >
                {isImageDataset && sequenceIsAtMaxZoom() && <img src={clip.coverSrc} alt={clip.label} draggable="false" />}
              </i>
            ))}
            {showEffects && !isOverview && frames.map((frame, index) => {
              const effect = primaryEffect(frame);
              if (!effect) return null;
              return (
                <i
                  className="effect-frame-cell"
                  style={{
                    left: `${(index / totalFrames) * 100}%`,
                    width: `${100 / totalFrames}%`,
                    background: effectColors[effect] ?? effectColors.other,
                  }}
                  title={`${frame.frameIndex ?? index} frame · ${effect}`}
                  key={`effect-frame-${frame.frameIndex ?? index}-${index}`}
                />
              );
            })}
            {showEffects && isOverview && effectSegments.map((segment, index) => (
              <i
                className="effect-region"
                style={{
                  left: `${(segment.start / totalFrames) * 100}%`,
                  width: `${((segment.end - segment.start + 1) / totalFrames) * 100}%`,
                  background: effectColors[segment.effect] ?? effectColors.other,
                }}
                title={segment.effect + " · " + (segment.end - segment.start + 1) + " frame(s)"}
                key={`${segment.effect}-${segment.start}-${index}`}
              />
            ))}
            {showKeyframes && (
              <div className="keyframe-rail" aria-label="关键帧轨道">
                {keyframes.map((frame, index) => (
                  <i
                    className="keyframe-marker"
                    style={{ left: `${framePosition(frame, index, totalFrames)}%` }}
                    title={`${frame.frameIndex ?? index} frame · 关键帧`}
                    key={`keyframe-${frame.frameIndex}-${index}`}
                  />
                ))}
              </div>
            )}
            <i className="selected-frame-marker" style={{ left: `${selectedLeft}%` }} />
            {timelineSelection && (
              <div
                className="timeline-selection-range"
                draggable
                title={"拖动已选中的 " + (timelineSelection.end - timelineSelection.start + 1) + " 帧到框选图片"}
                style={{
                  left: (timelineSelection.start / totalFrames) * 100 + "%",
                  width: ((timelineSelection.end - timelineSelection.start + 1) / totalFrames) * 100 + "%",
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  const images = frames
                    .slice(timelineSelection.start, timelineSelection.end + 1)
                    .map((frame, offset) => ({
                      key: activeDataset.id + ":timeline:" + (timelineSelection.start + offset),
                      datasetId: activeDataset.id,
                      label: "frame " + frame.frameIndex,
                      imageSrc: frame.imageSrc,
                      frameIndex: frame.frameIndex,
                    }));
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-projection-images", JSON.stringify(images));
                }}
              >
                <span>{timelineSelection.end - timelineSelection.start + 1} 帧</span>
              </div>
            )}
            {renderPreview("effect")}
          </div>
        </div>
        <div className="feature-track ui-feature-track">
          <div className="track-label"><b>UI 轨道</b></div>
          <div
            className={`feature-progress ui-progress ${isOverview ? "overview-progress" : ""}${isImageDataset ? " image-sequence-progress" : ""}`}
            style={isImageDataset ? { width: `${sequenceZoom * 100}%`, transform: `translateX(${sequencePan}px)` } : undefined}
            onWheel={(event) => {
              if (!isImageDataset) return;
              event.preventDefault();
              changeSequenceZoom(sequenceZoom + (event.deltaY < 0 ? 0.25 : -0.25));
            }}
            onPointerDown={startSequencePan}
            onPointerMove={(event) => { if (!moveSequencePan(event)) handleTimelineMove(event, "ui"); }}
            onPointerUp={finishSequencePan}
            onPointerCancel={() => { sequencePanRef.current = null; setIsSequencePanning(false); }}
            onClick={handleTimelineClick}
            onMouseLeave={scheduleClearHover}
          >
            {isOverview && datasetClips.map((clip, index) => (
              <i
                className="clip-second-boundary"
                style={{ left: `${(index / datasetClips.length) * 100}%`, width: `${100 / datasetClips.length}%` }}
                title={clip.label}
                key={`ui-clip-boundary-${clip.label}`}
              />
            ))}
            {uiSegments.map((segment, index) => (
              <i
                className="ui-region"
                style={{
                  left: `${(segment.start / totalFrames) * 100}%`,
                  width: `${((segment.end - segment.start + 1) / totalFrames) * 100}%`,
                }}
                title="large UI overlay"
                key={`ui-${segment.start}-${index}`}
              />
            ))}
            <i className="selected-frame-marker" style={{ left: `${selectedLeft}%` }} />
            {renderPreview("ui")}
          </div>
        </div>
        {!isImageDataset && renderBrightnessTrack()}
        {!isImageDataset && renderFastChangeTrack()}
        <div className="effect-legend">
          {showEffects && Object.entries(effectColors).slice(0, 10).map(([effect, color]) => (
            <span key={effect}><i style={{ background: color }} />{effectLabels[effect] ?? effect}</span>
          ))}
          {showKeyframes && <span><em />关键帧</span>}
          <span>{isImageDataset ? "点击选择图片" : isOverview ? "点击一秒区域展开" : "点击帧进行选择"}</span>
        </div>
      </div>
    </section>
  );
}

function hexToRgbLabel(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function MiniChartAxes({ children }) {
  return (
    <div className="mini-chart-axes">
      {children}
      <div className="mini-x-ticks"><span>-2</span><span>-1</span><span>当前</span><span>+1</span><span>+2</span></div>
      <span className="mini-x-axis">相对帧</span>
    </div>
  );
}

function BrightnessBars({ frames, selectedFrameIndex }) {
  const windowFrames = frameWindow(frames, selectedFrameIndex);
  const maxValue = Math.max(0.01, ...windowFrames.map((frame) => Number(frame.brightnessDelta) || 0));
  return (
    <MiniChartAxes>
      <div className="hist brightness-bars">
      {windowFrames.map((frame) => {
        const value = Number(frame.brightnessDelta) || 0;
        const isSelected = frame.localIndex === selectedFrameIndex;
        return (
          <i
            className={isSelected ? "selected" : ""}
            style={{ height: `${Math.max(8, (value / maxValue) * 84)}%` }}
            key={`brightness-${frame.localIndex}`}
          >
            <b>{value.toFixed(2)}</b>
          </i>
        );
      })}
      </div>
    </MiniChartAxes>
  );
}

function FastChangeBars({ frames, selectedFrameIndex }) {
  const windowFrames = frameWindow(frames, selectedFrameIndex);
  const maxValue = Math.max(0.01, ...windowFrames.map((frame) => Number(frame.fastChangeScore) || 0));
  return (
    <MiniChartAxes>
      <div className="hist brightness-bars fast-change-bars">
      {windowFrames.map((frame) => {
        const value = Number(frame.fastChangeScore) || 0;
        const isSelected = frame.localIndex === selectedFrameIndex;
        return (
          <i
            className={isSelected ? "selected" : ""}
            style={{ height: `${Math.max(8, (value / maxValue) * 84)}%` }}
            key={`fast-change-${frame.localIndex}`}
          >
            <b>{value.toFixed(2)}</b>
          </i>
        );
      })}
      </div>
    </MiniChartAxes>
  );
}

function DominantColorSwatches({ colors = [] }) {
  return (
    <div className="swatches dominant-swatches">
      {Array.from({ length: 5 }, (_, index) => {
        const color = colors[index] ?? "#d8e0e8";
        return <i style={{ background: color }} title={hexToRgbLabel(color)} key={`${color}-${index}`} />;
      })}
    </div>
  );
}

function InterpolationMetricSummary() {
  const values = Object.fromEntries(interpolationMetrics.map(([name, value]) => [name, value]));
  const groups = [
    {
      title: "单帧评价",
      tone: "blue",
      metrics: [
        ["PSNR", values.PSNR, "dB", "up", "良好"],
        ["SSIM", values.SSIM, "", "up", "优秀"],
        ["LPIPS", values.LPIPS, "", "down", "良好"],
      ],
    },
    {
      title: "视频评价",
      tone: "green",
      metrics: [
        ["CGVQM", values.CGVQM, "", "up", "良好"],
        ["VMAF", values.VMAF, "", "up", "优秀"],
      ],
    },
    {
      title: "光流 GT",
      tone: "violet",
      metrics: [
        ["FloLPIPS", values.FloLPIPS, "", "down", "良好"],
      ],
    },
  ];

  return (
    <article className="training-card metric-summary-card">
      <header>
        <strong>插帧评价指标</strong>
        <b className="metric-sample-count">200 帧 · 有光流 GT</b>
      </header>
      <div className="metric-summary-groups">
        {groups.map((group) => (
          <section className={"metric-group " + group.tone} key={group.title}>
            <h4><i />{group.title}</h4>
            <div className="metric-card-row">
              {group.metrics.map(([name, value, unit, direction, status]) => (
                <article className="metric-kpi" key={name}>
                  <div>
                    <span>{name}</span>
                    <em className={direction}>{direction === "up" ? "↑" : "↓"}</em>
                  </div>
                  <strong>
                    {Number(value) < 1 ? Number(value).toFixed(3) : Number(value).toFixed(2)}
                    {unit && <small>{unit}</small>}
                  </strong>
                  <b className={"metric-status " + (status === "优秀" ? "excellent" : status === "一般" ? "average" : "good")}>{status}</b>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

function OpticalFlowPreview({ selectedFrame }) {
  const [expanded, setExpanded] = useState(false);
  const flowImages = [1, 2, 3, 4].map((index) => `/optical-flow/flow-${String(index).padStart(2, "0")}.png`);
  return (
    <>
      <article className="training-card optical-flow-card">
        <header><strong>光流图</strong><div><b>{selectedFrame ? `frame ${selectedFrame.frameIndex}` : "待选择"}</b><button type="button" onClick={() => setExpanded(true)}>放大</button></div></header>
        <div className="optical-flow-visual" aria-label="光流图片展示区域">
          {flowImages.map((src, index) => <img src={src} alt={`光流图 ${index + 1}`} key={src} />)}
        </div>
      </article>
      {expanded && <div className="optical-flow-modal-backdrop" onClick={() => setExpanded(false)}>
        <section className="optical-flow-modal" onClick={(event) => event.stopPropagation()}>
          <header><strong>光流图预览</strong><button type="button" onClick={() => setExpanded(false)} aria-label="关闭光流图预览">×</button></header>
          <div>{flowImages.map((src, index) => <img src={src} alt={`光流图 ${index + 1}`} key={`expanded-${src}`} />)}</div>
        </section>
      </div>}
    </>
  );
}

function SpeedSummary() {
  return (
    <article className="training-card speed-summary-card">
      <header><strong>{"\u5904\u7406\u901f\u5ea6"}</strong><b>{"\u5b8c\u6210"}</b></header>
      <div className="speed-pair">
        <p><span>{"\u5355\u5e27\u8017\u65f6"}</span><b>{interpolationSpeed.frameTimeMs.toFixed(1)} ms</b></p>
        <p><span>{"\u5904\u7406\u901f\u5ea6"}</span><b>{interpolationSpeed.fps.toFixed(1)} FPS</b></p>
      </div>
    </article>
  );
}

function QualityDistribution() {
  const goodPct = (qualityDistribution.good / qualityDistribution.total) * 100;
  const badPct = 100 - goodPct;
  return (
    <article className="training-card quality-distribution-card">
      <header><strong>{"\u8d28\u91cf\u5206\u5e03"}</strong><b>{qualityDistribution.total}</b></header>
      <div className="quality-stack" aria-label="good bad distribution">
        <i className="good" style={{ width: `${goodPct}%` }} />
        <i className="bad" style={{ width: `${badPct}%` }} />
      </div>
      <div className="quality-counts">
        <p><span>Good</span><b>{qualityDistribution.good}</b></p>
        <p><span>Bad</span><b>{qualityDistribution.bad}</b></p>
      </div>
    </article>
  );
}

function SyncedVideoModal({ originalSrc, interpolatedSrc, onClose }) {
  const originalRef = useRef(null);
  const interpolatedRef = useRef(null);
  const [viewMode, setViewMode] = useState("both");
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const visibleVideos = viewMode === "both" ? ["original", "interpolated"] : [viewMode];

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    [originalRef.current, interpolatedRef.current].forEach((video) => {
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [originalSrc, interpolatedSrc]);

  useEffect(() => {
    videos().forEach((video) => {
      if (Math.abs(video.currentTime - currentTime) > 0.05) video.currentTime = currentTime;
    });
  }, [viewMode]);

  function videos() {
    return [originalRef.current, interpolatedRef.current].filter(Boolean);
  }

  function syncTo(time) {
    videos().forEach((video) => {
      if (Math.abs(video.currentTime - time) > 0.05) video.currentTime = time;
    });
  }

  function togglePlay() {
    if (isPlaying) {
      videos().forEach((video) => video.pause());
      setIsPlaying(false);
      return;
    }
    syncTo(currentTime);
    videos().forEach((video) => {
      video.play().catch(() => {});
    });
    setIsPlaying(true);
  }

  function handleSeek(event) {
    const time = Number(event.target.value);
    setCurrentTime(time);
    syncTo(time);
  }

  function handleTimeUpdate(event) {
    const source = event.currentTarget;
    setCurrentTime(source.currentTime);
    if (viewMode === "both" && isPlaying) {
      const other = source === originalRef.current ? interpolatedRef.current : originalRef.current;
      if (other && Math.abs(other.currentTime - source.currentTime) > 0.12) {
        other.currentTime = source.currentTime;
      }
    }
  }

  function formatTime(value) {
    if (!Number.isFinite(value)) return "0:00";
    const minutes = Math.floor(value / 60);
    const seconds = Math.floor(value % 60);
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  return (
    <div className="video-modal-backdrop" onClick={onClose}>
      <section className="video-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{"\u63d2\u5e27\u524d\u540e\u540c\u6b65\u5bf9\u6bd4"}</strong>
            <span>{viewMode === "both" ? "\u53cc\u89c6\u9891\u540c\u6b65\u64ad\u653e" : "\u5355\u89c6\u9891\u67e5\u770b"}</span>
          </div>
          <button onClick={onClose} type="button" aria-label="close video comparison">{"\u00d7"}</button>
        </header>
        <div className={`video-gridplay mode-${viewMode}`}>
          {visibleVideos.includes("original") && (
            <article>
              <b>{"\u539f\u89c6\u9891"}</b>
              <video
                ref={originalRef}
                src={originalSrc}
                muted
                playsInline
                onLoadedMetadata={(event) => {
                  const nextDuration = event.currentTarget.duration || 0;
                  setDuration((value) => Math.max(value, nextDuration));
                }}
                onTimeUpdate={handleTimeUpdate}
                onPause={() => setIsPlaying(false)}
              />
            </article>
          )}
          {visibleVideos.includes("interpolated") && (
            <article>
              <b>{"\u63d2\u5e27\u540e"}</b>
              <video
                ref={interpolatedRef}
                src={interpolatedSrc}
                muted
                playsInline
                onLoadedMetadata={(event) => {
                  const nextDuration = event.currentTarget.duration || 0;
                  setDuration((value) => Math.max(value, nextDuration));
                }}
                onTimeUpdate={handleTimeUpdate}
                onPause={() => setIsPlaying(false)}
              />
            </article>
          )}
        </div>
        <div className="video-sync-controls">
          <div className="video-mode-tabs">
            <button className={viewMode === "both" ? "active" : ""} onClick={() => setViewMode("both")} type="button">{"\u53cc\u89c6\u9891"}</button>
            <button className={viewMode === "original" ? "active" : ""} onClick={() => setViewMode("original")} type="button">{"\u4ec5\u539f\u89c6\u9891"}</button>
            <button className={viewMode === "interpolated" ? "active" : ""} onClick={() => setViewMode("interpolated")} type="button">{"\u4ec5\u63d2\u5e27\u540e"}</button>
          </div>
          <button className="sync-play-button" onClick={togglePlay} type="button">{isPlaying ? "\u6682\u505c" : "\u64ad\u653e"}</button>
          <span>{formatTime(currentTime)}</span>
          <input type="range" min="0" max={duration || 0} step="0.01" value={Math.min(currentTime, duration || 0)} onChange={handleSeek} />
          <span>{formatTime(duration)}</span>
        </div>
      </section>
    </div>
  );
}

function FeatureVisual({ type }) {
  if (type === "hist") return <div className="hist"><i /><i /><i /><i /><i /><i /></div>;
  if (type === "swatch") return <div className="swatches"><i /><i /><i /><i /><i /></div>;
  if (type === "heat") return <div className="heat">{Array.from({ length: 16 }).map((_, index) => <i key={index} />)}</div>;
  return <div className="toggle-vis"><span>卡通</span><i /><span>写实</span></div>;
}

function FeatureMap({ selectedClip, selectedFrameIndex, selectedFrame, showTrainingResults }) {
  const frames = selectedClip?.frames ?? [];
  const brightnessDelta = Number(selectedFrame?.brightnessDelta) || 0;
  const fastChangeScore = Number(selectedFrame?.fastChangeScore) || 0;

  return (
    <section className="feature-map">
      <h2>特征图谱</h2>
      <div className="feature-grid">
        <article className="feature-card" key="brightness-delta">
          <header><strong>明暗变化</strong><b>{brightnessDelta.toFixed(2)}</b></header>
          <BrightnessBars frames={frames} selectedFrameIndex={selectedFrameIndex} />
        </article>
        <article className="feature-card color-feature-card" key="dominant-colors">
          <header><strong>主题色</strong><b>TOP 5</b></header>
          <DominantColorSwatches colors={selectedFrame?.dominantColors ?? []} />
        </article>
        <article className="feature-card" key="fast-change">
          <header><strong>{"\u9ad8\u901f\u53d8\u5316"}</strong><b>{fastChangeScore.toFixed(2)}</b></header>
          <FastChangeBars frames={frames} selectedFrameIndex={selectedFrameIndex} />
        </article>
      </div>
      <div className={"feature-bottom training-summary" + (showTrainingResults ? "" : " awaiting-results")}>
        <div className="training-summary-top">
          <OpticalFlowPreview selectedFrame={selectedFrame} />
          <InterpolationMetricSummary />
        </div>
        <div className="training-summary-bottom">
          <SpeedSummary />
          <QualityDistribution />
        </div>
      </div>
    </section>
  );
}

function RightPanel({ onOpenImage, onOpenVideoCompare, enabled }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [testProgress, setTestProgress] = useState(0);
  const [testStatus, setTestStatus] = useState("idle");
  const [sampleType, setSampleType] = useState("good");
  const [videoUrl, setVideoUrl] = useState("");
  const [isSampleScrolling, setIsSampleScrolling] = useState(false);
  const sampleScrollTimerRef = useRef(null);
  const samples = qualitySamples[sampleType];

  useEffect(() => {
    if (!selectedFile) {
      setVideoUrl("");
      return undefined;
    }
    const nextUrl = URL.createObjectURL(selectedFile);
    setVideoUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  useEffect(() => () => {
    if (sampleScrollTimerRef.current) window.clearTimeout(sampleScrollTimerRef.current);
  }, []);

  function handleSampleScroll() {
    setIsSampleScrolling(true);
    if (sampleScrollTimerRef.current) window.clearTimeout(sampleScrollTimerRef.current);
    sampleScrollTimerRef.current = window.setTimeout(() => {
      setIsSampleScrolling(false);
      sampleScrollTimerRef.current = null;
    }, 700);
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setTestProgress(0);
    setTestStatus("idle");
  }

  function startMockTest() {
    setTestStatus("running");
    setTestProgress(0);
    let value = 0;
    const timer = window.setInterval(() => {
      value = Math.min(100, value + 8 + Math.round(Math.random() * 10));
      setTestProgress(value);
      if (value >= 100) {
        window.clearInterval(timer);
        setTestStatus("done");
      }
    }, 260);
  }

  const statusText = testStatus === "done" ? "\u5df2\u5b8c\u6210" : testStatus === "running" ? "\u6a21\u578b\u63d2\u5e27\u4e2d" : "\u5f85\u5f00\u59cb";
  const originalVideo = videoUrl || "/videos/apex_01.mp4";
  const interpolatedVideo = "/videos/apex_01.mp4";

  return (
    <aside className={"right-panel interpolation-panel" + (enabled ? "" : " awaiting-dataset") + (testStatus === "idle" ? " awaiting-test" : "")}>
      <section className="analysis-block model-test-block">
        <div className="section-title-row"><h2>{"\u6a21\u578b\u6d4b\u8bd5"}</h2><span className="test-status">{statusText}</span></div>
        <label className="upload-box">
          <input type="file" accept="video/*" onChange={handleFileChange} />
          <strong>{selectedFile ? selectedFile.name : "\u70b9\u51fb\u9009\u62e9\u6d4b\u8bd5\u89c6\u9891"}</strong>
          <span>{selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB` : "mp4 / mov / avi"}</span>
        </label>
        <button className="start-test-button" onClick={startMockTest} disabled={!enabled}>{"\u5f00\u59cb\u6d4b\u8bd5"}</button>
        <div className="interpolation-progress">
          <p><span>{"\u63d2\u5e27\u8fdb\u5ea6"}</span><b>{testProgress}%</b></p>
          <i><em style={{ width: `${testProgress}%` }} /></i>
        </div>

        <div className={testStatus === "done" ? "test-result-content" : "test-result-content awaiting-results"}>
          <div className="sample-preview-head">
            <h3>{"\u8d28\u91cf\u6837\u672c\u9884\u89c8"}</h3>
            <div className="sample-tabs">
              <button className={sampleType === "good" ? "active" : ""} onClick={() => setSampleType("good")}>Good</button>
              <button className={sampleType === "bad" ? "active" : ""} onClick={() => setSampleType("bad")}>Bad</button>
            </div>
          </div>
          <div className={"quality-sample-grid" + (isSampleScrolling ? " is-scrolling" : "")} onScroll={handleSampleScroll}>
            {samples.map((sample) => (
            <article
              className="quality-sample-card"
              title={`PSNR ${sample.metrics.PSNR}, SSIM ${sample.metrics.SSIM}, LPIPS ${sample.metrics.LPIPS}`}
              onClick={() => onOpenImage({
                src: sample.imageSrc,
                title: `${sampleType.toUpperCase()} frame ${sample.frameIndex}`,
                subtitle: `PSNR ${sample.metrics.PSNR} · SSIM ${sample.metrics.SSIM} · LPIPS ${sample.metrics.LPIPS}`,
              })}
              key={`${sampleType}-${sample.frameIndex}`}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenImage({
                    src: sample.imageSrc,
                    title: `${sampleType.toUpperCase()} frame ${sample.frameIndex}`,
                    subtitle: `PSNR ${sample.metrics.PSNR} · SSIM ${sample.metrics.SSIM} · LPIPS ${sample.metrics.LPIPS}`,
                  });
                }
              }}
            >
              <img src={sample.imageSrc} alt={`${sampleType} frame ${sample.frameIndex}`} />
              <p><span>{sample.frameIndex}</span><b>{sampleType}</b></p>
            </article>
            ))}
          </div>
        </div>
      </section>

      <section className={"analysis-block video-result-block" + (testStatus === "done" ? "" : " awaiting-results")}>
        <div className="section-title-row">
          <h2>{"\u63d2\u5e27\u524d\u540e\u5bf9\u6bd4"}</h2>
          <button
            onClick={() => onOpenVideoCompare({ originalSrc: originalVideo, interpolatedSrc: interpolatedVideo })}
            type="button"
          >
            {"\u653e\u5927\u540c\u6b65\u89c2\u770b"}
          </button>
        </div>
        <div className="interpolation-video-compare">
          <article>
            <header>{"\u539f\u89c6\u9891"}</header>
            <video src={originalVideo} controls muted />
          </article>
          <article>
            <header>{"\u63d2\u5e27\u540e"}</header>
            <video src={interpolatedVideo} controls muted />
          </article>
        </div>
        <div className="video-result-meta">
          <p><span>{"\u539f\u59cb FPS"}</span><b>60</b></p>
          <p><span>{"\u63d2\u5e27\u540e FPS"}</span><b>120</b></p>
          <p><span>{"\u89c6\u9891\u65f6\u957f"}</span><b>14.0s</b></p>
          <p><span>{"\u603b\u5904\u7406\u65f6\u95f4"}</span><b>15.6s</b></p>
        </div>
      </section>
    </aside>
  );
}

function ImagePreviewModal({ image, onClose }) {
  if (!image) return null;
  return (
    <div className="image-modal-backdrop" onClick={onClose}>
      <section className="image-modal" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <strong>{image.title}</strong>
            <span>{image.subtitle}</span>
          </div>
          <button onClick={onClose} type="button" aria-label="close image preview">{"\u00d7"}</button>
        </header>
        <img src={image.src} alt={image.title} />
      </section>
    </div>
  );
}

export default function App() {
  const [activeDatasetId, setActiveDatasetId] = useState("");
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [customDatasets, setCustomDatasets] = useState([]);
  const [activeCustomDatasetId, setActiveCustomDatasetId] = useState("");
  const [compareDatasetIds, setCompareDatasetIds] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);
  const [videoCompare, setVideoCompare] = useState(null);
  const [hasTrainingResults, setHasTrainingResults] = useState(false);
  const activeDataset = gameDatasets.find((dataset) => dataset.id === activeDatasetId) ?? gameDatasets[0];
  const activeCustomDataset = customDatasets.find((dataset) => dataset.id === activeCustomDatasetId)
    ?? (activeDatasetId ? builtInImageDataset(activeDatasetId) : null);

  function handleSelectDataset(datasetId) {
    setActiveDatasetId(datasetId);
    setActiveCustomDatasetId("");
    setHasTrainingResults(false);
    setSelectedClipIndex(0);
    setSelectedFrameIndex(0);
  }

  function handleClearDataset() {
    setActiveDatasetId("");
    setActiveCustomDatasetId("");
    setHasTrainingResults(false);
    setPreviewImage(null);
    setVideoCompare(null);
  }

  function handleAddSelectedDataset(datasetId) {
    setSelectedDatasets((items) => (items.includes(datasetId) ? items : [...items, datasetId]));
  }

  function handleSelectCustomDataset(datasetId) {
    setActiveCustomDatasetId(datasetId);
    setHasTrainingResults(false);
    setSelectedClipIndex(0);
    setSelectedFrameIndex(0);
  }

  function handleRemoveSelectedDataset(datasetId) {
    setSelectedDatasets((items) => items.filter((id) => id !== datasetId));
    setCompareDatasetIds((items) => items.filter((id) => id !== datasetId));
  }

  function handleCreateDataset() {
    setCustomDatasets((items) => {
      const count = items.length + 1;
      return [...items, { id: "custom:" + Date.now(), name: "新数据集 " + count, items: [] }];
    });
  }

  function handleAddImageToDataset(datasetId, imageOrImages) {
    const incomingItems = (Array.isArray(imageOrImages) ? imageOrImages : [imageOrImages]).map((image) => ({
      ...image,
      key: image.datasetId + ":" + image.label,
    }));
    setCustomDatasets((datasets) => datasets.map((dataset) => {
      if (dataset.id !== datasetId) return dataset;
      const existingKeys = new Set(dataset.items.map((entry) => entry.key));
      const newItems = incomingItems.filter((item) => !existingKeys.has(item.key));
      return newItems.length ? { ...dataset, items: [...dataset.items, ...newItems] } : dataset;
    }));
  }

  function handleRemoveCustomDataset(datasetId) {
    setCustomDatasets((datasets) => datasets.filter((dataset) => dataset.id !== datasetId));
    setActiveCustomDatasetId((activeId) => activeId === datasetId ? "" : activeId);
    setSelectedDatasets((datasets) => datasets.filter((id) => id !== datasetId));
    setCompareDatasetIds((datasets) => datasets.filter((id) => id !== datasetId));
  }

  function handleRenameCustomDataset(datasetId, name) {
    setCustomDatasets((datasets) => datasets.map((dataset) => (
      dataset.id === datasetId ? { ...dataset, name } : dataset
    )));
  }

  function handleRemoveCustomDatasetImage(datasetId, itemKey) {
    setCustomDatasets((datasets) => datasets.map((dataset) => (
      dataset.id === datasetId
        ? { ...dataset, items: dataset.items.filter((item) => item.key !== itemKey) }
        : dataset
    )));
    setSelectedClipIndex(0);
    setSelectedFrameIndex(0);
  }

  function handleToggleCompareDataset(datasetId) {
    setCompareDatasetIds((items) => {
      if (items.includes(datasetId)) return items.filter((id) => id !== datasetId);
      return items.length < 2 ? [...items, datasetId] : [items[1], datasetId];
    });
  }

  return (
    <main className="app" aria-label={"\u89c6\u9891\u6570\u636e\u96c6\u7b5b\u9009\u8bad\u7ec3\u5de5\u4f5c\u53f0"}>
      <header className="app-header">
        <strong>Game Dataset Visualization</strong>
        <div><span>{"\u25cf \u9879\u76ee\u8fd0\u884c\u4e2d"}</span><button>{"\u5bfc\u5165"}</button><button>{"\u8bad\u7ec3"}</button><button>EN</button></div>
      </header>
      <section className="workspace">
        <LeftPanel
          activeDatasetId={activeDatasetId}
          onSelectDataset={handleSelectDataset}
          onClearDataset={handleClearDataset}
          selectedDatasets={selectedDatasets}
          onAddSelectedDataset={handleAddSelectedDataset}
          onRemoveSelectedDataset={handleRemoveSelectedDataset}
          customDatasets={customDatasets}
          activeCustomDatasetId={activeCustomDatasetId}
          onSelectCustomDataset={handleSelectCustomDataset}
          onCreateDataset={handleCreateDataset}
          onAddImageToDataset={handleAddImageToDataset}
          onRemoveCustomDataset={handleRemoveCustomDataset}
          onRenameCustomDataset={handleRenameCustomDataset}
          compareDatasetIds={compareDatasetIds}
          onToggleCompareDataset={handleToggleCompareDataset}
          onStartTraining={() => setHasTrainingResults(true)}
          hasTrainingResults={hasTrainingResults}
        />
        <CenterStage
          activeDataset={activeDataset}
          activeCustomDataset={activeCustomDataset}
          selectedClipIndex={selectedClipIndex}
          onSelectClip={setSelectedClipIndex}
          selectedFrameIndex={selectedFrameIndex}
          onSelectFrame={setSelectedFrameIndex}
          onOpenImage={setPreviewImage}
          onRemoveCustomDatasetImage={handleRemoveCustomDatasetImage}
          showTrainingResults={hasTrainingResults}
          hasDatasetSelection={Boolean(activeDatasetId)}
        />
        <RightPanel key={activeCustomDatasetId || activeDatasetId || "empty"} enabled={Boolean(activeDatasetId)} onOpenImage={setPreviewImage} onOpenVideoCompare={setVideoCompare} />
      </section>
      <ImagePreviewModal image={previewImage} onClose={() => setPreviewImage(null)} />
      {videoCompare && (
        <SyncedVideoModal
          originalSrc={videoCompare.originalSrc}
          interpolatedSrc={videoCompare.interpolatedSrc}
          onClose={() => setVideoCompare(null)}
        />
      )}
    </main>
  );
}
