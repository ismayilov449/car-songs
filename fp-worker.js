/* Car Songs — recognition worker: loads the fingerprint database and matches microphone audio. */
importScripts("fp-core.js");

var CHECKS = [4, 6, 8, 10, 12]; // seconds of listening at which we try to recognise
var db = null, twins = new Set();
var raw = null, rawLen = 0, rate = 48000, next = 0, done = true;

self.onmessage = function (e) {
  var m = e.data;
  if (m.type === "init") {
    m.twins.forEach(function (p) { twins.add(Math.min(p[0], p[1]) + "," + Math.max(p[0], p[1])); });
    fetch(m.dbUrl)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        var t0 = Date.now();
        db = FP.parseDB(buf);
        postMessage({ type: "ready", entries: db.n, ms: Date.now() - t0 });
        catchUp();
      })
      .catch(function (err) { postMessage({ type: "error", message: String((err && err.message) || err) }); });
  } else if (m.type === "start") {
    rate = m.rate;
    raw = new Float32Array(Math.ceil(rate * CHECKS[CHECKS.length - 1]) + 1);
    rawLen = 0; next = 0; done = false;
  } else if (m.type === "audio") {
    if (done || !raw) return;
    var d = m.data, take = Math.min(d.length, raw.length - rawLen);
    raw.set(take === d.length ? d : d.subarray(0, take), rawLen);
    rawLen += take;
    catchUp();
  } else if (m.type === "stop") {
    done = true; raw = null;
  }
};

function catchUp() {
  if (!db || done || !raw) return;
  var secs = rawLen / rate, due = -1;
  while (next < CHECKS.length && secs >= CHECKS[next] - 0.01) { due = next; next++; }
  if (due >= 0) run(CHECKS[due]);
}

function run(sec) {
  var t0 = Date.now();
  var q = FP.fingerprint(FP.resample(raw.subarray(0, rawLen), rate));
  var ranked = FP.match(db, q);
  var d = FP.decide(ranked, twins);
  var heard = rawLen / rate;
  if (d) {
    done = true;
    postMessage({ type: "match", songs: d.songs, position: d.offset + heard, score: d.score, seconds: sec,
      ms: Date.now() - t0 });
  } else if (sec >= CHECKS[CHECKS.length - 1]) {
    done = true;
    postMessage({ type: "nomatch", seconds: sec, best: ranked[0] || null });
  } else {
    postMessage({ type: "progress", seconds: sec, ms: Date.now() - t0 });
  }
}
