/* Car Songs — app logic: song list, categories, artists, stats, skip counter, auto-follow, car mode and song recognition. */
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
    function hm(sec) {
      sec = Math.max(0, Math.round(sec));
      if (sec < 60) return sec + " s";
      var m = Math.round(sec / 60);
      if (m < 60) return m + " min";
      return Math.floor(m / 60) + " h " + (m % 60) + " min";
    }
    function clock(ms) { var d = new Date(ms); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
    function dayLabel(ms) {
      var d = new Date(ms), t = new Date(), y = new Date(Date.now() - 864e5);
      if (d.toDateString() === t.toDateString()) return "Today";
      if (d.toDateString() === y.toDateString()) return "Yesterday";
      return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
    }
    function load(key, def) { try { var v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? def : v; } catch (e) { return def; } }
    function store(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

    var CHEV = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"></path></svg>';
    var XS = '<span class="x" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></span>';
    var XICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>';
    var NEXT = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5.5v13l9-6.5-9-6.5Z"></path><rect x="16" y="5" width="2.6" height="14" rx="1"></rect></svg>';
    var PREV = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 5.5v13l-9-6.5 9-6.5Z"></path><rect x="5.4" y="5" width="2.6" height="14" rx="1"></rect></svg>';
    var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l11-7L7 5Z"></path></svg>';
    var DICE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"></rect><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none"></circle><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" stroke="none"></circle></svg>';
    var CAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6"></path></svg>';
    var MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3"></path></svg>';
    // car mode is always dark, so it uses the dark category colours
    var DARKC = { AZ: "#5a92dc", AZRAP: "#e0625a", TRRAP: "#9c7ad2", TR: "#2aa893", FR: "#cf7f3a", PN: "#cf62a3" };

    var catBy = {}, byTrack = {}, AIDX = {};
    CATS.forEach(function (c) { catBy[c.code] = c; c.secs = 0; });
    SONGS.forEach(function (s) {
      s.h = " " + norm(s.a + " " + s.s + " " + s.o) + " ";
      byTrack[s.t] = s;
      catBy[s.c].secs += s.d || 0;
    });
    SONGS.forEach(function (s) {
      s.k.forEach(function (k) {
        var a = AIDX[k] || (AIDX[k] = { key: k, name: ARTISTS[k], n: norm(ARTISTS[k]), count: 0, secs: 0, cats: [] });
        a.count++;
        a.secs += s.d || 0;
        if (a.cats.indexOf(s.c) < 0) a.cats.push(s.c);
      });
    });
    var ALIST = Object.keys(AIDX).map(function (k) { return AIDX[k]; }).sort(function (a, b) { return a.n.localeCompare(b.n); });
    function artistName(s) { return s.p.map(function (p) { return p[0]; }).join(""); }
    function songTitle(s) { return s.s || artistName(s); }

    var TABS = ["songs", "categories", "artists", "stats"];
    var TITLES = { songs: "Songs", categories: "Categories", artists: "Artists", stats: "Stats" };
    var state = { tab: "songs", cat: "all", artist: "", q: "", aq: "", playing: 0, target: 0 };
    var saved = load("carSongsState", null);
    if (saved) {
      if (saved.cat === "all" || catBy[saved.cat]) state.cat = saved.cat;
      if (!saved.artist || AIDX[saved.artist]) state.artist = saved.artist || "";
      if (TABS.indexOf(saved.tab) >= 0) state.tab = saved.tab;
      if (saved.playing >= 1 && saved.playing <= N) state.playing = saved.playing;
    }
    var h0 = (location.hash || "").slice(1);
    if (TABS.indexOf(h0) >= 0) state.tab = h0;
    function save() { store("carSongsState", { tab: state.tab, cat: state.cat, artist: state.artist, playing: state.playing }); }

    var qEl = $("q"), qClear = $("qclear"), pillsEl = $("pills"), countEl = $("count"), titleEl = $("title");
    var views = { songs: $("view-songs"), categories: $("view-categories"), artists: $("view-artists"), stats: $("view-stats") };
    var sheet = $("sheet"), sheetBody = $("sheetBody"), nowEl = $("nowCard"), carEl = $("carmode");
    var playEl = $("playing"), playWrap = $("playingWrap"), cur = null, curOpts = {};

    // ---------------- auto-follow + listening history ----------------
    var FOLLOW_MAX = 90 * 60 * 1000;   // stop estimating 90 minutes after the last time the track was confirmed
    var GAP = 500;                     // assumed pause between two tracks (ms)
    var F = load("carSongsFollow", null);   // {track, start, synced, src, syncedTrack}
    var HIST = load("carSongsHistory", []); // [{t, at, kind: heard|set|est, pos}]
    if (F && (!byTrack[F.track] || F.track !== state.playing)) F = null;
    function nextTrack(t) { return t % N + 1; }
    function prevTrack(t) { return t === 1 ? N : t - 1; }
    function dur(t) { return Math.max(1, byTrack[t].d || 1); }

    function logPlay(t, at, kind, pos) {
      var last = HIST[HIST.length - 1];
      if (last && last.t === t && Math.abs(at - last.at) < 60000) {
        if (kind === "heard" && last.kind !== "heard") { last.kind = "heard"; store("carSongsHistory", HIST); }
        return;
      }
      var e = { t: t, at: at, kind: kind };
      if (pos != null) e.pos = Math.round(pos);
      HIST.push(e);
      if (HIST.length > 3000) HIST.splice(0, HIST.length - 3000);
      store("carSongsHistory", HIST);
      if (state.tab === "stats") renderStats();
    }

    function followState(now) {
      if (!F || !byTrack[F.track]) return null;
      now = now || Date.now();
      var limit = Math.min(now, F.synced + FOLLOW_MAX), moved = false, guard = 0;
      while ((limit - F.start) / 1000 >= dur(F.track) && guard++ < N * 3) {
        F.start += dur(F.track) * 1000 + GAP;
        F.track = nextTrack(F.track);
        moved = true;
        if (F.start <= limit) logPlay(F.track, F.start, "est");
      }
      if (moved) store("carSongsFollow", F);
      return { track: F.track, pos: Math.max(0, (limit - F.start) / 1000), stale: now - F.synced > FOLLOW_MAX };
    }

    var typedTimer = 0;
    function setFollow(t, posSec, src) {
      clearTimeout(typedTimer);
      var now = Date.now();
      F = { track: t, start: now - (posSec || 0) * 1000, synced: now, src: src, syncedTrack: t };
      store("carSongsFollow", F);
      if (src === "heard") logPlay(t, now, "heard", posSec);
      else if (src === "set") logPlay(t, now, "set");
      else if (src === "typed") typedTimer = setTimeout(function () { if (F && F.track === t) logPlay(t, now, "set"); }, 2500);
      applyPlaying(t);
    }
    function clearFollow() { F = null; store("carSongsFollow", null); applyPlaying(0); }
    function applyPlaying(t) {
      state.playing = t;
      if (document.activeElement !== playEl) playEl.value = t ? String(t) : "";
      readPlaying(playEl);
      var si = $("sheetPlaying");
      if (si && document.activeElement !== si) { si.value = t ? String(t) : ""; readPlaying(si); }
      save();
      if (state.tab === "songs") renderSongs();
      renderNow();
      renderCar();
      if (sheet.open && cur) updateSkip();
    }
    function pressNext() {
      var fs = followState();
      if (!fs) return;
      setFollow(nextTrack(fs.track), 0, "set");
    }
    function pressBack() {
      var fs = followState();
      if (!fs) return;
      // like most car stereos: Back restarts the song if it has played a few seconds
      if (fs.pos > 3 && !fs.stale) setFollow(fs.track, 0, "set");
      else setFollow(prevTrack(fs.track), 0, "set");
    }

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
    function playingTyped(input) {
      var n = readPlaying(input);
      if (input.value && !n) return;      // out of range: leave everything as it was
      if (!n) { clearFollow(); return; }
      if (n !== state.playing) setFollow(n, 0, "typed");
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

    // ---------------- up next ----------------
    function upNext(fs) {
      var s = byTrack[fs.track], left = dur(fs.track) - fs.pos, c = catBy[s.c];
      var catLeft = left;
      for (var t = fs.track + 1; t <= c.to; t++) catLeft += dur(t) + GAP / 1000;
      return { next: byTrack[nextTrack(fs.track)], left: left, cat: c, catLeft: catLeft, lastInCat: fs.track === c.to };
    }

    // ---------------- now playing card (Songs tab) ----------------
    var fresh = 0;
    function renderNow() {
      if (state.tab !== "songs" || !state.playing) { nowEl.hidden = true; nowEl.innerHTML = ""; return; }
      var fs = followState(), s = byTrack[state.playing];
      var src = F ? (F.src === "heard" ? "Recognised " : "Set ") + clock(F.synced) + (F.track !== F.syncedTrack ? " · following" : "") : "Set by you";
      var html = '<div class="np-top"><span class="k">Now playing · <span id="npSrc">' + esc(src) + "</span></span>" +
        '<button type="button" class="chipbtn" data-n="car">' + CAR + "Car mode</button></div>" +
        '<button type="button" class="np-main" data-n="show"><span class="n">' + s.t + '</span><span class="ti">' + esc(songTitle(s)) +
        '</span><span class="sub">' + (s.s ? esc(artistName(s)) + " · " : "") + '<span class="file">' + esc(s.f) + "</span></span></button>";
      if (fs && !fs.stale) {
        html += '<div class="np-prog"><div class="bar"><i id="npBar"></i></div><span class="time" id="npTime"></span></div>' +
          '<p class="np-line" id="npNext"></p><p class="np-line" id="npCat"></p>';
      } else if (fs && fs.stale) {
        html += '<p class="np-line">Probably out of step: the track was last confirmed at ' + clock(F.synced) +
          '. Tap the microphone or set the track again.</p>';
      }
      if (L.result && L.result.songs.length > 1 && L.result.songs[0] + 1 === state.playing) {
        var o = SONGS[L.result.songs[1]];
        html += '<div class="lalt"><span>This part is also in <span class="n">' + o.t + "</span> " + esc(songTitle(o)) + "</span>" +
          '<button type="button" class="btn" data-n="alt">It\'s track ' + o.t + "</button></div>";
      }
      html += '<div class="np-btns"><button type="button" class="btn" data-n="prev">' + PREV + "Back</button>" +
        '<button type="button" class="btn" data-n="next">Next' + NEXT + "</button>" +
        '<button type="button" class="btn icon" data-n="dice" aria-label="Random pick">' + DICE + "</button></div>" +
        '<p class="np-hint">Tap Back or Next when you press them in the car, so the app stays in step.</p>';
      nowEl.style.setProperty("--c", "var(--c-" + s.c + ")");
      nowEl.innerHTML = html;
      nowEl.hidden = false;
      nowEl.classList.toggle("fresh", Date.now() - fresh < 2500);
      tickNow(fs);
    }
    function tickNow(fs) {
      if (nowEl.hidden || !fs || fs.stale) return;
      var u = upNext(fs), d = dur(fs.track), bar = $("npBar");
      if (!bar) return;
      bar.style.width = Math.min(100, (100 * fs.pos) / d).toFixed(1) + "%";
      $("npTime").textContent = mmss(fs.pos) + " / " + mmss(d);
      $("npNext").innerHTML = "Next: <b>" + u.next.t + "</b> " + esc(songTitle(u.next)) + (u.next.s ? " · " + esc(artistName(u.next)) : "") +
        ' <span class="in">in ' + mmss(u.left) + "</span>";
      $("npCat").textContent = u.lastInCat ? "Last " + u.cat.name + " song; " + catBy[u.next.c].name + " starts next"
        : u.cat.name + " ends in " + hm(u.catLeft) + ", after track " + u.cat.to;
    }

    // ---------------- car mode ----------------
    var wake = null, carOpen = false;
    function requestWake() {
      if (!carOpen || !navigator.wakeLock || document.hidden) return;
      navigator.wakeLock.request("screen").then(function (w) { wake = w; }).catch(function () {});
    }
    function openCar(target) {
      if (target != null) state.target = target;
      carOpen = true;
      carEl.hidden = false;
      document.documentElement.classList.add("car-open");
      requestWake();
      renderCar();
    }
    function closeCar() {
      carOpen = false;
      carEl.hidden = true;
      document.documentElement.classList.remove("car-open");
      if (wake) { try { wake.release(); } catch (e) {} wake = null; }
    }
    function renderCar() {
      if (!carOpen) return;
      var fs = followState();
      if (!state.playing) {
        $("cmNum").textContent = "–";
        $("cmCat").textContent = "";
        $("cmOf").textContent = N + " tracks";
        $("cmTitle").textContent = "Which song is playing?";
        $("cmArtist").textContent = "Tap the microphone, or type the track number on the Songs screen.";
        $("cmProg").hidden = true; $("cmNext").textContent = "";
      } else {
        var s = byTrack[state.playing];
        carEl.style.setProperty("--c", DARKC[s.c]);
        $("cmNum").textContent = s.t;
        $("cmCat").textContent = catBy[s.c].name;
        $("cmOf").textContent = "Track " + s.t + " of " + N;
        $("cmTitle").textContent = songTitle(s);
        $("cmArtist").textContent = s.s ? artistName(s) : "";
        $("cmProg").hidden = !fs || fs.stale;
        if (fs && fs.stale) $("cmNext").textContent = "Out of step since " + clock(F.synced) + ". Tap the microphone.";
      }
      var tg = $("cmTarget");
      if (state.target && state.playing) {
        var k = skipCalc(state.playing, state.target), ts = byTrack[state.target];
        tg.hidden = false;
        $("cmTargetText").innerHTML = k.dir === "now" ? "You are at <b>" + ts.t + "</b> " + esc(songTitle(ts))
          : "To <b>" + ts.t + "</b> " + esc(songTitle(ts)) + ': <span class="big">' + (k.dir === "fwd" ? NEXT : PREV) + k.n + "</span> " +
            (k.dir === "fwd" ? "× Next" : "× Back");
      } else tg.hidden = true;
      tickCar(fs);
    }
    function tickCar(fs) {
      if (!carOpen || !fs || fs.stale || !state.playing) return;
      var u = upNext(fs), d = dur(fs.track);
      $("cmBar").style.width = Math.min(100, (100 * fs.pos) / d).toFixed(1) + "%";
      $("cmTime").textContent = mmss(fs.pos) + " / " + mmss(d);
      $("cmNext").innerHTML = "Next <b>" + u.next.t + "</b> " + esc(songTitle(u.next)) + " · in " + mmss(u.left);
    }
    carEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-c]");
      if (!b) return;
      var a = b.getAttribute("data-c");
      if (a === "close") closeCar();
      else if (a === "next") pressNext();
      else if (a === "prev") pressBack();
      else if (a === "listen") { if (L.on) stopListening(); else startListening(); }
      else if (a === "untarget") { state.target = 0; renderCar(); }
    });

    // ---------------- lists ----------------
    function songMatches(s, tokens, num) {
      if (state.cat !== "all" && s.c !== state.cat) return false;
      if (state.artist && s.k.indexOf(state.artist) < 0) return false;
      if (!tokens.length) return true;
      if (num !== null && s.t === num) return true;
      return tokens.every(function (t) { return s.h.indexOf(t) >= 0; });
    }
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
      countEl.innerHTML = rows.length !== N ? "<b>" + rows.length + "</b> of " + N + " songs" : "<b>" + N + "</b> songs";
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
    }
    function renderCategories() {
      var html = '<div class="cats"><button type="button" class="cat all" data-cat="all"><span><span class="name">All songs</span>' +
        '<span class="info" style="display:block">Everything on the USB stick · ' + hm(SONGS.reduce(function (a, s) { return a + (s.d || 0); }, 0)) +
        '</span></span><span class="info">tracks <b>1–' + N + "</b></span></button>";
      CATS.forEach(function (c) {
        html += '<button type="button" class="cat" data-cat="' + c.code + '" style="--c:var(--c-' + c.code + ')">' +
          '<span class="code">' + c.code + '</span><span class="name">' + esc(c.name) + "</span>" +
          '<span class="info">' + c.count + " songs · " + hm(c.secs) + "</span>" +
          '<span class="info">tracks <b>' + c.from + "–" + c.to + "</b></span></button>";
      });
      html += "</div>" +
        '<div class="about"><h3>Song recognition</h3>' +
        "<p>Tap the microphone and hold the phone in the car for a few seconds. The app recognises which song from the USB stick is playing and sets it as Playing. " +
        "It works offline and nothing is uploaded: the phone compares the sound with fingerprints of your " + N + " songs.</p>" +
        '<label class="switch" for="autoListen"><span>Listen when the app opens</span><input type="checkbox" id="autoListen"' +
        (autoOn() ? " checked" : "") + "></label>" +
        "<h3>Following along</h3><p>After a song is recognised or set, the app keeps time with it and moves on to the next track when it ends, " +
        "for up to 90 minutes. Tap Back or Next in the app when you press them in the car, so it stays in step.</p>" +
        "<h3>How the numbers work</h3><p>The orange number is the song's position on the USB stick, the same track number your car shows. " +
        'Files are named like <span class="file">2 AZRAP 001</span>, so the car plays them in this order, category by category.</p>' +
        "<h3>Skip counter</h3><p>When a track is set as Playing, every song shows how many Next or Back presses reach it, whichever is fewer, " +
        "counting round from track " + N + " back to 1.</p>" +
        "<h3>Song list</h3><p>" + N + " songs, updated " + esc(DATA.generated) + ".</p></div>";
      views.categories.innerHTML = html;
      countEl.innerHTML = "<b>" + CATS.length + "</b> categories";
      pillsEl.innerHTML = "";
    }
    function renderArtists() {
      var q = norm(state.aq);
      var list = ALIST.filter(function (a) { return !q || (" " + a.n).indexOf(" " + q) >= 0 || a.n.indexOf(q) >= 0; });
      var groups = {}, order = [];
      list.forEach(function (a) {
        var L0 = /[a-z]/.test(a.n.charAt(0)) ? a.n.charAt(0).toUpperCase() : "#";
        if (!groups[L0]) { groups[L0] = []; order.push(L0); }
        groups[L0].push(a);
      });
      order.sort(function (a, b) { return a === "#" ? -1 : b === "#" ? 1 : a.localeCompare(b); });
      var html = "";
      order.forEach(function (L0) {
        html += '<div class="group"><h2 class="sec"><span class="name">' + L0 + '</span></h2><div class="card">' +
          groups[L0].map(function (a) {
            var dots = a.cats.map(function (c) { return '<span class="dot" style="--c:var(--c-' + c + ')" title="' + esc(catBy[c].name) + '"></span>'; }).join("");
            return '<button type="button" class="arow" data-artist="' + esc(a.key) + '"><span class="nm">' + esc(a.name) +
              '</span><span class="meta">' + dots + "<span>" + a.count + "</span></span>" + CHEV + "</button>";
          }).join("") + "</div></div>";
      });
      if (!list.length) html = '<div class="empty"><p>No artist matches “' + esc(state.aq) + '”.</p></div>';
      views.artists.innerHTML = html;
      countEl.innerHTML = list.length === ALIST.length ? "<b>" + ALIST.length + "</b> artists" : "<b>" + list.length + "</b> of " + ALIST.length + " artists";
      pillsEl.innerHTML = "";
    }

    // ---------------- stats ----------------
    var clearArmed = 0;
    function songLine(s, extra) {
      return '<button type="button" class="srow" data-t="' + s.t + '" style="--c:var(--c-' + s.c + ')"><span class="trk">' + s.t + "</span>" +
        '<span class="txt"><span class="t1">' + esc(songTitle(s)) + '</span><span class="t2">' + (s.s ? esc(artistName(s)) + " · " : "") +
        '<span class="file">' + esc(s.f) + "</span></span></span>" + (extra || "") + "</button>";
    }
    function renderStats() {
      var html = "";
      // recently heard
      var recent = HIST.slice(-25).reverse().filter(function (e) { return byTrack[e.t]; });
      html += '<section class="stsec"><h2 class="sth">Recently heard</h2>';
      if (!recent.length) {
        html += '<div class="card"><p class="stempty">Nothing yet. Songs appear here when the app recognises them, when you set the playing track, ' +
          "and while it follows along.</p></div>";
      } else {
        var day = "", rows = "";
        recent.forEach(function (e) {
          var dl = dayLabel(e.at);
          if (dl !== day) { if (rows) html += '<div class="card">' + rows + "</div>"; rows = ""; day = dl; html += '<h3 class="stday">' + esc(dl) + "</h3>"; }
          var kind = e.kind === "heard" ? '<span class="kind heard">' + MIC + "heard</span>" : e.kind === "est" ? '<span class="kind">followed</span>' : '<span class="kind">set</span>';
          rows += songLine(byTrack[e.t], '<span class="when">' + clock(e.at) + kind + "</span>");
        });
        html += '<div class="card">' + rows + "</div>";
      }
      html += "</section>";
      // most played
      var counts = {};
      HIST.forEach(function (e) { if (byTrack[e.t]) counts[e.t] = (counts[e.t] || 0) + 1; });
      var top = Object.keys(counts).map(Number).sort(function (a, b) { return counts[b] - counts[a] || a - b; }).slice(0, 10);
      if (top.length) {
        html += '<section class="stsec"><h2 class="sth">Most played</h2><div class="card">' +
          top.map(function (t) { return songLine(byTrack[t], '<span class="times">' + counts[t] + "×</span>"); }).join("") + "</div></section>";
      }
      // collection
      var total = 0;
      SONGS.forEach(function (s) { total += s.d || 0; });
      var maxSecs = Math.max.apply(null, CATS.map(function (c) { return c.secs; }));
      html += '<section class="stsec"><h2 class="sth">Your collection</h2><div class="card pad">' +
        '<p class="bigstat"><b>' + N + "</b> songs · <b>" + hm(total) + "</b> of music</p>" +
        '<div class="bars" role="list" aria-label="Music per category">' +
        CATS.map(function (c) {
          var pct = (100 * c.secs) / maxSecs;
          return '<div class="hbar" role="listitem" style="--c:var(--c-' + c.code + ')" title="' + esc(c.name + ": " + c.count + " songs, " + hm(c.secs)) + '">' +
            '<span class="lab">' + esc(c.name) + '</span><span class="track"><i style="width:' + pct.toFixed(1) + '%"></i></span>' +
            '<span class="val">' + hm(c.secs) + " · " + c.count + "</span></div>";
        }).join("") + "</div></div></section>";
      var topArt = ALIST.slice().sort(function (a, b) { return b.count - a.count || b.secs - a.secs; }).slice(0, 8);
      html += '<section class="stsec"><h2 class="sth">Top artists</h2><div class="card">' +
        topArt.map(function (a) {
          return '<button type="button" class="arow" data-artist="' + esc(a.key) + '"><span class="nm">' + esc(a.name) +
            '</span><span class="meta"><span>' + a.count + " songs · " + hm(a.secs) + "</span></span>" + CHEV + "</button>";
        }).join("") + "</div></section>";
      var byLen = SONGS.filter(function (s) { return s.d; }).sort(function (a, b) { return b.d - a.d; });
      html += '<section class="stsec"><h2 class="sth">Longest</h2><div class="card">' +
        byLen.slice(0, 3).map(function (s) { return songLine(s, '<span class="times">' + mmss(s.d) + "</span>"); }).join("") + "</div>" +
        '<h2 class="sth">Shortest</h2><div class="card">' +
        byLen.slice(-3).reverse().map(function (s) { return songLine(s, '<span class="times">' + mmss(s.d) + "</span>"); }).join("") + "</div></section>";
      if (HIST.length) {
        html += '<div class="stclear"><button type="button" class="btn" data-st="clear">' +
          (Date.now() - clearArmed < 4000 ? "Tap again to clear " + HIST.length + " entries" : "Clear listening history") + "</button></div>";
      }
      views.stats.innerHTML = html;
      countEl.innerHTML = "<b>" + HIST.length + "</b> " + (HIST.length === 1 ? "play" : "plays") + " logged";
      pillsEl.innerHTML = "";
    }

    function render() {
      TABS.forEach(function (t) { views[t].hidden = t !== state.tab; });
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (b) {
        if (b.getAttribute("data-tab") === state.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
      });
      titleEl.textContent = TITLES[state.tab];
      var songsTab = state.tab === "songs";
      playWrap.hidden = !songsTab;
      $("listenBtn").hidden = !songsTab || !LISTEN_OK;
      $("diceBtn").hidden = !songsTab;
      $("searchWrap").hidden = !(songsTab || state.tab === "artists");
      if (songsTab) { qEl.placeholder = "Song, artist or track number"; qEl.value = state.q; }
      if (state.tab === "artists") { qEl.placeholder = "Find an artist"; qEl.value = state.aq; }
      qClear.hidden = !qEl.value;
      if (songsTab) renderSongs(); else if (state.tab === "categories") renderCategories();
      else if (state.tab === "artists") renderArtists(); else renderStats();
      renderNow();
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

    // ---------------- events ----------------
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
    function artistClick(e) {
      var a = e.target.closest(".arow");
      if (!a) return false;
      state.artist = a.getAttribute("data-artist"); state.cat = "all"; state.q = "";
      go("songs");
      return true;
    }
    views.artists.addEventListener("click", artistClick);
    views.stats.addEventListener("click", function (e) {
      if (artistClick(e)) return;
      var r = e.target.closest(".srow");
      if (r) { openSheet(byTrack[r.getAttribute("data-t")]); return; }
      if (e.target.closest('[data-st="clear"]')) {
        if (Date.now() - clearArmed < 4000) { HIST = []; store("carSongsHistory", HIST); clearArmed = 0; }
        else { clearArmed = Date.now(); setTimeout(function () { if (state.tab === "stats") renderStats(); }, 4100); }
        renderStats();
      }
    });
    nowEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-n]");
      if (!b) return;
      var a = b.getAttribute("data-n");
      if (a === "show") openSheet(byTrack[state.playing]);
      else if (a === "car") openCar();
      else if (a === "next") pressNext();
      else if (a === "prev") pressBack();
      else if (a === "dice") pickRandom();
      else if (a === "alt" && L.result) {
        var s = L.result.songs, pos = followState() ? followState().pos : 0;
        L.result.songs = [s[1], s[0]];
        setFollow(s[1] + 1, pos, "heard");
      }
    });
    $("diceBtn").addEventListener("click", pickRandom);

    playEl.addEventListener("input", function () {
      var si = $("sheetPlaying");
      if (si) { si.value = playEl.value; readPlaying(si); }
      playingTyped(playEl);
    });
    playEl.addEventListener("keydown", function (e) { if (e.key === "Enter") playEl.blur(); });
    sheetBody.addEventListener("input", function (e) {
      if (e.target.id !== "sheetPlaying") return;
      playEl.value = e.target.value;
      readPlaying(playEl);
      playingTyped(e.target);
    });
    sheetBody.addEventListener("keydown", function (e) { if (e.target.id === "sheetPlaying" && e.key === "Enter") e.target.blur(); });

    // ---------------- random pick ----------------
    function pickRandom() {
      var pool = SONGS.filter(function (s) {
        return (state.cat === "all" || s.c === state.cat) && (!state.artist || s.k.indexOf(state.artist) >= 0) && s.t !== state.playing;
      });
      if (!pool.length) pool = SONGS;
      openSheet(pool[Math.floor(Math.random() * pool.length)], { random: true });
    }

    // ---------------- song sheet ----------------
    function openSheet(s, opts) {
      cur = s; curOpts = opts || {};
      var c = catBy[s.c], aName = artistName(s);
      var actions = '<button type="button" class="action" data-act="carto">' + '<span>Go here in car mode</span>' + CAR + "</button>";
      actions += s.p.filter(function (p) { return p[1]; }).map(function (p) {
        return '<button type="button" class="action" data-artist="' + esc(p[1]) + '"><span>All songs by ' + esc(ARTISTS[p[1]]) +
          " (" + AIDX[p[1]].count + ")</span>" + CHEV + "</button>";
      }).join("");
      actions += '<button type="button" class="action" data-cat="' + c.code + '" style="--c:var(--c-' + c.code + ')"><span>All <span class="code">' +
        c.code + "</span> " + esc(c.name) + " songs (" + c.count + ")</span>" + CHEV + "</button>";
      var plays = HIST.filter(function (e) { return e.t === s.t; });
      var randomBar = curOpts.random ? '<div class="randbar"><span>' + DICE + "Random pick" +
        (state.cat !== "all" ? " from " + esc(catBy[state.cat].name) : "") + '</span><button type="button" class="btn" data-act="another">Pick another</button></div>' : "";
      sheetBody.innerHTML = '<div class="grab" aria-hidden="true"></div>' + randomBar +
        '<div class="sheethead"><div class="bigtrk"><span class="n">' + s.t + '</span><span class="l">Track on the USB stick</span></div>' +
        '<button type="button" class="done" data-act="close">Done</button></div>' +
        '<h2 id="sheetTitle">' + esc(songTitle(s)) + "</h2>" + (s.s ? '<p class="by">' + esc(aName) + "</p>" : "") +
        '<div class="skipbox"><div class="sk-head"><span class="k">Skip counter</span>' +
        '<label class="playing' + (state.playing ? " set" : "") + '" for="sheetPlaying">' + PLAY + "<span>Playing</span>" +
        '<input id="sheetPlaying" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="–" autocomplete="off" ' +
        'aria-label="Track number playing now" value="' + (state.playing || "") + '"></label></div>' +
        '<div id="skipResult" aria-live="polite"></div>' +
        '<button type="button" class="action" id="setPlaying" data-act="setplaying"><span>I\'m now playing this song</span>' + PLAY + "</button></div>" +
        '<div class="facts">' +
        '<div class="fact"><span class="k">Category</span><span class="v">' + esc(c.name) + " · song " + s.f.split(" ")[2] + " of " + c.count + "</span></div>" +
        '<div class="fact"><span class="k">Length</span><span class="v">' + mmss(s.d) + "</span></div>" +
        (plays.length ? '<div class="fact"><span class="k">Played</span><span class="v">' + plays.length + (plays.length === 1 ? " time" : " times") +
          " · last " + esc(dayLabel(plays[plays.length - 1].at)) + " " + clock(plays[plays.length - 1].at) + "</span></div>" : "") +
        '<div class="fact"><span class="k">File name</span><span class="v mono">' + esc(s.f + " - " + s.a + (s.s ? " - " + s.s : "")) + ".mp3</span></div>" +
        '<div class="fact"><span class="k">Original spelling</span><span class="v">' + esc(s.o) + "</span></div>" +
        '</div><div class="actions">' + actions + "</div>";
      if (!sheet.open) { if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", ""); }
      sheet.scrollTop = 0;
      updateSkip();
      var done = sheetBody.querySelector(".done");
      if (done) done.focus();
    }
    function closeSheet() { if (sheet.open) { if (typeof sheet.close === "function") sheet.close(); else sheet.removeAttribute("open"); } }
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) { closeSheet(); return; }
      if (e.target.closest('[data-act="close"]')) { closeSheet(); return; }
      if (e.target.closest('[data-act="setplaying"]')) { setFollow(cur.t, 0, "set"); return; }
      if (e.target.closest('[data-act="another"]')) { pickRandom(); return; }
      if (e.target.closest('[data-act="carto"]')) { var t = cur.t; closeSheet(); openCar(t); return; }
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
    var worker = null, dbReady = false;
    var L = { on: false, session: 0, stream: null, ctx: null, node: null, src: null, sink: null, t0: 0, timer: 0,
      level: 0, lastEnd: 0, view: "hidden", result: null };

    function initWorker() {
      dbReady = false;
      try {
        worker = new Worker("fp-worker.js");
        worker.onmessage = onWorker;
        worker.postMessage({ type: "init", dbUrl: "fp.bin", twins: DATA.twins });
      } catch (e) { worker = null; LISTEN_OK = false; }
    }
    if (LISTEN_OK) initWorker();

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function race(p, ms) { return Promise.race([p.catch(function () {}), wait(ms)]); }
    function setListenUi(on) {
      listenBtn.setAttribute("aria-pressed", on ? "true" : "false");
      var cm = $("cmListen");
      if (cm) cm.classList.toggle("on", on);
    }

    async function startListening() {
      if (L.on || !LISTEN_OK) return;
      if (!worker) initWorker();
      var my = ++L.session;
      L.on = true;
      setListenUi(true);
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
      L.timer = setInterval(meterTick, 150);
    }
    function feed(chunk) {
      if (!L.on || !worker) return;
      var s = 0;
      for (var i = 0; i < chunk.length; i += 4) s += chunk[i] * chunk[i];
      L.level = Math.max(L.level * 0.7, Math.min(1, Math.sqrt(s / (chunk.length / 4)) * 6));
      worker.postMessage({ type: "audio", data: chunk }, [chunk.buffer]);
    }
    function meterTick() {
      if (!L.on) return;
      var secs = (performance.now() - L.t0) / 1000, t = $("lsecs");
      if (t) t.textContent = Math.floor(secs) + " s";
      var bars = cardEl.querySelectorAll(".meter i");
      for (var i = 0; i < bars.length; i++) {
        bars[i].style.height = Math.round(15 + 85 * Math.min(1, L.level * (0.55 + 0.45 * Math.abs(Math.sin(secs * 7 + i * 1.7))))) + "%";
      }
      var note = $("lnote");
      if (note) note.textContent = dbReady ? "Hold the phone in the car, near a speaker. It usually takes 4–10 seconds."
        : "Preparing the song fingerprints. The first time this needs the internet and takes a little longer.";
      if (secs > 45) { L.session++; stopCapture(); showCard(dbReady ? "notfound" : "dberror"); }
    }
    function stopCapture() {
      clearInterval(L.timer);
      try { if (L.stream) L.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      try { if (L.node) L.node.disconnect(); if (L.src) L.src.disconnect(); } catch (e) {}
      try { if (L.ctx && L.ctx.state !== "closed") L.ctx.close(); } catch (e) {}
      if (worker && L.on) worker.postMessage({ type: "stop" });
      L.stream = L.ctx = L.node = L.src = L.sink = null;
      L.on = false; L.level = 0; L.lastEnd = Date.now();
      setListenUi(false);
    }
    function fail(view) { L.session++; stopCapture(); showCard(view); }
    function stopListening() { L.session++; stopCapture(); showCard("hidden"); }
    function onWorker(e) {
      var m = e.data;
      if (m.type === "ready") dbReady = true;
      else if (m.type === "error") { worker = null; if (L.on) fail("dberror"); }
      else if (m.type === "match" && L.on) {
        L.session++; stopCapture();
        L.result = m;
        fresh = Date.now();
        showCard("hidden");
        setFollow(m.songs[0] + 1, Math.min(m.position, dur(m.songs[0] + 1) - 1), "heard");
      } else if (m.type === "nomatch" && L.on) {
        L.session++; stopCapture();
        showCard("notfound");
      }
    }
    function showCard(view) { L.view = view; renderCard(); renderCarListen(); }
    function renderCarListen() {
      var st = $("cmStatus");
      if (!st) return;
      var msg = { starting: "Starting the microphone…", listening: "Listening…", notfound: "Song not recognised. Turn the music up and try again.",
        needtap: "Tap the microphone to start listening.", denied: "Microphone is off. Allow it for Car Songs.",
        dberror: "Fingerprints not loaded. Connect to the internet once.", error: "Microphone problem. Try again." }[L.view] || "";
      st.textContent = msg;
      st.hidden = !msg;
    }
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
      if (v === "listening") meterTick();
    }
    cardEl.addEventListener("click", function (e) {
      var b = e.target.closest("[data-l]");
      if (!b) return;
      var a = b.getAttribute("data-l");
      if (a === "stop" || a === "close") stopListening();
      else if (a === "again") startListening();
      else if (a === "reload") { initWorker(); startListening(); }
    });
    listenBtn.addEventListener("click", function () { if (L.on) stopListening(); else startListening(); });

    // ---------------- clock ----------------
    setInterval(function () {
      if (document.hidden || !F) return;
      var before = state.playing, fs = followState();
      if (fs && fs.track !== before) { applyPlaying(fs.track); return; }
      tickNow(fs);
      tickCar(fs);
    }, 1000);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (L.on) { L.session++; stopCapture(); showCard("hidden"); } return; }
      var fs = followState();
      if (fs && fs.track !== state.playing) applyPlaying(fs.track); else { renderNow(); renderCar(); }
      if (carOpen) requestWake();
      if (LISTEN_OK && autoOn() && !L.on && Date.now() - L.lastEnd > 30000) startListening();
    });
    if (navigator.serviceWorker) {
      var reloading = false, hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        if (reloading || L.on || !hadController) return;
        reloading = true; location.reload();
      });
    }

    $("cmListen").innerHTML = MIC;
    var fs0 = followState();
    if (fs0 && fs0.track !== state.playing) state.playing = fs0.track;
    playEl.value = state.playing ? String(state.playing) : "";
    readPlaying(playEl);
    render();
    if (LISTEN_OK && autoOn()) startListening();
  }
})();
