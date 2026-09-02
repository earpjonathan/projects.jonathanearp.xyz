"""The three files the live viewer on the page loads: the cropped splat asset,
its metadata, and the gyro trace behind the frame-selection demo.

The crop exists because the deployed asset is 3,000,000 splats and 96 MB. A
page that loads on a phone gets a spatial crop around one capture pose instead.
Everything else about the render - the format, the sort, the shaders, the blend
- is what ships; only the splat count is different.
"""
import argparse, json, os, sys
import numpy as np


def paths():
    """The renderers live in the fpv-splat repo; the media lives here. Both are
    arguments so this runs on a machine where neither sits where mine does."""
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=os.environ.get("FPV_SPLAT",
                    os.path.expanduser("~/Desktop/fpv-splat")),
                    help="root of the fpv-splat repo")
    ap.add_argument("--out", default=os.path.abspath(
                    os.path.join(here, "..", "..", "splat", "media")),
                    help="where the media files are written")
    a = ap.parse_args()
    sys.path.insert(0, os.path.join(a.project, "scripts"))
    os.chdir(a.project)
    os.makedirs(a.out, exist_ok=True)
    return a.project, a.out


PROJECT, OUT = paths()

from raster import load_splat                                   # noqa: E402

SRC = "viewer/merged_web.splat"
ANCHOR = 2500              # 0053_001085, the pose the crop is centred on
RADIUS = 0.7               # scene units; the drone's median height above the
                           # terrain under it is 0.104, so this is about seven
                           # flight altitudes out from the anchor pose
FLOOR = 0.4065             # The levelling puts up on -Y, so a larger y is
                           # lower. This drops everything below the lowest
                           # camera in the flight (y = 0.4035): terrain
                           # underside, and the junk that collects beneath it.
FAR_KEEP = 40000           # horizon splats, so the crop does not end in a wall
VIEWS = [2500, 2476, 670, 392, 3453]
FLIGHT = ("0053", 206, 555)   # clip, first frame, count - about 18 seconds
GYRO = ("0057", 198.0, 1300)  # clip, start second, samples at 50 Hz


def crop():
    xyz, sc, rgba, rot = load_splat(SRC)
    cams = json.load(open("viewer/merged_cameras.json"))
    c = np.asarray(cams[ANCHOR]["position"], float)

    d = np.linalg.norm(xyz - c, axis=1)
    above_floor = xyz[:, 1] < FLOOR
    near = (d < RADIUS) & above_floor

    # The far field is ranked the way the exporter ranks splats: opacity times
    # the two smaller axes, i.e. how much screen a splat is likely to cover.
    ss = np.sort(sc, axis=1)
    imp = (rgba[:, 3].astype(np.float64) / 255.0) * ss[:, 1] * ss[:, 2]
    rest = np.where(~(d < RADIUS) & above_floor)[0]
    far = rest[np.argsort(-imp[rest])[:FAR_KEEP]]

    keep = np.zeros(len(xyz), bool)
    keep[near] = True
    keep[far] = True

    # Written most-important-first, the same order the exporter uses, so a
    # truncated download still degrades into a coarse version of the scene.
    order = np.argsort(-imp)
    raw = np.fromfile(SRC, dtype=np.uint8).reshape(-1, 32)
    raw[order[keep[order]]].tofile(f"{OUT}/scene.splat")
    n = int(keep.sum())
    print(f"scene.splat  {n:,} splats  "
          f"({n * 32 / 1e6:.2f} MB, near {int(near.sum()):,} far {len(far):,})")

    base = cams[ANCHOR]
    meta = {
        "splats": n,
        "source": f"merged_web.splat ({len(xyz):,} splats)",
        "crop": {"centre": [round(v, 4) for v in c],
                 "radius": RADIUS, "floor_cut": FLOOR, "far_kept": FAR_KEEP},
        "fx": round(base["fx"], 3), "fy": round(base["fy"], 3),
        "width": base["width"], "height": base["height"],
        "views": [{"id": i, "name": cams[i]["img_name"],
                   "position": [round(v, 5) for v in cams[i]["position"]],
                   "rotation": [[round(v, 6) for v in r] for r in cams[i]["rotation"]],
                   "fx": round(cams[i]["fx"], 3), "fy": round(cams[i]["fy"], 3),
                   "width": cams[i]["width"], "height": cams[i]["height"]} for i in VIEWS],
        "flight": flight(),
    }
    json.dump(meta, open(f"{OUT}/scene.json", "w"))
    print(f"scene.json   {len(VIEWS)} views, flight of {meta['flight']['n']} frames")


def flight():
    """A segment of the recorded trajectory, so the fly-through in the viewer is
    the drone's own path rather than an invented camera move."""
    name, i0, n = FLIGHT
    tr = json.load(open("viewer/merged_traj.json"))
    c = next(x for x in tr["clips"] if x["name"] == name)
    return {"clip": name, "dt": c["dt"], "t0": round(c["t0"] + i0 * c["dt"], 3), "n": n,
            "pos": [round(v, 4) for v in c["pos"][i0 * 3:(i0 + n) * 3]],
            "quat": [round(v, 5) for v in c["cam_quat"][i0 * 4:(i0 + n) * 4]]}


def gyro():
    """Raw 50 Hz telemetry quaternions, which is what the frame selector reads.
    The demo re-runs the real select() rule over these, so the kept-frame ticks
    move with the sliders instead of replaying a stored answer."""
    name, t0, n = GYRO
    q = json.load(open(f"gyro/cam_{name}.json"))
    i0 = int(round(t0 * 50.0))
    seg = [e["org_quat"] for e in q[i0:i0 + n]]
    flat = [round(v, 5) for e in seg for v in e]
    json.dump({"clip": name, "fps": 50, "t0": t0, "n": len(seg), "quat": flat},
              open(f"{OUT}/gyro.json", "w"))
    print(f"gyro.json    {len(seg)} samples from {name} at t={t0}s")


if __name__ == "__main__":
    crop()
    gyro()
