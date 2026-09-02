/* ============================================================
   P.E.T.E.R — the playable bits.

   Four demos, all running the same algorithms the real pipeline
   runs, just smaller:
     1. trace   — grayscale, edge threshold, contour trace, RDP simplify
     2. chunks  — the gate/clamp/slice expressions, driven by a slider
     3. settle  — why a 2-frame settle threshold captured half-drawn frames
     4. timeline— what each upgrade actually changed

   No source frames ship with this page. The demo subject is drawn in
   code below so there is nothing copyrighted in the repo.
   ============================================================ */
(function () {
  "use strict";

  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  /* ==========================================================
     1. TRACE — the actual front half of the renderer
     ========================================================== */

  var TRACE = (function () {
    var W = 260, H = 200;           /* trace grid; small on purpose, like the real one */
    var cache = null;               /* contours are traced once, then only re-simplified */

    /* The subject. Drawn with paths and filled with colour, so that throwing
       the colour away in step 2 is something you can actually see — and so
       the page ships no video frames. */
    function drawSubject(ctx) {
      ctx.save();
      ctx.fillStyle = "#bcd8e6";                 /* sky */
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#8fbf7a";                 /* ground */
      ctx.fillRect(0, H * 0.76, W, H * 0.24);
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#000000";

      var cx = W / 2, cy = H / 2 + 8, r = 54;

      function shape(path, fill) {
        ctx.beginPath(); path(); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        ctx.stroke();
      }

      /* ears — filled before the head so the head overlaps them */
      shape(function () {
        ctx.moveTo(cx - r * 0.78, cy - r * 0.62);
        ctx.lineTo(cx - r * 0.95, cy - r * 1.55);
        ctx.lineTo(cx - r * 0.18, cy - r * 0.98);
      }, "#e08a3c");
      shape(function () {
        ctx.moveTo(cx + r * 0.78, cy - r * 0.62);
        ctx.lineTo(cx + r * 0.95, cy - r * 1.55);
        ctx.lineTo(cx + r * 0.18, cy - r * 0.98);
      }, "#e08a3c");

      /* head */
      shape(function () { ctx.ellipse(cx, cy, r, r * 0.88, 0, 0, Math.PI * 2); }, "#f0a952");

      /* eyes */
      shape(function () { ctx.ellipse(cx - 20, cy - 8, 8, 10, 0, 0, Math.PI * 2); }, "#ffffff");
      shape(function () { ctx.ellipse(cx + 20, cy - 8, 8, 10, 0, 0, Math.PI * 2); }, "#ffffff");
      ctx.fillStyle = "#1d2b21";
      ctx.beginPath(); ctx.arc(cx - 20, cy - 6, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 20, cy - 6, 3.4, 0, Math.PI * 2); ctx.fill();

      /* nose + mouth */
      shape(function () {
        ctx.moveTo(cx - 6, cy + 14); ctx.lineTo(cx + 6, cy + 14); ctx.lineTo(cx, cy + 21);
      }, "#d4626f");
      ctx.beginPath(); ctx.arc(cx - 9, cy + 24, 9, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 9, cy + 24, 9, 0, Math.PI); ctx.stroke();

      /* whiskers */
      [-1, 1].forEach(function (s) {
        [0, 8, 16].forEach(function (dy) {
          ctx.beginPath();
          ctx.moveTo(cx + s * 30, cy + 10 + dy * 0.5);
          ctx.lineTo(cx + s * 66, cy + 2 + dy);
          ctx.stroke();
        });
      });
      ctx.restore();
    }

    function grayscale(img) {
      var g = new Float32Array(W * H), d = img.data;
      for (var i = 0, p = 0; i < d.length; i += 4, p++) {
        g[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
      return g;
    }

    /* Sobel magnitude — same operator the tracer uses before thresholding */
    function sobel(g) {
      var out = new Float32Array(W * H);
      for (var y = 1; y < H - 1; y++) {
        for (var x = 1; x < W - 1; x++) {
          var i = y * W + x;
          var gx = -g[i - W - 1] - 2 * g[i - 1] - g[i + W - 1]
                   + g[i - W + 1] + 2 * g[i + 1] + g[i + W + 1];
          var gy = -g[i - W - 1] - 2 * g[i - W] - g[i - W + 1]
                   + g[i + W - 1] + 2 * g[i + W] + g[i + W + 1];
          out[i] = Math.sqrt(gx * gx + gy * gy);
        }
      }
      return out;
    }

    function binarize(mag, t) {
      var b = new Uint8Array(W * H);
      for (var i = 0; i < mag.length; i++) b[i] = mag[i] > t ? 1 : 0;
      return b;
    }

    /* Moore-neighbourhood border following, clockwise from the backtrack */
    var DIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];

    function traceContours(bin) {
      var visited = new Uint8Array(W * H), out = [];
      for (var y = 1; y < H - 1; y++) {
        for (var x = 1; x < W - 1; x++) {
          var i = y * W + x;
          if (!bin[i] || visited[i]) continue;
          if (bin[i - 1] && bin[i + 1] && bin[i - W] && bin[i + W]) continue; /* interior */
          var c = walk(bin, visited, x, y);
          if (c.length > 14) out.push(c);
        }
      }
      return out;
    }

    function walk(bin, visited, sx, sy) {
      var contour = [], cx = sx, cy = sy, back = 4, steps = 0;
      do {
        contour.push([cx, cy]);
        visited[cy * W + cx] = 1;
        var found = false;
        for (var k = 1; k <= 8; k++) {
          var d = (back + k) % 8;
          var nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          if (bin[ny * W + nx]) {
            back = (d + 4) % 8;
            cx = nx; cy = ny; found = true;
            break;
          }
        }
        if (!found) break;
      } while ((cx !== sx || cy !== sy) && ++steps < 12000);
      return contour;
    }

    /* Ramer–Douglas–Peucker, iterative so a long contour cannot blow the stack */
    function rdp(pts, eps) {
      if (pts.length < 3) return pts.slice();
      var keep = new Uint8Array(pts.length);
      keep[0] = keep[pts.length - 1] = 1;
      var stack = [[0, pts.length - 1]];
      while (stack.length) {
        var seg = stack.pop(), a = seg[0], b = seg[1];
        if (b - a < 2) continue;
        var ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
        var dx = bx - ax, dy = by - ay;
        var len = Math.hypot(dx, dy) || 1;
        var best = -1, bi = -1;
        for (var i = a + 1; i < b; i++) {
          var d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
          if (d > best) { best = d; bi = i; }
        }
        if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
      }
      var out = [];
      for (var j = 0; j < pts.length; j++) if (keep[j]) out.push(pts[j]);
      return out;
    }

    function compute() {
      if (cache) return cache;
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      drawSubject(ctx);
      var img = ctx.getImageData(0, 0, W, H);
      var gray = grayscale(img);
      var mag = sobel(gray);
      var bin = binarize(mag, 110);
      var contours = traceContours(bin);
      var raw = contours.reduce(function (s, c2) { return s + c2.length; }, 0);
      cache = { source: c, gray: gray, mag: mag, bin: bin, contours: contours, rawPoints: raw };
      return cache;
    }

    function init(host) {
      var canvas = $(".demo__canvas", host);
      var ctx = canvas.getContext("2d");
      var stepBtns = [].slice.call(host.querySelectorAll("[data-step]"));
      var epsWrap = $(".demo__eps", host);
      var eps = $("input[type=range]", host);
      var readPts = $("[data-read=points]", host);
      var readDrop = $("[data-read=drop]", host);
      var readNote = $("[data-read=note]", host);
      var step = 0;

      var NOTES = [
        "The frame as it arrives, straight out of the decoder.",
        "Colour is thrown away first — nothing downstream uses it.",
        "Sobel gives an edge strength per pixel. Bright means “something changes here”.",
        "Threshold it, then walk each border pixel-by-pixel to get ordered outlines.",
        "Straight runs get collapsed. This is the slider that decides how much Desmos has to swallow."
      ];

      function paint() {
        var d = compute();
        var w = canvas.width, h = canvas.height;
        ctx.save();
        ctx.fillStyle = css("--bg") || "#100904";
        ctx.fillRect(0, 0, w, h);
        var scale = Math.min(w / W, h / H);
        var ox = (w - W * scale) / 2, oy = (h - H * scale) / 2;
        ctx.translate(ox, oy); ctx.scale(scale, scale);

        if (step === 0) {
          ctx.drawImage(d.source, 0, 0);
        } else if (step === 1 || step === 2) {
          var src = step === 1 ? d.gray : d.mag;
          var max = step === 1 ? 255 : 400;
          var img = ctx.createImageData(W, H);
          for (var i = 0; i < W * H; i++) {
            var v = Math.max(0, Math.min(255, (src[i] / max) * 255));
            if (step === 2) v = 255 - v;           /* edges dark on light, like the source */
            img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
            img.data[i * 4 + 3] = 255;
          }
          /* putImageData ignores the transform, so stage through a canvas */
          var tmp = document.createElement("canvas");
          tmp.width = W; tmp.height = H;
          tmp.getContext("2d").putImageData(img, 0, 0);
          ctx.drawImage(tmp, 0, 0);
        } else {
          ctx.fillStyle = css("--bg") || "#100904";
          ctx.fillRect(0, 0, W, H);
          var simplify = step === 4;
          var e = parseFloat(eps.value);
          var total = 0;
          ctx.strokeStyle = css("--accent") || "#dc5000";
          ctx.lineWidth = 1.1;
          ctx.lineJoin = "round";
          d.contours.forEach(function (c) {
            var pts = simplify ? rdp(c, e) : c;
            total += pts.length;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.closePath();
            ctx.stroke();
            if (simplify && e >= 1.4) {         /* show the vertices Desmos actually stores */
              ctx.fillStyle = css("--fg") || "#ffedd7";
              for (var j = 0; j < pts.length; j++) ctx.fillRect(pts[j][0] - 0.9, pts[j][1] - 0.9, 1.8, 1.8);
            }
          });
          readPts.textContent = total.toLocaleString("en-US");
          readDrop.textContent = simplify
            ? "−" + Math.round(100 - (total / d.rawPoints) * 100) + "% vs raw"
            : "raw trace";
        }
        ctx.restore();

        if (step < 3) {
          readPts.textContent = "—";
          readDrop.textContent = d.contours.length + " outlines found";
        }
        readNote.textContent = NOTES[step];
        epsWrap.hidden = step !== 4;
        stepBtns.forEach(function (b, i) {
          b.classList.toggle("is-on", i === step);
          b.setAttribute("aria-pressed", i === step ? "true" : "false");
        });
      }

      function size() {
        var r = canvas.getBoundingClientRect();
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        paint();
      }

      stepBtns.forEach(function (b, i) {
        b.addEventListener("click", function () { step = i; paint(); });
      });
      eps.addEventListener("input", function () {
        $("[data-read=epsval]", host).textContent = parseFloat(eps.value).toFixed(1) + " px";
        paint();
      });

      size();
      var t = null;
      window.addEventListener("resize", function () {
        clearTimeout(t); t = setTimeout(size, 150);
      }, { passive: true });
      new MutationObserver(paint).observe(document.documentElement,
        { attributes: true, attributeFilter: ["data-theme"] });
    }

    return { init: init };
  })();

  /* ==========================================================
     2. CHUNKS — the gate / clamp / slice expressions, live
     ========================================================== */

  function initChunks(host) {
    var slider = $("input[type=range]", host);
    var cards = [].slice.call(host.querySelectorAll(".chunk"));
    var nOut = $("[data-read=n]", host);
    var CHUNK = 10;

    function update() {
      var n = parseInt(slider.value, 10);
      nOut.textContent = n;
      cards.forEach(function (card, idx) {
        var lo = idx * CHUNK + 1, hi = lo + CHUNK - 1;
        var on = n >= lo && n <= hi;
        card.classList.toggle("chunk--on", on);

        var j = Math.min(Math.max(n - idx * CHUNK, 1), CHUNK);
        $("[data-f=gate]", card).textContent = on ? "1" : "undefined";
        $("[data-f=idx]", card).textContent = j;
        $("[data-f=state]", card).textContent = on
          ? "draws frame " + n
          : "blank — curve undefined";

        /* light the tick for the frame this chunk is holding */
        var ticks = card.querySelectorAll(".chunk__ticks i");
        for (var t = 0; t < ticks.length; t++) {
          ticks[t].classList.toggle("is-now", on && t === j - 1);
        }
      });
    }
    slider.addEventListener("input", update);
    update();
  }

  /* ==========================================================
     3. SETTLE — why stable=2 shipped half-drawn frames
     ========================================================== */

  function initSettle(host) {
    var live = $("[data-canvas=live]", host);
    var shot = $("[data-canvas=shot]", host);
    var track = $(".settle__track", host);
    var mark = $(".settle__mark", host);
    var runBtn = $("[data-act=run]", host);
    var verdict = $("[data-read=verdict]", host);
    var thrOut = $("[data-read=thr]", host);
    var slider = $("input[type=range]", host);
    var raf = 0;

    /* One "Desmos update". Background lands, then it stalls for ~55 ms in the
       middle, then the character lands. The stall is the whole bug: it is
       longer than 2 frames (33 ms) but shorter than 4 (67 ms), which is exactly
       why stable=2 shipped broken frames and stable=4 did not.
       Times are real milliseconds; SLOW only stretches the animation so a
       human can watch something that actually happens in a tenth of a second. */
    var TOTAL = 320, DONE = 95, SLOW = 9;
    var STAGES = [
      { at: 0,  draw: "bg" },     /* grid */
      { at: 20, draw: "bg2" },    /* axes — then it stalls until 75 */
      { at: 75, draw: "char" },
      { at: 95, draw: "detail" }
    ];

    function paint(ctx, upto, w, h) {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = css("--bg") || "#100904";
      ctx.fillRect(0, 0, w, h);
      var S = Math.min(w, h) / 100;
      ctx.strokeStyle = css("--fg-soft") || "#6c5f51";
      ctx.lineWidth = 1;
      /* background: axes + grid, the part that redraws fast */
      if (upto >= 0) {
        for (var g = 10; g < 100; g += 10) {
          ctx.beginPath(); ctx.moveTo(g * S, 0); ctx.lineTo(g * S, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, g * S); ctx.lineTo(w, g * S); ctx.stroke();
        }
      }
      if (upto >= 20) {
        ctx.strokeStyle = css("--line") || "#40372e";
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
      }
      /* the character: the part that arrives late */
      ctx.strokeStyle = css("--accent") || "#dc5000";
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      if (upto >= 75) {
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, 26 * S, 22 * S, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w / 2 - 20 * S, h / 2 - 15 * S);
        ctx.lineTo(w / 2 - 25 * S, h / 2 - 34 * S);
        ctx.lineTo(w / 2 - 5 * S, h / 2 - 22 * S);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w / 2 + 20 * S, h / 2 - 15 * S);
        ctx.lineTo(w / 2 + 25 * S, h / 2 - 34 * S);
        ctx.lineTo(w / 2 + 5 * S, h / 2 - 22 * S);
        ctx.stroke();
      }
      if (upto >= 95) {
        ctx.beginPath(); ctx.arc(w / 2 - 9 * S, h / 2 - 3 * S, 2.2 * S, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(w / 2 + 9 * S, h / 2 - 3 * S, 2.2 * S, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(w / 2, h / 2 + 8 * S, 6 * S, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      }
    }

    function fit(c) {
      var r = c.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
    }

    function lastChangeBefore(t) {
      var v = -1;
      STAGES.forEach(function (s) { if (s.draw && s.at <= t) v = s.at; });
      return v;
    }

    function run() {
      fit(live); fit(shot);
      var lctx = live.getContext("2d"), sctx = shot.getContext("2d");
      var thr = parseInt(slider.value, 10);
      var FRAME = 16.7;
      /* how long the settle counter has to sit quiet, in ms */
      var quietNeeded = thr * FRAME;
      /* first moment where nothing has changed for quietNeeded ms */
      var capturedAt = null;
      for (var t = 0; t <= TOTAL; t += FRAME) {
        var last = lastChangeBefore(t);
        if (last >= 0 && t - last >= quietNeeded) { capturedAt = t; break; }
      }
      if (capturedAt === null) capturedAt = TOTAL;

      mark.style.left = (capturedAt / TOTAL * 100) + "%";
      thrOut.textContent = thr;

      var complete = capturedAt >= DONE;
      paint(sctx, capturedAt, shot.width, shot.height);
      verdict.innerHTML = complete
        ? "Settled at <b>" + Math.round(capturedAt) + " ms</b>, after the update finished. " +
          "This frame is right."
        : "Settled at <b>" + Math.round(capturedAt) + " ms</b>, in the middle of the stall. " +
          "Grid and axes are drawn, the character is not. <b>This is the frame that ships.</b>";
      host.classList.toggle("is-bad", !complete);

      if (reduce) { paint(lctx, TOTAL, live.width, live.height); return; }
      cancelAnimationFrame(raf);
      var start = performance.now();
      raf = requestAnimationFrame(function step(now) {
        var t2 = Math.min(TOTAL, (now - start) / SLOW);
        paint(lctx, t2, live.width, live.height);
        if (t2 < TOTAL) raf = requestAnimationFrame(step);
      });
    }

    runBtn.addEventListener("click", run);
    slider.addEventListener("input", run);
    /* everything left of DONE is a frame that is still missing linework */
    track.style.setProperty("--done", (DONE / TOTAL * 100) + "%");
    run();
    new MutationObserver(run).observe(document.documentElement,
      { attributes: true, attributeFilter: ["data-theme"] });
  }

  /* ==========================================================
     4. TIMELINE — what each upgrade actually bought
     ========================================================== */

  var VERSIONS = [
    {
      tag: "v0", name: "First one that worked",
      blurb: "Serial screenshots, settle threshold of 2, harvest that quietly threw away " +
             "every Short, and two channel handles I had guessed at instead of checking.",
      bars: [["Render, 13.8 s clip", 171.6, 171.6, "s"],
             ["Frames matching converged output", 1, 40, "of 40"],
             ["Candidates per harvest run", 81, 120, ""]]
    },
    {
      tag: "v1", name: "Parallel capture",
      blurb: "Profiled it expecting the tracer to be the problem. The tracer was 4%. " +
             "Screenshotting was 94%, one frame at a time in a single browser page.",
      bars: [["Render, 13.8 s clip", 110.4, 171.6, "s"],
             ["Frames matching converged output", 1, 40, "of 40"],
             ["Candidates per harvest run", 81, 120, ""]]
    },
    {
      tag: "v2", name: "Settle fix",
      blurb: "Parallel capture disagreed with serial, so I assumed parallel was broken. " +
             "Serial was the broken one — it had been screenshotting half-finished frames " +
             "for months, perfectly consistently.",
      bars: [["Render, 13.8 s clip", 110.4, 171.6, "s"],
             ["Frames matching converged output", 40, 40, "of 40"],
             ["Candidates per harvest run", 81, 120, ""]]
    },
    {
      tag: "v3", name: "Shorts harvest",
      blurb: "yt-dlp reports no duration for Shorts, and my length filter dropped anything " +
             "without one. Shorts are under 60 s by definition, which is exactly what I was " +
             "looking for.",
      bars: [["Render, 13.8 s clip", 110.4, 171.6, "s"],
             ["Frames matching converged output", 40, 40, "of 40"],
             ["Candidates per harvest run", 120, 120, ""]]
    },
    {
      tag: "v4", name: "Dialogue linking",
      blurb: "Performance data was keyed by Instagram's re-encoded copy, source data by render " +
             "tag, and nothing joined them. Matching on transcript overlap finally closed the loop.",
      bars: [["Render, 13.8 s clip", 110.4, 171.6, "s"],
             ["Frames matching converged output", 40, 40, "of 40"],
             ["Candidates per harvest run", 120, 120, ""]],
      extra: ["Posts linked to their source", "56 of 68", "was 26 of 68"]
    }
  ];

  function initTimeline(host) {
    var steps = [].slice.call(host.querySelectorAll("[data-v]"));
    var name = $("[data-read=vname]", host);
    var blurb = $("[data-read=vblurb]", host);
    var barWrap = $(".tl__bars", host);
    var extra = $(".tl__extra", host);
    var i = 0;

    function render() {
      var v = VERSIONS[i];
      name.textContent = v.tag + " — " + v.name;
      blurb.textContent = v.blurb;

      barWrap.innerHTML = v.bars.map(function (b) {
        var label = b[0], val = b[1], max = b[2], unit = b[3];
        var pct = Math.max(2, (val / max) * 100);
        /* lower is better for render time; higher is better for the other two */
        var good = label.indexOf("Render") === 0 ? val <= max * 0.7 : val >= max;
        return '<div class="tl__bar">' +
                 '<span class="tl__bl">' + label + '</span>' +
                 '<span class="tl__btrack"><i style="width:' + pct.toFixed(1) + '%"' +
                   (good ? ' class="is-good"' : '') + '></i></span>' +
                 '<span class="tl__bv">' + val + (unit ? " " + unit : "") + '</span>' +
               '</div>';
      }).join("");

      if (v.extra) {
        extra.hidden = false;
        extra.innerHTML = '<span class="tl__ek">' + v.extra[0] + '</span>' +
                          '<span class="tl__ev">' + v.extra[1] + '</span>' +
                          '<span class="tl__eo">' + v.extra[2] + '</span>';
      } else { extra.hidden = true; }

      steps.forEach(function (s, k) {
        s.classList.toggle("is-on", k === i);
        s.classList.toggle("is-done", k < i);
        s.setAttribute("aria-selected", k === i ? "true" : "false");
      });
    }

    steps.forEach(function (s, k) {
      s.addEventListener("click", function () { i = k; render(); });
      s.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" && i < steps.length - 1) { i++; render(); steps[i].focus(); }
        if (e.key === "ArrowLeft" && i > 0) { i--; render(); steps[i].focus(); }
      });
    });
    render();
  }

  /* ---------- boot ---------- */
  var boot = [
    [".demo--trace", TRACE.init],
    [".demo--chunks", initChunks],
    [".demo--settle", initSettle],
    [".demo--timeline", initTimeline]
  ];
  boot.forEach(function (b) {
    var host = document.querySelector(b[0]);
    if (host) { try { b[1](host); } catch (e) { host.hidden = true; } }
  });
})();
