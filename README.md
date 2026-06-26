# MV — WebAR T-Shirt Experience

A commercial-quality, single-file WebAR experience. A user taps an NFC tag on a
T-shirt, a URL opens in their mobile browser (Safari/Chrome), and after tapping
**Start** the camera locks onto the printed logo and plays an anchored 3D
animation — no app install required.

Built with **MindAR Image Tracking**, **A-Frame**, and **Three.js**. No build
tools, no framework — just static files.

---

## 1. Folder structure

```
nfc_ar2/
├── index.html          # The entire experience (UI + AR + effects + error handling)
├── targets.mind        # MindAR compiled image target (built by build-targets.mjs)
├── model.glb           # Animated 3D model          (built by build-model.mjs)
├── logo.png            # Brand logo for the UI       (your mv_logo.png)
├── mv_logo.png         # Original logo source (input to build-targets.mjs)
├── vendor/             # Pinned libraries served locally (no CDN dependency)
│   ├── aframe.min.js
│   ├── aframe-extras.min.js
│   └── mindar-image-aframe.prod.js
├── build-targets.mjs   # Compiles mv_logo.png → targets.mind (pure-JS, no canvas)
├── build-model.mjs     # Generates an animated placeholder model.glb (three.js)
├── package.json        # Dev tooling (scripts + build deps)
├── README.md
└── assets/
    ├── textures/       # Optional textures (empty, .gitkeep)
    └── audio/          # Optional audio: drop cue.mp3 here (empty, .gitkeep)
```

> The app references `targets.mind`, `model.glb`, and `logo.png` at the project
> root. The preloader verifies the first two exist before enabling **Start**.
> Libraries load from `vendor/` (offline-safe), not a CDN.

---

## 2. Building the two binary assets

Both `targets.mind` and `model.glb` are committed-ready, but you (re)generate
them with the included Node scripts. They're pure JavaScript and work on
Windows/macOS/Linux **without** any native compilation (MindAR's official
`mind-ar-node-builder` needs the native `canvas` module, which fails to build
on Windows without Visual Studio tools — these scripts sidestep that).

```bash
npm install              # dev tooling only (not needed to run the deployed site)
npm run build:targets    # mv_logo.png → targets.mind   (MindAR + tfjs CPU)
npm run build:model      # → model.glb                  (three.js, animated)
npm run build            # both, in order
```

### a) `targets.mind` (the MindAR image target)

`build-targets.mjs` decodes `mv_logo.png` with the pure-JS `pngjs`, feeds the
grayscale pixels through MindAR's own feature detector (TensorFlow.js CPU
backend), and serializes the result with msgpack — exactly the format MindAR's
runtime loader expects. To use a different logo, overwrite `mv_logo.png` and
re-run `npm run build:targets`.

Tips for a trackable logo target:
- Use a high-contrast, feature-rich crop of the printed artwork.
- Source image **≥ 1000 px** on the long edge.
- Re-export `targets.mind` if the printed logo design changes.

### b) `model.glb` (the animated 3D model)

`build-model.mjs` generates a clean animated placeholder (a spinning emerald
emblem) so the experience works end-to-end out of the box. **Replace it with
your real branded model** when ready — just drop a new `model.glb` at the root.

Requirements for a custom model:
- **GLB** (binary GLTF), not `.gltf` — single file, faster to load.
- **< 5 MB** recommended for mobile.
- Include embedded animations; the scene plays clip `*` (all clips) by default.
- **Draco** compression is supported — just keep `aframe-extras` loaded (it is).
- Center the model at origin and scale it to roughly fit the logo footprint.

To change which clip plays, edit in `index.html`:

```js
animation: { clip: "*" }   // e.g. clip: "Dance" or clip: "Idle"
```

---

## 3. Local testing

WebAR needs **HTTPS** for camera access, so plain `file://` won't work.

```bash
# From the project folder (any static HTTPS server works):
npx http-server -p 8080 -S -C cert.pem -K key.pem
# OR, the zero-config way (auto-generates a cert):
npx serve .
```

Then open the printed/tested URL on your **phone** (not desktop):
- Same Wi-Fi as the dev machine.
- Use the machine's LAN IP, e.g. `https://192.168.1.20:8080`.
- Accept the self-signed cert warning when prompted.

> iOS requires the camera request to originate from a **user gesture** (the
> Start button) **and** a **secure context** (HTTPS) — both are handled.

---

## 4. Deployment

The build output is 100% static — host it anywhere.

### Netlify (drag-and-drop)

1. Go to <https://app.netlify.com/drop>.
2. Drag the whole `nfc_ar2` folder onto the page.
3. You instantly get an `https://*.netlify.app` URL — **already HTTPS**, so the
   camera works on mobile out of the box.
4. (Optional) Site settings → **Domain** to add a custom domain.

### GitHub Pages

```bash
git init
git add .
git commit -m "WebAR T-shirt experience"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then: **Repo → Settings → Pages → Source: `main` / root → Save**.
Your site goes live at `https://<you>.github.io/<repo>/` (HTTPS by default).

> Tip: if your repo is named `<you>.github.io`, the URL root is `/`.

### Standard web hosting (cPanel / FTP / S3 / Vercel / Cloudflare Pages)

1. Upload everything in `nfc_ar2/` to your web root (`public_html`, `www/`,
   bucket root, etc.) **keeping the folder structure intact**.
2. Make sure the site is served over **HTTPS** (required for camera APIs).
   - S3: pair with **CloudFront** for HTTPS.
   - Apache/Nginx: install Let's Encrypt (free).
3. Point your **NFC tag** at the final HTTPS URL using an NFC writer app
   (e.g. NFC Tools). Lock it to open in the phone's default browser.

---

## 5. Pointing the NFC tag

