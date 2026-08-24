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
style.css           ORYZO shared base + projects-specific styles
script.js           Theme toggle, scroll reveal, chapter nav
topo.js             Topographic canvas background (copied verbatim from Research)
data/*.json         Source measurements, kept for provenance
assets/             Favicon, apple-touch-icon
CNAME               projects.jonathanearp.xyz
```

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

## Regenerating `desmos/data.js`

`data.js` is generated from the JSON in `data/`, which is copied out of the
pipeline repo's `portfolio/` folder. Instagram rows are reduced to
`{episode, watch_hours, plays}` — no media IDs, no handles, no personal data.
Re-run this after refreshing the source JSON:

```bash
python3 - <<'PY'
import json
posts   = json.load(open("data/instagram_posts.json"))
findings= json.load(open("data/findings.json"))
render  = json.load(open("data/render_performance.json"))
summary = json.load(open("data/summary.json"))
slim = [{"episode": p["episode"], "watch_hours": p["watch_hours"], "plays": p["plays"]} for p in posts]
j = lambda o: json.dumps(o, separators=(",", ":"))
out = ["window.DG = {"]
out.append("  summary: "  + json.dumps(summary,  indent=2).replace("\n", "\n  ") + ",")
out.append("  findings: " + json.dumps(findings, indent=2).replace("\n", "\n  ") + ",")
out.append("  render: "   + j(render) + ",")
out.append("  posts: [")
out += ["    " + j(p) + "," for p in slim]
out += ["  ]", "};"]
open("desmos/data.js","w").write("\n".join(out) + "\n")
PY
```

Keep the header comment at the top of `data.js` when you regenerate.

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
