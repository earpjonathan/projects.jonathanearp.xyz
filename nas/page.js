/* ============================================================
   S.U.D.O — the classifier demo.
   Every verdict below is copied from CommandClassifier.classify()
   run against config.example.toml (admin mode off, allowed roots
   /volume1/photos and /volume1/documents) on 2026-11-16. Nothing
   here re-implements the classifier; if it changes, re-run it and
   paste the new answers in.
   ============================================================ */
(function () {
  var root = document.getElementById("judge-demo");
  if (!root) return;

  var C = [
    { cmd: "ls -la /volume1/photos/2024", v: "read",
      why: [], paths: "/volume1/photos/2024", kind: "ls -la <root:/volume1/photos>" },
    { cmd: "find /volume1/photos -name '*.jpg' -print0 | xargs -0 md5sum", v: "read",
      why: [], paths: "/volume1/photos",
      kind: "find <root:/volume1/photos> -name <pattern> -print0 | xargs -0 md5sum" },
    { cmd: "nice -n 19 du -sh /volume1/documents", v: "read",
      why: [], paths: "/volume1/documents", kind: "nice -n <arg> du -sh <root:/volume1/documents>" },
    { cmd: "mkdir /volume1/photos/2026", v: "write",
      why: ["'mkdir' modifies the filesystem"], paths: "/volume1/photos/2026",
      kind: "mkdir <root:/volume1/photos>" },
    { cmd: "mv /volume1/photos/a.jpg /volume1/documents/", v: "write",
      why: ["'mv' modifies the filesystem"], paths: "/volume1/photos/a.jpg, /volume1/documents",
      kind: "mv <root:/volume1/photos> <root:/volume1/documents>" },
    { cmd: "rm -rf /volume1/photos/old", v: "dangerous",
      why: ["recursive delete (rm -r)"], paths: "/volume1/photos/old",
      kind: "rm -rf <root:/volume1/photos>" },
    { cmd: "echo $(whoami)", v: "dangerous",
      why: ["contains $(...) command substitution; paths cannot be checked statically"],
      paths: "unresolved: $(whoami)", kind: "none" },
    { cmd: "sh -c 'rm -rf /volume1/photos'", v: "dangerous",
      why: ["'sh -c' runs an inline script rather than a plain command",
            "recursive delete of the allowlist root /volume1/photos — this would empty the entire share",
            "recursive delete (rm -r)"],
      paths: "/volume1/photos", kind: "sh -c <script>" },
    { cmd: "ls /volume1/photos-old", v: "denied",
      why: ["path denied — /volume1/photos-old: not inside any allowed root [/volume1/documents, /volume1/photos]"],
      paths: "/volume1/photos-old", kind: "none" },
    { cmd: "cat /volume1/photos/../../etc/passwd", v: "denied",
      why: ["path denied — /etc/passwd: DSM-owned path and dsm_admin_mode is off"],
      paths: "/etc/passwd", kind: "none" },
    { cmd: "synopkg list", v: "denied",
      why: ["'synopkg' administers DSM and dsm_admin_mode is off (set it in config to allow this behind an approval prompt)"],
      paths: "none", kind: "none" },
    { cmd: "rm -rf /", v: "denied",
      why: ["recursive delete of /", "recursive delete (rm -r)",
            "path denied — /: not inside any allowed root [/volume1/documents, /volume1/photos]"],
      paths: "/", kind: "none" },
    { cmd: "sudo reboot", v: "denied",
      why: ["attempts privilege escalation (sudo)"], paths: "none", kind: "none" },
    { cmd: "dd if=/dev/zero of=/dev/sda", v: "denied",
      why: ["dd writes directly to a device (/dev/sda)", "dd performs raw block I/O"],
      paths: "none", kind: "none" }
  ];

  var THEN = {
    read: "Runs without asking",
    write: "Waits for approval",
    dangerous: "Waits for approval, reasons shown",
    denied: "Refused. No approval can allow it"
  };

  var list = root.querySelector(".cmdlist");
  var q = function (k) { return root.querySelector('[data-read="' + k + '"]'); };

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function show(i) {
    var c = C[i];
    var v = q("v");
    v.textContent = c.v;
    v.setAttribute("data-v", c.v);
    q("then").textContent = THEN[c.v];
    q("cmd").textContent = c.cmd;
    q("why").innerHTML = c.why.length
      ? c.why.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("")
      : "<li>Nothing to flag: a read-only program on paths inside an allowed folder.</li>";
    q("paths").textContent = c.paths;
    q("kind").textContent = c.kind === "none" ? "none, can't be approved for the session" : c.kind;
    Array.prototype.forEach.call(list.children, function (b, j) {
      b.classList.toggle("is-on", j === i);
      b.setAttribute("aria-pressed", j === i ? "true" : "false");
    });
  }

  C.forEach(function (c, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sbtn sbtn--mono";
    b.textContent = c.cmd;
    b.addEventListener("click", function () { show(i); });
    list.appendChild(b);
  });

  show(7);
})();