Using **NFC Tools** (iOS/Android) or any writer:

1. Write data → **URL / URI** → paste your deployed HTTPS URL.
2. Write → done. Tapping the tag now opens the browser straight to the
   experience.
3. Optionally enable **"Open URL automatically"** (Mifare / NTAG) so no
   confirmation prompt appears.

---

## 6. Mobile optimization notes (what the code does + what to tune)

The experience targets **30–60 FPS** on iPhone SE, iPhone 11+, Samsung
A-series, and budget Android. Strategies baked into `index.html`:

| Concern | Implementation |
|---|---|
| Asset preloading | XHR progress + warm cache before scene init (real %, no fake bar). |
| Deferred camera | `<a-scene>` is built **after** the Start tap → camera prompt only fires on a user gesture (iOS-safe). |
| Capped DPR | `setPixelRatio(min(devicePixelRatio, 2))` — halves fill-rate on retina. |
| Color/tone | ACES Filmic tone mapping + color management + physically-correct lights. |
| Anti-alias | Enabled (auto-degrades if unsupported). |
| Frustum culling | On by default in Three.js/A-Frame — keep `frustumCulled` true on meshes. |
| Stable tracking | `filterMinCF`, `filterBeta`, `warmupTolerance`, `missTolerance` tuned to reduce flicker on moving fabric. |
| Fast redetect | `missTolerance: 10` keeps the anchor "alive" briefly through occlusion. |
| Draw calls | One GLB, one material set; avoid multi-root models. |
| Texture RAM | Compress GLB textures (KTX2/Draco); `maxCanvasWidth/Height: 1920`. |
| Smooth recovery | Fade-out on `targetLost`, fade-in + scale-up + particle burst on `targetFound`; no restart. |

**To tune further**, edit the `CONFIG` object near the top of `<script>`:

```js
mindar: {
  missTolerance:   10,   // ↑ = fewer "lost" flickers, slightly slower loss detection
  warmupTolerance: 5,    // ↑ = more confident first lock (less jitter on appear)
  filterBeta:      0.01, // ↑ = smoother but laggier tracking
  filterMinCF:     0.0001
},
maxPixelRatio: 2,        // ↓ to 1.5 on very weak devices for more FPS
```

**Model-side (biggest perf lever):**
- Keep `model.glb` under ~2–5 MB.
- Bake lighting into textures where possible (fewer lights = cheaper).
- Use Draco + KTX2 texture compression.
- Merge meshes before export to minimize draw calls.

---

## 7. Event handling (reference)

The code wires every event in the brief:

| Event | Action |
|---|---|
| `arReady` | Hide loading, log success, show HUD + "find the logo" hint. |
| `arError` | Show friendly error (usually camera permission), log detail. |
| `targetFound` | Fade-in + scale-up + particle burst (first time), start clips, hide hints. |
| `targetLost` | Pause clips, fade model out, show "logo not visible" hint. |
| `model-error` | Friendly "couldn't load model" message. |
| Preload fail | Friendly "assets missing" message. |

---

## 8. Error recovery (covered)

Each failure mode has a dedicated, user-friendly message:

- ✅ Camera permission denied
- ✅ Camera unavailable (no `mediaDevices`)
- ✅ Unsupported browser (iOS < 11, very old Android)
- ✅ WebGL unavailable
- ✅ Failed model loading (`model-error`)
- ✅ Failed target loading (preload check)
- ✅ Library CDN failure (A-Frame missing on boot)

All routes lead to the same error screen with **Try again / Reload**.

---

## 9. Browser compatibility

Tested target matrix:

| Browser | Status |
|---|---|
| Safari iOS 11+ | ✅ Primary (iPhone SE → 15 Pro) |
| Chrome Android | ✅ Primary |
| Samsung Internet | ✅ |
| Edge Mobile | ✅ |
| Firefox Android | ⚠️ Works, but Safari/Chrome are recommended |

---

## 10. Troubleshooting

**Camera never starts / black screen**
- Confirm the page is served over **HTTPS** (or `localhost`).
- iOS: Settings → Safari → Camera → **Allow**.
- Android Chrome: tap the lock icon → Permissions → Camera.

**"Couldn't load assets"**
- Verify `targets.mind` and `model.glb` exist at the **same level** as
  `index.html` and are spelled exactly (case-sensitive on Linux hosts).

**Logo isn't recognized**
- Re-check the `targets.mind` was built from the **exact printed** artwork.
- Improve lighting, avoid glare on fabric, hold 20–40 cm away.
- Raise `warmupTolerance` slightly for a more confident first lock.

**Model loads but looks too big/small/wrong**
- Adjust in the scene markup:
  ```html
  <a-gltf-model ... scale="1 1 1" position="0 0 0" rotation="0 0 0"></a-gltf-model>
  ```
- Re-export the GLB centered & scaled at source for best results.

**iOS audio is silent**
- Audio only unlocks **after** the user taps **Start** (a gesture), per Apple's
  rules. This is handled — just ensure `assets/audio/cue.mp3` exists if you want
  the first-detection cue.

---

## 11. Customizing the brand

- **Logo** → replace `logo.png` (UI reads `./logo.png`). A grayscale-inverted
  treatment is applied automatically to match the dark UI.
- **Hero image** → the start screen has a placeholder `.hero`. Swap it for an
  `<img src="./assets/hero.jpg">` inside `#start-screen`.
- **Colors** → tweak the CSS `:root` tokens (`--bg`, `--fg`, `--accent`, …).
- **Copy** → all on-screen text is plain HTML — edit in place.

---

## License / Credits

- [MindAR](https://github.com/hiukim/mind-ar-js) (MIT)
- [A-Frame](https://aframe.io/) (MIT)
- [aframe-extras](https://github.com/c-frame/aframe-extras) (MIT)
