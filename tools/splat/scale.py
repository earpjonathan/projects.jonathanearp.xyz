"""How big the site actually is.

Everything the rest of the page shows was rendered from inside the flight
corridor, at the altitude the drone flew, which gives no sense of extent. This
renders the same asset from outside it: a continuous pull-back from one real
capture pose up to an aerial, the key frames of that pull-back as a ladder, and
a nadir view of the whole reconstruction.

Two filters make the aerial possible at all. Splats far above the local terrain
are floaters, and from ground level you fly under them without noticing; from
above they are a white haze over everything. The AGL cut removes them, with a
second, looser cut that keeps small high splats so tree canopy survives. The
sky is a dome of very large splats above the highest camera - fine to fly
under, opaque to fly over - so the views that climb above it drop it, and the
caption says so.
"""
import argparse, json, math, os, sys
import numpy as np


def paths():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=os.environ.get("FPV_SPLAT",
                    os.path.expanduser("~/Desktop/fpv-splat")))
    ap.add_argument("--out", default=os.path.abspath(
                    os.path.join(here, "..", "..", "splat", "media")))
    ap.add_argument("--scratch", default=os.environ.get("SPLAT_SCRATCH", "/tmp/fpv-scale"))
    ap.add_argument("--procs", type=int, default=6)
    ap.add_argument("--w", type=int, default=800)
    ap.add_argument("--h", type=int, default=450)
    # the pull-back is the long job by a wide margin; --only pull re-renders it
    # at a different size without redoing the stills and the JSON
    ap.add_argument("--only", default="all", choices=["all", "pull", "stills"])
    a = ap.parse_args()
    sys.path.insert(0, os.path.join(a.project, "scripts"))
    os.chdir(a.project)
    os.makedirs(a.out, exist_ok=True)
    os.makedirs(f"{a.scratch}/pull", exist_ok=True)
    os.makedirs(f"{a.out}/ladder", exist_ok=True)
    return a


A = paths()
OUT, SCRATCH = A.out, A.scratch

from raster import load_splat, sigma_world, render                  # noqa: E402
from PIL import Image                                               # noqa: E402
import multiprocessing as mp                                        # noqa: E402

SRC = "viewer/merged_web.splat"
UP = np.array([0.0, -1.0, 0.0])     # the levelling puts up on -Y
ANCHOR = 2500                       # 0053_001085, where the pull-back starts
PLAN_R = 8.0                        # plan radius to keep, scene units
AGL_GROUND = 0.12                   # surface band
AGL_CANOPY, CANOPY_SIZE = 1.5, 0.02  # small splats this high are foliage
MAX_SIZE = 0.05                     # anything larger is a blob, not a surface
CELL = 0.12                         # ground-height cell, scene units
DRAW = 1_200_000
N_RISE, N_ORBIT = 330, 150          # frames; 30 fps -> 11 s + 5 s
TOP_H, TOP_BACK = 2.0, 2.4          # aerial hold, below the sky dome
ORBIT_DEG = 34.0
SITE_N = 400_000                    # whole-site LOD, splats
SITE_SIZE = 0.02                    # and the size cap that keeps it crisp
SITE_H, SITE_BACK = 2.4, 1.2        # where the viewer opens on it
LADDER = [0.0, 0.18, 0.38, 0.62, 1.0, 1.55, 2.0]   # heights above the anchor

xyz, sc, rgba, rot = load_splat(SRC)
S3 = sigma_world(sc, rot)
cams = json.load(open("viewer/merged_cameras.json"))
traj = json.load(open("viewer/merged_traj.json"))
FLIGHT = np.vstack([np.array(c["pos"]).reshape(-1, 3) for c in traj["clips"]])
CTR = FLIGHT.mean(0)


GI0 = GK0 = 0
GROUND = {}


