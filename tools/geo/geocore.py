#!/usr/bin/env python3
"""
Site-agnostic georeferencing core.

Everything here is a pure function of its arguments. No site constants, no file
paths, no network. `georef.py` supplies a site config and these do the maths, so
the parts that are easy to get wrong can be tested against a known answer.

The three things this computes, from control points read by eye:

    metres per scene unit   = px_per_unit * scale * m_per_basemap_px
    north bearing           = (-rotation) mod 360
    a fit you are allowed to believe, via three independent checks

See GEOREF.md for why the registration is by hand and not automatic.
"""
from __future__ import annotations

import math
import zipfile
from dataclasses import dataclass, field

import numpy as np

R_EARTH = 6378137.0
M_PER_DEG_LAT = 111320.0


# --------------------------------------------------------------- projection
class Mercator:
    """EPSG:3857 box around a centre, and the pixel grid cut from it.

    Request the basemap in 3857 and receive it in 3857, and pixels map to
    ground linearly — no reprojection to undo. Web Mercator metres run
    1/cos(lat) larger than real ones (about 1.266 at 37.8N), so the requested
    box is divided by that to end up `ground_m` of real ground across.
    """

    def __init__(self, lat: float, lon: float, ground_m: float, px: int):
        self.lat, self.lon = lat, lon
        self.ground_m, self.px = float(ground_m), int(px)
        self.k = math.cos(math.radians(lat))
        cx = R_EARTH * math.radians(lon)
        cy = R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
        self.half = (self.ground_m / self.k) / 2
        self.bbox = (cx - self.half, cy - self.half, cx + self.half, cy + self.half)
        self.m_per_px = self.ground_m / self.px

    def to_lonlat(self, i: float, j: float) -> tuple[float, float]:
        """Basemap pixel (i right, j down) -> (lon, lat) degrees."""
        x = self.bbox[0] + (i / self.px) * (2 * self.half)
        y = self.bbox[3] - (j / self.px) * (2 * self.half)
        return (math.degrees(x / R_EARTH),
                math.degrees(2 * math.atan(math.exp(y / R_EARTH)) - math.pi / 2))

    def to_px(self, lon: float, lat: float) -> tuple[float, float]:
        """(lon, lat) degrees -> basemap pixel. Inverse of to_lonlat."""
        x = R_EARTH * math.radians(lon)
        y = R_EARTH * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
        i = (x - self.bbox[0]) / (2 * self.half) * self.px
        j = (self.bbox[3] - y) / (2 * self.half) * self.px
        return (i, j)

    def corners_lonlat(self) -> dict:
        """Corners of the full basemap tile, for anyone putting it on a map."""
        return {"nw": list(self.to_lonlat(0, 0)),
                "se": list(self.to_lonlat(self.px, self.px))}


# ---------------------------------------------------------------------- fit
@dataclass
class Fit:
    scale: float
    deg: float
    t: np.ndarray
    R: np.ndarray

    def fwd(self, p) -> np.ndarray:
        return self.scale * (self.R @ np.asarray(p, float)) + self.t

    @property
    def north_bearing_deg(self) -> float:
        """Compass bearing of straight-up in the render."""
        return (-self.deg) % 360


def fit_similarity(src, dst) -> Fit:
    """Umeyama similarity: rotation + uniform scale + translation, 4 DOF.

    Reflection is explicitly disallowed. Letting it reflect would silently
    absorb a mirrored render — which is exactly the determinant -1 camera bug
    GEOREF.md records this process catching — so the D[1,1] = -1 guard stays.
    """
    P, Q = np.asarray(src, float), np.asarray(dst, float)
    if P.shape != Q.shape or P.shape[0] < 3:
        raise ValueError(f"need >=3 matched points, got {P.shape[0]}")
    mp, mq = P.mean(0), Q.mean(0)
    A, B = P - mp, Q - mq
    U, S, Vt = np.linalg.svd(A.T @ B)
    D = np.eye(2)
    if np.linalg.det(U @ Vt) < 0:
        D[1, 1] = -1
    Rm = (U @ D @ Vt).T
    s = float((S * np.diag(D)).sum() / (A ** 2).sum())
    t = mq - s * (Rm @ mp)
    assert np.linalg.det(Rm) > 0.999, "fitted rotation is a reflection"
    return Fit(scale=s, deg=math.degrees(math.atan2(Rm[1, 0], Rm[0, 0])),
               t=t, R=Rm)


