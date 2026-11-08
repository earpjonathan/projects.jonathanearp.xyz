#!/usr/bin/env python3
"""
Georeference a nadir render against aerial imagery, for any site.

    python3 geo/georef.py --site mountain-view
    python3 geo/georef.py --site mountain-view --out ../portfolio/splat/media

Reads sites/<name>.geo.json, fits a similarity transform to the control points
in it, checks the answer three independent ways, and writes geo.json, a cropped
aerial.jpg and a Google Earth .kmz.

What it gives you, from a reconstruction that had neither:

    metres per scene unit, and north.

The registration itself is by hand. Three automatic attempts failed and are
recorded in GEOREF.md; don't rebuild them before reading that section. The
render is soft low-contrast splat output and the aerial is a sharp capture from
another year, so they share almost no gradient statistics. What they do share
is a few structures obvious to a person and invisible to a descriptor.

Use `align.html` to read the control points off, which writes them straight
back into the site config.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import geocore          # noqa: E402
import providers        # noqa: E402

from geocore import Mercator, dotted, fit_similarity   # noqa: E402


# ------------------------------------------------------------------ config
def load_site(name_or_path: str) -> tuple[dict, str]:
    p = name_or_path
    if not os.path.exists(p):
        p = os.path.join(HERE, "sites", f"{name_or_path}.geo.json")
    if not os.path.exists(p):
        avail = sorted(f[:-9] for f in os.listdir(os.path.join(HERE, "sites"))
                       if f.endswith(".geo.json"))
        raise SystemExit(f"no such site {name_or_path!r}. available: {avail}")
    with open(p) as fh:
        return json.load(fh), os.path.dirname(os.path.abspath(p))


def resolve(base: str, path: str) -> str:
    """Site paths are relative to the config file, so a site dir can move."""
    path = os.path.expanduser(path)
    return path if os.path.isabs(path) else os.path.normpath(os.path.join(base, path))


def require(cfg: dict, *keys):
    missing = [k for k in keys if k not in cfg]
    if missing:
        raise SystemExit(f"site config missing required key(s): {missing}")


# ------------------------------------------------------------------ holdout
def holdout_render_px(spec, extent):
    """Where the held-out feature sits in the render, in render pixels."""
    rp = spec.get("render_px")
    if isinstance(rp, (list, tuple)):
        return (float(rp[0]), float(rp[1]))
    if isinstance(rp, dict) and rp.get("source") == "track_starts_median":
        if extent is None:
            raise SystemExit("holdout wants track starts but no extent file is configured")
        tracks = dotted(extent, rp.get("extent_path", "nadir.tracks_px"))
        if not tracks:
            raise SystemExit(f"no tracks at {rp.get('extent_path')!r} in the extent file")
        # Each track's px is a flat [x0,y0,x1,y1,...]; the start is the pad.
        starts = [(t["px"][0], t["px"][1]) for t in tracks]
        return (float(np.median([s[0] for s in starts])),
                float(np.median([s[1] for s in starts])))
    raise SystemExit("holdout.render_px must be [x,y] or {source: track_starts_median}")


# --------------------------------------------------------------------- main
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", required=True, help="site name under geo/sites/, or a path")
    ap.add_argument("--out", help="output directory (default geo/out/<site>)")
    ap.add_argument("--allow-restricted-output", action="store_true",
                    help="write a crop even from a provider whose licence "
                         "forbids redistribution. You are asserting you have "
                         "the right to. Off by default for a reason.")
    ap.add_argument("--json", action="store_true", help="print geo.json and nothing else")
    a = ap.parse_args(argv)

    cfg, site_dir = load_site(a.site)
    require(cfg, "centre", "basemap", "render", "control")
    site_key = os.path.basename(a.site).replace(".geo.json", "")
    paths = cfg.get("paths", {})

    # --out is relative to the CWD, like any other CLI flag. Only the paths
    # *inside* a site config are resolved against the config file. Resolving
    # --out against the site dir instead silently writes somewhere nobody
    # asked for -- `--out splat/media` from the repo root landed in
    # tools/geo/sites/splat/media, and looked like it had worked.
    if a.out:
        out_dir = os.path.abspath(os.path.expanduser(a.out))
    else:
        out_dir = os.path.join(HERE, "out", site_key)
    os.makedirs(out_dir, exist_ok=True)

    # ---------------------------------------------------------- the imagery
    fitmap = cfg["basemap"]["fit"]
    prov = providers.get(fitmap["provider"])
    lat, lon = cfg["centre"]
    merc = Mercator(lat, lon, fitmap["ground_m"], fitmap["px"])

    basemap_dir = resolve(site_dir, paths.get("basemap_dir", "."))
    basemap_img = os.path.join(basemap_dir, fitmap.get("file", "basemap.jpg"))
    if not os.path.exists(basemap_img):
        raise SystemExit(f"basemap not found: {basemap_img}\n"
                         f"fetch it:  python3 geo/fetch_basemap.py --site {site_key}")

    # ----------------------------------------------------------- the render
    r = cfg["render"]
    render_dir = resolve(site_dir, paths.get("render_dir", "."))
    render_img = os.path.join(render_dir, r["file"])
    RW, RH = int(r["w"]), int(r["h"])
    px_per_unit = float(r["px_per_unit"])

    extent = None
    if paths.get("extent"):
        ep = resolve(site_dir, paths["extent"])
        if os.path.exists(ep):
            with open(ep) as fh:
                extent = json.load(fh)

    # ---------------------------------------------------------------- fit
    control = cfg["control"]
    if len(control) < 3:
        raise SystemExit(f"need at least 3 control points, config has {len(control)}")
    fit = fit_similarity([c["render_px"] for c in control],
                         [c["basemap_px"] for c in control])

    resid = geocore.residuals_m(fit, control, merc.m_per_px)
    m_per_render_px = fit.scale * merc.m_per_px
    m_per_unit = px_per_unit * m_per_render_px

    # ---------------------------------------------------------------- crop
    margin = int(cfg.get("crop_margin_px", 110))
    corners = [fit.fwd(c) for c in [(0, 0), (RW, 0), (RW, RH), (0, RH)]]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    cx0, cy0 = int(min(xs)) - margin, int(min(ys)) - margin
    cx1, cy1 = int(max(xs)) + margin, int(max(ys)) + margin

    publishable = bool(prov.get("publishable"))
    wrote_aerial = False
    if publishable or a.allow_restricted_output:
        from PIL import Image
        im = Image.open(basemap_img).convert("RGB")
        # The crop box is derived from the render footprint and can hang off
        # the tile when the flight runs near the edge of the basemap. It must
        # still come out exactly (cx1-cx0) x (cy1-cy0): geo.json declares those
        # as aerial.w/h and the page scales the whole figure by them, so a
        # silently smaller image would shift every track and pin on it.
        # Paste onto a black canvas of the declared size instead of shrinking.
        want = (cx1 - cx0, cy1 - cy0)
        box = (max(0, cx0), max(0, cy0), min(im.width, cx1), min(im.height, cy1))
        canvas = Image.new("RGB", want, (0, 0, 0))
        if box[2] > box[0] and box[3] > box[1]:
            canvas.paste(im.crop(box), (box[0] - cx0, box[1] - cy0))
        if box != (cx0, cy0, cx1, cy1):
            print("note   render footprint runs off the basemap; %d x %d crop "
                  "padded. Consider a larger basemap.ground_m." % want)
        canvas.save(os.path.join(out_dir, "aerial.jpg"), quality=82)
        wrote_aerial = True

    tc = (fit.t[0] - cx0, fit.t[1] - cy0)      # render origin inside the crop

    # -------------------------------------------------------------- checks
    checks, check_block = [], {}
    cmap = cfg.get("checks", {})
    if extent is not None and "path_units" in cmap and "seconds" in cmap:
        pu = dotted(extent, cmap["path_units"])
        sec = dotted(extent, cmap["seconds"])
        if pu and sec:
            c = geocore.speed_check(pu, sec, m_per_unit)
            checks.append(c)
            check_block["mean_speed_ms"] = c.value
            check_block["mean_speed_kmh"] = c.value * 3.6
    if extent is not None and "agl_median" in cmap:
        am = dotted(extent, cmap["agl_median"])
        if am:
            checks.append(geocore.agl_check(am, m_per_unit))

    if "holdout" in cfg:
        ho = cfg["holdout"]
        hp = holdout_render_px(ho, extent)
        expect = merc.to_px(ho["latlon"][1], ho["latlon"][0])
        c = geocore.holdout_check(fit, hp, expect, merc.m_per_px)
        c.name = f"holdout_offset ({ho.get('name', 'held-out point')})"
        checks.append(c)
        check_block["launch_offset_m"] = c.value

    # ------------------------------------------------------------- geo.json
    geo = {
        "site": cfg.get("name", site_key),
        "note": "Fitted by hand from control points read by eye. See GEOREF.md. "
                "Render coordinates are plain render pixels.",
        "aerial": {
            "img": "aerial.jpg" if wrote_aerial else None,
            "w": int(cx1 - cx0), "h": int(cy1 - cy0),
            "m_per_px": merc.m_per_px,
            "source": prov["attribution"],
            "publishable": publishable,
            "nw": list(merc.to_lonlat(cx0, cy0)),
            "se": list(merc.to_lonlat(cx1, cy1)),
        },
        # render px -> aerial crop px:  q = scale * R(deg) * p + t
        "fit": {
            "scale": fit.scale, "deg": fit.deg, "tx": tc[0], "ty": tc[1],
            "residual_m": [v for _, v in resid],
            "residual_max_m": max(v for _, v in resid),
            "control": [{"name": c["name"],
                         "render_px": list(c["render_px"]),
                         "basemap_px": list(c["basemap_px"]),
                         "aerial_px": [c["basemap_px"][0] - cx0,
                                       c["basemap_px"][1] - cy0]}
                        for c in control],
        },
        "scale": {
            "m_per_render_px": m_per_render_px,
            "m_per_unit": m_per_unit,
            "north_bearing_deg": fit.north_bearing_deg,
        },
        "check": check_block,
        "checks": [{"name": c.name, "value": c.value, "unit": c.unit,
                    "ok": c.ok, "expect": c.expect, "note": c.note}
                   for c in checks],
        "metric": {k: dotted(extent, p) * m_per_unit
                   for k, p in cfg.get("metrics", {}).items()
                   if extent is not None and dotted(extent, p) is not None},
    }
    geo_path = os.path.join(out_dir, "geo.json")
    with open(geo_path, "w") as fh:
        json.dump(geo, fh, indent=1)

    # ------------------------------------------------------------ Earth KMZ
    kmz_path = None
    if os.path.exists(render_img):
        kml = cfg.get("kml", {})
        desc = (kml.get("description", "") +
                f" One scene unit is about {m_per_unit:.0f} m."
                f" Fit residual under {geo['fit']['residual_max_m']:.0f} m.")
        prefix = cfg.get("outputs", {}).get("prefix", site_key)
        kmz_path = os.path.join(out_dir, f"{prefix}-overlay.kmz")
        geocore.ground_overlay_kmz(
            kmz_path, render_img, fit, merc, RW, RH, m_per_render_px,
            kml.get("name", geo["site"]), desc)

    if a.json:
        print(json.dumps(geo, indent=1))
        return 0

    # -------------------------------------------------------------- report
    print(f"site   {geo['site']}   provider {fitmap['provider']}"
          f"{'' if publishable else '  (fit only, not redistributable)'}")
    print("fit    scale %.4f   rotation %+.2f deg   t (%.1f, %.1f) in the crop"
          % (fit.scale, fit.deg, tc[0], tc[1]))
    for n, v in resid:
        print("       %-38s residual %5.1f m" % (n[:38], v))
    print()
    print("scale  %.4f m per render px" % m_per_render_px)
    print("       %.1f m per scene unit" % m_per_unit)
    print("       straight up in the render is bearing %.1f deg"
          % fit.north_bearing_deg)
    print()
    for c in checks:
        mark = "ok " if c.ok else ("?? " if c.ok is None else "BAD")
        extra = f"  ({c.note})" if c.note else ""
        print("check  %s %-28s %8.1f %-4s  expect %s%s"
              % (mark, c.name[:28], c.value, c.unit, c.expect, extra))
    if any(c.ok is False for c in checks):
        print("\n       A failing check means the scale is wrong however good "
              "the overlay looks.")
    print()
    for k, v in geo["metric"].items():
        print("       %-16s %10.1f m" % (k[:-2] if k.endswith("_m") else k, v))
    print()
    for f in filter(None, ["aerial.jpg" if wrote_aerial else None,
                           "geo.json",
                           os.path.basename(kmz_path) if kmz_path else None]):
        p = os.path.join(out_dir, f)
        print("wrote  %-26s %8.1f KB" % (f, os.path.getsize(p) / 1024))
    if not wrote_aerial:
        print("       aerial.jpg withheld: %s forbids redistribution."
              % prov["attribution"])
        print("       Numbers above are yours; the imagery is not. "
              "--allow-restricted-output overrides.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
