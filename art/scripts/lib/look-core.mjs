// look-core.mjs -- the WORLDSEED LOOK CORE (art/config/WORLDSEED-BRIEF.md, look-core stage). Pure: no three import, no DOM, so
// tests/lookcore.test.mjs runs it in node. build.mjs hands this file to viewer.mjs, which strips the `export`s and inlines it as
// window.__LOOK_CORE__ (the terrain.mjs / look-save.mjs pattern) ahead of lib/arch-scene.js. Written from the techniques described
// in the Worldseed study (no Worldseed code or assets).
//   time of day   presetAtHour(LP, hour): the mood presets are keyframes on a 0-24 h scalar (preset.hour); every look parameter is
//                 blended between the two neighbouring keyframes (colours in LINEAR, angles along the shorter arc, numbers
//                 linearly, booleans / enums / ints from the nearer keyframe), eased like the game's skyPalette.ts (smoothstep)
//   cel lighting  celPatchLambert(fragmentShader, lambertParsChunk): bands N.L of three r186's MeshLambertMaterial (terminator +
//                 lit + optional highlight band), tints the indirect (hemisphere) light toward a violet shade colour and adds a warm
//                 rim on grazing, non-upward faces. Every anchor must match EXACTLY ONCE, else the shader is returned unchanged
//                 (plain Lambert) with the misses listed. The cast shadow is never banded: three multiplies it into
//                 directLight.color before RE_Direct, so it stays a smooth factor on top of the band.
//   display <-> scene  invNeutral(): the composite tone-maps the scene render once; display-referred colours that three or our
//                 shaders mix in AFTER tone mapping on the plain path (fog, underside haze) are pre-inverted for the composite path
//   GLSL          the painted sky + cloud sea (procedural, texture-free), the composite pass (depth ink, Neutral tone mapping on
//                 non-sky pixels, bloom add, split-tone grade, vignette, sRGB once) and the dual-filter bloom chain
const HEX = /^#[0-9A-Fa-f]{6}$/;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- colour ----
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
export const rgbToHex = (c) => '#' + c.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
export const hexToLinear = (h) => hexToRgb(h).map(srgbToLinear);
export const linearToHex = (c) => rgbToHex(c.map((v) => linearToSrgb(clamp(v, 0, 1))));
export const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export function hsvOf(c) { const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0;
  if (d > 1e-9) { if (mx === r) h = 60 * (((g - b) / d) % 6); else if (mx === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); if (h < 0) h += 360; }
  return [h, mx > 0 ? d / mx : 0, mx]; }

// ---- three's NeutralToneMapping (Khronos PBR Neutral, r186 constants), JS, and its inverse ----
export function neutral(c, exposure = 1) {
  const S = 0.8 - 0.04, D = 0.15; let x = c.map((v) => v * exposure);
  const m = Math.min(...x), off = m < 0.08 ? m - 6.25 * m * m : 0.04; x = x.map((v) => v - off);
  const peak = Math.max(...x); if (peak < S) return x;
  const d = 1 - S, np = 1 - d * d / (peak + d - S); x = x.map((v) => v * np / peak);
  const g = 1 - 1 / (D * (peak - np) + 1); return x.map((v) => v + (np - v) * g);
}
// invNeutral(display-linear rgb) -> scene-linear rgb with neutral(result, exposure) = target, CLOSED FORM (targets clamp to < 1):
//   compressed (max >= 0.76): the max channel IS the new peak -> peak = d^2 / (1 - newPeak) - d + S; undo the desaturation mix
//   (g from peak / newPeak) and the peak scaling; then undo the offset: min >= 0.04 -> +0.04, else the toe x = sqrt(y / 6.25)
export function invNeutral(t, exposure = 1) {
  const S = 0.8 - 0.04, D = 0.15, d = 1 - S; let y = t.map((v) => clamp(v, 0, 0.9995));
  const np = Math.max(...y);
  if (np >= S) { const peak = d * d / (1 - np) - d + S, g = 1 - 1 / (D * (peak - np) + 1);
    y = y.map((v) => (g < 1 ? (v - np * g) / (1 - g) : v) * peak / np); }
  const m = Math.min(...y), off = m >= 0.04 ? 0.04 : Math.sqrt(Math.max(0, m) / 6.25) - m;
  return y.map((v) => Math.max(0, (v + off) / exposure));
}

