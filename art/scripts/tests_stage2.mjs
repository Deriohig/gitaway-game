// tests_stage2.mjs  --  STAGE-2 island invariants (SELECTED drama + path network).
// Pure node, array-in/array-out, NO WebGL. Complements tests/terrain.test.mjs
// (which stays the Stage-1 regression). Run:  node tests_stage2.mjs
//
// Added invariants (Stage-2 ask):
//   * drama (rock CLIFF cells) ONLY in the designated drama regions (D/F/H) and
//     NEVER within rockFarmClear of the farm  -> interior stays gentle
//   * the selected rocky ledges (D) actually read as ROCK (steep faces)
//   * the farm stays FIXED + FLAT (pad slope ~0, height 0) and |Δtier| <= 1
//   * the path network CONNECTS to the porch and never crosses / dead-ends on a
//     cliff (max terrain slope along every branch stays gentle)
//   * one watertight heightfield incl. the rim (corners submerged, winding +Y,
//     no degenerate tris, triangle-exact sampler, no NaN); nothing floats/sinks
//   * elevation stays cozy-scaled (bounded max height; base at the mist floor)
// PASS A invariants (paths redesign, hero-view + meadow colour fixes, game parity):
//   * the ROUTED path network (GT.buildPathNetwork) connects: main route starts at
//     the porch, every branch starts ON its parent route, every destination reached
//   * no path corridor (centre +/- half-width + soft edge) ever covers a face at or
//     above the rock threshold (faceBands.slopeRock0)
//   * layout: branches never enter the farm clearing, junctions sit beyond
//     junctionMinR and apart from each other (no X / no crossings), routes don't cross
//   * paths are narrow + tapered (porch width 1.0-1.2u), smooth (no kinks / staircase)
//     and not ruler-straight
//   * the farm clearing is GREEN: zero dirt-coloured terrain faces inside it
//   * meadow colour is CONTINUOUS: on gentle ground every face agrees on a shared
//     vertex's colour (no per-face / per-quad colour blocks)
//   * every GAMEPLAY camera preset obeys the game's OrbitControls clamp; fov 30
import GT from './lib/terrain.mjs';
import L from '../config/look.config.mjs';
import MOD from '../config/modules.config.mjs';
import W3 from '../config/world.config.mjs';

const B = L.terrain.colour.faceBands;
const noise = GT.makeNoise(L.terrain.elevation.seed);
const results = [];
const ok = (name, pass, detail) => results.push({ name, pass: !!pass, detail });
const SEEDS = [W3.seeds.default, W3.seeds.alt];
const DRAMA_REGIONS = new Set(['D', 'F', 'H']);   // the only regions allowed rock cliffs
const rockFarmClear = W3.elevation.rockFarmClear;
const CLIFF_SLOPE = 1.0;                           // a path point steeper than this = on a cliff

