#!/usr/bin/env python3
"""
Fetch the base aerial for a site.

    python3 geo/fetch_basemap.py --site mountain-view
    python3 geo/fetch_basemap.py --site mountain-view --dry-run
    python3 geo/fetch_basemap.py --list-providers

The bbox goes out in EPSG:3857 and the image comes back in EPSG:3857, which
keeps the pixel-to-ground mapping exact and linear instead of something that
has to be inferred from a reprojection. Web Mercator metres are inflated by
1/cos(lat), so the box is divided by that to end up the real ground span asked
for. All of that lives in geocore.Mercator; this file is the network edge.

Pick the box so the whole flight envelope fits with room to spare, and pick a
provider better than about 1 m/px — below that you cannot pick a roundabout out
of an aerial by eye, which is what the control points require.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import providers                                  # noqa: E402
from geocore import Mercator                      # noqa: E402
from georef import load_site, resolve             # noqa: E402


def list_providers():
    provs = providers.load_providers()
    print("%-22s %-10s %-9s %s" % ("name", "adapter", "publish?", "coverage"))
    for name, p in sorted(provs.items()):
        print("%-22s %-10s %-9s %s"
              % (name, p["adapter"], "yes" if p["publishable"] else "FIT ONLY",
                 p.get("coverage", "-")))
    print("\nFIT ONLY means the licence forbids redistributing the pixels.")
    print("You may fit against it; georef.py will not write its imagery out.")
    print("\nAdd your own in geo/providers.local.json:")
    print(json.dumps({"my_national_ortho": {
        "adapter": "wms",
        "url": "https://example.gov/ortho/wms",
        "layers": "rgb",
        "coverage": "Exampleland",
        "attribution": "Example National Mapping Agency",
        "publishable": True}}, indent=2))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site")
    ap.add_argument("--which", default="fit", choices=["fit", "publish"],
                    help="which basemap in the config to fetch (default fit)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the URL and the geometry, download nothing")
    ap.add_argument("--list-providers", action="store_true")
    a = ap.parse_args(argv)

    if a.list_providers:
        list_providers()
        return 0
    if not a.site:
        ap.error("--site is required (or --list-providers)")

    cfg, site_dir = load_site(a.site)
    if a.which not in cfg["basemap"]:
        raise SystemExit(f"site has no basemap.{a.which} block")
    bm = cfg["basemap"][a.which]
    prov = providers.get(bm["provider"])

    lat, lon = cfg["centre"]
    merc = Mercator(lat, lon, bm["ground_m"], bm["px"])
    url = providers.build_url(prov, merc.bbox, bm["px"])

    out_dir = resolve(site_dir, cfg.get("paths", {}).get("basemap_dir", "."))
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, bm.get("file", "basemap.jpg"))

    nw, se = merc.to_lonlat(0, 0), merc.to_lonlat(merc.px, merc.px)
    print("site      %s" % cfg.get("name", a.site))
    print("provider  %s  (%s)%s" % (bm["provider"], prov["attribution"],
                                    "" if prov["publishable"] else "  FIT ONLY"))
    print("box       %.0f m across at %d px  ->  %.4f m/px"
          % (merc.ground_m, merc.px, merc.m_per_px))
    print("bbox3857  %.3f %.3f %.3f %.3f" % merc.bbox)
    print("corners   NW %.6f,%.6f   SE %.6f,%.6f" % (nw[1], nw[0], se[1], se[0]))
    print("dest      %s" % dest)
    print("url       %s" % url)

    if a.dry_run:
        print("\n(dry run, nothing downloaded)")
        return 0
    if prov.get("resolution_m", 0) > 1.0:
        print("\nwarning: %s is about %.1f m/px. Below ~1 m/px you cannot read "
              "control points by eye." % (bm["provider"], prov["resolution_m"]))

    providers.fetch(prov, merc.bbox, bm["px"], dest)
    print("\nwrote     %s  %.1f KB" % (dest, os.path.getsize(dest) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