// ---- time of day: the mood presets are keyframes on a 0-24 h scalar ----
export const ANGLE_PATHS = ['sun.azimuthDeg', 'clouds.layout.clearAzDeg'];
export const ease = (t, kind) => (kind === 'linear' ? t : t * t * (3 - 2 * t));
const isHex = (v) => typeof v === 'string' && HEX.test(v);
// blend two presets of the same shape: t = 0 -> a, 1 -> b
export function blendPresets(a, b, t, at = '') {
  if (isHex(a) && isHex(b)) { const A = hexToLinear(a), B = hexToLinear(b); return linearToHex(A.map((v, i) => v + (B[i] - v) * t)); }
  if (typeof a === 'number' && typeof b === 'number') {
    if (ANGLE_PATHS.includes(at)) { let d = ((b - a) % 360 + 540) % 360 - 180; let v = a + d * t; v = ((v + 180) % 360 + 360) % 360 - 180; return v; }
    if (/(^|\.)(seed|mapSize)$/.test(at)) return t < 0.5 ? a : b;   // ints / enums stored as numbers
    return a + (b - a) * t;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    const out = {}; for (const k of Object.keys(a)) out[k] = k in b ? blendPresets(a[k], b[k], t, at ? at + '.' + k : k) : clone(a[k]); return out;
  }
  return t < 0.5 ? clone(a) : clone(b);   // booleans, enums, strings
}
// the keyframes: LP.timeOfDay.keyframes (names), each an active preset with a numeric `hour`, sorted by hour
export function keyframesOf(LP) {
  const names = (LP.timeOfDay && LP.timeOfDay.keyframes) || Object.keys(LP.presets).filter((n) => typeof LP.presets[n].hour === 'number' && LP.presets[n].phase >= 1);
  return names.map((n) => [LP.presets[n] && LP.presets[n].hour, n]).filter(([h, n]) => typeof h === 'number' && LP.presets[n].status === 'active').sort((p, q) => p[0] - q[0]);
}
// presetAtHour(LP, hour) -> { preset, from, to, t } ; wraps around midnight (last keyframe -> first + 24 h)
export function presetAtHour(LP, hour) {
  const K = keyframesOf(LP); if (!K.length) throw new Error('no time-of-day keyframes');
  const h = ((hour % 24) + 24) % 24, kind = (LP.timeOfDay && LP.timeOfDay.ease) || 'smoothstep';
  if (K.length === 1) return { preset: clone(LP.presets[K[0][1]]), from: K[0][1], to: K[0][1], t: 0 };
  let i = K.length - 1; for (let k = 0; k < K.length; k++) if (K[k][0] <= h) i = k;
  let [h0, n0] = K[i], [h1, n1] = K[(i + 1) % K.length];
  if (h < K[0][0]) { [h0, n0] = K[K.length - 1]; h0 -= 24; [h1, n1] = K[0]; } else if (i === K.length - 1) h1 += 24;
  const raw = h1 > h0 ? (h - h0) / (h1 - h0) : 0, t = ease(clamp(raw, 0, 1), kind);
  const p = blendPresets(LP.presets[n0], LP.presets[n1], t);
  p.status = 'active'; p.hour = +h.toFixed(4); p.phase = Math.max(LP.presets[n0].phase || 0, LP.presets[n1].phase || 0);
  p.description = `Time of day ${h.toFixed(2)} h: ${n0} (${K[i][0]} h) -> ${n1} (${K[(i + 1) % K.length][0]} h), t = ${t.toFixed(3)} (${kind}).`;
  return { preset: p, from: n0, to: n1, t };
}

// ---- guarded shader patching ----
export function countOf(src, find) { let n = 0, i = 0; while ((i = src.indexOf(find, i)) >= 0) { n++; i += find.length; } return n; }
// replace `find` (a literal string) only when it occurs EXACTLY once; else report the count and leave the source alone
export function replaceOnce(src, find, repl) { const n = countOf(src, find); return n === 1 ? { src: src.replace(find, () => repl), ok: true, count: 1 } : { src, ok: false, count: n }; }

