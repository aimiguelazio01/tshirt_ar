import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-cpu';

await tf.setBackend('cpu');
await tf.ready();

const ar = pathToFileURL(
  path.resolve('node_modules/mind-ar/src/image-target')
).href + '/';
const { CompilerBase } = await import(ar + 'compiler-base.js');

const buf = await fs.readFile('targets.mind');
const c = new CompilerBase();
const data = c.importData(buf);
console.log('Parsed OK. Number of targets:', data.length);
console.log('Target[0] size:', data[0].targetImage.width + 'x' + data[0].targetImage.height);
console.log('Target[0] matching keyframes:', data[0].matchingData.length);
console.log('Target[0] tracking frames:', data[0].trackingData.length);
