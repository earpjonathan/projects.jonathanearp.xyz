/* ============================================================
   S.H.R.E.D — the two-cuts demo.
   The paragraph is made up for this page so no real evidence (and
   nothing from the team's files) is reproduced. Marks are stored the
   way the cutter stores them: as word indices into the source, never
   as retyped text. Boxes always sit inside the highlight, and the
   highlight inside the underline, same as a real card.
   ============================================================ */
(function () {
  var root = document.getElementById("card-demo");
  if (!root) return;

  var TEXT = "City trees do more for summer heat than most cooling programs. " +
    "A study of 40 neighborhoods found that blocks with full canopy stayed up to " +
    "5 degrees cooler on the hottest afternoons, and emergency room visits for heat " +
    "illness fell by nearly a third. The effect was largest in low-income areas, " +
    "which had the fewest trees to begin with. Planting costs are small next to air " +
    "conditioning, and the shade keeps working for decades.";
  var W = TEXT.split(" ");

  function span(ranges) {
    var s = {};
    ranges.forEach(function (r) {
      if (typeof r === "number") { s[r] = true; return; }
      for (var i = r[0]; i <= r[1]; i++) s[i] = true;
    });
    return s;
  }

  /* Underlining is the same in both cuts: whole clauses that carry the argument. */
  var UNDER = span([[0, 10], [18, 43], [44, 50], [59, 73]]);

  var CUTS = {
    files: {
      h: span([1, 3, 21, 25, 26, 27, 33, 35, 39, 43, 47, 49, 62, 73]),
      e: span([3, 25, 26, 39, 43, 49, 73])
    },
    reader: {
      h: span([[0, 6], [18, 27], [35, 43], [69, 73]]),
      e: span([25, 26, 43])
    }
  };

  var LV = ["u", "h", "e"];
  var CLS = { u: "cc-u", h: "cc-h", e: "cc-e" };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render(key) {
    var cut = CUTS[key];
    var open = { u: false, h: false, e: false };
    var out = "";
    var read = [], boxed = 0;

    W.forEach(function (w, i) {
      var cur = { u: !!UNDER[i], h: !!cut.h[i], e: !!cut.e[i] };
      /* close from the deepest level up to the first one this word leaves */
      var first = -1;
      for (var l = 0; l < LV.length; l++) {
        if (open[LV[l]] && !cur[LV[l]]) { first = l; break; }
      }
      if (first >= 0) {
        for (var d = LV.length - 1; d >= first; d--) {
          if (open[LV[d]]) { out += "</span>"; open[LV[d]] = false; }
        }
      }
      if (i > 0) out += " ";
      for (var o = 0; o < LV.length; o++) {
        if (cur[LV[o]] && !open[LV[o]]) {
          out += '<span class="' + CLS[LV[o]] + '">';
          open[LV[o]] = true;
        }
      }
      out += esc(w);
      if (cur.h) { read.push(w); if (cur.e) boxed++; }
    });
    for (var c = LV.length - 1; c >= 0; c--) if (open[LV[c]]) out += "</span>";

    root.querySelector('[data-read="body"]').innerHTML = out;
    root.querySelector('[data-read="nread"]').textContent = read.length + " of " + W.length;
    root.querySelector('[data-read="nbox"]').textContent =
      boxed + " (" + Math.round((boxed / read.length) * 100) + "%)";
    root.querySelector('[data-read="spoken"]').textContent = 'Read aloud: "' + read.join(" ") + '"';
  }

  var group = root.querySelector('[data-group="style"]');
  group.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-v]");
    if (!b) return;
    Array.prototype.forEach.call(group.querySelectorAll("button"), function (x) {
      x.classList.toggle("is-on", x === b);
      x.setAttribute("aria-pressed", x === b ? "true" : "false");
    });
    render(b.getAttribute("data-v"));
  });
  Array.prototype.forEach.call(group.querySelectorAll("button"), function (x) {
    x.setAttribute("aria-pressed", x.classList.contains("is-on") ? "true" : "false");
  });

  render("files");
})();