def ground_height():
    """Median splat height per plan cell. Most splats in a 0.12-unit cell are
    the surface, so the median is the ground without needing a fitted mesh."""
    global GI0, GK0, GROUND
    h = -xyz[:, 1]
    gi = np.floor(xyz[:, 0] / CELL).astype(np.int64)
    gk = np.floor(xyz[:, 2] / CELL).astype(np.int64)
    GI0, GK0 = int(gi.min()), int(gk.min())
    key = (gi - GI0) * 100000 + (gk - GK0)
    o = np.argsort(key, kind="stable")
    ks, hs = key[o], h[o]
    bnd = np.flatnonzero(np.r_[True, ks[1:] != ks[:-1], True])
    g = np.empty(len(xyz))
    for a, b in zip(bnd[:-1], bnd[1:]):
        m = np.median(hs[a:b]) if b - a >= 6 else -1e9
        g[o[a:b]] = m
        if b - a >= 6:
            GROUND[int(ks[a])] = float(m)
    return h - g


def agl_at(p):
    """Height of a point above the terrain under it, or None off the map."""
    k = int((math.floor(p[0] / CELL) - GI0) * 100000 + (math.floor(p[2] / CELL) - GK0))
    return (-p[1]) - GROUND[k] if k in GROUND else None


AGL = ground_height()
BIG = sc.max(1)
PLAN = np.linalg.norm(xyz[:, [0, 2]] - CTR[[0, 2]], axis=1)
SKY = xyz[:, 1] < -2.23            # above every camera in the flight

SURFACE = ((PLAN < PLAN_R) & (AGL > -1e8) & (BIG < MAX_SIZE) &
           ((AGL < AGL_GROUND) | ((AGL < AGL_CANOPY) & (BIG < CANOPY_SIZE))))

ss = np.sort(sc, axis=1)
IMP = (rgba[:, 3] / 255.0) * ss[:, 1] * ss[:, 2]


def subset(with_sky):
    keep = SURFACE | SKY if with_sky else (SURFACE & ~SKY)
    i = np.where(keep)[0]
    return i[np.argsort(-IMP[i])[:DRAW]]


IDX_SKY = subset(True)
IDX_BARE = subset(False)


def look(C, T, ref=None):
    """`ref` only matters looking straight down, where UP gives no right
    vector: it picks the roll. The nadir uses (1,0,0) so the site's long axis
    runs across the frame and matches the density map's orientation."""
    f = T - C
    f = f / np.linalg.norm(f)
    a = UP if abs(float(np.dot(UP, f))) < 0.985 else (ref if ref is not None else np.array([0.0, 0.0, 1.0]))
    r = np.cross(a, f)
    r = r / np.linalg.norm(r)
    u = np.cross(f, r)
    return np.column_stack([r, -u, f])   # the camera's y axis is image-down


def quat(R):
    t = R.trace()
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        q = [(R[2, 1] - R[1, 2]) / s, (R[0, 2] - R[2, 0]) / s, (R[1, 0] - R[0, 1]) / s, 0.25 * s]
    else:
        i = int(np.argmax(np.diag(R)))
        j, k = (i + 1) % 3, (i + 2) % 3
        s = math.sqrt(1.0 + R[i, i] - R[j, j] - R[k, k]) * 2
        q = [0.0, 0.0, 0.0, (R[k, j] - R[j, k]) / s]
        q[i], q[j], q[k] = 0.25 * s, (R[j, i] + R[i, j]) / s, (R[k, i] + R[i, k]) / s
    return np.array(q) / np.linalg.norm(q)


def mat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def slerp(a, b, t):
    if float(np.dot(a, b)) < 0:
        b = -b
    d = float(np.clip(np.dot(a, b), -1, 1))
    if d > 0.9995:
        return (a + t * (b - a)) / np.linalg.norm(a + t * (b - a))
    th = math.acos(d)
    return (math.sin((1 - t) * th) * a + math.sin(t * th) * b) / math.sin(th)


def ease(t):
    return t * t * (3 - 2 * t)


BASE = cams[ANCHOR]
C0 = np.asarray(BASE["position"], float)
Q0 = quat(np.asarray(BASE["rotation"], float))
FX, FY = BASE["fx"], BASE["fy"]
IW, IH = BASE["width"], BASE["height"]


def top_camera(deg):
    """The aerial hold, orbited `deg` about the site centre."""
    a = math.radians(deg)
    off = np.array([math.sin(a) * TOP_BACK, 0.0, -math.cos(a) * TOP_BACK])
    return CTR + UP * TOP_H + off


