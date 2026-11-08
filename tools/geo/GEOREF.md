# Georeferencing a reconstruction

How to put a splat reconstruction on the ground: recover metres per scene unit,
recover north, and emit a Google Earth overlay. Written up so it can be
generalised from the one site it currently runs on to any site.

Working implementation:
`projects.jonathanearp.xyz/tools/splat/georef.py` (279 lines), with the
control-point picker at `demo-pack/geo/align.html` and the basemap fetcher at
`demo-pack/geo/fetch_naip.py`. It's live as section 10 of
https://projects.jonathanearp.xyz/splat/.

## The problem it solves

A reconstruction built from COLMAP and drone video has no metric scale and no
north. DJI telemetry carries orientation but no GPS, and `NOTES.md` records the
gyro yaw drifting by a median of 21.6 degrees, so neither can be recovered from
the flight data. Everything is in arbitrary viewer units.

Laying the straight-down render over imagery that is already georeferenced fixes
both at once. The scale factor that makes it fit is the number of metres in one
scene unit. The rotation that makes it fit is north.

For Mountain View Cemetery: one scene unit is 113.6 m, the scene sits 9.99
degrees off north, worst control-point residual 7.2 m.

## Pipeline

```
nadir render (px, known px_per_unit)
        │
        │  3+ control points read by eye
        ▼
Umeyama similarity fit  ──►  s, R(θ), t   (4 DOF, no reflection)
        │
        ├─► m_per_render_px = s × m_per_basemap_px
        ├─► m_per_unit      = px_per_unit × m_per_render_px
        └─► north_bearing   = (−θ) mod 360
        │
        ├─► validation: residuals / implied speed / held-out GPS point
        │
        └─► geo.json, cropped aerial.jpg, overlay.kmz
```

### 1. Fetch the basemap

Request the bbox in EPSG:3857 and ask for the image back in EPSG:3857 too. Then
pixels map to ground linearly and you never have to undo a reprojection.

Web Mercator metres are inflated by `1/cos(lat)` — about 1.266 at 37.8°N — so
divide the requested box by `cos(lat)` to end up with the real ground span you
wanted:

```python
K    = math.cos(math.radians(LAT))
cx   = R * math.radians(LON)
cy   = R * math.log(math.tan(math.pi/4 + math.radians(LAT)/2))
half = (BOX_GROUND_M / K) / 2
bbox = (cx - half, cy - half, cx + half, cy + half)
```

with `R = 6378137.0`. Current call is 2400 m across at 2048 px, giving 1.1719
m/px. Pick the box so the whole flight envelope fits with room to spare.

### 2. Pick control points by eye

`align.html` overlays the render on the aerial with drag, scale and rotation
sliders, and converts live. Read each point at high zoom. Use features that are
unambiguous in both images: a sport court corner, a roundabout, a road loop, a
building corner. Avoid tree canopy, shadows and anything that moves between
survey years.

### 3. Fit

Umeyama similarity — rotation, uniform scale, translation, reflection
explicitly disallowed:

```python
def fit_similarity(src, dst):
    P, Q = np.asarray(src, float), np.asarray(dst, float)
    mp, mq = P.mean(0), Q.mean(0)
    A, B = P - mp, Q - mq
    U, S, Vt = np.linalg.svd(A.T @ B)
    D = np.eye(2)
    if np.linalg.det(U @ Vt) < 0:
        D[1, 1] = -1
    Rm = (U @ D @ Vt).T
    s  = float((S * np.diag(D)).sum() / (A ** 2).sum())
    t  = mq - s * (Rm @ mp)
    return s, Rm, t
```

Letting it reflect would hide exactly the class of bug described below, so the
`D[1,1] = -1` guard stays.

### 4. Validate, three ways

Do all three. Any one of them alone can be satisfied by a wrong answer.

**Residuals.** Per control point, in metres. Here: 1.1, 7.2, 7.2. Two of the
points sit 68 px apart in the render, so most of that is pixel-reading error
rather than the transform being wrong. One point much worse than the others
means it was misread, not that the fit is bad — re-read it.

**Physics.** The project knows total path length in units and total flight time
in seconds, so any proposed scale implies a mean speed. This fit implies 14.6
m/s, 53 km/h. An FPV quad cruises 15–30 m/s. A scale implying 5 or 90 m/s is
wrong however good the overlay looks. Implied median height above ground is a
second one of these: it should land in the tens of metres.

**A coordinate held out of the fit.** A GPS point that had no influence on the
transform at all. Here it's the launch pad: the pilot's remembered coordinate
against the median of the nine track start pixels, which lands 71 m away. Any
single GPS fix taken on site works for this.

