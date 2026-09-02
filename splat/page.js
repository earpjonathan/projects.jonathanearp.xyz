/* ============================================================
   S.P.L.O.O.G.E — page wiring.
   The negative-results table, the before/after wipe, and the
   controls for the live renderer. Kept apart from charts.js and
   interactive.js so those two stay about drawing.
   ============================================================ */
(function () {
  var D = window.SPLAT;

  /* ---------- negative results, from data.js rather than typed ---------- */
  (function () {
    var body = document.querySelector("#negtable tbody");
    if (!body || !D) return;
    body.innerHTML = D.negatives.map(function (n) {
      return "<tr" + (n.worse ? ' class="is-key"' : "") + "><td>" + n.k +
             "</td><td>" + (n.worse ? "<strong>" + n.v + "</strong>" : n.v) + "</td></tr>";
    }).join("");
  })();

  /* ---------- videos that wait their turn ----------
     Figure 1 autoplays because it is the opening visual and worth the bytes.
     Anything marked data-lazyvideo does not fetch until it is on screen, and
     pauses again when it leaves, so a second multi-megabyte clip costs nothing
     to a reader who never scrolls that far. */
  (function () {
    var vids = document.querySelectorAll("[data-lazyvideo]");
    if (!vids.length) return;
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(vids, function (v) {
        v.src = v.getAttribute("data-lazyvideo");
        v.setAttribute("controls", "");
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var v = e.target;
        if (e.isIntersecting) {
          if (!v.src) v.src = v.getAttribute("data-lazyvideo");
          var q = v.play();
          if (q && q.catch) q.catch(function () { v.setAttribute("controls", ""); });
        } else if (!v.paused) {
          v.pause();
        }
      });
    }, { rootMargin: "200px 0px", threshold: 0.15 });
    Array.prototype.forEach.call(vids, function (v) { io.observe(v); });
  })();

  /* ---------- Figure 2, the reel ----------
     Five camera moves hard-cut into one file, so the two captions have to
     follow the cuts. The shot table lives in extent.json next to the numbers
     the renderer measured, which is the only way the times here cannot drift
     away from the ones the video was actually built with. Without it the
     figure still plays; the captions just stay on the first shot.
     timeupdate fires about four times a second, which is late enough on a cut
     to be visible, so this reads the clock on a frame instead. */
  (function () {
    var root = document.getElementById("reel");
    if (!root) return;
    var vid = root.querySelector("video");
    var la = root.querySelector('[data-reel="a"]');
    var lb = root.querySelector('[data-reel="b"]');

    fetch("media/extent.json").then(function (r) { return r.json(); })
      .then(function (e) {
        var shots = (e.reel && e.reel.shots) || [];
        if (shots.length < 2) return;
        var cur = -1, raf = 0;

        function tick() {
          var t = vid.currentTime, i = 0;
          for (var k = 0; k < shots.length; k++) if (t >= shots[k].start) i = k;
          if (i === cur) return;
          cur = i;
          la.textContent = shots[i].a;
          lb.textContent = shots[i].b;
        }

        function loop() { tick(); raf = vid.paused ? 0 : requestAnimationFrame(loop); }
        vid.addEventListener("play", function () { if (!raf) raf = requestAnimationFrame(loop); });
        vid.addEventListener("pause", tick);
        vid.addEventListener("seeked", tick);
        tick();
      }).catch(function () { /* the captions are a bonus; the video is the figure */ });
  })();

  /* ---------- the before/after wipe ----------
     Two stacked images with the top one clipped. A range input sits over
     the whole figure so the control is a real slider: keyboard-reachable,
     and it works on touch without inventing a drag handler. */
  (function () {
    var root = document.getElementById("abpair");
    if (!root) return;
    var top = root.querySelector(".abpair__img--top");
    var range = root.querySelector(".abpair__range");
    var handle = root.querySelector(".abpair__handle");
    function apply() {
      var v = +range.value;
      top.style.clipPath = "inset(0 0 0 " + v + "%)";
      handle.style.left = v + "%";
      root.style.setProperty("--wipe", v + "%");
    }
    range.addEventListener("input", apply);
    apply();
  })();

  /* ---------- the live renderer ---------- */
  (function () {
    var host = document.getElementById("liveviewer");
    if (!host || !window.SplatView) return;
    var canvas = host.querySelector(".viewer__canvas");
    var loadBtn = document.getElementById("viewer-load");
    var bar = document.getElementById("viewer-bar");
    var ctl = document.getElementById("viewer-ctl");
    var fallback = document.getElementById("viewer-fallback");
    var znIn = document.getElementById("viewer-znear");
    var znV = document.getElementById("viewer-znear-v");
    var flyBtn = document.getElementById("viewer-fly");
    var resetBtn = document.getElementById("viewer-reset");
    var viewsBox = document.getElementById("viewer-views");
    var elCount = document.getElementById("viewer-count");
    var elCut = document.getElementById("viewer-cut");
    var elFps = document.getElementById("viewer-fps");

    /* the viewer's own cull distance, from the same expression the
       shader's reject test reduces to */
    function cut(zn) {
      var zfar = 200, margin = 1.2, k = zfar / (zfar - zn);
      return zn * k / (margin + k);
    }

    function fail(msg) {
      loadBtn.hidden = true;
      bar.hidden = true;
      fallback.hidden = false;
      fallback.textContent = msg + " Figures 1, 8 and 10 carry the same result without it.";
    }

    var started = false;
    loadBtn.addEventListener("click", function () {
      if (started) return;
      started = true;
      loadBtn.disabled = true;
      loadBtn.querySelector(".viewer__loadv").textContent = "loading…";
      bar.hidden = false;

      var api = null;
      window.SplatView.create(canvas, "media/", {
        onProgress: function (f) {
          bar.firstElementChild.style.width = Math.round(f * 100) + "%";
        },
        onReady: function (n) {
          elCount.textContent = n.toLocaleString("en-US");
        },
        onStats: function (s) {
          elFps.textContent = Math.round(s.fps) + " fps";
        }
      }).then(function (a) {
        api = a;
        loadBtn.hidden = true;
        bar.hidden = true;
        ctl.hidden = false;
        host.classList.add("is-live");
        a.resize();

        /* Detail crop or whole site. Same renderer, same shaders, same sort —
           only the file changes, which is the point: the reader can see how
           small the thing they have been flying is inside the whole scene. */
        var ASSETS = {
          scene: { file: "scene.splat", views: a.state.meta.views,
                   note: "This is a crop, so the site stops a short way out and the horizon " +
                         "is thinner than in the full three-million-splat build. Everything " +
                         "else about it is what ships: the format, the sort, the projection " +
                         "and the blend." },
          site: { file: "site.splat", views: null,
                  note: "The whole flown area at 400,000 splats. This is all of the scene " +
                        "thinned out, instead of one piece of it in full. Floaters above the " +
                        "terrain and the sky dome get dropped so the camera can climb past them, " +
                        "which is why there is no sky up here, and why the surface looks speckled " +
                        "where the thinning left gaps." }
        };
        var noteEl = document.getElementById("viewer-note");
        var assetBox = document.getElementById("viewer-asset");
        var current = "scene", swapping = false;

        function paintViews(views) {
          viewsBox.innerHTML = "";
          views.forEach(function (v, i) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "sbtn" + (i === 0 ? " is-on" : "");
            b.innerHTML = '<span class="sbtn__n">' + (i + 1) + "</span>" + v.name;
            b.addEventListener("click", function () {
              viewsBox.querySelectorAll(".sbtn").forEach(function (o) { o.classList.remove("is-on"); });
              b.classList.add("is-on");
              flyBtn.classList.remove("is-on");
              a.setPose(v);
              a.state.viewIndex = i;
            });
            viewsBox.appendChild(b);
          });
          if (views.length) { a.setPose(views[0]); a.state.viewIndex = 0; }
        }

        function useAsset(k) {
          if (swapping || k === current) return;
          swapping = true;
          assetBox.querySelectorAll(".sbtn").forEach(function (o) {
            o.classList.toggle("is-on", o.getAttribute("data-asset") === k);
            o.disabled = true;
          });
          bar.hidden = false;
          bar.firstElementChild.style.width = "0%";
          flyBtn.classList.remove("is-on");
          flyBtn.disabled = k === "site";     // the recorded path only fits the crop
          a.load(ASSETS[k].file, function (f) {
            bar.firstElementChild.style.width = Math.round(f * 100) + "%";
          }).then(function () {
            current = k;
            bar.hidden = true;
            noteEl.textContent = ASSETS[k].note;
            paintViews(ASSETS[k].views || SITE_VIEWS);
            assetBox.querySelectorAll(".sbtn").forEach(function (o) { o.disabled = false; });
            swapping = false;
          }).catch(function (e) {
            bar.hidden = true;
            noteEl.textContent = "That asset did not load — " + e.message + ".";
            assetBox.querySelectorAll(".sbtn").forEach(function (o) { o.disabled = false; });
            swapping = false;
          });
        }

        var SITE_VIEWS = [];
        var loadJSON = window.SPLAT_JSON || function (u) {
          return fetch(u).then(function (r) { return r.json(); });
        };
        loadJSON("media/extent.json")
          .then(function (e) {
            SITE_VIEWS = (e.site && e.site.views) || [];
            assetBox.querySelectorAll("[data-asset]").forEach(function (b) {
              b.addEventListener("click", function () { useAsset(b.getAttribute("data-asset")); });
            });
          }).catch(function () { assetBox.hidden = true; });

        function syncZn() {
          var zn = Math.pow(10, +znIn.value);
          a.setZnear(zn);
          znV.textContent = zn < 0.1 ? zn.toFixed(3) : zn.toFixed(2);
          elCut.textContent = cut(zn).toFixed(4);
          host.classList.toggle("is-culling", cut(zn) > 0.02);
        }
        znIn.addEventListener("input", syncZn);
        syncZn();

        /* view presets, named by the frame they came from */
        paintViews(a.state.meta.views);

        flyBtn.addEventListener("click", function () {
          var on = !a.isFlying();
          a.fly(on);
          flyBtn.classList.toggle("is-on", on);
        });
        resetBtn.addEventListener("click", function () {
          var views = current === "scene" ? a.state.meta.views : SITE_VIEWS;
          a.setPose(views[Math.min(a.state.viewIndex, views.length - 1)]);
          flyBtn.classList.remove("is-on");
        });
      }).catch(function (e) {
        fail("The live renderer could not start — " + e.message + ".");
      });
    });

    /* WebGL 2 is required; say so up front rather than on click */
    try {
      var probe = document.createElement("canvas").getContext("webgl2");
      if (!probe) fail("This browser has no WebGL 2, which the renderer needs.");
    } catch (e) {
      fail("This browser has no WebGL 2, which the renderer needs.");
    }
  })();
})();