def pose(k):
    """Frame k of the shot: rise from the capture pose, then orbit."""
    if k < N_RISE:
        t = ease(k / (N_RISE - 1))
        C1 = top_camera(0.0)
        C = C0 + (C1 - C0) * t
        # lift the middle of the arc so the camera clears the ridge it starts on
        C = C + UP * (0.35 * math.sin(math.pi * t))
        return C, mat(slerp(Q0, quat(look(C1, CTR)), t))
    t = (k - N_RISE) / (N_ORBIT - 1)
    deg = ORBIT_DEG * ease(t)
    C = top_camera(deg)
    return C, look(C, CTR)


def cam_at(C, R, fx=None):
    return dict(position=np.asarray(C).tolist(), rotation=np.asarray(R).tolist(),
                fx=fx or FX, fy=fx or FY, width=IW, height=IH)


def frame_width(C, T, fx):
    """Ground width the frame spans at the point being looked at — the only
    honest way to put a number on 'how much of the site is in view'. The
    reconstruction has no metric scale: the telemetry carries orientation
    only, no GPS, so everything here is in the viewer's own units."""
    d = float(np.linalg.norm(np.asarray(T) - np.asarray(C)))
    return 2.0 * d * (IW / 2.0) / fx


def job_pull(k):
    C, R = pose(k)
    img, _, _ = render(xyz[IDX_SKY], S3[IDX_SKY], rgba[IDX_SKY], cam_at(C, R),
                       A.w, A.h, znear=0.01, fade=True)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(
        f"{SCRATCH}/pull/{k:04d}.jpg", quality=90)
    return k


def job_ladder(i):
    hgt = LADDER[i]
    if hgt == 0.0:
        C, R = C0, np.asarray(BASE["rotation"], float)
    else:
        # straight up from the capture pose, pitched back down onto the same
        # ground point, so the only thing that changes is height
        C = C0 + UP * hgt
        R = look(C, C0 + np.array([0.0, 0.0, 0.9]))
    img, _, _ = render(xyz[IDX_SKY], S3[IDX_SKY], rgba[IDX_SKY], cam_at(C, R),
                       A.w, A.h, znear=0.01, fade=True)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(
        f"{OUT}/ladder/{i}.jpg", quality=86, optimize=True)
    T = C0 + np.array([0.0, 0.0, 0.9]) if hgt else C0 + np.asarray(BASE["rotation"], float)[:, 2]
    return i, hgt, frame_width(C, T, FX)


# The frame is shaped like the site (8.0 by 4.4 units) so the figure fills the
# column instead of sitting in two black margins, and the focal length is the
# widest one that still keeps every track inside the frame.
NADIR_W, NADIR_H, NADIR_FX, NADIR_UP = 1600, 874, 1487.0, 6.0


