// Measure how trackable mv_logo.png is, using MindAR's OWN feature detector
// (the exact same code path the runtime uses to recognize the target).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';

await tf.setBackend('cpu');
await tf.ready();

const ar = pathToFileURL(path.resolve('node_modules/mind-ar/src/image-target')).href + '/';
const { Detector } = await import(ar + 'detector/detector.js');
const { buildImageList } = await import(ar + 'image-list.js');

const png = PNG.sync.read(readFileSync('mv_logo.png'));
const { width, height } = png;
const grey = new Uint8Array(width * height);
for (let i = 0; i < grey.length; i++) {
  const o = i * 4;
  grey[i] = Math.floor((png.data[o] + png.data[o + 1] + png.data[o + 2]) / 3);
}

console.log(`image: ${width}x${height}`);
console.log('Checking feature richness on the source image + MindAR pyramid scales...');
console.log('(MindAR needs LOTS of stable corner features to lock on.)\n');

const imageList = buildImageList({ data: grey, width, height });
console.log(`pyramid scales: ${imageList.length}`);
let total = 0;
for (let i = 0; i < imageList.length; i++) {
  const img = imageList[i];
  await tf.nextFrame();
  let count = 0;
  tf.tidy(() => {
    const inputT = tf.tensor(img.data, [img.data.length], 'float32').reshape([img.height, img.width]);
    const det = new Detector(img.width, img.height);
    const { featurePoints } = det.detect(inputT);
    count = featurePoints.length;
    total += count;
  });
  console.log(`  scale ${i} (${img.width}x${img.height}): ${count} feature points`);
}
console.log(`\nTOTAL feature points across scales: ${total}`);

// Heuristic scoring (Mirage/MindAR community rule of thumb):
//   < 200  -> poor (will struggle / never lock)
//   200-600 -> usable
//   > 600  -> good
let verdict;
if (total < 200) verdict = 'POOR — too few features, tracking will likely FAIL. Use a higher-contrast, more detailed crop.';
else if (total < 600) verdict = 'USABLE — should track but may flicker.';
else verdict = 'GOOD — plenty of features, should track reliably.';
console.log(`Verdict: ${verdict}`);