# -------------------------------------------------------------- validation
@dataclass
class Check:
    name: str
    value: float
    unit: str
    ok: bool | None
    expect: str
    note: str = ""


def residuals_m(fit: Fit, control, m_per_basemap_px: float):
    """Per-control-point residual in metres.

    One point much worse than the others means it was misread, not that the
    fit is wrong. Re-read it rather than re-fitting around it.
    """
    out = []
    for c in control:
        d = np.hypot(*(fit.fwd(c["render_px"]) - np.asarray(c["basemap_px"], float)))
        out.append((c["name"], float(d * m_per_basemap_px)))
    return out


def speed_check(path_units: float, seconds: float, m_per_unit: float) -> Check:
    """Implied mean flight speed. An FPV quad cruises 15-30 m/s.

    A scale implying 5 or 90 m/s is wrong however good the overlay looks.
    """
    v = path_units * m_per_unit / seconds
    return Check("mean_speed", v, "m/s", 5.0 <= v <= 40.0,
                 "15-30 m/s for an FPV quad, 5-40 tolerated",
                 f"{v * 3.6:.0f} km/h")


def agl_check(agl_median_units: float, m_per_unit: float) -> Check:
    """Implied median height above local terrain. Should be tens of metres."""
    h = agl_median_units * m_per_unit
    return Check("agl_median", h, "m", 2.0 <= h <= 200.0,
                 "tens of metres for low FPV flight")


def holdout_check(fit: Fit, render_px, expect_basemap_px,
                  m_per_basemap_px: float) -> Check:
    """A coordinate with no influence on the transform at all.

    Any single GPS fix taken on site works. Here it is typically the launch
    pad: a remembered coordinate against the median of the track starts.
    """
    d = np.hypot(*(fit.fwd(render_px) - np.asarray(expect_basemap_px, float)))
    m = float(d * m_per_basemap_px)
    return Check("holdout_offset", m, "m", m <= 150.0,
                 "within ~150 m for a remembered coordinate")


# --------------------------------------------------------------- KML output
def ground_overlay_kmz(path, image_path, fit: Fit, merc: Mercator,
                       render_w: int, render_h: int, m_per_render_px: float,
                       name: str, description: str, opacity_hex: str = "d9"):
    """Write a Google Earth .kmz.

    A GroundOverlay is an axis-aligned LatLonBox plus a rotation about its
    centre, which is exactly what a similarity transform of a rectangle is, so
    nothing is lost. (A homography would not fit here — that needs
    <gx:LatLonQuad>.)
    """
    cen = fit.fwd((render_w / 2, render_h / 2))
    lon_c, lat_c = merc.to_lonlat(cen[0], cen[1])
    dlat = (render_h * m_per_render_px / 2) / M_PER_DEG_LAT
    dlon = (render_w * m_per_render_px / 2) / (
        M_PER_DEG_LAT * math.cos(math.radians(lat_c)))
    kml = f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
 <Folder>
  <name>{_esc(name)}</name>
  <description>{_esc(description)}</description>
  <GroundOverlay>
   <name>Nadir render</name>
   <color>{opacity_hex}ffffff</color>
   <Icon><href>render.jpg</href></Icon>
   <LatLonBox>
    <north>{lat_c + dlat:.8f}</north>
    <south>{lat_c - dlat:.8f}</south>
    <east>{lon_c + dlon:.8f}</east>
    <west>{lon_c - dlon:.8f}</west>
    <rotation>{-fit.deg:.4f}</rotation>
   </LatLonBox>
  </GroundOverlay>
 </Folder>
</kml>
"""
    # Pin both entries' timestamps. A zip records mtimes, so without this an
    # unchanged rebuild produces different bytes and shows up as a spurious
    # diff on an artifact that is committed. The KMZ should change when its
    # contents change and not otherwise.
    stamp = (1980, 1, 1, 0, 0, 0)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        zi = zipfile.ZipInfo("doc.kml", date_time=stamp)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = 0o644 << 16
        z.writestr(zi, kml)
        with open(image_path, "rb") as fh:
            img = fh.read()
        zi = zipfile.ZipInfo("render.jpg", date_time=stamp)
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = 0o644 << 16
        z.writestr(zi, img)
    return {"centre_lonlat": [lon_c, lat_c], "rotation": -fit.deg}


def _esc(s: str) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


# ------------------------------------------------------------------ helpers
def dotted(obj, path: str, default=None):
    """Resolve 'flight.path' against a nested dict. Used by the metric map."""
    cur = obj
    for part in path.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return default
    return cur
