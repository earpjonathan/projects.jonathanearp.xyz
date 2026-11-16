/* ============================================================
   Y.A.N.K — the lid-close demo.
   Follows the daemon's real decision path (src/ejectd/main.swift):
   AppleClamshellCausesSleep decides unmount vs stay mounted; a busy
   volume is warned about on lsof's answer, then diskutil confirms;
   nothing is ever forced. Times are the measured ones from the README.
   ============================================================ */
(function () {
  var root = document.getElementById("lid-demo");
  if (!root) return;

  var state = { power: "battery", display: "none", open: "none" };
  var holder = {
    script: { name: "Python", refuse: "~2 s", note: "refuses properly" },
    quicktime: { name: "QuickTime Player", refuse: "~12 s", note: "ignores the request until it times out" }
  };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function row(k, v) {
    return '<div class="log__row"><span class="log__k">' + esc(k) +
      '</span><span class="log__v">' + v + "</span></div>";
  }

  function render() {
    var sleeps = !(state.power === "ac" && state.display === "external");
    var rows = [], volume, phone;

    if (!sleeps) {
      rows.push(row("0 s", "Lid closes. <strong>AppleClamshellCausesSleep = No</strong>: external display on AC, so the Mac stays awake."));
      rows.push(row("0 s", "Clamshell mode. This is the start of a work session, so the volume <strong>stays mounted</strong>."));
      rows.push(row("0 s", "<code>sync()</code> flushes everything already written, so an abrupt unplug loses none of it."));
      volume = "Mounted"; phone = "Nothing sent";
    } else {
      rows.push(row("0 s", "Lid closes. <strong>AppleClamshellCausesSleep = Yes</strong>, so I'm leaving. The daemon holds off sleep."));
      if (state.open === "none") {
        rows.push(row("~0.2 s", "lsof finds nothing open on the SSD. No warning."));
        rows.push(row("then", "<code>diskutil unmountDisk</code> flushes and unmounts. Mac notification: safe to unplug."));
        rows.push(row("then", "Sleep is allowed to go ahead. The volume comes back when the lid opens."));
        volume = "Unmounted"; phone = "Nothing sent";
      } else {
        var h = holder[state.open];
        rows.push(row("~0.2 s", "lsof says <strong>" + esc(h.name) + "</strong> has a file open. The phone alert goes out now."));
        rows.push(row("~1 s", "The alert has left the Mac, before Wi-Fi drops."));
        rows.push(row(h.refuse, "diskutil confirms: " + esc(h.name) + " " + esc(h.note) + ". The volume is <strong>left mounted</strong>, never forced."));
        rows.push(row("then", "The Mac sleeps with the volume still mounted. The phone already said don't unplug."));
        volume = "Mounted, in use"; phone = "In use: " + h.name;
      }
    }

    root.querySelector('[data-read="log"]').innerHTML = rows.join("");
    root.querySelector('[data-read="causes"]').textContent = sleeps ? "Yes" : "No";
    root.querySelector('[data-read="volume"]').textContent = volume;
    root.querySelector('[data-read="phone"]').textContent = phone;
  }

  Array.prototype.forEach.call(root.querySelectorAll("[data-group]"), function (g) {
    var key = g.getAttribute("data-group");
    g.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-v]");
      if (!b) return;
      state[key] = b.getAttribute("data-v");
      Array.prototype.forEach.call(g.querySelectorAll("button"), function (x) {
        x.classList.toggle("is-on", x === b);
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      render();
    });
    Array.prototype.forEach.call(g.querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x.classList.contains("is-on") ? "true" : "false");
    });
  });

  render();
})();
