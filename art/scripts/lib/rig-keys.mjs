// rig-keys.mjs -- key reduction within a tolerance for LINEAR animation samplers (ruling R11; used by rig-finalize.mjs).
//   reduceLinear(times, values, size, tol = 1e-4) -> the indices of the keys to keep, ascending
// Keeps the first and last keys, and drops an interior key only when the straight line between the kept keys around it
// reproduces it, and every other key dropped in that span, within tol on each component (quaternion, translation or scale).
// Deterministic: a greedy left-to-right pass that extends each span as far as it can.
export function reduceLinear(times, values, size, tol = 1e-4) {
  const n = times.length;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const fits = (a, b) => {
    for (let k = a + 1; k < b; k++) {
      const u = (times[k] - times[a]) / (times[b] - times[a]);
      for (let c = 0; c < size; c++) {
        const va = values[a * size + c];
        if (Math.abs(va + u * (values[b * size + c] - va) - values[k * size + c]) > tol) return false;
      }
    }
    return true;
  };
  const keep = [0];
  let a = 0;
  for (let b = 2; b < n; b++) if (!fits(a, b)) keep.push((a = b - 1));
  keep.push(n - 1);
  return keep;
}
