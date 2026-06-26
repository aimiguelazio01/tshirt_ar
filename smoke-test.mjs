// Headless smoke test: load the page, capture console errors, confirm MindAR's
// A-Frame components registered, then exercise the camera-picker flow
// (Start → picker appears → select → confirm → shim installed → AR launch).
import puppeteer from 'puppeteer-core';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:8000/';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--use-fake-ui-for-media-stream',  // auto-grant camera permission
    '--use-fake-device-for-media-stream',
  ],
});

const page = await browser.newPage();
const errors = [];
const warnings = [];
const logs = [];
page.on('console', (m) => {
  const t = m.type();
  const txt = m.text();
  logs.push(`[CONSOLE ${t.toUpperCase()}] ${txt}`);
  if (t === 'error') errors.push(txt);
  else if (t === 'warning') warnings.push(txt);
});
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('response', (res) => {
  if (!res.ok()) {
    errors.push(`HTTP Error: ${res.url()} - Status ${res.status()}`);
  }
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
// Reach the start screen (or error).
await new Promise((r) => setTimeout(r, 6000));

const probe = await page.evaluate(() => {
  const result = {
    hasAFRAME: typeof AFRAME !== 'undefined',
    hasMINDAR: typeof MINDAR !== 'undefined' && !!MINDAR.IMAGE,
    componentsRegistered: {},
    startScreenVisible: false,
    errorScreenVisible: false,
    startBtnDisabled: null,
  };
  try {
    const C = AFRAME.components, S = AFRAME.systems;
    result.componentsRegistered = {
      'mindar-image': !!C['mindar-image'],
      'mindar-image-target': !!C['mindar-image-target'],
      'mindar-image-system': !!S['mindar-image-system'],
    };
  } catch (e) { result.componentError = e.message; }
  result.startScreenVisible = document.getElementById('start-screen').classList.contains('is-visible');
  result.errorScreenVisible = document.getElementById('error-screen').classList.contains('is-visible');
  result.startBtnDisabled = document.getElementById('start-btn').disabled;
  return result;
});

// --- Exercise the camera picker ---
// Clear any saved camera so the picker is guaranteed to show.
await page.evaluate(() => { try { localStorage.removeItem('nfc_ar2_camera_id'); } catch (e) {} });

// Tap Start.
await page.click('#start-btn');
// Give enumeration a moment.
await new Promise((r) => setTimeout(r, 1500));

const afterStart = await page.evaluate(() => {
  const cam = document.getElementById('camera-screen');
  const items = document.querySelectorAll('#camera-list li');
  const confirmDisabled = document.getElementById('cam-confirm').disabled;
  const status = document.getElementById('cam-status').textContent;
  return {
    cameraScreenVisible: cam ? cam.classList.contains('is-visible') : false,
    cameraCount: items.length,
    confirmDisabled,
    status,
    firstItemSelected: items.length ? items[0].classList.contains('is-selected') : false,
  };
});

// If a picker appeared with cameras, confirm selection.
let afterConfirm = {};
if (afterStart.cameraScreenVisible) {
  await page.click('#cam-confirm');
  // Wait up to 15 seconds for the model's mesh to load.
  await page.waitForFunction(() => {
    const el = document.querySelector('#shirtAnimation');
    const mesh = el && el.getObject3D('mesh');
    return mesh && mesh.children && mesh.children.length > 0;
  }, { timeout: 15000 }).catch(() => {});
  afterConfirm = await page.evaluate(() => {
    // The shim is an internal closure, so detect it indirectly: after confirm,
    // getUserMedia should be our wrapper (not the native function string).
    const isShim = navigator.mediaDevices.getUserMedia.toString().indexOf('[native code]') === -1;
    return {
      loadingVisible: document.getElementById('loading-screen').classList.contains('is-visible'),
      aSceneBuilt: !!document.querySelector('a-scene'),
      shimInstalled: isShim,
      savedChoice: (function () { try { return localStorage.getItem('nfc_ar2_camera_id') || ''; } catch (e) { return ''; } })(),
    };
  });
}

console.log('=== SMOKE TEST RESULT ===');
console.log('boot:', JSON.stringify(probe, null, 2));
console.log('after Start (camera picker):', JSON.stringify(afterStart, null, 2));
console.log('after Confirm (AR launch):  ', JSON.stringify(afterConfirm, null, 2));
console.log('\n=== JS ERRORS (' + errors.length + ') ===');
errors.slice(0, 20).forEach((e) => console.log('  ❌', e));

console.log('\n=== CONSOLE LOGS (' + logs.length + ') ===');
logs.forEach((l) => console.log('  💬', l));

await browser.close();

const ok = probe.hasAFRAME && probe.hasMINDAR
  && probe.componentsRegistered['mindar-image']
  && probe.componentsRegistered['mindar-image-target']
  && probe.startScreenVisible
  && !probe.errorScreenVisible
  && afterStart.cameraScreenVisible
  && (!afterConfirm.loadingVisible === true || afterConfirm.aSceneBuilt);
console.log('\n' + (ok ? '✅ PASS' : '❌ FAIL'));
process.exit(ok ? 0 : 1);
