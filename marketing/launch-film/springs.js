// Closed-form damped springs for film.html. Deterministic: the value at any t is computed directly,
// with no frame history, so frames still render in any order (the gate's determinism check holds).
// Idea credit: Raphael Aubry's claude-motion-design (MIT); this implementation is our own.
//
//   <script src="springs.js"></script>            (new-canvas-project.sh copies it in)
//   Spring.unit(t, 'snappy')                      0 -> 1 step response, t in seconds since the move began (0 before)
//   Spring.to(t, [[0, 0], [1.2, 400], [3, 150]], 'camera')
//        a value that starts at 0, springs to 400 from t=1.2, then to 150 from t=3.
//        Multi-target = a SUM of one spring per target change, so a retarget mid-flight keeps its momentum
//        and nothing ever snaps.
//   Spring.to2(t, [[0, [x, y]], [1, [x2, y2]]], 'ui')    same for points ([x, y] or any-length arrays)
//   Spring.presets / Spring.make(stiffness, damping)     custom: { k, c } with mass 1
//
// Presets (stiffness/damping, mass 1):  snappy UI 320/30 (a hair of overshoot)   camera/containers 170/26 (settles clean)
//                                       heavy type/logos 120/24 (no overshoot, weight)   playful mascots 180/12 (bounces)
(function (root) {
  const presets = {
    snappy: { k: 320, c: 30 }, ui: { k: 320, c: 30 },
    camera: { k: 170, c: 26 }, container: { k: 170, c: 26 },
    heavy: { k: 120, c: 24 }, type: { k: 120, c: 24 }, logo: { k: 120, c: 24 },
    playful: { k: 180, c: 12 }, mascot: { k: 180, c: 12 },
  };
  const pick = (p) => (typeof p === 'string' ? presets[p] : p) || presets.snappy;

  // step response of x'' + c x' + k x = k (x(0)=0, x'(0)=0): underdamped, critical and overdamped in closed form
  function unit(t, p) {
    if (!(t > 0)) return 0;
    const { k, c } = pick(p), w0 = Math.sqrt(k), z = c / (2 * w0);
    if (Math.abs(z - 1) < 1e-4) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t));
    }
    const s = Math.sqrt(z * z - 1), r1 = -w0 * (z - s), r2 = -w0 * (z + s);
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }

  // time until the spring stays within eps of its target (for planning holds; scans analytically sampled t)
  function settle(p, eps = 0.005) {
    let last = 0;
    for (let t = 0; t < 10; t += 1 / 240) if (Math.abs(1 - unit(t, p)) > eps) last = t;
    return last;
  }

  // keys: [[t0, v0], [t1, v1], ...] sorted by time. Before t0 the value is v0.
  function to(t, keys, p) {
    let v = keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) break;
      v += (keys[i][1] - keys[i - 1][1]) * unit(t - keys[i][0], p);
    }
    return v;
  }
  function to2(t, keys, p) {
    return keys[0][1].map((_, j) => to(t, keys.map(([kt, kv]) => [kt, kv[j]]), p));
  }

  const Spring = { unit, to, to2, settle, presets, make: (k, c) => ({ k, c }) };
  if (typeof module === 'object' && module.exports) module.exports = Spring; else root.Spring = Spring;
})(typeof window !== 'undefined' ? window : globalThis);
