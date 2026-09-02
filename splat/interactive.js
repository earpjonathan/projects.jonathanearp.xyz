/* ============================================================
   SPLOOGE — the playable figures.
   Each one runs the real arithmetic rather than replaying a
   recorded answer: the frame selector is the selection rule from
   scripts/select_frames2.py over real gyro samples, the near-plane
   demo solves the viewer's own cull inequality, and the distortion
   demo evaluates both forms of the loss and compares them.
   Canvas colours are read from the live CSS variables and redrawn
   when the theme changes, so nothing here holds its own palette.
   ============================================================ */
(function () {
  var D = window.SPLAT;
  var MEDIA = "media/";

  /* ---------- shared plumbing ---------- */
  var cs = getComputedStyle(document.documentElement);
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  var themeHooks = [];
  function onTheme(fn) { themeHooks.push(fn); }
  new MutationObserver(function () {
    themeHooks.forEach(function (f) { try { f(); } catch (e) {} });
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  /* A canvas sized to its box in device pixels, with a redraw hook that
     fires on resize and on a theme change. Every demo uses this. */
  function mount(canvas, draw) {
    var ctx = canvas.getContext("2d");
    function fit() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return false;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return true;
    }
    function redraw() { if (fit()) draw(ctx, canvas.clientWidth, canvas.clientHeight); }
    if (window.ResizeObserver) {
      new ResizeObserver(redraw).observe(canvas);
    } else {
      var t = null;
      window.addEventListener("resize", function () {
        clearTimeout(t); t = setTimeout(redraw, 100);
      }, { passive: true });
    }
    onTheme(redraw);
    redraw();
    return redraw;
  }

  /* Memoised by URL. extent.json is 370 KB and three separate things on this
     page want it; without this the browser fetches it three times, because
     concurrent requests for the same URL do not share a response. Exposed on
     window so page.js can use the same cache. */
  var JSON_CACHE = {};
  function getJSON(url) {
    if (!JSON_CACHE[url]) {
      JSON_CACHE[url] = fetch(url).then(function (r) {
        if (!r.ok) throw new Error(r.status + " " + url);
        return r.json();
      }).catch(function (e) { delete JSON_CACHE[url]; throw e; });
    }
    return JSON_CACHE[url];
  }
  window.SPLAT_JSON = getJSON;

  /* ============================================================
     01 — ADAPTIVE FRAME SELECTION
     The rule from scripts/select_frames2.py, run live on real DJI
     gyro samples: keep a frame once cumulative rotation since the
     last kept frame reaches `thresh`, with a floor of kmin frames
     and a ceiling of kmax so translation-dominated flight still
     gets sampled.
     ============================================================ */
  (function () {
    var root = document.querySelector(".demo--select");
    if (!root) return;
    var canvas = root.querySelector("canvas");
    var thrIn = root.querySelector('[data-in="thresh"]');
    var kmaxIn = root.querySelector('[data-in="kmax"]');
    var out = {};
    root.querySelectorAll("[data-read]").forEach(function (n) { out[n.getAttribute("data-read")] = n; });

    var Q = null, rate = null, redraw = null;

    /* relative angle between two quaternions, in degrees — relang() */
    function relang(a, ai, b, bi) {
      var w1 = a[ai], x1 = -a[ai + 1], y1 = -a[ai + 2], z1 = -a[ai + 3];
      var w2 = b[bi], x2 = b[bi + 1], y2 = b[bi + 2], z2 = b[bi + 3];
      var w = w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2;
      w = Math.abs(w); if (w > 1) w = 1;
      return 2 * Math.acos(w) * 180 / Math.PI;
    }

    function select(thresh, kmin, kmax) {
      var n = Q.length / 4, keep = [0], last = 0;
      for (var i = 1; i < n; i++) {
        var gap = i - last;
        if (gap < kmin) continue;
        if (gap >= kmax || relang(Q, last * 4, Q, i * 4) >= thresh) { keep.push(i); last = i; }
      }
      return keep;
    }

    function med(a) {
      if (!a.length) return 0;
      var b = a.slice().sort(function (x, y) { return x - y; });
      return b[Math.floor(b.length / 2)];
    }
    function pct(a, p) {
      if (!a.length) return 0;
      var b = a.slice().sort(function (x, y) { return x - y; });
      return b[Math.min(b.length - 1, Math.floor(b.length * p))];
    }

    function draw(ctx, W, H) {
      if (!Q) return;
      var fg = css("--fg"), soft = css("--fg-soft"), acc = css("--accent"), line = css("--line");
      ctx.clearRect(0, 0, W, H);
      var n = Q.length / 4;
      var thresh = +thrIn.value, kmax = +kmaxIn.value, kmin = D.capture.select.kmin;
      var keep = select(thresh, kmin, kmax);

      var padL = 4, padR = 4, iw = W - padL - padR;
      var topH = H * 0.60, tickY = topH + 18, tickH = Math.max(20, (H - topH - 90) / 2);

      /* --- rotation rate, the signal the rule reads --- */
      var maxR = 0;
      for (var i = 0; i < rate.length; i++) if (rate[i] > maxR) maxR = rate[i];
      maxR = Math.max(maxR, 0.5);
      ctx.beginPath();
      ctx.moveTo(padL, topH);
      for (i = 0; i < rate.length; i++) {
        ctx.lineTo(padL + (i / (n - 1)) * iw, topH - (rate[i] / maxR) * (topH - 18));
      }
      ctx.lineTo(padL + iw, topH);
      ctx.closePath();
      ctx.fillStyle = soft; ctx.globalAlpha = 0.22; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = soft; ctx.lineWidth = 1; ctx.stroke();

      ctx.strokeStyle = line; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(padL, topH); ctx.lineTo(padL + iw, topH); ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = soft; ctx.font = "10px " + css("--font");
      ctx.fillText("PER-FRAME ROTATION, DEG", padL + 2, 12);
      ctx.textAlign = "right";
      ctx.fillText(maxR.toFixed(1), padL + iw - 2, 12);
      ctx.textAlign = "left";

      /* --- kept frames --- */
      ctx.fillStyle = acc;
      for (i = 0; i < keep.length; i++) {
        var x = padL + (keep[i] / (n - 1)) * iw;
        ctx.fillRect(x, tickY, 1, tickH);
      }
      ctx.fillStyle = soft;
      ctx.fillText("KEPT — " + keep.length + " OF " + n, padL + 2, tickY - 4);

      /* --- what a uniform sampler would have taken, same budget --- */
      var uy = tickY + tickH + 26;
      ctx.fillStyle = soft; ctx.globalAlpha = 0.55;
      var step = n / keep.length;
      for (i = 0; i < keep.length; i++) {
        ctx.fillRect(padL + ((i * step) / (n - 1)) * iw, uy, 1, tickH);
      }
      ctx.globalAlpha = 1;
      ctx.fillText("UNIFORM AT THE SAME BUDGET, FOR COMPARISON", padL + 2, uy - 4);

      /* --- readouts --- */
      var ang = [], gaps = [];
      for (i = 0; i + 1 < keep.length; i++) {
        ang.push(relang(Q, keep[i] * 4, Q, keep[i + 1] * 4));
        gaps.push((keep[i + 1] - keep[i]) / 50 * 1000);
      }
      out.kept.textContent = keep.length;
      out.fps.textContent = (keep.length / (n / 50)).toFixed(1) + " fps";
      out.rot.textContent = med(ang).toFixed(1) + "° / " + pct(ang, 0.99).toFixed(1) + "°";
      out.gap.textContent = Math.round(med(gaps)) + " / " + Math.round(pct(gaps, 0.99)) + " ms";
      var capped = gaps.filter(function (g) { return g >= (kmax / 50) * 1000 - 1; }).length;
      out.note.textContent = capped === 0
        ? "Every kept frame was chosen by rotation. The time cap never fired."
        : Math.round(100 * capped / Math.max(gaps.length, 1)) +
          "% of gaps hit the kmax time cap — those are the straight, translation-dominated stretches, " +
          "where rotation alone would have sampled far too sparsely.";
    }

    getJSON(MEDIA + "gyro.json").then(function (g) {
      Q = g.quat;
      var n = Q.length / 4;
      rate = new Float64Array(n);
      for (var i = 1; i < n; i++) rate[i] = relang(Q, (i - 1) * 4, Q, i * 4);
      rate[0] = rate[1] || 0;
      redraw = mount(canvas, draw);
      [thrIn, kmaxIn].forEach(function (inp) {
        inp.addEventListener("input", function () {
          root.querySelector('[data-val="' + inp.getAttribute("data-in") + '"]').textContent =
            inp.getAttribute("data-in") === "thresh" ? (+inp.value).toFixed(0) + "°" : inp.value;
          redraw();
        });
      });
      root.querySelector('[data-val="thresh"]').textContent = (+thrIn.value).toFixed(0) + "°";
      root.querySelector('[data-val="kmax"]').textContent = kmaxIn.value;
    }).catch(function (e) {
      root.querySelector(".demo__read").textContent = "Gyro samples did not load (" + e.message + ").";
    });
  })();

  /* ============================================================
     02 — THE MERGED SCENE
     A density map of the 3.2 M triangulated points that fall inside
     the flight envelope, seen from above, with the nine flight
     tracks drawn over them. The image ships as an alpha mask and is
     tinted from the live theme colours, so it follows the toggle.
     Screen x runs along the scene's z axis because the two sites are
     strung out that way; a COLMAP frame has no north, so neither
     orientation is more correct than the other.
     ============================================================ */
  (function () {
    var root = document.querySelector(".demo--map");
    if (!root) return;
    var canvas = root.querySelector("canvas");
    var M = null, E = null, bitmap = null, nadir = null;
    var tinted = null, tintKey = "";
    var mode = "merged", base = "render", t0 = 0, playing = false, redraw = null;

    function tint() {
      var key = css("--fg-soft") + css("--bg");
      if (tinted && tintKey === key) return tinted;
      var off = document.createElement("canvas");
      off.width = M.w; off.height = M.h;
      var oc = off.getContext("2d");
      oc.drawImage(bitmap, 0, 0);
      var d = oc.getImageData(0, 0, M.w, M.h);
      var px = d.data;
      /* the PNG is a grayscale density mask: luminance becomes alpha and the
         colour comes from the theme, so one file serves both themes */
      var probe = document.createElement("canvas").getContext("2d");
      probe.fillStyle = css("--fg-soft");
      probe.fillRect(0, 0, 1, 1);
      var rgb = probe.getImageData(0, 0, 1, 1).data;
      for (var i = 0; i < px.length; i += 4) {
        var a = px[i];
        px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2];
        px[i + 3] = a;
      }
      oc.putImageData(d, 0, 0);
      tinted = off; tintKey = key;
      return off;
    }

    /* Two bases, two projections. The density raster is an orthographic grid
       built from world bounds; the render is a real perspective camera pointing
       straight down, so its track positions were projected offline and arrive
       as pixels. Each base carries its own mapping rather than one being
       approximated into the other. */
    function layout(W, H) {
      var src = base === "render" ? nadir : bitmap;
      var iw = base === "render" ? E.nadir.w : M.w;
      var ih = base === "render" ? E.nadir.h : M.h;
      var s = Math.min(W / iw, H / ih);
      return { src: src, iw: iw, ih: ih, s: s,
               dw: iw * s, dh: ih * s, ox: (W - iw * s) / 2, oy: (H - ih * s) / 2 };
    }

    /* A label over a photograph needs a plate under it or it disappears into
       whatever it happens to be sitting on. Over the density raster the
       background is flat and dark, so the plate is not drawn. */
    function chip(ctx, x, y, str, colour) {
      ctx.font = "10px " + css("--font");
      if (base === "render") {
        var w = ctx.measureText(str).width;
        ctx.fillStyle = "rgba(16, 9, 4, 0.62)";
        ctx.fillRect(x - 5, y - 11, w + 10, 15);
        ctx.fillStyle = css("--cream");
      } else {
        ctx.fillStyle = colour || css("--fg");
      }
      ctx.fillText(str, x, y);
    }

    function draw(ctx, W, H) {
      if (!M || !bitmap || !E || !nadir) return;
      var acc = css("--accent"), fg = css("--fg"), line = css("--line"), soft = css("--fg-soft");
      ctx.clearRect(0, 0, W, H);
      var L = layout(W, H);
      if (base === "render") ctx.drawImage(nadir, L.ox, L.oy, L.dw, L.dh);
      else ctx.drawImage(tint(), L.ox, L.oy, L.dw, L.dh);

      var bx = M.bounds.x, bz = M.bounds.z;
      var tracks = base === "render" ? E.nadir.tracks_px : M.tracks;
      function PX(a, b) {
        /* render: a,b are already pixels in the source image.
           density: a,b are world x and z. */
        return base === "render"
          ? [L.ox + a * L.s, L.oy + b * L.s]
          : [L.ox + ((b - bz[0]) / (bz[1] - bz[0])) * L.dw,
             L.oy + ((a - bx[0]) / (bx[1] - bx[0])) * L.dh];
      }

      var reveal = playing ? Math.min((performance.now() - t0) / 2400, 1) : 1;
      tracks.forEach(function (tr) {
        if (!(mode === "merged" || mode === tr.site)) return;
        var xy = base === "render" ? tr.px : tr.xy, n = xy.length / 2;
        var upto = Math.max(2, Math.round(n * reveal));
        ctx.beginPath();
        for (var k = 0; k < upto; k++) {
          var q = PX(xy[k * 2], xy[k * 2 + 1]);
          if (k === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
        }
        ctx.lineWidth = base === "render" ? 1.4 : 1.1;
        /* The photograph is dark in either theme, so session 2 is pinned to
           cream over it; --fg would be near-black ink in the light theme and
           would vanish into the hillside. */
        ctx.strokeStyle = tr.site === "hilltop" ? acc
                        : (base === "render" ? css("--cream") : fg);
        ctx.globalAlpha = mode === "merged" ? 0.9 : 1;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      /* the crop the live renderer loads, so the reader can see how little of
         the site that 6.6 MB actually is */
      if (base === "render" && reveal > 0.75) {
        var c = E.nadir.crop_px;
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = fg; ctx.lineWidth = 1.4;
        ctx.globalAlpha = Math.min((reveal - 0.75) / 0.25, 1);
        ctx.beginPath();
        ctx.arc(L.ox + c.x * L.s, L.oy + c.y * L.s, c.r * L.s, 0, 6.2832);
        ctx.stroke();
        ctx.setLineDash([]);
        chip(ctx, L.ox + (c.x + c.r) * L.s + 7, L.oy + c.y * L.s + 3, "LIVE VIEWER CROP");
        ctx.restore();
      }

      /* one scene unit, for scale */
      var barW = base === "render"
        ? E.nadir.scale_px_per_unit * L.s
        : (L.dw / (bz[1] - bz[0]));
      var barY = L.oy + L.dh - 16, barX = L.ox + 14;
      ctx.strokeStyle = base === "render" ? css("--cream") : line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(barX, barY); ctx.lineTo(barX + barW, barY);
      ctx.moveTo(barX, barY - 4); ctx.lineTo(barX, barY + 4);
      ctx.moveTo(barX + barW, barY - 4); ctx.lineTo(barX + barW, barY + 4);
      ctx.stroke();
      chip(ctx, barX, barY - 8, "1 SCENE UNIT \u00b7 ABOUT 10 FLIGHT ALTITUDES", soft);

      if (playing && reveal < 1) requestAnimationFrame(redraw);
      else playing = false;
    }

    function loadImage(url) {
      return new Promise(function (res, rej) {
        var im = new Image();
        im.onload = function () { res(im); };
        im.onerror = rej;
        im.src = url;
      });
    }

    Promise.all([getJSON(MEDIA + "map.json"), getJSON(MEDIA + "extent.json")])
      .then(function (r) {
        M = r[0]; E = r[1];
        return Promise.all([loadImage(MEDIA + M.img), loadImage(MEDIA + "nadir.jpg")]);
      }).then(function (im) {
      bitmap = im[0]; nadir = im[1];
      redraw = mount(canvas, draw);
      root.querySelectorAll("[data-base]").forEach(function (b) {
        b.addEventListener("click", function () {
          root.querySelectorAll("[data-base]").forEach(function (o) { o.classList.remove("is-on"); });
          b.classList.add("is-on");
          base = b.getAttribute("data-base");
          t0 = performance.now(); playing = true;
          redraw();
        });
      });
      var b0 = root.querySelector('[data-base="render"]');
      if (b0) b0.classList.add("is-on");
      root.querySelectorAll("[data-mode]").forEach(function (b) {
        b.addEventListener("click", function () {
          root.querySelectorAll("[data-mode]").forEach(function (o) { o.classList.remove("is-on"); });
          b.classList.add("is-on");
          mode = b.getAttribute("data-mode");
          t0 = performance.now(); playing = true;
          redraw();
        });
      });
      var first = root.querySelector('[data-mode="merged"]');
      if (first) first.classList.add("is-on");
      t0 = performance.now(); playing = true; redraw();
    }).catch(function () {
      var rd = root.querySelector(".demo__read");
      if (rd) rd.textContent = "The scene map did not load.";
    });
  })();

  /* ============================================================
     03 — THE NEAR PLANE, ON REAL POSES
     Nothing here is modelled. Four capture poses were rendered at
     seven near planes with the CPU reimplementation of the viewer's
     rasteriser, and the hole fraction measured on each; the depth
     histogram is the opacity-weighted distribution of the splats
     actually inside that camera's frustum. Moving the slider swaps
     in a real render and its real measurement.
     ============================================================ */
  (function () {
    var root = document.querySelector(".demo--znear");
    if (!root) return;
    var poseBox = root.querySelector("[data-poses]");
    var ziIn = root.querySelector('[data-in="zi"]');
    var img = root.querySelector("[data-shot]");
    var hist = root.querySelector(".znear__hist");
    var curve = root.querySelector(".znear__curve");
    var out = {};
    root.querySelectorAll("[data-read]").forEach(function (n) { out[n.getAttribute("data-read")] = n; });

    var S = null, pose = null, drawHist = null, drawCurve = null;
    /* the JSON is keyed by the number as written; the thumbnails drop the
       decimal point, so the two lookups are deliberately separate */
    function key(z) { return String(z); }
    function file(z) { return String(z).replace(".", ""); }

    function current() {
      return { z: S.znear[+ziIn.value], d: S.data[pose] };
    }

    /* the two depths the near plane sets, both read straight off the
       projection matrix the viewer builds:
         cull  z < B/(A+margin)      the frustum reject
         dark  z < B/(A+1)           where clamp(ndc+1,0,1) reaches zero
         fade  B/(A+1) .. znear      attenuated on the way up to full weight */
    function zones(zn) {
      var zfar = 200, margin = 1.2;
      var A = zfar / (zfar - zn), B = zfar * zn / (zfar - zn);
      return { cull: B / (A + margin), dark: B / (A + 1), full: zn };
    }

    function paintHist(ctx, W, H) {
      if (!S) return;
      var soft = css("--fg-soft"), acc = css("--accent"), line = css("--line");
      ctx.clearRect(0, 0, W, H);
      ctx.font = "10px " + css("--font");
      var c = current(), d = c.d, h = d.hist, e = d.edges;
      var padL = 6, padR = 6, padT = 22, padB = 22;
      var iw = W - padL - padR, ih = H - padT - padB;
      var max = 0, i;
      for (i = 0; i < h.length; i++) if (h[i] > max) max = h[i];
      max = max || 1;
      var lo = e[0], hi = e[e.length - 1];
      function X(lz) { return padL + Math.max(0, Math.min(1, (lz - lo) / (hi - lo))) * iw; }

      var Zn = zones(c.z);
      var xCull = X(Math.log10(Zn.cull)), xFull = X(Math.log10(Zn.full));

      /* attenuated band, then the band that is removed outright */
      ctx.fillStyle = acc; ctx.globalAlpha = 0.08;
      ctx.fillRect(xCull, padT, Math.max(0, xFull - xCull), ih);
      ctx.globalAlpha = 0.20;
      ctx.fillRect(padL, padT, Math.max(0, xCull - padL), ih);
      ctx.globalAlpha = 1;

      for (i = 0; i < h.length; i++) {
        var x0 = X(e[i]), x1 = X(e[i + 1]);
        var bh = (h[i] / max) * ih;
        var gone = e[i + 1] <= Math.log10(Zn.dark);
        ctx.fillStyle = gone ? acc : soft;
        ctx.globalAlpha = gone ? 0.95 : 0.72;
        ctx.fillRect(x0, padT + ih - bh, Math.max(1, x1 - x0 - 0.5), bh);
      }
      ctx.globalAlpha = 1;

      ctx.strokeStyle = acc; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xCull, padT - 6); ctx.lineTo(xCull, padT + ih); ctx.stroke();

      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, padT + ih); ctx.lineTo(padL + iw, padT + ih); ctx.stroke();
      ctx.fillStyle = soft;
      ctx.fillText(W < 420 ? "SPLATS BY DEPTH × OPACITY"
                           : "BOTTOM-THIRD SPLATS BY DEPTH, WEIGHTED BY OPACITY", padL, 12);
      [[-2, "0.01"], [-1, "0.1"], [0, "1"], [1, "10"]].forEach(function (t) {
        var x = X(t[0]);
        if (x <= padL + 1 || x >= padL + iw - 1) return;
        ctx.textAlign = "center";
        ctx.fillText(t[1], x, padT + ih + 13);
        ctx.textAlign = "left";
      });
    }

    /* share of the bottom third's opacity that the near plane removes,
       integrated off the same histogram the panel draws */
    function removedShare(zn, d) {
      var Zn = zones(zn), ld = Math.log10(Zn.dark), lc = Math.log10(Zn.cull);
      var tot = 0, gone = 0;
      for (var i = 0; i < d.hist.length; i++) {
        tot += d.hist[i];
        if (d.edges[i + 1] <= ld) gone += d.hist[i];
      }
      return tot > 0 ? 100 * gone / tot : 0;
    }

    function paintCurve(ctx, W, H) {
      if (!S) return;
      var soft = css("--fg-soft"), acc = css("--accent"), line = css("--line"), fg = css("--fg");
      ctx.clearRect(0, 0, W, H);
      ctx.font = "10px " + css("--font");
      var d = S.data[pose], zs = S.znear;
      var padL = 30, padR = 8, padT = 22, padB = 22;
      var iw = W - padL - padR, ih = H - padT - padB;
      var maxY = 70;
      function X(i) { return padL + (i / (zs.length - 1)) * iw; }
      function Y(v) { return padT + ih - Math.min(v / maxY, 1) * ih; }

      ctx.strokeStyle = line; ctx.setLineDash([2, 4]);
      [0, 25, 50].forEach(function (t) {
        ctx.beginPath(); ctx.moveTo(padL, Y(t)); ctx.lineTo(padL + iw, Y(t)); ctx.stroke();
        ctx.fillStyle = soft; ctx.textAlign = "right";
        ctx.fillText(t + "%", padL - 6, Y(t) + 3); ctx.textAlign = "left";
      });
      ctx.setLineDash([]);

      ctx.beginPath();
      zs.forEach(function (z, i) {
        var v = d.holes[key(z)];
        if (i === 0) ctx.moveTo(X(i), Y(v)); else ctx.lineTo(X(i), Y(v));
      });
      ctx.strokeStyle = acc; ctx.lineWidth = 1.5; ctx.stroke();

      var sel = +ziIn.value;
      zs.forEach(function (z, i) {
        ctx.beginPath();
        ctx.arc(X(i), Y(d.holes[key(z)]), i === sel ? 4.5 : 2.5, 0, 6.2832);
        ctx.fillStyle = i === sel ? acc : soft;
        ctx.fill();
        if (i === 0 || i === zs.length - 1 || i === sel) {
          /* the end labels are anchored inwards so they cannot hang off the
             canvas on a narrow panel */
          ctx.fillStyle = soft;
          ctx.textAlign = i === 0 ? "left" : (i === zs.length - 1 ? "right" : "center");
          ctx.fillText(String(z), X(i), padT + ih + 14);
          ctx.textAlign = "left";
        }
      });
      ctx.fillStyle = soft;
      ctx.fillText(W < 420 ? "HOLES vs ZNEAR, MEASURED"
                           : "MEASURED BOTTOM-THIRD HOLES vs ZNEAR", padL, 12);
    }

    function sync() {
      var c = current(), z = c.z, d = c.d;
      img.src = MEDIA + "sweep/" + pose + "_" + file(z) + ".jpg";
      out.zn.textContent = z < 0.1 ? z.toFixed(3) : z.toFixed(2);
      out.cut.textContent = zones(z).cull.toFixed(4);
      out.removed.textContent = removedShare(z, d).toFixed(1) + "%";
      out.holes.textContent = d.holes[key(z)].toFixed(1) + "%";
      out.op.textContent = d.opacity[key(z)].toFixed(3);
      out.shotcap.textContent = d.name + " · znear " + z +
        (z === 0.2 ? " — the value that shipped" : "");
      var shipped = d.holes["0.2"], best = d.holes["0.01"];
      out.note.textContent = shipped < 1
        ? "This pose barely notices, even though the shipped near plane removes " +
          removedShare(0.2, d).toFixed(0) + "% of the opacity under it — there is enough " +
          "geometry behind to saturate the ray anyway. It is the kind of camera the cohort " +
          "means were full of, which is why the near plane looked innocent for so long."
        : "At the shipped near plane this pose loses " + shipped.toFixed(0) +
          "% of its bottom third; at 0.01 it loses " + best.toFixed(1) +
          "%. Nothing about the reconstruction changed between those two frames.";
      if (drawHist) drawHist();
      if (drawCurve) drawCurve();
    }

    getJSON(MEDIA + "sweep.json").then(function (s) {
      S = s; pose = S.poses[0];
      S.poses.forEach(function (p, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "sbtn" + (i === 0 ? " is-on" : "");
        b.textContent = S.data[p].name;
        b.addEventListener("click", function () {
          poseBox.querySelectorAll(".sbtn").forEach(function (o) { o.classList.remove("is-on"); });
          b.classList.add("is-on");
          pose = p; sync();
        });
        poseBox.appendChild(b);
      });
      drawHist = mount(hist, paintHist);
      drawCurve = mount(curve, paintCurve);
      ziIn.addEventListener("input", sync);
      sync();
    }).catch(function () {
      var rd = root.querySelector(".demo__read");
      if (rd) rd.textContent = "The near-plane sweep did not load.";
    });
  })();

  /* ============================================================
     04 — A COHORT MEAN, AND WHAT IT HIDES
     Real per-pose measurements. Drag the cohort size and watch the
     mean converge on a number that no single bad pose resembles.
     ============================================================ */
  (function () {
    var root = document.querySelector(".demo--tail");
    if (!root) return;
    var canvas = root.querySelector("canvas");
    var nIn = root.querySelector('[data-in="n"]');
    var out = {};
    root.querySelectorAll("[data-read]").forEach(function (n) { out[n.getAttribute("data-read")] = n; });
    var P = null, redraw = null;

    function draw(ctx, W, H) {
      if (!P) return;
      var fg = css("--fg"), soft = css("--fg-soft"), acc = css("--accent"), line = css("--line");
      ctx.clearRect(0, 0, W, H);
      ctx.font = "10px " + css("--font");
      var n = Math.min(+nIn.value, P.old.length);
      var padL = 34, padB = 30, padT = 22;
      var iw = W - padL - 10, ih = H - padB - padT;
      var max = 100;
      function Y(v) { return padT + ih - (v / max) * ih; }

      /* axis */
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      [0, 25, 50, 75, 100].forEach(function (t) {
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(padL, Y(t)); ctx.lineTo(padL + iw, Y(t)); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = soft; ctx.textAlign = "right";
        ctx.fillText(t + "%", padL - 6, Y(t) + 3);
      });
      ctx.textAlign = "left";

      var slot = iw / n, sum = 0, worst = 0;
      for (var i = 0; i < n; i++) {
        var v = P.old[i];
        sum += v; if (v > worst) worst = v;
        var x = padL + slot * i;
        ctx.fillStyle = v > 20 ? acc : soft;
        ctx.globalAlpha = v > 20 ? 1 : 0.55;
        ctx.fillRect(x, Y(v), Math.max(1, slot - 1), Y(0) - Y(v));
        ctx.globalAlpha = 1;
      }
      var mean = sum / n;
      ctx.strokeStyle = fg; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(padL, Y(mean)); ctx.lineTo(padL + iw, Y(mean)); ctx.stroke();
      ctx.fillStyle = fg;
      ctx.fillText("COHORT MEAN " + mean.toFixed(1) + "%", padL + 4, Y(mean) - 5);
      ctx.fillStyle = soft;
      ctx.fillText("EACH BAR IS ONE CAMERA POSE, BOTTOM-THIRD HOLES AT ZNEAR 0.2", padL, 12);

      out.n.textContent = n;
      out.mean.textContent = mean.toFixed(1) + "%";
      out.worst.textContent = worst.toFixed(1) + "%";
      var bad = P.old.slice(0, n).filter(function (v) { return v > 20; }).length;
      out.bad.textContent = bad + " of " + n;
      out.note.textContent = bad === 0
        ? "Nothing in this sample is bad enough to notice."
        : "The mean is " + mean.toFixed(1) + "%, which reads as a mild defect. " + bad +
          " of these " + n + " poses are above 20% and one is at " + worst.toFixed(1) +
          "% — and those are the poses somebody flying the viewer actually passes through.";
    }

    getJSON(MEDIA + "poses.json").then(function (p) {
      P = p;
      nIn.max = p.old.length;
      redraw = mount(canvas, draw);
      nIn.addEventListener("input", redraw);
      redraw();
    }).catch(function () {
      var rd = root.querySelector(".demo__read");
      if (rd) rd.textContent = "Pose measurements did not load.";
    });
  })();

  /* ============================================================
     05 — THE DEPTH-DISTORTION LOSS
     L = sum_{i,j} w_i w_j |t_i - t_j| is O(N^2) per ray as written.
     Walking front to back it collapses to
        L = sum_i w_i (t_i*A_i - B_i),  A_i = sum_{j<i} w_j,
                                        B_i = sum_{j<i} w_j t_j
     Both are evaluated here on the same weights, so the two totals
     can be compared directly.
     ============================================================ */
  (function () {
    var root = document.querySelector(".demo--dist");
    if (!root) return;
    var canvas = root.querySelector("canvas");
    var spreadIn = root.querySelector('[data-in="spread"]');
    var nIn = root.querySelector('[data-in="n"]');
    var out = {};
    root.querySelectorAll("[data-read]").forEach(function (n) { out[n.getAttribute("data-read")] = n; });
    var showPrefix = true;

    /* A slab of Gaussians on one ray. `spread` is its thickness; the total
       optical depth is held at TAU so both extremes end up equally opaque and
       the only thing that changes is how the same coverage is arranged —
       thin and dense, or thick and faint. Without that constraint the slider
       would be trading opacity for thickness and the two losses would not be
       comparable. */
    var TAU = 4;
    function build() {
      var N = +nIn.value, spread = +spreadIn.value;
      var t = [], g = [], gsum = 0, i, u, d;
      for (i = 0; i < N; i++) {
        u = N === 1 ? 0.5 : i / (N - 1);
        t.push(0.35 + u * 0.55);
        d = (u - 0.5) / Math.max(spread, 0.02);
        var gi = Math.exp(-0.5 * d * d);
        g.push(gi); gsum += gi;
      }
      var k = TAU / Math.max(gsum, 1e-9);
      var a = g.map(function (gi) { return 1 - Math.exp(-k * gi); });
      /* w_i = alpha_i * T_i, front to back */
      var w = [], T = 1;
      for (i = 0; i < N; i++) { w.push(a[i] * T); T *= (1 - a[i]); }
      return { t: t, a: a, w: w, T: T };
    }

    function draw(ctx, W, H) {
      var fg = css("--fg"), soft = css("--fg-soft"), acc = css("--accent"), line = css("--line");
      ctx.clearRect(0, 0, W, H);
      ctx.font = "10px " + css("--font");
      var S = build(), N = S.t.length;

      /* --- naive O(N^2) --- */
      var Lnaive = 0, ops = 0;
      for (var i = 0; i < N; i++) for (var j = 0; j < N; j++) {
        Lnaive += S.w[i] * S.w[j] * Math.abs(S.t[i] - S.t[j]); ops++;
      }
      Lnaive *= 0.5;   /* each unordered pair is counted twice above */

      /* --- prefix-sum O(N) --- */
      var Lfast = 0, A = 0, B = 0, ops2 = 0;
      var Aarr = [], Barr = [];
      for (i = 0; i < N; i++) {
        Aarr.push(A); Barr.push(B);
        Lfast += S.w[i] * (S.t[i] * A - B);
        A += S.w[i]; B += S.w[i] * S.t[i];
        ops2++;
      }

      /* --- layout: the ray, then the two accumulators --- */
      var padL = 10, padR = 10, iw = W - padL - padR;
      /* both panels are sized off the canvas so the figure fills whatever
         height the layout gives it rather than leaving a dead band */
      var rayY = 46, rayH = Math.max(70, Math.round(H * 0.42));
      function X(t) { return padL + ((t - 0.3) / 0.65) * iw; }

      ctx.fillStyle = soft;
      ctx.fillText("ONE RAY, FRONT TO BACK — HAIRLINE IS α, BARS ARE THE BLEND WEIGHT w = α·T", padL, 16);

      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, rayY + rayH); ctx.lineTo(padL + iw, rayY + rayH); ctx.stroke();

      /* the opacity profile first, as a hairline. It runs the whole length of
         the ray, which is what makes the point: the weights collapse to the
         front not because the slab ends but because T does. */
      var amax = Math.max.apply(null, S.a) || 1;
      ctx.beginPath();
      for (i = 0; i < N; i++) {
        var ax = X(S.t[i]), ay = rayY + rayH - (S.a[i] / amax) * rayH;
        if (i === 0) ctx.moveTo(ax, ay); else ctx.lineTo(ax, ay);
      }
      ctx.strokeStyle = soft; ctx.lineWidth = 1; ctx.globalAlpha = 0.35; ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = soft; ctx.globalAlpha = 0.55;
      ctx.fillText("α", X(S.t[N - 1]) + 4, rayY + rayH - (S.a[N - 1] / amax) * rayH + 3);
      ctx.globalAlpha = 1;

      var wmax = Math.max.apply(null, S.w) || 1;
      for (i = 0; i < N; i++) {
        var x = X(S.t[i]), hh = (S.w[i] / wmax) * rayH;
        ctx.fillStyle = soft; ctx.globalAlpha = 0.8;
        ctx.fillRect(x - 2, rayY + rayH - hh, 4, hh);
        ctx.globalAlpha = 1;
      }
      /* mean depth */
      var mean = B / Math.max(A, 1e-9);
      ctx.strokeStyle = acc; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X(mean), rayY - 4); ctx.lineTo(X(mean), rayY + rayH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = acc;
      ctx.fillText("MEAN DEPTH", X(mean) + 5, rayY - 4);

      /* --- the running prefix sums, which is what makes it O(N) --- */
      var pY = rayY + rayH + 44, pH = Math.max(44, H - (rayY + rayH + 44) - 22);
      ctx.fillStyle = soft;
      ctx.fillText("Aᵢ = Σ wⱼ (j<i)   AND   Bᵢ = Σ wⱼ tⱼ — BUILT IN ONE PASS", padL, pY - 10);
      ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(padL, pY + pH); ctx.lineTo(padL + iw, pY + pH); ctx.stroke();
      var Amax = A || 1;
      ctx.beginPath();
      for (i = 0; i < N; i++) {
        var xx = X(S.t[i]), yy = pY + pH - (Aarr[i] / Amax) * pH;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = soft; ctx.lineWidth = 1.4; ctx.stroke();
      var Bmax = B || 1;
      ctx.beginPath();
      for (i = 0; i < N; i++) {
        xx = X(S.t[i]); yy = pY + pH - (Barr[i] / Bmax) * pH;
        if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
      ctx.strokeStyle = acc; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = soft; ctx.fillText("A", padL + iw - 30, pY + 12);
      ctx.fillStyle = acc; ctx.fillText("B", padL + iw - 14, pY + 12);

      out.lnaive.textContent = Lnaive.toExponential(4);
      out.lfast.textContent = Lfast.toExponential(4);
      out.delta.textContent = Math.abs(Lnaive - Lfast) < 1e-12
        ? "identical to machine precision"
        : Math.abs(Lnaive - Lfast).toExponential(1);
      out.ops.textContent = ops.toLocaleString("en-US") + " vs " + ops2.toLocaleString("en-US");
      out.n.textContent = N;
      out.spread.textContent = (+spreadIn.value).toFixed(2);
      out.note.textContent = (+spreadIn.value) > 0.28
        ? "A thick, faint slab: the same total opacity spread over a long stretch of the ray, and the loss is large. This is what fog looks like to the regulariser."
        : "A thin, dense band: the same total opacity concentrated at one depth, and the loss falls towards zero. This is the arrangement the term is asking for.";
    }

    var redraw = mount(canvas, draw);
    [spreadIn, nIn].forEach(function (inp) { inp.addEventListener("input", redraw); });
  })();

  /* ============================================================
     06 — STRAIGHT UP FROM ONE FRAME
     Seven renders of the same asset from the same ground point at
     seven heights, so the reader can watch a drone's-eye view turn
     into a map. Nothing here is a zoom: the camera moves, the field
     of view is the drone's own lens throughout, and only rung 0 is
     a pose that was ever occupied.
     ============================================================ */
  (function () {
    var root = document.querySelector(".demo--ladder");
    if (!root) return;
    var rungIn = root.querySelector('[data-in="rung"]');
    var img = root.querySelector("[data-shot]");
    var gauge = root.querySelector(".ladder__gauge");
    var out = {};
    root.querySelectorAll("[data-read]").forEach(function (n) { out[n.getAttribute("data-read")] = n; });

    /* what actually comes into frame at each rung, checked against the
       renders rather than guessed */
    var NOTES = [
      "A registered frame at the drone's own altitude, rendered from its own recorded pose. Every view above this one was built out of thousands of frames like it.",
      "Above the crest. The trail the drone was following reads as a line, and the first streets appear past it.",
      "The crest of the hill end to end, the neighbourhood along one side, and still a horizon at the top of the frame.",
      "The hillside and the roads under it. What is left of the sky is a band across the top; two rungs up there is none.",
      "Both flanks of the ridge at once, which no single frame in the capture contains. The near side was flown; the far side was seen across the valley.",
      "Close to straight down. Individual houses, driveways and the whole trail network are still resolved.",
      "5.8 units across, from about nineteen times the height the drone was flying at. The flown area is 4.4 by 8.0, so this holds all of it one way and most of it the other."
    ];

    var E = null, ready = false;

    function rung() { return Math.max(0, Math.min(6, +rungIn.value)); }

    /* The gauge is a height axis, so it wants to be tall. Under 760px the
       layout stacks and the canvas becomes wide and short, and the same
       drawing squeezed into that box is unreadable — so below that aspect it
       lies down and height runs left to right instead. */
    function drawGauge(ctx, W, H) {
      if (!E) return;
      var soft = css("--fg-soft"), acc = css("--accent"), line = css("--line"), fg = css("--fg");
      ctx.clearRect(0, 0, W, H);
      ctx.font = "10px " + css("--font");
      var top = 2.15, sel = rung();
      var wide = W > H * 1.6;

      if (wide) {
        var padL = 64, padR = 30, base = H - 26, iw = W - padL - padR;
        var X = function (h) { return padL + iw * (h / top); };

        ctx.fillStyle = soft; ctx.globalAlpha = 0.18;
        ctx.fillRect(X(E.agl.p10), 24, X(E.agl.p90) - X(E.agl.p10), base - 24);
        ctx.globalAlpha = 1;

        ctx.strokeStyle = line; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, base); ctx.lineTo(W - 8, base); ctx.stroke();

        E.ladder.forEach(function (r, i) {
          var x = X(r.height);
          ctx.strokeStyle = i === sel ? acc : line;
          ctx.lineWidth = i === sel ? 1.6 : 1;
          ctx.beginPath();
          ctx.moveTo(x, base + 5); ctx.lineTo(x, base - (i === sel ? 22 : 5));
          ctx.stroke();
          if (i === sel) {
            ctx.fillStyle = acc;
            ctx.textAlign = x > W - 60 ? "right" : "left";
            ctx.fillText(r.height.toFixed(2), x + (x > W - 60 ? -6 : 6), base - 26);
            ctx.textAlign = "left";
          }
        });

        ctx.fillStyle = soft;
        ctx.textAlign = "right";
        ctx.fillText("GROUND", padL - 6, base + 4);
        ctx.textAlign = "left";
        /* above the tick row: the selected rung's marker is 22px tall and would
           otherwise be drawn straight through this line */
        ctx.fillText("WHERE THE DRONE FLEW \u00b7 " + E.agl.p10.toFixed(2) +
                     "\u2013" + E.agl.p90.toFixed(2), X(E.agl.p90) + 7, 34);
        ctx.fillStyle = fg;
        ctx.fillText("CAMERA HEIGHT, SCENE UNITS", 6, 14);
        return;
      }

      var padT = 20, padB = 26, x = 46;
      var ih = H - padT - padB;
      function Y(h) { return padT + ih * (1 - h / top); }

      /* the terrain, and the band the drone actually flew in */
      ctx.strokeStyle = line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - 18, Y(0)); ctx.lineTo(W - 8, Y(0)); ctx.stroke();
      ctx.fillStyle = soft; ctx.globalAlpha = 0.18;
      ctx.fillRect(x - 18, Y(E.agl.p90), W - 8 - (x - 18), Y(E.agl.p10) - Y(E.agl.p90));
      ctx.globalAlpha = 1;
      ctx.fillStyle = soft;
      ctx.fillText("GROUND", x - 22, Y(0) + 14);
      ctx.fillText("WHERE THE DRONE FLEW", x - 22, Y(E.agl.p90) - 6);
      ctx.fillText(E.agl.p10.toFixed(2) + "\u2013" + E.agl.p90.toFixed(2),
                   x - 22, Y(E.agl.p90) - 18);

      /* the ladder itself */
      ctx.strokeStyle = line;
      ctx.beginPath(); ctx.moveTo(x, Y(0)); ctx.lineTo(x, Y(top)); ctx.stroke();
      E.ladder.forEach(function (r, i) {
        var y = Y(r.height);
        ctx.strokeStyle = i === sel ? acc : line;
        ctx.lineWidth = i === sel ? 1.6 : 1;
        ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + (i === sel ? 16 : 5), y); ctx.stroke();
        if (i === sel) {
          ctx.fillStyle = acc;
          ctx.fillText(r.height.toFixed(2), x + 21, y + 3);
        }
      });
      ctx.fillStyle = fg;
      ctx.fillText("CAMERA HEIGHT", x - 22, 12);
    }

    var redrawGauge = null;

    function sync() {
      if (!ready) return;
      var i = rung(), r = E.ladder[i];
      img.src = MEDIA + "ladder/" + i + ".jpg";
      img.alt = "The reconstruction seen from " + r.height.toFixed(2) +
                " scene units above one recorded drone pose";
      out.h.textContent = r.height.toFixed(2);
      out.alt.textContent = (r.height / E.agl.median).toFixed(1) + "×";
      out.span.textContent = r.frame_width.toFixed(1);
      out.note.textContent = NOTES[i];
      if (redrawGauge) redrawGauge();
    }

    getJSON(MEDIA + "extent.json").then(function (e) {
      E = e; ready = true;
      redrawGauge = mount(gauge, drawGauge);
      rungIn.addEventListener("input", sync);
      sync();
    }).catch(function () {
      var rd = root.querySelector(".demo__read");
      if (rd) rd.textContent = "The altitude ladder did not load. Figure 2 shows the same climb as video.";
    });
  })();

})();
