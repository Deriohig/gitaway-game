// viewer.mjs
// Lean HTML (no base64). Loads the proof models from relative ./<id>.wasm paths
// and builds the cohesive countryside scene in three.js r186 = the game's version (jsDelivr importmap, pinned below).
//
// TERRAIN REBUILD (2026-10): the terrain is now ONE continuous WATERTIGHT
// heightfield. There are NO separate cliff meshes any more -- the old
// buildCliffs() curtain system (which produced the floating brown panels) is
// GONE. Every elevation drop lives inside the single heightfield; cliffs are
// simply its STEEP FACES, coloured rock PER FACE by slope on a non-indexed mesh.
// All the terrain MATH lives in lib/terrain.mjs (pure, node-tested) and is
// inlined here by build.mjs as window.__GT__ -- one source of truth.
//
// EVERY colour / tuning value is read from the config (window.__LOOK__ /
// window.__MODULES__). No colour or number is hardcoded in this file.
//
// viewerHtml(scene, look, modules, gtSource):
//   scene = { assets:[{id,file,tris}] }; look = look.config; modules = modules.config;
//   gtSource = the browser-ready source of lib/terrain.mjs (exports stripped).

// ARCHIPELAGO (spec v3.1, 2026-10-18): the default world is now the blueprint island built from
// docking pieces (lib/arch-scene.js + lib/islandAdapter.mjs, inlined below). The legacy single-island
// scene stays available with ?world=legacy (and ?view=gallery|test|wire).
// LOOK-BRIEF Phase 0: extra = { lookPresets, lookSchema, panelSource, saveSource } -> window.__LOOK_PRESETS__ / __LOOK_SCHEMA__ (art/config/
// lookPresets.json + lookPresets.schema.json, read by arch-scene.js), the lil-gui LOOK panel (lib/look-panel.js) and its Save & share
// logic (lib/look-save.mjs -> window.__LOOK_SAVE__: claude.ai artifact db / downloads, see the header of that file).
// CDN pins (exact versions, jsDelivr like before): three = the game's version, lil-gui for the panel.
export const THREE_VERSION = '0.186.1';
export const LIL_GUI_VERSION = '0.20.0';
export function viewerHtml(scene, look, modules, gtSource, world3, archSource, adapterSource, extra = {}) {
  const sceneJson = JSON.stringify(scene).replace(/</g, '\\u003c');
  const lookJson = JSON.stringify(look).replace(/</g, '\\u003c');
  const modulesJson = JSON.stringify(modules || {}).replace(/</g, '\\u003c');
  const world3Json = JSON.stringify(world3 || {}).replace(/</g, '\\u003c');
  const presetsJson = JSON.stringify(extra.lookPresets || {}).replace(/</g, '\\u003c');
  const schemaJson = JSON.stringify(extra.lookSchema || {}).replace(/</g, '\\u003c');
  const gt = String(gtSource || '').replace(/<\/script>/gi, '<\\/script>');
  const arch = String(archSource || '').replace(/<\/script>/gi, '<\\/script>');
  const adapter = String(adapterSource || '').replace(/<\/script>/gi, '<\\/script>');
  const panel = String(extra.panelSource || '').replace(/<\/script>/gi, '<\\/script>');
  // lib/look-save.mjs (the panel's Save & share logic: pure, node-tested) -> window.__LOOK_SAVE__, the terrain.mjs pattern: the ESM sugar is stripped
  const stripEsm = (src) => src.replace(/^\s*export\s+default\s+[^;]+;?\s*$/m, '').replace(/^export\s+/gm, '');
  const save = stripEsm(String(extra.saveSource || '')).replace(/<\/script>/gi, '<\\/script>');
  // lib/look-core.mjs (WORLDSEED-BRIEF look core: time of day, cel patch, painted sky / composite GLSL; pure, node-tested) -> window.__LOOK_CORE__
  const core = stripEsm(String(extra.coreSource || '')).replace(/<\/script>/gi, '<\\/script>');
  // lib/plants.mjs (WORLDSEED-BRIEF plants & shapes: procedural tree variants + shrubs; pure, node-tested) -> window.__PLANTS__
  const plants = stripEsm(String(extra.plantsSource || '')).replace(/<\/script>/gi, '<\\/script>');
  // lib/water-core.mjs (the water revamp: GLSL, patchWaterLambert, phases; pure, node-tested) -> window.__WATER_CORE__ (?water=v2)
  const waterCore = stripEsm(String(extra.waterSource || '')).replace(/<\/script>/gi, '<\\/script>');
  const PROOF_THREE = extra.threeVersion || THREE_VERSION;   // (build.mjs --three <v>: an A/B build on another three release)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Gitaway countryside</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #cfe4ec; overflow: hidden; }
  #app { position: fixed; inset: 0; }
  canvas { display: block; }
  .panel { position: fixed; background: rgba(255, 249, 238, 0.58); color: #37301f;
    border: 1px solid rgba(120, 95, 60, 0.22); border-radius: 12px;
    box-shadow: 0 4px 14px rgba(95, 70, 35, 0.14); backdrop-filter: blur(3px); }
  #legend { top: 12px; left: 12px; padding: 10px 12px; max-width: calc(100vw - 24px); }
  #legend h1 { margin: 0 0 6px; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
  #legend ul { margin: 0; padding: 0; list-style: none; font-size: 12px; columns: 2; column-gap: 16px; }
  #legend li { display: flex; justify-content: space-between; gap: 12px; padding: 1px 0; break-inside: avoid; }
  #legend .id { font-weight: 600; }
  #legend .tris { color: #8a7a5c; font-variant-numeric: tabular-nums; }
  #controls { bottom: 12px; left: 12px; padding: 7px; display: flex; gap: 8px; }
  #controls button { font: inherit; font-size: 13px; font-weight: 600; color: #40372a; cursor: pointer;
    background: #f3e7cf; border: 1px solid rgba(120, 95, 60, 0.3); border-radius: 9px; padding: 8px 12px; }
  #controls button[aria-pressed="true"] { background: #e3cfa2; border-color: rgba(120,95,60,0.5); }
  #hint { position: fixed; bottom: 12px; right: 12px; font-size: 12px; color: #6f6148;
    background: rgba(255, 248, 235, 0.7); padding: 6px 10px; border-radius: 8px; pointer-events: none; }
  #fstats { bottom: 46px; right: 12px; padding: 5px 9px; font: 600 11px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  #gldiag { bottom: 62px; left: 12px; margin: 0; padding: 8px 10px; max-width: min(560px, calc(100vw - 24px)); max-height: 46vh; overflow: auto;
    font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-all; }
  .lil-gui.look-panel { --width: 330px; z-index: 10; }
  body.noui #legend, body.noui #controls, body.noui #hint, body.noui #fstats, body.noui #gldiag, body.noui .lil-gui { display: none !important; }
  @media (max-width: 600px) { #hint { display: none; } }
</style>
</head>
<body>
  <div id="app"></div>
  <div id="legend" class="panel"><h1>Gitaway &mdash; warm countryside</h1><ul id="legend-list"></ul></div>
  <div id="controls" class="panel"><button id="spin" type="button" aria-pressed="false">Auto-spin: off</button></div>
  <div id="hint">Drag to orbit &middot; scroll to zoom</div>

  <script>window.__GITAWAY_SCENE__ = ${sceneJson};</script>
  <script>window.__LOOK__ = ${lookJson};</script>
  <script>window.__MODULES__ = ${modulesJson};</script>
  <script>window.__WORLD3__ = ${world3Json};</script>
  <script>/* art/config/lookPresets.json + lookPresets.schema.json (LOOK-BRIEF) */
  window.__LOOK_PRESETS__ = ${presetsJson};
  window.__LOOK_SCHEMA__ = ${schemaJson};</script>
  <script>/* lib/terrain.mjs inlined (pure, node-tested) -> window.__GT__ */
  window.__GT__ = (function(){
${gt}
    return GT;
  })();
  window.__ARCH__ = (function(){ const q = new URLSearchParams(location.search);
    return !(q.get('world') === 'legacy' || ['gallery', 'test', 'wire'].includes(q.get('view'))); })();
  </script>
${core ? `  <script>/* lib/look-core.mjs inlined (pure, node-tested) -> window.__LOOK_CORE__ (look core: time of day, cel patch, painted sky, composite) */
  window.__LOOK_CORE__ = (function(){
${core}
    return LC;
  })();
  </script>
` : ''}${plants ? `  <script>/* lib/plants.mjs inlined (pure, node-tested) -> window.__PLANTS__ (plants stage: tree variants + shrubs) */
  window.__PLANTS__ = (function(){
${plants}
    return PL;
  })();
  </script>
` : ''}${waterCore ? `  <script>/* lib/water-core.mjs inlined (pure, node-tested) -> window.__WATER_CORE__ (the water revamp, ?water=v2) */
  window.__WATER_CORE__ = (function(){
${waterCore}
    return WCORE;
  })();
  </script>
` : ''}
  <script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@${PROOF_THREE}/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@${PROOF_THREE}/examples/jsm/",
      "lil-gui": "https://cdn.jsdelivr.net/npm/lil-gui@${LIL_GUI_VERSION}/dist/lil-gui.esm.min.js"
  } }
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    if (!window.__ARCH__) legacyMain();
    function legacyMain(){   // ---- LEGACY single-island scene (?world=legacy) ----

    const CFG = window.__GITAWAY_SCENE__ || { assets: [] };
    const L = window.__LOOK__;
    const P = L.palette;
    const GT = window.__GT__;
    const hx = (t) => P[t];                       // palette token -> hex
    const col = (t) => new THREE.Color(hx(t));    // palette token -> THREE.Color (linear)
    function hexRGB(h){ h = h.replace('#',''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
    const { mulberry32, strSeed } = GT;

    // ---- view modes / seeds ----
    const MW = window.__MODULES__ || {};
    const W3 = window.__WORLD3__ || {};
    const QS = new URLSearchParams(location.search);
    const VIEW = QS.get('view') || 'world';          // 'world' | 'gallery' | 'test' | 'wire'
    const GALLERY = VIEW === 'gallery';
    const TESTMODE = VIEW === 'test';
    const WIRE = VIEW === 'wire' || QS.get('wire') === '1';   // debug overlay (wireframe + slope)
    const NOUI = QS.get('ui') === '0';
    if (NOUI) document.body.classList.add('noui');
    const WSEED = (QS.get('seed') != null) ? (parseInt(QS.get('seed'),10)>>>0) : ((MW.world && MW.world.seed)>>>0);
    const ISL = (!TESTMODE && !GALLERY && W3.island && W3.island.enabled) ? W3 : null;

    // ---- build the world (deterministic) via the shared terrain core ----
    const noise = GT.makeNoise(L.terrain.elevation.seed);
    const world = MW.world;
    const GW = GALLERY ? null : GT.buildWorld(L, MW, { seed: WSEED, testMode: TESTMODE, world3: ISL });
    const built = GW ? GW.built : { cells: [], center: null, extraStamps: [] };
    const WORLD = { cells: built.cells, center: built.center };
    // the exact height grid the terrain mesh is built from -> the sampler is exact.
    const GRID = GALLERY ? null : GT.buildHeightGrid(L, world, built, noise, ISL);
    // triangle-exact terrain height (throws outside the grid; props never float).
    function TH(x, z){ if (GALLERY) return 0; return GT.sampleTerrain(x, z, GRID); }
    function cellAt(x, z){ let best=null, bd=1e18; for (const c of WORLD.cells){ const dx=x-c.cx, dz=z-c.cz, d=dx*dx+dz*dz; if(d<bd){ bd=d; best=c; } } return best; }
    function slopeAt(x,z){ const e=0.6; return Math.hypot(TH(x+e,z)-TH(x-e,z), TH(x,z+e)-TH(x,z-e))/(2*e); }
    const MISTLINE = ISL ? (ISL.mist.top + 2.0) : -1e9;
    // ---- CLUMPING fields (STAGE 2): low-frequency masks so vegetation forms
    //      CLUMPS with real CLEARINGS (defined zones), not an even sprinkle. Built
    //      from the terrain noise -> deterministic + stable under count changes.
    const CLMP = (L.vegetation.clump) || {};
    function forestMask(x,z){ const f=CLMP.freq||0.05; const n=noise.fbm(x*f+13.7, z*f-8.1, 2, 2.0, 0.5)*0.5+0.5; return GT.smoothstep(CLMP.lo!=null?CLMP.lo:0.40, CLMP.hi!=null?CLMP.hi:0.60, n); }
    function speciesField(x,z){ const f=CLMP.speciesFreq||0.028; return noise.fbm(x*f-5.3, z*f+7.7, 2, 2.0, 0.5)*0.5+0.5; }
    function driftMask(x,z){ const f=CLMP.driftFreq||0.085; const n=noise.fbm(x*f-21.1, z*f+3.3, 2, 2.0, 0.5)*0.5+0.5; return GT.smoothstep(CLMP.driftLo!=null?CLMP.driftLo:0.46, CLMP.driftHi!=null?CLMP.driftHi:0.64, n); }
    // steepest face within ~rad -> cliff adjacency (cliff-TOP tree clusters + cliff-BASE rocks)
    function nearCliff(x,z,rad){ let m=0; for(const o of [[rad,0],[-rad,0],[0,rad],[0,-rad],[rad*0.7,rad*0.7],[-rad*0.7,-rad*0.7]]){ const s=slopeAt(x+o[0],z+o[1]); if(s>m)m=s; } return m; }
    // ---- PATH NETWORK (PASS A): routed on the heightfield by the shared terrain core
    //      (GT.buildPathNetwork: one main route from the porch + branches joining it
    //      outside the clearing, re-splined, tapered). Used to (a) draw the smooth
    //      soft-edged ribbons and (b) reserve the vegetation corridor. NO terrain bake.
    //      Legacy single porch path outside island mode. ----
    const PATH_NET = (ISL && W3.paths && W3.paths.enabled && GRID) ? GT.buildPathNetwork(W3, GRID, noise, { seed: WSEED }) : null;
    if (PATH_NET && PATH_NET.notes.length) console.warn('[paths] ' + PATH_NET.notes.join('; '));
    window.__pathNetwork = PATH_NET;
    const PATH_ROUTES = PATH_NET ? PATH_NET.routes : (()=>{
      if (GALLERY) return [];
      const curve = new THREE.CatmullRomCurve3(L.composition.path.points.map(p=>new THREE.Vector3(p[0],0,p[1])));
      const N = Math.max(48, Math.round(curve.getLength()*1.4)), s = [];
      for (let i=0;i<=N;i++){ const p = curve.getPoint(i/N); s.push([p.x,p.z]); }
      return [{ name:'porch', kind:'main', samples: s, widths: s.map(()=>L.composition.path.width||0.76) }];
    })();
    const PATH_SOFT = (ISL && W3.paths && W3.paths.soft != null) ? W3.paths.soft : 0.3;
    const PATH_SAMPLES = []; for (const r of PATH_ROUTES) for (const p of r.samples) PATH_SAMPLES.push(p);
    // half-width of the drawn corridor (core + soft edge): nothing small may grow inside it
    const PATH_CORE = PATH_ROUTES.reduce((m, r) => Math.max(m, ...r.widths.map(w => w/2)), 0) + PATH_SOFT;
    function distToPathXZ(x,z){ let m=1e9; for(const p of PATH_SAMPLES){ const dx=p[0]-x, dz=p[1]-z, d=dx*dx+dz*dz; if(d<m)m=d; } return Math.sqrt(m); }

    // ---- renderer / scene ----
    const app = document.getElementById('app');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    // GAME PARITY (gitaway/src/world/World.tsx <Canvas flat>): colour management ON,
    // sRGB output, NO tone mapping. Vertex/palette colours go through THREE.Color
    // (sRGB hex -> linear) and are converted back exactly once on output. ?tone=
    // still overrides for A/B diagnostics.
    THREE.ColorManagement.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const TM = { ACESFilmic: THREE.ACESFilmicToneMapping, Reinhard: THREE.ReinhardToneMapping, Linear: THREE.LinearToneMapping, None: THREE.NoToneMapping };
    renderer.toneMapping = TM[QS.get('tone') || L.lighting.toneMapping] ?? THREE.NoToneMapping;
    renderer.toneMappingExposure = L.lighting.exposure;   // inert under NoToneMapping
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    app.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = col(L.atmosphere.sky.topToken);
    scene.fog = new THREE.Fog(col((ISL && ISL.fog && ISL.fog.colorToken) ? ISL.fog.colorToken : L.atmosphere.fog.colorToken), (ISL && ISL.fog && ISL.fog.near != null) ? ISL.fog.near : L.atmosphere.fog.near, (ISL && ISL.fog && ISL.fog.far != null) ? ISL.fog.far : L.atmosphere.fog.far);
    // GAME PARITY fog (gitaway/src/world/DayCycle.tsx): LINEAR fog anchored to the
    // CAMERA: near = camDist + nearOffset (40), far = camDist + farOffset (230), where
    // camDist = camera->target distance (in the game: the CameraRig rest distance).
    // Updated every frame + per capture shot by syncFrame(). Island mode only.
    const FOGREL = (ISL && ISL.fog && ISL.fog.nearOffset != null) ? ISL.fog : null;

    // ---- GAME-PARITY CAMERA (gitaway/src/world/World.tsx): fov 30, near 0.5, far 600.
    //   GAMEPLAY mode = the game's OrbitControls clamp (no pan, distance 14..140,
    //     polar 0.62..1.22 rad, azimuth PI/4 +/- 0.85), framed like CameraRig.
    //   PHOTO mode (?photo=1, or a preset with mode:'photo') = free orbit + wide zoom.
    const RC = (W3.render && W3.render.camera) || { fov: 30, near: 0.5, far: 600 };
    const GP = (W3.render && W3.render.gameplay) || { minDistance: 14, maxDistance: 140, minPolar: 0.62, maxPolar: 1.22, azimuthCenter: Math.PI/4, azimuthRange: 0.85, frame: { width: 8.5, height: 9.5, fill: 0.95 } };
    const PH = (W3.render && W3.render.photo) || { minDistance: 4, maxDistance: 560, minPolar: 0.05, maxPolar: 1.45 };
    const CAM = L.camera;
    const camera = new THREE.PerspectiveCamera(RC.fov, window.innerWidth/window.innerHeight, RC.near, RC.far);
    const LOOKAT = new THREE.Vector3(CAM.target[0], CAM.target[1], CAM.target[2]);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(LOOKAT);
    controls.enableDamping = true; controls.dampingFactor = CAM.damping;
    controls.autoRotateSpeed = CAM.autoRotateSpeed;
    // CameraRig framing (gitaway/src/world/framing.ts frameDistance): the distance at
    // which the hero frame (width x height world units around the target) fits the
    // view for this aspect, floored at the gameplay minDistance.
    function rigDistance(aspect){
      const F = GP.frame || { width: 8.5, height: 9.5, fill: 0.95 }, t = Math.tan(THREE.MathUtils.degToRad(RC.fov/2));
      return Math.max(GP.minDistance || 0, (F.width/(2*t*aspect))*(F.fill != null ? F.fill : 0.95), F.height/(2*t));
    }
    window.__frameDistance = rigDistance;
    const LIVE_MODE = (QS.get('photo') === '1') ? 'photo' : 'gameplay';
    function applyMode(mode){
      if (mode === 'gameplay'){
        controls.enablePan = !!GP.enablePan;
        controls.minDistance = GP.minDistance; controls.maxDistance = GP.maxDistance;
        controls.minPolarAngle = GP.minPolar; controls.maxPolarAngle = GP.maxPolar;
        controls.minAzimuthAngle = GP.azimuthCenter - GP.azimuthRange; controls.maxAzimuthAngle = GP.azimuthCenter + GP.azimuthRange;
        controls.rotateSpeed = GP.rotateSpeed != null ? GP.rotateSpeed : 1; controls.zoomSpeed = GP.zoomSpeed != null ? GP.zoomSpeed : 1;
        controls.dampingFactor = GP.damping != null ? GP.damping : CAM.damping;
      } else {
        controls.enablePan = true;
        controls.minDistance = PH.minDistance; controls.maxDistance = PH.maxDistance;
        controls.minPolarAngle = PH.minPolar; controls.maxPolarAngle = PH.maxPolar;
        controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity;
        controls.rotateSpeed = 1; controls.zoomSpeed = 1; controls.dampingFactor = CAM.damping;
      }
    }
    // does an (az,el,dist) framing obey the game clamp? (every gameplay preset must)
    function inClamp(az, el, dist){
      const pol = Math.PI/2 - THREE.MathUtils.degToRad(el); let a = THREE.MathUtils.degToRad(az); a = Math.atan2(Math.sin(a), Math.cos(a));
      const e = 1e-6;
      return dist >= GP.minDistance-e && dist <= GP.maxDistance+e && pol >= GP.minPolar-e && pol <= GP.maxPolar+e &&
        a >= GP.azimuthCenter-GP.azimuthRange-e && a <= GP.azimuthCenter+GP.azimuthRange+e;
    }
    function placeCamera(az, el, dist, tgt){
      LOOKAT.set(tgt[0], tgt[1], tgt[2]); controls.target.copy(LOOKAT);
      const elR = THREE.MathUtils.degToRad(el), azR = THREE.MathUtils.degToRad(az);
      camera.position.set(LOOKAT.x + Math.cos(elR)*Math.sin(azR)*dist, LOOKAT.y + Math.sin(elR)*dist, LOOKAT.z + Math.cos(elR)*Math.cos(azR)*dist);
    }
    function positionCamera(){
      if (GALLERY){
        const a = window.innerWidth/window.innerHeight; camera.fov = 42;
        LOOKAT.set(0, 0.8, 0); controls.target.copy(LOOKAT);
        const el = THREE.MathUtils.degToRad(24), az = THREE.MathUtils.degToRad(12), dist = a < CAM.mobileAspect ? 60 : 42;
        camera.position.set(Math.cos(el)*Math.sin(az)*dist, 1.0+Math.sin(el)*dist, Math.cos(el)*Math.cos(az)*dist);
        camera.aspect = a; camera.updateProjectionMatrix(); controls.update(); return;
      }
      const aspect = window.innerWidth/window.innerHeight;
      const mobile = (QS.get('mobile') === '1') || aspect < CAM.mobileAspect;
      // live default = the GAMEPLAY default preset for this aspect; ?preset=<name> loads any preset
      const CAMS = W3.cameras || {};
      const pre = CAMS[QS.get('preset')] || (mobile ? CAMS.default_mobile : CAMS.default_desktop) || null;
      let mode = pre && pre.mode === 'photo' ? 'photo' : LIVE_MODE;
      let az = pre ? pre.az : CAM.azimuthDeg;
      let el = pre ? pre.el : (mobile ? CAM.elevationDegMobile : CAM.elevationDeg);
      let tgt = pre ? pre.tgt : (mobile ? CAM.targetMobile : CAM.target);
      let dist = (pre && pre.dist !== 'rig' && pre.dist != null) ? pre.dist : rigDistance(aspect);
      // ?cam=az,el,dist  (+ optional ?tgt=x,y,z) -> deterministic shot framing
      const camQ = QS.get('cam');
      if (camQ){ const p = camQ.split(',').map(Number); az = p[0]; el = p[1]; if (p[2]) dist = p[2]; }
      const tgtQ = QS.get('tgt'); if (tgtQ) tgt = tgtQ.split(',').map(Number);
      camera.fov = RC.fov;
      applyMode(mode);
      placeCamera(az, el, dist, tgt);
      camera.aspect = aspect; camera.updateProjectionMatrix(); controls.update();
    }
    positionCamera();

    // ---- lighting ----
    const LG = L.lighting;
    scene.add(new THREE.HemisphereLight(hx(LG.hemisphere.skyToken), hx(LG.hemisphere.groundToken), LG.hemisphere.intensity));
    scene.add(new THREE.AmbientLight(hx(LG.ambient.colorToken), LG.ambient.intensity));
    const sun = new THREE.DirectionalLight(hx(LG.sun.colorToken), LG.sun.intensity);
    { const el = THREE.MathUtils.degToRad(LG.sun.elevationDeg), az = THREE.MathUtils.degToRad(LG.sun.azimuthDeg), d = LG.sun.distance, t = LG.sun.target;
      sun.position.set(t[0] + Math.sin(az)*Math.cos(el)*d, t[1] + Math.sin(el)*d, t[2] + Math.cos(az)*Math.cos(el)*d);
      sun.target.position.set(t[0], t[1], t[2]); }
    sun.castShadow = true;
    sun.shadow.mapSize.set(LG.shadows.mapSize, LG.shadows.mapSize);
    sun.shadow.radius = LG.shadows.radius; sun.shadow.bias = LG.shadows.bias; sun.shadow.normalBias = LG.shadows.normalBias;
    const sc = sun.shadow.camera; const f = LG.shadows.frustum;
    sc.near = LG.shadows.near; sc.far = LG.shadows.far; sc.left = -f; sc.right = f; sc.top = f; sc.bottom = -f;
    scene.add(sun); scene.add(sun.target);

    // ---- gradient sky dome ----
    // GAME PARITY: the game's sky is a CSS backdrop behind a transparent canvas, i.e.
    // screen-space. The dome is therefore CAMERA-CENTRED (syncFrame moves it with the
    // camera, radius inside the far plane) so it stays a backdrop at every zoom,
    // incl. the ~400u photo-mode island views.
    let skyDome = null;
    function syncFrame(){
      if (FOGREL && scene.fog){
        const d = camera.position.distanceTo(controls.target);
        scene.fog.near = d + FOGREL.nearOffset; scene.fog.far = d + FOGREL.farOffset;
        // keep the game's far plane (600) unless photo-mode fog reaches past it: the
        // clip must always sit beyond full haze (true in the game for every dist <= 140).
        const far = Math.max(RC.far, scene.fog.far + 40);
        if (Math.abs(camera.far - far) > 0.5){ camera.far = far; camera.updateProjectionMatrix(); }
      }
      if (skyDome){ skyDome.position.copy(camera.position); skyDome.scale.setScalar(camera.far * 0.9); }
      // the hill bands are a distant HORIZON backdrop (the game paints its mountains in
      // CSS). Seen from OUTSIDE their ring (photo-mode island views at ~400u) they would
      // read as world-space rings around the island, so they only show from inside.
      if (ISL){ const cr = Math.hypot(camera.position.x, camera.position.z); for (const h of HILLS) h.mesh.visible = cr < h.radius * 0.92; }
    }
    const HILLS = [];
    (function sky(){
      const sk = L.atmosphere.sky;
      const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { top:{value:col(sk.topToken)}, bot:{value:col(sk.horizonToken)}, hz:{value:sk.horizonOffset}, sh:{value:sk.sharpness} },
        vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bot; uniform float hz; uniform float sh;'
          // PASS A (STYLE R2 / parity): convert the linear gradient to the sRGB output
          // exactly once, like every built-in material (it used to write linear values
          // straight to the sRGB buffer -> the sky/horizon rendered dark olive-grey).
          + ' void main(){ float h=clamp(normalize(vP).y+hz,0.0,1.0); gl_FragColor=vec4(mix(bot,top,pow(h,sh)),1.0);\\n#include <colorspace_fragment>\\n}' });
      skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat);   // unit sphere, scaled by syncFrame
      skyDome.frustumCulled = false; skyDome.renderOrder = -10; scene.add(skyDome);
    })();

    // ---- distant rolling-hill silhouette bands ----
    (function hills(){
      for (const b of ((ISL && ISL.hills) ? ISL.hills : L.background.hillBands)){
        const prof = (a) => b.base + b.amp*(0.6*Math.sin(a*5+b.phase) + 0.4*Math.sin(a*9+b.phase*2) + 0.3*Math.sin(a*2+0.6));
        const v = [];
        for (let i=0;i<b.segs;i++){
          const a0=(i/b.segs)*Math.PI*2, a1=((i+1)/b.segs)*Math.PI*2;
          const x0=Math.cos(a0)*b.radius, z0=Math.sin(a0)*b.radius, y0=prof(a0);
          const x1=Math.cos(a1)*b.radius, z1=Math.sin(a1)*b.radius, y1=prof(a1);
          v.push(x0,-30,z0, x1,-30,z1, x1,y1,z1, x0,-30,z0, x1,y1,z1, x0,y0,z0);
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col(b.colorToken), fog: true }));
        scene.add(mesh); HILLS.push({ mesh, radius: b.radius });
      }
    })();

    // ---- clouds ----
    const cloudGroup = new THREE.Group();
    (function clouds(){
      const C = L.background.clouds;
      const mat = new THREE.MeshStandardMaterial({ color: col(C.colorToken), roughness: 1, metalness: 0, flatShading: true });
      mat.fog = false;
      const lobes = [[0,0,0,2.0],[2.0,-0.2,0.2,1.5],[-1.9,-0.1,-0.2,1.6],[0.8,0.5,-0.3,1.3],[-0.7,0.3,0.4,1.25]];
      for (const c of C.instances){
        const g = new THREE.Group();
        for (const [lx,ly,lz,r] of lobes){ const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r,2), mat);
          m.scale.set(1,C.flatten,1); m.position.set(lx,ly,lz); g.add(m); }
        g.position.set(c.x,c.y,c.z); g.scale.setScalar(c.scale); cloudGroup.add(g);
      }
      scene.add(cloudGroup);
    })();

    // ---- mist sheet: layered translucent discs (transparent over the island
    //      interior, haze over the sunken basin) so the island reads as
    //      self-contained, floating in soft haze (spec 5). Height-tested so the
    //      island interior shows through and only the rim-feet/basin are veiled.
    (function mist(){
      if (!ISL || !ISL.mist || !ISL.mist.enabled) return;
      const M = ISL.mist;
      // PASS A: radial profile in WORLD units -- clear inside radiusInner, full veil
      // from radiusFull (the Stage-2 profile near the island), then a soft fade to 0 at
      // radiusOuter so the sheet never shows a hard square edge from the zoomed-out
      // (fov 30, ~400u) photo views; beyond it the Haze horizon of the sky continues.
      const RES = 512, cv = document.createElement('canvas'); cv.width = cv.height = RES;
      const g2 = cv.getContext('2d'), R = M.radiusOuter, half = RES/2;
      const grd = g2.createRadialGradient(half,half,0, half,half,half);
      const rgb = hexRGB(hx(M.colorToken)), rgba = (a) => 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+a+')';
      const fFull = (M.radiusFull != null ? M.radiusFull : 0.72*R)/R, fFade = (M.radiusFade != null ? M.radiusFade : R)/R;
      grd.addColorStop(0, rgba(0)); grd.addColorStop(M.radiusInner/R, rgba(0));
      grd.addColorStop(fFull, rgba(M.opacity)); grd.addColorStop(Math.max(fFull, fFade), rgba(M.opacity));
      grd.addColorStop(1, rgba(M.radiusFade != null ? 0 : M.opacity));
      g2.fillStyle = grd; g2.fillRect(0,0,RES,RES);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
      const geo = new THREE.PlaneGeometry(M.radiusOuter*2, M.radiusOuter*2);
      const layers = M.layers || 1;
      for (let i=0;i<layers;i++){ const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI/2; m.position.y = M.top + i*0.9; m.renderOrder = 2 + i; scene.add(m); }
    })();

    // ---- ONE WATERTIGHT TERRAIN HEIGHTFIELD: non-indexed, flat-shaded, coloured
    //      PER FACE (rock on steep faces, grass on flat). No separate cliff mesh. ----
    (function terrain(){
      const T = L.terrain, TC = T.colour, FB = TC.faceBands;
      if (GALLERY){
        const geo = new THREE.PlaneGeometry(T.size, T.size, 1, 1); geo.rotateX(-Math.PI/2);
        const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: col(TC.grassToken), roughness:1, metalness:0 }));
        m.receiveShadow = true; scene.add(m); return;
      }
      const grid = GRID, tris = GT.gridTriangles(grid);
      const pos = new Float32Array(tris.length*9), colr = new Float32Array(tris.length*9);
      const MISTC = ISL ? col(ISL.mist.colorToken) : null, MISTTOP = ISL ? ISL.mist.top : 0;
      const SUBBOT = ISL ? (ISL.mist.submergeBottom != null ? ISL.mist.submergeBottom : MISTTOP-9.0) : 0;
      // PASS A: colours come from the shared, node-tested terrain core. Ground colour
      // is PER VERTEX (smooth fields -> meadows are one continuous sheet, no per-quad
      // blocks); rock + cliff-foot soil stay PER FACE (crisp faceted drama). The
      // Stage-2 per-quad PATH BAKE is gone (it made the dirt halo round the farm and
      // the staircase path edges); paths are now soft-edged ribbons (below).
      const TCOL = GT.terrainColours(L, ISL, grid, { tris });
      const src = TCOL.colours, maxSlope = TCOL.maxSlope, rockFaces = TCOL.rockFaces;
      let p = 0, pb = tris.length*9;
      for (let t = 0; t < tris.length; t++){
        const tri = tris[t];
        // faces fully SUBMERGED in the mist basin go to the END of the buffer
        // (material group 1, unlit mist colour) -> basin = mist = sky horizon colour,
        // so the 300u plane's edge never shows through the veil from the photo views.
        let o; if (TCOL.basin[t]){ pb -= 9; o = pb; } else { o = p; p += 9; }
        for (let k=0;k<3;k++){ const v = GT.nodeXYZ(grid, tri[k]), q = o + k*3, s = t*9 + k*3;
          pos[q]=v[0]; pos[q+1]=v[1]; pos[q+2]=v[2]; colr[q]=src[s]; colr[q+1]=src[s+1]; colr[q+2]=src[s+2]; }
      }
      // DIAGNOSTICS: ?diag=albedo -> unlit vertex colours (colour-only variation);
      //              ?diag=shade  -> neutral grey, lit (lighting/facet-only variation).
      const DIAG = QS.get('diag');
      if (DIAG === 'shade') colr.fill(0.42);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
      geo.setAttribute('color', new THREE.BufferAttribute(colr,3));
      geo.computeVertexNormals(); // non-indexed -> genuine per-face normals (flat)
      geo.addGroup(0, p/3, 0); geo.addGroup(p/3, (tris.length*9 - p)/3, 1);   // [lit land | unlit mist basin]
      const landMat = DIAG === 'albedo' ? new THREE.MeshBasicMaterial({ vertexColors:true })
        : new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, metalness:0, flatShading:true });
      const basinMat = new THREE.MeshBasicMaterial({ color: MISTC || col('Haze'), fog: false });
      // PASS A: below the mist sheet the LIT land fades per-fragment (post-lighting,
      // post-fog, in output space) to the exact mist colour, reaching it at
      // submergeBottom where the unlit basin begins -> no lit/unlit seam, no stepped
      // fringe, and the rim truly descends into the mist from the zoomed-out views.
      if (MISTC && DIAG !== 'albedo'){
        const mo = hexRGB(hx(ISL.mist.colorToken)).map(v => v/255);
        landMat.onBeforeCompile = (sh) => {
          sh.uniforms.uMistOut = { value: new THREE.Vector3(mo[0], mo[1], mo[2]) };
          sh.uniforms.uMistTop = { value: MISTTOP }; sh.uniforms.uMistBot = { value: SUBBOT };
          sh.vertexShader = 'varying float vMistY;\\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\\nvMistY = position.y;');
          sh.fragmentShader = 'uniform vec3 uMistOut;\\nuniform float uMistTop;\\nuniform float uMistBot;\\nvarying float vMistY;\\n' +
            sh.fragmentShader.replace('#include <dithering_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, uMistOut, 1.0 - smoothstep(uMistBot, uMistTop, vMistY));\\n#include <dithering_fragment>');
        };
        landMat.customProgramCacheKey = () => 'terrainMistFade';
      }
      const mesh = new THREE.Mesh(geo, [landMat, basinMat]);
      mesh.receiveShadow = true; mesh.castShadow = false; scene.add(mesh);
      window.__terrainMesh = mesh;
      if (WIRE){
        const wf = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color:0x202020, wireframe:true, transparent:true, opacity:0.4 }));
        scene.add(wf);
        console.log('[wire] ONE terrain mesh:', tris.length, 'faces,', (pos.length/3)|0, 'verts | maxSlope', maxSlope.toFixed(3), '| rockFaces', rockFaces);
      }
    })();

    // ---- PASS A path ribbons: one smooth, surface-conforming strip per route with a
    //      SOFT alpha edge (7 vertices across: 0 | core x5 | 0) and soft route ends, so
    //      no hard or stair-stepped edge and nothing baked into the terrain. Every
    //      vertex height is sampled ON the triangle-exact surface (+ a small lift and
    //      polygon offset), samples every ~0.5u, so it never clips or floats. Widths
    //      taper along each route (from the network). ----
    (function path(){
      if (GALLERY || !PATH_ROUTES.length) return;
      const lift = 0.035, pc = col('Path');
      const mat = new THREE.MeshStandardMaterial({ vertexColors:true, transparent:true, depthWrite:false, roughness:1, metalness:0,
        polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 });
      for (const rt of PATH_ROUTES){
        const s = rt.samples, N = s.length; if (N < 2) continue;
        const acc = [0]; for (let i=1;i<N;i++) acc.push(acc[i-1] + Math.hypot(s[i][0]-s[i-1][0], s[i][1]-s[i-1][1]));
        const Ltot = acc[N-1], pos = [], cola = [], idx = [];
        for (let i=0;i<N;i++){
          const a = s[Math.max(0,i-1)], b = s[Math.min(N-1,i+1)];
          let tx = b[0]-a[0], tz = b[1]-a[1]; const tl = Math.hypot(tx,tz) || 1; tx /= tl; tz /= tl;
          const nx = -tz, nz = tx, hw = rt.widths[i]/2;
          // soft ends: the far end of every route fades out; the main route also fades in at the porch
          const fadeLen = Math.min(5, Math.max(1.8, 0.25*Ltot));   // a footpath that dissolves into the grass, not a stub
          const endA = (rt.kind === 'main' ? GT.smoothstep(0, 0.9, acc[i]) : 1) * GT.smoothstep(0, fadeLen, Ltot - acc[i]);
          const offs = [-(hw+PATH_SOFT), -hw, -hw*0.5, 0, hw*0.5, hw, hw+PATH_SOFT], al = [0, 1, 1, 1, 1, 1, 0];
          for (let c=0;c<7;c++){ const x = s[i][0]+nx*offs[c], z = s[i][1]+nz*offs[c]; pos.push(x, TH(x,z)+lift, z); cola.push(pc.r, pc.g, pc.b, al[c]*endA); }
        }
        for (let i=0;i<N-1;i++) for (let c=0;c<6;c++){ const a=i*7+c, b=a+1, d=a+7, e=d+1; idx.push(a, b, d, b, e, d); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(cola,4));
        g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1; scene.add(m);
      }
    })();

    // ---- soft contact shadow ----
    const shadowTex = (function(){
      const cv = document.createElement('canvas'); cv.width = cv.height = 128;
      const g = cv.getContext('2d'); const grd = g.createRadialGradient(64,64,4,64,64,62);
      const [r,gg,b] = hexRGB(hx(L.lighting.contactShadow.colorToken)); const a = L.lighting.contactShadow.innerAlpha;
      grd.addColorStop(0, 'rgba('+r+','+gg+','+b+','+a+')'); grd.addColorStop(1, 'rgba('+r+','+gg+','+b+',0)');
      g.fillStyle = grd; g.fillRect(0,0,128,128);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, fog: true });
    function contact(x, z, rx, rz){
      const m = new THREE.Mesh(new THREE.PlaneGeometry(rx, rz), shadowMat);
      m.rotation.x = -Math.PI/2; m.position.set(x, TH(x,z)+0.03, z); m.renderOrder = 1; scene.add(m);
    }

    // ---- low-poly pine (scene-only) ----
    function makePine(){
      const V = L.vegetation.pine;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.12,0.45,6),
        new THREE.MeshStandardMaterial({ color: col(V.trunkToken), roughness:1, flatShading:true }));
      trunk.position.y = 0.22; trunk.castShadow = true; g.add(trunk);
      const leaf = new THREE.MeshStandardMaterial({ color: col(V.leafToken), roughness:1, flatShading:true });
      const leaf2 = new THREE.MeshStandardMaterial({ color: col(V.leaf2Token), roughness:1, flatShading:true });
      for (const [r,h,y,mt] of [[0.62,0.8,0.62,leaf2],[0.48,0.72,1.12,leaf],[0.33,0.62,1.62,leaf]]){
        const c = new THREE.Mesh(new THREE.ConeGeometry(r,h,7), mt); c.position.y=y; c.castShadow=true; g.add(c);
      }
      return g;
    }

    // ---- ambient-life uniforms ----
    const sway = { uTime: { value: 0 } };
    const GS = L.ambient.grassSway;
    function makeSway(base){
      const m = base.clone();
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = sway.uTime;
        sh.uniforms.uGS = { value: new THREE.Vector4(GS.ampX, GS.ampZ, GS.speedX, GS.speedZ) };
        sh.vertexShader = 'uniform float uTime;\\nuniform vec4 uGS;\\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\\n'
          + 'vec4 wsp = modelMatrix * instanceMatrix * vec4(position,1.0);\\n'
          + 'float ph = wsp.x*0.6 + wsp.z*0.6;\\n'
          + 'float k = clamp(position.y,0.0,1.0);\\n'
          + 'transformed.x += sin(uTime*uGS.z+ph)*uGS.x*k;\\n'
          + 'transformed.z += sin(uTime*uGS.w+ph+1.3)*uGS.y*k;');
      };
      m.customProgramCacheKey = () => 'grassSway';
      return m;
    }

    // ---- diorama build (after models load) ----
    const loaded = {};
    const canopies = [];
    let smoke = null;
    function firstMesh(root){ let f=null; root.traverse(o=>{ if(!f && o.isMesh) f=o; }); return f; }

    function placeCluster(ox=0, oz=0){
      const upd = new THREE.Vector3();
      for (const [id, spots] of Object.entries(L.composition.cluster || {})){
        const src = loaded[id]; if (!src) continue;
        for (const p of spots){
          const X = p.x+ox, Z = p.z+oz;
          const obj = src.clone(true);
          obj.scale.setScalar(p.scale || 1);
          obj.position.set(X, TH(X, Z), Z);
          obj.rotation.y = p.ry || 0;
          obj.traverse(o => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } if (o.name === 'Canopy') canopies.push(o); });
          scene.add(obj);
          if (id === 'farmhouse'){ contact(X, Z, 3.4, 3.0);
            obj.updateMatrixWorld(true); const sm = obj.getObjectByName('Smoke'); if (sm) smoke = initSmoke(sm.getWorldPosition(upd).clone());
          } else if (id === 'tree_round_a') contact(X, Z, 2.6*(p.scale||1), 2.6*(p.scale||1));
          else if (id.startsWith('rock') || id.startsWith('bush')) contact(X, Z, 1.3, 1.1);
          else if (id === 'flowerbed' || id === 'plot') contact(X, Z, 1.5, 1.3);
        }
      }
    }

    // ---- gallery: render each module in isolation on flat ground ----
    function populatePatch(mod, cx, cz, R, rng){
      const d = mod.density || {}, placed = [];
      const freeSpot = (minSep) => { for(let a=0;a<30;a++){ const ang=rng()*Math.PI*2, rr=Math.sqrt(rng())*R, x=cx+Math.cos(ang)*rr, z=cz+Math.sin(ang)*rr; let ok=true; for(const q of placed){ if((q[0]-x)**2+(q[1]-z)**2<minSep*minSep){ ok=false; break; } } if(ok){ placed.push([x,z]); return [x,z]; } } return null; };
      const pine = makePine();
      const nT = Math.round((d.tree||0)*9);
      for(let k=0;k<nT;k++){ const s=freeSpot(2.2); if(!s) continue; let o; if(rng()<0.5||!loaded['tree_round_a']){ o=pine.clone(true); o.scale.setScalar(0.9+rng()*0.8); } else { o=loaded['tree_round_a'].clone(true); o.scale.setScalar(0.7+rng()*0.5); } o.position.set(s[0],0,s[1]); o.rotation.y=rng()*6.28; o.traverse(m=>{if(m.isMesh)m.castShadow=true;}); scene.add(o); }
      const nB = Math.round((d.bush||0)*6);
      for(let k=0;k<nB && loaded['bush_a'];k++){ const s=freeSpot(1.3); if(!s) continue; const o=loaded['bush_a'].clone(true); o.scale.setScalar(0.8+rng()*0.5); o.position.set(s[0],0,s[1]); o.rotation.y=rng()*6.28; scene.add(o); }
      const nR = Math.round((d.rock||0)*5);
      for(let k=0;k<nR;k++){ const src=(rng()<0.5&&loaded['rock_b'])?loaded['rock_b']:loaded['rock_a']; if(!src) continue; const s=freeSpot(1.4); if(!s) continue; const o=src.clone(true); o.scale.setScalar(0.6+rng()*0.7); o.position.set(s[0],0,s[1]); o.rotation.y=rng()*6.28; scene.add(o); }
      const nP = Math.round((d.plot||0)*2);
      for(let k=0;k<nP && loaded['plot'];k++){ const s=freeSpot(1.6); if(!s) continue; const o=loaded['plot'].clone(true); o.position.set(s[0],0,s[1]); scene.add(o); }
      const nG = Math.round((d.grass||0)*22);
      for(let k=0;k<nG && loaded['grass_tuft'];k++){ const ang=rng()*6.28, rr=Math.sqrt(rng())*R; const o=loaded['grass_tuft'].clone(true); o.scale.setScalar(0.7+rng()*0.7); o.position.set(cx+Math.cos(ang)*rr,0,cz+Math.sin(ang)*rr); o.rotation.y=rng()*6.28; scene.add(o); }
      const nF = Math.round((d.flower||0)*14), GA=2.399963229728653;
      const fmat = new THREE.MeshStandardMaterial({roughness:1,metalness:0,flatShading:true});
      for(let k=0;k<nF;k++){ const rr=0.45*Math.sqrt(k+0.5), a=k*GA; const m=new THREE.Mesh(new THREE.IcosahedronGeometry(0.08,0), fmat.clone()); m.material.color.set(hx(['Coral','Blossom','GoldenYellow','Lavender','SoftCream'][(rng()*5)|0])); m.position.set(cx+Math.cos(a)*rr, 0.1, cz+Math.sin(a)*rr); scene.add(m); }
    }
    function renderGallery(){
      const ids = (MW.gallery||[]), n = ids.length, spacing = 12, rng = mulberry32(strSeed(WSEED,'gallery'));
      ids.forEach((id, i) => {
        const cx = (i-(n-1)/2)*spacing, cz = 0;
        if (id === 'landmark_farm'){ placeCluster(cx, cz); }
        else if (MW.modules[id]){ populatePatch(MW.modules[id], cx, cz, 5, rng); }
        const pts=[]; for(let k=0;k<=40;k++){ const a=k/40*Math.PI*2; pts.push(new THREE.Vector3(cx+Math.cos(a)*6, 0.05, cz+Math.sin(a)*6)); }
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color:'#5a4a30' })));
      });
      console.log('[gallery] modules:', ids.join(', '));
    }

    // ---- placement record (B4 clumping index): scattered trees/rocks, excluding the
    //      fixed farm cluster. Dumped by capture.mjs to proof/_shots/placements*.json.
    const PLACED = { seed: WSEED, trees: [], rocks: [] };
    window.__placements = PLACED;

    // ---- world placement sampling (deterministic) ----
    const PATHPTS = PATH_SAMPLES;
    function distToPath(x,z){ let m=1e9; for(const p of PATHPTS){ const dx=p[0]-x, dz=p[1]-z, d=dx*dx+dz*dz; if(d<m)m=d; } return Math.sqrt(m); }
    function modDensity(x,z,key){ const c=cellAt(x,z); if(!c || c.module==='landmark_farm') return 0; const m=MW.modules[c.module]; return (m && m.density && m.density[key]) || 0; }
    function poisson(R, minSep, suit, rng, maxCount){
      // never sample beyond the height grid (minus the slope/cliff probe reach): the
      // island-sized worldRadius (112) used to throw in the legacy 120u ?view=test grid
      if (GRID) R = Math.min(R, GRID.size/2 - 4);
      const cell=minSep/Math.SQRT2, grid=new Map(), key=(a,b)=>a+','+b, pts=[], tries=maxCount*40;
      for (let i=0;i<tries && pts.length<maxCount;i++){
        const ang=rng()*Math.PI*2, rr=Math.sqrt(rng())*R, x=Math.cos(ang)*rr, z=Math.sin(ang)*rr;
        const s=suit(x,z); if (s<=0 || rng()>s) continue;
        const cx=Math.floor(x/cell), cz=Math.floor(z/cell); let ok=true;
        for (let dx=-2;dx<=2 && ok;dx++) for (let dz=-2;dz<=2;dz++){ const arr=grid.get(key(cx+dx,cz+dz)); if(arr) for(const q of arr){ const ddx=q[0]-x, ddz=q[1]-z; if(ddx*ddx+ddz*ddz<minSep*minSep){ ok=false; break; } } }
        if(!ok) continue;
        pts.push([x,z]); const k=key(cx,cz); let a=grid.get(k); if(!a){ a=[]; grid.set(k,a); } a.push([x,z]);
      }
      return pts;
    }

    // trees: suitability-weighted blue noise; species from the host module.
    function treeDistribution(){
      const V=L.vegetation, T=V.trees, rng=mulberry32(strSeed(V.seed,'trees')), pine=makePine();
      const suit=(x,z)=>{ if(TH(x,z)<=MISTLINE) return 0; if(Math.hypot(x,z)<V.farmExclusion) return 0; if(distToPath(x,z)<V.pathClearance) return 0; if(slopeAt(x,z)>V.maxTreeSlope) return 0;
        let s = modDensity(x,z,'tree') * forestMask(x,z);                                   // CLUMPS + CLEARINGS
        if (s>0 && slopeAt(x,z)<0.35 && nearCliff(x,z,3.0)>0.5) s = Math.min(1, s*1.7 + 0.22); // cliff-TOP tree clusters
        return s; };
      for (const [x,z] of poisson(V.worldRadius, T.minSep, suit, rng, T.maxCount)){
        const mod = (cellAt(x,z)||{}).module;
        // species chosen PER CLUMP (slow speciesField + region bias) -> a clump is mostly one species
        const spThr = mod==='comp_grove' ? 0.36 : mod==='comp_rocky' ? 0.56 : 0.64;
        const usePine = (speciesField(x,z) > spThr);
        let o;
        if (usePine || !loaded['tree_round_a']){ o=pine.clone(true); o.scale.setScalar(T.pine.scaleMin+rng()*T.pine.scaleRange); }
        else { o=loaded['tree_round_a'].clone(true);
          o.scale.set((T.broad.scaleMin+rng()*T.broad.scaleRange)*(T.broad.widthMin+rng()*T.broad.widthRange), T.broad.heightMin+rng()*T.broad.heightRange, T.broad.scaleMin+rng()*T.broad.scaleRange);
          o.traverse(m=>{ if(m.isMesh) m.castShadow=false; }); }
        o.position.set(x, TH(x,z), z); o.rotation.y=rng()*Math.PI*2; scene.add(o);
        PLACED.trees.push({ x: +x.toFixed(2), z: +z.toFixed(2), species: (usePine || !loaded['tree_round_a']) ? 'pine' : 'broad' });
      }
    }

    function understory(){
      const V=L.vegetation, U=V.understory; if(!loaded['bush_a']) return;
      const rng=mulberry32(strSeed(V.seed,'understory'));
      const suit=(x,z)=>{ if(TH(x,z)<=MISTLINE) return 0; if(Math.hypot(x,z)<V.farmExclusion) return 0; if(distToPath(x,z)<V.pathClearance) return 0; if(slopeAt(x,z)>V.maxVegSlope) return 0; return modDensity(x,z,'bush') * (0.45 + 0.55*forestMask(x,z)); };
      for (const [x,z] of poisson(V.worldRadius, U.minSep, suit, rng, U.maxCount)){
        const o=loaded['bush_a'].clone(true); o.scale.setScalar(U.scaleMin+rng()*U.scaleRange);
        o.position.set(x,TH(x,z),z); o.rotation.y=rng()*Math.PI*2; o.traverse(m=>{ if(m.isMesh) m.castShadow=false; }); scene.add(o);
      }
    }

    // free rocks in rocky modules + on slopes (seats them at the cliff bases).
    function placeRocks(){
      const src0 = loaded['rock_a'] || loaded['rock_b']; if(!src0) return;
      const V=L.vegetation, RK=V.rocks, rng=mulberry32(strSeed(V.seed,'rocks'));
      const suit=(x,z)=>{ if(TH(x,z)<=MISTLINE) return 0; if(Math.hypot(x,z)<V.farmExclusion) return 0; if(distToPath(x,z)<V.pathClearance*0.7) return 0;
        const base = modDensity(x,z,'rock');
        const cliffBase = GT.smoothstep(0.45,0.85, nearCliff(x,z,2.4)) * (1 - GT.smoothstep(0.75,1.15, slopeAt(x,z)));  // at the FOOT of a cliff, not on its face
        return Math.min(1, base*(0.4 + 0.9*cliffBase) + cliffBase*0.5); };
      for (const [x,z] of poisson(V.worldRadius, RK.minSep, suit, rng, RK.maxCount)){
        const src = (rng()<0.5 && loaded['rock_b']) ? loaded['rock_b'] : src0;
        const o=src.clone(true); const s=RK.scaleMin+rng()*RK.scaleRange; o.scale.setScalar(s);
        o.position.set(x,TH(x,z),z); o.rotation.y=rng()*Math.PI*2; o.traverse(m=>{ if(m.isMesh){ m.castShadow=false; m.receiveShadow=true; } }); scene.add(o);
        contact(x,z,1.0*s+0.3,0.9*s+0.3);
        PLACED.rocks.push({ x: +x.toFixed(2), z: +z.toFixed(2) });
      }
    }

    // ground cover: grass dense near farm, wildflowers patchy near beds + path.
    function groundCover(){
      const GC = L.vegetation.groundCover, VSEED = L.vegetation.seed;
      if (loaded['grass_tuft']){
        const src = firstMesh(loaded['grass_tuft']);
        if (src){
          const G = GC.grass, rng = mulberry32(strSeed(VSEED, 'grass'));
          const suit = (x,z) => { if(TH(x,z)<=MISTLINE) return 0; const r=Math.hypot(x,z); if(r<2) return 0; if(slopeAt(x,z)>L.vegetation.maxVegSlope) return 0;
            let s = modDensity(x,z,'grass') + Math.max(0, 1 - r/G.farmRadius)*G.farmBoost*0.5 + G.openBase;
            const dpg = distToPath(x,z); if (dpg < PATH_CORE) return 0;   // PASS A: corridor kept clear
            if (dpg < G.pathThin) s *= 0.15; return Math.min(1, s); };
          const pts = poisson(L.vegetation.worldRadius, G.minSep, suit, rng, G.maxCount);
          const im = new THREE.InstancedMesh(src.geometry, makeSway(src.material), pts.length), d = new THREE.Object3D();
          pts.forEach((p,i)=>{ d.position.set(p[0], TH(p[0],p[1]), p[1]); d.rotation.set(0, rng()*Math.PI*2, 0); d.scale.setScalar(G.scaleMin+rng()*G.scaleRange); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
          im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = false; scene.add(im);
        }
      }
      const WF = GC.wildflower, rng = mulberry32(strSeed(VSEED, 'flowers')), pos = [];
      const GA = 2.399963229728653;
      for (const b of WF.beds) for (let i=0;i<WF.goldenPerBed;i++){ const rr=0.4*Math.sqrt(i+0.5), a=i*GA, fx=b[0]+Math.cos(a)*rr, fz=b[1]+Math.sin(a)*rr;
        if (distToPath(fx,fz) < PATH_CORE*0.8) continue;                                      // PASS A: no bed flowers on the porch path
        pos.push([fx, fz]); }
      const suit = (x,z) => { if(TH(x,z)<=MISTLINE) return 0; if(slopeAt(x,z)>L.vegetation.maxVegSlope) return 0;
        let s = modDensity(x,z,'flower') * driftMask(x,z);                                  // meadow flowers in DRIFTS
        // PASS A: nothing ON the corridor; a thin flower fringe just OUTSIDE its soft edge
        // (the Stage-2 rule peaked at the path centre line, i.e. flowers on the path)
        const dp=distToPath(x,z); if (dp < PATH_CORE) return 0; if(dp<PATH_CORE+WF.pathBand) s+=(1-(dp-PATH_CORE)/WF.pathBand)*0.5;
        for(const b of WF.beds){ const d=Math.hypot(x-b[0],z-b[1]); if(d<WF.bedRadius) s+=(1-d/WF.bedRadius)*0.9; }
        if(WF.fields) for(const fl of WF.fields){ const d=Math.hypot(x-fl[0],z-fl[1]); if(d<fl[2]) s+=(1-d/fl[2])*(fl[3]||0.8); }  // wildflower FIELDS
        return Math.min(1, s); };
      for (const p of poisson(L.vegetation.worldRadius, WF.minSep, suit, rng, Math.max(0, WF.maxCount - pos.length))) pos.push(p);
      const fgeo = new THREE.IcosahedronGeometry(0.075, 0), fmat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
      const im = new THREE.InstancedMesh(fgeo, fmat, pos.length), d = new THREE.Object3D(), c = new THREE.Color();
      pos.forEach((p,i)=>{ d.position.set(p[0], TH(p[0],p[1])+WF.yOffset, p[1]); d.scale.setScalar(WF.scaleMin+rng()*WF.scaleRange); d.updateMatrix(); im.setMatrixAt(i, d.matrix); c.set(hx(WF.colorTokens[(rng()*WF.colorTokens.length)|0])); im.setColorAt(i, c); });
      im.instanceColor.needsUpdate = true; im.castShadow = false; scene.add(im);
    }

    // optional dev overlay (?debug=1 or ?view=wire): assembled cells coloured by
    // module, height tag = tier, a 'C' marker on cliff cells, + farm-exclusion ring.
    function debugOverlay(){
      const V = L.vegetation;
      const ring = (cx,cz,r,colHex) => { const pts=[]; for(let i=0;i<=48;i++){ const a=i/48*Math.PI*2, x=cx+Math.cos(a)*r, z=cz+Math.sin(a)*r; pts.push(new THREE.Vector3(x, TH(x,z)+0.1, z)); } scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colHex }))); };
      ring(0,0,V.farmExclusion,'#ff3366');
      const mcol = { landmark_farm:'#ffffff', comp_cultivated:'#e8c15a', comp_meadow:'#a8d96b', comp_grove:'#2f7a42', comp_rocky:'#9c8c74' };
      for (const c of WORLD.cells){
        const m=new THREE.Mesh(new THREE.SphereGeometry(c.cliff?0.75:0.55,8,6), new THREE.MeshBasicMaterial({ color: c.cliff?'#d8503a':(mcol[c.module]||'#ff00ff') }));
        m.position.set(c.cx, TH(c.cx,c.cz)+0.7+c.tier*0.35, c.cz); scene.add(m);
        const stem=[new THREE.Vector3(c.cx, TH(c.cx,c.cz), c.cz), new THREE.Vector3(c.cx, TH(c.cx,c.cz)+0.7+c.tier*0.35, c.cz)];
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(stem), new THREE.LineBasicMaterial({ color:'#222222' })));
      }
      console.log('[debug] seed', WSEED, '| cells', WORLD.cells.length, '| tiers', WORLD.cells.map(c=>c.tier).join(''), '| maxΔtier', GT.maxNeighbourTierDelta(built));
      console.table(WORLD.cells.map(c=>({ x:Math.round(c.cx), z:Math.round(c.cz), tier:c.tier, cliff:!!c.cliff, module:c.module, ring:c.ring })));
    }

    function initSmoke(pos){
      const S = L.ambient.smoke, puffs = [];
      for (let i=0;i<S.puffs;i++){
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(S.size,0),
          new THREE.MeshStandardMaterial({ color: col(S.colorToken), transparent:true, opacity:0, roughness:1, flatShading:true }));
        m.material.fog = false; scene.add(m); puffs.push({ m, t: i/S.puffs });
      }
      return { base: pos, puffs };
    }

    // ---- load models (.wasm == GLB bytes) ----
    const dl = new GLTFLoader();
    let remaining = CFG.assets.length;
    const DEBUG = QS.get('debug') || WIRE;
    const done = () => { if (--remaining === 0){
      if (GALLERY){ renderGallery(); }
      else { placeCluster(); treeDistribution(); understory(); placeRocks(); groundCover(); if (DEBUG) debugOverlay(); }
      window.__ready = true;
    } };
    CFG.assets.forEach((a) => {
      dl.load(a.file, (gltf) => { loaded[a.id] = gltf.scene; done(); },
        undefined, (err) => { console.error('Failed to load ' + a.file, err); done(); });
    });

    // ---- legend ----
    const list = document.getElementById('legend-list');
    CFG.assets.forEach((a) => { const li = document.createElement('li');
      li.innerHTML = '<span class="id">'+a.id+'</span><span class="tris">'+a.tris.toLocaleString()+'</span>'; list.appendChild(li); });

    // ---- auto-spin ----
    const spinBtn = document.getElementById('spin');
    spinBtn.addEventListener('click', () => { controls.autoRotate = !controls.autoRotate;
      spinBtn.setAttribute('aria-pressed', String(controls.autoRotate));
      spinBtn.textContent = 'Auto-spin: ' + (controls.autoRotate ? 'on' : 'off'); });

    window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); positionCamera(); });

    // ---- deterministic screenshot helper (used for proof shots) ----
    // window.__saveShot(name, {w,h,az,el,dist,target,mode,fov}) renders one frame at
    // the given size/camera and POSTs the PNG to /shot/<name> (the shot server),
    // then restores the live view. Returns a promise. GAME PARITY: fov defaults to
    // the game's 30; mode 'gameplay' applies (and checks) the game clamp, dist 'rig'
    // = CameraRig framing for this aspect; 'photo' = free orbit. Fog + sky follow.
    window.__saveShot = function(name, o){
      o = o || {};
      const w = o.w || window.innerWidth, h = o.h || window.innerHeight;
      renderer.setSize(w, h, false); camera.aspect = w/h;
      const M = L.camera, mode = o.mode === 'gameplay' ? 'gameplay' : 'photo';
      let az = o.az != null ? o.az : M.azimuthDeg;
      let el = o.el != null ? o.el : (o.mobile ? M.elevationDegMobile : M.elevationDeg);
      let dist = (o.dist == null || o.dist === 'rig') ? rigDistance(w/h) : o.dist;
      let tgt = o.target || (o.mobile ? M.targetMobile : M.target);
      camera.fov = (o.fov != null) ? o.fov : RC.fov;
      if (mode === 'gameplay' && !inClamp(az, el, dist)){
        console.warn('[clamp] gameplay preset ' + name + ' is outside the game camera clamp (az ' + az + ', el ' + el + ', dist ' + dist + ')');
        (window.__clampViolations = window.__clampViolations || []).push(name);
      }
      applyMode(mode);
      placeCamera(az, el, dist, tgt);
      camera.updateProjectionMatrix(); controls.update(); syncFrame();
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      renderer.setSize(window.innerWidth, window.innerHeight, false); positionCamera(); syncFrame();
      return fetch('/shot/' + name, { method:'POST', headers:{'Content-Type':'text/plain'}, body: url })
        .then(r => r.ok ? ('saved ' + name) : ('HTTP ' + r.status)).catch(e => 'ERR ' + e);
    };

    // ---- render loop + ambient life ----
    const CS = L.ambient.canopySway, CD = L.ambient.cloudDrift, SM = L.ambient.smoke;
    const clock = new THREE.Clock();
    function tick(){
      requestAnimationFrame(tick);
      const t = clock.getElapsedTime();
      sway.uTime.value = t;
      cloudGroup.position.x = Math.sin(t*CD.speed)*CD.amp;
      for (let i=0;i<canopies.length;i++) canopies[i].rotation.z = Math.sin(t*CS.speed + i)*CS.amp;
      if (smoke){
        for (const p of smoke.puffs){
          p.t += SM.rate; if (p.t > 1) p.t -= 1;
          const e = p.t;
          p.m.position.set(smoke.base.x + Math.sin(e*5)*SM.driftX*e, smoke.base.y + e*SM.rise, smoke.base.z + Math.cos(e*4)*SM.driftZ*e);
          p.m.scale.setScalar(SM.baseScale + e*SM.growth);
          p.m.material.opacity = Math.sin(Math.min(e,1)*Math.PI) * SM.opacity;
        }
      }
      controls.update(); syncFrame();
      renderer.render(scene, camera);
    }

    // ---- deterministic comparison-render DRIVER (?capture=prefix) ----------
    // Renders every named camera preset from window.__WORLD3__.cameras via
    // __saveShot, in a fixed order, then sets window.__captureDone. Appends a
    // _seed<N> suffix for any non-default island seed so both seeds coexist.
    (function captureDriver(){
      const CAP = QS.get('capture'); if (!CAP || !(W3.cameras)) return;
      const ONLY = QS.get('only') ? new Set(QS.get('only').split(',')) : null;   // ?only=a,b -> subset of presets
      const order = Object.keys(W3.cameras || {}).filter(n => !ONLY || ONLY.has(n));
      const defSeed = ((W3.seeds && W3.seeds.default) || (MW.world && MW.world.seed)) >>> 0;
      const suffix = (WSEED === defSeed) ? '' : ('_seed' + WSEED);
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      (async () => {
        for (let i=0;i<800 && !window.__ready;i++) await sleep(50);
        await sleep(500);
        let n = 0;
        for (const name of order){ const c = W3.cameras[name]; if (!c) continue;
          await window.__saveShot(CAP + '_' + name + suffix, { w:c.w, h:c.h, az:c.az, el:c.el, dist:c.dist, target:c.tgt, mobile:c.mobile, fov:c.fov, mode:c.mode });
          n++; await sleep(140);
        }
        window.__captureDone = n;
        console.log('[capture] done ' + n + ' shots, prefix=' + CAP + ' seed=' + WSEED);
      })();
    })();
    tick();
    }   // end legacyMain
  </script>
  <script type="module">
    // ---- ARCHIPELAGO: the blueprint island from docking pieces (default world) ----
    import * as THREE from 'three';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
${adapter}
${arch}
  </script>
${save ? `  <script>/* lib/look-save.mjs inlined (pure, node-tested) -> window.__LOOK_SAVE__ (the panel's Save & share logic) */
  window.__LOOK_SAVE__ = (function(){
${save}
    return LS;
  })();
  </script>
` : ''}  <script type="module">
    // ---- the LOOK panel (lil-gui; lookPresets.json presets, Save / Load) ----
${panel}
  </script>
</body>
</html>
`;
}
