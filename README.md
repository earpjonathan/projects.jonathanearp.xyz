# projects.jonathanearp.xyz

Side-projects section of [jonathanearp.xyz](https://jonathanearp.xyz). Static, no
build step, no dependencies. Deployed with GitHub Pages exactly like the other
four sites.

Five projects so far, each with a backronym for a name. The two main ones come
first on the index: S.P.L.O.O.G.E (structure-from-motion, poses, levelling,
optimisation, orientation, Gaussians, export), two drone flights rebuilt as one
3D reconstruction and written up as a paper, and P.E.T.E.R (pipeline for edge
tracing and expression rendering), which renders video clips as Desmos
graphing-calculator animations. After those come three shorter case studies,
newest first: S.H.R.E.D (search, highlight, read-back, emphasis, docx), Y.A.N.K
(yank-safe auto-unmount, NAS kept local) and S.U.D.O (Synology under distrustful
oversight). Every page shows the backronym down the left of the hero with each
letter's word beside it. The index only lists the names.

```
index.html          Project index
desmos/
  index.html        Case study
  data.js           Measured data, inlined (generated, see below)
  charts.js         The five figures, drawn as inline SVG
  interactive.js    The four playable demos
splat/
  index.html        Case study, laid out as a paper
  data.js           Every measurement the page quotes
  charts.js         The eight static figures, inline SVG
  interactive.js    The six canvas demos
  viewer.js         The live WebGL splat renderer
  page.js           Negative-results table, A/B wipe, viewer controls
  media/            Video, stills, the cropped splat asset (see below)
nas/                S.U.D.O case study; page.js is the classifier demo
shuttle/            Y.A.N.K case study; page.js is the lid-close demo
cards/              S.H.R.E.D case study; page.js is the two-cuts demo
bars.js             Horizontal bar figures for the three shorter pages
style.css           ORYZO shared base + projects-specific styles
script.js           Theme toggle, scroll reveal, chapter nav
topo.js             Topographic canvas background (copied verbatim from Research)
data/*.json         Source measurements, kept for provenance
tools/splat/        Regenerates splat/media from the fpv-splat repo
assets/             Favicon, apple-touch-icon
CNAME               projects.jonathanearp.xyz
```

## The interactive demos

`desmos/interactive.js` holds four of them, and they run the real algorithms on
live input:

| demo | what it actually does |
|---|---|
| trace | Sobel edge detection, Moore-neighbourhood border following and Ramer–Douglas–Peucker simplification, live on a canvas |
| chunks | evaluates the gate and clamped-index expressions for whatever `n` the slider is on |
| settle | models one Desmos update with a ~55 ms stall in the middle, then applies the settle rule; `stable=2` captures a frame with no character in it, `stable=4` and up do not |
| timeline | v0 → v4, with the measured numbers for each |

The settle demo's stall is sized between 2 and 4 animation frames,
because that is what the real measurements imply: `stable=2` was wrong on 39 of
40 frames and `stable=4` was correct on all 40. If you ever re-measure and those
numbers move, move the stall too.

The trace demo's subject is drawn in code in `drawSubject()`. It is a cat, in
colour, so that the grayscale step is visibly a step. Don't swap in a real
frame, because that would put copyrighted footage in the repo.

## The three shorter pages

`nas/`, `shuttle/` and `cards/` write up repos of the same names under
github.com/earpjonathan (S.U.D.O, Y.A.N.K, S.H.R.E.D). They have no
data files: every number on them is quoted from that repo's README, reports,
tests or logs, and the few bar charts take their numbers inline through
`data-hbars` (see `bars.js`).

- `nas/page.js` holds the classifier's real verdicts for 14 commands, copied
  from `CommandClassifier.classify()` run against `config.example.toml` (admin
  mode off). If the classifier changes, re-run it and paste the answers in. The
  demo doesn't re-implement it.
- `shuttle/page.js` follows the daemon's decision path in
  `src/ejectd/main.swift`, with the measured timings.
- `cards/page.js` cuts a paragraph written for the page. Don't swap in a
  real card. The team's files and the articles they quote stay out of every
  public repo.

## The splat page

`splat/` is a write-up of a separate repo, [S.P.L.O.O.G.E] (checked out locally
as `~/Desktop/fpv-splat`), and nothing on the page is drawn by hand. Every
number is in `splat/data.js`, and every still and every video frame was rendered
by
`scripts/raster.py` in that repo, a CPU
reimplementation of the web viewer's rasteriser that matches it down to the
half-float packing and the blend arithmetic. That's why the A/B pair in Figure 8
counts as evidence: both halves came out of the same renderer with one parameter
changed.

[S.P.L.O.O.G.E]: https://github.com/earpjonathan/S.P.L.O.O.G.E

### What is in `splat/media`

| file | what it is |
|---|---|
| `flythrough.mp4`, `flythrough-poster.jpg` | 14 s of clip 0057, footage on the left and the reconstruction rendered from the same recorded pose on the right |
| `znear_old.jpg`, `znear_fix.jpg` | the same camera at `znear` 0.2 and 0.01, 900×675, the two halves of the wipe |
| `scene.splat`, `scene.json` | the 207,942-splat crop the live viewer loads, plus its cameras and an 18-second segment of the real flight |
| `map.png`, `map.json` | top-down density of the 3.2 M triangulated points inside the flight envelope, and the nine tracks over it |
| `gyro.json` | 26 s of raw 50 Hz telemetry quaternions from clip 0057 |
| `poses.json` | bottom-third hole fraction at 72 poses, before and after the fix |
| `sweep.json`, `sweep/*.jpg` | four poses × seven near planes, all 28 rendered and measured |
| `reel.mp4`, `reel-poster.jpg` | 40 s of camera moves that leave the flight corridor, hard-cut into five shots: the 16 s climb-and-orbit, a run west off the crest, a level pass at 3× flight altitude, a move from session 1 to session 2, and a descent straight down. Rendered at 1280×720 and encoded down to 1024×576 |
| `ladder/0.jpg`–`6.jpg` | the same climb as seven stills, from the recorded pose to 2.0 units, same lens throughout |
| `nadir.jpg` | the whole reconstruction straight down from 6.0 units, 1600×874, with the flight tracks projected to pixels |
| `site.splat` | a 400,000-splat whole-site LOD the live viewer can swap to, floaters and sky dome removed |
| `extent.json` | every measured number the scale figures quote, plus the ladder heights, the nadir projection, the aerial camera poses, and the reel's shot boundaries in seconds |

### Regenerating it

`tools/splat/` holds the generators. They import the rasteriser out of the
fpv-splat repo, so they need it checked out with its `viewer/` assets present:

```bash
python3 tools/splat/assets.py   --project ~/Desktop/fpv-splat
python3 tools/splat/figures.py  --project ~/Desktop/fpv-splat
python3 tools/splat/sweep.py    --project ~/Desktop/fpv-splat
python3 tools/splat/flythrough.py --project ~/Desktop/fpv-splat
python3 tools/splat/scale.py    --project ~/Desktop/fpv-splat --only stills
python3 tools/splat/scale.py    --project ~/Desktop/fpv-splat --only pull --w 1280 --h 720 --procs 12
python3 tools/geo/georef.py --site mountain-view --out splat/media
```

`scale.py` runs twice because the two halves want different frame sizes: the
ladder stills are 800x450 and the reel is rendered at 1280x720 and encoded down
to 1024x576.

`assets.py` reproduces `scene.splat`, `scene.json` and `gyro.json`
byte-for-byte. The crop rule is worth knowing if you ever change it: keep every
splat within 0.7 scene units of camera 2500, drop everything below the lowest
camera in the flight, then add back the 40,000 most important splats beyond that
radius so the horizon doesn't end in a wall. Without the far set, the crop looks
like a diorama.

The levelling transform puts up on `-Y`, so a larger `y` is *lower*. This is
easy to get backwards and both generators depend on it: `assets.py` cuts at
`y < 0.4065`, just under the lowest camera, and `scale.py` cuts at `y < -2.23`,
just above the highest one.

`scale.py` renders everything the scale chapter uses: the reel, the seven
ladder stills, the nadir view, the whole-site splat asset and `extent.json`.
The reel is the long job by a wide margin: 1,650 frames, and about an hour on
twelve processes. A single frame at 1280x720 takes 11 s on one core, but twelve
of them contend for memory bandwidth and the throughput settles around 29
frames a minute instead of the 64 that scaling would suggest. `--only pull`
re-renders just that at a different
`--w`/`--h`, `--resume` keeps whatever frames are already in the scratch
directory, and `--only stills` does everything else. Each shot is a function of
`t` in `[0, 1]` in the `SHOTS` table, and camera heights there are above the
terrain under the camera rather than above `y = 0`, so a move holds its
altitude over a slope. `--only pull` also encodes the mp4 and writes the shot
boundaries into `extent.json`, which is where the page reads its labels from.

Two filters make an aerial view possible at all. Splats far above the local
terrain are floaters. They're invisible from underneath and show up as a white
haze from above, so a per-cell AGL cut removes them, with a looser second cut
that keeps small high splats so tree canopy survives. The sky is a dome of very
large splats above the highest camera, fine to fly under and opaque to fly over,
so any view that climbs above it drops it. That is why there is no sky in the
aerials, and the captions say so.

Distances are quoted in scene units, because the DJI telemetry carries
orientation and no GPS, and where a reader needs something physical to hold
onto, in multiples of the drone's own median height above the terrain under it,
0.104 units over all 7,470 registered frames.

Georeferencing recovers a metric scale after the fact by fitting the nadir
render onto USGS NAIP aerial imagery from three hand-picked control points. One
scene unit is 113.6 m. It writes `geo.json`, the cropped `aerial.jpg` the page
draws, and a Google Earth `.kmz`. Section 10 of the page explains the fit and
why three automatic attempts at it failed.

This runs from `tools/geo/`, which takes the site as a config file
(`tools/geo/sites/mountain-view.geo.json`) rather than module constants, so the
same tool works for any site. It carries its own basemap and its own copy of
the method write-up, so a fresh clone can regenerate everything offline.
`tools/geo/serve_align.py` is the control point picker, and
`tools/geo/fetch_basemap.py --site mountain-view` re-pulls the aerial if it
goes missing. See `tools/geo/README.md`.

The old `tools/splat/georef.py` has been replaced and now refuses to run. It's
kept only for history, and `tools/geo/test_georef.py` checks the replacement
reproduces its output bit for bit.

That fit is also what caught a determinant -1 bug in `look()`, which had been
mirroring every figure rendered through it. It is fixed, and `look()` now
asserts its own determinant, but anything rendered before 8 Nov 2026 is flipped
left to right.

`flythrough.py` writes numbered JPEG pairs into a scratch directory and expects
the undistorted source frames to already be in `$SPLAT_SCRATCH/src`. The mp4 is
assembled from its output with ffmpeg afterwards.

`map.png` and `map.json` can't be regenerated from anything in this repo. They
were produced by a one-off snippet that wasn't kept. `map.json` records the
parameters that matter: the bounds are the camera-track bounding box padded
by 0.7 in x and z, the raster is 1200×737 with screen-x following scene-z, and
the PNG is a 16-level grayscale density map tinted at runtime from `--fg-soft`.
Getting the points back into viewer coordinates means fitting a similarity
transform from the COLMAP camera centres to the positions in
`viewer/merged_cameras.json`, which is exact to machine precision. Everything
else about the shading would have to be redone by eye.

### The live viewer

`splat/viewer.js` is the antimatter15 viewer's pipeline, ported: an RGBA32UI
texture holding two texels per splat, a 16-bit counting sort by depth in a Web
Worker, one instanced triangle fan per splat, and `ONE_MINUS_DST_ALPHA / ONE`
blending with no depth buffer. The shaders are copied verbatim so that what the
page renders and what the case study argues about are the same program.

The `znear` slider is the main reason it's there. Everything the page says about
the
see-through ground is a claim about one line in the projection matrix, and the
slider lets a reader move that line and watch the ground go away.

It loads 6.6 MB on a click, never on page load, and the page states what the
figures carry without it. A second button swaps that crop for `site.splat`, the
whole flown area at 400,000 splats. It uses the same worker, shaders and sort
with a different file, so the two are directly comparable. The recorded
fly-through is disabled on it because the path only fits the crop, and three
aerial presets replace
the capture poses, since every pose that ships with the scene is inside the
flight corridor, which is the wrong place to stand to see how big the site is.

## Design

Uses the shared ORYZO system: warm near-black `#100904`, warm cream `#ffedd7`,
burnt-sienna `#dc5000` as a hairline accent only, Plus Jakarta Sans, dashed
hairline rules, no shadows, no filled cards. The block from the top of
`style.css` down to `END SHARED BASE` is identical to the same block in the
Research site. Keep it that way, and add page-specific rules below the marker.

The theme choice is stored in a `theme` cookie on `.jonathanearp.xyz`, with
`localStorage` as the fallback for local preview, so toggling to light on one of
the five sites carries to the others.

Charts read their colours from CSS custom properties via class names, so they
follow the theme toggle with no redraw. They re-render at a 1:1 viewBox so 10px
labels stay 10px on a phone, driven by a `ResizeObserver` instead of a window
resize listener, because the figures sit in a column whose width does not only change
with the window, and a chart drawn before its box has a width bakes a wrong
viewBox into an SVG that then gets stretched. `charts.js` refuses to draw below
40px for that reason. SVG text does not wrap, so headings and footnotes go
through `wrapText()`, and each layout pushes its plot area down by however much
taller the header became.

The canvas demos in `splat/interactive.js` redraw on a `ResizeObserver` and on a
`MutationObserver` watching `data-theme`, since a canvas cannot inherit a
custom property the way an SVG class can.

## Local preview

```bash
python3 -m http.server 8099
```

Then open <http://localhost:8099>. There's no build step, so just edit and
reload.

## Keeping the Instagram numbers current

`tools/refresh_data.py` pulls live figures from the Instagram Graph API, writes
`data/instagram_posts.json` and `data/summary.json`, and regenerates
`desmos/data.js`. Engineering measurements (`findings.json`,
`render_performance.json`) are hand-maintained and never touched by it.

```bash
IG_TOKEN=IGAA... python3 tools/refresh_data.py
```

or, pointing at the pipeline repo's token file:

```bash
python3 tools/refresh_data.py --token-file ../desmos-video/instagram_token.json
```

`--from-cache` rebuilds `summary.json` and `data.js` from the posts already in
`data/` without touching the API. Useful for testing.

None of the numbers are typed into the prose. Figures in the copy are
`<span data-dg="total_plays">` placeholders filled from `data.js` at load by the
binder at the bottom of `charts.js`, so refreshing the data rewrites the
sentences too. If you add a new number to the page, add it as a `data-dg` key
rather than typing it, or it will silently go stale.

Media IDs are dropped on the way in. Everything under `data/` is served publicly
and the IDs make individual post permalinks derivable.

### The counters that tick

The four Instagram tiles in the headline block count up while somebody is
reading. They're extrapolated. A public page can't hold an API token and
Instagram has no push channel, so they can't be live. The page itself does not say so;
if you want it labelled, add the note back yourself.

Each refresh records `generated_at` and, in `rates_per_hour`, how fast each
counter actually grew since the previous refresh. `liveCounters()` in
`desmos/charts.js` extrapolates from the last figure at that rate. Currently
about one play every 1.4 s, one reach every 2.3 s, a like every 24 s and a share
every 90 s.

It follows four rules:

- Only the four raw counters tick: `total_plays`, `total_reach`, `total_likes`
  and `total_shares`. Means and ratios don't accumulate, so ticking
  `mean_watch_s` would just be making a number up.
- Only `.stats .stat__n[data-dg]` ticks. Any figure written into prose stays
  at its refreshed value, so a sentence can't disagree with itself while someone
  is reading it.
- It stops after nine days. If the workflow dies, the page shows a stale number
  instead of a made-up one that keeps climbing.
- There's no fallback rate. With no measured rate the tiles sit still. Dividing
  lifetime totals by the posting window suggests ~5 plays a second, which is
  wrong, because views keep coming in long after a post goes up.

Each tile is an odometer: every digit is a slot with a 0-9 strip behind it, and
only the digits that changed slide. The strip runs 0-9 twice, so a carry (9 to
0) rolls forwards into the second run and then snaps back without showing it.
Otherwise a carry would spin backwards through eight digits. Numerals are
`tabular-nums` so the slots never change width and the row never reflows. A jump
of more than 20 (first paint, or catching up after a spell in a background tab)
lands without animation instead of spinning like a slot machine.

`prefers-reduced-motion: reduce` turns the whole thing off. No odometer is built
at all, and the tile keeps the plain refreshed number.

Because `generated_at` changes on every run, the workflow can no longer use a
plain `git diff` to decide whether to commit. It compares `summary.json` with
the clock fields removed, and reverts the tree when only the clock moved.

### Two metric traps

- `views` isn't the old `plays`. Meta retired `plays` and `impressions`.
  `views` counts roughly 1.8× more events than the denominator
  `ig_reels_video_view_total_time` is measured against, so
  `total_watch_hours / total_plays` gives about 10 s when the real average view
  is about 20 s. The script computes `mean_watch_s` from Instagram's own
  `ig_reels_avg_watch_time`, weighted by watch time. Do not "simplify" it back.
- Metric names get retired without warning. `WANT` is requested optimistically and
  anything the API rejects is dropped for the rest of the run, so one retired
  name cannot take down the whole refresh.

### Running it automatically

`.github/workflows/refresh-analytics.yml` runs the script every Monday and on
demand, and commits only when a number actually moved. To switch it on:

1. Get a long-lived Instagram Graph API token (the pipeline repo's
   `instagram.py setup` prints the steps).
2. In the repo, go to Settings > Secrets and variables > Actions > New
   repository secret, and name it `IG_TOKEN`.
3. Optionally, add a second secret `GH_PAT`, a fine-grained personal access
   token with Secrets: read and write on this repo. Without
   it the workflow can refresh the Instagram token but cannot store the new one,
   so `IG_TOKEN` still dies after 60 days and you have to replace it by hand.
   With it, rotation is permanent and the site keeps itself current.

The workflow summary reports the new totals, or "No change in the numbers."

## Adding the next project

1. Create `<slug>/index.html`, starting from `desmos/index.html` or, for
   something paper-shaped, `splat/index.html`.
2. Add a `.prow` block to the list in `index.html`. S.P.L.O.O.G.E and P.E.T.E.R
   stay at the top, and the rest are newest first, so a new project goes
   straight after P.E.T.E.R. Renumber the rows so they count `01`, `02`, … from
   the top, then update each page's `Project NN` labels (hero, crumb and side
   label) and its next-project link to match. The last project links on to
   Research.
3. Add the URL to `sitemap.xml` and an entry to `hasPart` in the JSON-LD block.
4. Update the project count on `index.html`: the `Live` cell in the hero
   metastrip, "Five are up here so far" in the hero, and the footer.

## Adding a hero reel to the Desmos page

There is a marked comment slot in the hero of `desmos/index.html`. Drop in:

```html
<video class="hero__reel" autoplay muted loop playsinline
       preload="metadata" poster="poster.jpg">
  <source src="reel.mp4" type="video/mp4">
</video>
```

Before you do, keep in mind that the rendered clips contain Family Guy footage. Hosting one on
your own domain is a different copyright question from posting it to a platform
that has a licensing deal and a Content-ID process. Two of 140 uploads were
already Content-ID blocked. It's your call, but think it through first.
