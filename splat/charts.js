/* ============================================================
   FPV Gaussian Splatting — figures.
   Inline SVG drawn from window.SPLAT (data.js), styled entirely
   through CSS classes so every figure follows the light/dark
   toggle with no redraw. Re-rendered on resize at a 1:1 viewBox
   so 10 px labels stay 10 px on a phone.
   Palette rule (ORYZO): --fg-soft carries the mass, --accent is a
   hairline — strokes, thin bars and annotation only.
   ============================================================ */
(function () {
  var D = window.SPLAT;
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
  function r(n) { return Math.round(n * 100) / 100; }
  function rect(x, y, w, h, cls) {
    return el("rect", { x: r(x), y: r(y), width: r(Math.max(0, w)), height: r(Math.max(0, h)), "class": cls });
  }
  function line(x1, y1, x2, y2, cls) {
    return el("line", { x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), "class": cls });
  }
  function circ(cx, cy, rr, cls) {
    return el("circle", { cx: r(cx), cy: r(cy), r: r(rr), "class": cls });
  }
  function text(x, y, str, cls, anchor) {
    return el("text", { x: r(x), y: r(y), "class": "c-t " + (cls || ""), "text-anchor": anchor || "start" }, esc(str));
  }
  function svg(w, h, body) {
    return el("svg", {
      viewBox: "0 0 " + r(w) + " " + r(h),
      width: "100%", height: h,
      role: "img", "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet"
    }, body);
  }
  function fmt(n) { return n.toLocaleString("en-US"); }

  /* ---------- headings ----------
     SVG text does not wrap, so a long heading is simply clipped by the
     viewBox on a phone. Wrap it here instead and report how much taller the
     header became so each layout can push its plot area down. 10 px uppercase
     Plus Jakarta runs a shade over 6 px a character. */
  function wrapText(str, w) {
    var max = Math.max(14, Math.floor(w / 6.15));
    if (str.length <= max) return [str];
    var lines = [], cur = "";
    str.split(" ").forEach(function (word) {
      if (!cur.length) { cur = word; }
      else if ((cur + " " + word).length <= max) { cur += " " + word; }
      else { lines.push(cur); cur = word; }
    });
    if (cur.length) lines.push(cur);
    return lines;
  }
  /* the same wrap for the footnote under a plot, which the layouts place by
     hand; returns the lines so the caller can widen its bottom margin */
  function noteLines(str, w, x) { return wrapText(str, w - x); }
  function drawNote(lines, x, y) {
    var out = "";
    lines.forEach(function (ln, i) { out += text(x, y + i * 13, ln, "", "start"); });
    return out;
  }
  function head(w, title, sub) {
    var y = 16, out = "";
    wrapText(title, w).forEach(function (ln) { out += text(0, y, ln, "c-t--fg", "start"); y += 14; });
    if (sub) wrapText(sub, w).forEach(function (ln) { out += text(0, y, ln, "", "start"); y += 14; });
    /* every layout below was written against a header two lines deep */
    return { s: out, dy: Math.max(0, (y - 14) - 30) };
  }

  /* ============================================================
     F1 — cross-session links: the evidence gathered before
     committing eighteen hours of mapper time
     ============================================================ */
  function crossLinks(w) {
    var c = D.colmap.cross, rows = c.clip_pairs;
    var narrow = w < 560;
    var m = { t: 34, r: 60, b: 30, l: narrow ? 84 : 108 };
    var H = head(w, "Verified two-view matches between a hilltop frame and a cemetery frame, by clip pair", null);
    m.t += H.dy;
    var note = noteLines(fmt(c.usable_links) + " usable links in total · " +
      c.hilltop_frames_linked + " hilltop and " + c.cemetery_frames_linked +
      " cemetery frames touched", w, m.l);
    m.b += (note.length - 1) * 13;
    var rowH = 24, h = m.t + rows.length * rowH + m.b;
    var iw = w - m.l - m.r;
    var max = rows[0][1];
    var s = H.s;
    rows.forEach(function (row, i) {
      var y = m.t + i * rowH;
      s += text(m.l - 12, y + 13, row[0], "", "end");
      s += rect(m.l, y + 3, (row[1] / max) * iw, 13, i === 0 ? "c-bar--hi" : "c-bar");
      s += text(m.l + (row[1] / max) * iw + 8, y + 13, fmt(row[1]), "c-t--fg c-t--n", "start");
    });
    var base = m.t + rows.length * rowH + 2;
    s += line(m.l, base, m.l + iw, base, "c-axis");
    s += drawNote(note, m.l, base + 16);
    return svg(w, h, s);
  }

  /* ============================================================
     F2 — one line in the viewer, ten cohorts.
     Slope marks: shipped value, fixed value, and the worst pose
     in each cohort as a hairline whisker.
     ============================================================ */
  function znearCohorts(w) {
    var rows = D.znear.cohorts;
    var narrow = w < 640;
    var m = { t: 46, r: 16, b: 40, l: narrow ? 8 : 168 };
    var H = head(w, "Bottom-third holes, same splats and same cameras — only znear changed",
                 "bar = cohort mean · tick = worst single pose in that cohort");
    m.t += H.dy;
    var rowH = narrow ? 46 : 34;
    var h = m.t + rows.length * rowH + m.b;
    var iw = w - m.l - m.r;
    var max = 95;                                   // % holes, fixed axis
    function X(v) { return m.l + (v / max) * iw; }

    var s = H.s;

    /* axis */
    var base = m.t + rows.length * rowH - 8;
    s += line(m.l, base, m.l + iw, base, "c-axis");
    [0, 20, 40, 60, 80].forEach(function (t) {
      s += line(X(t), m.t - 10, X(t), base, "c-grid");
      s += text(X(t), base + 16, t + "%", "c-t--n", "middle");
    });

    rows.forEach(function (row, i) {
      var y = m.t + i * rowH;
      var lbl = row.scene + " · " + row.cohort + " (n=" + row.n + ")";
      var delta = row.old.toFixed(1) + "% → " + row.fix.toFixed(1) + "%";
      if (narrow) s += text(m.l, y - 4, lbl, "c-t--fg", "start");
      else s += text(m.l - 14, y + 12, lbl, "c-t--fg", "end");
      var yb = narrow ? y + 6 : y;
      /* shipped */
      s += rect(m.l, yb + 2, X(row.old) - m.l, 10, "c-bar");
      s += line(X(row.worst_old), yb, X(row.worst_old), yb + 14, "c-ref");
      /* fixed */
      s += rect(m.l, yb + 15, Math.max(X(row.fix) - m.l, 1), 6, "c-bar--hi");
      /* narrow: the bars start at the left margin, so a label placed past the
         longest of them runs off the canvas — park it on the caption line */
      if (narrow) s += text(m.l + iw, y - 4, delta, "c-t--acc c-t--n", "end");
      else s += text(Math.max(X(row.old), X(row.worst_old)) + 8, yb + 11, delta,
                     "c-t--acc c-t--n", "start");
    });
    s += text(m.l, h - 6, D.znear.poses_regressed + " of " + D.znear.poses_total +
      " poses got worse", "c-t--fg", "start");
    return svg(w, h, s);
  }

  /* ============================================================
     F3 — the ablation. Detail retained on the left, the splat
     budget the run actually used on the right.
     ============================================================ */
  function ablation(w) {
    var runs = D.ablation.runs;
    var narrow = w < 620;
    /* narrow puts the run name above its bar, which needs clearance the wide
       layout does not */
    var m = { t: narrow ? 54 : 40, r: 8, b: 44, l: narrow ? 8 : 220 };
    var H = head(w, "Bottom-third detail retained vs ground truth — five interventions, one LR schedule",
                 "dashed rule = the 8M control");
    m.t += H.dy;
    var rowH = narrow ? 52 : 40;
    var h = m.t + runs.length * rowH + m.b;
    var iw = w - m.l - m.r;
    var barW = iw * (narrow ? 1 : 0.62);
    var max = 24;
    var ctrl = runs[0].detail;

    var s = H.s;

    var base = m.t + runs.length * rowH - 10;
    s += line(m.l + (ctrl / max) * barW, m.t - 8, m.l + (ctrl / max) * barW, base, "c-ref");

    runs.forEach(function (run, i) {
      var y = m.t + i * rowH;
      var lbl = run.id + " · " + run.label;
      if (narrow) s += text(m.l, y - 2, lbl, run.hi ? "c-t--acc" : "c-t--fg", "start");
      else s += text(m.l - 14, y + 13, lbl, run.hi ? "c-t--acc" : "c-t--fg", "end");
      var yb = narrow ? y + 6 : y;
      s += rect(m.l, yb + 2, (run.detail / max) * barW, 16, run.hi ? "c-bar--hi" : "c-bar");
      s += text(m.l + (run.detail / max) * barW + 8, yb + 15, run.detail.toFixed(1) + "%",
                (run.hi ? "c-t--acc" : "c-t--fg") + " c-t--n", "start");
      s += text(m.l, yb + 32, fmt(run.splats) + " splats · " + run.wall_min +
        " min · " + run.note, "", "start");
    });
    s += line(m.l, base, m.l + barW, base, "c-axis");
    [0, 5, 10, 15, 20].forEach(function (t) {
      s += text(m.l + (t / max) * barW, base + 16, t + "%", "c-t--n", "middle");
    });
    return svg(w, h, s);
  }

  /* ============================================================
     F4 — near vs far at matched content difficulty.
     The flat ratio across every band is the signature of a scale
     problem rather than a content one.
     ============================================================ */
  function bands(w) {
    var C0 = D.ablation.bands.C0, P2 = D.ablation.bands.P2;
    var narrow = w < 560;
    var m = { t: 46, r: 12, b: 56, l: narrow ? 8 : 118 };
    var H = head(w, "Detail retained, near field vs far field, at matched ground-truth texture",
                 "8×8 blocks binned by their own GT high-frequency energy · control run");
    m.t += H.dy;
    var note = noteLines("Near-field ground truth carries " + D.ablation.gt_texture_ratio +
      "× the high-frequency energy of the far field, which is why the unbinned number misleads",
      w, narrow ? 8 : 118);
    m.b += (note.length - 1) * 13;
    var rowH = narrow ? 62 : 50;
    var h = m.t + C0.length * rowH + m.b;
    var iw = w - m.l - m.r;
    var max = 50;
    var s = H.s;

    C0.forEach(function (b, i) {
      var y = m.t + i * rowH;
      var lbl = b[0].toFixed(3) + "–" + b[1].toFixed(3);
      if (narrow) s += text(m.l, y - 4, "GT texture " + lbl, "", "start");
      else s += text(m.l - 14, y + 14, lbl, "", "end");
      var yb = narrow ? y + 6 : y;
      var nw = (b[2] / max) * iw, fw = (b[3] / max) * iw;
      s += rect(m.l, yb + 2, nw, 12, "c-bar--hi");
      s += text(m.l + nw + 8, yb + 12, "near " + b[2].toFixed(1) + "%", "c-t--acc c-t--n", "start");
      s += rect(m.l, yb + 18, fw, 12, "c-bar");
      s += text(m.l + fw + 8, yb + 28, "far " + b[3].toFixed(1) + "%", "c-t--fg c-t--n", "start");
      /* the ratio, which is the point of the figure */
      s += text(m.l, yb + 42, "ratio " + (b[2] / b[3]).toFixed(2) +
        "   ·   after the fix: " + P2[i][2].toFixed(1) + "% / " + P2[i][3].toFixed(1) +
        "% = " + (P2[i][2] / P2[i][3]).toFixed(2), "", "start");
    });
    var base = m.t + C0.length * rowH - 8;
    s += line(m.l, base, m.l + iw, base, "c-axis");
    [0, 10, 20, 30, 40, 50].forEach(function (t) {
      s += text(m.l + (t / max) * iw, base + 16, t + "%", "c-t--n", "middle");
    });
    s += drawNote(note, m.l, h - 8 - (note.length - 1) * 13);
    return svg(w, h, s);
  }

  /* ============================================================
     F5 — two metrics that both sound like quality, moving in
     opposite directions. Texture up, coverage down.
     ============================================================ */
  function exportCap(w) {
    var f = D.final_run, a = f.assets;
    var narrow = w < 620;
    var H = head(w, "The 60k run improved texture and lost coverage — the export cap is where it happened", null);
    var note = noteLines("Holes bar is clipped at 20%. Doubling the trained splat count while holding the export cap at 3M keeps " +
      f.keep.new + "% instead of " + f.keep.old + "%.", w, 0);
    var rowH = 96;
    var body = narrow ? (14 + a.length * rowH) : 214;
    var h = 44 + H.dy + body + 22 + note.length * 13;
    var s = "";

    if (narrow) {
      /* one block per asset, the two bars sharing a left gutter */
      var bx = 74, bw = w - bx - 96;
      a.forEach(function (x, i) {
        var y0 = 14 + i * rowH;
        if (i) s += line(0, y0 - 2, w, y0 - 2, "c-grid");
        s += text(0, y0 + 10, x.k, x.shipped ? "c-t--acc" : "c-t--fg", "start");
        if (x.shipped) s += text(w, y0 + 10, "shipped", "c-t--acc", "end");
        s += text(0, y0 + 26, fmt(x.splats) + " splats exported", "", "start");
        s += text(0, y0 + 50, "opacity", "", "start");
        s += rect(bx, y0 + 41, bw, 10, "c-band");
        s += rect(bx, y0 + 41, bw * x.opacity, 10, x.shipped ? "c-bar--hi" : "c-bar");
        s += text(bx + bw + 8, y0 + 50, x.opacity.toFixed(3), "c-t--fg c-t--n", "start");
        s += text(0, y0 + 70, "holes", "", "start");
        s += rect(bx, y0 + 61, bw, 10, "c-band");
        s += rect(bx, y0 + 61, bw * Math.min(x.holes / 20, 1), 10, x.holes > 1 ? "c-bar--hi" : "c-bar");
        s += text(bx + bw + 8, y0 + 70, x.holes.toFixed(1) + "%", "c-t--fg c-t--n", "start");
        s += text(0, y0 + 84, "worst pose " + x.worst.toFixed(1) + "%",
                  x.worst > 5 ? "c-t--acc" : "", "start");
      });
    } else {
      /* three assets, each a small column: opacity dial + holes bar */
      var colW = w / 3;
      a.forEach(function (x, i) {
        var x0 = i * colW;
        if (i) s += line(x0, 0, x0, 192, "c-grid");
        s += text(x0 + 10, 14, x.k, x.shipped ? "c-t--acc" : "c-t--fg", "start");
        s += text(x0 + 10, 28, fmt(x.splats) + " splats exported", "", "start");
        var cbw = colW - 26;
        s += text(x0 + 10, 56, "bottom-third opacity", "", "start");
        s += rect(x0 + 10, 62, cbw, 10, "c-band");
        s += rect(x0 + 10, 62, cbw * x.opacity, 10, x.shipped ? "c-bar--hi" : "c-bar");
        s += text(x0 + 10, 88, x.opacity.toFixed(3), "c-t--fg c-t--n", "start");
        s += text(x0 + 10, 116, "mean holes", "", "start");
        s += rect(x0 + 10, 122, cbw, 10, "c-band");
        s += rect(x0 + 10, 122, cbw * Math.min(x.holes / 20, 1), 10, x.holes > 1 ? "c-bar--hi" : "c-bar");
        s += text(x0 + 10, 148, x.holes.toFixed(1) + "%", "c-t--fg c-t--n", "start");
        s += text(x0 + 10, 172, "worst pose " + x.worst.toFixed(1) + "%",
                  x.worst > 5 ? "c-t--acc" : "", "start");
        if (x.shipped) s += text(x0 + 10, 192, "shipped", "c-t--acc", "start");
      });
    }
    s += line(0, body + 10, w, body + 10, "c-axis");
    s += drawNote(note, 0, body + 26);
    return svg(w, h, H.s + el("g", { transform: "translate(0," + (44 + H.dy) + ")" }, s));
  }

  /* ============================================================
     F6 — the same eight poses, three assets. The mean says one
     thing and the worst pose says another.
     ============================================================ */
  function perPose(w) {
    var p = D.final_run.poses;
    var m = { t: 44, r: 12, b: 46, l: 62 };
    var H = head(w, "Per-pose holes at the eight lowest level-flight poses",
                 "each pose is one vertical slot; the three marks are the three exports");
    m.t += H.dy;
    var note = noteLines("filled = 60k → 3M · outline = 8M/30k → 3M and 60k → 8M, both under 2% everywhere", w, 62);
    m.b += (note.length - 1) * 13;
    var h = 240 + H.dy + (note.length - 1) * 13;
    var iw = w - m.l - m.r, ih = h - m.t - m.b;
    var max = 20;
    var s = H.s;
    function Y(v) { return m.t + ih - Math.min(v / max, 1) * ih; }
    [0, 5, 10, 15, 20].forEach(function (t) {
      s += line(m.l, Y(t), m.l + iw, Y(t), "c-grid");
      s += text(m.l - 10, Y(t) + 4, t + "%", "c-t--n", "end");
    });
    var slot = iw / p.length;
    p.forEach(function (row, i) {
      var x = m.l + slot * (i + 0.5);
      s += line(x, Y(0), x, Y(Math.max(row.a, row.b, row.c)), "c-grid");
      s += circ(x, Y(row.a), 3.5, "c-dot");
      s += circ(x, Y(row.c), 3.5, "c-dot");
      s += circ(x, Y(row.b), 4.5, "c-dot--hi");
      /* the slots get narrower than the labels on a phone; every other one
         still identifies the run of poses */
      if (slot > 46 || i % 2 === 0)
        s += text(x, h - 26 - (note.length - 1) * 13, "#" + row.id, "c-t--n", "middle");
    });
    s += line(m.l, Y(0), m.l + iw, Y(0), "c-axis");
    s += drawNote(note, m.l, h - 6 - (note.length - 1) * 13);
    return svg(w, h, s);
  }

  /* ============================================================
     F7 — footage alignment. Undistorting the picture-in-picture
     into the render's own pinhole camera, by image region.
     ============================================================ */
  function undistort(w) {
    var rows = D.ghost.undistort_px;
    var m = { t: 40, r: 12, b: 42, l: 108 };
    var H = head(w, "Reprojection agreement between footage and render, in 640-wide proxy pixels",
                 "log scale · median distance from where the render puts a 3D point to where the feature sits");
    m.t += H.dy;
    var rowH = 30, h = m.t + rows.length * rowH + m.b;
    var iw = w - m.l - m.r;
    /* log scale — the raw error spans two decades */
    function X(v) { return m.l + (Math.log10(Math.max(v, 0.1)) + 1) / 3.1 * iw; }
    var s = H.s;
    rows.forEach(function (row, i) {
      var y = m.t + i * rowH;
      s += text(m.l - 12, y + 14, row.region, "", "end");
      s += line(X(row.fixed), y + 10, X(row.raw), y + 10, "c-ref");
      s += circ(X(row.raw), y + 10, 4, "c-dot");
      s += circ(X(row.fixed), y + 10, 4.5, "c-dot--hi");
      s += text(X(row.raw) + 9, y + 14, row.raw.toFixed(1) + " px raw", "", "start");
      s += text(X(row.fixed) - 9, y + 14, row.fixed.toFixed(2), "c-t--acc c-t--n", "end");
    });
    var base = m.t + rows.length * rowH - 4;
    s += line(m.l, base, m.l + iw, base, "c-axis");
    [0.1, 1, 10, 100].forEach(function (t) {
      s += text(X(t), base + 16, t + " px", "c-t--n", "middle");
    });
    return svg(w, h, s);
  }

  /* ============================================================
     F8 — detail retention against iteration. Training stopped
     where the curve was still climbing fastest.
     ============================================================ */
  function detailCurve(w) {
    var pts = [[10000, 14.9], [20000, 18.2], [30000, 22.6]];
    var m = { t: 40, r: 20, b: 44, l: 46 };
    var H = head(w, "Bottom-third detail against training iteration, cemetery scene",
                 "+3.3 points from 10k to 20k, +4.4 from 20k to 30k — still accelerating where it stopped");
    m.t += H.dy;
    var h = 220 + H.dy, iw = w - m.l - m.r, ih = h - m.t - m.b;
    function X(v) { return m.l + (v / 32000) * iw; }
    function Y(v) { return m.t + ih - (v / 26) * ih; }
    var s = H.s;
    [0, 5, 10, 15, 20, 25].forEach(function (t) {
      s += line(m.l, Y(t), m.l + iw, Y(t), "c-grid");
      s += text(m.l - 10, Y(t) + 4, t + "%", "c-t--n", "end");
    });
    var d = "M" + pts.map(function (p) { return r(X(p[0])) + " " + r(Y(p[1])); }).join(" L");
    s += el("path", { d: d, "class": "c-line" });
    pts.forEach(function (p, i) {
      s += circ(X(p[0]), Y(p[1]), 4, i === 2 ? "c-dot--hi" : "c-dot");
      s += text(X(p[0]), Y(p[1]) - 12, p[1].toFixed(1) + "%", "c-t--fg c-t--n", "middle");
      s += text(X(p[0]), h - 26, (p[0] / 1000) + "k", "c-t--n", "middle");
    });
    s += line(m.l, Y(0), m.l + iw, Y(0), "c-axis");
    return svg(w, h, s);
  }

  /* ---------- mount + keep in step with the layout ---------- */
  var charts = {
    "fig-cross": crossLinks,
    "fig-znear-cohorts": znearCohorts,
    "fig-ablation": ablation,
    "fig-bands": bands,
    "fig-export": exportCap,
    "fig-poses": perPose,
    "fig-undistort": undistort,
    "fig-detail-curve": detailCurve
  };

  var lastW = {};
  function drawOne(id) {
    var host = document.getElementById(id);
    if (!host) return;
    var w = Math.round(host.clientWidth);
    /* A zero here means the box has not been laid out yet. Drawing anyway
       would bake a 280-wide viewBox into an SVG that then gets stretched to
       the real column width, which is how every label ended up four times
       too big. Wait for the observer instead. */
    if (w < 40) return;
    if (lastW[id] === w) return;
    lastW[id] = w;
    host.innerHTML = charts[id](w);
  }
  function draw() { Object.keys(charts).forEach(drawOne); }

  draw();
  /* ResizeObserver rather than a window resize listener: the figures sit in a
     column whose width changes with the layout, not only with the window, and
     it also fires once the box has a size in the first place. */
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(function (entries) {
      entries.forEach(function (e) { drawOne(e.target.id); });
    });
    Object.keys(charts).forEach(function (id) {
      var host = document.getElementById(id);
      if (host) ro.observe(host);
    });
  } else {
    var t = null;
    window.addEventListener("resize", function () {
      clearTimeout(t);
      t = setTimeout(draw, 120);
    }, { passive: true });
  }
  window.addEventListener("load", draw);
})();