// CEL: uniforms + helpers prepended to three's lights_lambert_pars_fragment
export const CEL_PARS = `
uniform vec4 uCel;      // x amount (0 = plain Lambert), y terminator N.L, z softness (half width), w shade level
uniform vec4 uCelLit;   // x lit level, y highlight N.L, z highlight level, w highlight on
uniform vec4 uCelShade; // rgb violet shade tint (unit luma), a amount (indirect / hemisphere light)
uniform vec4 uCelRim;   // rgb warm rim colour x strength, a power
uniform vec2 uCelRimP;  // x up-facing cutoff (no rim on faces turned up), y light wrap
float celBand( const in float ndl ) {
	float w = max( uCel.z, 1e-4 );
	float b = mix( uCel.w, uCelLit.x, smoothstep( uCel.y - w, uCel.y + w, ndl ) );
	b = mix( b, uCelLit.z, uCelLit.w * smoothstep( uCelLit.y - w, uCelLit.y + w, ndl ) );
	return mix( saturate( ndl ), b, uCel.x );
}
vec3 celShade( const in vec3 irr ) {
	return mix( irr, dot( irr, vec3( 0.2126, 0.7152, 0.0722 ) ) * uCelShade.rgb, uCelShade.a );
}
float celRim( const in vec3 n, const in vec3 v, const in vec3 l ) {
	vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	float g = pow( 1.0 - saturate( dot( n, v ) ), uCelRim.a );
	return g * ( 1.0 - smoothstep( 0.0, uCelRimP.x, dot( n, upV ) ) ) * saturate( ( dot( n, l ) + uCelRimP.y ) / ( 1.0 + uCelRimP.y ) );
}
`;
export const CEL_ANCHORS = {
  include: '#include <lights_lambert_pars_fragment>',
  dotNL: 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
  direct: 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  indirect: 'reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
};
// celPatchLambert(fragmentShader, chunk) -> { src, applied, misses: [anchor: count] }
//   fragmentShader = a MeshLambertMaterial's shader.fragmentShader in onBeforeCompile (includes unexpanded)
//   chunk          = THREE.ShaderChunk.lights_lambert_pars_fragment (three r186)
export function celPatchLambert(fragmentShader, chunk) {
  const misses = [];
  if (countOf(fragmentShader, 'celBand(') > 0) misses.push('already patched');
  const inc = countOf(fragmentShader, CEL_ANCHORS.include); if (inc !== 1) misses.push(`include x${inc}`);
  let c = String(chunk || '');
  const a = replaceOnce(c, CEL_ANCHORS.dotNL, 'float dotNL = celBand( dot( geometryNormal, directLight.direction ) );'); if (!a.ok) misses.push(`dotNL x${a.count}`); c = a.src;
  const b = replaceOnce(c, CEL_ANCHORS.direct, CEL_ANCHORS.direct + '\n\treflectedLight.directDiffuse += celRim( geometryNormal, geometryViewDir, directLight.direction ) * uCelRim.rgb * directLight.color * BRDF_Lambert( material.diffuseColor );');
  if (!b.ok) misses.push(`direct x${b.count}`); c = b.src;
  const d = replaceOnce(c, CEL_ANCHORS.indirect, 'reflectedLight.indirectDiffuse += celShade( irradiance ) * BRDF_Lambert( material.diffuseColor );'); if (!d.ok) misses.push(`indirect x${d.count}`); c = d.src;
  if (misses.length) return { src: fragmentShader, applied: false, misses };
  return { src: fragmentShader.replace(CEL_ANCHORS.include, () => CEL_PARS + c), applied: true, misses };
}

