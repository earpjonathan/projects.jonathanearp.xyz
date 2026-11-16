/* ============================================================
   Projects — horizontal bar figures for the smaller case studies.
   Usage:
     <div class="hbars" data-hbars='{"title": "...", "unit": "MB/s",
          "rows": [{"k": "label", "v": 8.4, "hi": true}, ...]}'></div>
   Optional keys: "max" (axis end), "dec" (decimals on the value
   labels), "label" on a row (overrides the printed value).
   Same rules as the P.E.T.E.R charts: inline SVG, styled only through
   the c-* classes so it follows the theme toggle, redrawn at a 1:1
   viewBox on resize so 10px labels stay 10px on a phone.
   ============================================================ */
(function () {
  var nodes = document.querySelectorAll("[data-hbars]");
  if (!nodes.length) return;

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function r(n) { return Math.round(n * 100) / 100; }
  function text(x, y, s, cls, anchor) {
    return '<text x="' + r(x) + '" y="' + r(y) + '" class="c-t ' + (cls || "") +
      '" text-anchor="' + (anchor || "start") + '">' + esc(s) + "</text>";
  }
  function rect(x, y, w, h, cls) {
    return '<rect x="' + r(x) + '" y="' + r(y) + '" width="' + r(Math.max(0, w)) +
      '" height="' + r(h) + '" class="' + cls + '"/>';
  }

  function draw(node) {
    var spec;
    try { spec = JSON.parse(node.getAttribute("data-hbars")); } catch (e) { return; }
    var w = Math.max(280, Math.round(node.clientWidth || 640));
    var narrow = w < 560;
    var rows = spec.rows || [];
    var max = spec.max || Math.max.apply(null, rows.map(function (x) { return x.v; }));
    var dec = spec.dec === undefined ? 1 : spec.dec;
    var labW = narrow ? 0 : Math.min(240, Math.round(w * 0.34));
    var valW = 84;
    var top = spec.title ? 28 : 6;
    var rowH = narrow ? 44 : 30;
    var barH = 18;
    var h = top + rows.length * rowH + 4;
    var bx = labW ? labW + 14 : 0;
    var iw = w - bx - valW;
    var s = "";

    if (spec.title) s += text(0, 12, spec.title, "c-t--fg", "start");
    rows.forEach(function (row, i) {
      var y = top + i * rowH;
      var by = narrow ? y + 16 : y;
      if (narrow) s += text(0, y + 10, row.k, row.hi ? "c-t--fg" : "", "start");
      else s += text(labW, y + 13, row.k, row.hi ? "c-t--fg" : "", "end");
      var bw = (row.v / max) * iw;
      s += rect(bx, by, Math.max(bw, 1), barH, row.hi ? "c-bar--hi" : "c-bar");
      var lbl = row.label !== undefined ? row.label
        : row.v.toFixed(dec) + (spec.unit ? " " + spec.unit : "");
      s += text(bx + bw + 8, by + 13, lbl, (row.hi ? "c-t--acc" : "c-t--fg") + " c-t--n", "start");
    });

    node.innerHTML = '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h +
      '" role="img" aria-label="' + esc(spec.title || "Bar chart") + '">' + s + "</svg>";
  }

  function all() { Array.prototype.forEach.call(nodes, draw); }
  all();
  var t;
  window.addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(all, 120);
  });
})();
