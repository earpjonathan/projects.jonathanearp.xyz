#!/usr/bin/env python3
"""
Georeferences the straight-down render against USGS NAIP aerial imagery, and
writes everything the page needs to show the two on top of each other.

Why this exists
---------------
The reconstruction has no metric scale. The telemetry carries orientation and
no GPS, and NOTES.md records the gyro yaw drifting by a median of 21.6 degrees,
so neither north nor metres can be recovered from the flight data. Every
distance on the page is in viewer units.

Laying the nadir render over imagery that is already georeferenced fixes both at
once. The scale factor that makes it fit is the number of metres in one scene
unit, and the rotation that makes it fit is north.

How the fit was made
--------------------
Not automatically. Three attempts failed and are recorded in the page: SIFT with
RANSAC, brute-force normalised cross-correlation on gradients, and the same
correlation restricted to a small neighbourhood around a hand seed. The render
is soft, low-contrast splat output and NAIP is a sharp summer frame from another
year, so neither descriptors nor edge statistics survive the gap. The last of
the three peaked at 0.10, which is noise.

So the control points below were read off by eye at high zoom, the way a
georeferencing job is actually done, and a similarity transform is fitted to
them here. Each one is a feature that is unambiguous in both images.

The fit is checked three ways, all in the module docstring of the page section:
the residuals, the physics (an implied mean flight speed that has to look like
an FPV quad), and the launch coordinate the pilot gave from memory, which is
held out of the fit entirely and lands 71 m away.

    python3 tools/splat/georef.py
"""
import sys

# ---------------------------------------------------------------- SUPERSEDED
# Replaced by tools/geo/, which takes the site as a config file
# instead of the module constants below, and so runs for any site.
#
#     python3 ~/Desktop/fpv-splat/geo/georef.py --site mountain-view \
#             --out splat/media
#
# tools/geo/test_georef.py checks the replacement reproduces this file's output bit
# for bit: fit, residuals, scale, north, crop geometry and every metric.
#
# This script still writes the OLD key names (control[].naip_px rather than
# basemap_px) and would quietly revert splat/media/geo.json, so it refuses to
# run. It is kept for history and for that regression reference.
if __name__ == "__main__":
    sys.exit(
        "tools/splat/georef.py is superseded and does not run.\n"
        "Use:  python3 tools/geo/georef.py --site mountain-view "
        "--out splat/media\n"
        "See the georeferencing section of README.md.")

import json
import math
import os
import shutil
import subprocess
import zipfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MEDIA = os.path.join(ROOT, "splat", "media")
GEO_SRC = "/Users/jonathanearp/Desktop/fpv-splat/demo-pack/geo"

# ---------------------------------------------------------------- the imagery
# naip.jpg as fetch_naip.py pulls it: EPSG:3857 in and out, so pixels map to
# ground linearly. Web Mercator metres run 1/cos(lat) larger than real ones,
# about 1.266 here, and that is divided out before the box is cut.
LAT0, LON0 = 37.834408, -122.230258      # the launch point the pilot gave
GROUND_M, NAIP_PX = 2400.0, 2048
R_EARTH = 6378137.0

K = math.cos(math.radians(LAT0))
CX = R_EARTH * math.radians(LON0)
CY = R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(LAT0) / 2))
HALF = (GROUND_M / K) / 2
BBOX = (CX - HALF, CY - HALF, CX + HALF, CY + HALF)
MPP_NAIP = GROUND_M / NAIP_PX            # 1.1719 m per NAIP pixel


def naip_to_lonlat(i, j):
    """NAIP pixel (i right, j down) to (lon, lat) in degrees."""
    x = BBOX[0] + (i / NAIP_PX) * (2 * HALF)
    y = BBOX[3] - (j / NAIP_PX) * (2 * HALF)
    return (math.degrees(x / R_EARTH),
            math.degrees(2 * math.atan(math.exp(y / R_EARTH)) - math.pi / 2))


# ---------------------------------------------------------------- the render
# This fit is what caught the mirror bug. look() in tools/splat/scale.py used
# to return a matrix with determinant -1, so every figure rendered through it
# came out flipped left to right, and holding the nadir render against real
# aerial imagery was the first external check the reconstruction had ever had.
# Unflipped, the same two control points demanded a 63 degree rotation instead
# of 10.
#
# look() is fixed, so nadir.jpg is now the right way round and the control
# points below are plain nadir.jpg pixels with no flip anywhere.
NADIR_W, NADIR_H = 1600, 874
PX_PER_UNIT = 150.4                      # extent.json nadir.scale_px_per_unit

