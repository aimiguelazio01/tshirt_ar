import { readFileSync } from 'node:fs';

// Read the GLB directly: header (12B) + JSON chunk {length, type, data}.
const data = readFileSync('model.glb');
const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);

const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
const version = dv.getUint32(4, true);
const length = dv.getUint32(8, true);

console.log('magic:', magic, '(expect glTF)');
console.log('version:', version, '(expect 2)');
console.log('file length:', length, 'bytes; buffer:', data.byteLength);

// First chunk starts at offset 12.
const chunkLen = dv.getUint32(12, true);
const chunkType = String.fromCharCode(
  dv.getUint8(16), dv.getUint8(17), dv.getUint8(18), dv.getUint8(19)
);
console.log('chunk[0] type:', chunkType, 'length:', chunkLen, '(expect JSON)');

const jsonStr = data.toString('utf8', 20, 20 + chunkLen);
const json = JSON.parse(jsonStr);

console.log('asset generator:', json.asset.generator);
console.log('meshes:', json.meshes ? json.meshes.length : 0);
console.log('materials:', json.materials ? json.materials.length : 0);
console.log('animations:', json.animations ? json.animations.length : 0);
if (json.animations) {
  json.animations.forEach((a, i) => {
    console.log(`  anim[${i}] name="${a.name}" channels=${a.channels.length} samplers=${a.samplers.length}`);
  });
}
console.log('accessors:', json.accessors ? json.accessors.length : 0);
console.log('bufferViews:', json.bufferViews ? json.bufferViews.length : 0);
console.log('VALID GLB with declared animations:', json.animations && json.animations.length > 0);