Three control points against four parameters leaves two degrees of freedom of
redundancy, which is enough to notice one bad point and not enough to average
one out. Five or six points is better if the site offers them.

### 5. Outputs

`geo.json` — the fit, the derived scale, the checks, and every quantity the page
quotes converted to metres:

```jsonc
{
  "aerial": { "img", "w", "h", "m_per_px", "source", "nw":[lon,lat], "se":[lon,lat] },
  "fit":    { "scale", "deg", "tx", "ty",       // render px -> aerial crop px
              "residual_m": [...], "residual_max_m",
              "control": [{ "name", "render_px", "naip_px", "aerial_px" }] },
  "scale":  { "m_per_render_px", "m_per_unit", "north_bearing_deg" },
  "check":  { "mean_speed_ms", "mean_speed_kmh", "launch_offset_m" },
  "metric": { "path_m", "envelope_x_m", "agl_median_m", ... }
}
```

The forward transform is `q = scale · R(deg) · p + t`, render pixel to aerial
crop pixel. Store the *measured* control pixel as well as the fitted one, so a
viewer can draw the residual rather than just quote it.

`aerial.jpg` — the basemap cropped to the render footprint plus a margin, so you
aren't shipping 2400 m of city to show 1200 m of hillside.

`overlay.kmz` — Google Earth. A `GroundOverlay` is an axis-aligned `LatLonBox`
plus a rotation about its centre, which is exactly what a similarity transform
of a rectangle is, so nothing is lost in the conversion. Compute the centre
through the forward transform, convert to lon/lat, and half-extents from
`m_per_render_px`:

```python
dlat = half_h_m / 111320.0
dlon = half_w_m / (111320.0 * math.cos(math.radians(lat_c)))
# <rotation> is -deg
```

Zip `doc.kml` plus the render JPEG into a `.kmz`.

## Basemap sources, and the Google Earth problem

This matters most for the "any area" part, and it's the thing that doesn't
generalise cleanly.

**You cannot use Google Earth or Google Maps imagery as the basemap.** Scraping
their tiles breaks their terms, and there's no licence that lets you redistribute
the result on a public page. Google Earth is an *output* target here — the KMZ
drops onto whatever imagery the viewer already has — not an input.

| source | coverage | resolution | licence |
|---|---|---|---|
| USGS NAIP | US only | 0.6–1 m | public domain, credit only |
| national ortho services (UK OS, PDOK, IGN, Geoscience Australia, …) | one country each | 0.1–0.5 m | varies, often open |
| ESRI World Imagery | global | sub-metre in populated areas | ESRI terms, no redistribution |
| Mapbox / Bing Satellite | global | sub-metre in populated areas | API key, redistribution restricted |
| Sentinel-2 (Copernicus) | global | 10 m | free, attribution |

The practical rule: you need better than about 1 m/px to pick a roundabout out
of an aerial by eye, which rules Sentinel-2 out for control points. So outside
the US it's the national ortho service where one exists, and otherwise a
commercial tile source used for *fitting only* — publish your own render and the
derived numbers, not their imagery.

A clean way to handle this is to separate the two uses in the config: a
`fit_basemap` (can be restricted, never published) and an optional
`publish_basemap` (must be openly licensed, may be absent, in which case the
page shows the render alone with a scale bar).

## Why there's no automatic registration

Three attempts, all failed. Don't rebuild these:

- **SIFT + ratio test + RANSAC.** Four inliers out of eighty candidates. Masking
  the vignette and sweeping six pre-scales didn't rescue it.
- **Brute-force normalised cross-correlation on gradient magnitude**, swept over
  rotation and scale. Converged on a confident-looking peak that put the render
  over the wrong hillside entirely. Every number it implied was plausible, which
  is the dangerous part — the overlay has to be looked at, not just scored. A
  masked `TM_CCORR_NORMED` also rewards smaller templates, so the sweep runs to
  the bottom of the scale range every time unless you normalise for that.
- **The same correlation restricted to a neighbourhood around a hand seed.**
  Peaked at 0.10, which is noise, and ran to the edge of its search bound.

The cause is the same in all three. The render is soft, low-contrast splat
output; the aerial is a sharp summer capture from a different year. They share
almost no gradient statistics. What they do share is a handful of structures
that are obvious to a person and invisible to a descriptor.

Untested ideas, if someone wants another go: mutual information instead of
correlation, which tolerates a monotonic intensity mismatch; extracting road
centrelines or building footprints from both with a segmentation model and
matching those instead of raw pixels; a learned dense matcher such as LoFTR,
which is built for exactly this appearance gap. None of these have been tried
here.

