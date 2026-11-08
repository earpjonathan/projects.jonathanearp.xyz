#!/usr/bin/env python3
"""
Basemap providers.

Two adapters cover almost everything, because the EPSG:3857 bbox maths is
identical for every ArcGIS endpoint and every WMS:

    arcgis  - ArcGIS ImageServer /exportImage or MapServer /export
    wms     - OGC WMS 1.1.1 / 1.3.0 GetMap

So a provider is a URL, an adapter name, an attribution string, and one
boolean that decides whether its pixels are allowed to leave your machine.

                        ---- the licence split ----

GEOREF.md is firm about this and it is the part that does not generalise
cleanly. You cannot use Google Earth or Google Maps imagery as a basemap:
scraping the tiles breaks their terms and no licence lets you redistribute the
result. Google Earth is an *output* target here (the KMZ drops onto whatever
imagery the viewer already has), never an input.

`publishable` encodes that. A provider with publishable=False may be used to
*fit* — you need good imagery to read a roundabout off by eye — but georef.py
will refuse to write its pixels into an output crop. The derived numbers are
yours; the imagery is not.

Adding a provider: drop a JSON object into geo/providers.local.json keyed by
name, with the same fields as PROVIDERS below. Nothing here is special-cased.
"""
from __future__ import annotations

import json
import math
import os
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))

# Only providers whose endpoint shape is actually verified ship here. Anything
# else belongs in providers.local.json, so a typo in a guessed URL can never
# masquerade as a working source.
PROVIDERS: dict[str, dict] = {
    "usgs_naip": {
        "adapter": "arcgis",
        "url": "https://imagery.nationalmap.gov/arcgis/rest/services/"
               "USGSNAIPPlus/ImageServer/exportImage",
        "coverage": "United States",
        "resolution_m": 0.6,
        "attribution": "USGS NAIP (public domain)",
        "publishable": True,
    },
    "esri_world_imagery": {
        "adapter": "arcgis",
        "url": "https://services.arcgisonline.com/ArcGIS/rest/services/"
               "World_Imagery/MapServer/export",
        "coverage": "global, sub-metre in populated areas",
        "resolution_m": 0.5,
        "attribution": "Esri World Imagery",
        # Esri terms do not permit redistribution. Fit only.
        "publishable": False,
    },
}


def load_providers() -> dict[str, dict]:
    """PROVIDERS plus anything in providers.local.json (which wins)."""
    out = dict(PROVIDERS)
    local = os.path.join(HERE, "providers.local.json")
    if os.path.exists(local):
        with open(local) as fh:
            extra = json.load(fh)
        for k, v in extra.items():
            missing = {"adapter", "url", "attribution", "publishable"} - set(v)
            if missing:
                raise ValueError(f"provider {k!r} missing fields: {sorted(missing)}")
            out[k] = v
    return out


def get(name: str) -> dict:
    provs = load_providers()
    if name not in provs:
        raise KeyError(f"unknown provider {name!r}. known: {sorted(provs)}")
    return provs[name]


# ---------------------------------------------------------------- adapters
def _url_arcgis(p: dict, bbox, px: int) -> str:
    q = {"bbox": "%f,%f,%f,%f" % bbox, "bboxSR": "3857", "imageSR": "3857",
         "size": f"{px},{px}", "format": "jpg", "f": "image"}
    q.update(p.get("params", {}))
    return p["url"] + "?" + urllib.parse.urlencode(q)


def _url_wms(p: dict, bbox, px: int) -> str:
    ver = p.get("version", "1.3.0")
    q = {"SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": ver,
         "LAYERS": p.get("layers", ""), "STYLES": p.get("styles", ""),
         "FORMAT": p.get("format", "image/jpeg"),
         "WIDTH": str(px), "HEIGHT": str(px),
         "BBOX": "%f,%f,%f,%f" % bbox}
    # 1.3.0 renamed SRS and, for some CRSs, swaps axis order. EPSG:3857 is
    # easting-first in both, so only the parameter name changes.
    q["CRS" if ver == "1.3.0" else "SRS"] = "EPSG:3857"
    q.update(p.get("params", {}))
    return p["url"] + ("&" if "?" in p["url"] else "?") + urllib.parse.urlencode(q)


ADAPTERS = {"arcgis": _url_arcgis, "wms": _url_wms}


def build_url(provider: dict, bbox, px: int) -> str:
    adapter = provider.get("adapter")
    if adapter not in ADAPTERS:
        raise ValueError(f"unknown adapter {adapter!r}. known: {sorted(ADAPTERS)}")
    return ADAPTERS[adapter](provider, bbox, px)


def fetch(provider: dict, bbox, px: int, dest: str, timeout: int = 120) -> str:
    """Download the basemap tile to `dest`. Returns the URL used."""
    url = build_url(provider, bbox, px)
    req = urllib.request.Request(url, headers={"User-Agent": "georef/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        ctype = r.headers.get("Content-Type", "")
        body = r.read()
    if not ctype.startswith("image/"):
        # WMS and ArcGIS both report failures as XML/JSON with HTTP 200.
        snippet = body[:400].decode("utf-8", "replace")
        raise RuntimeError(f"server returned {ctype!r}, not an image:\n{snippet}")
    if len(body) < 2048:
        raise RuntimeError(f"suspiciously small response ({len(body)} bytes)")
    with open(dest, "wb") as fh:
        fh.write(body)
    return url