# (name, nadir.jpg px, NAIP px)
CONTROL = [
    ("School sport court, north-west corner", (860.0, 140.0), (861.0, 759.0)),
    ("Cemetery roundabout",                   (593.8, 498.8), (648.0, 952.0)),
    ("Cemetery circular road loop",           (650.0, 537.0), (688.8, 990.4)),
]


def launch_px(extent):
    """Where the drone sat on the ground, in nadir pixels.

    Held out of the fit. The pilot gave the coordinate from memory as "right
    around", so it is a check on the answer and never an input to it. Taken
    from the data rather than typed: eight of the nine clips begin within about
    twenty pixels of each other, which is the pad.
    """
    starts = [(t["px"][0], t["px"][1]) for t in extent["nadir"]["tracks_px"]]
    return (float(np.median([s[0] for s in starts])),
            float(np.median([s[1] for s in starts])))


def fit_similarity(src, dst):
    """Umeyama similarity, rotation + uniform scale + translation, no reflection."""
    P, Q = np.asarray(src, float), np.asarray(dst, float)
    mp, mq = P.mean(0), Q.mean(0)
    A, B = P - mp, Q - mq
    U, S, Vt = np.linalg.svd(A.T @ B)
    D = np.eye(2)
    if np.linalg.det(U @ Vt) < 0:
        D[1, 1] = -1
    Rm = (U @ D @ Vt).T
    s = float((S * np.diag(D)).sum() / (A ** 2).sum())
    t = mq - s * (Rm @ mp)
    return s, Rm, t


def main():
    s, Rm, t = fit_similarity([c[1] for c in CONTROL], [c[2] for c in CONTROL])
    deg = math.degrees(math.atan2(Rm[1, 0], Rm[0, 0]))

    def fwd(p):
        return s * (Rm @ np.asarray(p, float)) + t

    resid = [(n, float(np.hypot(*(fwd(p) - np.asarray(q))) * MPP_NAIP))
             for n, p, q in CONTROL]

    mpp_render = s * MPP_NAIP
    m_per_unit = PX_PER_UNIT * mpp_render

    extent = json.load(open(os.path.join(MEDIA, "extent.json")))
    pad = fwd(launch_px(extent))
    pad_err = float(np.hypot(pad[0] - NAIP_PX / 2, pad[1] - NAIP_PX / 2) * MPP_NAIP)

    # ------------------------------------------------------------ the crop
    # Only the part of the aerial the render actually covers, plus a margin, so
    # the page is not shipping 2400 m of Oakland to show 1200 m of hillside.
    corners = [fwd(c) for c in
               [(0, 0), (NADIR_W, 0), (NADIR_W, NADIR_H), (0, NADIR_H)]]
    xs = [c[0] for c in corners]
    ys = [c[1] for c in corners]
    cx0, cy0 = int(min(xs)) - 110, int(min(ys)) - 110
    cx1, cy1 = int(max(xs)) + 110, int(max(ys)) + 110

    import cv2
    naip = cv2.imread(os.path.join(GEO_SRC, "naip.jpg"))
    crop = naip[cy0:cy1, cx0:cx1]
    cv2.imwrite(os.path.join(MEDIA, "aerial.jpg"), crop,
                [cv2.IMWRITE_JPEG_QUALITY, 82])

    # the render's own placement inside that crop, which is what the page draws
    tc = (t[0] - cx0, t[1] - cy0)

    fl = extent["flight"]
    agl = extent["agl"]
    U = m_per_unit

    geo = {
        "note": "Fitted by hand from three control points. See tools/splat/georef.py. "
                "Render coordinates are plain nadir.jpg pixels; the determinant -1 "
                "mirror in look() was fixed before this was generated.",
        "aerial": {
            "img": "aerial.jpg",
            "w": int(cx1 - cx0), "h": int(cy1 - cy0),
            "m_per_px": MPP_NAIP,
            "source": "USGS NAIP (public domain)",
            # corners of the crop, for anyone who wants to put it on a real map
            "nw": list(naip_to_lonlat(cx0, cy0)),
            "se": list(naip_to_lonlat(cx1, cy1)),
        },
        # nadir.jpg px -> aerial crop px:  q = scale * R(deg) * p + t
        "fit": {
            "scale": s, "deg": deg, "tx": tc[0], "ty": tc[1],
            "residual_m": [r for _, r in resid],
            "residual_max_m": max(r for _, r in resid),
            # aerial_px is where the figure draws the pin: the MEASURED
            # position, so the gap between it and the fitted one is the
            # residual the figure prints beside it.
            "control": [{"name": n, "render_px": list(p), "naip_px": list(q),
                         "aerial_px": [q[0] - cx0, q[1] - cy0]}
                        for n, p, q in CONTROL],
        },
        "scale": {
            "m_per_render_px": mpp_render,
            "m_per_unit": U,
            "north_bearing_deg": (-deg) % 360,   # compass bearing of straight up in nadir.jpg
        },
        "check": {
            "mean_speed_ms": fl["path"] * U / fl["seconds"],
            "mean_speed_kmh": fl["path"] * U / fl["seconds"] * 3.6,
            "launch_offset_m": pad_err,
        },
        "metric": {
            "path_m": fl["path"] * U,
            "envelope_x_m": fl["x"] * U,
            "envelope_z_m": fl["z"] * U,
            "separation_m": extent["separation"] * U,
            "agl_median_m": agl["median"] * U,
            "agl_p10_m": agl["p10"] * U,
            "agl_p90_m": agl["p90"] * U,
            "crop_radius_m": extent["crop_radius"] * U,
            "nadir_camera_m": extent["nadir"]["height"] * U,
            "top_view_m": extent["site"]["top"]["height"] * U,
            "plan_r90_m": extent["splat_plan_radius"]["90"] * U,
        },
    }
    json.dump(geo, open(os.path.join(MEDIA, "geo.json"), "w"), indent=1)

    # ------------------------------------------------------------ Google Earth
    # A GroundOverlay is an axis-aligned LatLonBox plus a rotation about its
    # centre, which is exactly what a similarity transform of a rectangle is.
    cen = fwd((NADIR_W / 2, NADIR_H / 2))
    lon_c, lat_c = naip_to_lonlat(cen[0], cen[1])
    half_w_m = NADIR_W * mpp_render / 2
    half_h_m = NADIR_H * mpp_render / 2
    dlat = half_h_m / 111320.0
    dlon = half_w_m / (111320.0 * math.cos(math.radians(lat_c)))
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
 <Folder>
  <name>S.P.L.O.O.G.E reconstruction</name>
  <description>3D Gaussian Splatting reconstruction seen from directly above,
   placed on the ground by hand against USGS NAIP imagery.
   One scene unit is about {U:.0f} m. Fit residual under {max(r for _, r in resid):.0f} m.</description>
  <GroundOverlay>
   <name>Nadir render</name>
   <color>d9ffffff</color>
   <Icon><href>render.jpg</href></Icon>
   <LatLonBox>
    <north>{lat_c + dlat:.8f}</north>
    <south>{lat_c - dlat:.8f}</south>
    <east>{lon_c + dlon:.8f}</east>
    <west>{lon_c - dlon:.8f}</west>
    <rotation>{-deg:.4f}</rotation>
   </LatLonBox>
  </GroundOverlay>
 </Folder>
