/* Car Songs — audio fingerprint core (Shazam-style landmarks).
   Mirrors build_pwa.py exactly: same analysis, peaks, pairs and hash layout. */
(function (root) {
  "use strict";
  var P = {
    SR: 8000, NFFT: 1024, HOP: 256, FMIN: 20, FMAX: 480, NT: 6, NF: 10,
    DT_MIN: 2, DT_MAX: 64, DF_MAX: 60, Q_PER_SEC: 16, Q_FANOUT: 10, MIN_SCORE: 10, RATIO: 2
  };
  var N = P.NFFT, NB = P.FMAX - P.FMIN, FPS = P.SR / P.HOP;
  var i;

  var WIN = new Float32Array(N); // numpy.hanning (symmetric)
  for (i = 0; i < N; i++) WIN[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  var LOG = Math.round(Math.log2(N));
  var REV = new Uint32Array(N);
  for (i = 0; i < N; i++) {
    var r = 0, v = i;
    for (var b = 0; b < LOG; b++) { r = (r << 1) | (v & 1); v >>= 1; }
    REV[i] = r;
  }
  var COS = new Float64Array(N / 2), SIN = new Float64Array(N / 2);
  for (i = 0; i < N / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / N); SIN[i] = -Math.sin((2 * Math.PI * i) / N); }
  var RE = new Float64Array(N), IM = new Float64Array(N);

  function fftDb(frame, out) {
    var k, a, c, size, half, step, start, t, tr, ti;
    for (k = 0; k < N; k++) { RE[REV[k]] = frame[k]; IM[REV[k]] = 0; }
    for (size = 2; size <= N; size <<= 1) {
      half = size >> 1; step = N / size;
      for (start = 0; start < N; start += size) {
        for (k = 0, t = 0; k < half; k++, t += step) {
          a = start + k; c = a + half;
          tr = RE[c] * COS[t] - IM[c] * SIN[t];
          ti = RE[c] * SIN[t] + IM[c] * COS[t];
          RE[c] = RE[a] - tr; IM[c] = IM[a] - ti;
          RE[a] += tr; IM[a] += ti;
        }
      }
    }
    for (k = 0; k < NB; k++) {
      var q = k + P.FMIN;
      out[k] = 20 * Math.log10(Math.sqrt(RE[q] * RE[q] + IM[q] * IM[q]) + 1e-6);
    }
  }

  function spectrogram(x) {
    if (x.length < N) { var y = new Float32Array(N); y.set(x); x = y; }
    var T = Math.floor((x.length - N) / P.HOP) + 1;
    var S = new Float32Array(T * NB), frame = new Float32Array(N), row = new Float32Array(NB);
    for (var t = 0; t < T; t++) {
      var o = t * P.HOP;
      for (var k = 0; k < N; k++) frame[k] = x[o + k] * WIN[k];
      fftDb(frame, row);
      S.set(row, t * NB);
    }
    return { S: S, T: T };
  }

  function percentile(arr, p) { // numpy default (linear)
    var s = Float32Array.from(arr).sort();
    var pos = (p / 100) * (s.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  function peaks(spec, perSec) {
    var S = spec.S, T = spec.T, F = NB, t, f, g, m, v, lo, hi;
    var M1 = new Float32Array(T * F), M = new Float32Array(T * F);
    for (t = 0; t < T; t++) {
      var base = t * F;
      for (f = 0; f < F; f++) {
        lo = Math.max(0, f - P.NF); hi = Math.min(F - 1, f + P.NF); m = -1e9;
        for (g = lo; g <= hi; g++) { v = S[base + g]; if (v > m) m = v; }
        M1[base + f] = m;
      }
    }
    for (t = 0; t < T; t++) {
      lo = Math.max(0, t - P.NT); hi = Math.min(T - 1, t + P.NT);
      for (f = 0; f < F; f++) {
        m = -1e9;
        for (g = lo; g <= hi; g++) { v = M1[g * F + f]; if (v > m) m = v; }
        M[t * F + f] = m;
      }
    }
    var floor = Math.max(percentile(S, 99) - 55, -90);
    var cand = [], rowbuf = new Float32Array(F);
    for (t = 0; t < T; t++) {
      rowbuf.set(S.subarray(t * F, t * F + F));
      rowbuf.sort();
      var med = (rowbuf[(F >> 1) - 1] + rowbuf[F >> 1]) / 2;
      for (f = 0; f < F; f++) {
        v = S[t * F + f];
        if (v === M[t * F + f] && v > floor && v > med + 8) cand.push([t, f, v, Math.floor(t / FPS), cand.length]);
      }
    }
    cand.sort(function (a, b) { return a[3] - b[3] || b[2] - a[2] || a[4] - b[4]; });
    var kept = [], sec = -1, rank = 0;
    for (i = 0; i < cand.length; i++) {
      if (cand[i][3] !== sec) { sec = cand[i][3]; rank = 0; }
      if (rank++ < perSec) kept.push(cand[i]);
    }
    kept.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var pt = new Int32Array(kept.length), pf = new Int32Array(kept.length);
    for (i = 0; i < kept.length; i++) { pt[i] = kept[i][0]; pf[i] = kept[i][1]; }
    return { t: pt, f: pf };
  }

  function hashes(pk, fanout) {
    var t = pk.t, f = pk.f, n = t.length, hs = [], ts = [], j0 = 0;
    for (var a = 0; a < n; a++) {
      while (j0 < n && t[j0] < t[a] + P.DT_MIN) j0++;
      var c = 0;
      for (var j = j0; j < n && t[j] <= t[a] + P.DT_MAX && c < fanout; j++) {
        if (Math.abs(f[j] - f[a]) <= P.DF_MAX) {
          hs.push(((f[a] << 15) | (f[j] << 6) | (t[j] - t[a] - 1)) >>> 0);
          ts.push(t[a]);
          c++;
        }
      }
    }
    return { h: Uint32Array.from(hs), t: Int32Array.from(ts) };
  }

  function fingerprint(x8k) {
    return hashes(peaks(spectrogram(x8k), P.Q_PER_SEC), P.Q_FANOUT);
  }

  // ---- microphone rate -> 8 kHz: windowed-sinc low-pass + linear interpolation ----
  var FILTERS = {};
  function lowpass(srcRate) {
    if (FILTERS[srcRate]) return FILTERS[srcRate];
    var taps = 64, fc = 3700 / srcRate, h = new Float32Array(taps), sum = 0, mid = (taps - 1) / 2;
    for (var k = 0; k < taps; k++) {
      var x = k - mid;
      var sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
      h[k] = sinc * (0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (taps - 1)));
      sum += h[k];
    }
    for (k = 0; k < taps; k++) h[k] /= sum;
    return (FILTERS[srcRate] = h);
  }
  function resample(x, srcRate) {
    if (srcRate === P.SR) return x;
    var h = lowpass(srcRate), taps = h.length, ratio = srcRate / P.SR;
    var nOut = Math.max(0, Math.floor((x.length - taps - 1) / ratio));
    var y = new Float32Array(nOut);
    function filt(idx) { var s = 0; for (var k = 0; k < taps; k++) s += h[k] * x[idx - k]; return s; }
    for (var n = 0; n < nOut; n++) {
      var pos = taps - 1 + n * ratio, i0 = Math.floor(pos), fr = pos - i0;
      var a = filt(i0);
      y[n] = fr ? a + (filt(i0 + 1) - a) * fr : a;
    }
    return y;
  }

  // ---- database (fp.bin) ----
  function parseDB(buf) {
    var dv = new DataView(buf);
    var magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== "CSF1") throw new Error("Unknown database format");
    var n = dv.getUint32(8, true), nSongs = dv.getUint32(12, true);
    var times = new Uint16Array(buf, 16, n);
    var songs = new Uint8Array(buf, 16 + 2 * n, n);
    var bytes = new Uint8Array(buf), p = 16 + 3 * n, hsh = new Uint32Array(n), acc = 0;
    for (var k = 0; k < n; k++) {
      var d = 0, shift = 0, byte;
      do { byte = bytes[p++]; d += (byte & 0x7f) * Math.pow(2, shift); shift += 7; } while (byte & 0x80);
      acc += d;
      hsh[k] = acc;
    }
    return { n: n, nSongs: nSongs, hashes: hsh, songs: songs, times: times };
  }

  function lowerBound(a, x) {
    var lo = 0, hi = a.length;
    while (lo < hi) { var mid = (lo + hi) >>> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }

  function match(db, q) {
    var counts = new Map(), H = db.hashes;
    for (var k = 0; k < q.h.length; k++) {
      var hv = q.h[k], j = lowerBound(H, hv);
      for (; j < db.n && H[j] === hv; j++) {
        var key = db.songs[j] * 1000000 + Math.floor((db.times[j] - q.t[k] + 100000) / 2);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    var arr = [];
    counts.forEach(function (c, key) { arr.push([key, c]); });
    arr.sort(function (a, b) { return b[1] - a[1] || a[0] - b[0]; });
    var seen = new Set(), out = [];
    for (var r = 0; r < arr.length && r < 200; r++) {
      var key2 = arr[r][0], s = Math.floor(key2 / 1000000);
      if (seen.has(s)) continue;
      seen.add(s);
      var score = arr[r][1] + (counts.get(key2 - 1) || 0) + (counts.get(key2 + 1) || 0);
      out.push({ song: s, score: score, offset: ((key2 % 1000000) * 2 - 100000) * P.HOP / P.SR });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  function decide(ranked, twins) {
    if (!ranked.length) return null;
    var a = ranked[0], b = ranked[1], sc2 = b ? b.score : 0;
    if (a.score < P.MIN_SCORE) return null;
    if (a.score >= P.RATIO * Math.max(sc2, 1)) return { songs: [a.song], offset: a.offset, score: a.score };
    if (b && sc2 >= P.MIN_SCORE && twins.has(Math.min(a.song, b.song) + "," + Math.max(a.song, b.song))) {
      return { songs: [a.song, b.song], offset: a.offset, score: a.score };
    }
    return null;
  }

  var FP = { P: P, spectrogram: spectrogram, peaks: peaks, hashes: hashes, fingerprint: fingerprint,
    resample: resample, parseDB: parseDB, match: match, decide: decide };
  root.FP = FP;
  if (typeof module !== "undefined" && module.exports) module.exports = FP;
})(typeof self !== "undefined" ? self : globalThis);