// ---- GLSL: the painted sky (camera-centred inverted sphere; procedural, NO textures) ----
export const SKY_VS = `varying vec3 vDir; varying vec4 vClip;
void main() { vDir = position; vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 ); vClip = p; gl_Position = vec4( p.xy, p.w * 0.99999, p.w ); }`;
// hash without sine (Dave Hoskins' hash without sine, public domain idea; written here for 2D cells)
const HASH = `
vec3 skyHash32( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) ); p3 += dot( p3, p3.yxz + 33.33 ); return fract( ( p3.xxy + p3.yzz ) * p3.zyx ); }
float skyHash11( float p ) { p = fract( p * 0.1031 ); p *= p + 33.33; p *= p + p; return fract( p ); }`;
export const SKY_FS = `varying vec3 vDir; varying vec4 vClip;
uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSunHorizon; uniform vec3 uBelow; uniform vec3 uSunDir;
uniform float uSpread; uniform float uZenithEl; uniform float uExp; uniform float uBelowDepth; uniform float uWarmEl; uniform float uDither;
uniform float uScreenTint; uniform vec2 uTintRange;
uniform float uPainted;  // 0 = the phase-1 gradient dome (exact), 1 = painted sky + clouds
uniform vec2 uMidEl;     // x elevation (rad) of the mid colour, y its weight
uniform vec4 uGlow;      // rgb warm glow colour, a strength (horizon band toward the sun)
uniform vec2 uGlowW;     // x elevation half-width (rad), y azimuth half-width (rad)
uniform float uTime; uniform vec2 uDrift;   // shared clock, drift velocity (u/s)
uniform vec4 uCu;        // overhead cumulus: x on, y cell size (u), z plane height above the camera (u), w coverage
uniform vec3 uCuShade; uniform vec3 uCuMid; uniform vec3 uCuLit; uniform vec3 uCuRim;
uniform vec4 uBands;     // x shade->mid N.L, y mid->lit N.L, z rim width, w band softness
uniform vec4 uTw;        // horizon towers: x on, y height (rad), z cells around the horizon, w coverage
uniform vec4 uSea;       // cloud sea: x on, y cell size (u), z sea plane world y, w coverage
uniform vec3 uSeaDeep; uniform vec3 uSeaShade; uniform vec3 uSeaMid; uniform vec3 uSeaCap;
uniform vec4 uSeaP;      // x relief (normal tilt), y cast-shadow reach (cells), z octave-2 amount, w flat-top rim share (0 = domes)
uniform vec4 uSeaB;      // sea: x band shade->mid, y band mid->cap (N.L relative to a flat top), z puff radius (cells), w unused
uniform vec3 uSeaHaze; uniform vec2 uSeaFade;   // horizon haze colour, fade distance start / end (u along the plane)
uniform float uLow;      // low detail: 1 octave, no cast shadow, no towers
${HASH}
// soft union (log-sum-exp) of puffs from a jittered cell grid, in cell units; returns (height, gradient). flat = 0: hemispheres
// (overhead cumulus, towers), flat > 0: flat-topped puffs (the cloud sea seen from above: a plateau of height r whose rim falls off
// over the outer 'flat' share of the radius = cream caps with shaded walls, bigger puffs standing higher than smaller ones)
vec3 skyPuffs( vec2 p, float cov, float salt, float flt, float rmax ) {
	vec2 c = floor( p ), f = fract( p ); float acc = 0.0; vec2 gacc = vec2( 0.0 ); const float K = 7.0;
	for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
		vec2 g = vec2( float( i ), float( j ) ); vec3 h = skyHash32( c + g + salt );
		float on = step( h.z, cov ), r = mix( 0.55 * rmax, rmax, fract( h.z * 7.13 + h.x ) );
		vec2 o = g + 0.18 + 0.64 * h.xy - f; float d2 = dot( o, o ) / ( r * r );
		float s = sqrt( max( 0.0, 1.0 - d2 ) ), hg, dh;
		if ( flt > 0.0 ) { float d = sqrt( d2 ), u = clamp( ( 1.0 - d ) / flt, 0.0, 1.0 ); hg = r * u * u * ( 3.0 - 2.0 * u ); dh = 6.0 * u * ( 1.0 - u ) / ( flt * max( d, 1e-3 ) * r ); }
		else { hg = r * s; dh = 1.0 / ( r * max( s, 0.08 ) ); }
		float e = on * ( exp( K * hg ) - 1.0 );
		acc += e; gacc += ( e + on ) * o * dh * step( d2, 1.0 );
	}
	return vec3( log( 1.0 + acc ) / K, gacc / ( 1.0 + acc ) );
}
vec3 skyBands( float ndl, float fw, vec3 sh, vec3 md, vec3 lt ) {
	float w = uBands.w + fw;
	return mix( mix( sh, md, smoothstep( uBands.x - w, uBands.x + w, ndl ) ), lt, smoothstep( uBands.y - w, uBands.y + w, ndl ) );
}
vec3 srgbToLin( vec3 c ) { return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) ); }
void main() {
	vec3 d = normalize( vDir );
	float el = asin( clamp( d.y, -1.0, 1.0 ) ), hl = length( d.xz ), sl = length( uSunDir.xz );
	float ca = ( hl > 1e-5 && sl > 1e-6 ) ? dot( d.xz / hl, uSunDir.xz / sl ) : -1.0, az = acos( clamp( ca, -1.0, 1.0 ) );
	float w = ( 1.0 - smoothstep( 0.0, uSpread, az ) ) * ( 1.0 - smoothstep( 0.0, uWarmEl, abs( el ) ) );
	vec3 hor = mix( uHorizon, uSunHorizon, w );
	vec3 c = el >= 0.0 ? mix( hor, uZenith, pow( clamp( el / uZenithEl, 0.0, 1.0 ), uExp ) ) : mix( hor, uBelow, smoothstep( 0.0, uBelowDepth, -el ) );
	if ( uPainted > 0.5 ) {
		// base: zenith / mid / horizon + a warm glow band hugging the horizon toward the sun
		float e = max( el, 0.0 );
		vec3 up = mix( uMid, uZenith, smoothstep( uMidEl.x, uZenithEl, e ) );
		c = mix( hor, up, smoothstep( 0.0, max( uMidEl.x, 1e-3 ), e ) * uMidEl.y + ( 1.0 - uMidEl.y ) * pow( clamp( e / uZenithEl, 0.0, 1.0 ), uExp ) );
		if ( uSea.x > 0.5 ) c = mix( c, mix( uSeaHaze, hor, 0.5 ), ( 1.0 - smoothstep( 0.0, 0.06, el ) ) * step( 0.0, el ) );   // one haze band across the horizon
		c += uGlow.rgb * uGlow.a * ( 1.0 - smoothstep( 0.0, uGlowW.y, az ) ) * exp( -abs( el ) / max( uGlowW.x, 1e-3 ) );
		vec2 drift = uDrift * uTime;
		// overhead cumulus (plane above the camera)
		if ( uCu.x > 0.5 && el > 0.0 ) {
			vec2 q = ( cameraPosition.xz + d.xz / max( d.y, 0.02 ) * uCu.z + drift ) / uCu.y;
			vec3 P = skyPuffs( q, uCu.w, 17.0, 0.0, 0.78 );
			if ( uLow < 0.5 ) { vec3 P2 = skyPuffs( q * 2.3 + 5.1, uCu.w + 0.25, 41.0, 0.0, 0.78 ); float k2 = smoothstep( 0.0, 0.2, P.x ) * 0.45; P = vec3( P.x + P2.x * k2 / 2.3, P.yz + P2.yz * k2 ); }
			vec3 n = normalize( vec3( -P.y, 0.55, -P.z ) );
			float ndl = dot( n, normalize( vec3( uSunDir.x, 0.35, uSunDir.z ) ) ), fwn = fwidth( ndl );
			vec3 cc = skyBands( ndl, fwn, uCuShade, uCuMid, uCuLit );
			float rim = smoothstep( uBands.z, 0.0, P.x ) * smoothstep( 0.2, 0.6, ndl );
			cc = mix( cc, uCuRim, rim * 0.8 );
			float fh = fwidth( P.x ), a = smoothstep( 0.0, fh * 1.5 + 0.004, P.x - 0.03 );
			a *= smoothstep( 0.03, 0.16, el ) * ( 1.0 - smoothstep( 0.6, 1.6, fwidth( q.x ) + fwidth( q.y ) ) );
			c = mix( c, cc, a );
		}
		// horizon towers: a ring of towering stacks standing on the cloud sea's horizon
		if ( uTw.x > 0.5 && uLow < 0.5 && el > -0.05 && el < uTw.y * 1.5 ) {
			// each stack = a union of 4 ellipses in (azimuth cells, elevation) space: a wide base dome + three smaller domes piled on
			// it (a cauliflower silhouette). The outermost ellipse at the pixel gives a 2D normal; lit toward the sun's side and up.
			float ang = atan( d.z, d.x ) / 6.2831853 * uTw.z + drift.x * 0.002, ci = floor( ang );
			float best = 0.0; vec2 nb = vec2( 0.0, 1.0 );
			for ( int i = -1; i <= 1; i ++ ) {
				float id = ci + float( i ), hsh = skyHash11( id * 1.37 + 3.1 ), on = step( hsh, uTw.w );
				float H = uTw.y * mix( 0.45, 1.0, skyHash11( id * 5.3 + 1.7 ) ), w = mix( 0.45, 0.8, skyHash11( id * 2.71 + 9.2 ) ), cx = id + 0.5 + 0.3 * ( skyHash11( id + 4.4 ) - 0.5 );
				for ( int k = 0; k < 4; k ++ ) {
					float fk = float( k ), sx = k == 0 ? 0.0 : ( skyHash11( id * 7.1 + fk ) - 0.5 ) * w * 0.9, sy = k == 0 ? 0.0 : H * ( 0.35 + 0.22 * fk );
					float rx = k == 0 ? w : w * ( 0.62 - 0.1 * fk ), ry = k == 0 ? H * 0.55 : H * ( 0.42 - 0.06 * fk );
					vec2 q2 = vec2( ( ang - cx - sx ) / rx, ( el - sy ) / ry ); float f = on * ( 1.0 - dot( q2, q2 ) );
					if ( f > best ) { best = f; nb = normalize( q2 / vec2( rx * 6.2831853 / uTw.z, ry ) ); }
				}
			}
			float fh = fwidth( best ) * 1.2 + 1e-4, a = smoothstep( 0.0, fh, best );
			vec2 tg = normalize( vec2( -d.z, d.x ) ), sh2 = normalize( uSunDir.xz + 1e-5 );
			float side = dot( tg, sh2 ), ndl = dot( nb, normalize( vec2( side, 0.9 ) ) ) * 0.8 + 0.2 * ( dot( normalize( d.xz ), sh2 ) );
			vec3 tc = skyBands( ndl, fwidth( ndl ), uCuShade, uCuMid, uCuLit );
			tc = mix( tc, uCuRim, smoothstep( 0.12, 0.0, best ) * smoothstep( 0.2, 0.6, ndl ) * 0.6 );
			tc = mix( tc, uSeaHaze, 0.55 * ( 1.0 - smoothstep( -0.01, uTw.y * 0.45, el ) ) );
			c = mix( c, tc, a );
		}
		// the cloud sea: a puff field on the world plane y = uSea.z below the island, seen from above
		if ( uSea.x > 0.5 && el < 0.0 ) {
			float t = ( cameraPosition.y - uSea.z ) / max( -d.y, 1e-4 );
			vec2 wp = cameraPosition.xz + d.xz * t, q = ( wp + drift ) / uSea.y;
			vec3 P = skyPuffs( q, uSea.w, 3.0, uSeaP.w, uSeaB.z );
			if ( uLow < 0.5 ) { vec3 P2 = skyPuffs( q * 2.4 + 11.3, 0.7, 29.0, uSeaP.w, 0.8 ); float k2 = uSeaP.z * smoothstep( 0.0, 0.15, P.x ); P = vec3( P.x + P2.x * k2 / 2.4, P.yz + P2.yz * k2 ); }
			vec3 n = normalize( vec3( -P.y * uSeaP.x, 1.0, -P.z * uSeaP.x ) );
			// bands on N.L RELATIVE to a flat top (0 on the caps, + on walls facing the sun, - on walls facing away): caps stay lit
			// at every sun height, so one band setting works for every mood
			float ndl = dot( n, uSunDir ) - uSunDir.y, fwn = fwidth( ndl ), wb = uBands.w + fwn;
			vec3 sc = mix( mix( uSeaShade, uSeaMid, smoothstep( uSeaB.x - wb, uSeaB.x + wb, ndl ) ), uSeaCap, smoothstep( uSeaB.y - wb, uSeaB.y + wb, ndl ) );
			if ( uLow < 0.5 ) {   // cast shadow: a puff toward the sun standing higher than the sun ray rises over that distance
				float so = uSeaP.y, tanEl = uSunDir.y / max( length( uSunDir.xz ), 1e-3 );
				float hs = skyPuffs( q + normalize( uSunDir.xz + 1e-5 ) * so, uSea.w, 3.0, uSeaP.w, uSeaB.z ).x, sh = smoothstep( 0.0, 0.05, hs - P.x - so * tanEl );
				sc = mix( sc, uSeaShade, sh );
			}
			float fh = fwidth( P.x ), cov = smoothstep( 0.0, fh * 1.5 + 0.004, P.x - 0.02 );
			sc = mix( uSeaDeep, sc, cov );
			// distance haze (+ wherever a cell shrinks below ~1 px: no moire), meeting the sky's horizon colour exactly at el = 0
			float far = clamp( smoothstep( uSeaFade.x, uSeaFade.y, t ) + smoothstep( 0.25, 0.9, fwidth( q.x ) + fwidth( q.y ) ), 0.0, 1.0 );
			c = mix( sc, uSeaHaze, far );
			c = mix( c, mix( uSeaHaze, hor, 0.5 ), smoothstep( -0.06, 0.0, el ) );
		}
	}
	float sv = vClip.y / vClip.w * 0.5 + 0.5;
	c = mix( c, uZenith, uScreenTint * smoothstep( uTintRange.x, uTintRange.y, sv ) );
	c += uDither * ( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5 ) / 255.0;
	// display-referred: written raw on the plain path; the composite path (linear target) gets it linearised, alpha 0 = sky
	bool toScreen = linearToOutputTexel( vec4( 0.5 ) ).r > 0.6;
	gl_FragColor = toScreen ? vec4( c, 1.0 ) : vec4( srgbToLin( max( c, 0.0 ) ), 0.0 );
}`;

