/* Car Songs — app logic: song list, categories, artists, skip counter and song recognition. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  fetch("songs.json")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(start)
    .catch(function () {
      $("view-songs").innerHTML = '<div class="empty"><p>The song list did not load. Connect to the internet once and open the app again.</p></div>';
    });

  function start(DATA) {
    var CATS = DATA.cats, SONGS = DATA.songs, ARTISTS = DATA.artists, N = SONGS.length;
    var MAP = { "ə": "e", "ı": "i", "ş": "s", "ç": "c", "ğ": "g", "ö": "o", "ü": "u" };
    function norm(s) {
      return String(s).replace(/İ/g, "i").toLowerCase().replace(/[əışçğöü]/g, function (ch) { return MAP[ch]; })
        .normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }
    function mmss(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2); }
    var CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>';
    var XS = '<span class="x" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></span>';
    var XICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
    var NEXT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5.5v13l9-6.5-9-6.5Z"></path><rect x="16" y="5" width="2.6" height="14" rx="1"></rect></svg>';
    var PREV = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 5.5v13l-9-6.5 9-6.5Z"></path><rect x="5.4" y="5" width="2.6" height="14" rx="1"></rect></svg>';
    var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l11-7L7 5Z"></path></svg>';

    var catBy = {}, byTrack = {}, AIDX = {};
    CATS.forEach(function (c) { catBy[c.code] = c; });
    SONGS.forEach(function (s) { s.h = " " + norm(s.a + " " + s.s + " " + s.o) + " "; byTrack[s.t] = s; });
    SONGS.forEach(function (s) {
      s.k.forEach(function (k) {
        var a = AIDX[k] || (AIDX[k] = { key: k, name: ARTISTS[k], n: norm(ARTISTS[k]), count: 0, cats: [] });
        a.count++;
        if (a.cats.indexOf(s.c) < 0) a.cats.push(s.c);
      });
    });
    var ALIST = Object.keys(AIDX).map(function (k) { return AIDX[k]; }).sort(function (a, b) { return a.n.localeCompare(b.n); });

    var TABS = ["songs", "categories", "artists"];
    var TITLES = { songs: "Songs", categories: "Categories", artists: "Artists" };
    var state = { tab: "songs", cat: "all", artist: "", q: "", aq: "", playing: 0 };
    try {
      var saved = JSON.parse(localStorage.getItem("carSongsState") || "null");
      if (saved) {
        if (saved.cat === "all" || catBy[saved.cat]) state.cat = saved.cat;
        if (!saved.artist || AIDX[saved.artist]) state.artist = saved.artist || "";
        if (TABS.indexOf(saved.tab) >= 0) state.tab = saved.tab;
        if (saved.playing >= 1 && saved.playing <= N) state.playing = saved.playing;
      }
    } catch (e) {}
    var h0 = (location.hash || "").slice(1);
    if (TABS.indexOf(h0) >= 0) state.tab = h0;
    function save() {
      try { localStorage.setItem("carSongsState", JSON.stringify({ tab: state.tab, cat: state.cat, artist: state.artist, playing: state.playing })); } catch (e) {}
    }

    var qEl = $("q"), qClear = $("qclear"), pillsEl = $("pills"), countEl = $("count"), titleEl = $("title");
    var views = { songs: $("view-songs"), categories: $("view-categories"), artists: $("view-artists") };
    var sheet = $("sheet"), sheetBody = $("sheetBody");
    var playEl = $("playing"), playWrap = $("playingWrap"), cur = null;

    // ---------------- skip counter ----------------
    function skipCalc(from, to) {
      var f = (to - from + N) % N, b = (from - to + N) % N;
      return { f: f, b: b, dir: f === 0 ? "now" : (f <= b ? "fwd" : "back"), n: Math.min(f, b) };
    }
    function skipBadge(t) {
      if (!state.playing) return "";
      var k = skipCalc(state.playing, t);
      if (k.dir === "now") return '<span class="skip now">' + PLAY + "now</span>";
      var fwd = k.dir === "fwd";
      return '<span class="skip" aria-label="' + k.n + (k.n === 1 ? " press " : " presses ") + (fwd ? "forward" : "back") + '">' +
        (fwd ? NEXT : PREV) + k.n + "</span>";
    }
    function readPlaying(input) {
      var digits = input.value.replace(/\D/g, "").slice(0, 3);
      if (digits !== input.value) input.value = digits;
      var n = digits ? parseInt(digits, 10) : 0, ok = !digits || (n >= 1 && n <= N);
      var wrap = input.closest(".playing");
      wrap.classList.toggle("bad", !ok);
      wrap.classList.toggle("set", ok && n > 0);
      return ok ? n : 0;
    }
    function setPlaying(n) {
      state.playing = n;
      save();
      if (state.tab === "songs") renderSongs();
      if (sheet.open && cur) updateSkip();
    }
    function setPlayingTrack(t) {
      playEl.value = String(t);
      readPlaying(playEl);
      var si = $("sheetPlaying");
      if (si) { si.value = String(t); readPlaying(si); }
      setPlaying(t);
    }
    function updateSkip() {
      var box = $("skipResult"), setBtn = $("setPlaying");
      if (!box || !cur) return;
      if (!state.playing) {
        box.innerHTML = '<p class="sk-ask">Type the track number that is playing now, or tap the microphone, to see how many presses it takes to get here.</p>';
        if (setBtn) setBtn.hidden = false;
        return;
      }
      var k = skipCalc(state.playing, cur.t);
      if (k.dir === "now") {
        box.innerHTML = '<p class="sk-main now">' + PLAY + "This song is playing now.</p>";
        if (setBtn) setBtn.hidden = true;
        return;
      }
      var fwd = k.dir === "fwd", other = fwd ? k.b : k.f;
      box.innerHTML = '<p class="sk-main">' + (fwd ? NEXT : PREV) + "<b>" + k.n + "</b>" + (k.n === 1 ? "press " : "presses ") +
        (fwd ? "forward" : "back") + "</p>" +
        '<p class="sk-sub">From track ' + state.playing + " to track " + cur.t + ". Going " + (fwd ? "back" : "forward") +
        " would take " + other + (other === 1 ? " press" : " presses") + ".</p>" +
        (fwd ? "" : '<p class="sk-note">If the current song has played for a few seconds, the first Back press usually restarts it. Press once more in that case.</p>');
      if (setBtn) setBtn.hidden = false;
    }

    // ---------------- lists ----------------
    function songMatches(s, tokens, num) {
      if (state.cat !== "all" && s.c !== state.cat) return false;
      if (state.artist && s.k.indexOf(state.artist) < 0) return false;
      if (!tokens.length) return true;
      if (num !== null && s.t === num) return true;
      return tokens.every(function (t) { return s.h.indexOf(t) >= 0; });
    }
    function artistName(s) { return s.p.map(function (p) { return p[0]; }).join(""); }
    function rowHtml(s) {
      var artist = artistName(s), main = s.s || artist, sub = s.s ? artist : "";
      return '<button type="button" class="row" data-t="' + s.t + '" style="--c:var(--c-' + s.c + ')">' +
        '<span class="trk" aria-label="Track ' + s.t + '">' + s.t + "</span>" +
        '<span class="txt"><span class="t1">' + esc(main) + '</span><span class="t2">' +
        (sub ? esc(sub) + " · " : "") + '<span class="file">' + esc(s.f) + "</span></span></span>" + skipBadge(s.t) + CHEV + "</button>";
    }
    function renderSongs() {
      var q = norm(state.q), tokens = q ? q.split(" ") : [], num = /^\d+$/.test(q) ? parseInt(q, 10) : null;
      var rows = SONGS.filter(function (s) { return songMatches(s, tokens, num); });
      var html = "";
      CATS.forEach(function (c) {
        var g = rows.filter(function (s) { return s.c === c.code; });
        if (!g.length) return;
        html += '<div class="group"><h2 class="sec" style="--c:var(--c-' + c.code + ')"><span class="code">' + c.code +
          '</span><span class="name">' + esc(c.name) + '</span><span class="rng">' +
          (g.length === c.count ? "" : g.length + " of ") + c.count + " · tracks <b>" + c.from + "–" + c.to + "</b></span></h2>" +
          '<div class="card">' + g.map(rowHtml).join("") + "</div></div>";
      });
      if (!rows.length) {
        var msg = num !== null && num > N ? "There is no track " + num + ". The USB stick has " + N + " tracks." : "No songs match these filters.";
        html = '<div class="empty"><p>' + esc(msg) + '</p><button type="button" class="btn primary" data-act="reset">Show all songs</button></div>';
      }
      views.songs.innerHTML = html;
      countEl.innerHTML = rows.length !== N ? "<b>" + rows.length + "</b> of " + N : "<b>" + N + "</b> songs";
      var pills = "";
      if (state.cat !== "all") {
        pills += '<button type="button" class="pill" data-clear="cat" style="--c:var(--c-' + state.cat + ')" aria-label="Remove ' +
          esc(catBy[state.cat].name) + ' filter"><span class="code">' + state.cat + "</span>" + esc(catBy[state.cat].name) + XS + "</button>";
      }
      if (state.artist) {
        pills += '<button type="button" class="pill" data-clear="artist" aria-label="Remove ' + esc(ARTISTS[state.artist]) +
          ' filter">' + esc(ARTISTS[state.artist]) + XS + "</button>";
      }
      pillsEl.innerHTML = pills;
      pillsEl.hidden = !pills;
    }
    function renderCategories() {
      var html = '<div class="cats"><button type="button" class="cat all" data-cat="all"><span><span class="name">All songs</span>' +
        '<span class="info" style="display:block">Everything on the USB stick</span></span><span class="info">tracks <b>1–' + N + "</b></span></button>";
      CATS.forEach(function (c) {
        html += '<button type="button" class="cat" data-cat="' + c.code + '" style="--c:var(--c-' + c.code + ')">' +
          '<span class="code">' + c.code + '</span><span class="name">' + esc(c.name) + "</span>" +
          '<span class="info">' + c.count + " songs · tracks <b>" + c.from + "–" + c.to + "</b></span></button>";
      });
      html += "</div>" +
        '<div class="about"><h3>Song recognition</h3>' +
        "<p>Tap the microphone and hold the phone in the car for a few seconds. The app recognises which song from the USB stick is playing and sets it as Playing. " +
        "It works offline and nothing is uploaded: the phone compares the sound with fingerprints of your " + N + " songs.</p>" +
        '<label class="switch" for="autoListen"><span>Listen when the app opens</span><input type="checkbox" id="autoListen"' +
        (autoOn() ? " checked" : "") + "></label>" +
        "<h3>How the numbers work</h3><p>The orange number is the song's position on the USB stick, the same track number your car shows. " +
        'Files are named like <span class="file">2 AZRAP 001</span>, so the car plays them in this order, category by category.</p>' +
        "<h3>Skip counter</h3><p>When a track is set as Playing, every song shows how many Next or Back presses reach it, whichever is fewer, " +
        "counting round from track " + N + " back to 1.</p>" +
        "<h3>Song list</h3><p>" + N + " songs, updated " + esc(DATA.generated) + ".</p></div>";
      views.categories.innerHTML = html;
      countEl.innerHTML = "<b>" + CATS.length + "</b> categories";
    }
    function renderArtists() {
      var q = norm(state.aq);
      var list = ALIST.filter(function (a) { return !q || (" " + a.n).indexOf(" " + q) >= 0 || a.n.indexOf(q) >= 0; });
      var groups = {}, order = [];
      list.forEach(function (a) {
        var L = /[a-z]/.test(a.n.charAt(0)) ? a.n.charAt(0).toUpperCase() : "#";
        if (!groups[L]) { groups[L] = []; order.push(L); }
        groups[L].push(a);
      });
      order.sort(function (a, b) { return a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b); });
      var html = "";
      order.forEach(function (L) {
        html += '<div class="group"><h2 class="sec"><span class="name">' + L + '</span></h2><div class="card">' +
          groups[L].map(function (a) {
            var dots = a.cats.map(function (c) { return '<span class="dot" style="--c:var(--c-' + c + ')" title="' + esc(catBy[c].name) + '"></span>'; }).join("");
            return '<button type="button" class="arow" data-artist="' + esc(a.key) + '"><span class="nm">' + esc(a.name) +
              '</span><span class="meta">' + dots + "<span>" + a.count + "</span></span>" + CHEV + "</button>";
          }).join("") + "</div></div>";
      });
      if (!list.length) html = '<div class="empty"><p>No artist matches “' + esc(state.aq) + '”.</p></div>';
      views.artists.innerHTML = html;
      countEl.innerHTML = list.length === ALIST.length ? "<b>" + ALIST.length + "</b> artists" : "<b>" + list.length + "</b> of " + ALIST.length;
    }
    function render() {
      TABS.forEach(function (t) { views[t].hidden = t !== state.tab; });
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
        if (b.getAttribute("data-tab") === state.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      });
      titleEl.textContent = TITLES[state.tab];
      playWrap.hidden = state.tab !== "songs";
      $("listenBtn").hidden = state.tab !== "songs" || !LISTEN_OK;
      $("searchWrap").hidden = state.tab === "categories";
      if (state.tab === "songs") { qEl.placeholder = "Song, artist or track number"; qEl.value = state.q; }
      if (state.tab === "artists") { qEl.placeholder = "Find an artist"; qEl.value = state.aq; }
      qClear.hidden = !qEl.value;
      if (state.tab !== "songs") pillsEl.hidden = true;
      if (state.tab === "songs") renderSongs(); else if (state.tab === "categories") renderCategories(); else renderArtists();
      renderCard();
      save();
    }
    function go(tab) {
      state.tab = tab;
      if (location.hash !== "#" + tab) { try { history.replaceState(null, "", "#" + tab); } catch (e) {} }
      render();
      window.scrollTo(0, 0);
    }

    var bar = $("appbar");
    function setHead() { document.documentElement.style.setProperty("--head-h", bar.offsetHeight + "px"); }
    if (window.ResizeObserver) new ResizeObserver(setHead).observe(bar);
    setHead();

    document.querySelector(".tabbar").addEventListener("click", function (e) {
      var b = e.target.closest(".tab");
      if (b) go(b.getAttribute("data-tab"));
    });
    qEl.addEventListener("input", function () {
      if (state.tab === "songs") state.q = qEl.value; else state.aq = qEl.value;
      qClear.hidden = !qEl.value;
      if (state.tab === "songs") renderSongs(); else renderArtists();
    });
    qEl.addEventListener("keydown", function (e) { if (e.key === "Enter") qEl.blur(); });
    qClear.addEventListener("click", function () {
      qEl.value = "";
      if (state.tab === "songs") state.q = ""; else state.aq = "";
      qClear.hidden = true;
      render();
      qEl.focus();
    });
    pillsEl.addEventListener("click", function (e) {
      var b = e.target.closest(".pill");
      if (!b) return;
      if (b.getAttribute("data-clear") === "cat") state.cat = "all"; else state.artist = "";
      render();
    });
    views.songs.addEventListener("click", function (e) {
      var r = e.target.closest(".row");
      if (r) { openSheet(byTrack[r.getAttribute("data-t")]); return; }
      if (e.target.closest('[data-act="reset"]')) { state.cat = "all"; state.artist = ""; state.q = ""; render(); }
    });
    views.categories.addEventListener("click", function (e) {
      var c = e.target.closest(".cat");
      if (!c) return;
      state.cat = c.getAttribute("data-cat"); state.artist = ""; state.q = "";
      go("songs");
    });
    views.categories.addEventListener("change", function (e) {
      if (e.target.id === "autoListen") { try { localStorage.setItem(AUTO_KEY, e.target.checked ? "on" : "off"); } catch (err) {} }
    });
    views.artists.addEventListener("click", function (e) {
      var a = e.target.closest(".arow");
      if (!a) return;
      state.artist = a.getAttribute("data-artist"); state.cat = "all"; state.q = "";
      go("songs");
    });

    playEl.value = state.playing ? String(state.playing) : "";
    playWrap.classList.toggle("set", !!state.playing);
    playEl.addEventListener("input", function () {
      var n = readPlaying(playEl), si = $("sheetPlaying");
      if (si) { si.value = playEl.value; readPlaying(si); }
      setPlaying(n);
    });
    playEl.addEventListener("keydown", function (e) { if (e.key === "Enter") playEl.blur(); });
    sheetBody.addEventListener("input", function (e) {
      if (e.target.id !== "sheetPlaying") return;
      var n = readPlaying(e.target);
      playEl.value = e.target.value;
      readPlaying(playEl);
      setPlaying(n);
    });
    sheetBody.addEventListener("keydown", function (e) { if (e.target.id === "sheetPlaying" && e.key === "Enter") e.target.blur(); });

    // ---------------- song sheet ----------------
    function openSheet(s) {
      cur = s;
      var c = catBy[s.c], aName = artistName(s);
      var actions = s.p.filter(function (p) { return p[1]; }).map(function (p) {
        return '<button type="button" class="action" data-artist="' + esc(p[1]) + '"><span>All songs by ' + esc(ARTISTS[p[1]]) +
          " (" + AIDX[p[1]].count + ")</span>" + CHEV + "</button>";
      }).join("");
      actions += '<button type="button" class="action" data-cat="' + c.code + '" style="--c:var(--c-' + c.code + ')"><span>All <span class="code">' +
        c.code + "</span> " + esc(c.name) + " songs (" + c.count + ")</span>" + CHEV + "</button>";
      sheetBody.innerHTML = '<div class="grab" aria-hidden="true"></div>' +
        '<div class="sheethead"><div class="bigtrk"><span class="n">' + s.t + '</span><span class="l">Track on the USB stick</span></div>' +
        '<button type="button" class="done" data-act="close">Done</button></div>' +
        '<h2 id="sheetTitle">' + esc(s.s || aName) + "</h2>" + (s.s ? '<p class="by">' + esc(aName) + "</p>" : "") +
        '<div class="skipbox"><div class="sk-head"><span class="k">Skip counter</span>' +
        '<label class="playing' + (state.playing ? " set" : "") + '" for="sheetPlaying">' + PLAY + "<span>Playing</span>" +
        '<input id="sheetPlaying" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="–" autocomplete="off" ' +
        'aria-label="Track number playing now" value="' + (state.playing || "") + '"></label></div>' +
        '<div id="skipResult" aria-live="polite"></div>' +
        '<button type="button" class="action" id="setPlaying" data-act="setplaying"><span>I\'m now playing this song</span>' + PLAY + "</button></div>" +
        '<div class="facts">' +
        '<div class="fact"><span class="k">Category</span><span class="v">' + esc(c.name) + " · song " + s.f.split(" ")[2] + " of " + c.count + "</span></div>" +
        '<div class="fact"><span class="k">Length</span><span class="v">' + mmss(s.d) + "</span></div>" +
        '<div class="fact"><span class="k">File name</span><span class="v mono">' + esc(s.f + " - " + s.a + (s.s ? " - " + s.s : "")) + ".mp3</span></div>" +
        '<div class="fact"><span class="k">Original spelling</span><span class="v">' + esc(s.o) + "</span></div>" +
        '</div><div class="actions">' + actions + "</div>";
      if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", "");
      updateSkip();
      var done = sheetBody.querySelector(".done");
      if (done) done.focus();
    }
    function closeSheet() { if (sheet.open) { if (typeof sheet.close === "function") sheet.close(); else sheet.removeAttribute("open"); } }
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) { closeSheet(); return; }
      if (e.target.closest('[data-act="close"]')) { closeSheet(); return; }
      if (e.target.closest('[data-act="setplaying"]')) { setPlayingTrack(cur.t); return; }
      var a = e.target.closest(".action");
      if (!a) return;
      if (a.hasAttribute("data-artist")) { state.artist = a.getAttribute("data-artist"); state.cat = "all"; }
      else { state.cat = a.getAttribute("data-cat"); state.artist = ""; }
      state.q = "";
      closeSheet();
      go("songs");
    });

    // ---------------- song recognition ----------------
    var AUTO_KEY = "carSongsAutoListen";
    function autoOn() { try { return localStorage.getItem(AUTO_KEY) !== "off"; } catch (e) { return true; } }
    var LISTEN_OK = !!(window.Worker && navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      (window.AudioContext || window.webkitAudioContext));
    var cardEl = $("listenCard"), listenBtn = $("listenBtn");
    var worker = null, dbReady = false, dbError = "";
    var L = { on: false, session: 0, stream: null, ctx: null, node: null, src: null, sink: null, t0: 0, timer: 0,
      level: 0, lastEnd: 0, view: "hidden", result: null, closed: false };

    function initWorker() {
      dbReady = false; dbError = "";
      try {
        worker = new Worker("fp-worker.js");
        worker.onmessage = onWorker;
        worker.postMessage({ type: "init", dbUrl: "fp.bin", twins: DATA.twins });
      } catch (e) { worker = null; LISTEN_OK = false; }
    }
    if (LISTEN_OK) initWorker();

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function race(p, ms) { return Promise.race([p.catch(function () {}), wait(ms)]); }

    async function startListening() {
      if (L.on || !LISTEN_OK) return;
      if (!worker) initWorker();
      var my = ++L.session;
      L.on = true; L.closed = false; L.result = null;
      listenBtn.setAttribute("aria-pressed", "true");
      var AC = window.AudioContext || window.webkitAudioContext, ctx;
      try { ctx = new AC(); } catch (e) { fail("unsupported"); return; }
      L.ctx = ctx;
      var resumed = ctx.resume ? ctx.resume() : Promise.resolve();
      showCard("starting");
      try {
        L.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
      } catch (err) {
        if (my !== L.session) return;
        fail(err && (err.name === "NotAllowedError" || err.name === "SecurityError") ? "denied" : "error");
        return;
      }
      if (my !== L.session) { stopCapture(); return; }
      await race(resumed, 800);
      if (ctx.state !== "running") await race(ctx.resume(), 800);
      if (my !== L.session) return;
      if (ctx.state !== "running") { fail("needtap"); return; }
      try {
        L.src = ctx.createMediaStreamSource(L.stream);
        L.sink = ctx.createGain(); L.sink.gain.value = 0; L.sink.connect(ctx.destination);
        if (ctx.audioWorklet && window.AudioWorkletNode) {
          await ctx.audioWorklet.addModule("capture-worklet.js");
          if (my !== L.session) return;
          L.node = new AudioWorkletNode(ctx, "capture-processor");
          L.node.port.onmessage = function (e) { feed(e.data); };
        } else {
          L.node = ctx.createScriptProcessor(4096, 1, 1);
          L.node.onaudioprocess = function (e) { feed(new Float32Array(e.inputBuffer.getChannelData(0))); };
        }
        L.src.connect(L.node); L.node.connect(L.sink);
      } catch (err) { if (my === L.session) fail("error"); return; }
      worker.postMessage({ type: "start", rate: ctx.sampleRate });
      L.t0 = performance.now();
      showCard("listening");
      L.timer = setInterval(tick, 150);
    }

    function feed(chunk) {
      if (!L.on || !worker) return;
      var s = 0;
      for (var i = 0; i < chunk.length; i += 4) s += chunk[i] * chunk[i];
      L.level = Math.max(L.level * 0.7, Math.min(1, Math.sqrt(s / (chunk.length / 4)) * 6));
      worker.postMessage({ type: "audio", data: chunk }, [chunk.buffer]);
    }

    function tick() {
      if (!L.on) return;
      var secs = (performance.now() - L.t0) / 1000;
      var t = $("lsecs");
      if (t) t.textContent = Math.floor(secs) + " s";
      var bars = cardEl.querySelectorAll(".meter i");
      for (var i = 0; i < bars.length; i++) {
        bars[i].style.height = Math.round(15 + 85 * Math.min(1, L.level * (0.55 + 0.45 * Math.abs(Math.sin(secs * 7 + i * 1.7))))) + "%";
      }
      var note = $("lnote");
      if (note) note.textContent = dbReady ? "Hold the phone in the car, near a speaker. It usually takes 4–10 seconds."
        : "Preparing the song fingerprints. The first time this needs the internet and takes a little longer.";
      if (secs > 45) { stopCapture(); showCard(dbReady ? "notfound" : "dberror"); }
    }

    function stopCapture() {
      clearInterval(L.timer);
      try { if (L.stream) L.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { if (L.node) L.node.disconnect(); if (L.src) L.src.disconnect(); } catch (e) {}
      try { if (L.ctx && L.ctx.state !== "closed") L.ctx.close(); } catch (e) {}
      if (worker && L.on) worker.postMessage({ type: "stop" });
      L.stream = L.ctx = L.node = L.src = L.sink = null;
      L.on = false; L.level = 0; L.lastEnd = Date.now();
      listenBtn.setAttribute("aria-pressed", "false");
    }
    function fail(view) { L.session++; stopCapture(); showCard(view); }
    function stopListening() { L.session++; stopCapture(); L.closed = true; showCard("hidden"); }

    function onWorker(e) {
      var m = e.data;
      if (m.type === "ready") { dbReady = true; }
      else if (m.type === "error") {
        dbError = m.message; worker = null;
        if (L.on) fail("dberror");
      } else if (m.type === "match" && L.on) {
        L.session++; stopCapture();
        L.result = m;
        setPlayingTrack(m.songs[0] + 1);
        showCard("found");
      } else if (m.type === "nomatch" && L.on) {
        L.session++; stopCapture();
        showCard("notfound");
      }
    }

    function showCard(view) { L.view = view; renderCard(); }
    function btn(act, label, primary) { return '<button type="button" class="btn' + (primary ? " primary" : "") + '" data-l="' + act + '">' + label + "</button>"; }
    var CLOSE = '<button type="button" class="lx" data-l="close" aria-label="Close">' + XICON + "</button>";
    function renderCard() {
      var v = L.view, html = "";
      if (state.tab !== "songs" || v === "hidden") { cardEl.hidden = true; return; }
      if (v === "starting") {
        html = '<div class="lhead"><span class="k">Finding the song</span></div><p class="lmsg">Starting the microphone…</p>' +
          '<div class="lbtns">' + btn("stop", "Stop") + "</div>";
      } else if (v === "listening") {
        html = '<div class="lhead"><span class="k"><span class="meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>' +
          'Listening <span id="lsecs">0 s</span></span></div><p class="lmsg" id="lnote"></p><div class="lbtns">' + btn("stop", "Stop") + "</div>";
      } else if (v === "found" && L.result) {
        var r = L.result, s = SONGS[r.songs[0]], pos = Math.min(r.position, s.d);
        html = '<div class="lhead"><span class="k">Now playing</span>' + CLOSE + "</div>" +
          '<button type="button" class="lnow" data-l="show" style="--c:var(--c-' + s.c + ')"><span class="n">' + s.t + '</span><span class="ti">' +
          esc(s.s || artistName(s)) + '</span><span class="sub">' + (s.s ? esc(artistName(s)) + " · " : "") + '<span class="file">' + esc(s.f) +
          "</span> · at " + mmss(pos) + " of " + mmss(s.d) + "</span></button>";
        if (r.songs.length > 1) {
          var o = SONGS[r.songs[1]];
          html += '<p class="lmsg">This part is in two files on your stick.</p><div class="lalt"><span><span class="n">' + o.t + "</span> " +
            esc(o.s || artistName(o)) + "</span>" + btn("alt", "It's track " + o.t) + "</div>";
        }
        html += '<div class="lbtns">' + btn("again", "Listen again") + "</div>";
      } else if (v === "notfound") {
        html = '<div class="lhead"><span class="k">Song not recognised</span>' + CLOSE + "</div>" +
          '<p class="lmsg">It may not be on the USB stick, it may be a quiet part, or the car is too loud. Turn the music up a little and try again.</p>' +
          '<div class="lbtns">' + btn("again", "Try again", true) + "</div>";
      } else if (v === "needtap") {
        html = '<div class="lhead"><span class="k">Find the playing song</span>' + CLOSE + "</div>" +
          '<p class="lmsg">Your phone needs one tap before the app can listen.</p><div class="lbtns">' + btn("again", "Start listening", true) + "</div>";
      } else if (v === "denied") {
        html = '<div class="lhead"><span class="k">Microphone is off</span>' + CLOSE + "</div>" +
          '<p class="lmsg">Car Songs needs the microphone to recognise songs. Tap <b>Try again</b> and choose <b>Allow</b>. ' +
          "If no question appears, open iPhone <b>Settings › Safari › Microphone</b> and set it to Ask or Allow.</p>" +
          '<div class="lbtns">' + btn("again", "Try again", true) + "</div>";
      } else if (v === "dberror") {
        html = '<div class="lhead"><span class="k">Fingerprints not loaded</span>' + CLOSE + "</div>" +
          '<p class="lmsg">The song fingerprints did not load. Connect to the internet once; after that recognition works offline.</p>' +
          '<div class="lbtns">' + btn("reload", "Try again", true) + "</div>";
      } else if (v === "unsupported") {
        html = '<div class="lhead"><span class="k">Recognition not available</span>' + CLOSE + "</div>" +
          '<p class="lmsg">This browser does not let the app use the microphone. Open Car Songs from your Home Screen or in Safari.</p>';
      } else {
        html = '<div class="lhead"><span class="k">Microphone problem</span>' + CLOSE + "</div>" +
          '<p class="lmsg">The microphone could not start. Close other apps that use it and try again.</p>' +
          '<div class="lbtns">' + btn("again", "Try again", true) + "</div>";
      }
      cardEl.innerHTML = html;
      cardEl.hidden = false;
      if (v === "listening") tick();
    }

    cardEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-l]");
      if (!b) return;
      var a = b.getAttribute("data-l");
      if (a === "stop" || a === "close") stopListening();
      else if (a === "again") startListening();
      else if (a === "reload") { initWorker(); startListening(); }
      else if (a === "show" && L.result) openSheet(SONGS[L.result.songs[0]]);
      else if (a === "alt" && L.result) {
        var s = L.result.songs; L.result.songs = [s[1], s[0]];
        setPlayingTrack(s[1] + 1);
        renderCard();
      }
    });
    listenBtn.addEventListener("click", function () { if (L.on) stopListening(); else startListening(); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (L.on) { L.session++; stopCapture(); showCard("hidden"); } return; }
      if (LISTEN_OK && autoOn() && !L.on && Date.now() - L.lastEnd > 30000) startListening();
    });
    if (navigator.serviceWorker) {
      var reloading = false, hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        // reload only when an update replaces a running version, never on the very first install
        if (reloading || L.on || !hadController) return;
        reloading = true; location.reload();
      });
    }

    render();
    if (LISTEN_OK && autoOn()) startListening();
  }
})();
