/* ============================================================
   Projects — theme toggle, scroll reveal, year, chapter nav.
   Shared behaviour block, identical across sites.
   ============================================================ */

/* ---- theme toggle (persisted) ---- */
(function () {
  var btn = document.getElementById("theme-toggle");
  if (!btn) return;
  btn.addEventListener("click", function () {
    var d = document.documentElement;
    var next = d.dataset.theme === "dark" ? "light" : "dark";
    d.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  });
})();

/* ---- reveal on scroll ---- */
(function () {
  var els = document.querySelectorAll("[data-reveal]");
  if (!els.length || !("IntersectionObserver" in window)) {
    Array.prototype.forEach.call(els, function (el) { el.classList.add("is-in"); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
  Array.prototype.forEach.call(els, function (el) { io.observe(el); });

  /* Failsafe: reveal is a decoration, never a gate on reading the page.
     If the observer never fires — a zero-size viewport at load, a restored
     bfcache page, a browser that disagrees about intersection — anything
     still hidden shortly after load is shown unconditionally. */
  window.addEventListener("load", function () {
    setTimeout(function () {
      /* If nothing at all has been revealed by now the observer is not
         working — show everything. If it is working, only rescue what is
         currently on screen so the scroll animation survives. */
      var working = document.querySelector("[data-reveal].is-in");
      Array.prototype.forEach.call(els, function (el) {
        if (el.classList.contains("is-in")) return;
        if (!working || el.getBoundingClientRect().top < window.innerHeight) {
          el.classList.add("is-in");
        }
      });
    }, 1200);
  });
})();

/* ---- footer year ---- */
(function () {
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();

/* ---- nav label letter-by-letter stagger ---- */
(function () {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll(".topnav__link").forEach(function (link, li) {
    var text = link.textContent;
    link.textContent = "";
    link.classList.add("stagger");
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement("span");
      if (text[i] === " ") { s.className = "sp"; s.innerHTML = "&nbsp;"; }
      else s.textContent = text[i];
      s.style.setProperty("--ci", li * 3 + i);
      link.appendChild(s);
    }
  });
})();

/* ---- scrolled nav state ---- */
(function () {
  function onScroll() { document.body.classList.toggle("scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
})();

/* ---- chapter nav: highlight the chapter you're reading ---- */
(function () {
  var nav = document.getElementById("chapnav");
  if (!nav) return;
  var links = Array.prototype.slice.call(nav.querySelectorAll("a"));
  var targets = links.map(function (l) {
    return { link: l, el: document.getElementById(l.getAttribute("href").slice(1)) };
  }).filter(function (t) { return t.el; });
  if (!targets.length) return;

  var ticking = false;
  function update() {
    ticking = false;
    /* active = the last chapter whose top has passed 45% of the viewport */
    var line = window.innerHeight * 0.45;
    var current = targets[0];
    targets.forEach(function (t) {
      if (t.el.getBoundingClientRect().top <= line) current = t;
    });
    targets.forEach(function (t) {
      t.link.classList.toggle("is-active", t === current);
    });
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener("resize", update);
  update();
})();

/* ---- favicon follows the theme ----
   The SVG carries its own prefers-color-scheme query, which covers the OS
   setting before this runs. That query cannot see the in-page toggle though,
   so swap the file when data-theme changes. The <link> is replaced rather
   than re-pointed: several browsers ignore an href edit on a live icon. */
(function () {
  var cur = document.querySelector('link[rel="icon"]');
  if (!cur) return;
  var base = cur.getAttribute("href").replace(/favicon(-dark|-light)?\.svg$/, "favicon");
  var shown = null;
  function sync() {
    var want = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    if (want === shown) return;
    shown = want;
    var next = document.createElement("link");
    next.rel = "icon";
    next.type = "image/svg+xml";
    next.href = base + "-" + want + ".svg";
    cur.parentNode.replaceChild(next, cur);
    cur = next;
  }
  sync();
  new MutationObserver(sync).observe(document.documentElement,
    { attributes: true, attributeFilter: ["data-theme"] });
})();