// ---- GLSL: the composite pass (one fullscreen ShaderMaterial, toneMapped:false) ----
export const QUAD_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;
export const NEUTRAL_GLSL = `
vec3 lcNeutral( vec3 color, float exposure ) {
	const float StartCompression = 0.8 - 0.04; const float Desaturation = 0.15;
	color *= exposure; float x = min( color.r, min( color.g, color.b ) ); float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset; float peak = max( color.r, max( color.g, color.b ) ); if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression; float newPeak = 1. - d * d / ( peak + d - StartCompression ); color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. ); return mix( color, vec3( newPeak ), g );
}`;
// display-referred colours on BOTH paths: lcToScreen() is true when three compiled this program for the canvas (sRGB output;
// the plain path, tone mapping in the material) and false for the composite's linear target; lcDisplayToTarget(srgb) returns the
// raw sRGB colour on the canvas and its scene-linear pre-image (inverse Neutral) for the composite, which tone-maps it back.
// Needs `uniform float uLcExposure;` (the preset's exposure).
export const DISPLAY_GLSL = `
bool lcToScreen() { return linearToOutputTexel( vec4( 0.5 ) ).r > 0.6; }
vec3 lcSrgbToLin( vec3 c ) { return mix( c / 12.92, pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ), step( 0.04045, c ) ); }
vec3 lcInvNeutral( vec3 y, float exposure ) {   // exact inverse of NeutralToneMapping (see invNeutral in lib/look-core.mjs)
	const float S = 0.76; const float D = 0.15; float d = 1.0 - S;
	y = clamp( y, 0.0, 0.9995 ); float np = max( y.r, max( y.g, y.b ) );
	if ( np >= S ) { float peak = d * d / ( 1.0 - np ) - d + S, g = 1.0 - 1.0 / ( D * ( peak - np ) + 1.0 ); y = ( y - np * g ) / max( 1.0 - g, 1e-4 ) * ( peak / np ); }
	float m = min( y.r, min( y.g, y.b ) ), off = m >= 0.04 ? 0.04 : sqrt( max( m, 0.0 ) / 6.25 ) - m;
	return max( ( y + off ) / exposure, 0.0 );
}
vec3 lcDisplayToTarget( vec3 srgb ) { return lcToScreen() ? srgb : lcInvNeutral( lcSrgbToLin( srgb ), uLcExposure ); }
vec3 lcLinearToTarget( vec3 lin ) { return lcToScreen() ? lin : lcInvNeutral( lin, uLcExposure ); }`;
export const COMPOSITE_FS = `#include <packing>
varying vec2 vUv;
uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tBloom;
uniform vec2 uTexel; uniform float uNear; uniform float uFar; uniform float uExposure; uniform float uTM;
uniform vec4 uInk;      // rgb ink colour (linear), a strength
uniform vec4 uInkP;     // x relative depth jump where the line starts, y full, z surface-hue mix, w on
uniform vec3 uInkViolet; uniform vec2 uInkFade;   // surface colour multiplier, distance fade start / end (u)
uniform vec2 uBloom;    // x strength, y on
uniform vec4 uShadowTint; uniform vec4 uHighTint; // rgb (unit luma), a amount
uniform vec4 uGrade;    // x saturation, y contrast, z on, w pivot luma
uniform vec2 uGrade2;   // x shadow saturation (below the pivot; muted shadows), y unused
uniform vec4 uVig;      // x inner radius, y outer radius, z darkness, w on
uniform float uDitherC;
${NEUTRAL_GLSL}
float lcDepth( vec2 uv ) { float z = texture2D( tDepth, uv ).x; return -perspectiveDepthToViewZ( z, uNear, uFar ); }
void main() {
	vec4 s = texture2D( tScene, vUv );
	float wS = clamp( s.a, 0.0, 1.0 );   // 1 = scene (tone-mapped once here), 0 = sky (display-referred already)
	vec3 col = mix( max( s.rgb, 0.0 ), uTM > 0.5 ? lcNeutral( max( s.rgb, 0.0 ), uExposure ) : max( s.rgb, 0.0 ), wS );
	if ( uBloom.y > 0.5 ) col += texture2D( tBloom, vUv ).rgb * uBloom.x;
	if ( uGrade.z > 0.5 ) {
		float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec3 g = mix( col, col * uShadowTint.rgb, uShadowTint.a * ( 1.0 - smoothstep( 0.0, uGrade.w, l ) ) );
		g = mix( g, g * uHighTint.rgb, uHighTint.a * smoothstep( uGrade.w, 1.0, l ) );
		float l2 = dot( g, vec3( 0.2126, 0.7152, 0.0722 ) );
		g = mix( vec3( l2 ), g, mix( uGrade.x, uGrade2.x, 1.0 - smoothstep( 0.0, uGrade.w, l2 ) ) );
		g = max( ( g - uGrade.w ) * ( 1.0 + uGrade.y ) + uGrade.w, 0.0 );
		col = mix( col, g, wS );
	}
	if ( uInkP.w > 0.5 ) {
		float dc = lcDepth( vUv ), e = 0.0;
		vec2 o1 = vec2( uTexel.x, 0.0 ), o2 = vec2( 0.0, uTexel.y ), o3 = uTexel, o4 = vec2( uTexel.x, -uTexel.y );
		e = max( e, lcDepth( vUv + o1 ) + lcDepth( vUv - o1 ) - 2.0 * dc );
		e = max( e, lcDepth( vUv + o2 ) + lcDepth( vUv - o2 ) - 2.0 * dc );
		e = max( e, ( lcDepth( vUv + o3 ) + lcDepth( vUv - o3 ) - 2.0 * dc ) * 0.7071 );
		e = max( e, ( lcDepth( vUv + o4 ) + lcDepth( vUv - o4 ) - 2.0 * dc ) * 0.7071 );
		float k = smoothstep( uInkP.x, uInkP.y, e / max( dc, 1e-3 ) ) * ( 1.0 - smoothstep( uInkFade.x, uInkFade.y, dc ) ) * step( dc, uFar * 0.999 );
		vec3 ink = mix( uInk.rgb, col * uInkViolet, uInkP.z );
		float li = dot( ink, vec3( 0.2126, 0.7152, 0.0722 ) ), lk = dot( uInk.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
		ink *= max( 1.0, lk / max( li, 1e-5 ) );   // the hue of what it outlines, never darker than the ink itself (no black lines)
		col = mix( col, ink, k * uInk.a );
	}
	if ( uVig.w > 0.5 ) { vec2 p = ( vUv - 0.5 ) * vec2( uTexel.y / uTexel.x, 1.0 ); float r = length( p ) / length( vec2( 0.5 * uTexel.y / uTexel.x, 0.5 ) );
		col *= 1.0 - uVig.z * smoothstep( uVig.x, uVig.y, r ); }
	gl_FragColor = linearToOutputTexel( vec4( col, 1.0 ) );
	gl_FragColor.rgb += uDitherC * ( fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) ) - 0.5 ) / 255.0;
}`;
// ---- GLSL: bloom (prefilter on the tone-mapped display-linear colour, sky excluded; dual-filter down / tent up) ----
export const BLOOM_PRE_FS = `varying vec2 vUv;
uniform sampler2D tScene; uniform vec2 uTexel; uniform float uExposure; uniform vec2 uKnee;   // display luma where bloom starts / is full
${NEUTRAL_GLSL}
vec3 lcSrgb( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
vec3 tap( vec2 uv ) { vec4 s = texture2D( tScene, uv ); vec3 d = lcNeutral( max( s.rgb, 0.0 ), uExposure );
	float l = dot( lcSrgb( clamp( d, 0.0, 1.0 ) ), vec3( 0.2126, 0.7152, 0.0722 ) ); return d * smoothstep( uKnee.x, uKnee.y, l ) * step( 0.999, s.a ); }
void main() { vec2 h = uTexel * 0.5; gl_FragColor = vec4( 0.25 * ( tap( vUv + vec2( -h.x, -h.y ) ) + tap( vUv + vec2( h.x, -h.y ) ) + tap( vUv + vec2( -h.x, h.y ) ) + tap( vUv + h ) ), 1.0 ); }`;
export const BLOOM_DOWN_FS = `varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main() { vec2 h = uTexel * 0.5; vec3 c = texture2D( tSrc, vUv ).rgb * 4.0 + texture2D( tSrc, vUv - h ).rgb + texture2D( tSrc, vUv + h ).rgb + texture2D( tSrc, vUv + vec2( h.x, -h.y ) ).rgb + texture2D( tSrc, vUv + vec2( -h.x, h.y ) ).rgb;
	gl_FragColor = vec4( c / 8.0, 1.0 ); }`;
