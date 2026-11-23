// arch-scene.js -- THE BLUEPRINT ISLAND proof scene (spec v3.1). Plain browser module code, inlined by
// build.mjs into proof/index.html after the three.js imports and lib/islandAdapter.mjs (so THREE,
// GLTFLoader, OrbitControls, buildIslandGeometry, pieceGroup are in scope). Layout numbers come from
// window.__WORLD3__.archipelago (world.config.mjs) + palette tokens from window.__LOOK__ (look.config.mjs);
// EVERY LOOK VALUE (lights, sky, fog, shadows, tone mapping, clouds, water colours, wind) comes from the
// selected preset of window.__LOOK_PRESETS__ (art/config/lookPresets.json, schema lookPresets.schema.json);
// the terrain math is the inlined, node-tested core window.__GT__ (lib/terrain.mjs).
// URL: ?look=<preset>  ?hour=H (TIME OF DAY: the mood keyframes blended at hour H, look core)  ?look=Game (current)&hour=H or
//      ?gamehour=H (Game (current) under the game day cycle at hour H)  ?light=proof (= ?look=Proof warm (v4))  ?quality=low|high
//      ?tone=None|AgX|Neutral|...  ?view=full|farm|lake|waterfall|junction|woodland|edge  ?stats=1  ?diag=gl
//      ?unlocked=main|all|a,b  ?dock=<piece>&t=0..1  ?debug=1  ?water=0  ?preset=<camera>  ?photo=1  ?seed=N
//      ?capture=<prefix>&only=a,b  ?masks=1  ?ui=0  ?shot=1  ?diag=albedo|shade  ?world=legacy
//      device A/B (rainbow-noise diagnosis, all default off): ?nodither=1 ?precision=mediump|highp ?aa=0 ?pdb=0 ?pr=<max pixel ratio>
// LOOK CORE (WORLDSEED-BRIEF, lib/look-core.mjs = window.__LOOK_CORE__): painted sky + cloud sea (sky.mode 'painted', sky.paint),
// cel-banded Lambert (preset cel, chained onBeforeCompile patches), ONE composite pass (post.composite / ink / bloom / grade /
// vignette: depth ink, Neutral tone mapping once, selective bloom, split-tone grade, sRGB once), a time-of-day scalar (?hour=,
// panel slider) and the seam lip fix (grass.seamMatch). Quality tiers: high = composite on, low (?quality=low) = plain path.
(function archMain() {
  if (!window.__ARCH__) return;
  const L = window.__LOOK__, P = L.palette, W3 = window.__WORLD3__, A = W3.archipelago, GT = window.__GT__, CFG = window.__GITAWAY_SCENE__ || { assets: [] };
  const LC = window.__LOOK_CORE__;
  const QS = new URLSearchParams(location.search);
  if (QS.get('ui') === '0') document.body.classList.add('noui');
  const DEBUG = QS.get('debug') === '1', WATER = QS.get('water') !== '0', DIAG = QS.get('diag');
  const SEED = QS.get('seed') != null ? (parseInt(QS.get('seed'), 10) >>> 0) : (A.seeds.default >>> 0);
  const DEG = Math.PI / 180, col = (t) => new THREE.Color(P[t]), hash01 = (x, z) => GT.hash3(Math.round(x * 100), Math.round(z * 100), 77);

  // ---- LOOK: resolve the preset (?look= / ?light=proof / ?hour=H / default) from lookPresets.json ----
  const LP = window.__LOOK_PRESETS__, VIEWS = { ...(A.views || {}), ...(A.waterViews || {}) }, FULL_AZ = VIEWS.full ? VIEWS.full.az : 0;
  const cloneLook = (o) => JSON.parse(JSON.stringify(o));
  function dayCycleAt(hour) {   // skyPalette.ts skyAt(), verbatim logic (colours lerped in linear space like THREE.Color.lerp)
    const DC = LP.dayCycle, keys = DC.keys.map(([h, k]) => [h, k === 'night' ? DC.night : k]);
    const h = ((hour % 24) + 24) % 24; let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] <= h) i++;
    const [h0, a] = keys[i], [h1, b] = keys[i + 1], raw = h1 > h0 ? (h - h0) / (h1 - h0) : 0, t = raw * raw * (3 - 2 * raw);
    const mix = (k) => '#' + new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHexString(), num = (k) => a[k] + (b[k] - a[k]) * t;
    const day = Math.min(1, Math.max(0, (h - 6) / 14)), isNight = h < 5.6 || h > 21, dir = new THREE.Vector3();
    if (isNight) dir.set(Math.cos(0.9) * Math.cos(0.95), Math.sin(0.95), Math.sin(0.9) * Math.cos(0.95));
    else { const az = -1.05 + day * 3.5, el = 0.28 + Math.sin(Math.PI * day) * 0.85; dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)); }
    dir.normalize();
    return { top: mix('top'), mid: mix('mid'), bottom: mix('bottom'), fog: mix('fog'), sun: mix('sun'), sunI: num('sunI'), hemiSky: mix('hemiSky'), hemiGround: mix('hemiGround'), hemiI: num('hemiI'),
      elevationDeg: Math.asin(dir.y) / DEG, bearingDeg: Math.atan2(dir.x, dir.z) / DEG };
  }
  function dayCyclePreset(hour) {   // 'Game (current)' with the day-cycle-driven values at this hour (DayCycle.tsx apply())
    const p = cloneLook(LP.presets['Game (current)']), k = dayCycleAt(hour);
    Object.assign(p.sun, { color: k.sun, intensity: k.sunI, elevationDeg: k.elevationDeg, azimuthDeg: ((k.bearingDeg - FULL_AZ + 540) % 360) - 180, distance: LP.dayCycle.sunDistance });
    Object.assign(p.hemisphere, { sky: k.hemiSky, ground: k.hemiGround, intensity: k.hemiI });
    Object.assign(p.sky, { zenith: k.top, horizon: k.mid, sunSideHorizon: k.mid, below: k.bottom }); p.fog.color = k.fog;
    p.description = `Game (current) under the game day cycle at ${hour} h (skyPalette.ts).`;
    return p;
  }
  // TIME OF DAY (look core): the mood presets are keyframes on a 0-24 h scalar (LP.timeOfDay); every look value blends between the
  // two neighbouring keyframes (lib/look-core.mjs presetAtHour). This is the structure the game's day cycle would adopt.
  const hourName = (h) => `Time ${(+h).toFixed(2)} h`;
  function resolveLook() {
    let name = QS.get('look') || (QS.get('light') === 'proof' ? 'Proof warm (v4)' : LP.default);
    if (!LP.presets[name] || LP.presets[name].status !== 'active') { console.warn('[look] no active preset "' + name + '" -> ' + LP.default); name = LP.default; }
    let preset = cloneLook(LP.presets[name]);
    const hq = QS.get('hour'), gh = QS.get('gamehour');
    if (gh != null || (hq != null && name === 'Game (current)' && QS.get('look'))) { const h = parseFloat(gh != null ? gh : hq); preset = dayCyclePreset(h); name = `Game @ ${h}h`; }
    else if (hq != null && !QS.get('look') && QS.get('light') !== 'proof' && LC) { const h = parseFloat(hq); preset = LC.presetAtHour(LP, h).preset; name = hourName(h); }
    if (QS.get('tone')) preset.renderer.toneMapping = QS.get('tone');   // A/B override
    return { name, preset };
  }
  const LOOK = resolveLook();
  const QUALITY = QS.get('quality') === 'low' ? 'low' : QS.get('quality') === 'high' ? 'high' : null;   // device tier override of post.composite
  console.log('[look] preset', LOOK.name + (QUALITY ? ' (quality ' + QUALITY + ')' : ''));

  // ---- CHAINED SHADER PATCHES: every onBeforeCompile goes through addPatch(material, key, fn), so the cel patch, the underside
  //      haze, the canopy gradient / lift, the cloud shading, the instance tints etc. compose instead of overwriting each other.
  //      Each key is applied once per material; customProgramCacheKey = the joined keys. (A WeakMap, not userData: clone()
  //      JSON-copies userData and would drop the functions.) ----
  const PATCHES = new WeakMap();
  function addPatch(m, key, fn) {
    if (!m) return false; let list = PATCHES.get(m);
    if (!list) { list = []; PATCHES.set(m, list); m.onBeforeCompile = (sh, r) => { for (const p of list) p.fn(sh, r); }; m.customProgramCacheKey = () => list.map((p) => p.key).join('|'); }
    if (list.some((p) => p.key === key)) return false;
    list.push({ key, fn }); m.needsUpdate = true; return true;
  }
  window.__patchKeys = (m) => (PATCHES.get(m) || []).map((p) => p.key);
  // display-referred colours (fog-like mixes after tone mapping) on both paths: see lib/look-core.mjs DISPLAY_GLSL
  const LCU = { uLcExposure: { value: 1 } };
  // 2-D value noise for the plants-stage shader detail (path tone, cliff strata): texture-free (the iOS mip-chain rule)
  const NOISE_GLSL = 'float lkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n' +
    'float lkNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lkHash(i), lkHash(i + vec2(1.0, 0.0)), f.x), mix(lkHash(i + vec2(0.0, 1.0)), lkHash(i + vec2(1.0, 1.0)), f.x), f.y); }\n';

  // ---- build: parent heightfield + pieces + composition (deterministic) ----
  const T0 = performance.now();
  const BP = GT.buildBlueprint(A, L, { seed: SEED });
  const COMP = GT.composeBlueprint(BP, L);
  window.__blueprint = BP; window.__composition = COMP;
  console.log('[blueprint] seed', SEED, 'built in', Math.round(performance.now() - T0), 'ms; pieces', BP.order.join(','));

  const parseUnlocked = (s) => { if (!s || s === 'all') return new Set(BP.order); const set = new Set(['main']); if (s === 'main') return set; for (const id of s.split(',')) if (BP.pieces[id]) set.add(id); return set; };
  let UNLOCKED = parseUnlocked(QS.get('unlocked') || A.defaultUnlocked);
  let DOCK = QS.get('dock') ? { piece: QS.get('dock'), t: parseFloat(QS.get('t') || '0.5') } : null;

  // ---- renderer (game parity under 'Game (current)': <Canvas flat> = NoToneMapping, sRGB output, colour management on).
  //      Tone mapping / exposure / output space / pixel ratio / shadow type come from the preset (applyLook). The context
  //      flags below are DEVICE A/B switches for the rainbow-noise diagnosis (AUDIT.md); all default to today's values.
  const app = document.getElementById('app');
  const CTX = { antialias: QS.get('aa') !== '0', preserveDrawingBuffer: QS.get('pdb') !== '0' };   // (three always requests an alpha context)
  if (['highp', 'mediump', 'lowp'].includes(QS.get('precision'))) CTX.precision = QS.get('precision');
  const renderer = new THREE.WebGLRenderer(CTX);
  const PR_CAP = () => (QS.get('pr') ? parseFloat(QS.get('pr')) : LOOK.preset.renderer.maxPixelRatio);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PR_CAP())); renderer.setSize(window.innerWidth, window.innerHeight);
  if (QS.get('nodither') === '1') renderer.getContext().disable(renderer.getContext().DITHER);   // three never touches GL_DITHER (default ON)
  THREE.ColorManagement.enabled = true;
  renderer.shadowMap.enabled = true;
  app.appendChild(renderer.domElement);
  const scene = new THREE.Scene();

  // ---- lighting: one shadow-casting sun + hemisphere fill + ambient, built EMPTY and set by applyLook(preset) ----
  const hemi = new THREE.HemisphereLight(); scene.add(hemi);
  const amb = new THREE.AmbientLight(); scene.add(amb);
  const sun = new THREE.DirectionalLight(); scene.add(sun); scene.add(sun.target);
  sun.target.position.set(0, 0, 0);
  const _box = new THREE.Box3(), _sph = new THREE.Sphere(), _ob = new THREE.Box3(), _pt = new THREE.Vector3(), _ctr = new THREE.Vector3(), _lc = new THREE.OrthographicCamera();
  const SUN_DIR = new THREE.Vector3(0, 1, 0);   // unit vector toward the sun (applyLook: preset sun.elevationDeg / azimuthDeg)
  // fitShadow(): places the sun at target + SUN_DIR x distance and sizes the ONE shadow camera (preset shadows.fit):
  //   fixed  = the game's box (half-size frustum.main alone / frustum.all once any piece is docked), centred on the origin
  //   bounds = the visible pieces' bounding sphere + fitMargin
  //   tight  = LIGHT-SPACE bounds: every visible mesh on a visible piece (terrain, underside, trees, props, rocks, paths) that
  //            casts or receives shadows -> its world box corners in the sun's view -> left / right / top / bottom / near / far
  //            + fitMargin. Low suns throw long shadows; every caster and receiver is inside, so are their shadows.
  //   Re-run on every unlock / dock change and look change (not per frame).
  function fitShadow() {
    const S = LOOK.preset.shadows, SN = LOOK.preset.sun, sc = sun.shadow.camera, fit = S.fit;
    let f = UNLOCKED.size > 1 ? S.frustum.all : S.frustum.main, dist = SN.distance; _ctr.set(0, 0, 0); _box.makeEmpty();
    if (fit === 'bounds' || fit === 'tight') { for (const id of BP.order) if (PG[id] && PG[id].group.visible !== false) _box.expandByObject(fit === 'tight' ? PG[id].group : PG[id].mesh);
      if (!_box.isEmpty()) { _box.getBoundingSphere(_sph); _ctr.copy(_sph.center); f = _sph.radius + S.fitMargin; dist = Math.max(SN.distance, _sph.radius + S.fitMargin + S.near); } }
    sun.target.position.copy(_ctr); sun.position.copy(SUN_DIR).multiplyScalar(dist).add(_ctr);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    if (fit === 'tight' && !_box.isEmpty()) {
      _lc.position.copy(sun.position); _lc.lookAt(_ctr); _lc.updateMatrixWorld();   // = DirectionalLightShadow.updateMatrices (up +y)
      const inv = _lc.matrixWorldInverse, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], m = S.fitMargin;
      for (const id of BP.order) { const g = PG[id] && PG[id].group; if (!g || g.visible === false) continue;
        g.traverseVisible((o) => { if (!o.isMesh || !(o.castShadow || o.receiveShadow)) return; _ob.makeEmpty().expandByObject(o); if (_ob.isEmpty()) return;
          for (let k = 0; k < 8; k++) { _pt.set(k & 1 ? _ob.max.x : _ob.min.x, k & 2 ? _ob.max.y : _ob.min.y, k & 4 ? _ob.max.z : _ob.min.z).applyMatrix4(inv);
            lo[0] = Math.min(lo[0], _pt.x); lo[1] = Math.min(lo[1], _pt.y); lo[2] = Math.min(lo[2], _pt.z); hi[0] = Math.max(hi[0], _pt.x); hi[1] = Math.max(hi[1], _pt.y); hi[2] = Math.max(hi[2], _pt.z); } }); }
      sc.left = lo[0] - m; sc.right = hi[0] + m; sc.bottom = lo[1] - m; sc.top = hi[1] + m; sc.near = Math.max(S.near, -hi[2] - m); sc.far = -lo[2] + m + S.farPad;
    } else { sc.left = -f; sc.right = f; sc.top = f; sc.bottom = -f; sc.near = S.near; sc.far = SN.distance + 2 * f + S.farPad; }
    sc.updateProjectionMatrix();
  }

  // ---- sky: SCREEN-SPACE vertical gradient (= the game's CSS backdrop; written raw in sRGB). Stops = screen v of below / horizon / zenith ----
  //      (sky.dither: the same +/-0.5 / 255 hash dither as the dome; off in 'Game (current)', where the output is unchanged)
  const SKY_DITHER = 'uDither * (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5) / 255.0';   // interleaved gradient noise, monochrome
  const skyMat = new THREE.ShaderMaterial({ depthWrite: false, depthTest: false, fog: false,
    uniforms: { top: { value: new THREE.Vector3() }, mid: { value: new THREE.Vector3() }, bot: { value: new THREE.Vector3() }, stops: { value: new THREE.Vector3() }, uDither: { value: 0 } },
    vertexShader: 'varying float vY; void main(){ vY = position.y * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.99999, 1.0); }',
    // (display-referred: raw on the canvas; linearised with alpha 0 = sky for the composite's linear target, which skips its tone mapping)
    fragmentShader: 'varying float vY; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 stops; uniform float uDither; vec3 skyLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); } void main(){ vec3 c = vY > stops.y ? mix(mid, top, clamp((vY - stops.y) / (stops.z - stops.y), 0.0, 1.0)) : mix(bot, mid, clamp((vY - stops.x) / (stops.y - stops.x), 0.0, 1.0)); c += ' + SKY_DITHER + '; gl_FragColor = linearToOutputTexel(vec4(0.5)).r > 0.6 ? vec4(c, 1.0) : vec4(skyLin(max(c, 0.0)), 0.0); }' });
  const skyQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), skyMat); skyQuad.frustumCulled = false; skyQuad.renderOrder = -100; scene.add(skyQuad);

  // ---- sky DOME (LOOK-BRIEF phase 1; sky.mode 'dome'): a WORLD-SPACE vertical gradient on an inverted unit sphere centred on the
  //      camera (rotation only, pushed to the far plane, drawn first, no depth). Each pixel's view ray gives its elevation and its
  //      azimuth to the sun: above the horizon, horizon -> zenith over sky.dome.zenithElevDeg (curve sky.dome.exponent); the
  //      horizon colour warms from sky.horizon to sky.sunSideHorizon within sky.sunSideSpreadDeg of the sun's azimuth, the warmth
  //      fading out over sky.dome.sunWarmthElevDeg of elevation; below the horizon it fades to the pale sky.below haze over
  //      sky.dome.belowDepthDeg. Written raw in sRGB (display-referred, not tone mapped: three applies the fog colour the same way,
  //      after tone mapping), so fog.skyMatch makes the cloud sea melt into the horizon. sky.dither = +/-0.5 / 255 against banding. ----
  // SCREEN TINT (LOOK-BRIEF phase 2, preset sky.screenTint): in GAMEPLAY-camera views the clamped camera never sees the dome's
  // zenith (its top edge sits below the horizon), so the sky reads as pale haze; a screen-space vertical blend toward sky.zenith
  // from screen v `from` to `to` (strength) puts the zenith blue at the top of the screen, like the game's CSS sky. Photo /
  // free-orbit views keep the true dome (gameplayOnly). Screen v comes from the interpolated clip position (exact).
  const SKY_DOME_VS = 'varying vec3 vDir; varying vec4 vClip; void main(){ vDir = position; vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0); vClip = p; gl_Position = vec4(p.xy, p.w * 0.99999, p.w); }';
  const SKY_DOME_FS = `varying vec3 vDir; varying vec4 vClip;
    uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunHorizon; uniform vec3 uBelow; uniform vec3 uSunDir;
    uniform float uSpread; uniform float uZenithEl; uniform float uExp; uniform float uBelowDepth; uniform float uWarmEl; uniform float uDither;
    uniform float uScreenTint; uniform vec2 uTintRange;
    void main() {
      vec3 d = normalize(vDir);
      float el = asin(clamp(d.y, -1.0, 1.0)), hl = length(d.xz), sl = length(uSunDir.xz);
      float ca = (hl > 1e-5 && sl > 1e-6) ? dot(d.xz / hl, uSunDir.xz / sl) : -1.0;
      float w = (1.0 - smoothstep(0.0, uSpread, acos(clamp(ca, -1.0, 1.0)))) * (1.0 - smoothstep(0.0, uWarmEl, abs(el)));
      vec3 hor = mix(uHorizon, uSunHorizon, w);
      vec3 c = el >= 0.0 ? mix(hor, uZenith, pow(clamp(el / uZenithEl, 0.0, 1.0), uExp)) : mix(hor, uBelow, smoothstep(0.0, uBelowDepth, -el));
      float sv = vClip.y / vClip.w * 0.5 + 0.5;
      c = mix(c, uZenith, uScreenTint * smoothstep(uTintRange.x, uTintRange.y, sv));
      c += ${SKY_DITHER};
      gl_FragColor = vec4(c, 1.0);
    }`;
  const tintU = { uScreenTint: { value: 0 }, uTintRange: { value: new THREE.Vector2(0.4, 1) } };   // shared with the cloud deck
  // PAINTED SKY + CLOUD SEA (look core, sky.mode 'painted', preset sky.paint): the SAME camera-centred sphere, its fragment shader
  // (lib/look-core.mjs SKY_FS) is a superset of the dome above (uPainted 0 = the dome, exactly): a zenith / mid / horizon gradient
  // + a warm glow band toward the sun; overhead cumulus = a soft-max union of hemispherical puffs from a jittered cell grid (two
  // octaves, normals from the puff gradient, crisp shade / mid / lit bands + a narrow sunlit rim, fwidth-antialiased) on a plane
  // above the camera; a ring of towering stacks on the horizon; below the horizon a CLOUD SEA (the same puffs on the world plane
  // y = sea.y: periwinkle shade, cream caps, cast shadows toward the sun) fading into the horizon haze with distance. Drift = the
  // shared clock (frozen in captures). Procedural and texture-free (the iOS mip-chain bug); depthTest / fog off, not tone mapped
  // (display-referred), drawn first. sky.paint.lowDetail (and ?quality=low) = one octave, no cast shadows, no towers.
  const SKY_DOME_U = { uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uSunHorizon: { value: new THREE.Vector3() }, uBelow: { value: new THREE.Vector3() }, uSunDir: { value: SUN_DIR },
    uSpread: { value: 1 }, uZenithEl: { value: 1 }, uExp: { value: 1 }, uBelowDepth: { value: 1 }, uWarmEl: { value: 1 }, uDither: { value: 0 }, ...tintU,
    uPainted: { value: 0 }, uMid: { value: new THREE.Vector3() }, uMidEl: { value: new THREE.Vector2(0.3, 0) }, uGlow: { value: new THREE.Vector4() }, uGlowW: { value: new THREE.Vector2(0.1, 1) }, uDrift: { value: new THREE.Vector2() },
    uCu: { value: new THREE.Vector4() }, uCuShade: { value: new THREE.Vector3() }, uCuMid: { value: new THREE.Vector3() }, uCuLit: { value: new THREE.Vector3() }, uCuRim: { value: new THREE.Vector3() },
    uBands: { value: new THREE.Vector4() }, uTw: { value: new THREE.Vector4() }, uSea: { value: new THREE.Vector4() }, uSeaDeep: { value: new THREE.Vector3() }, uSeaShade: { value: new THREE.Vector3() },
    uSeaMid: { value: new THREE.Vector3() }, uSeaCap: { value: new THREE.Vector3() }, uSeaP: { value: new THREE.Vector4() }, uSeaB: { value: new THREE.Vector4(-0.3, -0.1, 0.8, 0) }, uSeaHaze: { value: new THREE.Vector3() }, uSeaFade: { value: new THREE.Vector2(400, 1200) }, uLow: { value: 0 }, uTime: { value: 0 } };
  const skyDomeMat = new THREE.ShaderMaterial({ depthWrite: false, depthTest: false, fog: false, side: THREE.BackSide, toneMapped: false,
    vertexShader: LC ? LC.SKY_VS : SKY_DOME_VS, fragmentShader: LC ? LC.SKY_FS : SKY_DOME_FS, uniforms: SKY_DOME_U });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyDomeMat); skyDome.name = 'skyDome'; skyDome.frustumCulled = false; skyDome.renderOrder = -100; skyDome.visible = false; scene.add(skyDome);
  // the dome's horizon colour along a view direction (= SKY_DOME_FS at elevation 0), as a THREE.Color: the 'view' fog colour
  const _hA = new THREE.Color(), _hB = new THREE.Color();
  function skyHorizonAlong(out, dir) {
    const SK = LOOK.preset.sky, hl = Math.hypot(dir.x, dir.z), sl = Math.hypot(SUN_DIR.x, SUN_DIR.z);
    const ca = hl > 1e-5 && sl > 1e-6 ? (dir.x * SUN_DIR.x + dir.z * SUN_DIR.z) / (hl * sl) : -1, x = Math.min(1, Math.max(0, Math.acos(Math.min(1, Math.max(-1, ca))) / (SK.sunSideSpreadDeg * DEG)));
    const w = 1 - x * x * (3 - 2 * x); _hA.set(SK.horizon).convertLinearToSRGB(); _hB.set(SK.sunSideHorizon).convertLinearToSRGB();
    return out.setRGB(_hA.r + (_hB.r - _hA.r) * w, _hA.g + (_hB.g - _hA.g) * w, _hA.b + (_hB.b - _hA.b) * w, THREE.SRGBColorSpace);
  }

  // ---- cloud sea (Backdrop.tsx CloudField algorithm) + a soft cloud deck + drift clouds + distant isles ----
  const SEA = A.sea;
  const cloudMat = new THREE.MeshLambertMaterial();   // Backdrop.tsx cloudMat; colours from the preset (clouds.*)
  // SUN-LIT CLOUD SHADING (LOOK-BRIEF phase 2, preset clouds.lit): a top -> underside gradient by the puff's local height (warm
  // cream tops, cool lavender-blue undersides), wrapped sun lighting (a softer terminator) and a silhouette fade toward the fog
  // colour (soft edges). uCloudLit = (strength, wrap, rim, 0); all 0 = the Backdrop.tsx Lambert puff unchanged.
  const cloudU = { uCloudTop: { value: new THREE.Vector3(1, 1, 1) }, uCloudUnder: { value: new THREE.Vector3(1, 1, 1) }, uCloudLit: { value: new THREE.Vector4(0, 0, 0, 0) } };
  cloudMat.userData.celKind = 'none';   // (its own wrapped-light patch; never cel-banded)
  addPatch(cloudMat, 'cloudLit', (sh) => { Object.assign(sh.uniforms, cloudU);
    sh.vertexShader = 'varying float vCloudH;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloudH = position.y;');
    sh.fragmentShader = 'uniform vec3 uCloudTop;\nuniform vec3 uCloudUnder;\nuniform vec4 uCloudLit;\nvarying float vCloudH;\n' + sh.fragmentShader
      .replace('#include <lights_lambert_pars_fragment>', THREE.ShaderChunk.lights_lambert_pars_fragment.replace('float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
        'float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + uCloudLit.y ) / ( 1.0 + uCloudLit.y ) );'))
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * mix(uCloudUnder, uCloudTop, smoothstep(-0.75, 0.85, vCloudH)), uCloudLit.x);')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\n#ifdef USE_FOG\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, uCloudLit.z * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0));\n#endif'); });
  const cloudGeo = new THREE.IcosahedronGeometry(1, 2);
  // CLOUD LAYOUT (LOOK-BRIEF phase 2, preset clouds.layout): every cluster of puffs is kept with its placement (Backdrop.tsx
  // CloudField, unchanged RNG), then the preset thins them (`keep` = deterministic share per cluster), clears a disc under the
  // island (`innerClear`) and the camera-side sector (`clearAzDeg` +/- `clearArcDeg`, out to `clearDist`; the gameplay camera
  // looks from azimuth 45 = atan2(z, x)), soft over `fade` u, and scales them. Evaluated in WORLD space after the sea's slow
  // spin, so drifting clusters shrink away as they enter the cleared zone (re-laid when the spin moved > 0.002 rad).
  const CLOUD_SETS = [];
  function cloudField(o, yRange) {
    const r = GT.gameRng(o.seed), total = o.count * 4, m = new THREE.InstancedMesh(cloudGeo, cloudMat, total), mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), clusters = [];
    let n = 0;
    for (let tries = 0; n < total && tries < o.count * 10; tries++) {
      const a = o.arc ? o.arc[0] + (r() * 2 - 1) * o.arc[1] : r() * Math.PI * 2, d = o.inner + r() * (o.outer - o.inner);
      const nearCam = Math.abs(Math.atan2(Math.sin(a - Math.PI / 4), Math.cos(a - Math.PI / 4))) < (o.clearArc || 1.15) && d < (o.clearDist || 42);
      if (nearCam && !o.arc) continue;
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d, cy = yRange[0] + r() * (yRange[1] - yRange[0]), k = o.scale * (0.7 + r() * 0.8);
      const cl = { c: [cx, cy, cz], k: GT.hash3(Math.round(cx * 10), Math.round(cz * 10), 991), puffs: [] };
      for (let j = 0; j < 4; j++) { const s = k * (0.6 + r() * 0.6) * (j === 0 ? 1.3 : 1); q.setFromEuler(new THREE.Euler(0, r() * Math.PI, 0));
        const p = new THREE.Vector3(cx + (r() - 0.5) * k * 2.4, cy + (r() - 0.3) * k * 0.3, cz + (r() - 0.5) * k * 1.6), sc = new THREE.Vector3(s, s * 0.42, s * 0.8);
        mtx.compose(p, q, sc); m.setMatrixAt(n++, mtx); cl.puffs.push({ p, q: q.clone(), s: sc, m: mtx.clone() }); }
      clusters.push(cl);
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; CLOUD_SETS.push({ m, clusters, lastRot: NaN, sig: null }); return m;
  }
  const seaGroup = new THREE.Group(); seaGroup.add(cloudField(SEA.field, SEA.cloudY)); scene.add(seaGroup); CLOUD_SETS[0].group = seaGroup;
  const driftGroup = new THREE.Group(); driftGroup.add(cloudField(SEA.drift, SEA.drift.y)); scene.add(driftGroup); CLOUD_SETS[1].group = driftGroup;
  const _cv = new THREE.Vector3(), _cs = new THREE.Vector3(), _cm = new THREE.Matrix4();
  function layoutClouds(force) {
    const Lc = LOOK.preset.clouds.layout, sig = JSON.stringify(Lc), neutral = Lc.keep >= 1 && !(Lc.innerClear > 0) && !(Lc.clearArcDeg > 0 && Lc.clearDist > 0) && Lc.scale === 1;
    for (const S of CLOUD_SETS) {
      const rot = S.group.rotation.y;
      if (!force && S.sig === sig && (neutral || Math.abs(rot - S.lastRot) < 0.002)) continue;
      S.sig = sig; S.lastRot = rot;
      const cr = Math.cos(rot), sr = Math.sin(rot), fade = Math.max(1e-3, Lc.fade); let n = 0;
      for (const cl of S.clusters) {
        let f = 1;
        if (!neutral) {
          const wx = cl.c[0] * cr + cl.c[2] * sr, wz = -cl.c[0] * sr + cl.c[2] * cr, d = Math.hypot(wx, wz);   // the cluster centre in world xz (group spins about y)
          if (cl.k >= Lc.keep) f = 0;
          if (f > 0 && Lc.innerClear > 0) f *= GT.smoothstep(Lc.innerClear - fade, Lc.innerClear, d);
          if (f > 0 && Lc.clearArcDeg > 0 && Lc.clearDist > 0) { const da = Math.abs(GT.angDiff(Math.atan2(wz, wx), Lc.clearAzDeg * DEG)) / DEG;
            f *= 1 - (1 - GT.smoothstep(Lc.clearArcDeg - 12, Lc.clearArcDeg, da)) * (1 - GT.smoothstep(Lc.clearDist - fade, Lc.clearDist, d)); }
          if (f < 1e-3) continue;
        }
        for (const pf of cl.puffs) {
          if (neutral) { S.m.setMatrixAt(n++, pf.m); continue; }
          const g = f * Lc.scale; _cv.set(cl.c[0] + (pf.p.x - cl.c[0]) * Lc.scale, pf.p.y, cl.c[2] + (pf.p.z - cl.c[2]) * Lc.scale); _cs.copy(pf.s).multiplyScalar(g);
          S.m.setMatrixAt(n++, _cm.compose(_cv, pf.q, _cs));
        }
      }
      S.m.count = n; S.m.instanceMatrix.needsUpdate = true;
    }
  }
  // radialDisc(radius, rings, segments): a horizontal (+y facing) disc whose ALPHA FALLOFF IS VERTEX ALPHA (4-component colour
  // attribute, rgb white): rings = [[r 0..1, alpha], ...] ascending from the centre [0, a0]; linear between rings like a canvas
  // radial gradient. TEXTURE-FREE on purpose (iOS rainbow-speckle fix): the deck used to sample a 256^2 sRGB CanvasTexture with
  // generated mipmaps, and Apple GPUs (WebKit / ANGLE-Metal) corrupt that mip chain, so the minified, grazing-angle deck read
  // garbage = rainbow speckle smeared along the horizon and in the haze under the island.
  function radialDisc(radius, rings, segments) {
    const pos = [0, 0, 0], cola = [1, 1, 1, rings[0][1]], idx = [];
    for (let k = 1; k < rings.length; k++) for (let s = 0; s < segments; s++) { const t = s / segments * Math.PI * 2, r = rings[k][0] * radius;
      pos.push(Math.cos(t) * r, 0, -Math.sin(t) * r); cola.push(1, 1, 1, rings[k][1]); }
    for (let s = 0; s < segments; s++) idx.push(0, 1 + s, 1 + (s + 1) % segments);   // centre fan (CCW seen from above)
    for (let k = 1; k < rings.length - 1; k++) { const o0 = 1 + (k - 1) * segments, o1 = o0 + segments;
      for (let s = 0; s < segments; s++) { const s1 = (s + 1) % segments; idx.push(o0 + s, o1 + s, o1 + s1, o0 + s, o1 + s1, o0 + s1); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cola, 4));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); g.setIndex(idx); g.computeBoundingSphere(); return g;
  }
  const deckMat = (() => { // the deck: a soft radial disc just under the puffs so the sea reads continuous (colour / opacity: preset clouds.deck)
    // falloff = the old canvas gradient stops (alpha 1 @ r 0, 0.85 @ r 0.6, 0 @ r 1); colour = material colour x white vertex rgb
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: true });
    // sky.screenTint: the deck thins out toward the top of the screen where the tint brings in the zenith blue (0 = unchanged)
    addPatch(m, 'deckTint', (sh) => { Object.assign(sh.uniforms, tintU);
      sh.vertexShader = 'varying vec4 vDeckClip;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvDeckClip = gl_Position;');
      sh.fragmentShader = 'uniform float uScreenTint;\nuniform vec2 uTintRange;\nvarying vec4 vDeckClip;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>',
        '#include <alphamap_fragment>\ndiffuseColor.a *= 1.0 - uScreenTint * smoothstep(uTintRange.x, uTintRange.y, vDeckClip.y / vDeckClip.w * 0.5 + 0.5);'); });
    const deck = new THREE.Mesh(radialDisc(SEA.deck.radius, [[0, 1], [0.6, 0.85], [1, 0]], 64), m);
    deck.name = 'cloudDeck'; deck.position.y = SEA.deck.y; deck.renderOrder = -5; scene.add(deck);
    return m;
  })();
  const deckMesh = scene.getObjectByName('cloudDeck');
  // MATERIAL MODEL (LOOK-BRIEF phase 1): Lambert everywhere opaque, like the game (terrain vertexMat + procedural props = flat
  // MeshLambertMaterial; its GLBs are converted to Lambert on load, see toLambert). Terrain normals are authored (smooth on
  // gentle grass, flat on rock), so the island material does NOT force flatShading.
  const islandMat = DIAG === 'albedo' ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshLambertMaterial({ vertexColors: true });
  // UNDERSIDE HAZE (LOOK-BRIEF phase 2, preset stone.fade): below fade.top the island fades toward the haze colour, reaching
  // fade.strength at fade.bottom (world y). Applied after three's fog, display-referred like the fog and the sky dome, so the
  // underside melts into the haze below instead of ending as a dark mass. uHaze = (raw sRGB, strength); 0 = off.
  // ROCK BOUNCE (preset stone.bounce): steep faces (risers, walls) also get the warm light bounced off the sunlit ground in front
  // of them (+ bounce x the hemisphere's ground colour, weighted by steepness^2), so shadowed stone reads warm taupe instead of
  // the cool-grey the blue sky fill alone gives it. Flat grass is unaffected; 0 = off.
  const hazeU = { uHaze: { value: new THREE.Vector4(0, 0, 0, 0) }, uHazeY: { value: new THREE.Vector2(-20, -4) }, uBounce: { value: new THREE.Vector3(0, 0, 0) } };
  // (the haze colour is display-referred: raw on the canvas, its inverse-tone-mapped pre-image on the composite's linear target)
  islandMat.userData.celKind = 'terrain';
  addPatch(islandMat, 'islandHaze', (sh) => { Object.assign(sh.uniforms, hazeU, LCU);
    sh.vertexShader = 'varying float vHazeY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHazeY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = 'uniform vec4 uHaze;\nuniform vec2 uHazeY;\nuniform vec3 uBounce;\nuniform float uLcExposure;\nvarying float vHazeY;\n' + sh.fragmentShader
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n{ float st = 1.0 - abs(normalize((vec4(normal, 0.0) * viewMatrix).xyz).y); reflectedLight.indirectDiffuse += diffuseColor.rgb * uBounce * st * st; }')
      .replace('void main() {', (LC ? LC.DISPLAY_GLSL : 'vec3 lcDisplayToTarget(vec3 c) { return c; }') + '\nvoid main() {')
      .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, lcDisplayToTarget(uHaze.rgb), uHaze.a * (1.0 - smoothstep(uHazeY.x, uHazeY.y, vHazeY)));'); });
  // CLIFF GEOLOGY (plants stage, preset stone.strata): STEEP faces (risers, coast walls, the underside's crags: world normal
  // |y| < ~0.6) get horizontal STRATA in the fragment shader, texture-free and independent of the wall tessellation: world-y beds
  // `band` u tall, undulating (`warp`) like tilted beds; each bed its own tone (+/- `tone`) and hue (between the `cool` violet-grey
  // and the `warm` red-brown multipliers, #808080 = none); a darker joint under each bed, a lit ledge on its top edge (reads as a
  // chamfer / slight outset) and staggered vertical block joints (`blocks`). Every line is fwidth-antialiased and fades out where a
  // bed is under ~3 px (no shimmer in the overview). Geometry, heights, seams and the export are untouched; off = identical.
  const stratU = { uStrata: { value: new THREE.Vector4(0, 0.42, 0.5, 0.1) }, uStrataJ: { value: new THREE.Vector4(0, 0.07, 0, 0) }, uStrataWarm: { value: new THREE.Vector3(1, 1, 1) }, uStrataCool: { value: new THREE.Vector3(1, 1, 1) } };
  const STRATA_GLSL = `if (uStrata.x > 0.5) {
    vec3 sp = vStrataP; float snl = length(vStrataN), steep = snl > 1e-4 ? 1.0 - smoothstep(0.45, 0.75, abs(vStrataN.y / snl)) : 0.0;   // (guarded: a degenerate normal never makes a NaN pixel)
    float yb = sp.y / uStrata.y + uStrata.z * 1.6 * (2.0 * lkNoise(sp.xz * 0.18 + 3.7) - 1.0);
    float b = floor(yb), f = fract(yb), fw = fwidth(yb), aa = 1.0 - smoothstep(0.18, 0.45, fw);
    float h1 = lkHash(vec2(b, 17.0)), h2 = lkHash(vec2(b, 43.0));
    vec3 tint = mix(uStrataCool, uStrataWarm, h1) * (1.0 + uStrata.w * (2.0 * h2 - 1.0));
    // ~65 % of the bed boundaries are joints (the rest merge beds: strata of uneven thickness, not brick courses)
    // (every fwidth-widened smoothstep keeps edge1 > edge0: fwidth is exactly 0 in flat quads, and smoothstep(e, e, x) is undefined = a NaN pixel)
    float jw = uStrataJ.y, joint = step(0.35, lkHash(vec2(b, 71.0))) * (1.0 - smoothstep(jw, jw + 1.5 * fw + 1e-4, f)), ledge = step(0.35, lkHash(vec2(b + 1.0, 71.0))) * smoothstep(1.0 - 1.4 * jw - fw, 1.0 - 0.5 * fw, f);
    vec2 tg = vec2(-vStrataN.z, vStrataN.x); float tl = length(tg); tg = tl > 1e-4 ? tg / tl : vec2(1.0, 0.0);
    float s = dot(sp.xz, tg) / (uStrata.y * 3.6) + h1 * 5.0, fs = fract(s), fws = fwidth(s);
    float vj = step(h2, 0.4) * (1.0 - smoothstep(0.03, 0.03 + 1.5 * fws + 1e-4, fs)) * (1.0 - smoothstep(0.3, 0.6, fws));   // block joints in some beds only
    vec3 k = tint * (1.0 - uStrataJ.x * aa * max(joint, vj * uStrataJ.w)) * (1.0 + uStrataJ.z * aa * ledge);
    k = mix(vec3(1.0), k, 1.0 - 0.7 * smoothstep(-2.5, -9.0, sp.y));   // strongest on the walls / risers, quieter down the underside
    diffuseColor.rgb *= mix(vec3(1.0), k, steep);
  }`;
  addPatch(islandMat, 'strata', (sh) => { Object.assign(sh.uniforms, stratU);
    sh.vertexShader = 'varying vec3 vStrataP;\nvarying vec3 vStrataN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvStrataP = (modelMatrix * vec4(transformed, 1.0)).xyz; vStrataN = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = 'uniform vec4 uStrata;\nuniform vec4 uStrataJ;\nuniform vec3 uStrataWarm;\nuniform vec3 uStrataCool;\nvarying vec3 vStrataP;\nvarying vec3 vStrataN;\n' + NOISE_GLSL +
      sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + STRATA_GLSL); });
  for (const d of SEA.distantIsles) {   // own-spec islands (buildIsland path), Backdrop.tsx DistantIsles style
    const c = GT.ownIslandContract({ seed: d.seed, radius: d.r, hills: 0.4, depth: 0.7, flatCenter: 0.3 }, L, { ring: Math.max(0.3, d.r / 6) });
    const { group } = pieceGroup(THREE, c, islandMat, { castShadow: false }); group.position.set(d.p[0], d.p[1], d.p[2]); scene.add(group);
  }

  // ---- the pieces: one group per piece, pivot = its local origin (Rising-compatible) ----
  const PG = {};
  for (const id of BP.order) {
    const pc = BP.pieces[id];
    if (DIAG === 'shade') pc.colors.fill(0.42);
    const { group, mesh } = pieceGroup(THREE, pc, islandMat);
    scene.add(group); PG[id] = { group, mesh, pc, base: pc.pivot[1] };
  }
  // BAKED PIECES (?baked=1, the review mode for bake-pieces.mjs): each piece group draws the game's baked GLB (public/models/
  // piece_<id>.glb, shipped by build.mjs as piece_<id>.wasm) instead of the core's full-resolution mesh, and everything placed on
  // a piece sits on its baked height grid (piece_<id>.height.bin -> piece_<id>_height.wasm, NaN-aware bilinear, as the game would).
  // Off (the default) = unchanged: BAKEDH stays empty and local() reads the core's height().
  const BAKED = QS.get('baked') === '1' && !!(CFG.bakedPieces && CFG.bakedPieces.length), BAKEDH = {};
  const local = (pc, x, z, lift = 0) => { const lx = x - pc.pivot[0], lz = z - pc.pivot[2], bh = BAKEDH[pc.id]; return new THREE.Vector3(lx, (bh ? bh(lx, lz, pc) : pc.height(lx, lz)) + lift, lz); };
  // the game-side lookup of a baked height grid: bilinear over the 4 cell corners, NaN corners (off the top) dropped and the
  // weights renormalised; no finite corner -> the fallback (here the core's height)
  function gridHeight(meta, grid) {
    const [x0, z0] = meta.origin, s = meta.spacing, [nx, nz] = meta.size;
    return (x, z, pc) => {
      const gx = (x - x0) / s, gz = (z - z0) / s, i = Math.floor(gx), j = Math.floor(gz), u = gx - i, v = gz - j; let sw = 0, sh = 0;
      for (const [di, dj, w] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]]) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz || w <= 0) continue; const h = grid[jj * nx + ii]; if (Number.isFinite(h)) { sw += w; sh += w * h; } }
      return sw > 1e-9 ? sh / sw : pc.height(x, z);
    };
  }
  window.__pieceGroups = PG;
  // TERRAIN PAINT (LOOK-BRIEF phase 2): each island mesh draws its OWN copy of the core's base colours (pc.colors stays the
  // reference: 'Game (current)', the measurement mask), repainted from the preset's grass + stone sections by the three-free
  // core (GT.paintBlueprint: per-vertex world-space grass variation, warm stone). Re-run only when those sections change;
  // panel edits are debounced, preset selection is immediate.
  for (const id of BP.order) PG[id].mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(BP.pieces[id].colors), 3));
  // (each mesh also owns its normals: grass.seamMatch swaps in the seam-lip normals, GT.seamLipNormals; pc.normals stays the reference)
  for (const id of BP.order) PG[id].mesh.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(BP.pieces[id].normals), 3));
  let paintSig = null, paintTimer = null, lipNormals = null, lipOn = false;
  function applyLipNormals(on) {
    if (on === lipOn) return; lipOn = on; if (on && !lipNormals && GT.seamLipNormals) lipNormals = GT.seamLipNormals(BP);
    for (const id of BP.order) { if (PG[id].baked) continue; const a = PG[id].mesh.geometry.attributes.normal; a.array.set(on && lipNormals ? lipNormals[id] : BP.pieces[id].normals); a.needsUpdate = true; }   // (a baked piece keeps its GLB normals)
  }
  function applyPaint(p, now) {
    if (DIAG === 'shade') return;
    const sig = JSON.stringify([p.grass, { ...p.stone, fade: null, bounce: null }]);   // (stone.fade + stone.bounce are shader-side light, not paint)
    if (sig === paintSig) { clearTimeout(paintTimer); paintTimer = null; return; }
    const run = () => { paintTimer = null; paintSig = sig; const t0 = performance.now(), C = GT.paintBlueprint(BP, COMP, p, L);
      for (const id of BP.order) { if (PG[id].baked) continue; const a = PG[id].mesh.geometry.attributes.color; a.array.set(C[id]); a.needsUpdate = true; }   // (a baked piece keeps its GLB colours)
      applyLipNormals(!!(p.grass && p.grass.enabled && p.grass.seamMatch));
      console.log('[look] terrain paint', Math.round(performance.now() - t0), 'ms'); };
    if (now) run(); else { clearTimeout(paintTimer); paintTimer = setTimeout(run, 150); }
  }
  window.__unlockState = () => ({ unlocked: [...UNLOCKED], dock: DOCK, visible: BP.order.filter((id) => PG[id].group.visible !== false) });
  function applyState() {
    for (const id of BP.order) {
      // (strict boolean: three.js skips an object only when visible === false; `false || null` would still render)
      const g = PG[id].group, on = UNLOCKED.has(id) || !!(DOCK && DOCK.piece === id);
      g.visible = on;
      const t = DOCK && DOCK.piece === id ? Math.min(1, Math.max(0, DOCK.t)) : 1, ease = 1 - Math.pow(1 - t, 3);
      g.position.y = PG[id].base + (1 - ease) * -9;                       // Isles.tsx Rising: 9 u below, cubic ease-out
    }
    // ?baked=1 open-seam skirts (the game's contract): skirt_<X> is shown while piece X is not docked and hidden once X starts rising
    for (const id of BP.order) for (const [nb, sk] of Object.entries(PG[id].skirts || {})) sk.visible = !(UNLOCKED.has(nb) || (DOCK && DOCK.piece === nb));
    meshyUnderside();   // (the Meshy underside fits the joined island or MAIN's own cone)
    fitShadow();
    NEAR_OBJS.length = 0;   // (the near-plane fit re-reads the visible bounds)
  }

  // ---- contact shadow, pine, ground cover helpers ----
  // The soft contact blob is TEXTURE-FREE (iOS speckle fix, see radialDisc): colour + centre alpha = the material (preset
  // shadows.contact), the radial falloff is analytic in the fragment shader from the quad's uv. Profile = the old 128^2 canvas
  // gradient (createRadialGradient(64, 64, 4, 64, 64, 62)): full alpha inside r = 4/64 of the half-size, linear to 0 at r = 62/64.
  // Works unchanged on the instanced blobs (uv is per vertex; instancing only moves the quad).
  function drawContact(C) { shadowMat.color.set(C.color); shadowMat.opacity = C.innerAlpha; }
  const shadowMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2 });
  addPatch(shadowMat, 'contactBlob', (sh) => {
    sh.vertexShader = 'varying vec2 vBlobUv;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlobUv = uv;');
    sh.fragmentShader = 'varying vec2 vBlobUv;\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
      'vec4 diffuseColor = vec4( diffuse, opacity );\ndiffuseColor.a *= clamp( ( 0.96875 - length( vBlobUv - 0.5 ) * 2.0 ) / ( 0.96875 - 0.0625 ), 0.0, 1.0 );');
  });
  drawContact(LOOK.preset.shadows.contact);
  function contact(group, pc, x, z, rx, rz) { const m = new THREE.Mesh(new THREE.PlaneGeometry(rx, rz), shadowMat); m.rotation.x = -Math.PI / 2; m.position.copy(local(pc, x, z, 0.03)); m.renderOrder = 1; group.add(m); }
  // ---- TREE CANOPIES (LOOK-BRIEF phase 2, preset canopy.*): drawn by the trees' own Lambert materials + a small shader (the
  //      GLBs are untouched; the game copies this at load time):
  //   gradient  per-vertex height WITHIN THE TREE (aTreeH: 0 = the lowest canopy vertex, 1 = the top, from the model's own
  //             canopy parts) blends a bottom -> top multiplier (darker + cooler at the bottom, lighter + warmer at the top)
  //   tint      deterministic per-instance hue / value jitter (instanceColor; seeded by the tree's position); saturation pulls the
  //             canopy albedo toward its luma (moderate Worldseed-style foliage)
  //   lift      shadowLift (all canopies) / + coniferLift (pines) add the neutral mean hemisphere fill = leaf translucency, more on
  //             facets turned toward the sun: shadowed foliage stays green with detail instead of falling into Neutral's toe;
  //             coniferTint multiplies the pine albedo
  //   backlight optional warm glow when the sun is behind a canopy (view vs sun direction, stronger at the rim)
  //   Colour multipliers are #RRGGBB around #808080 = no change (channel / 128). Disabled = exact identity.
  const mkCanopyU = () => ({ uCanopyGrad: { value: new THREE.Vector4(0, 0, 1, 0) }, uCanopyBottom: { value: new THREE.Vector3(1, 1, 1) }, uCanopyTop: { value: new THREE.Vector3(1, 1, 1) },
    uCanopyTint: { value: new THREE.Vector3(1, 1, 1) }, uCanopySat: { value: 1 }, uCanopyLift: { value: 0 }, uCanopyLiftCol: { value: new THREE.Vector3(0, 0, 0) },
    uCanopyBack: { value: new THREE.Vector4(0, 0, 0, 0) }, uCanopyBackPow: { value: 2 }, uSunDir: { value: SUN_DIR } });
  const CANOPY_U = { round: mkCanopyU(), pine: mkCanopyU(), broad: mkCanopyU(), conifer: mkCanopyU() }, TREE_IMS = [];   // broad / conifer = the plants-stage variants
  const isLeafy = (m) => { const c = m && m.color; return !!(c && c.g > c.r * 1.05 && c.g > c.b); };
  function canopyMaterial(m, kind) {
    if (!m || m.userData.canopy) return; m.userData.canopy = kind; m.userData.celKind = 'foliage'; const U = CANOPY_U[kind];
    addPatch(m, 'canopy:' + kind, (sh) => { Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute float aTreeH;\nvarying float vTreeH;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreeH = aTreeH;');
      sh.fragmentShader = 'uniform vec4 uCanopyGrad;\nuniform vec3 uCanopyBottom;\nuniform vec3 uCanopyTop;\nuniform vec3 uCanopyTint;\nuniform float uCanopySat;\nuniform float uCanopyLift;\nuniform vec3 uCanopyLiftCol;\nuniform vec4 uCanopyBack;\nuniform float uCanopyBackPow;\nuniform vec3 uSunDir;\nvarying float vTreeH;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= uCanopyTint * mix(vec3(1.0), mix(uCanopyBottom, uCanopyTop, smoothstep(uCanopyGrad.y, uCanopyGrad.z, vTreeH)), uCanopyGrad.x);\n' +
          'diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), diffuseColor.rgb, uCanopySat);')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' +
          '{ vec3 vv = normalize(vViewPosition), ls = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);\n' +
          // leaf translucency: + lift x the NEUTRAL mean hemisphere fill (not the blue sky alone, so a shadowed canopy stays green, not
          // teal), stronger on facets turned toward the sun (detail in shadow: the hemisphere alone lights every cone facet the same)
          '  reflectedLight.indirectDiffuse += diffuseColor.rgb * uCanopyLiftCol * uCanopyLift * (0.65 + 0.35 * dot(normal, ls));\n' +
          '  float back = pow(max(0.0, dot(-vv, ls)), uCanopyBackPow), rim = pow(1.0 - max(0.0, dot(normal, vv)), 2.0);\n' +
          '  reflectedLight.indirectDiffuse += uCanopyBack.rgb * uCanopyBack.a * back * (0.35 + 0.65 * rim) * diffuseColor.rgb; }'); });
  }
  function prepCanopy(src, kind) {   // aTreeH on every leafy part of a tree model (in the model's root space) + the canopy shader
    src.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), parts = [], v = new THREE.Vector3();
    src.traverse((o) => { if (o.isMesh && isLeafy(o.material)) parts.push([o, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)]); });
    let lo = Infinity, hi = -Infinity;
    for (const [o, rel] of parts) { const p = o.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const y = v.fromBufferAttribute(p, i).applyMatrix4(rel).y; lo = Math.min(lo, y); hi = Math.max(hi, y); } }
    for (const [o, rel] of parts) { const p = o.geometry.attributes.position, h = new Float32Array(p.count);
      for (let i = 0; i < p.count; i++) h[i] = (v.fromBufferAttribute(p, i).applyMatrix4(rel).y - lo) / Math.max(1e-6, hi - lo);
      o.geometry.setAttribute('aTreeH', new THREE.BufferAttribute(h, 1)); canopyMaterial(o.material, kind); }
  }
  // per-instance tint: hue +/- instanceTint.hue (fraction of the wheel), value x (1 +/- instanceTint.value), seeded by the tree's
  // world position + seed; the instanceColor multiplier makes each canopy part's own colour exactly that shifted colour
  const hsvOf = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
    if (d > 1e-9) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h /= 6; if (h < 0) h += 1; } return [h, mx > 0 ? d / mx : 0, mx]; };
  const rgbOf = (h, s, v) => { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6]; };
  // the PAINTED crowns (the tree:<asset> GLBs' Canopy parts, CROWN_IMS) take the export's near-white tint instead: GT.texturedTint (lib/
  // terrain.mjs, the one function lib/composition.mjs writes into composition.pieces.json), on the same seed; T off = white
  let tintSig = null; const _ic = new THREE.Color(), _is = new THREE.Color(), CROWN_IMS = [];
  function applyTreeTints(T) {
    const sig = JSON.stringify(T); if (sig === tintSig || (!TREE_IMS.length && !CROWN_IMS.length)) return; tintSig = sig;
    for (const { im, items } of CROWN_IMS) {
      items.forEach((it, i) => { const t = GT.texturedTint(it.x, it.z, T); im.setColorAt(i, t ? _ic.setRGB(t[0], t[1], t[2]) : _ic.setRGB(1, 1, 1)); });
      im.instanceColor.needsUpdate = true;
    }
    for (const { im, items, ref } of TREE_IMS) {
      _is.copy(ref).convertLinearToSRGB(); const [h0, s0, v0] = hsvOf(_is.r, _is.g, _is.b);
      items.forEach((it, i) => {
        if (!T.enabled) { im.setColorAt(i, _ic.setRGB(1, 1, 1)); return; }
        const kx = Math.round(it.x * 100), kz = Math.round(it.z * 100), dh = (GT.hash3(kx, kz, 4001 + T.seed) * 2 - 1) * T.hue, dv = (GT.hash3(kx, kz, 7919 + T.seed) * 2 - 1) * T.value;
        const [r, g, b] = rgbOf(((h0 + dh) % 1 + 1) % 1, s0, Math.min(1, v0 * (1 + dv))); _is.setRGB(r, g, b, THREE.SRGBColorSpace);
        im.setColorAt(i, _ic.setRGB(ref.r > 0 ? _is.r / ref.r : 1, ref.g > 0 ? _is.g / ref.g : 1, ref.b > 0 ? _is.b / ref.b : 1));
      });
      im.instanceColor.needsUpdate = true;
    }
  }
  function makePine() {
    const V = L.vegetation.pine, g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.45, 6), new THREE.MeshLambertMaterial({ color: col(V.trunkToken), flatShading: true }));
    trunk.position.y = 0.22; trunk.castShadow = true; g.add(trunk);
    const leaf = new THREE.MeshLambertMaterial({ color: col(V.leafToken), flatShading: true }), leaf2 = new THREE.MeshLambertMaterial({ color: col(V.leaf2Token), flatShading: true });
    for (const [r, h, y, mt] of [[0.62, 0.8, 0.62, leaf2], [0.48, 0.72, 1.12, leaf], [0.33, 0.62, 1.62, leaf]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mt); c.position.y = y; c.castShadow = true; g.add(c); }
    return g;
  }
  // ---- PLANTS (WORLDSEED-BRIEF plants & shapes; presets plants.* / farm.* / paths.*): the moods draw procedural TREE VARIANTS
  //      (lib/plants.mjs = window.__PLANTS__: oak / ovate / spread / sapling + fir / pine; trunk + crown in ONE geometry = one
  //      InstancedMesh per variant per piece) at the composition's tree positions (variant / vscale / vyaw: lib/terrain.mjs), a
  //      woodland-edge SHRUB belt, COMPOSED FLOWER DRIFTS, extra contact shadows (fences, bushes, shrubs, sheep, garden) and two
  //      flowering bushes by the porch; 'Game (current)' keeps the tree_round_a / pine / speckle-flower sets (plants.enabled off =
  //      exactly the old scene). Both sets are built once; applyPlants toggles visibility.
  //   ramp  crown albedo = a 4-stop ramp shade -> mid -> lit (+ a little accent on the most lit tips), keyed to light-facing (world
  //         normal . sun, live with the time of day) and height within the crown (aTreeH), x the per-lobe value jitter (vertex
  //         colour) x the per-tree tint (instanceColor, canopy.instanceTint); then the canopy patch (gradient x plants.gradient,
  //         saturation, lift) and the cel bands light it. Trunks (aTreeH -1) keep their vertex colour (no ramp, no tint).
  //         aTreeH / vTreeH stay the hook the Phase-5 wind bends by.
  //   PAINTERLY (art/specs/2026-10-22-painterly-trees-design.md "Revision 2", plan Task 10): where the composition names a model (t.asset:
  //         lib/species.mjs SPECIES / AUTUMN; s.asset: the lib/plantkit.mjs SHRUBS card shrubs; b.kind: bush_a / bush_flowering /
  //         bush_berry) the moods draw that GLB instead (build.mjs PAINTERLY), exactly as lib/composition.mjs exports it: tree:<asset>
  //         (every mesh part; the Canopy parts take GT.texturedTint, the export's near-white tint), shrub:<asset> for the card shrubs and
  //         the bushes (untinted, no cast shadow). The painted textures keep their own colour: no ramp, no canopy patch. A layout tree
  //         (no asset; the game places it) is drawn as its variant's species (LAYOUT_SPECIES = lib/terrain.mjs BASE); a plants.mjs
  //         variant only where a GLB is missing (a load error).
  const PLB = window.__PLANTS__ || null, PLANT = { on: [], off: [], shrubs: [], flowersOn: [], flowersOff: [], garden: [], contacts: [], counts: {} };
  const LAYOUT_SPECIES = { oak: 'tree_round_a', ovate: 'tree_round_b', spread: 'tree_spread', sapling: 'tree_sapling', fir: 'tree_pine_a', pine: 'tree_pine_b' };
  const mkRampU = () => ({ uRampShade: { value: new THREE.Color() }, uRampMid: { value: new THREE.Color() }, uRampLit: { value: new THREE.Color() }, uRampAccent: { value: new THREE.Vector4() }, uRampW: { value: new THREE.Vector4(0.75, 0.4, 0, 0.42) } });
  const RAMP_U = { broad: mkRampU(), conifer: mkRampU() };
  function plantMaterial(kind) {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true }); m.name = 'plants:' + kind;
    canopyMaterial(m, kind);   // gradient / tint / saturation / lift / backlight on CANOPY_U[kind] (declares aTreeH / vTreeH / uSunDir)
    addPatch(m, 'plantRamp', (sh) => { Object.assign(sh.uniforms, RAMP_U[kind]);
      sh.vertexShader = 'varying vec3 vPlantN;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlantN = normal;\n#ifdef USE_INSTANCING\nvPlantN = mat3(instanceMatrix) * vPlantN;\n#endif\nvPlantN = normalize(mat3(modelMatrix) * vPlantN);')
        .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nif (aTreeH < -0.5) vColor.xyz = color.xyz;\n#endif');
      sh.fragmentShader = 'uniform vec3 uRampShade;\nuniform vec3 uRampMid;\nuniform vec3 uRampLit;\nuniform vec4 uRampAccent;\nuniform vec4 uRampW;\nvarying vec3 vPlantN;\n' + sh.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\nif (vTreeH > -0.5) { float pnl = length(vPlantN), rl = pnl > 1e-4 ? dot(vPlantN / pnl, uSunDir) * 0.5 + 0.5 : 0.5, rt = clamp(uRampW.x * rl + uRampW.y * vTreeH + uRampW.z, 0.0, 1.0);\n' +
          '  vec3 rc = rt < uRampW.w ? mix(uRampShade, uRampMid, rt / uRampW.w) : mix(uRampMid, uRampLit, (rt - uRampW.w) / (1.0 - uRampW.w));\n' +
          '  diffuseColor.rgb = mix(rc, uRampAccent.rgb, uRampAccent.a * smoothstep(0.8, 1.0, rt)) * vColor.rgb; }')
        .replace('#include <emissivemap_fragment>', 'if (vTreeH < -0.5) diffuseColor.rgb = vColor.rgb;\n#include <emissivemap_fragment>'); });
    return m;
  }
  function plantGeometry(v) {   // a lib/plants.mjs variant -> BufferGeometry (position, normal, colour, aTreeH, index)
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(v.positions, 3)); g.setAttribute('normal', new THREE.BufferAttribute(v.normals, 3));
    g.setAttribute('color', new THREE.BufferAttribute(v.colors, 3)); g.setAttribute('aTreeH', new THREE.BufferAttribute(v.treeH, 1)); g.setIndex(new THREE.BufferAttribute(v.index, 1)); g.computeBoundingSphere(); return g;
  }
  // FARM (preset farm.*): warm window glow (the farmhouse 'Glow' material's emissive, rising at dusk through the time-of-day
  // blend; off = the GLB's own emissive), a warm porch point light (visible only while farm.porchLight > 0, so it costs nothing by
  // day), the garden bushes. PATH TONE (preset paths.*): the ribbons' colour = paths.color (muted warm tan, compacted earth) x a
  // subtle two-octave world-space value-noise variation; off = the palette 'Path' vertex colour exactly.
  const porch = new THREE.PointLight(); porch.name = 'porchLight'; porch.visible = false; porch.castShadow = false;
  const GLOW = { mat: null, e: new THREE.Color(), i: 1, extra: [] };   // extra = other Glow materials on the same drive (the Meshy windmill's window)
  function applyFarm(F) {
    const on = !!(F && F.enabled);
    if (GLOW.mat) { if (on) { GLOW.mat.emissive.set(F.windowColor); GLOW.mat.emissiveIntensity = F.windowGlow; } else { GLOW.mat.emissive.copy(GLOW.e); GLOW.mat.emissiveIntensity = GLOW.i; } }
    for (const x of GLOW.extra) { if (on) { x.mat.emissive.set(F.windowColor); x.mat.emissiveIntensity = F.windowGlow; } else { x.mat.emissive.copy(x.e); x.mat.emissiveIntensity = x.i; } }
    if (F) { porch.color.set(F.porchColor); porch.distance = F.porchDistance; } porch.intensity = on ? F.porchLight : 0;
    const vis = on && porch.intensity > 0.01 && !!porch.parent; if (porch.visible !== vis) porch.visible = vis;   // (a light-count change recompiles once)
  }
  function applyPlants(p) {
    const PLp = p.plants, on = !!(PLp && PLp.enabled && PLB), F = p.farm;
    for (const im of PLANT.off) im.visible = !on; for (const im of PLANT.on) im.visible = on;
    for (const im of PLANT.shrubs) im.visible = on && !!PLp.shrubs;
    for (const im of PLANT.flowersOff) im.visible = !(on && PLp.flowers); for (const im of PLANT.flowersOn) im.visible = on && !!PLp.flowers;
    for (const im of PLANT.contacts) im.visible = on && !!PLp.contacts;
    for (const im of PLANT.garden) im.visible = on && !!(F && F.enabled && F.garden);
    if (PLp) for (const [kind, R] of [['broad', PLp.ramp], ['conifer', PLp.conifer]]) { const U = RAMP_U[kind]; U.uRampShade.value.set(R.shade); U.uRampMid.value.set(R.mid); U.uRampLit.value.set(R.lit);
      _lc3.set(R.accent || R.lit); U.uRampAccent.value.set(_lc3.r, _lc3.g, _lc3.b, R.accentAmount || 0); U.uRampW.value.set(R.light, R.height, R.bias, R.midStop); }
    applyFarm(F);
    const PT = p.paths; if (PT && PT.enabled) { _lc3.set(PT.color); pathU.uPathTone.value.set(_lc3.r, _lc3.g, _lc3.b, 1); pathU.uPathVar.value.set(PT.variation, PT.scale); } else pathU.uPathTone.value.w = 0;
    const SS = p.stone && p.stone.strata;
    if (SS && SS.enabled && p.stone.enabled) { stratU.uStrata.value.set(1, SS.band, SS.warp, SS.tone); stratU.uStrataJ.value.set(SS.joint, SS.jointWidth, SS.ledge, SS.blocks); mulVec(stratU.uStrataWarm.value, SS.warm); mulVec(stratU.uStrataCool.value, SS.cool); }
    else stratU.uStrata.value.x = 0;
  }
  const sway = { uTime: { value: 0 }, uGS: { value: new THREE.Vector4() } };   // uGS = preset wind.grassSway (ampX, ampZ, speedX, speedZ)
  function makeSway(base) { const m = base.clone(); m.userData.celKind = 'foliage'; addPatch(m, 'grassSway', (sh) => { sh.uniforms.uTime = sway.uTime; sh.uniforms.uGS = sway.uGS;
    sh.vertexShader = 'uniform float uTime;\nuniform vec4 uGS;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wsp = modelMatrix * instanceMatrix * vec4(position,1.0);\nfloat ph = wsp.x*0.6 + wsp.z*0.6;\nfloat k = clamp(position.y,0.0,1.0);\ntransformed.x += sin(uTime*uGS.z+ph)*uGS.x*k;\ntransformed.z += sin(uTime*uGS.w+ph+1.3)*uGS.y*k;'); });
    return m; }

  // ---- CEL-BANDED LIGHTING (look core, preset cel): every opaque Lambert material (terrain, paths, stairs, trees, bushes, GLBs)
  //      gets the guarded r186 lights_lambert_pars_fragment patch (lib/look-core.mjs celPatchLambert): N.L banded into a terminator
  //      (cel.terminator, softness per material kind: terrain softer, foliage medium, buildings crisper) + a lit band + an optional
  //      highlight band; the cast shadow stays a smooth factor (three multiplies it into the light colour before the band); the
  //      hemisphere / indirect light is tinted toward the violet cel.shadeTint; a warm rim on grazing, non-upward faces. If an
  //      anchor does not match exactly once the material keeps plain Lambert (logged, counted in __lookCore.cel). cel.enabled
  //      off = neutral uniforms (identical to Lambert). Chained after the material's own patches (addPatch). ----
  const mkCelU = () => ({ uCel: { value: new THREE.Vector4(0, 0.26, 0.05, 0) }, uCelLit: { value: new THREE.Vector4(1, 0.8, 1, 0) }, uCelShade: { value: new THREE.Vector4(1, 1, 1, 0) },
    uCelRim: { value: new THREE.Vector4(0, 0, 0, 3) }, uCelRimP: { value: new THREE.Vector2(0.5, 0.2) } });
  const CEL_U = { terrain: mkCelU(), foliage: mkCelU(), building: mkCelU() }, CEL = { applied: 0, fallback: 0, misses: [], materials: new Set() };
  function celMaterial(m, kind) {
    if (!m || !m.isMeshLambertMaterial || m.userData.celKind === 'none') return;
    const k = CEL_U[kind] ? kind : 'building'; m.userData.celKind = k; CEL.materials.add(m);
    addPatch(m, 'cel', (sh) => {
      const r = LC ? LC.celPatchLambert(sh.fragmentShader, THREE.ShaderChunk.lights_lambert_pars_fragment) : { applied: false, misses: ['no look core'] };
      if (!r.applied) { CEL.fallback++; CEL.misses.push((m.name || m.type) + ': ' + r.misses.join(', ')); m.userData.celFallback = r.misses; console.warn('[cel] anchor miss -> plain Lambert for ' + (m.name || m.type) + ': ' + r.misses.join(', ')); return; }
      sh.fragmentShader = r.src; Object.assign(sh.uniforms, CEL_U[k]); CEL.applied++;
    });
  }
  const GLB_KIND = { tree_round_a: 'foliage', bush_a: 'foliage', bush_flowering: 'foliage', grass_tuft: 'foliage', hero_tree: 'foliage', haystack: 'foliage' };
  for (const id of ['grass_short', 'grass_tall', 'grass_seedhead', 'clover_patch', 'flower_daisy', 'flower_buttercup', 'flower_poppy', 'flower_cornflower',
    'perennial_lavender', 'perennial_foxglove', 'perennial_oxeye', 'fern_clump']) GLB_KIND[id] = 'foliage';   // the living-ground kit (lib/plantkit.mjs)   // everything else (farmhouse, fence, plot, flowerbed, rocks, sheep) = building
  // the painterly plants (build.mjs PAINTERLY: lib/species.mjs SPECIES + AUTUMN, art/reskin/<id>.glb, and the lib/plantkit.mjs SHRUBS card
  // shrubs; tree_round_a / bush_a / bush_flowering above are their painterly files too)
  for (const id of ['tree_pine_a', 'tree_pine_b', 'tree_round_b', 'tree_spread', 'tree_sapling', 'tree_birch', 'tree_fruit', 'bush_berry',
    'tree_oak_autumn', 'tree_beech_autumn', 'tree_birch_autumn', 'shrub_low', 'shrub_mound', 'shrub_heather']) GLB_KIND[id] = 'foliage';

  // ---- path ribbons (soft-edged, surface-conforming; split per piece at the seams) ----
  const pathMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  pathMat.userData.celKind = 'terrain';
  const pathU = { uPathTone: { value: new THREE.Vector4(1, 1, 1, 0) }, uPathVar: { value: new THREE.Vector2(0, 1) } };   // (path tone: applyPlants)
  addPatch(pathMat, 'pathTone', (sh) => { Object.assign(sh.uniforms, pathU);
    sh.vertexShader = 'varying vec2 vPathP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPathP = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform vec4 uPathTone;\nuniform vec2 uPathVar;\nvarying vec2 vPathP;\n' + NOISE_GLSL + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\nif (uPathTone.a > 0.5) { vec2 q = vPathP * uPathVar.y; float n = 0.65 * lkNoise(q) + 0.35 * lkNoise(q * 2.7 + 5.3); diffuseColor.rgb = uPathTone.rgb * (1.0 + uPathVar.x * (2.0 * n - 1.0)); }'); });
  function ribbon(group, pc, pts, width, colour, soft, lift, mat, levelAt) {
    const N = pts.length; if (N < 2) return;
    const pos = [], cola = [], idx = [], c = colour;
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const w = typeof width === 'function' ? width(i) : width, hw = w / 2, offs = [-(hw + soft), -hw, -hw * 0.5, 0, hw * 0.5, hw, hw + soft], al = [0, 1, 1, 1, 1, 1, 0];
      for (let k = 0; k < 7; k++) { const x = pts[i][0] - tz * offs[k], z = pts[i][1] + tx * offs[k], v = local(pc, x, z, lift);
        if (levelAt) v.y = levelAt(i) - pc.pivot[1]; pos.push(v.x, v.y, v.z); cola.push(c.r, c.g, c.b, al[k]); }
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < 6; k++) { const a = i * 7 + k, b = a + 1, d = a + 7, e = d + 1; idx.push(a, b, d, b, e, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cola, 4)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 2; group.add(m);
  }

  // ---- PLACEHOLDER water (the game draws all water): the game's Water.tsx shaders (pond / stream / fall, verbatim
  //      GLSL) with the preset's water colours (lookPresets water.*), flat surfaces at the exported levels ----
  const WL = (A.look && A.look.water) || {};   // geometry only (fallWidth); colours / brightness / sky tint: applyLook
  const wShared = { uTime: { value: 1.5 }, uLight: { value: 1 }, uSky: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uShallow: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() } };
  const W_VS_P = 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const W_VS_UV = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
  const pondFS = `uniform float uTime; uniform float uRadius; uniform float uLight; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSky; varying vec2 vP;
    void main() { float d = length(vP) / uRadius; vec3 col = mix(uDeep, uShallow, smoothstep(0.05, 1.0, d)); col = mix(col, uSky, 0.25);
      float w1 = sin(vP.x * 3.1 + uTime * 0.8) * sin(vP.y * 2.6 - uTime * 0.6); float w2 = sin((vP.x + vP.y) * 4.2 - uTime * 1.1);
      float glint = smoothstep(0.72, 1.0, w1 * 0.6 + w2 * 0.4); col += uFoam * glint * 0.14; float ring = sin(d * 16.0 - uTime * 0.9) * 0.5 + 0.5;
      col += uFoam * ring * smoothstep(0.55, 0.9, d) * 0.04; col = mix(col, uFoam, smoothstep(0.86, 1.0, d) * 0.5); gl_FragColor = vec4(col * uLight, 0.94);
      #include <colorspace_fragment>
    }`;
  const streamFS = `uniform float uTime; uniform float uLight; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uSky; varying vec2 vUv;
    void main() { float edge = abs(vUv.y - 0.5) * 2.0; vec3 col = mix(uDeep, uShallow, edge); col = mix(col, uSky, 0.25);
      float flow = sin(vUv.x * 36.0 - uTime * 2.6 + sin(vUv.y * 9.0) * 1.2); col += uFoam * smoothstep(0.7, 1.0, flow) * 0.18; col = mix(col, uFoam, smoothstep(0.75, 1.0, edge) * 0.4);
      gl_FragColor = vec4(col * uLight, 0.95);
      #include <colorspace_fragment>
    }`;
  const fallFS = `uniform float uTime; uniform float uLight; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSky; varying vec2 vUv;
    void main() { float streak = fract(vUv.y * 2.4 + uTime * 0.55 + sin(vUv.x * 17.0) * 0.12); float s = smoothstep(0.0, 0.25, streak) * (1.0 - smoothstep(0.55, 1.0, streak));
      vec3 col = mix(mix(uShallow, uSky, 0.35), uFoam, s * 0.55 + 0.15); float side = 1.0 - smoothstep(0.7, 1.0, abs(vUv.x - 0.5) * 2.0);
      float alpha = side * smoothstep(0.0, 0.55, vUv.y) * 0.85; gl_FragColor = vec4(col * uLight, alpha);
      #include <colorspace_fragment>
    }`;
  // (Water.tsx output is sRGB-encoded but NOT tone mapped = display-referred: on the composite's linear target it is written as its
  //  inverse-tone-mapped pre-image, so the composite's one tone-mapping pass gives back exactly the plain-path colour)
  Object.assign(wShared, LCU);
  const wFS = (src) => (LC ? 'uniform float uLcExposure;\n' + LC.DISPLAY_GLSL + '\n' + src.replace('#include <colorspace_fragment>', 'gl_FragColor.rgb = lcLinearToTarget( gl_FragColor.rgb );\n      #include <colorspace_fragment>') : src);
  const streamMat = new THREE.ShaderMaterial({ transparent: true, uniforms: wShared, vertexShader: W_VS_UV, fragmentShader: wFS(streamFS), polygonOffset: true, polygonOffsetFactor: -1 });
  const fallMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: wShared, vertexShader: W_VS_UV, fragmentShader: wFS(fallFS) });
  const WATER_MESHES = [];
  function waterPoly(group, pc, outline, level, centre, radius) {   // Water.tsx Pond: ShapeGeometry in the mesh's xy, mesh rotated flat
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x - centre[0], -(z - centre[1]))));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.ShaderMaterial({ transparent: true, uniforms: { ...wShared, uRadius: { value: radius } }, vertexShader: W_VS_P, fragmentShader: wFS(pondFS) }));
    m.rotation.x = -Math.PI / 2; m.position.set(centre[0] - pc.pivot[0], level - pc.pivot[1], centre[1] - pc.pivot[2]); m.renderOrder = 1; group.add(m); WATER_MESHES.push(m);
  }
  function waterRibbon(group, pc, pts, widthAt, levelAt, mat, uvScale = 1.4) {   // Water.tsx ribbon(): uv.x along, uv.y across
    const pos = [], uv = [], idx = []; let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const hw = widthAt(i) / 2, y = levelAt(i) - pc.pivot[1];
      pos.push(pts[i][0] - tz * hw - pc.pivot[0], y, pts[i][1] + tx * hw - pc.pivot[2], pts[i][0] + tz * hw - pc.pivot[0], y, pts[i][1] - tx * hw - pc.pivot[2]);
      uv.push(s * uvScale, 0, s * uvScale, 1);
      if (i < pts.length - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.renderOrder = 2; group.add(m); WATER_MESHES.push(m); return m;
  }
  function waterfall(group, pc, fall, dir, width) {   // Water.tsx fallMat on a vertical strip down the exported fall points
    const ctrl = fall.map((p) => new THREE.Vector3(p[0], p[1], p[2])), curve = new THREE.CatmullRomCurve3(ctrl), n = 28, sx = -dir[1], sz = dir[0];
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) { const t = i / n, p = curve.getPointAt(t), hw = width / 2 * (1 + 0.35 * t);
      pos.push(p.x - sx * hw - pc.pivot[0], p.y - pc.pivot[1], p.z - sz * hw - pc.pivot[2], p.x + sx * hw - pc.pivot[0], p.y - pc.pivot[1], p.z + sz * hw - pc.pivot[2]);
      uv.push(0, 1 - t, 1, 1 - t); if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const m = new THREE.Mesh(g, fallMat); m.renderOrder = 3; group.add(m); WATER_MESHES.push(m);
  }
  // ---- WATER v2 (?water=v2|legacy, the water revamp PR 1 preview; art/specs/2026-10-23-water-revamp-design.md): the baked
  //      water_<piece>.glb + maps (bake-water.mjs, shipped by build.mjs), one MeshLambertMaterial per body patched by
  //      lib/water-core.mjs patchWaterLambert (scene lights, shadows, fog, tone mapping for free). ?waterdebug=depth|shore|flow|bands,
  //      ?waterTier=phone|mid. window.__water = { mode, ready, tier, debug, bodies, misses } ----
  // (review I3) the preset's water.bakedDepth picks v2 by default (Game (current) = false = the revert); ?water=v2|legacy overrides
  const WATER_MODE = CFG.water && window.__WATER_CORE__ && (QS.get('water') === 'v2' || (QS.get('water') !== 'legacy' && !!(LOOK.preset.water && LOOK.preset.water.bakedDepth))) ? 'v2' : 'legacy';
  const WDBG = { depth: 1, shore: 2, flow: 3, bands: 4 }[QS.get('waterdebug')] || 0, WTIER = QS.get('waterTier') === 'phone' ? 'phone' : 'mid';
  const WV2 = { mode: WATER_MODE, ready: false, tier: WTIER, debug: WDBG, bodies: {}, misses: [], puffs: [], mats: [] };
  window.__water = WV2;
  const wU = { uScrollA: { value: new THREE.Vector2() }, uScrollB: { value: new THREE.Vector2() }, uCausticOff: { value: new THREE.Vector2() }, uGlintOff: { value: new THREE.Vector2() }, uFoamPhase: { value: 0 }, uFlowPhase: { value: 0 }, uRibbonPhase: { value: 0 }, uRibbonPhaseB: { value: 0 },
    uFallPhase1: { value: 0 }, uFallPhase2: { value: 0 }, uSkyHorizon: { value: new THREE.Color() }, uSkyZenith: { value: new THREE.Color() }, uBands: { value: new THREE.Vector2(0.08, 0.22) },
    uBandSoft: { value: 0.015 }, uShoreBand: { value: 0.35 }, uFoamLine: { value: 0.5 }, uSkyMix: { value: 0.25 }, uGlint: { value: 0.6 }, uCaustics: { value: 0.35 },
    // (rev 1) L11 ripples: the phases (CPU-wrapped), and the hook for the game's duck / heron rings (unused here: all 0)
    // explicit zeros: THREE.Vector4's constructor defaults w to 1, which for a hook entry is the ring strength (a phantom ring at world 0, 0)
    uRipplePhase: { value: new THREE.Vector4(0, 0, 0, 0) }, uRippleFlow: { value: 0 }, uRippleClock: { value: 0 }, uRipple: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] } };
  function waterV2Uniforms(t) {   // phases, not time: wrapped on the CPU (water-core waterPhases), + the preset's water keys + sky colours
    const WC = window.__WATER_CORE__, p = LOOK.preset, Wp = p.water || {}, ph = WC.waterPhases(t, Wp);
    wU.uScrollA.value.set(ph.scrollA[0], ph.scrollA[1]); wU.uScrollB.value.set(ph.scrollB[0], ph.scrollB[1]);
    wU.uCausticOff.value.set(ph.causticOff[0], ph.causticOff[1]); wU.uGlintOff.value.set(ph.glintOff[0], ph.glintOff[1]); wU.uRibbonPhaseB.value = ph.ribbonB;
    wU.uFoamPhase.value = ph.foam; wU.uFlowPhase.value = ph.flow; wU.uRibbonPhase.value = ph.ribbon; wU.uFallPhase1.value = ph.fall1; wU.uFallPhase2.value = ph.fall2;
    if (ph.ripple) { const rp = ph.ripple; wU.uRipplePhase.value.set(rp.ringA, rp.ringB, rp.epochA, rp.epochB); wU.uRippleFlow.value = rp.chevron; wU.uRippleClock.value = rp.clock; }
    wU.uSkyHorizon.value.set(p.sky.horizon); wU.uSkyZenith.value.set(p.sky.zenith || p.sky.top || p.sky.horizon);
    if (Wp.bands) wU.uBands.value.set(Wp.bands.shallow, Wp.bands.deep);
    for (const [k, u] of [['bandSoft', 'uBandSoft'], ['shoreBand', 'uShoreBand'], ['foamLine', 'uFoamLine'], ['skyMix', 'uSkyMix'], ['glint', 'uGlint'], ['caustics', 'uCaustics']]) if (typeof Wp[k] === 'number') wU[u].value = Wp[k];
    for (const m of WV2.mats) { const c = WC.bodyColours(Wp, CFG.water.json, m.palette);   // (review I3: panel edits of water.bodies.* reach the materials live)
      m.U.uShallow.value.set(c.shallow); m.U.uMid.value.set(c.mid); m.U.uDeep.value.set(c.deep); m.U.uFoamCol.value.set(c.foam); m.U.uBed.value.set(c.bed);
      if (m.palette2) { const c2 = WC.bodyColours(Wp, CFG.water.json, m.palette2); m.U.uShallow2.value.set(c2.shallow); m.U.uMid2.value.set(c2.mid); m.U.uDeep2.value.set(c2.deep); m.U.uFoamCol2.value.set(c2.foam); m.U.uBed2.value.set(c2.bed); } }   // (rev 1: the join / brink's second palette)
    const on = Wp.fallMist !== false, wetDocked = !!(PG.wetland && PG.wetland.group.visible !== false);   // (MAIN's fall + mist only while the wetland is undocked)
    for (const [k, m] of Object.entries(WV2.meshes || {})) if (k === 'main:water_fall' || k === 'main:water_fall_skirt') m.visible = !wetDocked;
    for (const q of WV2.puffs) {
      const E = q.ex, loop = E.loop || 6, ph2 = (((t / loop) + q.i / q.n) % 1 + 1) % 1, sz = E.size ? E.size[0] + (E.size[1] - E.size[0]) * ph2 : 1, o = E.out || [0, 0];
      if (q.kind === 'steam') q.s.position.set(q.base.x + Math.sin(q.i * 2.4) * 0.12, q.base.y + (E.rise || 0.25) * loop * ph2, q.base.z + Math.cos(q.i * 2.4) * 0.12);
      else q.s.position.set(q.base.x + o[0] * (0.15 * loop * ph2 + (q.i % 2) * 0.3) + o[1] * (q.i - q.n / 2) * 0.25, q.base.y - (E.speed || 0.3) * loop * ph2 + 1.2, q.base.z + o[1] * (0.15 * loop * ph2 + (q.i % 2) * 0.3) - o[0] * (q.i - q.n / 2) * 0.25);
      q.s.scale.setScalar(sz); q.s.material.opacity = (E.alphaMax || 0.5) * Math.sin(Math.PI * ph2); q.s.visible = on && !(q.id === 'main' && wetDocked);
    }
  }
  let puffTex = null;
  function puffTexture() {
    if (puffTex) return puffTex;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');   // look-scan: allow (alpha mask; the colour comes from the palette)
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); puffTex = new THREE.CanvasTexture(c); puffTex.generateMipmaps = false; puffTex.minFilter = THREE.LinearFilter; return puffTex;
  }
  function waterV2() {
    const WC = window.__WATER_CORE__, WJ = CFG.water, loader = new GLTFLoader();
    // (linear data, NoColorSpace; the proof keeps the S1 rule - no generated mipmaps on canvas / data textures - so it filters linearly
    //  without mips; the game's loader (PR 2) builds GPU mipmaps, as the spec says)
    const dataTex = (buf, w, h, fmt, wrap) => { const t = new THREE.DataTexture(new Uint8Array(buf), w, h, fmt, THREE.UnsignedByteType); t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = wrap;
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.unpackAlignment = 1; t.needsUpdate = true; return t; };
    return fetch(WJ.noiseFile).then((r) => r.arrayBuffer()).then((nb) => {
      const noise = dataTex(nb, WJ.json.noise.size[0], WJ.json.noise.size[1], THREE.RGFormat, THREE.RepeatWrapping);
      return Promise.all(Object.entries(WJ.json.pieces).map(([id, P]) => Promise.all([fetch(WJ.files[id].map).then((r) => r.arrayBuffer()), loader.loadAsync(WJ.files[id].glb)]).then(([mb, gltf]) => {
        const map = dataTex(mb, P.map.size[0], P.map.size[1], THREE.RGBAFormat, THREE.ClampToEdgeWrapping), group = PG[id] && PG[id].group; if (!group) return;
        for (const b of P.bodies) {
          const node = gltf.scene.getObjectByName(b.node); if (!node) { WV2.misses.push(id + ':' + b.node + ' missing'); continue; }
          const pal = WJ.json.palettes[b.palette] || WJ.json.palettes.river;
          if (b.kind === 'mist' || b.kind === 'steam') {
            const ex = node.userData || {}, n = (ex.puffs && ex.puffs[WTIER]) || 3, col = b.kind === 'mist' ? pal.bed : pal.foam;
            for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTexture(), color: new THREE.Color(col), transparent: true, depthWrite: false, opacity: 0, fog: true }));
              s.renderOrder = 6; group.add(s); WV2.puffs.push({ s, i, n, ex, base: node.position.clone(), kind: b.kind, id }); }
            continue;
          }
          let src = node.isMesh ? node : null; if (!src) node.traverse((o) => { if (!src && o.isMesh) src = o; }); if (!src) continue;
          if (b.kind === 'skirt') {   // (rev 1) a fall's depth-only skirt: no colour, keeps the depth surface smooth past the brink (the ink pass); no polygon offset (W15d)
            const sm = new THREE.Mesh(src.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
            sm.renderOrder = 1; sm.name = 'water:' + id + ':' + b.node; group.add(sm); (WV2.meshes = WV2.meshes || {})[id + ':' + b.node] = sm; WV2.bodies[id + ':' + b.node] = { kind: 'skirt' }; continue;
          }
          const kind = b.kind, mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(pal.mid), transparent: true, depthWrite: kind !== 'fall', side: kind === 'fall' ? THREE.DoubleSide : THREE.FrontSide });
          mat.userData.celKind = 'none';   // (the water's own posterisation rules)
          if (kind === 'fall') mat.emissive = new THREE.Color(pal.shallow).multiplyScalar(0.35);   // (a falling sheet is lit through: never darker than a third of its body tone)
          const U = { ...wU, uWaterMap: { value: map }, uWaterNoise: { value: noise }, uMapOrigin: { value: new THREE.Vector2(P.map.origin[0], P.map.origin[1]) },
            uMapExtent: { value: new THREE.Vector2(P.map.size[0] * P.map.texel, P.map.size[1] * P.map.texel) }, uShallow: { value: new THREE.Color(pal.shallow) }, uMid: { value: new THREE.Color(pal.mid) },
            uDeep: { value: new THREE.Color(pal.deep) }, uFoamCol: { value: new THREE.Color(pal.foam) }, uBed: { value: new THREE.Color(pal.bed) }, uVirtual: { value: b.virtual ? 1 : 0 },
            uUStart: { value: b.uStart || 0 }, uLength: { value: b.length || 1 }, uFill: { value: 1 } };
          // (rev 1) the farm pond + stream's join (flow ramp, palette hand-over), a fall's brink and the river's virtual head: their uniforms
          const pal2 = (to) => { const p2 = WJ.json.palettes[to] || pal; return { uShallow2: { value: new THREE.Color(p2.shallow) }, uMid2: { value: new THREE.Color(p2.mid) }, uDeep2: { value: new THREE.Color(p2.deep) }, uFoamCol2: { value: new THREE.Color(p2.foam) }, uBed2: { value: new THREE.Color(p2.bed) } }; };
          if (b.join) Object.assign(U, { uJoin: { value: new THREE.Vector4(b.join.u0, b.join.ramp, b.join.uEnd, b.join.handover) }, ...pal2(b.join.to) });
          if (b.brink) Object.assign(U, { uBrink: { value: new THREE.Vector2(b.brink.start || 0, b.brink.len) }, ...pal2(b.brink.to) });
          if (b.vhead) U.uVHead = { value: new THREE.Vector2(b.vhead[0], b.vhead[1]) };
          const RIP = !!b.ripples && kind !== 'fall' && QS.get('ripples') !== '0';   // (rev 1: L11 ripples; ?ripples=0 turns them off for an A/B)
          if (RIP) { U.uRippleDensity = { value: b.ripples.density || 0 }; U.uRippleShore = { value: b.ripples.shore || 0 }; }
          const opts = { kind, tier: WTIER, flow: !!b.flow && kind === 'still', debug: WDBG, join: !!b.join, brink: !!b.brink, vhead: !!b.vhead, ripple: RIP };
          WV2.mats.push({ U, palette: b.palette, palette2: b.join ? b.join.to : b.brink ? b.brink.to : null });
          addPatch(mat, `water:${kind}:${WTIER}:${opts.flow ? 1 : 0}:${WDBG}:${opts.join ? 1 : 0}${opts.brink ? 1 : 0}${opts.vhead ? 1 : 0}${RIP ? 1 : 0}`, (sh) => { const r = WC.patchWaterLambert(sh.vertexShader, sh.fragmentShader, opts); if (!r.applied) { WV2.misses.push(b.node + ': ' + r.misses.join(', ')); return; }
            sh.vertexShader = r.vertexShader; sh.fragmentShader = r.fragmentShader; Object.assign(sh.uniforms, U); });   // (one program per kind / tier / flow / debug: the patch key is the cache key)
          const m = new THREE.Mesh(src.geometry, mat); m.name = 'water:' + id + ':' + b.node; m.renderOrder = kind === 'still' ? 2 : kind === 'ribbon' ? 3 : 5; m.receiveShadow = WTIER === 'mid'; m.castShadow = false;
          group.add(m); WV2.bodies[id + ':' + b.node] = { kind, tris: src.geometry.index ? src.geometry.index.count / 3 : 0 }; (WV2.meshes = WV2.meshes || {})[id + ':' + b.node] = m;
        }
      })));
    }).then(() => { waterV2Uniforms(1.5); try { renderer.compile(scene, camera); } catch (e) { /* first frame compiles */ } WV2.ready = true; })
      .catch((e) => { console.error('[water v2] failed, legacy water instead', e); WV2.mode = 'legacy (fallback)'; WV2.error = String(e); legacyWater(); WV2.ready = true; });
  }
  function addWater() {
    if (!WATER) return;
    if (WATER_MODE === 'v2') { waterV2(); return; }
    legacyWater();
  }
  function legacyWater() {
    const W = COMP.water, LP = W.main.pond.legacy || W.main.pond;   // (water rev 1: legacy = the game's water today: its blob pond + Water.tsx stream)
    const pondPts = []; for (let i = 0; i < 40; i++) { const t = i / 40 * Math.PI * 2; pondPts.push([LP.at[0] + Math.cos(t) * LP.r, LP.at[1] + Math.sin(t) * LP.r]); }
    waterPoly(PG.main.group, BP.pieces.main, pondPts, W.main.pond.level, LP.at, LP.r);
    const sp = (W.main.stream.legacy || W.main.stream).points, dense = GT.resamplePolyline(GT.catmullRomCentripetal(sp.map((p) => [p.x, p.z]), 6), 0.2);
    waterRibbon(PG.main.group, BP.pieces.main, dense, (i) => 0.42 + 0.12 * (i / (dense.length - 1)), (i) => { const t = i / (dense.length - 1); return t < 0.95 ? BP.Hpre(dense[i][0], dense[i][1]) + 0.075 : BP.streamEndLevel; }, streamMat);
    const lk = BP.feats.find((f) => f.id === A.blueprint.water.lake.feature);
    waterPoly(PG.wetland.group, BP.pieces.wetland, W.wetland.lake.outline, W.wetland.lake.level, lk.at, 0.5 * (lk.r + (lk.rz || lk.r)));
    for (const key of ['river', 'outflow']) {   // (the outflow is drawn up to the cliff lip; the fall takes over there)
      const pts = W.wetland[key].points.filter((p) => key !== 'outflow' || BP.dcAt(p.x, p.z) > 0.02);
      waterRibbon(PG.wetland.group, BP.pieces.wetland, pts.map((p) => [p.x, p.z]), (i) => pts[i].width, (i) => pts[i].level, streamMat);
    }
    const fp = W.wetland.waterfall.points, of = W.wetland.outflow.points, o1 = of[of.length - 1], o0 = of[of.length - 2], ol = Math.hypot(o1.x - o0.x, o1.z - o0.z) || 1;
    waterfall(PG.wetland.group, BP.pieces.wetland, fp, [(o1.x - o0.x) / ol, (o1.z - o0.z) / ol], WL.fallWidth || 0.8);
    const tf = BP.feats.find((f) => f.id === A.blueprint.water.tarn.feature), hs = BP.feats.find((f) => f.id === A.blueprint.water.hotSpring.feature);
    waterPoly(PG.highland.group, BP.pieces.highland, W.highland.tarn.outline, W.highland.tarn.level, tf.at, tf.r);
    waterPoly(PG.highland.group, BP.pieces.highland, W.highland.hotSpring.outline, W.highland.hotSpring.level, hs.at, hs.r);
  }

  // ---- STAIRS (v4): stone step slabs laid on each stair ramp (archipelago.blueprint.stairs; look.stairs) ----
  const stepGeo = new THREE.BoxGeometry(1, 1, 1), stepMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });   // look-scan: allow (white base; per-instance palette colours)
  stepMat.userData.celKind = 'building';
  function addStairs() {
    const ST = (A.look && A.look.stairs) || { stepRise: 0.25, tokens: ['Stone', 'DarkStone'], width: 0.9 }, per = {};
    for (const S of BP.stairs || []) {
      const mx = (S.from[0] + S.to[0]) / 2, mz = (S.from[1] + S.to[1]) / 2, id = GT.pieceAt(BP, mx, mz); if (!id) continue;
      const rise = S.h1 - S.h0, n = Math.max(3, Math.round(Math.abs(rise) / ST.stepRise)), rot = Math.atan2(S.dx, S.dz);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, top = S.h0 + rise * (i + 1) / n, h = Math.abs(rise) / n;
        (per[id] = per[id] || []).push({ x: S.from[0] + S.dx * t, z: S.from[1] + S.dz * t, y: top - h, rot, w: S.width * ST.width, h: 2 * h, d: S.len / n * 1.04, c: ST.tokens[i % ST.tokens.length] }); }
    }
    for (const [id, list] of Object.entries(per)) {
      const pc = BP.pieces[id], im = new THREE.InstancedMesh(stepGeo, stepMat, list.length);
      list.forEach((s, i) => { _v.set(s.x - pc.pivot[0], s.y - pc.pivot[1], s.z - pc.pivot[2]); _q.setFromEuler(_e.set(0, s.rot, 0)); _m4.compose(_v, _q, _sc.set(s.w, s.h, s.d)); im.setMatrixAt(i, _m4); im.setColorAt(i, col(s.c)); });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.name = 'stairs:' + id; PG[id].group.add(im);
    }
  }

  // ---- debug overlay: reserved footprints (missing assets), seams, pivots ----
  const FPC = { building: '#d85a3a', restoration: '#a660c8', prop: '#e0a23a', tree: '#3a9a50', animals: '#3a7ad8', spot: '#20a0a0', core: '#ffffff', water: '#2060ff' };   // look-scan: allow (debug overlay)
  function debugOverlay() {
    const line = (group, pc, pts, colour, lift = 0.08) => { const v = pts.map(([x, z]) => local(pc, x, z, lift)); group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(v), new THREE.LineBasicMaterial({ color: colour, depthTest: false }))); };
    for (const id of BP.order) {
      const pc = BP.pieces[id], g = PG[id].group;
      for (const f of COMP.pieces[id].footprints) {
        const ring = []; for (let i = 0; i <= 32; i++) { const t = i / 32 * Math.PI * 2; ring.push([f.x + Math.cos(t) * f.r, f.z + Math.sin(t) * f.r]); }
        line(g, pc, ring, FPC[f.kind] || '#ff00ff');   // look-scan: allow (debug overlay)
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), new THREE.MeshBasicMaterial({ color: FPC[f.kind] || '#ff00ff' }));   // look-scan: allow (debug overlay)
        post.position.copy(local(pc, f.x, f.z, 0.45)); g.add(post);
      }
      line(g, pc, pc.loopWorld.concat([pc.loopWorld[0]]), '#ffffff', 0.12);   // look-scan: allow (debug overlay)
      const piv = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3366' })); piv.position.set(0, 0.2, 0); g.add(piv);   // look-scan: allow (debug overlay)
    }
    console.log('[debug] footprints', BP.order.map((id) => id + ':' + COMP.pieces[id].footprints.length).join(' '));
  }

  // ---- composition (after the models load) ----
  const loaded = {}, PLACED = { seed: SEED, trees: [], rocks: [], pieces: {} };
  window.__placements = PLACED;
  function firstMesh(root) { let f = null; root.traverse((o) => { if (!f && o.isMesh) f = o; }); return f; }
  // INSTANCING (v4): every repeated model (trees, bushes, rocks, contact shadows, stair steps) is ONE InstancedMesh per
  // sub-mesh per piece group (pieces still rise independently), so the dense woodland costs a handful of draw calls.
  // items: [{ x, z, s, rot, sx, sy, sz, lift, tint }] (world xz; placed on the piece surface)
  // Every mesh part of the model is drawn (a painterly tree: the bark on its root, the leaves and tree_fruit's apples in `Canopy`; a
  // multi-primitive node = one Mesh per primitive), each with the instance matrix x its node matrix relative to the model root.
  // opts.crownTint (the painterly trees): the parts at or under a node named `Canopy` get an instanceColor = GT.texturedTint
  // (applyTreeTints, CROWN_IMS); the bark and every other part stay untinted.
  // opts.itemTint (the ground cover, plan Task 4): every part takes the item's own exported tint (the near-white multiplier, darker on the
  // shade-pool clover) as its instanceColor, as the game's paintOf does ('tint'); an item without one is white.
  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _sc = new THREE.Vector3(), _tc = new THREE.Color();
  const inCanopy = (o, root) => { for (let q = o; q && q !== root; q = q.parent) if (q.name === 'Canopy') return true; return false; };
  function instanced(group, pc, src, items, opts = {}) {
    if (!src || !items.length) return [];
    src.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert(), parts = [];
    src.traverse((o) => { if (o.isMesh) parts.push({ mesh: o, rel: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) }); });
    const out = [];
    for (const { mesh, rel } of parts) {
      const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, items.length);
      const leafy = opts.tree && !opts.crownTint && isLeafy(mesh.material);   // flat-coloured tree canopies: an instanceColor (white = untinted; canopy.instanceTint)
      const itemTint = !!opts.itemTint, crown = !!opts.crownTint && inCanopy(mesh, src);   // a painted crown part (white until applyTreeTints; never the green-relative tint)
      items.forEach((it, i) => {
        _v.copy(local(pc, it.x, it.z, it.lift || 0)); _q.setFromEuler(_e.set(0, it.rot || 0, 0)); _sc.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sz || 1));
        _m4.compose(_v, _q, _sc).multiply(rel); im.setMatrixAt(i, _m4);
        if (leafy || crown) im.setColorAt(i, _tc.setRGB(1, 1, 1));
        else if (itemTint) im.setColorAt(i, it.tint ? _tc.setRGB(it.tint[0], it.tint[1], it.tint[2]) : _tc.setRGB(1, 1, 1));
      });
      if (leafy) TREE_IMS.push({ im, items, ref: mesh.material.color.clone() });
      if (crown) CROWN_IMS.push({ im, items });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = opts.cast !== false; im.receiveShadow = true; im.frustumCulled = false;
      if (opts.tree) im.userData.tree = true; im.name = (opts.name || 'inst') + ':' + pc.id;
      group.add(im); out.push(im);
    }
    return out;
  }
  const contactGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  function contacts(group, pc, items, name = 'contacts') {   // instanced soft contact shadows: items [{ x, z, rx, rz, rot? }]
    if (!items.length) return null;
    const im = new THREE.InstancedMesh(contactGeo, shadowMat, items.length);
    items.forEach((it, i) => { _v.copy(local(pc, it.x, it.z, 0.03)); _m4.compose(_v, _q.setFromEuler(_e.set(0, it.rot || 0, 0)), _sc.set(it.rx, 1, it.rz)); im.setMatrixAt(i, _m4); });
    im.instanceMatrix.needsUpdate = true; im.renderOrder = 1; im.frustumCulled = false; im.name = name + ':' + pc.id; group.add(im); return im;
  }

  // ==== MESHY SET PIECES (proof only) ===========================================================================================
  // The approved AI-made models (art/meshy/<id>/<id>.glb, finished by scripts/meshy/finish.mjs, shipped as .wasm by build.mjs
  // PROOF_EXTRAS) placed WITHOUT touching the frozen layout (seed 11): game slots (layout.ts WINDMILL / WELL / BENCH, the meadow's
  // haystack zones), one existing tree position (the hero tree replaces that tree in both tree sets), the existing rock instances
  // (boulder_c takes a hash-picked third of them; rock_a / rock_b themselves are boulder_a / boulder_b via PROOF_OVERRIDES) and
  // spots checked free of paths, stairs, trees, flat zones and water (cart, outcrops). Every base is set on the lowest ground under
  // its footprint (no floating on slopes); contact shadows join each piece's instanced contact batch (no extra draw calls); only
  // the big pieces cast shadows (draw-call budget). Shown under every preset. window.__meshy = the placements (meshy.browser.mjs).
  const MESHY_SET = {
    // the hero tree stands where the game's biggest round tree (layout.ts STATIC_TREES[0], s 1.55) stands: right behind the
    // farmhouse, so its crown frames the house from the farm view and the gameplay cameras; broad side (+Z) to the camera (az 45)
    hero: { piece: 'main', at: [-6.4, -3.6], rot: Math.PI / 4, contact: [2.7, 1.9], cast: true },   // (contact: the 3.4 u tree's 4.2 x 2.8 footprint)
    pieces: [
      // windmill at layout.ts WINDMILL; its door (+Z) faces the stone path that ends at (0.85, -4.3) (rot 0.124), so the sails
      // show three-quarter to the gameplay camera and the glowing window (+X) faces it
      { id: 'windmill', piece: 'main', slot: 'WINDMILL', rot: 0.124, cast: true, contact: [2.4, 2.4] },
      { id: 'well', piece: 'main', slot: 'WELL', rot: Math.PI / 4, cast: true, contact: [1.15, 1.15] },
      { id: 'bench', piece: 'main', slot: 'BENCH', cast: false, contact: [1.15, 0.62] },
      { id: 'haystack', piece: 'meadow', zone: 'haystack_a', rot: 0.35, cast: false, contact: [1.2, 1.2] },
      { id: 'haystack', piece: 'meadow', zone: 'haystack_b', rot: 2.2, cast: false, contact: [1.2, 1.2] },
      // cart: a free spot beside haystack_a (1.37 u), 1.1 u clear of the to_meadow path, outside the shelter / pasture zones
      { id: 'cart', piece: 'meadow', at: [5.75, 12.25], rot: 2.5, cast: false, contact: [1.0, 1.45] },
      // outcrops: against the highland mesa risers (tree-free riser feet, >= 1.8 u from the paths / stairs) and on the islet's open
      // coast, where they break the long straight riser / coast-wall lines seen from the gameplay cameras and the edge view
      { id: 'outcrop_a', piece: 'highland', at: [-6.39, -15.81], rot: 0.384, cast: true, contact: [2.0, 1.8] },   // upper riser, theta 248
      { id: 'outcrop_b', piece: 'highland', at: [-13.03, -10.18], rot: 2.48, s: 0.85, cast: true, contact: [2.4, 3.2] },   // upper riser, theta 218: a ledge stepping down along the cliff face
      { id: 'outcrop_a', piece: 'islet', at: [24.28, 0.0], rot: 1.571, s: 0.9, cast: true, contact: [1.8, 1.6] },   // islet coast, theta 0
    ],
    underside: { piece: 'main', rot: 2.3, joined: { s: 1.5 }, main: { s: 0.6 }, margin: 0.6, haze: 0.6 },
    rockC: 0.34,   // share of the rock instances drawn as boulder_c (hash of the position, not the RNG)
    bladeSpeed: 0.55,   // rad / s on the shared animation clock (frozen at rest in captures)
  };
  const MESHY = { placed: [], hero: null, blades: null, underside: null, undersideFit: null };
  window.__meshy = MESHY;
  const isRockC = (r) => hash01(r.x + 0.37, r.z - 0.11) < MESHY_SET.rockC;
  // lowest ground under an (elliptic, rotated) footprint, relative to the centre: the base goes there so nothing hovers on a slope
  function footSink(pc, x, z, rx, rz, rot) {
    const g0 = pc.height(x - pc.pivot[0], z - pc.pivot[2]); let lo = 0;
    for (const f of [0.5, 1]) for (let k = 0; k < 16; k++) { const t = k / 16 * Math.PI * 2, lx = Math.cos(t) * rx * f, lz = Math.sin(t) * rz * f;
      const wx = x + lx * Math.cos(rot) + lz * Math.sin(rot), wz = z - lx * Math.sin(rot) + lz * Math.cos(rot);
      lo = Math.min(lo, pc.height(wx - pc.pivot[0], wz - pc.pivot[2]) - g0); }
    return lo;
  }
  function meshyPlan() {
    const G = A.game, Z = A.blueprint.zones, contacts = {}, items = [];
    let hero = null;
    if (loaded.hero_tree) { const H = MESHY_SET.hero, list = COMP.pieces[H.piece].trees; let best = null, bd = Infinity;
      for (const t of list) { const d = Math.hypot(t.x - H.at[0], t.z - H.at[1]); if (d < bd) { bd = d; best = t; } }
      if (best && bd < 0.05) { hero = { ...H, x: best.x, z: best.z, tree: best }; items.push({ id: 'hero_tree', piece: H.piece, x: best.x, z: best.z, rot: H.rot, s: 1, cast: H.cast, contact: H.contact, hero: true }); } }
    for (const P of MESHY_SET.pieces) { if (!loaded[P.id]) continue;
      let at = P.at, rot = P.rot || 0;
      if (P.slot) { const v = G[P.slot]; at = Array.isArray(v) ? v : [v.x, v.z]; if (!Array.isArray(v) && v.rot != null && P.rot == null) rot = v.rot; }
      if (P.zone) at = Z[P.piece].find((z) => z.id === P.zone).at;
      items.push({ ...P, x: at[0], z: at[1], rot, s: P.s || 1, slotAt: P.slot || P.zone ? at.slice() : null }); }
    for (const it of items) { const pc = BP.pieces[it.piece], [rx, rz] = it.contact;
      it.lift = Math.max(-0.6, footSink(pc, it.x, it.z, rx * 0.42, rz * 0.42, it.rot)) - 0.01;   // footprint ~ the contact blob inner part
      (contacts[it.piece] = contacts[it.piece] || []).push({ x: it.x, z: it.z, rx, rz, rot: it.rot }); }
    return { items, contacts, hero };
  }
  function placeMeshy(MZ) {
    const groups = {};   // the two haystacks: one InstancedMesh (one draw call)
    for (const it of MZ.items) { const pc = BP.pieces[it.piece], g = PG[it.piece].group, src = loaded[it.id];
      if (it.id === 'haystack') { (groups[it.piece + ':' + it.id] = groups[it.piece + ':' + it.id] || []).push(it); continue; }
      const o = src.clone(true); o.name = 'meshy:' + it.id; o.scale.setScalar(it.s); o.position.copy(local(pc, it.x, it.z, it.lift)); o.rotation.y = it.rot;
      o.traverse((m) => { if (m.isMesh) { m.castShadow = !!it.cast; m.receiveShadow = true; } });
      g.add(o); MESHY.placed.push({ id: it.id, piece: it.piece, x: it.x, z: it.z, rot: it.rot, s: it.s, lift: it.lift, slotAt: it.slotAt, obj: o });
      if (it.id === 'windmill') MESHY.blades = o.getObjectByName('Blades');
      if (it.hero) MESHY.hero = { x: it.x, z: it.z, obj: o, canopy: o.getObjectByName('Canopy') }; }
    for (const list of Object.values(groups)) { const it0 = list[0], pc = BP.pieces[it0.piece];
      const ims = instanced(PG[it0.piece].group, pc, loaded[it0.id], list.map((it) => ({ x: it.x, z: it.z, s: it.s, rot: it.rot, lift: it.lift })), { cast: !!it0.cast, name: 'meshy:' + it0.id });
      list.forEach((it, i) => MESHY.placed.push({ id: it.id, piece: it.piece, x: it.x, z: it.z, rot: it.rot, s: it.s, lift: it.lift, slotAt: it.slotAt, im: ims[0], index: i })); }
    // the island underside: hangs under MAIN, in MAIN's group; its fit follows the unlock state (meshyUnderside, from applyState)
    if (loaded.underside) { const o = loaded.underside.clone(true); o.name = 'meshy:underside';
      o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false;   // (out of the shadow fit: it would only widen the frustum)
        // the island's UNDERSIDE HAZE (preset stone.fade, the same uniforms as islandMat): it fades into the haze with depth like the
        // rock cone it hangs from, instead of reading as a dark blob against the cloud sea
        addPatch(m.material, 'undersideHaze', (sh) => { Object.assign(sh.uniforms, hazeU, LCU);
          sh.vertexShader = 'varying float vHazeY;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvHazeY = (modelMatrix * vec4(transformed, 1.0)).y;');
          sh.fragmentShader = 'uniform vec4 uHaze;\nuniform vec2 uHazeY;\nuniform float uLcExposure;\nvarying float vHazeY;\n' + sh.fragmentShader
            .replace('void main() {', (LC ? LC.DISPLAY_GLSL : 'vec3 lcDisplayToTarget(vec3 c) { return c; }') + '\nvoid main() {')
            .replace('#include <fog_fragment>', '#include <fog_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, lcDisplayToTarget(uHaze.rgb), ' + MESHY_SET.underside.haze.toFixed(2) + ' * uHaze.a * (1.0 - smoothstep(uHazeY.x, uHazeY.y, vHazeY)));'); }); } });   // (x haze: a little less than the rock, so its roots / vines still read)
      const b = new THREE.Box3().setFromObject(loaded.underside), top = [];   // top rim: the model's own vertices in its top 4 % (origin = top centre, --hang)
      loaded.underside.traverse((m) => { if (!m.isMesh) return; const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i += 3) if (p.getY(i) > b.min.y * 0.04) top.push([p.getX(i), p.getZ(i)]); });
      PG[MESHY_SET.underside.piece].group.add(o); MESHY.underside = { obj: o, top, height: -b.min.y }; }
    meshyUnderside();
  }
  // where the underside hangs: under the JOINED island (every petal docked) the visible bottom under MAIN is the petals' skirt at the
  // core's U(x, z) (lib/terrain.mjs), deepest at MAIN's axis; with petals missing it is MAIN's own cone (blueprint.mainCone).
  // The model's top sits MARGIN above the highest bottom-surface point over its top rim (+ interior), so the flat top is always
  // inside the rock (hidden, no gap) and the rest hangs out below the tip.
  const _uv = new THREE.Vector3();
  function mainConeY(x, z) {
    const MC = A.blueprint.mainCone, r = Math.hypot(x, z), Rm = BP.Rm(Math.atan2(z, x)), R = MC.rings.map(([rf, yf]) => [rf * Rm, yf * MC.depth]).concat([[0, MC.tipY * MC.depth]]);
    for (let k = 0; k < R.length - 1; k++) { const [r0, y0] = R[k], [r1, y1] = R[k + 1]; if (r <= r0 && r >= r1) return y1 + (y0 - y1) * (r - r1) / Math.max(1e-6, r0 - r1); }
    return r > R[0][0] ? 0 : R[R.length - 1][1];
  }
  function meshyUnderside() {
    const U = MESHY.underside; if (!U) return;
    const petals = BP.order.filter((id) => id !== 'main'), joined = petals.every((id) => PG[id].group.visible !== false && !(DOCK && DOCK.piece === id && DOCK.t < 1));
    const F = joined ? MESHY_SET.underside.joined : MESHY_SET.underside.main, rot = MESHY_SET.underside.rot, c = Math.cos(rot), s = Math.sin(rot);
    const pc = BP.pieces[MESHY_SET.underside.piece], surf = (x, z) => (joined ? BP.U(x, z) : mainConeY(x, z));
    let hi = -Infinity; const pts = U.top.concat(U.top.map(([x, z]) => [x * 0.5, z * 0.5]), [[0, 0]]);
    for (const [x, z] of pts) { const wx = (x * c + z * s) * F.s, wz = (-x * s + z * c) * F.s; hi = Math.max(hi, surf(wx, wz)); }
    const yTop = hi + MESHY_SET.underside.margin;
    U.obj.scale.setScalar(F.s); U.obj.rotation.y = rot; U.obj.position.set(-pc.pivot[0], yTop - pc.pivot[1], -pc.pivot[2]);
    MESHY.undersideFit = { joined, s: F.s, yTop, surfaceMax: hi };
  }
  function populate() {
    const pine = makePine(), pathCol = col('Path'), TV = (A.look && A.look.treeTints) || null;
    prepCanopy(pine, 'pine'); if (loaded.tree_round_a) prepCanopy(loaded.tree_round_a, 'round');   // LOOK-BRIEF phase 2 canopy shading
    // plants stage: the variant / shrub geometries (once) and their two materials; trunk colours from the palette
    const lin3 = (t) => { const c = col(t); return [c.r, c.g, c.b]; }, PV = PLB ? PLB.buildVariants({ trunk: lin3('MutedWood'), trunkDark: lin3('DarkWood').map((c, i) => (c + lin3('MutedWood')[i]) / 2) }) : null;   // (root: half-way to DarkWood, never black in shade)
    const PMESH = {}, PLn = LOOK.preset.plants;
    if (PV) { const mB = plantMaterial('broad'), mC = plantMaterial('conifer');
      if (PLn) { mB.color.set(PLn.ramp.mid); mC.color.set(PLn.conifer.mid); }   // (the tint reference; the ramp replaces the colour in the shader)
      for (const [v, d] of Object.entries(PV)) PMESH[v] = new THREE.Mesh(plantGeometry(d), d.kind === 'conifer' ? mC : mB); }
    const flowerGeo = new THREE.IcosahedronGeometry(0.06, 0); { const pa = flowerGeo.attributes.position, na = flowerGeo.attributes.normal, v = new THREE.Vector3(); for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).normalize(); na.setXYZ(i, v.x, v.y, v.z); } }   // smooth heads (no facet speckle)
    let HOUSE = null;
    const MZ = meshyPlan(), isHero = (id, t) => !!(MZ.hero && id === MZ.hero.piece && t === MZ.hero.tree);   // (Meshy set pieces: see MESHY_SET)
    for (const id of BP.order) {
      const pc = BP.pieces[id], g = PG[id].group, O = COMP.pieces[id];
      PLACED.pieces[id] = { trees: [] };
      const put = (src, x, z, s, rot, opts = {}) => { if (!src) return null; const o = src.clone(true); o.scale.set(s * (opts.sx || 1), s * (opts.sy || 1), s * (opts.sz || 1)); o.position.copy(local(pc, x, z, opts.lift || 0)); o.rotation.y = rot || 0;
        o.traverse((m) => { if (m.isMesh) { m.castShadow = opts.cast !== false; m.receiveShadow = true; } }); g.add(o); return o; };
      const shadows = [], extra = [];   // extra = the plants-stage contact shadows (fences, bushes, shrubs, sheep, garden)
      for (const p of O.props) {
        const o = put(loaded[p.asset], p.x, p.z, p.scale, p.rot, { sz: p.scaleZ || 1, sy: p.scaleY ? p.scaleY / p.scale : 1 });
        if (p.asset === 'farmhouse') { contact(g, pc, p.x, p.z, 3.4, 3.0); HOUSE = { pc, g, x: p.x, z: p.z, rot: p.rot }; } else if (p.asset === 'flowerbed' || p.asset === 'plot') contact(g, pc, p.x, p.z, 1.2, 1.1);
        if (p.asset === 'fence') extra.push({ x: p.x, z: p.z, rx: 0.34, rz: 0.84 * (p.scaleZ || 1), rot: p.rot });
      }
      const byKind = { pine: [], round: [] };
      for (const t of O.trees) {
        const k = hash01(t.x, t.z), tint = TV ? TV[t.kind][Math.floor(k * TV[t.kind].length) % TV[t.kind].length] : null;
        if (!isHero(id, t)) { byKind[t.kind === 'pine' ? 'pine' : 'round'].push({ x: t.x, z: t.z, s: t.scale, rot: t.rot, tint });   // (the hero tree stands here instead)
          const r = 2.2 * t.scale / 0.62 * 0.6; shadows.push({ x: t.x, z: t.z, rx: r, rz: r }); }
        PLACED.trees.push({ x: +t.x.toFixed(2), z: +t.z.toFixed(2), species: t.kind, piece: id }); PLACED.pieces[id].trees.push({ x: +t.x.toFixed(2), z: +t.z.toFixed(2) });
      }
      PLANT.off.push(...instanced(g, pc, pine, byKind.pine, { tree: true, tint: !!TV, name: 'pine' }), ...instanced(g, pc, loaded.tree_round_a, byKind.round, { tree: true, tint: !!TV, name: 'tree_round_a' }));
      if (PV) {   // plants stage: one InstancedMesh per painterly model part per piece (the plants.mjs variant only where its GLB is missing)
        const byA = {}, byV = {}, byS = {}, bySv = {}, byB = {}, add = (m, k, it) => (m[k] = m[k] || []).push(it), count = (k, n) => { PLANT.counts[k] = (PLANT.counts[k] || 0) + n; };
        for (const t of O.trees) if (!isHero(id, t)) { const a = t.asset || LAYOUT_SPECIES[t.variant], it = { x: t.x, z: t.z, s: t.scale * (t.vscale || 1), rot: t.rot + (t.vyaw || 0) };
          if (loaded[a]) add(byA, a, it); else add(byV, t.variant, it); }
        for (const [a, items] of Object.entries(byA)) { PLANT.on.push(...instanced(g, pc, loaded[a], items, { tree: true, crownTint: true, name: 'tree:' + a })); count(a, items.length); }
        for (const [v, items] of Object.entries(byV)) if (PMESH[v]) { PLANT.on.push(...instanced(g, pc, PMESH[v], items, { tree: true, name: 'tree:' + v })); count(v, items.length); }
        for (const s of O.shrubs || []) { const it = { x: s.x, z: s.z, s: s.scale, rot: s.rot }; if (loaded[s.asset]) add(byS, s.asset, it); else add(bySv, s.variant, it);
          extra.push({ x: s.x, z: s.z, rx: (s.variant === 'low' ? 1.05 : 0.9) * s.scale, rz: (s.variant === 'low' ? 0.7 : 0.9) * s.scale, rot: s.rot }); }
        for (const [a, items] of Object.entries(byS)) { PLANT.shrubs.push(...instanced(g, pc, loaded[a], items, { cast: false, name: 'shrub:' + a })); count('shrub:' + a, items.length); }
        for (const [v, items] of Object.entries(bySv)) if (PMESH[v]) { PLANT.shrubs.push(...instanced(g, pc, PMESH[v], items, { tree: true, cast: false, name: 'shrub:' + v })); count('shrub:' + v, items.length); }
        // the scattered bushes, every kind (bush_a / bush_flowering / bush_berry), as shrub:<kind> with the plants stage; the old two-kind set
        // below stays for 'Game (current)'
        for (const b of O.bushes) add(byB, b.kind, { x: b.x, z: b.z, s: b.scale, rot: b.rot });
        for (const [k, items] of Object.entries(byB)) { if (!loaded[k]) { console.error('[plants] no GLB for bush kind ' + k); continue; } PLANT.on.push(...instanced(g, pc, loaded[k], items, { cast: false, name: 'shrub:' + k })); count('shrub:' + k, items.length); }
        for (const b of O.bushes) extra.push({ x: b.x, z: b.z, rx: 0.8 * b.scale, rz: 0.8 * b.scale });
        for (const s of O.sheep) extra.push({ x: s.x, z: s.z, rx: 0.55 * s.scale / 0.55, rz: 0.36 * s.scale / 0.55, rot: s.rot });
      }
      for (const p of O.placeholders) put(loaded[p.asset], p.x, p.z, p.scale, p.rot);
      for (const kind of ['bush_a', 'bush_flowering']) PLANT.off.push(...instanced(g, pc, loaded[kind], O.bushes.filter((b) => b.kind === kind).map((b) => ({ x: b.x, z: b.z, s: b.scale, rot: b.rot })), { cast: false, name: kind }));   // ('Game (current)': the old scene's two kinds)
      const rockC = loaded.boulder_c ? isRockC : () => false;   // (Meshy: a hash-picked third of the rock instances drawn as the flat boulder_c)
      for (const kind of ['rock_a', 'rock_b']) instanced(g, pc, loaded[kind], O.rocks.filter((r) => r.kind === kind && !rockC(r)).map((r) => ({ x: r.x, z: r.z, s: r.scale, rot: r.rot, lift: -0.04, sy: r.sy || 1 })), { cast: false, name: kind });
      instanced(g, pc, loaded.boulder_c, O.rocks.filter(rockC).map((r) => ({ x: r.x, z: r.z, s: r.scale, rot: r.rot, lift: -0.02, sy: r.sy || 1 })), { cast: false, name: 'boulder_c' });
      for (const r of O.rocks) { shadows.push({ x: r.x, z: r.z, rx: 1.0 * r.scale + 0.3, rz: 0.9 * r.scale + 0.3 }); PLACED.rocks.push({ x: +r.x.toFixed(2), z: +r.z.toFixed(2), piece: id }); }
      shadows.push(...(MZ.contacts[id] || []));   // the Meshy set pieces' contact blobs, in this piece's one contact batch
      contacts(g, pc, shadows);
      if (PV) { const ce = contacts(g, pc, extra, 'contacts:extra'); if (ce) PLANT.contacts.push(ce); }
      for (const s of O.sheep) put(loaded.sheep, s.x, s.z, s.scale, s.rot);
      for (const p of O.paths) ribbon(g, pc, p.pts, p.widths ? (i) => p.widths[i] : p.width, pathCol, 0.14, 0.035, pathMat);   // (paths v2: a run may narrow locally)
      if (O.flowers.length) { const fg = new THREE.IcosahedronGeometry(0.075, 0), fm = new THREE.MeshLambertMaterial({ flatShading: true }), im = new THREE.InstancedMesh(fg, fm, O.flowers.length), d = new THREE.Object3D(), c = new THREE.Color();
        O.flowers.forEach((f, i) => { d.position.copy(local(pc, f.x, f.z, 0.1)); d.scale.setScalar(f.scale); d.updateMatrix(); im.setMatrixAt(i, d.matrix); c.set(P[f.color]); im.setColorAt(i, c); }); im.instanceColor.needsUpdate = true; im.name = 'flowers:' + id; g.add(im); PLANT.flowersOff.push(im); }
      const COVER_ON = !!(O.cover && O.cover.length);
      if (COVER_ON) {   // the living-ground cover (composeBlueprint's cover): one InstancedMesh per kit model on this piece, its grasses swaying
        const byA = {}; for (const c of O.cover) (byA[c.asset] = byA[c.asset] || []).push({ x: c.x, z: c.z, s: c.scale, rot: c.rot, lift: (CFG.kitYOffset || {})[c.asset] || 0, tint: c.tint });   // (lift: the kit's yOffset, from the assets table via build.mjs's kitYOffset (ruling GR17); the export draws it, so the proof does too)
        for (const [a, items] of Object.entries(byA)) for (const im of instanced(g, pc, loaded[a], items, { cast: false, itemTint: true, name: 'cover:' + a }))
          if (a.startsWith('grass_') || a === 'clover_patch') im.material = makeSway(im.material); }
      if (O.reeds && O.reeds.length) {   // the pond's reeds (ground-vegetation plan Task 10; at the waterline, ruling GR30), PROOF ONLY: a stand-in for the
        // game's Reeds (GV3) after its reedGeometry: 4 thin leaning blades per reed (one InstancedMesh per blade, height x the reed's height, sunk 0.03 u
        // as the game stands its reeds, turned by a position hash), tinted from the game's REED_TINTS, and a bulrush head on head: true; not a kit
        // model, not swaying (composition-check counts neither)
        const TINTS = ['#7D9B70', '#93A97E', '#6F8C66', '#A3B07A'], d = new THREE.Object3D(), c = new THREE.Color(), hs = (r, k) => Math.abs(Math.sin(r.x * 127.1 + r.z * 311.7 + k * 17.3) * 43758.5453) % 1;
        const BLADES = [{ r: 0.024, h: 1, tilt: 0, turn: 0 }, { r: 0.018, h: 0.72, tilt: 0.22, turn: 0.4 }, { r: 0.016, h: 0.6, tilt: -0.26, turn: 2.2 }, { r: 0.015, h: 0.84, tilt: 0.14, turn: 4.1 }];
        const rm = new THREE.MeshLambertMaterial(); rm.userData.celKind = 'foliage';
        for (const B of BLADES) { const bg = new THREE.ConeGeometry(B.r, B.h, 4); bg.translate(0, B.h / 2, 0); bg.rotateZ(B.tilt); bg.rotateY(B.turn);
          const im = new THREE.InstancedMesh(bg, rm, O.reeds.length);
          O.reeds.forEach((r, i) => { d.position.copy(local(pc, r.x, r.z, -0.03)); d.rotation.set(0, hs(r, 1) * Math.PI * 2, 0); d.scale.set(1, r.height, 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
            c.set(TINTS[Math.floor(hs(r, 0) * TINTS.length)]); im.setColorAt(i, c); });
          im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = true; im.name = 'reeds:stand-in'; g.add(im); }
        const heads = O.reeds.filter((r) => r.head);
        if (heads.length) { const hg = new THREE.CylinderGeometry(0.026, 0.026, 0.13, 6), hm = new THREE.MeshLambertMaterial({ color: '#7A5A3E' }), im = new THREE.InstancedMesh(hg, hm, heads.length);
          hm.userData.celKind = 'foliage';
          heads.forEach((r, i) => { d.position.copy(local(pc, r.x, r.z, -0.03 + r.height * 0.86)); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
          im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.name = 'reeds:stand-in-heads'; g.add(im); } }
      if (!COVER_ON && PV && O.flowerPatches && O.flowerPatches.length) {   // plants stage: composed drifts (smooth heads, a touch flatter, palette colours)
        const fl = O.flowerPatches, fm = new THREE.MeshLambertMaterial(), im = new THREE.InstancedMesh(flowerGeo, fm, fl.length), d = new THREE.Object3D(), c = new THREE.Color();
        fm.userData.celKind = 'foliage';
        fl.forEach((f, i) => { d.position.copy(local(pc, f.x, f.z, 0.075)); d.scale.set(f.scale, f.scale * 0.8, f.scale); d.updateMatrix(); im.setMatrixAt(i, d.matrix); c.set(P[f.color]); im.setColorAt(i, c); });
        im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.name = 'flowerPatches:' + id; im.receiveShadow = true; g.add(im); PLANT.flowersOn.push(im); }
      const gt = loaded.grass_tuft && firstMesh(loaded.grass_tuft);
      if (gt && O.grass.length && !COVER_ON) { const im = new THREE.InstancedMesh(gt.geometry, makeSway(gt.material), O.grass.length), d = new THREE.Object3D();
        if (A.look && A.look.terrain && A.look.terrain.tuft) im.material.color.set(P[A.look.terrain.tuft]);   // v4: tufts match the terrain grass (glb untouched)
        O.grass.forEach((q, i) => { d.position.copy(local(pc, q.x, q.z)); d.rotation.set(0, q.rot, 0); d.scale.setScalar(q.scale); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }); im.instanceMatrix.needsUpdate = true; g.add(im); }
    }
    placeMeshy(MZ);
    // plants stage: the farm's window glow material, the porch light and two flowering bushes flanking the porch (+ contacts)
    if (loaded.farmhouse) { const gl = []; loaded.farmhouse.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'Glow' && !gl.includes(o.material)) gl.push(o.material); });
      const wall = gl.find((m) => m.map) || gl[0];   // the textured wall Glow (window mask); the procedural house: its one Glow
      if (wall && !GLOW.mat) { GLOW.mat = wall; GLOW.e.copy(wall.emissive); GLOW.i = wall.emissiveIntensity; }
      for (const m of gl) if (m !== GLOW.mat && !GLOW.extra.some((x) => x.mat === m)) GLOW.extra.push({ mat: m, e: m.emissive.clone(), i: m.emissiveIntensity }); }   // the porch lamp's own untextured Glow rides the same dusk glow
    if (loaded.windmill) loaded.windmill.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'Glow' && !GLOW.extra.some((x) => x.mat === o.material)) GLOW.extra.push({ mat: o.material, e: o.material.emissive.clone(), i: o.material.emissiveIntensity }); });   // the windmill window rides the same dusk glow
    if (HOUSE && PV) {
      const H = HOUSE, at = (ox, oz) => [H.x + ox * Math.cos(H.rot) + oz * Math.sin(H.rot), H.z - ox * Math.sin(H.rot) + oz * Math.cos(H.rot)];
      let pl = null; loaded.farmhouse.traverse((o) => { if (!pl && o.name === 'PorchLight') pl = o.position; });   // the model's own anchor, else the procedural house's porch
      const [px, pz] = pl ? at(pl.x, pl.z) : at(0, 1.62); porch.position.copy(local(H.pc, px, pz, pl ? pl.y : 1.12)); H.g.add(porch);
      const gb = [[-0.98, 1.22, 0.5, 0.4], [0.98, 1.24, 0.46, 2.3]].map(([ox, oz, s, r]) => { const [x, z] = at(ox, oz); return { x, z, s, rot: r }; });
      PLANT.garden.push(...instanced(H.g, H.pc, loaded.bush_flowering, gb, { cast: false, name: 'garden' }));
      const gc = contacts(H.g, H.pc, gb.map((b) => ({ x: b.x, z: b.z, rx: 0.62, rz: 0.62 })), 'contacts:garden'); if (gc) PLANT.garden.push(gc);
    }
    applyPlants(LOOK.preset);
    window.__plants = { sets: PLANT, glow: GLOW, porch, variants: PV ? Object.fromEntries(Object.entries(PV).map(([k, v]) => [k, { kind: v.kind, tris: v.tris, height: v.height, width: v.width }])) : null };
    addStairs();
    addWater();
    if (DEBUG) debugOverlay();
    tintSig = null; applyTreeTints(LOOK.preset.canopy.instanceTint);   // the canopies exist now (applyLook ran before the GLBs loaded)
    // look core: the cel patch on every opaque Lambert material in the scene (chained after its own patches)
    scene.traverse((o) => { if (!o.isMesh) return; for (const m of Array.isArray(o.material) ? o.material : [o.material]) celMaterial(m, m && m.userData.celKind); });
    applyMinAlbedo(LOOK.preset.materials);
    applyState();
    // precompile EVERY material, the hidden set included (plants stage: the moods hide the old trees, Game (current) the variants),
    // for the target the frames render into, so switching presets never hitches and every material carries its patches
    try { const prev = renderer.getRenderTarget(); if (compositeActive() && POST.rt) renderer.setRenderTarget(POST.rt); renderer.compile(scene, camera); renderer.setRenderTarget(prev); } catch (e) { console.warn('[plants] precompile skipped: ' + e.message); }
    window.__ready = true;
  }
  // toLambert(root): the game's material model for GLB assets. GLTFLoader builds MeshStandardMaterial; every one becomes a
  // MeshLambertMaterial with the same name, colour, emissive (Glow keeps its glow), maps, vertex colours, flat shading, side,
  // transparency and fog flag. 'Glass' stays Standard (transparent; its specular is the point). Shared materials stay shared.
  const LAMBERT_KEEP = ['name', 'color', 'emissive', 'emissiveIntensity', 'emissiveMap', 'map', 'alphaMap', 'aoMap', 'aoMapIntensity', 'lightMap', 'lightMapIntensity',
    'vertexColors', 'flatShading', 'side', 'transparent', 'opacity', 'alphaTest', 'depthWrite', 'depthTest', 'fog', 'wireframe'];
  const GLB_MATS = [];   // every converted GLB material + its authored colour (materials.minAlbedo)
  // iOS SPECKLE RULE for GLB image maps (the Meshy remakes carry a painted texture): Apple GPUs corrupt the GPU-generated mip
  // chain of sRGB storage, so an sRGB map is stored as plain RGBA8 (colorSpace none: the mips are built on that) and decoded
  // sRGB -> linear in the shader instead (three's inline decode path for video textures, DECODE_VIDEO_TEXTURE). The mips then
  // average sRGB values: invisible at this scale. The emissive map is a black / white glow mask: stored linear, no decode.
  const SRGB_DECODED = new Set();
  function linearStore(l) {
    let dec = false;
    for (const k of ['map', 'emissiveMap']) { const t = l[k]; if (!t || !t.isTexture) continue;
      if (t.colorSpace === THREE.SRGBColorSpace) { t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; if (k === 'map') SRGB_DECODED.add(t); }
      if (k === 'map' && SRGB_DECODED.has(t)) dec = true; }   // (a map shared by two materials: decoded in both)
    if (dec) addPatch(l, 'srgbDecode', (sh) => { sh.fragmentShader = '#define DECODE_VIDEO_TEXTURE\n' + sh.fragmentShader; });
  }
  function toLambert(root, kind) {
    const done = new Map();
    const conv = (m) => { if (!m || !m.isMeshStandardMaterial || m.name === 'Glass') return m; if (done.has(m)) return done.get(m);
      const l = new THREE.MeshLambertMaterial(); for (const k of LAMBERT_KEEP) { const v = m[k]; if (v === undefined) continue; if (v && v.isColor) l[k].copy(v); else l[k] = v; }
      l.userData = { ...m.userData, fromStandard: true, celKind: kind || 'building' }; linearStore(l); done.set(m, l); m.dispose(); GLB_MATS.push({ m: l, base: l.color.clone() }); return l; };
    root.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); });
    return root;
  }
  // MIN ALBEDO (look core, preset materials.minAlbedo): near-black GLB albedos (the sheep's painted-black faces: the only pixels
  // below 0.08 luma) are lifted at load time, the GLB files untouched. The minimum is a LUMA FLOOR with a coloured dark: a colour
  // darker than it is brought up to exactly the minimum's luma, keeping its own hue in proportion to how dark it was (pure black
  // -> the minimum colour; just under the floor -> its own hue, scaled up). Continuous, so nothing jumps. Off = authored colours.
  const _ma = new THREE.Color(), _mb = new THREE.Color();
  function applyMinAlbedo(M) {
    const on = !!(M && M.enabled); if (on) _ma.set(M.minAlbedo);
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, lmin = on ? lum(_ma) : 0;
    for (const { m, base } of GLB_MATS) {
      const l = lum(base); if (!on || l >= lmin) { m.color.copy(base); continue; }
      const t = 1 - l / Math.max(1e-6, lmin);   // luma(mix(base * lmin / l, min, t)) = lmin
      _mb.copy(base).multiplyScalar(l > 1e-6 ? lmin / l : 0); m.color.copy(_mb).lerp(_ma, l > 1e-6 ? t : 1);
    }
  }
  const dl = new GLTFLoader(); let remaining = CFG.assets.length + (BAKED ? CFG.bakedPieces.length : 0);
  if (!remaining) populate();
  CFG.assets.forEach((a) => dl.load(a.file, (gltf) => { loaded[a.id] = toLambert(gltf.scene, GLB_KIND[a.id]); if (--remaining === 0) populate(); }, undefined, (e) => { console.error('Failed to load ' + a.file, e); if (--remaining === 0) populate(); }));
  // ?baked=1: swap each piece's geometry for its baked GLB's (the island material stays) and read heights from its grid, before
  // populate() places anything
  if (BAKED) CFG.bakedPieces.forEach((b) => {
    const done = () => { if (--remaining === 0) populate(); };
    Promise.all([new Promise((res, rej) => dl.load(b.file, res, undefined, rej)), fetch(b.height).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })])
      .then(([gltf, hb]) => {
        let src = null; const sks = []; gltf.scene.traverse((o) => { if (!o.isMesh) return; if (/^skirt_/.test(o.name)) sks.push(o); else if (!src || o.name === 'piece_' + b.id) src = o; });
        const P = PG[b.id]; if (!src || !P) { console.error('[baked] no mesh / piece for ' + b.id); return done(); }
        P.mesh.geometry.dispose(); P.mesh.geometry = src.geometry; P.baked = { file: b.file, tris: src.geometry.index ? src.geometry.index.count / 3 : 0, extras: src.userData };
        P.skirts = {};   // v2: the open-seam skirts, drawn with the island material (visibility: applyState)
        for (const s of sks) { const sm = new THREE.Mesh(s.geometry, islandMat); sm.name = s.name; sm.receiveShadow = true; sm.castShadow = true; P.group.add(sm); P.skirts[s.name.slice(6)] = sm; P.baked.tris += s.geometry.index ? s.geometry.index.count / 3 : 0; }
        BAKEDH[b.id] = gridHeight(b.heightMeta, new Float32Array(hb));
        done();
      }).catch((e) => { console.error('[baked] failed to load ' + b.id, e); done(); });
  });
  window.__bakedState = () => ({ on: BAKED, pieces: Object.fromEntries(BP.order.filter((id) => PG[id].baked).map((id) => [id, PG[id].baked.tris])) });

  // ---- cameras: game parity (fov 30), gameplay clamp (framing.ts), photo free orbit ----
  const RC = A.render.camera, GP = A.render.gameplay, PH = A.render.photo, VIEW = A.render.view;
  const camera = new THREE.PerspectiveCamera(RC.fov, window.innerWidth / window.innerHeight, RC.near, RC.far);
  const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = 0.08;
  function frameDistance(aspect) { const t = Math.tan(RC.fov / 2 * DEG); return Math.min(VIEW.maxDistance, Math.max(VIEW.floor, (VIEW.mainFrame[0] / (2 * t * aspect)) * VIEW.fill, VIEW.mainFrame[1] / (2 * t))); }
  window.__frameDistance = frameDistance;
  let CAM_MODE = 'gameplay';
  function skyTint() {   // sky.screenTint: on for gameplay-camera views (or every view when gameplayOnly is off)
    const T = LOOK.preset.sky.screenTint; tintU.uScreenTint.value = T && T.enabled && (CAM_MODE === 'gameplay' || !T.gameplayOnly) ? T.strength : 0;
    if (T) tintU.uTintRange.value.set(T.from, Math.max(T.from + 0.01, T.to));
  }
  function applyMode(mode) {
    CAM_MODE = mode; skyTint();
    if (mode === 'gameplay') { controls.enablePan = false; controls.minDistance = GP.minDistance; controls.maxDistance = GP.maxDistance; controls.minPolarAngle = GP.minPolar; controls.maxPolarAngle = GP.maxPolar;
      controls.minAzimuthAngle = GP.azimuthCenter - GP.azimuthRange; controls.maxAzimuthAngle = GP.azimuthCenter + GP.azimuthRange; controls.rotateSpeed = 0.45; controls.zoomSpeed = 0.6; }
    else { controls.enablePan = true; controls.minDistance = PH.minDistance; controls.maxDistance = PH.maxDistance; controls.minPolarAngle = PH.minPolar; controls.maxPolarAngle = PH.maxPolar; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; controls.rotateSpeed = 1; controls.zoomSpeed = 1; }
  }
  function inClamp(az, el, dist) { const pol = Math.PI / 2 - el * DEG, a = Math.atan2(Math.sin(az * DEG), Math.cos(az * DEG)), e = 1e-6;
    return dist >= GP.minDistance - e && dist <= GP.maxDistance + e && pol >= GP.minPolar - e && pol <= GP.maxPolar + e && a >= GP.azimuthCenter - GP.azimuthRange - e && a <= GP.azimuthCenter + GP.azimuthRange + e; }
  function placeCamera(az, el, dist, tgt) {
    controls.target.set(tgt[0], tgt[1], tgt[2]); const e = el * DEG, a = az * DEG;
    camera.position.set(tgt[0] + Math.cos(e) * Math.sin(a) * dist, tgt[1] + Math.sin(e) * dist, tgt[2] + Math.cos(e) * Math.cos(a) * dist);
  }
  const resolveDist = (c, aspect) => (c.dist === 'frame' ? frameDistance(aspect) : c.dist);
  const VIEW_Q = VIEWS[QS.get('view')] ? QS.get('view') : null;   // LOOK-BRIEF fixed comparison views (world.config archipelago.views)
  if (VIEW_Q && !QS.get('unlocked')) { UNLOCKED = parseUnlocked(VIEWS[VIEW_Q].unlocked || 'all'); DOCK = null; }
  function positionCamera() {
    const aspect = window.innerWidth / window.innerHeight, CAMS = A.cameras;
    const pre = (VIEW_Q && VIEWS[VIEW_Q]) || CAMS[QS.get('preset')] || (aspect < 0.85 ? CAMS.default_mobile : CAMS.default_desktop);
    const mode = QS.get('photo') === '1' ? 'photo' : (pre.mode || 'gameplay');
    let az = pre.az, el = pre.el, dist = resolveDist(pre, aspect), tgt = pre.tgt;
    const camQ = QS.get('cam'); if (camQ) { const p = camQ.split(',').map(Number); az = p[0]; el = p[1]; if (p[2]) dist = p[2]; }
    const tgtQ = QS.get('tgt'); if (tgtQ) tgt = tgtQ.split(',').map(Number);
    if (QS.get('preset') && pre.unlocked && !QS.get('unlocked')) UNLOCKED = parseUnlocked(pre.unlocked);
    if (QS.get('preset') && pre.dock && !QS.get('dock')) DOCK = pre.dock;
    camera.fov = RC.fov; applyMode(mode); placeCamera(az, el, dist, tgt); camera.aspect = aspect; camera.updateProjectionMatrix(); controls.update();
  }
  positionCamera();
  // syncFog(): the fog colour (preset fog.skyMatch): 'none' = fog.color; 'horizon' = sky.horizon; 'view' = the sky dome's horizon
  // colour along the camera's view azimuth (warmer toward the sun), re-evaluated as the camera moves, so the cloud sea and the far
  // haze melt into the sky behind them. The cloud deck's colour = clouds.deck.color mixed toward it by clouds.deck.fogMix.
  const _fogC = new THREE.Color(), _fwd = new THREE.Vector3();
  function syncFog() {
    const p = LOOK.preset, F = p.fog, C = p.clouds;
    if (F.skyMatch === 'view') skyHorizonAlong(_fogC, camera.getWorldDirection(_fwd)); else _fogC.set(F.skyMatch === 'horizon' ? p.sky.horizon : F.color);
    if (scene.fog) scene.fog.color.copy(_fogC);
    deckMat.color.set(C.deck.color).lerp(_fogC, C.deck.fogMix);
  }
  function syncFrame() {
    const d = camera.position.distanceTo(controls.target);
    const F = LOOK.preset.fog, base = F.anchor === 'cameraTarget' ? d : 0;   // the game's fog follows the camera distance
    if (scene.fog && scene.fog.isFog) { scene.fog.near = base + F.nearOffset; scene.fog.far = base + F.farOffset; }
    if (F.skyMatch === 'view') syncFog();
    const far = Math.max(RC.far, scene.fog && scene.fog.isFog ? scene.fog.far + 40 : 0); if (Math.abs(camera.far - far) > 0.5) { camera.far = far; camera.updateProjectionMatrix(); }
  }

  // ---- legend ----
  const list = document.getElementById('legend-list');
  if (list) {
    document.querySelector('#legend h1').textContent = 'Gitaway - blueprint island (spec v3.1)';
    const add = (a, b) => { const li = document.createElement('li'); li.innerHTML = '<span class="id">' + a + '</span><span class="tris">' + b + '</span>'; list.appendChild(li); };
    add('unlocked', [...UNLOCKED].join(' ')); add('look', LOOK.name); add('seed', SEED); if (VIEW_Q) add('view', VIEW_Q);
    add('water', WATER ? 'PLACEHOLDER (game draws water)' : 'off'); add('orchard trees', 'tree_round_a stand-ins'); add('?debug=1', 'reserved footprints');
  }
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); positionCamera(); });

  // ---- THE COMPOSITE PASS (look core, preset post.composite / ink / bloom / grade / vignette). Quality tiers: HIGH = the scene
  //      is rendered into an MSAA render target (post.composite.samples, HalfFloat colour, DepthTexture; three applies no tone
  //      mapping and no sRGB encoding into a render target), then ONE fullscreen ShaderMaterial (toneMapped: false) does: depth ink
  //      (8 taps of linearised depth, second difference = a relative depth jump of ink.jumpStart..jumpFull, fading with distance;
  //      the sky is far, so silhouettes get a line and the sky / cloud sea never does), Neutral tone mapping ONCE on scene pixels
  //      (alpha 1; the sky writes alpha 0 and is display-referred), the bloom add, the split-tone grade, the vignette and the sRGB
  //      encoding ONCE (linearToOutputTexel to the canvas). Bloom = a prefilter on the tone-mapped display luma (smooth knee
  //      bloom.threshold - knee .. threshold, sky excluded) at half resolution + a dual-filter down / tent up chain (4 levels):
  //      below the knee it is exactly 0. LOW (?quality=low or post.composite.enabled off) = the plain path: the renderer tone-maps
  //      and encodes directly, no ink / bloom / grade. renderer.toneMapping keeps the preset's curve on BOTH paths: it is only
  //      applied when three renders to the canvas, i.e. never to the composite's scene target. ----
  const POST = { rt: null, w: 0, h: 0, samples: -1, down: [], up: [], on: false, scene: { calls: 0, triangles: 0 }, postCalls: 0, bloomOn: false };
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false; quadScene.add(quad);
  const V4 = () => new THREE.Vector4(), V3 = () => new THREE.Vector3(), V2 = () => new THREE.Vector2();
  const compMat = LC ? new THREE.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, vertexShader: LC.QUAD_VS, fragmentShader: LC.COMPOSITE_FS,
    uniforms: { tScene: { value: null }, tDepth: { value: null }, tBloom: { value: null }, uTexel: { value: V2() }, uNear: { value: 1 }, uFar: { value: 100 }, uExposure: { value: 1 }, uTM: { value: 1 },
      uInk: { value: V4() }, uInkP: { value: V4() }, uInkViolet: { value: V3() }, uInkFade: { value: V2() }, uBloom: { value: V2() }, uShadowTint: { value: V4() }, uHighTint: { value: V4() },
      uGrade: { value: V4() }, uGrade2: { value: V2() }, uVig: { value: V4() }, uDitherC: { value: 1 } } }) : null;
  const bloomPre = LC ? new THREE.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, vertexShader: LC.QUAD_VS, fragmentShader: LC.BLOOM_PRE_FS,
    uniforms: { tScene: { value: null }, uTexel: { value: V2() }, uExposure: { value: 1 }, uKnee: { value: V2() } } }) : null;
  const bloomDown = LC ? new THREE.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, vertexShader: LC.QUAD_VS, fragmentShader: LC.BLOOM_DOWN_FS, uniforms: { tSrc: { value: null }, uTexel: { value: V2() } } }) : null;
  const bloomUp = LC ? new THREE.ShaderMaterial({ toneMapped: false, depthTest: false, depthWrite: false, vertexShader: LC.QUAD_VS, fragmentShader: LC.BLOOM_UP_FS,
    uniforms: { tSrc: { value: null }, tAdd: { value: null }, uTexel: { value: V2() }, uRadius: { value: 1 } } }) : null;
  const BLOOM_LEVELS = 4;
  function ensureTargets(w, h, samples) {
    if (POST.rt && POST.w === w && POST.h === h && POST.samples === samples) return;
    if (POST.rt) { POST.rt.depthTexture.dispose(); POST.rt.dispose(); for (const t of [...POST.down, ...POST.up]) t.dispose(); }
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    POST.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: true, depthTexture: dt });
    POST.rt.isGitawayComposite = true; POST.rt.texture.name = 'gitaway:composite';
    const mk = (k) => { const t = new THREE.WebGLRenderTarget(Math.max(1, w >> k), Math.max(1, h >> k), { type: THREE.HalfFloatType, depthBuffer: false }); t.texture.name = 'gitaway:bloom' + k; return t; };
    POST.down = []; POST.up = []; for (let k = 1; k <= BLOOM_LEVELS; k++) POST.down.push(mk(k)); for (let k = 1; k < BLOOM_LEVELS; k++) POST.up.push(mk(k));
    POST.w = w; POST.h = h; POST.samples = samples;
  }
  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, quadCam); }
  function compositeActive() {
    const C = LOOK.preset.post.composite, tm = LOOK.preset.renderer.toneMapping;
    if (!LC || !compMat || QUALITY === 'low' || !(tm === 'Neutral' || tm === 'None')) return false;
    return QUALITY === 'high' || !!(C && C.enabled);
  }
  // NEAR-PLANE FIT (every frame): near = 0.9 x the distance to the nearest visible bounding sphere (pieces, isles, cloud groups),
  // >= render.camera.near, so the depth the ink lines read is as precise as the view allows and stable from frame to frame
  const NEAR_OBJS = [], _ns = new THREE.Sphere(), _nb = new THREE.Box3();
  function nearObjects() { NEAR_OBJS.length = 0;
    for (const o of scene.children) { if (o === skyDome || o === skyQuad || !(o.isGroup || o.isMesh) || o.visible === false) continue;
      _nb.makeEmpty().expandByObject(o); if (_nb.isEmpty()) continue; NEAR_OBJS.push(_nb.getBoundingSphere(new THREE.Sphere())); } }
  function fitNear(cam) {
    if (!NEAR_OBJS.length) nearObjects();
    let d = Infinity; for (const s of NEAR_OBJS) d = Math.min(d, cam.position.distanceTo(s.center) - s.radius);
    const n = Math.max(RC.near, Math.min(60, 0.9 * d));
    if (Math.abs(n - cam.near) > 0.01 * cam.near) { cam.near = n; cam.updateProjectionMatrix(); }
  }
  const _dbs = new THREE.Vector2(), _fogSave = new THREE.Color();
  function renderFrame(cam) {
    fitNear(cam);
    POST.on = compositeActive();
    if (!POST.on) { renderer.setRenderTarget(null); renderer.render(scene, cam); POST.scene.calls = renderer.info.render.calls; POST.scene.triangles = renderer.info.render.triangles; POST.postCalls = 0; return; }
    const p = LOOK.preset, PO = p.post, sz = renderer.getDrawingBufferSize(_dbs), w = sz.x | 0, h = sz.y | 0, expo = p.renderer.exposure;
    ensureTargets(w, h, PO.composite.samples | 0);
    // fog is display-referred on the plain path (three mixes it after tone mapping): the composite gets its scene-linear pre-image
    if (scene.fog) { _fogSave.copy(scene.fog.color); const f = p.renderer.toneMapping === 'Neutral' ? LC.invNeutral([_fogSave.r, _fogSave.g, _fogSave.b], expo) : [_fogSave.r, _fogSave.g, _fogSave.b]; scene.fog.color.setRGB(f[0], f[1], f[2]); }
    renderer.setRenderTarget(POST.rt); renderer.render(scene, cam);
    POST.scene.calls = renderer.info.render.calls; POST.scene.triangles = renderer.info.render.triangles;
    if (scene.fog) scene.fog.color.copy(_fogSave);
    let calls = 0; const B = PO.bloom; POST.bloomOn = !!(B && B.enabled);
    if (POST.bloomOn) {
      bloomPre.uniforms.tScene.value = POST.rt.texture; bloomPre.uniforms.uTexel.value.set(1 / w, 1 / h); bloomPre.uniforms.uExposure.value = p.renderer.toneMapping === 'Neutral' ? expo : 1;
      bloomPre.uniforms.uKnee.value.set(Math.max(0, B.threshold - B.knee), Math.max(B.threshold, B.threshold - B.knee + 1e-3)); pass(bloomPre, POST.down[0]); calls++;
      for (let k = 1; k < BLOOM_LEVELS; k++) { const s = POST.down[k - 1]; bloomDown.uniforms.tSrc.value = s.texture; bloomDown.uniforms.uTexel.value.set(1 / s.width, 1 / s.height); pass(bloomDown, POST.down[k]); calls++; }
      let src = POST.down[BLOOM_LEVELS - 1];
      for (let k = BLOOM_LEVELS - 2; k >= 0; k--) { bloomUp.uniforms.tSrc.value = src.texture; bloomUp.uniforms.tAdd.value = POST.down[k].texture; bloomUp.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        bloomUp.uniforms.uRadius.value = 0.5 + B.radius; pass(bloomUp, POST.up[k]); src = POST.up[k]; calls++; }
    }
    const U = compMat.uniforms;
    U.tScene.value = POST.rt.texture; U.tDepth.value = POST.rt.depthTexture; U.tBloom.value = POST.bloomOn ? POST.up[0].texture : null; U.uTexel.value.set(1 / w, 1 / h);
    U.uNear.value = cam.near; U.uFar.value = cam.far; U.uExposure.value = expo; U.uTM.value = p.renderer.toneMapping === 'Neutral' ? 1 : 0;
    U.uBloom.value.set(POST.bloomOn ? B.strength / BLOOM_LEVELS : 0, POST.bloomOn ? 1 : 0);
    pass(compMat, null); calls++;
    POST.postCalls = calls;
  }
  window.__lookCore = {   // read-only state for the tests / the panel (no behaviour)
    get composite() { return { on: POST.on, quality: QUALITY, size: [POST.w, POST.h], samples: POST.samples, bloomOn: POST.bloomOn, toneMappedMaterial: compMat ? compMat.toneMapped : null,
      rendererToneMapping: renderer.toneMapping, targetType: POST.rt ? POST.rt.texture.type : null, hasDepthTexture: !!(POST.rt && POST.rt.depthTexture) }; },
    get info() { return { scene: { ...POST.scene }, postCalls: POST.postCalls }; },
    get cel() { return { applied: CEL.applied, fallback: CEL.fallback, misses: CEL.misses.slice(), materials: CEL.materials.size }; },
    memory: (w, h, s) => (LC ? LC.compositeMemory(w, h, s, BLOOM_LEVELS) : null),
    presetAtHour: (h) => (LC ? LC.presetAtHour(LP, h) : null),
    compositeMaterial: compMat,
  };

  // ---- applyLook(preset): pushes EVERY look value of a lookPresets.json preset into the scene. Live: lights, shadows (type /
  //      map size / bias / box), sky, fog (type / colour / range), tone mapping, exposure, output space, pixel ratio, clouds,
  //      water colours, grass sway. Called once before the first frame and by the panel on every change. ----
  const TONE = { None: THREE.NoToneMapping, Linear: THREE.LinearToneMapping, Reinhard: THREE.ReinhardToneMapping, Cineon: THREE.CineonToneMapping,
    ACESFilmic: THREE.ACESFilmicToneMapping, AgX: THREE.AgXToneMapping, Neutral: THREE.NeutralToneMapping };
  // three r180+ removed PCFSoftShadowMap (it warns and falls back to PCFShadowMap); map it here so the console stays clean
  const SHADOW = { Basic: THREE.BasicShadowMap, PCF: THREE.PCFShadowMap, PCFSoft: +THREE.REVISION >= 180 ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap, VSM: THREE.VSMShadowMap };
  const srgbVec = (v, hex) => { const c = new THREE.Color(hex).convertLinearToSRGB(); v.set(c.r, c.g, c.b); };   // raw sRGB, like the game's CSS sky
  const recompileAll = () => scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) m.needsUpdate = true; });
  let lookApplied = false;
  // #RRGGBB as a multiplier around #808080 (channel / 128; exactly 1 at 0x80): canopy gradient / conifer tint
  const mulVec = (v, hex) => { const n = parseInt(String(hex).slice(1), 16), ch = (c) => (c === 128 ? 1 : c / 128); return v.set(ch((n >> 16) & 255), ch((n >> 8) & 255), ch(n & 255)); };
  const _lc3 = new THREE.Color(), _lcL = new THREE.Color(), _hz = new THREE.Vector3();
  function applyLook(p, opts = {}) {
    LOOK.preset = p;
    const R = p.renderer, S = p.sun, SH = p.shadows, F = p.fog, C = p.clouds, Wt = p.water, G = p.wind.grassSway;
    let recompile = false;
    renderer.toneMapping = TONE[R.toneMapping] ?? THREE.NoToneMapping; renderer.toneMappingExposure = R.exposure;
    renderer.outputColorSpace = R.outputColorSpace === 'srgb-linear' ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    const pr = Math.min(window.devicePixelRatio, PR_CAP()); if (renderer.getPixelRatio() !== pr) renderer.setPixelRatio(pr);
    // lights: sun bearing is relative to the `full` view (lookPresets.json conventions)
    hemi.color.set(p.hemisphere.sky); hemi.groundColor.set(p.hemisphere.ground); hemi.intensity = p.hemisphere.intensity;
    amb.color.set(p.ambient.color); amb.intensity = p.ambient.intensity;
    const b = (FULL_AZ + S.azimuthDeg) * DEG, e = S.elevationDeg * DEG;
    sun.color.set(S.color); sun.intensity = S.intensity; sun.castShadow = S.castShadow;
    SUN_DIR.set(Math.sin(b) * Math.cos(e), Math.sin(e), Math.cos(b) * Math.cos(e));   // the sun's position = target + SUN_DIR x distance (fitShadow)
    // shadows
    const st = SHADOW[SH.type] ?? THREE.PCFShadowMap; if (renderer.shadowMap.type !== st) { renderer.shadowMap.type = st; recompile = true; }
    if (sun.shadow.mapSize.x !== SH.mapSize) { sun.shadow.mapSize.set(SH.mapSize, SH.mapSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    sun.shadow.bias = SH.bias; sun.shadow.normalBias = SH.normalBias; sun.shadow.radius = SH.radius;
    applyPlants(p);   // plants stage (tree / shrub / flower sets, ramps, farm glow + porch light, path tone, strata): before the shadow fit (visibility)
    drawContact(SH.contact); fitShadow();
    // sky: 'screen' = the game's CSS-like screen-space gradient; 'dome' = the world-space dome (sun-side warmth, haze below)
    // 'painted' (look core) = the same dome sphere with the painted sky + cloud sea; the icosphere puffs and the deck disc go away
    const SK = p.sky, painted = SK.mode === 'painted' && !!LC, dome = SK.mode === 'dome' || painted, DU = skyDomeMat.uniforms; skyQuad.visible = !dome; skyDome.visible = dome;
    seaGroup.visible = !painted; driftGroup.visible = !painted; if (deckMesh) deckMesh.visible = !painted;
    if (painted !== !!POST.painted) { POST.painted = painted; NEAR_OBJS.length = 0; }
    applySkyPaint(SK, painted);
    srgbVec(skyMat.uniforms.top.value, SK.zenith); srgbVec(skyMat.uniforms.mid.value, SK.horizon); srgbVec(skyMat.uniforms.bot.value, SK.below);
    skyMat.uniforms.stops.value.set(SK.stops.below, SK.stops.horizon, SK.stops.zenith); skyMat.uniforms.uDither.value = SK.dither ? 1 : 0;
    srgbVec(DU.uZenith.value, SK.zenith); srgbVec(DU.uHorizon.value, SK.horizon); srgbVec(DU.uSunHorizon.value, SK.sunSideHorizon); srgbVec(DU.uBelow.value, SK.below);
    DU.uSpread.value = SK.sunSideSpreadDeg * DEG; DU.uZenithEl.value = SK.dome.zenithElevDeg * DEG; DU.uExp.value = SK.dome.exponent;
    DU.uBelowDepth.value = SK.dome.belowDepthDeg * DEG; DU.uWarmEl.value = SK.dome.sunWarmthElevDeg * DEG; DU.uDither.value = SK.dither ? 1 : 0;
    // fog (near / far follow the camera every frame in syncFrame when anchored; colour: syncFog)
    const want = F.type === 'linear' ? 'linear' : F.type === 'exp2' ? 'exp2' : null, have = scene.fog ? (scene.fog.isFogExp2 ? 'exp2' : 'linear') : null;
    if (want !== have) { scene.fog = want === 'linear' ? new THREE.Fog(new THREE.Color(F.color)) : want === 'exp2' ? new THREE.FogExp2(new THREE.Color(F.color)) : null; recompile = true; }
    if (scene.fog && scene.fog.isFogExp2) scene.fog.density = F.density;
    // clouds (Backdrop.tsx material) + the deck (its colour mixes in the fog colour: syncFog)
    cloudMat.color.set(C.color).multiplyScalar(C.colorScale); cloudMat.emissive.set(C.emissive); cloudMat.emissiveIntensity = C.emissiveIntensity;
    deckMat.opacity = C.deck.opacity; syncFog();
    // water: Water.tsx WaterDriver (brightness from the light, sky tint = the sky's horizon colour)
    wShared.uLight.value = Math.min(1, 0.32 + p.hemisphere.intensity * 0.4 + S.intensity * 0.2);
    wShared.uSky.value.set(p.sky.horizon); wShared.uDeep.value.set(Wt.deep); wShared.uShallow.value.set(Wt.shallow); wShared.uFoam.value.set(Wt.foam);
    sway.uGS.value.set(G.ampX, G.ampZ, G.speedX, G.speedZ);
    // ---- LOOK-BRIEF phase 2 (materials): terrain paint, underside haze, canopies, sun-lit clouds + layout, gameplay sky tint ----
    applyPaint(p, opts.now || !lookApplied);
    const ST = p.stone, FD = ST.fade; srgbVec(_hz, FD.matchSkyBelow ? p.sky.below : ST.hazeColor);
    // (?baked=1 with the v2 shallower undersides (CFG.bakedUnderScale < 1): the fade's world-y range shrinks the same way below the
    //  2 u coast wall, so the review shows the hang fading into the haze as the preset intends; the default never sets it)
    const bus = BAKED && CFG.bakedUnderScale ? CFG.bakedUnderScale : 1, fBot = bus !== 1 ? -2 + (FD.bottom + 2) * bus : FD.bottom, fTop = bus !== 1 ? -2 + (FD.top + 2) * bus : FD.top;
    hazeU.uHaze.value.set(_hz.x, _hz.y, _hz.z, ST.enabled ? FD.strength : 0); hazeU.uHazeY.value.set(fBot, Math.max(fBot + 0.01, fTop));
    _lc3.set(p.hemisphere.ground).multiplyScalar(ST.enabled ? ST.bounce * p.hemisphere.intensity / Math.PI : 0); hazeU.uBounce.value.set(_lc3.r, _lc3.g, _lc3.b);
    const CN = p.canopy, GR = CN.gradient, BL = CN.backlight;
    _lcL.set(p.hemisphere.sky).add(_tc.set(p.hemisphere.ground)).multiplyScalar(0.5 * p.hemisphere.intensity / Math.PI);   // the mean hemisphere fill (x BRDF_Lambert)
    const PLc = p.plants || {};   // plants-stage variants (broad / conifer): their own gradient share + lift; colour = the ramp, so no conifer tint
    for (const kind of ['round', 'pine', 'broad', 'conifer']) { const U = CANOPY_U[kind], pOn = (kind === 'broad' || kind === 'conifer') && !!PLc.enabled, con = kind === 'pine' || kind === 'conifer'; U.uCanopyLiftCol.value.set(_lcL.r, _lcL.g, _lcL.b);
      U.uCanopyGrad.value.set(GR.enabled ? GR.strength * (pOn ? PLc.gradient : 1) : 0, GR.low, Math.max(GR.low + 0.01, GR.high), 0);
      mulVec(U.uCanopyBottom.value, GR.bottom); mulVec(U.uCanopyTop.value, GR.top);
      if (kind === 'pine') mulVec(U.uCanopyTint.value, CN.coniferTint); else U.uCanopyTint.value.set(1, 1, 1);
      U.uCanopySat.value = CN.saturation;
      U.uCanopyLift.value = pOn ? (con ? PLc.coniferLift : PLc.lift) : CN.shadowLift + (con ? CN.coniferLift : 0);
      _lc3.set(BL.color); U.uCanopyBack.value.set(_lc3.r, _lc3.g, _lc3.b, BL.enabled ? BL.strength : 0); U.uCanopyBackPow.value = BL.power; }
    applyTreeTints(CN.instanceTint);
    const CL = C.lit; _lc3.set(CL.top); cloudU.uCloudTop.value.set(_lc3.r, _lc3.g, _lc3.b); _lc3.set(CL.under); cloudU.uCloudUnder.value.set(_lc3.r, _lc3.g, _lc3.b);
    cloudU.uCloudLit.value.set(CL.enabled ? CL.strength : 0, CL.enabled ? CL.wrap : 0, CL.enabled ? CL.rim : 0, 0);
    layoutClouds(true); skyTint();
    // ---- look core: cel bands, composite (ink / bloom / grade / vignette), min albedo ----
    LCU.uLcExposure.value = R.exposure;
    applyCel(p.cel); applyPost(p.post); if (lookApplied) applyMinAlbedo(p.materials);
    if (recompile && lookApplied) recompileAll();
    lookApplied = true;
  }
  // sky.paint -> the painted-sky uniforms (colours are display sRGB, written raw like the dome's)
  function applySkyPaint(SK, painted) {
    const U = skyDomeMat.uniforms, S = SK.paint; U.uPainted.value = painted ? 1 : 0; if (!S) return;
    srgbVec(U.uMid.value, S.mid);
    U.uMidEl.value.set(S.midElevDeg * DEG, S.midWeight);
    const g = new THREE.Color(S.glowColor).convertLinearToSRGB(); U.uGlow.value.set(g.r, g.g, g.b, S.glow); U.uGlowW.value.set(S.glowElevDeg * DEG, S.glowAzDeg * DEG);
    U.uDrift.value.set(Math.cos(S.driftDirDeg * DEG) * S.drift, Math.sin(S.driftDirDeg * DEG) * S.drift);
    const CU = S.cumulus, TW = S.towers, SE = S.sea, BA = S.bands, low = S.lowDetail || QUALITY === 'low';
    U.uCu.value.set(CU.enabled ? 1 : 0, CU.cell, CU.height, CU.coverage);
    srgbVec(U.uCuShade.value, CU.shade); srgbVec(U.uCuMid.value, CU.mid); srgbVec(U.uCuLit.value, CU.lit); srgbVec(U.uCuRim.value, CU.rim);
    U.uBands.value.set(BA.shadeMid, BA.midLit, BA.rim, BA.soft);
    U.uTw.value.set(TW.enabled ? 1 : 0, TW.heightDeg * DEG, TW.cells, TW.coverage);
    U.uSea.value.set(SE.enabled ? 1 : 0, SE.cell, SE.y, SE.coverage);
    srgbVec(U.uSeaDeep.value, SE.deep); srgbVec(U.uSeaShade.value, SE.shade); srgbVec(U.uSeaMid.value, SE.mid); srgbVec(U.uSeaCap.value, SE.cap); srgbVec(U.uSeaHaze.value, SE.haze);
    U.uSeaP.value.set(SE.relief, SE.shadow, SE.octave2, SE.flat); U.uSeaB.value.set(SE.shadeMid, Math.max(SE.shadeMid + 0.005, SE.midLit), SE.radius, 0); U.uSeaFade.value.set(SE.fadeStart, Math.max(SE.fadeStart + 1, SE.fadeEnd)); U.uLow.value = low ? 1 : 0;
  }
  // cel -> the shared uniforms of each material kind (softness per kind). Disabled = neutral (exactly plain Lambert).
  const _ct = new THREE.Color();
  function applyCel(CL) {
    const on = !!(CL && CL.enabled);
    for (const kind of Object.keys(CEL_U)) { const U = CEL_U[kind];
      if (!on) { U.uCel.value.set(0, 0.26, 0.05, 0); U.uCelLit.value.set(1, 0.8, 1, 0); U.uCelShade.value.set(1, 1, 1, 0); U.uCelRim.value.set(0, 0, 0, 3); continue; }
      U.uCel.value.set(CL.amount, CL.terminator, CL.softness[kind], CL.shade); U.uCelLit.value.set(CL.lit, CL.highlight.threshold, CL.highlight.level, CL.highlight.enabled ? 1 : 0);
      _ct.set(CL.shadeTint); const l = 0.2126 * _ct.r + 0.7152 * _ct.g + 0.0722 * _ct.b || 1; U.uCelShade.value.set(_ct.r / l, _ct.g / l, _ct.b / l, CL.shadeAmount);
      const RM = CL.rim; _ct.set(RM.color); U.uCelRim.value.set(_ct.r * (RM.enabled ? RM.strength : 0), _ct.g * (RM.enabled ? RM.strength : 0), _ct.b * (RM.enabled ? RM.strength : 0), RM.power);
      U.uCelRimP.value.set(RM.upCutoff, RM.wrap); }
  }
  // post -> the composite uniforms (the bloom chain reads post.bloom per frame in renderFrame)
  function applyPost(PO) {
    if (!compMat) return; const U = compMat.uniforms, I = PO.ink, G = PO.grade, V = PO.vignette;
    _ct.set(I.color); U.uInk.value.set(_ct.r, _ct.g, _ct.b, I.strength); U.uInkP.value.set(I.jumpStart, Math.max(I.jumpStart + 1e-3, I.jumpFull), I.surfaceMix, I.enabled ? 1 : 0);
    _ct.set(I.violet); U.uInkViolet.value.set(_ct.r, _ct.g, _ct.b); U.uInkFade.value.set(I.fadeStart, Math.max(I.fadeStart + 1, I.fadeEnd));
    const unit = (v, hex, amt) => { _ct.set(hex); const l = 0.2126 * _ct.r + 0.7152 * _ct.g + 0.0722 * _ct.b || 1; v.set(_ct.r / l, _ct.g / l, _ct.b / l, amt); };
    unit(U.uShadowTint.value, G.shadowTint, G.amount); unit(U.uHighTint.value, G.highlightTint, G.amount);
    U.uGrade.value.set(1 + G.saturation, G.contrast, G.enabled ? 1 : 0, G.pivot); U.uGrade2.value.set(G.shadowSaturation, 0);
    U.uVig.value.set(V.offset, Math.max(V.offset + 0.05, 1.0), V.darkness, V.enabled ? 1 : 0);
    U.uDitherC.value = PO.composite.dither ? 1 : 0;
  }
  window.__look = {   // the panel's handle (lib/look-panel.js)
    get name() { return LOOK.name; }, get preset() { return LOOK.preset; },
    presets: LP.presets, schema: window.__LOOK_SCHEMA__, dayCycle: LP.dayCycle, conventions: LP.conventions, defaultName: LP.default,
    apply(p, now) { applyLook(p || LOOK.preset, { now: !!now }); },   // (now: repaint the terrain immediately instead of debounced)
    select(name) { const q = LP.presets[name]; if (!q || q.status !== 'active') return false; LOOK.name = name; applyLook(cloneLook(q), { now: true }); return true; },
    add(name, p) { LP.presets[name] = p; },
    dayCyclePreset,
    // TIME OF DAY (look core): the keyframe blend at hour h (lib/look-core.mjs presetAtHour); setHour applies it (name 'Time h.hh h')
    timeOfDay: LP.timeOfDay || null,
    atHour(h) { return LC ? LC.presetAtHour(LP, h).preset : null; },
    setHour(h) { if (!LC) return false; LOOK.name = hourName(h); applyLook(LC.presetAtHour(LP, h).preset, { now: true }); return true; },
  };

  // ---- frame-time instrumentation: ?stats=1 overlay (fps / frame ms / draw calls / triangles) and window.__frameStats(n), which
  //      resolves to { medianMs, p95Ms, drawCalls, triangles, ... } over the next n frames. medianMs / p95Ms = the rAF frame
  //      interval (vsync-capped); cpuMedianMs = the render() call; gpuMedianMs = EXT_disjoint_timer_query_webgl2 when the GPU
  //      exposes it. Headless SwiftShader numbers are NOT performance numbers: measure on a real GPU. ----
  const FSTAT = { last: 0, ring: [], waiters: [], gl: renderer.getContext(), tq: null, q: null, pending: [], gpuLast: null, on: QS.get('stats') === '1' };
  FSTAT.tq = FSTAT.gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const pctl = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  function gpuBegin() {
    const { gl, tq } = FSTAT; if (!tq || FSTAT.q || !(FSTAT.on || FSTAT.waiters.length)) return;
    for (let i = FSTAT.pending.length - 1; i >= 0; i--) { const q = FSTAT.pending[i];
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) { if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) FSTAT.gpuLast = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(q); FSTAT.pending.splice(i, 1); } }
    if (FSTAT.pending.length < 4) { FSTAT.q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, FSTAT.q); }
  }
  function gpuEnd() { if (FSTAT.q) { FSTAT.gl.endQuery(FSTAT.tq.TIME_ELAPSED_EXT); FSTAT.pending.push(FSTAT.q); FSTAT.q = null; } }
  function frameStat(now, cpuMs) {
    const dt = FSTAT.last ? now - FSTAT.last : null; FSTAT.last = now; if (dt == null) return;
    const s = { dt, cpu: cpuMs, gpu: FSTAT.gpuLast, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
    FSTAT.ring.push(s); if (FSTAT.ring.length > 240) FSTAT.ring.shift();
    for (let i = FSTAT.waiters.length - 1; i >= 0; i--) { const w = FSTAT.waiters[i]; w.s.push(s); if (w.s.length >= w.n) { FSTAT.waiters.splice(i, 1); w.done(summarise(w.s)); } }
  }
  function summarise(list) {
    const dts = list.map((s) => s.dt), gp = list.map((s) => s.gpu).filter((v) => v != null), md = median(dts);
    return { frames: list.length, medianMs: md, p95Ms: pctl(dts, 0.95), meanMs: dts.reduce((a, b) => a + b, 0) / dts.length, fps: md ? 1000 / md : null,
      cpuMedianMs: median(list.map((s) => s.cpu)), gpuMedianMs: gp.length ? median(gp) : null, gpuTimer: !!FSTAT.tq,
      drawCalls: median(list.map((s) => s.calls)), triangles: median(list.map((s) => s.tris)),
      pixelRatio: renderer.getPixelRatio(), drawingBuffer: [renderer.domElement.width, renderer.domElement.height], three: THREE.REVISION, look: LOOK.name };
  }
  window.__frameStats = (n = 120) => new Promise((done) => FSTAT.waiters.push({ n: Math.max(1, n | 0), s: [], done }));
  const statsEl = FSTAT.on ? Object.assign(document.createElement('div'), { id: 'fstats', className: 'panel' }) : null;
  if (statsEl) { document.body.appendChild(statsEl); setInterval(() => { const r = summarise(FSTAT.ring.slice(-90)); if (!r.frames) return;
    statsEl.textContent = `${r.fps.toFixed(0)} fps  ${r.medianMs.toFixed(1)} ms (p95 ${r.p95Ms.toFixed(1)})  cpu ${r.cpuMedianMs.toFixed(1)}${r.gpuMedianMs != null ? '  gpu ' + r.gpuMedianMs.toFixed(1) : ''} ms  ${r.drawCalls} calls  ${(r.triangles / 1000).toFixed(0)}k tris  x${r.pixelRatio}`; }, 500); }

  // ---- ?diag=gl: the GL facts of THIS device (rainbow-noise diagnosis, AUDIT.md) -> overlay + window.__glFacts() ----
  window.__glFacts = function () {
    const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info'), pf = (t, p) => { const f = gl.getShaderPrecisionFormat(t, p); return f ? f.precision : null; };
    return { three: THREE.REVISION, webgl2: renderer.capabilities.isWebGL2 !== false, renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      bits: { r: gl.getParameter(gl.RED_BITS), g: gl.getParameter(gl.GREEN_BITS), b: gl.getParameter(gl.BLUE_BITS), a: gl.getParameter(gl.ALPHA_BITS), depth: gl.getParameter(gl.DEPTH_BITS), stencil: gl.getParameter(gl.STENCIL_BITS) },
      samples: gl.getParameter(gl.SAMPLES), dither: gl.isEnabled(gl.DITHER), fragHighp: pf(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), fragMediump: pf(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT), shaderPrecision: renderer.capabilities.precision,
      context: gl.getContextAttributes(), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], dpr: window.devicePixelRatio, pixelRatio: renderer.getPixelRatio(), css: [window.innerWidth, window.innerHeight], ua: navigator.userAgent };
  };
  if (DIAG === 'gl') { const el = Object.assign(document.createElement('pre'), { id: 'gldiag', className: 'panel' }); el.textContent = JSON.stringify(window.__glFacts(), null, 1); document.body.appendChild(el); console.log('[diag] gl', window.__glFacts()); }

  // ---- MEASUREMENT MASK (?masks=1 / __viewShot(name, { mask: true })): one extra flat render per shot, classes in pure RGB,
  //      for metrics.mjs: green = island top ground, yellow = island top stone (risers), red = coast wall / underside / seam /
  //      cone, blue = everything standing on a piece (trees, props, paths, water, rocks, stairs), black = sky / clouds / backdrop
  const MASK = { island: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }), obj: new THREE.MeshBasicMaterial({ color: 0x0000ff, fog: false }), attrs: new Map() };   // look-scan: allow (mask class colour)
  function maskAttr(mesh) {   // per-face class colours from the core's face tags + albedo (look.test albedoClass 'stone')
    let a = MASK.attrs.get(mesh); if (a) return a;
    const pid = mesh.name.slice('island:'.length);
    if (PG[pid] && PG[pid].baked) {   // ?baked=1: no per-face tags on the GLB -> the whole piece reads as terrain (green)
      const n = mesh.geometry.attributes.position.count, out = new Float32Array(n * 3); for (let i = 0; i < n; i++) out[i * 3 + 1] = 1;
      a = new THREE.BufferGeometry(); a.setAttribute('position', mesh.geometry.attributes.position); a.setIndex(mesh.geometry.index); a.setAttribute('color', new THREE.BufferAttribute(out, 3));
      MASK.attrs.set(mesh, a); return a;
    }
    const pc = BP.pieces[pid], C = pc.colors, out = new Float32Array(C.length), s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
    for (let t = 0; t < pc.faceCount; t++) { const o = t * 9; let k;
      if (pc.tags[t] !== GT.TAG.top) k = [1, 0, 0];
      else { const r = s((C[o] + C[o + 3] + C[o + 6]) / 3), g = s((C[o + 1] + C[o + 4] + C[o + 7]) / 3), b = s((C[o + 2] + C[o + 5] + C[o + 8]) / 3), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        let h = 0; if (d > 1e-9) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360; }
        k = (h >= 12 && h < 58 && (mx > 0 ? d / mx : 0) < 0.34 && mx >= 0.3) ? [1, 1, 0] : [0, 1, 0]; }
      for (let q = 0; q < 3; q++) out.set(k, o + q * 3); }
    // (a separate geometry sharing the positions: swapping an attribute in place is not re-uploaded within a frame)
    a = new THREE.BufferGeometry(); a.setAttribute('position', mesh.geometry.attributes.position); a.setAttribute('color', new THREE.BufferAttribute(out, 3));
    MASK.attrs.set(mesh, a); return a;
  }
  function renderMask() {
    const saved = [], bg = scene.background, fogS = scene.fog, sm = renderer.shadowMap.enabled;
    const pieceOf = (ob) => { for (let q = ob; q; q = q.parent) if (q.name && q.name.startsWith('piece:')) return /^piece:isle\d/.test(q.name) ? null : q.name; return null; };   // backdrop isles = piece:isle<seed>; 'piece:islet' is a piece
    scene.traverse((ob) => { if (!(ob.isMesh || ob.isLine || ob.isPoints || ob.isSprite)) return;
      saved.push([ob, ob.material, ob.visible, ob.instanceColor || null, ob.geometry]);
      if (!pieceOf(ob) || ob.material === shadowMat) { ob.visible = false; return; }   // contact shadows are ground, not objects
      if (ob.instanceColor) ob.instanceColor = null;
      if (ob.isMesh && ob.name && ob.name.startsWith('island:')) { ob.geometry = maskAttr(ob); ob.material = MASK.island; } else ob.material = MASK.obj; });
    scene.background = new THREE.Color(0x000000); scene.fog = null; renderer.shadowMap.enabled = false;   // look-scan: allow (mask background)
    renderer.render(scene, camera); const url = renderer.domElement.toDataURL('image/png');
    for (const [ob, m, v, ic, geo] of saved) { ob.material = m; ob.visible = v; if (ic) ob.instanceColor = ic; if (geo) ob.geometry = geo; }
    scene.background = bg; scene.fog = fogS; renderer.shadowMap.enabled = sm;
    return url;
  }
  const MASKS = QS.get('masks') === '1';

  // ---- animation clock: every time-driven value in one place, so a capture can freeze it (deterministic shots) ----
  const CAPTURE_T = 0;   // the frozen time of __viewShot captures (sway / cloud drift at rest; water ripples at the game's 1.5 s)
  function animate(t, frozen) {
    const WC = LOOK.preset.wind.clouds;
    sway.uTime.value = t; SKY_DOME_U.uTime.value = t;   // (the painted clouds drift on the same clock)
    wShared.uTime.value = 1.5 + (frozen ? 0 : t);   // ripples move like the game's WaterDriver
    if (WV2.ready && WATER_MODE === 'v2') waterV2Uniforms(1.5 + (frozen ? 0 : t));   // (water v2: phases from the clock, wrapped on the CPU)
    seaGroup.rotation.y = t * WC.seaSpin; driftGroup.rotation.y = Math.sin(t * WC.driftSpeed) * WC.driftAmp;
    if (MESHY.blades) MESHY.blades.rotation.z = -t * MESHY_SET.bladeSpeed;   // the Meshy windmill's sails (at rest in captures)
    layoutClouds(false);   // clouds.layout follows the spin (cleared zones stay put in world space)
  }

  // ---- __viewShot(name, { mask, w, h }) -> { url, mask }: one FIXED comparison view (archipelago.views), all unlocked, rendered
  //      at the view's size with the animation clock frozen; restores the live view afterwards (look-capture.mjs) ----
  window.__viewShot = function (name, o = {}) {
    const c = VIEWS[name]; if (!c) throw new Error('no view ' + name);
    const w = o.w || c.w, h = o.h || c.h, prevU = UNLOCKED, prevD = DOCK;
    UNLOCKED = parseUnlocked(c.unlocked || 'all'); DOCK = null; applyState();
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = RC.fov; applyMode('photo');
    placeCamera(c.az, c.el, c.dist, c.tgt); camera.updateProjectionMatrix(); controls.update(); syncFrame();
    animate(CAPTURE_T, true);
    renderFrame(camera);
    const url = renderer.domElement.toDataURL('image/png'), stats = { scene: { ...POST.scene }, postCalls: POST.postCalls, composite: POST.on }, mask = o.mask ? renderMask() : null;
    UNLOCKED = prevU; DOCK = prevD; applyState();
    renderer.setSize(window.innerWidth, window.innerHeight, false); positionCamera(); syncFrame();
    return { url, mask, three: THREE.REVISION, stats };
  };

  // ---- deterministic screenshot helper: __saveShot(name, preset) -> POST /shot/<name> ----
  window.__saveShot = function (name, o) {
    const w = o.w, h = o.h, prevU = UNLOCKED, prevD = DOCK;
    if (o.unlocked) UNLOCKED = parseUnlocked(o.unlocked); if (o.dock) DOCK = o.dock; else if (o.unlocked) DOCK = null;
    applyState();
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const mode = o.mode === 'gameplay' ? 'gameplay' : 'photo', dist = resolveDist(o, w / h);
    if (mode === 'gameplay' && !inClamp(o.az, o.el, dist)) { console.warn('[clamp] gameplay preset ' + name + ' outside the game clamp'); (window.__clampViolations = window.__clampViolations || []).push(name); }
    camera.fov = RC.fov; applyMode(mode); placeCamera(o.az, o.el, dist, o.tgt); camera.updateProjectionMatrix(); controls.update(); syncFrame();
    console.log('[shot] ' + name + ' visible=' + BP.order.filter((id) => PG[id].group.visible !== false).join(',') + (DOCK ? ' dock=' + DOCK.piece + '@' + DOCK.t : ''));
    if (o.t != null) animate(+o.t, false); else animate(CAPTURE_T, true);   // (deterministic: frozen like __viewShot, or at a given time o.t s: the water review's animated frames)
    renderFrame(camera);
    const url = renderer.domElement.toDataURL('image/png');
    if (o.returnUrl) { const maskUrl = (MASKS || o.mask) ? renderMask() : null; UNLOCKED = prevU; DOCK = prevD; applyState();
      renderer.setSize(window.innerWidth, window.innerHeight, false); positionCamera(); syncFrame(); return Promise.resolve({ url, mask: maskUrl, stats: { scene: { ...POST.scene }, postCalls: POST.postCalls, composite: POST.on } }); }
    const maskUrl = (MASKS || o.mask) ? renderMask() : null;
    UNLOCKED = prevU; DOCK = prevD; applyState();
    renderer.setSize(window.innerWidth, window.innerHeight, false); positionCamera(); syncFrame();
    const post = (n, body) => fetch('/shot/' + n, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body }).then((r) => (r.ok ? 'saved ' + n : 'HTTP ' + r.status)).catch((e) => 'ERR ' + e);
    return maskUrl ? Promise.all([post(name, url), post(name + '_mask', maskUrl)]).then((r) => r.join(', ')) : post(name, url);
  };

  // ---- render loop (performance.now clock: THREE.Clock is deprecated from r183) ----
  const T_START = performance.now();
  applyLook(LOOK.preset);
  applyState();
  (function tick(now) {
    requestAnimationFrame(tick);
    animate((performance.now() - T_START) / 1000, !!QS.get('capture'));   // (water ripples frozen for the deterministic ?capture= driver)
    controls.update(); syncFrame();
    const c0 = performance.now(); gpuBegin(); renderFrame(camera); gpuEnd();
    frameStat(now != null ? now : c0, performance.now() - c0);
  })();

  // ---- comparison-render driver (?capture=prefix): every archipelago preset, in order ----
  (function captureDriver() {
    const CAP = QS.get('capture'); if (!CAP) return;
    const SET = QS.get('set') === 'orbits' && A.orbits ? A.orbits : A.cameras;   // v4: ?set=orbits = the free-orbit check angles
    const ONLY = QS.get('only') ? new Set(QS.get('only').split(',')) : null, order = Object.keys(SET).filter((n) => !ONLY || ONLY.has(n));
    const suffix = SEED === (A.seeds.default >>> 0) ? '' : '_seed' + SEED, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), urlU = QS.get('unlocked');
    (async () => {
      for (let i = 0; i < 1200 && !window.__ready; i++) await sleep(50);
      await sleep(400); let n = 0;
      for (const name of order) { const c = SET[name];
        await window.__saveShot(CAP + '_' + name + suffix, { ...c, unlocked: c.unlocked || urlU || A.defaultUnlocked, dock: c.dock || null }); n++; await sleep(120); }
      window.__captureDone = n; console.log('[capture] done ' + n + ' shots, prefix=' + CAP);
    })();
  })();
})();
