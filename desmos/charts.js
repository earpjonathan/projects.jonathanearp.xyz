/* ============================================================
   PETER — figures.
   Every chart is inline SVG drawn from window.DG (data.js), styled
   entirely through CSS classes so it follows the light/dark toggle
   with no redraw. Charts are re-rendered on resize at a 1:1 viewBox
   so 10px labels stay 10px on a phone.
   Palette rule (ORYZO): --fg-soft carries the mass, --accent is a
   hairline — strokes, thin bars, and annotation only.
   ============================================================ */
(function () {
  var D = window.DG;
  if (!D) return;

  /* ---------- tiny SVG helpers ---------- */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function el(tag, attrs, kids) {
    var s = "<" + tag;
    for (var k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      s += " " + k + '="' + attrs[k] + '"';
    }
    return kids !== undefined ? s + ">" + kids + "</" + tag + ">" : s + "/>";
  }
  function rect(x, y, w, h, cls) { return el("rect", { x: r(x), y: r(y), width: r(Math.max(0, w)), height: r(Math.max(0, h)), "class": cls }); }
  function line(x1, y1, x2, y2, cls) { return el("line", { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), "class": cls }); }
  function text(x, y, str, cls, anchor) {
    return el("text", { x: r(x), y: r(y), "class": "c-t " + (cls || ""), "text-anchor": anchor || "start" }, esc(str));
  }
  function path(d, cls) { return el("path", { d: d, "class": cls }); }
  function r(n) { return Math.round(n * 100) / 100; }
  function fmt(n) { return n.toLocaleString("en-US"); }

  /* ============================================================
     V2 — where render time goes, and what the fix bought
     ============================================================ */
  function renderProfile(w) {
    var f = D.findings.render_profile, sp = D.findings.speedup;
    var h = 220;
    var m = { t: 34, r: 8, b: 20, l: 0 };
    var iw = w - m.l - m.r;
    var total = f.trace_s + f.capture_s + f.encode_s;
    var s = "";
    var barH = 34;

    /* stacked bar — one 13.8 s clip, 331 frames */
    var segs = [
      { k: "Trace", short: "trace", v: f.trace_s, cls: "c-bar" },
      { k: "Browser screenshot capture", short: "capture", v: f.capture_s, cls: "c-bar--hi" },
      { k: "ffmpeg encode", short: "encode", v: f.encode_s, cls: "c-bar" }
    ];
    var x = m.l;
    s += text(m.l, m.t - 14, "One render, by stage — 171.6 s total", "c-t--fg", "start");
    segs.forEach(function (g, i) {
      var gw = (g.v / total) * iw;
      s += rect(x, m.t, gw - 1, barH, g.cls);
      var pct = Math.round((g.v / total) * 100);
      if (gw > 150) {
        s += text(x + 10, m.t + 21, pct + "% · " + g.k + " · " + g.v + " s", "c-t--fg", "start");
      } else {
        /* too narrow to label inside — drop below, and anchor the last
           segment to the right edge so it cannot run off the viewBox */
        var last = i === segs.length - 1;
        s += text(last ? m.l + iw : x, m.t + barH + 14,
                  pct + "% " + g.short, "", last ? "end" : "start");
      }
      x += gw;
    });

    /* before / after */
    var y2 = m.t + barH + 46;
    s += text(m.l, y2 - 12, "Same clip, before and after parallel capture", "c-t--fg", "start");
    var maxT = sp.before_s;
    [{ k: "Before", v: sp.before_s, cls: "c-bar" },
     { k: "After",  v: sp.after_s,  cls: "c-bar--hi" }].forEach(function (g, i) {
      var y = y2 + i * 30;
      var gw = (g.v / maxT) * (iw - 130);
      s += text(m.l, y + 15, g.k, "", "start");
      s += rect(m.l + 58, y, gw, 20, g.cls);
      s += text(m.l + 58 + gw + 8, y + 15, g.v + " s", "c-t--fg c-t--n", "start");
    });
    s += text(m.l, y2 + 78, "1.55× faster — 486 ms → 318 ms per frame", "c-t--acc", "start");

    return svg(w, h, s);
  }

  /* ============================================================
     V4 — prediction vs reality (diverging correlations)
     ============================================================ */
  function predictability(w) {
    var p = D.findings.predictability;
    var rows = [
      { k: "Predicted retention → plays", v: p.predicted_retention_vs_plays_r, hi: true },
      { k: "Measured retention → plays", v: p.actual_retention_vs_plays_r },
      { k: "Duration → plays", v: p.duration_vs_plays_r },
      { k: "Duration → retention", v: p.duration_vs_retention_r }
    ];
    var rowH = 42, h = rows.length * rowH + 84;
    var m = { t: 40, r: 12, b: 44, l: w < 700 ? 12 : 210 };
    var iw = w - m.l - m.r;
    var mid = m.l + iw / 2, half = iw / 2;
    var s = "";

    /* noise band |r| < 0.3 */
    s += rect(mid - half * 0.3, m.t - 12, half * 0.6, rows.length * rowH + 12, "c-band");
    s += text(mid, m.t - 20, "indistinguishable from noise  |r| < 0.3", "", "middle");

    rows.forEach(function (row, i) {
      var y = m.t + i * rowH;
      var bw = Math.abs(row.v) * half;
      var x = row.v >= 0 ? mid : mid - bw;
      if (m.l > 100) s += text(m.l - 14, y + 18, row.k, row.hi ? "c-t--fg" : "", "end");
      else s += text(mid, y - 2, row.k, row.hi ? "c-t--fg" : "", "middle");
      s += rect(x, y + (m.l > 100 ? 4 : 6), bw, 18, row.hi ? "c-bar--hi" : "c-bar");
      var lx = row.v >= 0 ? mid + bw + 8 : mid - bw - 8;
      /* U+2212 minus, to match the axis ticks below */
      var lbl = row.v < 0 ? "\u2212" + Math.abs(row.v).toFixed(2) : "+" + row.v.toFixed(2);
      s += text(lx, y + 18 + (m.l > 100 ? 0 : 2), lbl,
                (row.hi ? "c-t--acc" : "c-t--fg") + " c-t--n", row.v >= 0 ? "start" : "end");
    });

    /* zero rule + scale */
    s += line(mid, m.t - 12, mid, m.t + rows.length * rowH, "c-axis");
    var base = m.t + rows.length * rowH + 6;
    s += line(m.l, base, m.l + iw, base, "c-axis");
    [[-1, "−1"], [-0.5, "−0.5"], [0, "0"], [0.5, "+0.5"], [1, "+1"]].forEach(function (t) {
      s += text(mid + t[0] * half, base + 16, t[1], "c-t--n", "middle");
    });
    s += text(m.l, h - 6, "Pearson r across 68 posts", "", "start");

    return svg(w, h, s);
  }

  /* ============================================================
     V5 — render cost vs clip length
     ============================================================ */
  function renderCost(w) {
    var pts = D.render;
    var h = w < 560 ? 280 : 330;
    var m = { t: 20, r: 16, b: 48, l: 54 };
    var iw = w - m.l - m.r, ih = h - m.t - m.b;
    var maxX = 50, maxY = 640;
    var X = function (v) { return m.l + (v / maxX) * iw; };
    var Y = function (v) { return m.t + ih - (v / maxY) * ih; };
    var s = "";

    /* grid */
    [0, 160, 320, 480, 640].forEach(function (v) {
      s += line(m.l, Y(v), m.l + iw, Y(v), "c-grid");
      s += text(m.l - 8, Y(v) + 3, v === 0 ? "0" : fmt(v), "c-t--n", "end");
    });
    [0, 10, 20, 30, 40, 50].forEach(function (v) {
      s += text(X(v), m.t + ih + 18, v + (v === 50 ? " s" : ""), "c-t--n", "middle");
    });

    /* y = 12x reference */
    s += line(X(0), Y(0), X(maxX), Y(12 * maxX), "c-ref");
    s += text(X(46), Y(12 * 46) - 8, "12× clip length", "", "end");

    /* points, run 1 hollow / run 2 accent */
    pts.forEach(function (p) {
      s += el("circle", {
        cx: r(X(p.clip_s)), cy: r(Y(p.render_s)), r: 4,
        "class": p.run === 2 ? "c-dot--hi" : "c-dot"
      });
    });

    s += line(m.l, m.t + ih, m.l + iw, m.t + ih, "c-axis");
    s += line(m.l, m.t, m.l, m.t + ih, "c-axis");
    s += text(0, m.t - 6, "Render s", "", "start");
    s += text(m.l + iw, h - 8, "Clip length →", "", "end");

    return svg(w, h, s);
  }

  function svg(w, h, body) {
    return el("svg", {
      viewBox: "0 0 " + r(w) + " " + r(h),
      width: "100%", height: h,
      role: "img", "aria-hidden": "true", "preserveAspectRatio": "xMidYMid meet"
    }, body);
  }

  /* ============================================================
     Bind the Instagram figures in the copy to the data file.

     Anything that moves when the numbers are refreshed is written as
     <span data-dg="key"> in the HTML rather than typed into the prose, so
     `python3 tools/refresh_data.py` updates the sentences too and the page
     cannot quietly drift out of sync with its own dataset.
     ============================================================ */
  (function bindNumbers() {
    var S = D.summary || {};
    var days = 0;
    if (S.window && S.window.first && S.window.last) {
      days = Math.round((Date.parse(S.window.last) - Date.parse(S.window.first)) / 864e5) + 1;
    }
    var months = Math.floor((S.total_watch_days || 0) / 30.44);
    var years = Math.floor(months / 12);

    var V = {
      posts: fmt(S.posts || 0),
      total_plays: fmt(S.total_plays || 0),
      total_reach: fmt(S.total_reach || 0),
      total_likes: fmt(S.total_likes || 0),
      total_shares: fmt(S.total_shares || 0),
      total_saves: fmt(S.total_saves || 0),
      total_watch_hours: fmt(S.total_watch_hours || 0),
      total_watch_days: S.total_watch_days,
      youtube_uploads: fmt(S.youtube_uploads || 0),
      mean_watch_s: S.mean_watch_s,
      share_rate_pct: S.share_rate_pct,
      plays_m: ((S.total_plays || 0) / 1e6).toFixed(1) + " million",
      window_days: days,
      watch_span: years
        ? years + " year" + (years > 1 ? "s" : "") +
          (months % 12 ? " " + (months % 12) + " months" : "")
        : months + " months"
    };

    Object.keys(V).forEach(function (k) {
      var nodes = document.querySelectorAll('[data-dg="' + k + '"]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = V[k];
    });
  })();

  /* ---------- odometer ----------
     Replaces a tile's text with per-digit slots that slide. Returns a
     set(text, animate) function. Only the digits that actually changed
     move; commas stay put. */
  function odometer(host) {
    var ROWS = 20;               // 0-9 twice, so a carry rolls forwards
    var ROLL_MS = 520;
    var digits = [], shape = null, sr = null;

    function build(str) {
      host.textContent = "";
      digits = [];
      sr = document.createElement("span");
      sr.className = "odo-sr";
      host.appendChild(sr);

      var box = document.createElement("span");
      box.className = "odo";
      box.setAttribute("aria-hidden", "true");
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch < "0" || ch > "9") {
          var sep = document.createElement("span");
          sep.className = "odo__sep";
          sep.textContent = ch;
          box.appendChild(sep);
          continue;
        }
        var slot = document.createElement("span");
        slot.className = "odo__d";
        var strip = document.createElement("span");
        strip.className = "odo__s";
        for (var d = 0; d < ROWS; d++) {
          var row = document.createElement("i");
          row.textContent = String(d % 10);
          strip.appendChild(row);
        }
        slot.appendChild(strip);
        box.appendChild(slot);
        digits.push({ strip: strip, at: -1, timer: null });
      }
      host.appendChild(box);
      shape = str.replace(/[0-9]/g, "#");
    }

    function place(D, index, animate) {
      D.strip.classList.toggle("odo__s--anim", !!animate);
      D.strip.style.transform = "translateY(-" + index + "em)";
      D.at = index;
    }

    return function set(str, animate) {
      if (str.replace(/[0-9]/g, "#") !== shape) { build(str); animate = false; }
      sr.textContent = str;

      var di = 0;
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch < "0" || ch > "9") continue;
        var want = +ch, D = digits[di++];
        if (D.at >= 0 && D.at % 10 === want) continue;

        if (D.timer) { clearTimeout(D.timer); D.timer = null; }
        if (!animate || D.at < 0) { place(D, want, false); continue; }

        /* Rolling forwards means never moving to a smaller offset, so a
           digit wrapping past 9 goes into the strip's second run. */
        var from = D.at % 10;
        place(D, want > from ? want : want + 10, true);
        if (D.at >= 10) {
          D.timer = setTimeout(function (d, v) {
            return function () { place(d, v, false); d.timer = null; };
          }(D, want), ROLL_MS + 40);
        }
      }
    };
  }

  /* ---------- live counters on the four headline tiles ----------
     The tiles tick forward from the last refresh at the rate measured
     between the last two refreshes, so the section is not frozen at
     whenever the weekly job happened to run. This is an estimate and the
     copy says so - the real figures only move when refresh_data.py runs.

     Three things keep it from lying too hard: it only ever ticks the four
     raw counters (never a mean or a ratio, which do not accumulate), it
     only touches the stat tiles and leaves every number in the prose at
     its refreshed value, and it stops extrapolating after CAP_H so a
     broken workflow shows a stale figure rather than an invented one. */
  (function liveCounters() {
    var S = D.summary || {};
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var t0 = Date.parse(S.generated_at || "");
    if (!t0) return;

    var nodes = document.querySelectorAll(".stats .stat__n[data-dg]");
    if (!nodes.length) return;

    /* No fallback rate on purpose. Dividing lifetime totals by the posting
       window gives ~5 plays a second, which looks impressive and is wrong -
       views keep accruing long after a post lands. With no measured rate
       the tiles just sit at the refreshed figure. */
    var CAP_H = 9 * 24;          // a little past the weekly refresh cadence
    var rates = S.rates_per_hour || {};
    var tiles = [];

    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-dg");
      var base = S[key];
      if (typeof base !== "number") continue;
      var rate = rates[key];
      if (!(rate > 0)) continue;
      tiles.push({ el: nodes[i], base: base, rate: rate, shown: -1,
                   set: odometer(nodes[i]) });
    }
    if (!tiles.length) return;

    function tick() {
      var h = Math.min((Date.now() - t0) / 36e5, CAP_H);
      if (h < 0) h = 0;
      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        var v = Math.floor(t.base + t.rate * h);
        if (v === t.shown) continue;
        /* First paint, and the catch-up after a spell in a background tab,
           land without animation - rolling through a few thousand plays is
           a slot machine, not a counter. */
        var roll = t.shown >= 0 && v - t.shown <= 20;
        t.shown = v;
        t.set(fmt(v), roll);
      }
    }

    var timer = null;
    /* 250 ms so a digit turns over close to the moment it actually crosses;
       the roll itself is 520 ms and the fastest counter moves every 1.4 s,
       so rolls never overlap. */
    function start() { tick(); if (!timer) timer = setInterval(tick, 250); }
    function stop() { clearInterval(timer); timer = null; }

    start();
    /* A background tab does not need to count; it catches up on return. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
  })();

  /* ---------- mount + keep in step with the layout ---------- */
  var charts = {
    "fig-render-profile": renderProfile,
    "fig-predictability": predictability,
    "fig-render-cost": renderCost
  };

  var lastW = {};
  function draw() {
    Object.keys(charts).forEach(function (id) {
      var host = document.getElementById(id);
      if (!host) return;
      var w = Math.max(280, Math.round(host.clientWidth));
      if (lastW[id] === w) return;
      lastW[id] = w;
      host.innerHTML = charts[id](w);
    });
  }

  draw();
  var t = null;
  window.addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(draw, 120);
  }, { passive: true });
})();