## A camera-matrix bug this caught, and the check that prevents it

`look()` in `tools/splat/scale.py` built its camera basis from `cross(a, f)`,
which is image-**left**, and paired it with an image-down second column. That's
an improper rotation, determinant −1, so every frame rendered through it came
out mirrored left to right.

It was undetectable from inside the project. A scene with no north and no scale
has nothing to be flipped relative to. Georeferencing was the first external
check the reconstruction ever had, and it failed immediately: unflipped, the same
two control points demanded a 63° rotation instead of 10°.

The second effect was worse. A quaternion can't represent a reflection, so
`quat()` was silently returning one for a *different* rotation, and any shot
interpolating between a recorded pose and a `look()` pose eased towards neither.
That put a visible jump cut 11 seconds into the main reel that nobody had
spotted — frame-to-frame change of 55.41 at the seam against a typical 0.14.

Two things to take from it:

1. **Assert the determinant.** Any function returning a camera rotation should
   end with `assert np.linalg.det(R) > 0.999`. It's one line and it would have
   caught this on day one.
2. **Georeference early, not last.** It's the only check in the whole pipeline
   that comes from outside the pipeline.

## What has to be parameterised

Everything below is currently a module-level constant tied to one site.

| constant | file | becomes |
|---|---|---|
| `LAT0`, `LON0` | both | site centre |
| `GROUND_M`, `NAIP_PX` | both | basemap box and size |
| basemap URL | `fetch_naip.py` | provider entry |
| `NADIR_W`, `NADIR_H`, `PX_PER_UNIT` | `georef.py` | read from `extent.json` |
| `CONTROL` | `georef.py` | per-site control points |
| `GEO_SRC` (absolute path) | `georef.py` | relative to the site dir |
| crop margin `110` | `georef.py` | config, or a fraction of the render |
| KML name/description | `georef.py` | config |
| the `metric` block's `extent.json` field names | `georef.py` | a declared mapping |

Suggested shape — `sites/<name>.geo.json`:

```jsonc
{
  "name": "Mountain View Cemetery",
  "centre": [37.834408, -122.230258],
  "basemap": { "provider": "usgs_naip", "ground_m": 2400, "px": 2048 },
  "render":  { "file": "nadir.jpg", "w": 1600, "h": 874, "px_per_unit": 150.4 },
  "control": [
    { "name": "School sport court, NW corner", "render_px": [860.0, 140.0], "basemap_px": [861.0, 759.0] }
  ],
  "holdout": { "name": "launch pad", "latlon": [37.834408, -122.230258] }
}
```

then `python3 georef.py --site mountain-view`. `align.html` takes the same
config and writes the `control` array back out, which removes the
copy-the-numbers-by-hand step that currently sits between the two tools.

`fetch_naip.py` becomes `fetch_basemap.py` with a provider table; the EPSG:3857
bbox maths is identical for every ArcGIS ImageServer and WMS endpoint, so
most providers are a URL template and an attribution string.

## Inputs the reconstruction side has to supply

1. A straight-down render of the merged scene, with its pixel dimensions and its
   `px_per_unit` recorded. Currently `nadir()` in `scale.py`, written into
   `extent.json` as `nadir.scale_px_per_unit`.
2. An approximate centre lat/lon. Only used to decide where to cut the basemap,
   so a few hundred metres of error is fine.
3. Total path length in scene units and total flight time in seconds, for the
   speed check. `extent.json → flight.path`, `flight.seconds`.
4. Median height above local terrain in units, for the second check.
   `extent.json → agl.median`.
5. One GPS coordinate from the site that is not used as a control point.

## Known limits

- **It's a similarity, not a camera model.** The nadir render is a perspective
  camera (`fx` 1487 at height 6.0), not an orthographic projection, so ground
  scale varies across the frame with terrain height. Over relief-light hillside
  that's small — it's the main reason the page quotes 114 m rather than 113.6 —
  but over real relief it isn't. For a high-relief site, fit a homography, or
  correct each control point for its terrain height first. Note that a homography
  can't go into a KML `GroundOverlay`; you'd need `<gx:LatLonQuad>`.
- **No vertical datum.** Everything here is 2D plan. Heights are converted by the
  same scalar and never checked against a DEM. Comparing the reconstruction's
  terrain against a real DEM would be a genuine fourth validation.
- **Survey-year mismatch.** The aerial is from a different year and season than
  the flight. Buildings and roads are safe; vegetation, parked cars and
  earthworks are not.

## Status

Live, with the full write-up and an interactive figure, at
https://projects.jonathanearp.xyz/splat/#map. Working notes, including the
failed attempts in more detail, are in `demo-pack/geo/README.md`.