function faceInfo(grid, tri) {
  const v = tri.map(i => GT.nodeXYZ(grid, i));
  const ux = v[1][0]-v[0][0], uy = v[1][1]-v[0][1], uz = v[1][2]-v[0][2];
  const vx = v[2][0]-v[0][0], vy = v[2][1]-v[0][1], vz = v[2][2]-v[0][2];
  const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
  const len = Math.hypot(nx, ny, nz) || 1e-9;
  return { rawNy: ny, area: 0.5*len, slope: 1 - Math.abs(ny)/len,
    cx:(v[0][0]+v[1][0]+v[2][0])/3, cy:(v[0][1]+v[1][1]+v[2][1])/3, cz:(v[0][2]+v[1][2]+v[2][2])/3 };
}
function planeInterp(grid, x, z) {
  const { seg, n, X0, Z0, dx, dz, h } = grid;
  let fx=(x-X0)/dx, fz=(z-Z0)/dz; let gi=Math.floor(fx), gj=Math.floor(fz);
  if (gi>=seg) gi=seg-1; if (gj>=seg) gj=seg-1; const u=fx-gi, v=fz-gj;
  const P=(ii,jj)=>[X0+ii*dx, h[jj*n+ii], Z0+jj*dz];
  let p0,p1,p2; if (u>=v){ p0=P(gi,gj); p1=P(gi+1,gj+1); p2=P(gi+1,gj);} else { p0=P(gi,gj); p1=P(gi,gj+1); p2=P(gi+1,gj+1);}
  const x0=p0[0],z0=p0[2],x1=p1[0],z1=p1[2],x2=p2[0],z2=p2[2];
  const det=(z1-z2)*(x0-x2)+(x2-x1)*(z0-z2);
  const a=((z1-z2)*(x-x2)+(x2-x1)*(z-z2))/det, b=((z2-z0)*(x-x2)+(x0-x2)*(z-z2))/det, c=1-a-b;
  return a*p0[1]+b*p1[1]+c*p2[1];
}
// uniform catmull-rom proxy of THREE.CatmullRomCurve3 (gentle, wide-spaced waypoints)
function crSamples(pts, perSeg=14) {
  const P = pts.map(p => [p[0], p[1]]), get = i => P[Math.max(0, Math.min(P.length-1, i))], out = [];
  for (let i=0;i<P.length-1;i++){ const p0=get(i-1),p1=get(i),p2=get(i+1),p3=get(i+2);
    for (let s=0;s<perSeg;s++){ const t=s/perSeg,t2=t*t,t3=t2*t;
      out.push([
        0.5*((2*p1[0])+(-p0[0]+p2[0])*t+(2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2+(-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
        0.5*((2*p1[1])+(-p0[1]+p2[1])*t+(2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2+(-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)]); } }
  out.push([P[P.length-1][0], P[P.length-1][1]]); return out;
}

// ---- RED evidence: TARGET=legacy reproduces the Stage-2 state (four straight spokes
//      from the porch, 1.4u wide, + the viewer's per-QUAD colouring with the baked
//      dirt halo) so the PASS-A invariants can be shown failing on the old code. ----
const LEGACY = process.env.TARGET === 'legacy';
const LEGACY_SPOKES = [
  { to: 'meadow',  points: [[0.9, 1.1], [7, -3], [17, -11], [27, -20], [34, -28]] },
  { to: 'grove',   points: [[0.9, 1.1], [-7, -2], [-20, -9], [-38, -18], [-54, -26]] },
  { to: 'plateau', points: [[0.9, 1.1], [-4, 6], [-11, 14], [-18, 22], [-24, 30], [-27, 34]] },
  { to: 'ledge',   points: [[0.9, 1.1], [8, 5], [18, 12], [27, 19], [33, 25]] },
];
function legacyNetwork() {
  const routes = LEGACY_SPOKES.map((sp, i) => { const s = GT.resamplePolyline(crSamples(sp.points), 0.5);
    return { name: sp.to, kind: i ? 'branch' : 'main', parent: i ? 0 : -1, samples: s, widths: s.map(() => 1.4) }; });
  return { routes, notes: [] };
}
function legacyColours(grid, tris) {      // the Stage-2 viewer loop, verbatim logic
  const TCc = L.terrain.colour, FB = TCc.faceBands, P = L.palette, lin = (t) => GT.hexToLinear(P[t]);
  const grass = lin(TCc.grassToken), meadow = lin(TCc.meadowToken), dark = lin(TCc.darkToken), soil = lin(TCc.soilToken),
    rock = lin(TCc.rockToken), rockDark = lin(TCc.rockDarkToken), pathC = lin('Path'), mist = lin(W3.mist.colorToken);
  const spokes = []; for (const sp of LEGACY_SPOKES) for (const p of crSamples(sp.points, 40)) spokes.push(p);
  const dPath = (x, z) => { let m = 1e9; for (const p of spokes) m = Math.min(m, (p[0]-x)**2 + (p[1]-z)**2); return Math.sqrt(m); };
  const lerp3 = (c, t, k) => { c[0] += (t[0]-c[0])*k; c[1] += (t[1]-c[1])*k; c[2] += (t[2]-c[2])*k; };
  const colours = new Float32Array(tris.length*9), basin = new Uint8Array(tris.length), C = GT.clamp;
  for (let q = 0; q < tris.length; q += 2) {
    const F = [tris[q], tris[q+1]].map(t => { const v = t.map(i => GT.nodeXYZ(grid, i));
      return { v, cx:(v[0][0]+v[1][0]+v[2][0])/3, cy:(v[0][1]+v[1][1]+v[2][1])/3, cz:(v[0][2]+v[1][2]+v[2][2])/3, slope: 1-GT.faceNormal(...v)[1] }; });
    const qx=(F[0].cx+F[1].cx)/2, qy=(F[0].cy+F[1].cy)/2, qz=(F[0].cz+F[1].cz)/2, qs=(F[0].slope+F[1].slope)/2;
    const nz = 0.5 + 0.5*Math.sin(qx*TCc.nFreqX+1.1)*Math.cos(qz*TCc.nFreqZ) + 0.25*Math.sin((qx-qz)*TCc.nFreqDiag);
    const c = grass.slice(); lerp3(c, meadow, C(nz*TCc.meadowWeight + qy*TCc.heightToMeadow, 0, 1)); lerp3(c, dark, C(-qy*TCc.heightToDark + qs*TCc.slopeToDark, 0, TCc.darkMax));
    for (const sp of TCc.soilPatches) lerp3(c, soil, C(sp.strength - Math.hypot(qx-sp.x, qz-sp.z)*sp.falloff, 0, sp.max));
    if (qs < 0.5 && qy > W3.mist.top+1) { const pw = 1 - GT.smoothstep(0.8, 2.4, dPath(qx, qz)); if (pw > 0) lerp3(c, pathC, C(pw*0.52, 0, 0.52)); }
    F.forEach((f, fi) => { const w = GT.faceBlend(f.cy, f.slope, FB), rs = C(f.slope*FB.rockDarkBySlope, 0, 1), t = q + fi;
      const rc = [0,1,2].map(ch => rock[ch] + (rockDark[ch]-rock[ch])*rs);
      const fd = GT.smoothstep(W3.mist.submergeTop, W3.mist.submergeBottom, f.cy)*0.97;
      for (let v = 0; v < 3; v++) for (let ch = 0; ch < 3; ch++) { let val = c[ch]*w.grass + soil[ch]*w.soil + rc[ch]*w.rock; val += (mist[ch]-val)*fd; colours[t*9+v*3+ch] = val; }
      basin[t] = Math.max(f.v[0][1], f.v[1][1], f.v[2][1]) <= W3.mist.submergeBottom ? 1 : 0; });
  }
  return { colours, basin };
}

// ---- aggregate measurements across both locked seeds ----
let dMax=0, cliffBadRegion=0, minCliffFarm=1e9, dRockSlopeMin=1e9, fRockSlopeMin=1e9,
  padSlope=0, padAbs=0, centreAbs=0, inverted=0, degenerate=0, samplerErr=0, nan=0,
  cornersExposed=0, maxH=-1e9, minH=1e9, emptyMod=0, interiorRock=0,
  pathPorchBad=0, pathMaxSlope=0, pathWorst='';
// PASS A accumulators
let pathNotes=[], pathMissing=0, pathFaceMax=0, pathMaxTurn=0, pathInClearing=0, pathMinWind=1e9, pathWMin=1e9, pathWMax=0,
  porchW=0, porchWmin=1e9, pathEndSlope=0, pathJunctionBad=0, pathJunctionMinR=1e9, pathJunctionSep=1e9, pathCrossings=0,
  clearFaces=0, clearHueSum=0, clearDirt=0, colourSteps=0, pathMaxR=0, clearMinHue=360;
const mistFloor = W3.island.mistFloor;

for (const seed of SEEDS) {
  const bw = GT.buildWorld(L, MOD, { seed, testMode:false, world3: W3 });
  const built = bw.built;
  dMax = Math.max(dMax, GT.maxNeighbourTierDelta(built));
  for (const c of built.cells) {
    if (!c.module) emptyMod++;
    if (c.cliff) {
      if (!DRAMA_REGIONS.has(c.region)) cliffBadRegion++;        // drama only in D/F/H
      minCliffFarm = Math.min(minCliffFarm, Math.hypot(c.cx, c.cz));
    }
  }
  const grid = GT.buildHeightGrid(L, MOD.world, built, bw.noise, W3);
  const tris = GT.gridTriangles(grid);
  for (let k=0;k<grid.h.length;k++){ const h=grid.h[k]; if(!Number.isFinite(h)) nan++; maxH=Math.max(maxH,h); minH=Math.min(minH,h); }
  const dCells = built.cells.filter(c=>c.region==='D'), fCells = built.cells.filter(c=>c.region==='F');
  let dSlopeMax=0, fSlopeMax=0, interiorSlopeMax=0;
  for (const tri of tris) {
    const fi = faceInfo(grid, tri);
    if (fi.rawNy <= 0) inverted++;
    if (fi.area < 1e-5) degenerate++;
    const r = Math.hypot(fi.cx, fi.cz);
    if (r < 5) { padSlope=Math.max(padSlope,fi.slope); padAbs=Math.max(padAbs,Math.abs(fi.cy)); }
    // nearest D / F cell proximity for the "rock reads" + "interior gentle" checks
    for (const c of dCells) if (Math.hypot(fi.cx-c.cx, fi.cz-c.cz) < 13) { dSlopeMax=Math.max(dSlopeMax,fi.slope); break; }
    for (const c of fCells) if (Math.hypot(fi.cx-c.cx, fi.cz-c.cz) < 13) { fSlopeMax=Math.max(fSlopeMax,fi.slope); break; }
    // interior near-farm must stay gentle (no rock-grade faces inside rockFarmClear, off the rim)
    if (r < rockFarmClear && r > 6 && fi.slope >= B.slopeRock1) interiorRock++;
  }
  dRockSlopeMin = Math.min(dRockSlopeMin, dSlopeMax);
  fRockSlopeMin = Math.min(fRockSlopeMin, fSlopeMax);
  // triangle-exact sampler (props/veg sit on the surface -> nothing floats/sinks)
  const rng = GT.mulberry32(2024);
  for (let t=0;t<300;t++){ const x=grid.X0+(0.5+rng()*(grid.seg-1))*grid.dx, z=grid.Z0+(0.5+rng()*(grid.seg-1))*grid.dz;
    samplerErr = Math.max(samplerErr, Math.abs(GT.sampleTerrain(x,z,grid) - planeInterp(grid,x,z))); }
  centreAbs = Math.max(centreAbs, Math.abs(GT.sampleTerrain(0,0,grid)));
  // every plane corner is submerged in the mist basin (no exposed hard edge)
  const e=2;
  for (const [sx,sz] of [[grid.X0+e,grid.Z0+e],[grid.X0+e,-grid.Z0-e],[-grid.X0-e,grid.Z0+e],[-grid.X0-e,-grid.Z0-e]])
    if (GT.sampleTerrain(sx,sz,grid) > mistFloor+2) cornersExposed++;
  // path network (PASS A: routed on the heightfield): connects + never crosses/ends on a cliff
  const slopeAt=(x,z)=>{const d=0.6;return Math.hypot(GT.sampleTerrain(x+d,z,grid)-GT.sampleTerrain(x-d,z,grid),GT.sampleTerrain(x,z+d,grid)-GT.sampleTerrain(x,z-d,grid))/(2*d);};
  const net = LEGACY ? legacyNetwork() : GT.buildPathNetwork(W3, grid, bw.noise, { seed });
  const PW = W3.paths, PR = PW.routing, soft = PW.soft || 0;
  if (net.notes.length) pathNotes.push(seed + ': ' + net.notes.join('; '));
  if (!LEGACY && net.routes.length < 1 + PW.branches.length) pathMissing += (1 + PW.branches.length) - net.routes.length;
  const main = net.routes[0];
  if (!main || Math.hypot(main.samples[0][0]-PW.porch[0], main.samples[0][1]-PW.porch[1]) > 0.01) pathPorchBad++;
  const faceSlopeAt = (x, z) => {   // slope (1-ny) of the mesh triangle containing (x,z)
    const fx=(x-grid.X0)/grid.dx, fz=(z-grid.Z0)/grid.dz; let gi=Math.floor(fx), gj=Math.floor(fz); gi=Math.min(gi,grid.seg-1); gj=Math.min(gj,grid.seg-1);
    const u=fx-gi, v=fz-gj, n=grid.n, v00=gj*n+gi, v10=v00+1, v01=v00+n, v11=v01+1;
    const tri = u>=v ? [v00,v11,v10] : [v00,v01,v11];
    return 1 - GT.faceNormal(...tri.map(i=>GT.nodeXYZ(grid,i)))[1];
  };
  const junctions = [];
  net.routes.forEach((rt, ri) => {
    const s = rt.samples;
    let len = 0;
    for (let i=0;i<s.length;i++) {
      const [x,z] = s[i], sl = slopeAt(x,z);
      if (sl>pathMaxSlope){ pathMaxSlope=sl; pathWorst=rt.name+'@'+seed; }
      // corridor faces vs the rock threshold (centre + both soft edges)
      const a = s[Math.max(0,i-1)], b = s[Math.min(s.length-1,i+1)]; let tx=b[0]-a[0], tz=b[1]-a[1]; const tl=Math.hypot(tx,tz)||1; tx/=tl; tz/=tl;
      const hw = rt.widths[i]/2 + soft;
      for (const o of [-hw, -hw/2, 0, hw/2, hw]) { const fs = faceSlopeAt(x - tz*o, z + tx*o); if (fs > pathFaceMax) pathFaceMax = fs; }
      if (i) { len += Math.hypot(x-s[i-1][0], z-s[i-1][1]);
        if (i>1) { const ax=s[i-1][0]-s[i-2][0], az=s[i-1][1]-s[i-2][1], bx=x-s[i-1][0], bz=z-s[i-1][1];
          const ang = Math.acos(Math.max(-1, Math.min(1, (ax*bx+az*bz)/((Math.hypot(ax,az)*Math.hypot(bx,bz))||1)))) * 180/Math.PI;
          if (ang > pathMaxTurn) pathMaxTurn = ang; } }
      if (rt.kind === 'branch' && Math.hypot(x,z) < (PR.clearR || 0)*0.9) pathInClearing++;
      pathMaxR = Math.max(pathMaxR, Math.hypot(x,z));
    }
    const chord = Math.hypot(s[s.length-1][0]-s[0][0], s[s.length-1][1]-s[0][1]);
    pathMinWind = Math.min(pathMinWind, len/(chord||1));
    for (const w of rt.widths) { pathWMin = Math.min(pathWMin, w); pathWMax = Math.max(pathWMax, w); }
    if (ri === 0) { porchW = Math.max(porchW, rt.widths[0]); porchWmin = Math.min(porchWmin, rt.widths[0]); }
    // endpoint (destination) on gentle ground, never at a cliff
    pathEndSlope = Math.max(pathEndSlope, slopeAt(...s[s.length-1]));
    if (rt.kind === 'branch') {
      const par = net.routes[rt.parent];
      const onParent = par.samples.some(p => Math.hypot(p[0]-s[0][0], p[1]-s[0][1]) < 1e-9);
      if (!onParent) pathJunctionBad++;
      junctions.push(s[0]); pathJunctionMinR = Math.min(pathJunctionMinR, Math.hypot(...s[0]));
    }
  });
  junctions.push(PW.leadOut[PW.leadOut.length-1]);
  for (let a=0;a<junctions.length;a++) for (let b=a+1;b<junctions.length;b++) pathJunctionSep = Math.min(pathJunctionSep, Math.hypot(junctions[a][0]-junctions[b][0], junctions[a][1]-junctions[b][1]));
  // routes never cross each other (segments farther than 2u from any junction)
  const segX = (p1,p2,p3,p4) => { const d=(p2[0]-p1[0])*(p4[1]-p3[1])-(p2[1]-p1[1])*(p4[0]-p3[0]); if (Math.abs(d)<1e-12) return false;
    const t=((p3[0]-p1[0])*(p4[1]-p3[1])-(p3[1]-p1[1])*(p4[0]-p3[0]))/d, u=((p3[0]-p1[0])*(p2[1]-p1[1])-(p3[1]-p1[1])*(p2[0]-p1[0]))/d; return t>0&&t<1&&u>0&&u<1; };
  const nearJ = (p) => junctions.some(J => Math.hypot(p[0]-J[0], p[1]-J[1]) < 2.0);
  for (let a=0;a<net.routes.length;a++) for (let b=a+1;b<net.routes.length;b++) {
    const A=net.routes[a].samples, B=net.routes[b].samples;
    for (let i=1;i<A.length;i++) { if (nearJ(A[i])) continue; for (let j=1;j<B.length;j++) { if (nearJ(B[j])) continue; if (segX(A[i-1],A[i],B[j-1],B[j])) pathCrossings++; } }
  }
  // ---- terrain colours: GREEN clearing + CONTINUOUS meadow colour ----
  const TC = LEGACY ? legacyColours(grid, tris) : GT.terrainColours(L, W3, grid, { tris });
  const nodeCol = new Map();
  for (let t=0;t<tris.length;t++) {
    const fi = faceInfo(grid, tris[t]);
    if (TC.basin[t]) continue;
    // sRGB hue/sat of the face (mean of its 3 vertex colours)
    const rgb=[0,1,2].map(ch => GT.linearToSrgb((TC.colours[t*9+ch]+TC.colours[t*9+3+ch]+TC.colours[t*9+6+ch])/3));
    const mx=Math.max(...rgb), mn=Math.min(...rgb), d=mx-mn; let h=0;
    if (d>1e-9){ if (mx===rgb[0]) h=60*(((rgb[1]-rgb[2])/d)%6); else if (mx===rgb[1]) h=60*((rgb[2]-rgb[0])/d+2); else h=60*((rgb[0]-rgb[1])/d+4); if (h<0) h+=360; }
    const sat = mx>0 ? d/mx : 0;
    // "dirt-coloured" = pulled out of the green family toward tan/khaki (the baked Stage-2
    // halo reads hue ~50-60 in albedo and tan once warm-lit); grass/meadow palette = 82-98deg
    if (Math.hypot(fi.cx, fi.cz) < W3.clearing.flatInner) { clearFaces++; clearHueSum += h; clearMinHue = Math.min(clearMinHue, h); if (h < 65 && sat >= 0.2) clearDirt++; }
    if (fi.slope < B.slopeSoil0) {
      for (let v=0;v<3;v++) { const k=tris[t][v], o=t*9+v*3, c=[TC.colours[o],TC.colours[o+1],TC.colours[o+2]], prev=nodeCol.get(k);
        if (!prev) nodeCol.set(k, c); else colourSteps = Math.max(colourSteps, Math.abs(prev[0]-c[0]), Math.abs(prev[1]-c[1]), Math.abs(prev[2]-c[2])); }
    }
  }
}

// ---- camera presets vs the game clamp (world.config render.gameplay) ----
const GPc = W3.render.gameplay, RCc = W3.render.camera;
let clampBad = [], fovBad = [];
for (const [name, c] of Object.entries(W3.cameras)) {
  if (c.fov != null && c.fov !== RCc.fov) fovBad.push(name);
  if (c.mode !== 'gameplay') continue;
  const t = Math.tan(RCc.fov/2*Math.PI/180), asp = c.w/c.h, F = GPc.frame;
  const dist = c.dist === 'rig' ? Math.max(GPc.minDistance, F.width/(2*t*asp)*F.fill, F.height/(2*t)) : c.dist;
  const pol = Math.PI/2 - c.el*Math.PI/180, az = Math.atan2(Math.sin(c.az*Math.PI/180), Math.cos(c.az*Math.PI/180));
  if (dist < GPc.minDistance || dist > GPc.maxDistance || pol < GPc.minPolar || pol > GPc.maxPolar ||
      az < GPc.azimuthCenter - GPc.azimuthRange || az > GPc.azimuthCenter + GPc.azimuthRange) clampBad.push(name);
}
const gameplayN = Object.values(W3.cameras).filter(c => c.mode === 'gameplay').length;

ok('drama: rock cliffs only in D/F/H, never near farm', cliffBadRegion===0 && minCliffFarm>=rockFarmClear,
  `badRegionCliffs=${cliffBadRegion} minCliffDistFromFarm=${minCliffFarm.toFixed(1)} (rockFarmClear=${rockFarmClear})`);
ok('selected rocky ledges (D) read as rock', dRockSlopeMin >= B.slopeRock1,
  `min D-vicinity face slope=${dRockSlopeMin.toFixed(2)} (rock threshold ${B.slopeRock1})`);
ok('plateau (F) has steep rocky edges (landmark)', fRockSlopeMin >= B.slopeRock0,
  `min F-vicinity max face slope=${fRockSlopeMin.toFixed(2)}`);
ok('interior near farm stays gentle (no rock grade)', interiorRock===0, `interiorRockFaces=${interiorRock}`);
ok('farm fixed + flat (pad slope~0 at height 0)', padSlope<0.12 && padAbs<0.05 && centreAbs<0.02,
  `padSlope=${padSlope.toFixed(3)} padAbs=${padAbs.toFixed(3)} centre=${centreAbs.toFixed(3)}`);
ok('|Δtier| <= 1 + every cell has a module (both seeds)', dMax<=1 && emptyMod===0, `maxΔ=${dMax} emptyModules=${emptyMod}`);
ok('paths connect to porch + never cross a cliff', pathPorchBad===0 && pathMissing===0 && pathJunctionBad===0 && pathMaxSlope < CLIFF_SLOPE && pathEndSlope < CLIFF_SLOPE,
  `porchDisconnected=${pathPorchBad} missingRoutes=${pathMissing} offParentJunctions=${pathJunctionBad} maxPathSlope=${pathMaxSlope.toFixed(2)} (worst ${pathWorst}; cliff>=${CLIFF_SLOPE}) maxEndSlope=${pathEndSlope.toFixed(2)}${pathNotes.length ? ' notes: ' + pathNotes.join(' | ') : ''}`);
const PRr = W3.paths.routing;
ok('no path corridor covers a rock-grade face', pathFaceMax < B.slopeRock0,
  `max face slope under any corridor=${pathFaceMax.toFixed(3)} (rock threshold slopeRock0=${B.slopeRock0})`);
// SCOPE (2026-10-18): only the farm's porch path is built (no island-spanning network);
// branch junction rules still apply if branches are ever configured.
ok('porch path only: in/near the clearing, no X',
  pathInClearing===0 && pathMaxR <= W3.clearing.flatOuter && pathCrossings===0 &&
  (W3.paths.branches.length === 0 || (pathJunctionMinR >= (PRr.junctionMinR||0) - PRr.step && pathJunctionSep >= (PRr.junctionSep||0) - PRr.step)),
  `routes=${1 + W3.paths.branches.length} maxPathRadius=${pathMaxR.toFixed(1)} (<= clearing.flatOuter ${W3.clearing.flatOuter}) branchSamplesInClearing=${pathInClearing} crossings=${pathCrossings}`);
ok('path narrow + tapered + smooth (no kinks)', porchWmin >= 1.0 && porchW <= 1.2 && pathWMax <= 1.25 && pathWMin >= 0.7 && pathMaxTurn <= 30,
  `porchWidth=${porchWmin.toFixed(2)}-${porchW.toFixed(2)} width=${pathWMin.toFixed(2)}..${pathWMax.toFixed(2)} maxTurn/0.5u=${pathMaxTurn.toFixed(1)}deg len/chord=${pathMinWind.toFixed(3)}`);
ok('farm clearing is green (no dirt-coloured faces)', clearDirt===0 && clearFaces>0,
  `dirt/khaki faces (hue<65)=${clearDirt}/${clearFaces} inside r<${W3.clearing.flatInner} meanHue=${(clearHueSum/Math.max(1,clearFaces)).toFixed(1)} minHue=${clearMinHue.toFixed(1)}deg`);
ok('meadow colour continuous (no per-face/quad blocks)', colourSteps < 1e-6,
  `max colour step between faces at a shared gentle vertex=${colourSteps.toExponential(1)}`);
ok('gameplay cameras obey the game clamp; fov 30', clampBad.length===0 && fovBad.length===0 && gameplayN>=3,
  `gameplayPresets=${gameplayN} clampViolations=[${clampBad.join(',')}] fovOverrides=[${fovBad.join(',')}]`);
ok('one watertight mesh (winding+Y, no degenerate, sampler-exact, no NaN)',
  inverted===0 && degenerate===0 && samplerErr<1e-6 && nan===0,
  `inverted=${inverted} degenerate=${degenerate} samplerErr=${samplerErr.toExponential(1)} nan=${nan}`);
ok('rim submerged + cozy-scaled relief (no exposed edge, not mountainous)',
  cornersExposed===0 && minH<=mistFloor+0.01 && maxH<12,
  `cornersExposed=${cornersExposed} maxH=${maxH.toFixed(1)} minH=${minH.toFixed(1)} (mistFloor=${mistFloor})`);

const pad=(s,n)=>(s+' '.repeat(n)).slice(0,n);
console.log('\n  STAGE-2 ISLAND INVARIANTS');
console.log('  '+'-'.repeat(76));
let fails=0;
for (const r of results){ if(!r.pass) fails++; console.log('  '+(r.pass?'PASS':'FAIL')+'  '+pad(r.name,44)+r.detail); }
console.log('  '+'-'.repeat(76));
console.log(`  ${results.length-fails}/${results.length} passed, ${fails} failed\n`);
process.exit(fails ? 1 : 0);
