/*
 * Builds targets.mind from mv_logo.png WITHOUT the native `canvas` module.
 *
 * MindAR's official OfflineCompiler (node_modules/mind-ar/.../offline-compiler.js)
 * uses the native `canvas` npm package to turn an image into pixel data. On
 * Windows that native build fails (needs Visual Studio build tools). We bypass
 * it: we decode the PNG with the pure-JS `pngjs`, hand the grayscale pixels
 * straight to MindAR's CompilerBase, then serialize with msgpack (exactly what
 * the runtime .mind loader expects).
 *
 * Run:  node build-targets.mjs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PNG } from 'pngjs';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu'; // registers CPU kernels + backend
import { encode as msgpackEncode } from '@msgpack/msgpack';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MindAR's source lives under mind-ar/src/image-target/*. We import the pieces
// directly (they are plain ES modules) instead of going through the compiled
// dist, which is browser-only.
const AR_SRC = path.join(__dirname, 'node_modules', 'mind-ar', 'src', 'image-target');
// Dynamic import() on Windows needs a proper file:// URL, not a bare path.
const fromAr = (rel) => pathToFileURL(path.join(AR_SRC, rel)).href;

const { CompilerBase } = await import(fromAr('compiler-base.js'));
// The CPU kernels are side-effect imports that register with tfjs' registry.
await import(fromAr('detector/kernels/cpu/index.js'));
const { buildTrackingImageList } = await import(fromAr('image-list.js'));
const { extractTrackingFeatures } = await import(fromAr('tracker/extract-utils.js'));

const CURRENT_VERSION = 2;

// ----- pure-JS replacement for the native `canvas` step -----
// pngjs exposes PNG.sync.read(buffer) for synchronous decode.
function loadPngAsGreyTarget(buffer) {
  const data = PNG.sync.read(buffer);
  const whiteThreshold = 245;
  let minX = data.width, minY = data.height, maxX = -1, maxY = -1;

  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const o = (y * data.width + x) * 4;
      const r = data.data[o], g = data.data[o + 1], b = data.data[o + 2], a = data.data[o + 3];
      if (a > 0 && (r < whiteThreshold || g < whiteThreshold || b < whiteThreshold)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // The logo source has a lot of blank paper around the mark. MindAR is more
  // reliable when the target is the visible mark plus a modest margin.
  if (maxX >= minX && maxY >= minY) {
    const pad = Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.08);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(data.width - 1, maxX + pad);
    maxY = Math.min(data.height - 1, maxY + pad);
  } else {
    minX = 0; minY = 0; maxX = data.width - 1; maxY = data.height - 1;
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const grey = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = ((minY + y) * data.width + (minX + x)) * 4;
      const dst = y * width + x;
      grey[dst] = Math.floor((data.data[src] + data.data[src + 1] + data.data[src + 2]) / 3);
    }
  }
  console.log(`[build-targets] cropped to ${width}x${height} from ${data.width}x${data.height}`);
  return { data: grey, width, height };
}

// Subclass CompilerBase: override the two canvas-dependent methods.
class NodeCompiler extends CompilerBase {
  // Not used in our flow (we pre-build targetImages), but keep a safe no-op.
  createProcessCanvas() { return null; }

  // compiler-base.compileImageTargets() expects targetImages already built,
  // then calls this.compileTrack(). We feed it pre-built grey images.
  async compile(targetImages, progressCallback) {
    // --- matching features (detector runs on tfjs CPU backend) ---
    const percentPerImage = 50.0 / targetImages.length;
    let percent = 0.0;
    this.data = [];
    const { buildImageList } = await import(fromAr('image-list.js'));
    const { Detector } = await import(fromAr('detector/detector.js'));
    const { build: hierarchicalClusteringBuild } = await import(fromAr('matching/hierarchical-clustering.js'));

    for (let i = 0; i < targetImages.length; i++) {
      const targetImage = targetImages[i];
      const imageList = buildImageList(targetImage);
      const percentPerAction = percentPerImage / imageList.length;
      const matchingData = [];
      for (let j = 0; j < imageList.length; j++) {
        const image = imageList[j];
        await tf.nextFrame();
        tf.tidy(() => {
          const inputT = tf.tensor(image.data, [image.data.length], 'float32').reshape([image.height, image.width]);
          const detector = new Detector(image.width, image.height);
          const { featurePoints: ps } = detector.detect(inputT);
          const maximaPoints = ps.filter((p) => p.maxima);
          const minimaPoints = ps.filter((p) => !p.maxima);
          matchingData.push({
            maximaPoints,
            minimaPoints,
            maximaPointsCluster: hierarchicalClusteringBuild({ points: maximaPoints }),
            minimaPointsCluster: hierarchicalClusteringBuild({ points: minimaPoints }),
            width: image.width,
            height: image.height,
            scale: image.scale,
          });
        });
        percent += percentPerAction;
        if (progressCallback) progressCallback(percent);
      }
      this.data.push({ targetImage, imageList, matchingData });
    }

    // --- tracking features ---
    const trackingList = [];
    for (let i = 0; i < targetImages.length; i++) {
      const trackingImageList = buildTrackingImageList(targetImages[i]);
      const trackingData = extractTrackingFeatures(trackingImageList, (index) => {
        percent += (50.0 / targetImages.length) / trackingImageList.length;
        if (progressCallback) progressCallback(percent);
      });
      this.data[i].trackingImageList = trackingImageList;
      trackingList.push(trackingData);
      this.data[i].trackingData = trackingData;
    }
    return this.data;
  }

  exportData() {
    const dataList = this.data.map((d) => ({
      targetImage: { width: d.targetImage.width, height: d.targetImage.height },
      trackingData: d.trackingData,
      matchingData: d.matchingData,
    }));
    return msgpackEncode({ v: CURRENT_VERSION, dataList });
  }
}

async function main() {
  const inPath = path.join(__dirname, 'mv_logo.png');
  const outPath = path.join(__dirname, 'targets.mind');

  await tf.setBackend('cpu');
  await tf.ready();
  console.log(`[build-targets] tfjs backend: ${tf.getBackend()}`);

  console.log(`[build-targets] reading ${path.basename(inPath)} ...`);
  const target = loadPngAsGreyTarget(await fs.readFile(inPath));
  console.log(`[build-targets] image ${target.width}x${target.height} → ${target.data.length} grey px`);

  const compiler = new NodeCompiler();
  console.log('[build-targets] compiling feature points (matching + tracking) ...');
  await compiler.compile([target], (p) => {
    if (p % 5 < 1) process.stdout.write(`\r[build-targets]   ${Math.round(p)}%`);
  });
  process.stdout.write('\r[build-targets]   100%\n');

  const buf = compiler.exportData();
  await fs.writeFile(outPath, Buffer.from(buf));
  console.log(`[build-targets] wrote ${outPath} (${buf.length} bytes)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
