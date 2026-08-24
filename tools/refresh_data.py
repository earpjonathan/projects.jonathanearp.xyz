#!/usr/bin/env python3
"""Pull fresh Instagram numbers and regenerate the page data.

    IG_TOKEN=IGAA... python3 tools/refresh_data.py
    python3 tools/refresh_data.py --token-file ~/path/instagram_token.json
    python3 tools/refresh_data.py --rotate-token        # extend a long-lived token

Writes data/instagram_posts.json, data/summary.json and desmos/data.js.
Engineering measurements (findings.json, render_performance.json) are hand
maintained and never touched here.

Two things this deliberately does NOT do:

  * It never writes the token anywhere in the repo, and never prints it.
  * It drops Instagram media IDs. Everything under data/ is served publicly by
    GitHub Pages, and the IDs make individual post permalinks derivable.

Run it from the repo root. Exits non-zero on any API failure so a scheduled
run fails loudly instead of quietly committing half a dataset.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://graph.instagram.com/v23.0"
ROOT = Path(__file__).resolve().parent.parent

# Meta renames these regularly: `plays` and `impressions` are both retired and
# `views` replaced them. Ask for everything plausible and drop what the API
# rejects, rather than failing the whole run over one dead metric name.
WANT = ["views", "reach", "likes", "comments", "shares", "saved",
        "ig_reels_avg_watch_time", "ig_reels_video_view_total_time"]

_token = ""


def api(path: str, **params):
    params["access_token"] = _token
    url = f"{BASE}/{path.lstrip('/')}?{urllib.parse.urlencode(params)}"
    last = ""
    for attempt in range(5):
        try:
            with urllib.request.urlopen(url, timeout=45) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            raw = e.read().decode(errors="replace").replace(_token, "<TOKEN>")
            try:
                last = json.loads(raw)["error"]["message"]
            except Exception:
                last = raw[:200]
            if e.code in (400, 403):        # not transient; caller decides
                raise ApiError(last)
        except Exception as e:              # transient: network, timeout, 5xx
            last = str(e).replace(_token, "<TOKEN>")
        time.sleep(1.5 * (attempt + 1))
    raise ApiError(last or "gave up after 5 attempts")


class ApiError(RuntimeError):
    pass


def load_token(args) -> str:
    if args.token_file:
        p = Path(args.token_file).expanduser()
        return json.load(open(p)).get("token", "").strip()
    return os.environ.get("IG_TOKEN", "").strip()


def episode_of(caption: str) -> str:
    """'Season 17, Episode 2 in desmos' -> 'S17E02'."""
    m = re.search(r"[Ss]eason\s*(\d+)\D{0,14}?[Ee]pisode\s*(\d+)", caption or "")
    if m:
        return "S%02dE%02d" % (int(m.group(1)), int(m.group(2)))
    m = re.search(r"\b[Ss](\d{1,2})\s*[Ee](\d{1,2})\b", caption or "")
    if m:
        return "S%02dE%02d" % (int(m.group(1)), int(m.group(2)))
    return "unknown"


def all_media() -> list:
    fields = "id,caption,media_type,media_product_type,timestamp"
    out, after = [], None
    while True:
        p = {"fields": fields, "limit": 100}
        if after:
            p["after"] = after
        r = api("me/media", **p)
        out.extend(r.get("data", []))
        after = (r.get("paging", {}).get("cursors", {}) or {}).get("after")
        if not after or not r.get("data"):
            return out


def insights(mid: str, metrics: list) -> tuple[dict, list]:
    """Insights for one post, dropping metric names this account rejects."""
    m = list(metrics)
    while m:
        try:
            r = api(f"{mid}/insights", metric=",".join(m))
            return {d["name"]: d["values"][0].get("value") for d in r.get("data", [])}, m
        except ApiError as e:
            bad = [x for x in m if x in str(e)]
            if not bad:
                return {}, m                 # this post has no insights; skip it
            m = [x for x in m if x not in bad]
            print(f"    dropping unsupported metric: {', '.join(bad)}", file=sys.stderr)
    return {}, m


def fetch_posts() -> list:
    media = all_media()
    reels = [m for m in media
             if m.get("media_product_type") == "REELS" or m.get("media_type") == "VIDEO"]
    print(f"{len(media)} media, {len(reels)} reels", file=sys.stderr)

    metrics, rows = list(WANT), []
    for i, m in enumerate(reels, 1):
        vals, metrics = insights(m["id"], metrics)
        if not vals:
            continue
        ms_avg = vals.get("ig_reels_avg_watch_time") or 0
        ms_tot = vals.get("ig_reels_video_view_total_time") or 0
        rows.append({
            "episode": episode_of(m.get("caption", "")),
            "timestamp": m.get("timestamp", ""),
            "plays": int(vals.get("views") or 0),
            "reach": int(vals.get("reach") or 0),
            "likes": int(vals.get("likes") or 0),
            "shares": int(vals.get("shares") or 0),
            "saves": int(vals.get("saved") or 0),
            "comments": int(vals.get("comments") or 0),
            "avg_watch_s": round(ms_avg / 1000, 2),
            "watch_hours": round(ms_tot / 3_600_000, 2),
        })
        if i % 10 == 0 or i == len(reels):
            print(f"  insights {i}/{len(reels)}", file=sys.stderr, flush=True)
        time.sleep(0.25)
    if not rows:
        raise SystemExit("no posts came back with insights; refusing to overwrite good data")
    rows.sort(key=lambda r: -r["plays"])
    return rows


def build_summary(posts: list, previous: dict) -> dict:
    """Recompute what the API can tell us; preserve everything it cannot."""
    watch = [p["watch_hours"] for p in posts]
    plays = [p["plays"] for p in posts]
    stamps = sorted(p["timestamp"][:10] for p in posts if p["timestamp"])
    total_watch = round(sum(watch))
    total_plays = sum(plays)

    s = dict(previous)                        # keeps youtube_uploads, hit_rate_pct, ...
    for dead in ("mean_watch_per_play_s", "top1_share_pct", "top3_share_pct",
                 "top10_share_pct"):
        s.pop(dead, None)
    s.update({
        "generated": time.strftime("%Y-%m-%d"),
        "window": {"first": stamps[0], "last": stamps[-1]} if stamps else previous.get("window", {}),
        "posts": len(posts),
        "total_watch_hours": total_watch,
        "total_watch_days": round(total_watch / 24, 1),
        "total_plays": total_plays,
        "total_reach": sum(p["reach"] for p in posts),
        "total_likes": sum(p["likes"] for p in posts),
        "total_shares": sum(p["shares"] for p in posts),
        "total_saves": sum(p["saves"] for p in posts),
        "total_comments": sum(p["comments"] for p in posts),
        # Watch-weighted mean of Instagram's OWN avg-watch-time.
        # Do NOT compute this as total_watch_hours / total_plays: `views` and
        # `ig_reels_avg_watch_time` are measured against different denominators
        # (views counts ~1.8x more events), so dividing one by the other
        # understates real watch time by nearly half.
        "mean_watch_s": round(
            sum(p["avg_watch_s"] * p["watch_hours"] for p in posts) / sum(watch), 1
        ) if sum(watch) else 0,
        "share_rate_pct": round(100 * sum(p["shares"] for p in posts) / total_plays, 2)
        if total_plays else 0,
        "median_plays": int(statistics.median(plays)) if plays else 0,
        "mean_plays": int(round(statistics.fmean(plays))) if plays else 0,
        "median_watch_hours": round(statistics.median(watch), 2) if watch else 0,
    })
    return s


def write_data_js(posts, findings, render, summary) -> None:
    """Regenerate desmos/data.js. Per-post rows carry only what the page plots."""
    slim = [{"episode": p["episode"], "timestamp": p["timestamp"],
             "watch_hours": p["watch_hours"], "plays": p["plays"]} for p in posts]
    j = lambda o: json.dumps(o, separators=(",", ":"))
    out = ["""/* ============================================================
   Desmos Guy - measured data, inlined.

   GENERATED FILE - do not hand-edit.
   Regenerate with:  python3 tools/refresh_data.py
   Instagram figures come straight from the Graph API; findings and
   render timings are hand-maintained in data/.

   Window: %s to %s (generated %s).
   Instagram rows carry no media IDs, no handles, no personal data.
   ============================================================ */
