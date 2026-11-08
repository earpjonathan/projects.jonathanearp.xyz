#!/usr/bin/env python3
"""
Serve the control point picker for a site.

    python3 geo/serve_align.py --site mountain-view

A site's render and basemap usually live outside this directory — the render
next to the rest of a project's media, the basemap in a scratch folder — so a
plain static server rooted here cannot reach either. This serves geo/ and maps
the two configured directories in under fixed paths:

    /                      geo/
    /asset/render/<file>   paths.render_dir
    /asset/basemap/<file>  paths.basemap_dir
    /asset/extent.json     paths.extent

so align.html can ask for its images by a stable URL whatever the config says.
Only files directly inside those directories are served, and nothing else on
the filesystem is reachable.
"""
from __future__ import annotations

import argparse
import os
import posixpath
import sys
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from georef import load_site, resolve   # noqa: E402

MOUNTS: dict[str, str] = {}


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        clean = urllib.parse.urlparse(path).path
        for prefix, root in MOUNTS.items():
            if clean.startswith(prefix):
                rel = clean[len(prefix):].lstrip("/")
                # single path component only: no traversal, no subdirectories
                name = posixpath.basename(rel)
                if not name or name != rel:
                    return os.path.join(HERE, "__forbidden__")
                full = os.path.realpath(os.path.join(root, name))
                if os.path.dirname(full) != os.path.realpath(root):
                    return os.path.join(HERE, "__forbidden__")
                return full
        return SimpleHTTPRequestHandler.translate_path(self, path)

    def log_message(self, fmt, *args):
        if "200" not in (args[1] if len(args) > 1 else ""):
            sys.stderr.write("  %s\n" % (fmt % args))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", required=True)
    ap.add_argument("--port", type=int, default=8788)
    a = ap.parse_args(argv)

    cfg, site_dir = load_site(a.site)
    site_key = os.path.basename(a.site).replace(".geo.json", "")
    P = cfg.get("paths", {})

    render_dir = resolve(site_dir, P.get("render_dir", "."))
    basemap_dir = resolve(site_dir, P.get("basemap_dir", "."))
    MOUNTS["/asset/render/"] = render_dir
    MOUNTS["/asset/basemap/"] = basemap_dir

    ext = P.get("extent")
    if ext:
        ext = resolve(site_dir, ext)
        MOUNTS["/asset/extent/"] = os.path.dirname(ext)

    os.chdir(HERE)
    url = f"http://127.0.0.1:{a.port}/align.html?site={site_key}"
    print(f"site      {cfg.get('name', site_key)}")
    print(f"render    {render_dir}")
    print(f"basemap   {basemap_dir}")
    if ext:
        print(f"extent    {ext}")
    for p, f in (("render", os.path.join(render_dir, cfg['render']['file'])),
                 ("basemap", os.path.join(basemap_dir,
                                          cfg['basemap']['fit'].get('file', 'basemap.jpg')))):
        if not os.path.exists(f):
            print(f"\nWARNING: {p} image missing: {f}")
    print(f"\nopen      {url}\n")
    ThreadingHTTPServer(("127.0.0.1", a.port), Handler).serve_forever()


if __name__ == "__main__":
    raise SystemExit(main())