def nadir():
    """Straight down over the whole reconstruction, sky dropped because the
    camera is above it. Aimed at the middle of the flight's bounding box, not
    at its centroid — the centroid is pulled towards wherever the drone spent
    the most time, and aiming there hangs a third of the tracks off the frame.

    The tracks are projected here rather than in the browser: this is a real
    perspective camera and the track points are at flight altitude, not on the
    ground, so there is no honest two-parameter mapping for the page to use."""
    mid = np.array([(FLIGHT[:, 0].min() + FLIGHT[:, 0].max()) / 2,
                    FLIGHT[:, 1].mean(),
                    (FLIGHT[:, 2].min() + FLIGHT[:, 2].max()) / 2])
    C = mid + UP * NADIR_UP
    R = look(C, mid, np.array([1.0, 0.0, 0.0]))
    s = NADIR_H / IH

    def project(P):
        Xc = (np.atleast_2d(P) - C) @ R
        z = Xc[:, 2]
        return (((2 * NADIR_FX * s / NADIR_W) * Xc[:, 0] / z) + 1) * NADIR_W / 2, \
               (1 - (-(2 * NADIR_FX * s / NADIR_H) * Xc[:, 1] / z)) / 2 * NADIR_H, z

    u, v, _ = project(FLIGHT)
    assert u.min() > 10 and u.max() < NADIR_W - 10, "flight tracks fall outside the nadir frame"
    assert v.min() > 10 and v.max() < NADIR_H - 10, "flight tracks fall outside the nadir frame"

    img, _, _ = render(xyz[IDX_BARE], S3[IDX_BARE], rgba[IDX_BARE],
                       cam_at(C, R, NADIR_FX), NADIR_W, NADIR_H, znear=0.01, fade=True)
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(
        f"{OUT}/nadir.jpg", quality=88, optimize=True)

    sess1 = {"0050", "0051", "0052", "0053", "0055"}
    tracks = []
    for c in traj["clips"]:
        q = np.array(c["pos"]).reshape(-1, 3)[::4]
        a, b, _ = project(q)
        tracks.append({"clip": c["name"],
                       "site": "hilltop" if c["name"] in sess1 else "cemetery",
                       "px": [round(float(t), 1) for pr in zip(a, b) for t in pr]})
    a, b, z = project(C0)
    r = float(NADIR_FX * s * 0.7 / z[0])
    _, _, zg = project(mid)
    return {"aim": [round(float(mid[0]), 4), round(float(mid[2]), 4)],
            "height": NADIR_UP, "w": NADIR_W, "h": NADIR_H, "fx": NADIR_FX, "roll": 90,
            "tracks_px": tracks,
            "crop_px": {"x": round(float(a[0]), 1), "y": round(float(b[0]), 1),
                        "r": round(r, 1)},
            "scale_px_per_unit": round(float(NADIR_FX * s / zg[0]), 1)}


def extent():
    """The measurements the scale figures quote."""
    sess = [("hilltop", ["0050", "0051", "0052", "0053", "0055"]),
            ("cemetery", ["0057", "0058", "0059", "0060"])]
    out = {}
    for name, clips in sess:
        cl = [c for c in traj["clips"] if c["name"] in clips]
        P = np.vstack([np.array(c["pos"]).reshape(-1, 3) for c in cl])
        L = sum(float(np.linalg.norm(np.diff(np.array(c["pos"]).reshape(-1, 3), axis=0), axis=1).sum())
                for c in cl)
        out[name] = {"x": round(float(P[:, 0].max() - P[:, 0].min()), 2),
                     "z": round(float(P[:, 2].max() - P[:, 2].min()), 2),
                     "path": round(L, 1),
                     "seconds": round(sum(c["duration"] for c in cl)),
                     "frames": int(len(P)), "clips": len(cl)}
    P = FLIGHT
    C = np.array([c["position"] for c in cams], float)
    a = np.array([v for v in (agl_at(p) for p in C) if v is not None])
    tracks = []
    for c in traj["clips"]:
        q = np.array(c["pos"]).reshape(-1, 3)[::4]
        tracks.append({"clip": c["name"],
                       "site": "hilltop" if c["name"] in sess[0][1] else "cemetery",
                       "xz": [round(float(v), 3) for p in q for v in (p[0], p[2])]})
    return {
        "flight": {"x": round(float(P[:, 0].max() - P[:, 0].min()), 2),
                   "z": round(float(P[:, 2].max() - P[:, 2].min()), 2),
                   "path": round(float(sum(np.linalg.norm(np.diff(np.array(c["pos"]).reshape(-1, 3), axis=0), axis=1).sum()
                                           for c in traj["clips"])), 1),
                   "seconds": round(sum(c["duration"] for c in traj["clips"]))},
        "sessions": out,
        "separation": round(float(np.linalg.norm(
            np.vstack([np.array(c["pos"]).reshape(-1, 3) for c in traj["clips"] if c["name"] in sess[0][1]]).mean(0) -
            np.vstack([np.array(c["pos"]).reshape(-1, 3) for c in traj["clips"] if c["name"] in sess[1][1]]).mean(0))), 2),
        "splat_plan_radius": {str(q): round(float(np.percentile(PLAN, q)), 2) for q in (50, 90, 99)},
        "crop_radius": 0.7,
        "surface_splats": int(SURFACE.sum()),
        # The yardstick for every scale claim on the page. The reconstruction
        # has no metric scale - the telemetry is orientation only, no GPS - so
        # extents are quoted in scene units and in multiples of the height the
        # drone actually flew at.
        "agl": {"anchor": round(float(agl_at(C[ANCHOR])), 3),
                "median": round(float(np.median(a)), 3),
                "p10": round(float(np.percentile(a, 10)), 3),
                "p90": round(float(np.percentile(a, 90)), 3),
                "n": int(len(a)), "cell": CELL,
                "note": "height above local terrain, terrain = median splat "
                        "height in a 0.12-unit plan cell"},
        "tracks": tracks,
    }


