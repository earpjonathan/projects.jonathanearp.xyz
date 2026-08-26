"""Generate the topographic favicon from one source.

  favicon.svg           - prefers-color-scheme query; the default <link>
  favicon-dark.svg      - flat dark, for the in-page theme toggle
  favicon-light.svg     - flat light, likewise
  apple-touch-src.svg   - square, dark, no corner radius; an intermediate,
                          not served. Rasterise it to apple-touch-icon.png
                          at 180x180:
                            qlmanage -t -s 180 -o . apple-touch-src.svg
                          The same trick at -s 512 off favicon-dark.svg makes
                          the PNG favicon fallback the FPV site still uses.

Edit ART here, never the generated files.

iOS masks the touch icon itself, so that one is drawn square and opaque -
baking in our own rounded corners would round it twice, and any alpha shows
through as a notch on the home screen.
"""
import sys, pathlib

DARK  = {"bg": "#100904", "ink": "#ffedd7", "accent": "#dc5000"}
LIGHT = {"bg": "#ece1cf", "ink": "#241a0f", "accent": "#c2470a"}

# Contours of a summit sitting high-right, the outer rings running off the
# tile so it reads as a crop of a map rather than a bullseye.
ART = '''  <rect class="bg" width="512" height="512" rx="76"/>
  <g clip-path="url(#tile)" fill="none" stroke-linecap="round">
    <g transform="rotate(-36 344 176)">
      <ellipse class="ln ln--a" cx="344" cy="176" rx="60"  ry="38"/>
      <ellipse class="ln"       cx="336" cy="186" rx="152" ry="100"/>
      <ellipse class="ln"       cx="326" cy="198" rx="252" ry="170"/>
      <ellipse class="ln"       cx="314" cy="212" rx="356" ry="244"/>
    </g>
  </g>'''

def head(radius):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">\n'
            f'  <defs><clipPath id="tile"><rect width="512" height="512" rx="{radius}"/></clipPath></defs>\n')

def rules(c, sel=""):
    # One weight, full opacity. At 16 px a 30-unit stroke is a hair under a
    # pixel; anything faint or thinner just turns to mud at that size.
    return (f"{sel}.bg{{fill:{c['bg']}}}"
            f"{sel}.ln{{stroke:{c['ink']};stroke-width:30}}"
            f"{sel}.ln--a{{stroke:{c['accent']};stroke-width:30}}")

def build(mode, radius=76):
    if mode == "auto":
        css = (rules(LIGHT) +
               "@media(prefers-color-scheme:dark){" + rules(DARK) + "}")
    else:
        css = rules(DARK if mode == "dark" else LIGHT)
    art = ART if radius else ART.replace('rx="76"', 'rx="0"')
    return head(radius) + f"  <style>{css}</style>\n" + art + "\n</svg>\n"

out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
out.mkdir(parents=True, exist_ok=True)
for name, mode, radius in (("favicon.svg", "auto", 76),
                           ("favicon-dark.svg", "dark", 76),
                           ("favicon-light.svg", "light", 76),
                           ("apple-touch-src.svg", "dark", 0)):
    (out / name).write_text(build(mode, radius))
    print("wrote", out / name)