</kml>
"""
    nad = cv2.imread(os.path.join(MEDIA, "nadir.jpg"))
    tmp = os.path.join(MEDIA, "_render_geo.jpg")
    cv2.imwrite(tmp, nad, [cv2.IMWRITE_JPEG_QUALITY, 86])
    kmz = os.path.join(MEDIA, "splooge-overlay.kmz")
    with zipfile.ZipFile(kmz, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("doc.kml", kml)
        z.write(tmp, "render.jpg")
    os.remove(tmp)

    # ------------------------------------------------------------ report
    print("fit    scale %.4f   rotation %+.2f deg   t (%.1f, %.1f) in the crop"
          % (s, deg, tc[0], tc[1]))
    for n, r in resid:
        print("       %-38s residual %4.1f m" % (n, r))
    print()
    print("scale  %.4f m per render px" % mpp_render)
    print("       %.1f m per scene unit" % U)
    print("       straight up in nadir.jpg is bearing %.1f deg" % ((-deg) % 360))
    print()
    print("check  mean flight speed %.1f m/s (%.0f km/h), FPV cruise is 15-30"
          % (geo["check"]["mean_speed_ms"], geo["check"]["mean_speed_kmh"]))
    print("       median height above ground %.1f m" % geo["metric"]["agl_median_m"])
    print("       held-out launch point lands %.0f m from the given coordinate" % pad_err)
    print()
    for k, v in geo["metric"].items():
        print("       %-16s %8.1f m" % (k[:-2], v))
    print()
    for f in ("aerial.jpg", "geo.json", "splooge-overlay.kmz"):
        p = os.path.join(MEDIA, f)
        print("wrote  splat/media/%-22s %7.1f KB" % (f, os.path.getsize(p) / 1024))


if __name__ == "__main__":
    main()
