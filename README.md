# projects.jonathanearp.xyz

Side-projects section of [jonathanearp.xyz](https://jonathanearp.xyz). Static, no
build step, no dependencies. Deployed with GitHub Pages exactly like the other
three sites.

First project: **Desmos Guy** — an automated pipeline that renders video clips as
Desmos graphing-calculator animations.

```
index.html          Project index
desmos/
  index.html        Case study
  data.js           Measured data, inlined (generated — see below)
  charts.js         The five figures, drawn as inline SVG
  interactive.js    The four playable demos
style.css           ORYZO shared base + projects-specific styles
script.js           Theme toggle, scroll reveal, chapter nav
topo.js             Topographic canvas background (copied verbatim from Research)
data/*.json         Source measurements, kept for provenance
assets/             Favicon, apple-touch-icon
CNAME               projects.jonathanearp.xyz
```

## The interactive demos

`desmos/interactive.js` holds four of them, and they run the real algorithms
rather than faking the output:

| demo | what it actually does |
|---|---|
| **trace** | Sobel edge detection, Moore-neighbourhood border following and Ramer–Douglas–Peucker simplification, live on a canvas |
| **chunks** | evaluates the gate and clamped-index expressions for whatever `n` the slider is on |
| **settle** | models one Desmos update with a ~55 ms stall in the middle, then applies the settle rule; `stable=2` captures a frame with no character in it, `stable=4` and up do not |
| **timeline** | v0 → v4, with the measured numbers for each |

The settle demo's stall is deliberately sized between 2 and 4 animation frames,
because that is what the real measurements imply: `stable=2` was wrong on 39 of
40 frames and `stable=4` was correct on all 40. If you ever re-measure and those
numbers move, move the stall too.

The trace demo's subject is drawn in code in `drawSubject()`. It is a cat, in
colour, so that the grayscale step is visibly a step. **Do not swap in a real
frame** — that would put copyrighted footage in the repo.

## Design

Uses the shared **ORYZO** system: warm near-black `#100904`, warm cream `#ffedd7`,
burnt-sienna `#dc5000` as a hairline accent only, Plus Jakarta Sans, dashed
hairline rules, no shadows, no filled cards. The block from the top of
`style.css` down to `END SHARED BASE` is identical to the same block in the
Research site — keep it that way, and add page-specific rules below the marker.

Theme choice is stored in `localStorage` under the key `theme` and shared across
all four sites, so toggling to light on one carries to the others.

Charts read their colours from CSS custom properties via class names, so they
follow the theme toggle with no redraw. They re-render on resize at a 1:1
viewBox so 10px labels stay 10px on a phone.

## Local preview

```bash
python3 -m http.server 8099
```

Then open <http://localhost:8099>. There is no build step — edit and reload.

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

**Nothing is typed into the prose.** Figures in the copy are
`<span data-dg="total_plays">` placeholders filled from `data.js` at load by the
binder at the bottom of `charts.js`, so refreshing the data rewrites the
sentences too. If you add a new number to the page, add it as a `data-dg` key
rather than typing it, or it will silently go stale.

Media IDs are dropped on the way in. Everything under `data/` is served publicly
and the IDs make individual post permalinks derivable.

### The counters that tick

The four headline tiles in section 08 count up while somebody is reading. It is
an estimate, not a live feed — a public page cannot hold an API token, and
Instagram has no push channel.

Each refresh records `generated_at` and, in `rates_per_hour`, how fast each
counter actually grew since the previous refresh. `liveCounters()` in
`desmos/charts.js` extrapolates from the last figure at that rate. Currently
about one play every 1.4 s, one reach every 2.3 s, a like every 24 s and a share
every 90 s.

Four rules it follows, all of which matter:

- **Only the four raw counters** — `total_plays`, `total_reach`, `total_likes`,
  `total_shares`. Means and ratios do not accumulate; ticking `mean_watch_s`
  would be a lie rather than an estimate.
- **Only the stat tiles.** Every number in the prose stays at its refreshed
  value, so a sentence never disagrees with itself mid-read.
- **It stops after nine days.** A workflow that dies leaves a stale number on
  screen rather than an invented one that keeps climbing forever.
- **No fallback rate.** With no measured rate the tiles sit still. Dividing
  lifetime totals by the posting window suggests ~5 plays a second, which looks
  great and is wrong — views keep accruing long after a post lands.

Each tile is an odometer: every digit is a slot with a 0-9 strip behind it, and
only the digits that changed slide. The strip runs 0-9 **twice** so a carry
(9 to 0) rolls forwards into the second run and then snaps back silently -
otherwise a carry spins backwards through eight digits. Numerals are
`tabular-nums` so the slots never change width and the row never reflows. A jump
of more than 20 (first paint, or catching up after a spell in a background tab)
lands without animation rather than running a slot machine.

`prefers-reduced-motion: reduce` turns the whole thing off - no odometer is
built at all and the tile keeps the plain refreshed number.

Because `generated_at` changes on every run, the workflow can no longer use a
plain `git diff` to decide whether to commit — it compares `summary.json` with
the clock fields removed, and reverts the tree when only the clock moved.

### Two metric traps

- **`views` is not the old `plays`.** Meta retired `plays` and `impressions`.
  `views` counts roughly **1.8× more events** than the denominator
  `ig_reels_video_view_total_time` is measured against, so
  `total_watch_hours / total_plays` gives about 10 s when the real average view
  is about 20 s. The script computes `mean_watch_s` from Instagram's own
  `ig_reels_avg_watch_time`, weighted by watch time. Do not "simplify" it back.
- **Metric names die without warning.** `WANT` is requested optimistically and
  anything the API rejects is dropped for the rest of the run, so one retired
  name cannot take down the whole refresh.

### Running it automatically

`.github/workflows/refresh-analytics.yml` runs the script every Monday and on
demand, and commits only when a number actually moved. To switch it on:

1. Get a long-lived Instagram Graph API token (the pipeline repo's
   `instagram.py setup` prints the steps).
2. Repo **Settings → Secrets and variables → Actions → New repository secret**,
   named `IG_TOKEN`.
3. Optional but recommended: add a second secret `GH_PAT`, a fine-grained
   personal access token with **Secrets: read and write** on this repo. Without
   it the workflow can refresh the Instagram token but cannot store the new one,
   so `IG_TOKEN` still dies after 60 days and you have to replace it by hand.
   With it, rotation is permanent and the site keeps itself current.

The workflow summary reports the new totals, or "No change in the numbers."

## Adding the next project

1. Create `<slug>/index.html`, starting from `desmos/index.html`.
2. Add a `.prow` block to the list in `index.html`, numbered `02`, `03`, …
3. Add the URL to `sitemap.xml`.
4. Bump the `Live` count in the hero metastrip on `index.html`.

## Adding a hero reel to the Desmos page

There is a marked comment slot in the hero of `desmos/index.html`. Drop in:

```html
<video class="hero__reel" autoplay muted loop playsinline
       preload="metadata" poster="poster.jpg">
  <source src="reel.mp4" type="video/mp4">
</video>
```

**Before you do:** the rendered clips contain Family Guy footage. Hosting one on
your own domain is a different copyright question from posting it to a platform
that has a licensing deal and a Content-ID process. Two of 140 uploads were
already Content-ID blocked. Your call — but make it deliberately.