export const BLOOM_UP_FS = `varying vec2 vUv; uniform sampler2D tSrc; uniform sampler2D tAdd; uniform vec2 uTexel; uniform float uRadius;
void main() { vec2 t = uTexel * uRadius; vec3 c = vec3( 0.0 );
	c += texture2D( tSrc, vUv + vec2( -t.x, -t.y ) ).rgb + texture2D( tSrc, vUv + vec2( t.x, -t.y ) ).rgb + texture2D( tSrc, vUv + vec2( -t.x, t.y ) ).rgb + texture2D( tSrc, vUv + t ).rgb;
	c += 2.0 * ( texture2D( tSrc, vUv + vec2( -t.x, 0.0 ) ).rgb + texture2D( tSrc, vUv + vec2( t.x, 0.0 ) ).rgb + texture2D( tSrc, vUv + vec2( 0.0, -t.y ) ).rgb + texture2D( tSrc, vUv + vec2( 0.0, t.y ) ).rgb );
	c += 4.0 * texture2D( tSrc, vUv ).rgb;
	gl_FragColor = vec4( c / 16.0 + texture2D( tAdd, vUv ).rgb, 1.0 ); }`;

// ---- GPU memory of the composite targets (bytes): MSAA colour + depth renderbuffers, resolved colour + depth, bloom chain ----
export function compositeMemory(w, h, samples = 4, levels = 4) {
  const px = w * h, half = 8, depth = 4;
  const msColour = samples > 0 ? px * samples * half : 0, msDepth = samples > 0 ? px * samples * depth : 0, resolved = px * half, depthTex = px * depth;
  let bloom = 0; for (let k = 1; k <= levels; k++) { const bw = Math.max(1, Math.floor(w / 2 ** k)), bh = Math.max(1, Math.floor(h / 2 ** k)); bloom += bw * bh * half * (k < levels ? 2 : 1); }
  return { msColour, msDepth, resolved, depthTex, bloom, total: msColour + msDepth + resolved + depthTex + bloom };
}

const LC = { srgbToLinear, linearToSrgb, hexToRgb, rgbToHex, hexToLinear, linearToHex, lumaOf, hsvOf, neutral, invNeutral,
  ANGLE_PATHS, ease, blendPresets, keyframesOf, presetAtHour, countOf, replaceOnce, CEL_PARS, CEL_ANCHORS, celPatchLambert,
  SKY_VS, SKY_FS, QUAD_VS, NEUTRAL_GLSL, DISPLAY_GLSL, COMPOSITE_FS, BLOOM_PRE_FS, BLOOM_DOWN_FS, BLOOM_UP_FS, compositeMemory };
export default LC;