window.DG = {""" % (summary.get("window", {}).get("first", "?"),
                    summary.get("window", {}).get("last", "?"),
                    summary.get("generated", "?"))]
    out.append("  summary: " + json.dumps(summary, indent=2).replace("\n", "\n  ") + ",")
    out.append("  findings: " + json.dumps(findings, indent=2).replace("\n", "\n  ") + ",")
    out.append("  render: " + j(render) + ",")
    out.append("  posts: [")
    out += ["    " + j(p) + "," for p in slim]
    out += ["  ]", "};"]
    (ROOT / "desmos/data.js").write_text("\n".join(out) + "\n")


def main() -> int:
    global _token
    ap = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--token-file", help="JSON file with {\"token\": \"...\"}")
    ap.add_argument("--rotate-token", action="store_true",
                    help="extend the long-lived token and print the new one to stdout")
    ap.add_argument("--from-cache", action="store_true",
                    help="rebuild summary.json and data.js from the posts already "
                         "in data/, without calling the API")
    args = ap.parse_args()

    if args.from_cache:
        posts = json.loads((ROOT / "data/instagram_posts.json").read_text())
        summary = build_summary(posts, json.loads((ROOT / "data/summary.json").read_text()))
        (ROOT / "data/summary.json").write_text(json.dumps(summary, indent=1) + "\n")
        write_data_js(posts,
                      json.loads((ROOT / "data/findings.json").read_text()),
                      json.loads((ROOT / "data/render_performance.json").read_text()),
                      summary)
        print(f"rebuilt from cache: {summary['posts']} posts, "
              f"{summary['total_plays']:,} plays", file=sys.stderr)
        return 0

    _token = load_token(args)
    if not _token:
        raise SystemExit("no token. Set IG_TOKEN, or pass --token-file.")

    if args.rotate_token:
        r = api("refresh_access_token", grant_type="ig_refresh_token")
        t = r.get("access_token")
        if not t:
            raise SystemExit("no access_token in refresh response")
        print(t)                              # stdout only, for the caller to store
        print(f"valid ~{r.get('expires_in', 0) // 86400} more days", file=sys.stderr)
        return 0

    me = api("me", fields="username,media_count")
    print(f"account @{me.get('username')}, {me.get('media_count')} media", file=sys.stderr)

    posts = fetch_posts()
    previous = json.loads((ROOT / "data/summary.json").read_text())
    summary = build_summary(posts, previous)

    (ROOT / "data/instagram_posts.json").write_text(json.dumps(posts, indent=1) + "\n")
    (ROOT / "data/summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    write_data_js(posts,
                  json.loads((ROOT / "data/findings.json").read_text()),
                  json.loads((ROOT / "data/render_performance.json").read_text()),
                  summary)

    print(f"\n{summary['posts']} posts | {summary['total_plays']:,} plays | "
          f"{summary['total_watch_hours']:,} watch hours | "
          f"{summary['total_likes']:,} likes | {summary['total_shares']:,} shares",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
