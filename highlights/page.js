/* ============================================================
   Highlights page: keyboard jumps between sections, the figure
   tabs, videos that only play while they're on screen, the live
   splat renderer from ../splat/viewer.js, and the before/after wipe.
   ============================================================ */
(function () {
  "use strict";

  var each = function (list, fn) { Array.prototype.forEach.call(list, fn); };

  /* ---------- ← / → and j / k move one section ----------
     The title screen counts as a stop, so ← from 01 goes back to it. Each
     section's scroll-margin is what lands it under the sticky index. */
  (function () {
    var stops = [document.getElementById("intro")].concat(
      Array.prototype.slice.call(document.querySelectorAll(".wsec")));
    if (stops.length < 2) return;
    var lastIdx = -1, lastAt = 0;

    function line() {
      return parseFloat(getComputedStyle(stops[1]).scrollMarginTop) || 0;
    }
    function current() {
      /* mid-scroll, the page is between two sections, so a quick second
         press counts from where the first one was going */
      if (lastIdx >= 0 && performance.now() - lastAt < 800) return lastIdx;
      var doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 2) return stops.length - 1;
      var y = line() + 8, idx = 0;
      stops.forEach(function (s, i) { if (s.getBoundingClientRect().top <= y) idx = i; });
      return idx;
    }
    function go(i) {
      i = Math.max(0, Math.min(stops.length - 1, i));
      lastIdx = i; lastAt = performance.now();
      if (i === 0) window.scrollTo(0, 0);
      else stops[i].scrollIntoView({ block: "start" });
      try {
        history.replaceState(null, "", i === 0 ? location.pathname + location.search : "#" + stops[i].id);
      } catch (e) {}
    }

    document.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      var d = 0;
      if (e.key === "ArrowRight" || e.key === "j" || e.key === "J") d = 1;
      else if (e.key === "ArrowLeft" || e.key === "k" || e.key === "K") d = -1;
      if (!d) return;
      e.preventDefault();
      go(current() + d);
    });
  })();

  /* ---------- videos play only while visible ----------
     preload="none" until then, so the page doesn't pull ~14 MB of video
     before anyone has scrolled to it. */
  var vids = Array.prototype.slice.call(document.querySelectorAll("video[data-play]"));
  function syncVideos() {
    vids.forEach(function (v) {
      var want = v._vis && !v.closest("[hidden]");
      if (want && v.paused) {
        v.preload = "auto";
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      } else if (!want && !v.paused) {
        v.pause();
      }
    });
  }
  if ("IntersectionObserver" in window) {
    var vio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target._vis = en.isIntersecting; });
      syncVideos();
    }, { threshold: 0.2 });
    vids.forEach(function (v) { vio.observe(v); });
  } else {
    vids.forEach(function (v) { v._vis = true; });
    syncVideos();
  }

  /* ---------- figure tabs ---------- */
  each(document.querySelectorAll("[data-tabs]"), function (box) {
    var btns = box.querySelectorAll("[data-tab]");
    var panels = box.querySelectorAll("[data-panel]");
    function show(k) {
      each(btns, function (b) {
        var on = b.getAttribute("data-tab") === k;
        b.classList.toggle("is-on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
      each(panels, function (p) { p.hidden = p.getAttribute("data-panel") !== k; });
      box.dispatchEvent(new CustomEvent("wtab", { detail: k }));
      syncVideos();
    }
    each(btns, function (b) {
      b.addEventListener("click", function () { show(b.getAttribute("data-tab")); });
    });
  });

  /* ---------- the live renderer ----------
     Same renderer, shaders and crop as Figure 11 on the splat page, loaded
     from there. It starts flying the recorded path as soon as it's in. */
  (function () {
    var host = document.getElementById("wviewer");
    if (!host) return;
    var canvas = host.querySelector(".viewer__canvas");
    var loadBtn = host.querySelector(".viewer__load");
    var bar = host.querySelector(".viewer__bar");
    var pre = document.getElementById("wviewer-pre");
    var ctl = document.getElementById("wviewer-ctl");
    var fallback = document.getElementById("wviewer-fallback");
    var flyBtn = document.getElementById("wviewer-fly");
    var resetBtn = document.getElementById("wviewer-reset");
    var znBtns = ctl.querySelectorAll("[data-zn]");
    var fpsEl = document.getElementById("wviewer-fps");
    var tagEl = document.getElementById("wviewer-tag");
    var api = null, started = false;

    function fail(msg) {
      loadBtn.hidden = true;
      bar.hidden = true;
      pre.hidden = true;
      fallback.hidden = false;
      fallback.innerHTML = "";
      fallback.appendChild(document.createTextNode(msg + " "));
      var a = document.createElement("a");
      a.href = "../splat/#liveviewer";
      a.target = "_blank";
      a.rel = "noopener";
      a.className = "tlink";
      a.textContent = "Open the viewer on the write-up ↗";
      fallback.appendChild(a);
    }

    try {
      if (!document.createElement("canvas").getContext("webgl2")) {
        fail("This browser has no WebGL 2, which the renderer needs.");
        return;
      }
    } catch (e) {
      fail("This browser has no WebGL 2, which the renderer needs.");
      return;
    }
    if (!window.SplatView) { fail("The renderer didn't load."); return; }

    loadBtn.addEventListener("click", function () {
      if (started) return;
      started = true;
      loadBtn.disabled = true;
      loadBtn.querySelector(".viewer__loadv").textContent = "loading…";
      bar.hidden = false;

      window.SplatView.create(canvas, "../splat/media/", {
        onProgress: function (f) {
          bar.firstElementChild.style.width = Math.round(f * 100) + "%";
        },
        onStats: function (s) {
          fpsEl.textContent = Math.round(s.fps) + " fps";
          /* dragging the view drops out of the flight inside the viewer,
             so the button follows the viewer rather than its own clicks */
          if (api) {
            var flying = api.isFlying();
            flyBtn.classList.toggle("is-on", flying);
            tagEl.textContent = flying ? "Recorded flight path" : "Free look";
          }
        }
      }).then(function (a) {
        api = a;
        loadBtn.hidden = true;
        bar.hidden = true;
        pre.hidden = true;
        ctl.hidden = false;
        fpsEl.hidden = false;
        tagEl.hidden = false;
        host.classList.add("is-live");
        a.resize();
        a.fly(true);
        flyBtn.classList.add("is-on");
      }).catch(function (e) {
        fail("The live renderer couldn't start: " + e.message + ".");
      });
    });

    flyBtn.addEventListener("click", function () {
      if (!api) return;
      var on = !api.isFlying();
      api.fly(on);
      flyBtn.classList.toggle("is-on", on);
    });
    resetBtn.addEventListener("click", function () {
      if (!api) return;
      api.setPose(api.state.meta.views[0]);
      flyBtn.classList.remove("is-on");
    });
    each(znBtns, function (b) {
      b.addEventListener("click", function () {
        if (!api) return;
        api.setZnear(+b.getAttribute("data-zn"));
        each(znBtns, function (o) { o.classList.toggle("is-on", o === b); });
      });
    });

    /* a hidden canvas has no size, so re-measure when its tab comes back */
    var tabs = host.closest("[data-tabs]");
    if (tabs) tabs.addEventListener("wtab", function (e) {
      if (api && e.detail === "live") requestAnimationFrame(function () { api.resize(); });
    });
  })();

  /* ---------- before/after wipe (same control as Figure 8) ---------- */
  (function () {
    var root = document.getElementById("wab");
    if (!root) return;
    var top = root.querySelector(".abpair__img--top");
    var range = root.querySelector(".abpair__range");
    var handle = root.querySelector(".abpair__handle");
    function apply() {
      var v = +range.value;
      top.style.clipPath = "inset(0 0 0 " + v + "%)";
      handle.style.left = v + "%";
    }
    range.addEventListener("input", apply);
    apply();
  })();
})();