def aerial_views():
    """Camera poses for the whole-site asset in the live viewer. The capture
    poses it ships with are all inside the flight corridor, which is the wrong
    place to stand to see how big the site is."""
    sess = {"hilltop": ["0050", "0051", "0052", "0053", "0055"],
            "cemetery": ["0057", "0058", "0059", "0060"]}
    out = []
    for name, label, height, back in (
            (None, "Whole site", SITE_H, SITE_BACK),
            ("hilltop", "Session 1 aerial", 1.15, 1.45),
            ("cemetery", "Session 2 aerial", 1.15, 1.45)):
        if name is None:
            T = CTR
        else:
            T = np.vstack([np.array(c["pos"]).reshape(-1, 3)
                           for c in traj["clips"] if c["name"] in sess[name]]).mean(0)
        C = T + UP * height + np.array([0.0, 0.0, -back])
        out.append({"name": label,
                    "position": [round(float(v), 5) for v in C],
                    "rotation": [[round(float(v), 6) for v in r] for r in look(C, T)]})
    return out


def site_asset():
    """A whole-site asset for the live viewer: the same scene the crop came
    out of, thinned to something a browser will accept, and with the floaters
    and the sky dome gone so it survives being looked at from above.

    The size cap is tighter here than anywhere else. Ranking by opacity times
    area picks large faint blobs first, and from a hundred metres up those read
    as a white haze over the whole site rather than as surface. Dropping them
    costs coverage, so the count goes up to pay for it."""
    n = SITE_N
    i = np.where(SURFACE & ~SKY & (BIG < SITE_SIZE))[0]
    i = i[np.argsort(-IMP[i])[:n]]
    order = np.argsort(-IMP)
    keep = np.zeros(len(xyz), bool)
    keep[i] = True
    raw = np.fromfile(SRC, dtype=np.uint8).reshape(-1, 32)
    raw[order[keep[order]]].tofile(f"{OUT}/site.splat")
    return {"splats": int(keep.sum()),
            "centre": [round(float(CTR[0]), 4), round(float(CTR[1]), 4), round(float(CTR[2]), 4)],
            "top": {"height": TOP_H, "back": TOP_BACK},
            "views": aerial_views()}


if __name__ == "__main__":
    print(f"surface {int(SURFACE.sum()):,}  sky {int(SKY.sum()):,}  drawing {len(IDX_SKY):,}")
    mp.set_start_method("fork")
    with mp.Pool(A.procs) as p:
        if A.only in ("all", "stills"):
            meta = extent()
            meta["site"] = site_asset()
            print(f"site.splat   {meta['site']['splats']:,} splats "
                  f"({meta['site']['splats'] * 32 / 1e6:.1f} MB)")
            rungs = {}
            for i, hgt, w in p.imap_unordered(job_ladder, range(len(LADDER))):
                rungs[i] = {"height": hgt, "frame_width": round(w, 2)}
                print(f"  ladder {i} h={hgt} width={w:.2f}", flush=True)
            meta["ladder"] = [rungs[i] for i in sorted(rungs)]
            meta["nadir"] = nadir()
            print("nadir.jpg written", flush=True)
            json.dump(meta, open(f"{OUT}/extent.json", "w"))
        if A.only in ("all", "pull"):
            n = N_RISE + N_ORBIT
            for i, k in enumerate(p.imap_unordered(job_pull, range(n), chunksize=4)):
                if i % 25 == 0:
                    print(f"  pull {i}/{n}", flush=True)
    print("DONE", flush=True)
