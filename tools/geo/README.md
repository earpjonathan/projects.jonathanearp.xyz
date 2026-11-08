# geo — put a reconstruction on the ground

Recovers **metres per scene unit** and **north** for a splat reconstruction
that has neither, by fitting its straight-down render to aerial imagery that is
already georeferenced. Emits `geo.json`, a cropped `aerial.jpg`, and a Google
Earth `.kmz`.

The method, the failed automatic attempts, and the camera bug this caught are
written up in [`GEOREF.md`](GEOREF.md), which travels with the code here.
This is the implementation of the
"what has to be parameterised" section of that document: one site is a config
file, not a set of module constants.

```
tools/geo/
  geocore.py         maths, pure, no site in it
  providers.py       basemap providers + the licence gate
  fetch_basemap.py   fetch a site's aerial
  georef.py          fit, check, emit          <- the main entry point
  align.html         control point picker
  serve_align.py     serves the picker with the site's images mounted
  test_georef.py     regression against the known-good answer
  sites/*.geo.json   one file per site
  basemap/           aerials, so a clone can rebuild without the network
  fixtures/          the pre-generalisation answer the test checks against
  GEOREF.md          the method, and why registration is by hand
```

## Requirements

`numpy` and `Pillow`. Nothing else; the fetcher uses the standard library.
The project venv at `~/Desktop/fpv-splat/.venv` has both — a bare `python3`
on this machine does not, which is equally true of `tools/splat/`.
Substitute it for `python3` below if you hit a `ModuleNotFoundError`.

## Use it

```bash
python3 tools/geo/fetch_basemap.py --site mountain-view     # pull the aerial
python3 tools/geo/serve_align.py   --site mountain-view     # pick control points
python3 tools/geo/georef.py        --site mountain-view     # fit and emit
```

Outputs land in `tools/geo/out/<site>/` (gitignored) unless you pass
`--out`. To regenerate what the live page serves:

```bash
python3 tools/geo/georef.py --site mountain-view --out splat/media
```

## What it prints

```
site   Mountain View Cemetery   provider usgs_naip
fit    scale 0.6447   rotation +9.99 deg   t (208.2, 110.2) in the crop
       School sport court, north-west corner  residual   1.1 m
       Cemetery roundabout                    residual   7.2 m
       Cemetery circular road loop            residual   7.2 m

scale  0.7555 m per render px
       113.6 m per scene unit
       straight up in the render is bearing 350.0 deg

check  ok  mean_speed                  14.6 m/s  expect 15-30 m/s …  (53 km/h)
check  ok  agl_median                  11.8 m    expect tens of metres …
check  ok  holdout_offset (launch pad) 71.5 m    expect within ~150 m …
```

## The three checks

Do all three. **Any one of them alone can be satisfied by a wrong answer** —
one of the failed automatic attempts produced a confident-looking fit over
entirely the wrong hillside, and every number it implied was plausible.

| check | what it catches |
|---|---|
| **residuals** | a misread control point. One point much worse than the rest was misread — re-read it, don't re-fit around it. |
| **physics** | a wrong scale. The scale implies a mean flight speed; an FPV quad cruises 15–30 m/s. A fit implying 5 or 90 m/s is wrong however good the overlay looks. Implied median height above ground is the second of these. |
| **holdout** | everything else. A coordinate with no influence on the transform at all — any single GPS fix from the site. |

Three control points against four parameters leaves two degrees of redundancy:
enough to notice one bad point, not enough to average one out. Five or six is
better if the site offers them.

## Adding a site

1. `cp tools/geo/sites/_template.geo.json tools/geo/sites/mysite.geo.json` and fill in the
   centre, the render's dimensions and `px_per_unit`.
2. `python3 tools/geo/fetch_basemap.py --site mysite --dry-run` to check the box and
   the provider, then drop `--dry-run`.
3. `python3 tools/geo/serve_align.py --site mysite`, open the printed URL, and read
   control points off at high zoom. Click a feature in the render, then the
   same feature on the basemap. Use unambiguous things — a sport court corner,
   a roundabout, a building corner. Avoid tree canopy, shadows, and anything
   that moves between survey years.
4. The header shows the fit live. When the residuals look right, **Download
   updated config** and drop it back over `tools/geo/sites/mysite.geo.json`.
5. `python3 tools/geo/georef.py --site mysite`.

The picker's fit is the same Umeyama similarity as `geocore.fit_similarity` —
verified to agree to ~1e-15 — so the numbers in its header are the numbers
`georef.py` will print.

## Basemap providers, and the licence gate

`python3 tools/geo/fetch_basemap.py --list-providers`

**You cannot use Google Earth or Google Maps imagery as the basemap.** Scraping
their tiles breaks their terms and no licence lets you republish the result.
Google Earth is an *output* target here — the KMZ drops onto whatever imagery
the viewer already has — never an input.

Each provider carries a `publishable` flag. A restricted provider may be used
to **fit** (you need good imagery to read a roundabout by eye), but `georef.py`
will not write its pixels into `aerial.jpg`:

```
wrote  geo.json
       aerial.jpg withheld: Esri World Imagery forbids redistribution.
       Numbers above are yours; the imagery is not.
```

`--allow-restricted-output` overrides it, and asserts you have the right to.
The derived numbers — scale, north, every metric — are yours either way.

Only providers whose endpoint shape is verified ship in `providers.py`. Add
your own in `tools/geo/providers.local.json`; two adapters (`arcgis`, `wms`) cover
most national ortho services, since the EPSG:3857 bbox maths is identical for
all of them. You need better than ~1 m/px to read control points by eye, which
rules out Sentinel-2 for this.

## Tests

```bash
python3 tools/geo/test_georef.py
```

Checks the Mercator round-trip, the reflection guard, and — the important one —
that driving Mountain View from a config file reproduces the original
hand-written `tools/splat/georef.py` **bit for bit**: fit, residuals, scale,
north, checks, crop geometry and every derived metric.

One field, `launch_offset_m`, is allowed 1e-6 m of slack. The original
hardcoded the held-out point as the tile centre, literally `(px/2, px/2)`; this
projects the holdout's lon/lat through the inverse Mercator so it works for a
holdout anywhere. The round-trip lands 2.8e-10 px off exact, which is 3.5e-10 m.
That is the whole difference.

## Limits

Carried over from GEOREF.md, and still true here:

- **It is a similarity, not a camera model.** The nadir render is a perspective
  camera, so ground scale varies across the frame with terrain height. Small
  over relief-light hillside; not small over real relief. For a high-relief
  site, fit a homography or correct each control point for its terrain height
  first — but note a homography cannot go into a KML `GroundOverlay`, which
  needs `<gx:LatLonQuad>`.
- **No vertical datum.** Everything is 2D plan. Heights are converted by the
  same scalar and never checked against a DEM. Comparing the reconstruction's
  terrain to a real DEM would be a genuine fourth validation.
- **Survey-year mismatch.** The aerial is a different year and season than the
  flight. Buildings and roads are safe; vegetation, parked cars and earthworks
  are not.
- **Registration is by hand.** Three automatic attempts failed; GEOREF.md says
  which and why. Don't rebuild them before reading that section.
