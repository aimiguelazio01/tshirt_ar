/*
 * Generates a self-contained, animated model.glb so the AR experience runs
 * end-to-end without an external art asset. Swap this file for your real
 * branded model later (the scene plays clip "*", so any animated GLB works).
 *
 * Output: an octahedron "emerald" emblem that spins, gently bobs up/down, and
 * pulses scale — three transform tracks baked into a single looping clip.
 *
 * Run:  node build-model.mjs
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// --- Minimal browser-API polyfills so GLTFExporter runs headless in Node ---
// GLTFExporter's GLB assembly uses Blob + FileReader to marshal the final
// binary. We only need: Blob(size), FileReader.readAsArrayBuffer→onloadend.
import { Blob as NodeBlob } from 'node:buffer';
if (typeof globalThis.Blob === 'undefined') globalThis.Blob = NodeBlob;
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        if (this.onloadend) this.onloadend({ target: this });
      });
    }
  };
}

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildAnimatedScene() {
  const scene = new THREE.Scene();

  // --- Geometry: a faceted octahedron (clean, low-poly, brand-neutral) ---
  const geometry = new THREE.OctahedronGeometry(1, 0);
  // Smooth-shading normals for a gem look.
  geometry.computeVertexNormals();

  // --- Material: emissive emerald, lit, double-sided ---
  const material = new THREE.MeshStandardMaterial({
    color: 0x1fd6a6,
    emissive: 0x0c5a47,
    emissiveIntensity: 0.5,
    metalness: 0.3,
    roughness: 0.25,
    flatShading: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Emblem';
  scene.add(mesh);

  // --- Animation: build THREE.AnimationClip with transform tracks ---
  const times = [0, 1, 2, 3];           // seconds; 3s loop
  const qY90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const qY180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const qY270 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (3 * Math.PI) / 2);
  const qY360 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI * 2);

  // Spin (full Y rotation over the loop).
  const spinTrack = new THREE.QuaternionKeyframeTrack(
    'Emblem.quaternion',
    times,
    [0, 0, 0, 1,  qY90.x, qY90.y, qY90.z, qY90.w,
              qY180.x, qY180.y, qY180.z, qY180.w,
              qY270.x, qY270.y, qY270.z, qY270.w,
              qY360.x, qY360.y, qY360.z, qY360.w]
  );

  // Bob (gentle vertical float).
  const bobTrack = new THREE.VectorKeyframeTrack(
    'Emblem.position',
    times,
    [0, 0.0, 0,   0, 0.25, 0,   0, 0.0, 0,   0, -0.25, 0]
  );

  // Pulse (subtle scale breathing).
  const pulseTrack = new THREE.VectorKeyframeTrack(
    'Emblem.scale',
    times,
    [1, 1, 1,   1.15, 1.15, 1.15,   1, 1, 1,   1.15, 1.15, 1.15]
  );

  const clip = new THREE.AnimationClip('Spin', 3, [spinTrack, bobTrack, pulseTrack]);
  clip.optimize();

  scene.animations = [clip];
  return scene;
}

function main() {
  const scene = buildAnimatedScene();
  const outPath = path.join(__dirname, 'model.glb');

  const exporter = new GLTFExporter();
  exporter.parse(
    scene,
    (result) => {
      // GLB result is an ArrayBuffer.
      const buf = Buffer.from(result);
      writeFileSync(outPath, buf);
      console.log(`[build-model] wrote ${outPath} (${buf.length} bytes)`);
      console.log(`[build-model] animations: ${scene.animations.length} (clip: "${scene.animations[0].name}")`);
    },
    (err) => { console.error('[build-model] export failed:', err); process.exit(1); },
    { binary: true, animations: scene.animations }
  );
}

main();
